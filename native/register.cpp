#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <sddl.h>
#include <aclapi.h>
#include <string>

static constexpr wchar_t ClassKey[] = L"SOFTWARE\\Classes\\CLSID\\{DA9CE316-89EF-4AD6-A156-459B271DF409}";
static constexpr wchar_t InstanceKey[] = L"SOFTWARE\\Classes\\CLSID\\{860BB310-5D01-11D0-BD3B-00A0C911CE86}\\Instance\\MIAO Motion Camera";
// Per-user bookkeeping read by the NSIS hooks. Written only in the token of the user who
// started the helper: the UAC prompt may elevate a different administrator account.
static constexpr wchar_t UserKey[] = L"Software\\MIAO Motion\\Camera";
static constexpr wchar_t ElevatedChildFlag[] = L" --elevated-child";
static bool administrator() {
    SID_IDENTIFIER_AUTHORITY nt = SECURITY_NT_AUTHORITY;
    PSID sid = nullptr; BOOL member = FALSE;
    if (AllocateAndInitializeSid(&nt, 2, SECURITY_BUILTIN_DOMAIN_RID, DOMAIN_ALIAS_RID_ADMINS, 0,0,0,0,0,0, &sid)) {
        CheckTokenMembership(nullptr, sid, &member); FreeSid(sid);
    }
    return member != FALSE;
}
static bool eraseKey(const wchar_t* name) {
    LONG r = RegDeleteTreeW(HKEY_LOCAL_MACHINE, name);
    return r == ERROR_SUCCESS || r == ERROR_FILE_NOT_FOUND || r == ERROR_PATH_NOT_FOUND;
}
static void rememberForUser(bool registered) {
    if (registered) {
        HKEY key = nullptr;
        if (RegCreateKeyExW(HKEY_CURRENT_USER, UserKey, 0, nullptr, 0, KEY_SET_VALUE, nullptr, &key, nullptr) == ERROR_SUCCESS) {
            DWORD one = 1;
            RegSetValueExW(key, L"RegisteredByUser", 0, REG_DWORD, reinterpret_cast<const BYTE*>(&one), sizeof(one));
            RegCloseKey(key);
        }
    } else {
        RegDeleteKeyValueW(HKEY_CURRENT_USER, UserKey, L"RegisteredByUser");
    }
    // An explicit install or removal supersedes a restore scheduled by the uninstaller.
    RegDeleteKeyValueW(HKEY_CURRENT_USER, UserKey, L"ReinstallPending");
}
static void deleteNowOrAtReboot(const std::wstring& file) {
    if (DeleteFileW(file.c_str()) || GetLastError() == ERROR_FILE_NOT_FOUND) return;
    // A receiver still has the DLL loaded. Move it aside so a later registration can
    // write a fresh softcam.dll that the pending reboot deletion will not remove.
    std::wstring aside = file + L"." + std::to_wstring(GetTickCount64()) + L".old";
    if (MoveFileExW(file.c_str(), aside.c_str(), MOVEFILE_REPLACE_EXISTING))
        MoveFileExW(aside.c_str(), nullptr, MOVEFILE_DELAY_UNTIL_REBOOT);
    else
        MoveFileExW(file.c_str(), nullptr, MOVEFILE_DELAY_UNTIL_REBOOT);
}
static bool trustedDirectory(const std::wstring& path, PSECURITY_DESCRIPTOR security) {
    SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), security, FALSE};
    if (!CreateDirectoryW(path.c_str(), &attributes) && GetLastError() != ERROR_ALREADY_EXISTS) return false;
    DWORD flags = GetFileAttributesW(path.c_str());
    if (flags == INVALID_FILE_ATTRIBUTES || !(flags & FILE_ATTRIBUTE_DIRECTORY) || (flags & FILE_ATTRIBUTE_REPARSE_POINT)) return false;
    PSID owner = nullptr; PSECURITY_DESCRIPTOR existing = nullptr;
    if (GetNamedSecurityInfoW(path.c_str(), SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION, &owner, nullptr, nullptr, nullptr, &existing) != ERROR_SUCCESS) return false;
    bool trusted = IsWellKnownSid(owner, WinBuiltinAdministratorsSid) || IsWellKnownSid(owner, WinLocalSystemSid);
    LocalFree(existing);
    if (!trusted) return false;
    PACL dacl = nullptr; BOOL present = FALSE, defaulted = FALSE;
    GetSecurityDescriptorDacl(security, &present, &dacl, &defaulted);
    return SetNamedSecurityInfoW(const_cast<wchar_t*>(path.c_str()), SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr, nullptr, dacl, nullptr) == ERROR_SUCCESS;
}
int WINAPI wWinMain(HINSTANCE self, HINSTANCE, PWSTR command, int) {
    std::wstring action(command ? command : L"");
    // Set only by this helper when it relaunches itself through UAC.
    const std::wstring childFlag(ElevatedChildFlag);
    bool elevatedChild = action.size() > childFlag.size() &&
        action.compare(action.size() - childFlag.size(), childFlag.size(), childFlag) == 0;
    if (elevatedChild) action.resize(action.size() - childFlag.size());
    bool remove = action == L"unregister" || action == L"unregister-silent";
    bool silent = action.find(L"-silent") != std::wstring::npos;
    if (!remove && action != L"register" && action != L"register-silent") return ERROR_INVALID_PARAMETER;
    if (!administrator()) {
        if (elevatedChild) return ERROR_ACCESS_DENIED;
        wchar_t exe[32768];
        if (!GetModuleFileNameW(nullptr, exe, 32768)) return GetLastError();
        std::wstring parameters = action + childFlag;
        SHELLEXECUTEINFOW info{sizeof(info)};
        info.fMask = SEE_MASK_NOCLOSEPROCESS; info.lpVerb = L"runas"; info.lpFile = exe;
        info.lpParameters = parameters.c_str(); info.nShow = SW_HIDE;
        if (!ShellExecuteExW(&info)) return GetLastError();
        if (!info.hProcess) return ERROR_GEN_FAILURE;
        WaitForSingleObject(info.hProcess, INFINITE);
        DWORD code = ERROR_GEN_FAILURE; GetExitCodeProcess(info.hProcess, &code); CloseHandle(info.hProcess);
        // This process still runs as the user who asked for the change.
        if (code == ERROR_SUCCESS) rememberForUser(!remove);
        return static_cast<int>(code);
    }
    PWSTR programFiles = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_ProgramFiles, 0, nullptr, &programFiles))) return ERROR_PATH_NOT_FOUND;
    std::wstring directory = std::wstring(programFiles) + L"\\MIAO Motion Camera";
    CoTaskMemFree(programFiles);
    std::wstring file = directory + L"\\softcam.dll";
    DWORD result = ERROR_SUCCESS;
    if (remove) {
        // Remove only our fixed keys. Never load a legacy DLL from a user-writable installation.
        bool instanceRemoved = eraseKey(InstanceKey), classRemoved = eraseKey(ClassKey);
        if (!instanceRemoved || !classRemoved) result = ERROR_ACCESS_DENIED;
        DWORD flags = GetFileAttributesW(directory.c_str());
        if (flags != INVALID_FILE_ATTRIBUTES && !(flags & FILE_ATTRIBUTE_REPARSE_POINT)) {
            deleteNowOrAtReboot(file);
            // Never leave the directory behind permanently; an empty directory is
            // removed at the next restart once any pending file deletion has run.
            if (!RemoveDirectoryW(directory.c_str()) && GetLastError() != ERROR_FILE_NOT_FOUND)
                MoveFileExW(directory.c_str(), nullptr, MOVEFILE_DELAY_UNTIL_REBOOT);
        }
    } else {
        PSECURITY_DESCRIPTOR security = nullptr;
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
            L"O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;GRGX;;;BU)",
            SDDL_REVISION_1, &security, nullptr)) return GetLastError();
        if (!trustedDirectory(directory, security)) { LocalFree(security); return ERROR_ACCESS_DENIED; }
        HRSRC resource = FindResourceW(self, MAKEINTRESOURCEW(101), MAKEINTRESOURCEW(10));
        DWORD size = resource ? SizeofResource(self, resource) : 0;
        const void* bytes = resource ? LockResource(LoadResource(self, resource)) : nullptr;
        if (!size || !bytes) { LocalFree(security); return ERROR_RESOURCE_DATA_NOT_FOUND; }
        // Embedded build output, not the replaceable DLL beside this helper.
        if (!DeleteFileW(file.c_str()) && GetLastError() != ERROR_FILE_NOT_FOUND) {
            LocalFree(security); return ERROR_SHARING_VIOLATION;
        }
        SECURITY_ATTRIBUTES attributes{sizeof(SECURITY_ATTRIBUTES), security, FALSE};
        HANDLE output = CreateFileW(file.c_str(), GENERIC_WRITE, 0, &attributes, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        DWORD written = 0;
        if (output == INVALID_HANDLE_VALUE) result = GetLastError();
        else {
            if (!WriteFile(output, bytes, size, &written, nullptr) || written != size) result = ERROR_WRITE_FAULT;
            CloseHandle(output);
        }
        LocalFree(security);
        if (result == ERROR_SUCCESS) {
            HMODULE library = LoadLibraryExW(file.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
            using Register = HRESULT (STDAPICALLTYPE*)();
            auto registerServer = library ? reinterpret_cast<Register>(GetProcAddress(library, "DllRegisterServer")) : nullptr;
            if (!registerServer || FAILED(registerServer())) result = ERROR_INSTALL_FAILURE;
            if (library) FreeLibrary(library);
        }
        if (result != ERROR_SUCCESS) { eraseKey(InstanceKey); eraseKey(ClassKey); }
    }
    if (!silent) MessageBoxW(nullptr,
        result == ERROR_SUCCESS ? (remove ? L"虚拟摄像头已注销。" : L"虚拟摄像头已安装，请重新打开接收软件。")
        : L"操作失败，请关闭正在使用虚拟摄像头的软件后重试。",
        L"喵动虚拟摄像头", result == ERROR_SUCCESS ? MB_OK : MB_ICONERROR);
    // Started directly by an administrator (no UAC relaunch): this is the user's own hive.
    if (result == ERROR_SUCCESS && !elevatedChild) rememberForUser(!remove);
    return static_cast<int>(result);
}
