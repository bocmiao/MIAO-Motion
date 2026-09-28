#include <windows.h>
#include <shellapi.h>
#include <string>

// Fixed sibling DLL only. No arbitrary path or command can be supplied by the UI.
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR command, int) {
    const bool remove = std::wstring(command) == L"unregister";
    if (!remove && std::wstring(command) != L"register") return 2;
    wchar_t path[32768];
    if (!GetModuleFileNameW(nullptr, path, 32768)) return 3;
    std::wstring file(path);
    file = file.substr(0, file.find_last_of(L"\\/") + 1) + L"softcam.dll";
    HMODULE library = LoadLibraryExW(file.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!library) { MessageBoxW(nullptr, L"无法加载摄像头组件，请重新安装喵动。", L"喵动虚拟摄像头", MB_ICONERROR); return 4; }
    using Register = HRESULT (STDAPICALLTYPE*)();
    auto action = reinterpret_cast<Register>(GetProcAddress(library, remove ? "DllUnregisterServer" : "DllRegisterServer"));
    HRESULT result = action ? action() : E_FAIL;
    FreeLibrary(library);
    MessageBoxW(nullptr, SUCCEEDED(result) ? (remove ? L"虚拟摄像头已卸载。" : L"虚拟摄像头已安装。请重新打开接收软件，在摄像头列表选择 MIAO Motion Camera。") : L"安装或卸载失败，请确认管理员权限并关闭正在使用摄像头的程序。", L"喵动虚拟摄像头", SUCCEEDED(result) ? MB_OK : MB_ICONERROR);
    return SUCCEEDED(result) ? 0 : 5;
}
