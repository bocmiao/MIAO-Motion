use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Default)]
pub struct Camera(pub Arc<Mutex<Option<Sender>>>);

pub struct Sender {
    library: libloading::Library,
    handle: usize,
}

impl Drop for Sender {
    fn drop(&mut self) {
        // The handle is owned by this state and guarded by Camera's mutex.
        unsafe { if let Ok(delete) = self.library.get::<unsafe extern "C" fn(usize)>(b"scDeleteCamera") { delete(self.handle); } }
    }
}

fn component(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    app.path().resource_dir().map(|p| p.join("camera").join(name)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn native_camera_start(app: tauri::AppHandle, state: tauri::State<'_, Camera>) -> Result<(), String> {
    let camera = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
    let mut guard = camera.lock().map_err(|_| "摄像头不可用")?;
    if guard.is_some() { return Ok(()); }
    unsafe {
        let library = libloading::Library::new(component(&app, "softcam.dll")?).map_err(|_| "未找到虚拟摄像头组件，请安装完整版喵动")?;
        let create = library.get::<unsafe extern "C" fn(i32, i32, f32) -> usize>(b"scCreateCamera").map_err(|_| "摄像头组件版本不匹配")?;
        let handle = create(640, 360, 0.0);
        if handle == 0 { return Err("另一个喵动窗口正在输出虚拟摄像头，请先停止它".into()); }
        *guard = Some(Sender { library, handle });
    }
    Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn native_camera_stop(state: tauri::State<'_, Camera>) -> Result<(), String> {
    let camera = state.0.clone();
    // Softcam teardown can wait for native receiver threads. Never hold the
    // Tauri/Win32 event loop while creating, sending to, or destroying it.
    tauri::async_runtime::spawn_blocking(move || {
        *camera.lock().map_err(|_| "摄像头不可用")? = None;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn native_camera_frame(request: tauri::ipc::Request<'_>, state: tauri::State<'_, Camera>) -> Result<bool, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("需要二进制帧".into()); };
    if data.len() != 640 * 360 * 3 { return Err("帧尺寸不正确".into()); }
    let data = data.clone();
    let camera = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
    let guard = camera.lock().map_err(|_| "摄像头不可用")?;
    let sender = guard.as_ref().ok_or("虚拟摄像头尚未开启")?;
    unsafe {
        let send = sender.library.get::<unsafe extern "C" fn(usize, *const u8)>(b"scSendFrame").map_err(|e| e.to_string())?;
        let connected = sender.library.get::<unsafe extern "C" fn(usize) -> bool>(b"scIsConnected").map_err(|e| e.to_string())?;
        send(sender.handle, data.as_ptr());
        Ok(connected(sender.handle))
    }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn native_camera_install(app: tauri::AppHandle, remove: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let helper = component(&app, "camera-register.exe")?;
    let status = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(helper)
            .arg(if remove { "unregister-silent" } else { "register-silent" })
            .creation_flags(0x08000000).status()
    }).await.map_err(|e| e.to_string())?
      .map_err(|_| "无法启动摄像头安装程序，请重新安装喵动")?;
    match status.code() {
        Some(0) => Ok(()),
        Some(1223) => Err("已取消 Windows 权限确认，未完成操作".into()),
        code => Err(format!("摄像头操作失败（{}），请关闭接收软件后重试", code.unwrap_or(-1))),
    }
}

const SERVER_KEY: &str = r"SOFTWARE\Classes\CLSID\{DA9CE316-89EF-4AD6-A156-459B271DF409}\InprocServer32";
const USER_KEY: &str = r"Software\MIAO Motion\Camera";

/// Machine-wide registration state of the DirectShow component. The DLL path itself is
/// never returned: a legacy path contains the Windows user name.
#[derive(serde::Serialize)]
pub struct ComponentState {
    /// A MIAO Motion Camera COM server is registered (64-bit view).
    registered: bool,
    /// Registered outside `%ProgramFiles%\MIAO Motion Camera` (v0.3.0-beta user-writable
    /// copy): unsafe, should be removed or reinstalled.
    legacy: bool,
    /// "protected" | "legacy" | "none"
    path_kind: &'static str,
    /// This Windows user installed it (HKCU marker written by camera-register.exe).
    registered_by_user: bool,
}

fn wide(text: &str) -> Vec<u16> { text.encode_utf16().chain(std::iter::once(0)).collect() }

/// Default value of an HKLM/HKCU key, 64-bit registry view.
fn registry_string(root: windows_sys::Win32::System::Registry::HKEY, key: &str) -> Option<String> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY};
    let key = wide(key);
    let flags = RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY;
    let mut size = 0u32;
    // RegGetValueW writes a terminated string into the provided buffer.
    unsafe {
        if RegGetValueW(root, key.as_ptr(), std::ptr::null(), flags, std::ptr::null_mut(), std::ptr::null_mut(), &mut size) != 0 { return None; }
        let mut buffer = vec![0u16; (size as usize).div_ceil(2) + 1];
        let mut bytes = u32::try_from(buffer.len() * 2).ok()?;
        if RegGetValueW(root, key.as_ptr(), std::ptr::null(), flags, std::ptr::null_mut(), buffer.as_mut_ptr().cast(), &mut bytes) != 0 { return None; }
        let length = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        Some(String::from_utf16_lossy(&buffer[..length]))
    }
}

fn registry_dword(root: windows_sys::Win32::System::Registry::HKEY, key: &str, name: &str) -> Option<u32> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, RRF_RT_REG_DWORD};
    let (key, name) = (wide(key), wide(name));
    let mut value = 0u32;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(root, key.as_ptr(), name.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), (&mut value as *mut u32).cast(), &mut size)
    };
    (status == 0).then_some(value)
}

/// Same source as camera-register.exe (FOLDERID_ProgramFiles).
fn program_files() -> Option<String> {
    use windows_sys::Win32::{System::Com::CoTaskMemFree, UI::Shell::{FOLDERID_ProgramFiles, SHGetKnownFolderPath}};
    let mut path: windows_sys::core::PWSTR = std::ptr::null_mut();
    unsafe {
        let status = SHGetKnownFolderPath(&FOLDERID_ProgramFiles, 0, std::ptr::null_mut(), &mut path);
        let result = (status >= 0 && !path.is_null()).then(|| {
            let length = (0..).take_while(|&i| *path.add(i) != 0).count();
            String::from_utf16_lossy(std::slice::from_raw_parts(path, length))
        });
        // Required even on failure; null is accepted.
        CoTaskMemFree(path as *const _);
        result
    }
}

fn normalized(path: &str) -> String { path.trim().replace('/', "\\").to_lowercase() }

#[tauri::command]
pub fn native_camera_component_state() -> ComponentState {
    use windows_sys::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    let path = registry_string(HKEY_LOCAL_MACHINE, SERVER_KEY).filter(|p| !p.trim().is_empty());
    let registered_by_user = registry_dword(HKEY_CURRENT_USER, USER_KEY, "RegisteredByUser") == Some(1);
    let path_kind = match path {
        None => "none",
        Some(path) => {
            let protected = program_files()
                .map(|root| normalized(&format!(r"{root}\MIAO Motion Camera\softcam.dll")))
                .is_some_and(|expected| normalized(&path) == expected);
            if protected { "protected" } else { "legacy" }
        }
    };
    ComponentState { registered: path_kind != "none", legacy: path_kind == "legacy", path_kind, registered_by_user }
}
