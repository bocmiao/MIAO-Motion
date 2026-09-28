use tauri::webview::{PermissionKind, PermissionResponse, WebviewWindowBuilder};

fn trusted_origin(url: &tauri::Url) -> bool {
    matches!((url.scheme(), url.host_str(), url.port()),
        ("http" | "https", Some("tauri.localhost"), None) |
        ("tauri", Some("localhost"), None)) ||
        (cfg!(debug_assertions) && url.scheme() == "http" && url.host_str() == Some("127.0.0.1") && url.port() == Some(1420))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(trusted_origin)
                .on_permission_request(|webview, kind| {
                    // The bundled app requests camera only after the user's Start action.
                    // Never grant microphone, remote-origin or unrelated permissions.
                    if matches!(kind, PermissionKind::Camera)
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
