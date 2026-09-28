use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
pub struct Camera(pub Mutex<Option<Sender>>);

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
pub fn native_camera_start(app: tauri::AppHandle, state: tauri::State<'_, Camera>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "摄像头不可用")?;
    if guard.is_some() { return Ok(()); }
    unsafe {
        let library = libloading::Library::new(component(&app, "softcam.dll")?).map_err(|_| "未找到虚拟摄像头组件，请安装完整版喵动")?;
        let create = library.get::<unsafe extern "C" fn(i32, i32, f32) -> usize>(b"scCreateCamera").map_err(|_| "摄像头组件版本不匹配")?;
        let handle = create(640, 360, 0.0);
        if handle == 0 { return Err("另一个喵动窗口正在输出虚拟摄像头，请先停止它".into()); }
        *guard = Some(Sender { library, handle });
    }
    Ok(())
}

#[tauri::command]
pub fn native_camera_stop(state: tauri::State<'_, Camera>) { if let Ok(mut s) = state.0.lock() { *s = None; } }

#[tauri::command]
pub fn native_camera_frame(request: tauri::ipc::Request<'_>, state: tauri::State<'_, Camera>) -> Result<bool, String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else { return Err("需要二进制帧".into()); };
    if data.len() != 640 * 360 * 3 { return Err("帧尺寸不正确".into()); }
    let guard = state.0.lock().map_err(|_| "摄像头不可用")?;
    let sender = guard.as_ref().ok_or("虚拟摄像头尚未开启")?;
    unsafe {
        let send = sender.library.get::<unsafe extern "C" fn(usize, *const u8)>(b"scSendFrame").map_err(|e| e.to_string())?;
        let connected = sender.library.get::<unsafe extern "C" fn(usize) -> bool>(b"scIsConnected").map_err(|e| e.to_string())?;
        send(sender.handle, data.as_ptr());
        Ok(connected(sender.handle))
    }
}

#[tauri::command]
pub fn native_camera_install(app: tauri::AppHandle, remove: bool) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    let path: Vec<u16> = component(&app, "camera-register.exe")?.as_os_str().encode_wide().chain(Some(0)).collect();
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let action = wide(if remove { "unregister" } else { "register" });
    let verb = wide("runas");
    let result = unsafe { windows_sys::Win32::UI::Shell::ShellExecuteW(std::ptr::null_mut(), verb.as_ptr(), path.as_ptr(), action.as_ptr(), std::ptr::null(), 1) };
    if result as usize <= 32 { return Err("Windows 未启动安装程序；可能取消了权限确认".into()); }
    Ok(())
}
