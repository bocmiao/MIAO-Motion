mod phone;
#[cfg(windows)]
mod native_camera;
use tauri::webview::{PermissionKind, PermissionResponse, WebviewWindowBuilder};

fn trusted_origin(url: &tauri::Url) -> bool {
    matches!((url.scheme(), url.host_str(), url.port()),
        ("http" | "https", Some("tauri.localhost"), None) |
        ("tauri", Some("localhost"), None)) ||
        (cfg!(debug_assertions) && url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(1420))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(phone::Phone::default());
    #[cfg(windows)]
    let builder = builder.manage(native_camera::Camera::default()).invoke_handler(tauri::generate_handler![phone::phone_start, phone::phone_stop, phone::phone_poll, native_camera::native_camera_start, native_camera::native_camera_stop, native_camera::native_camera_frame, native_camera::native_camera_install, native_camera::native_camera_component_state]);
    #[cfg(not(windows))]
    let builder = builder.invoke_handler(tauri::generate_handler![phone::phone_start, phone::phone_stop, phone::phone_poll]);
    builder
        .setup(|app| {
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(trusted_origin)
                .on_permission_request(|webview, kind| {
                    // The bundled app requests camera only after the user's Start action.
                    // Microphone is requested only by the explicit voice-mouth action.
                    if matches!(kind, PermissionKind::Camera | PermissionKind::Microphone)
                        && webview.url().is_ok_and(|url| trusted_origin(&url)) {
                        PermissionResponse::Allow
                    } else { PermissionResponse::Deny }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run MIAO Motion");
}
