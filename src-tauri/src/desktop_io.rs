use tauri::Url;

fn allowed_external(url: &Url) -> bool {
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || url.port().is_some() { return false; }
    let path = url.path();
    match url.host_str() {
        Some("vroid.com") => path == "/en/studio" || path.starts_with("/en/studio/"),
        Some("store.steampowered.com") => path.starts_with("/app/1486350/"),
        Some("github.com") => path == "/bocmiao/MIAO-Motion/releases" || path.starts_with("/bocmiao/MIAO-Motion/releases/") || path.starts_with("/pixiv/three-vrm/blob/"),
        Some("vrm.dev") => path == "/licenses/1.0/",
        _ => false,
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|_| "无效网址")?;
    if !allowed_external(&parsed) { return Err("网址不在白名单内".into()); }
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let wide: Vec<u16> = parsed.as_str().encode_utf16().chain(Some(0)).collect();
        let action: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let result = unsafe { ShellExecuteW(std::ptr::null_mut(), action.as_ptr(), wide.as_ptr(), std::ptr::null(), std::ptr::null(), 1) };
        if result as isize <= 32 { return Err("系统浏览器启动失败".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    Err("此桌面功能目前仅支持 Windows".into())
}

fn export_name(request: &tauri::ipc::Request<'_>) -> Result<String, String> {
    let encoded = request.headers().get("x-file-name").and_then(|v| v.to_str().ok()).ok_or("缺少文件名")?;
    let name = percent_encoding::percent_decode_str(encoded).decode_utf8().map_err(|_| "无效文件名")?.into_owned();
    if name.len() > 200 || name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || name.ends_with([' ', '.']) || !(name.ends_with(".vrm") || name.ends_with(".json")) { return Err("不支持的导出文件名".into()); }
    Ok(name)
}

#[tauri::command]
pub async fn save_export(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    let name = export_name(&request)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("需要二进制导出数据".into()); };
    if bytes.is_empty() || bytes.len() > 200 * 1024 * 1024 { return Err("导出大小无效".into()); }
    let bytes = bytes.clone();
    #[cfg(windows)]
    {
        let extension = if name.ends_with(".vrm") { "vrm" } else { "json" };
        let Some(file) = rfd::AsyncFileDialog::new().set_title("保存导出文件").set_file_name(&name).add_filter("导出文件", &[extension]).save_file().await else { return Ok(false); };
        file.write(&bytes).await.map_err(|_| "保存失败，请检查目标文件夹的权限和剩余空间")?;
        Ok(true)
    }
    #[cfg(not(windows))]
    { let _ = (name, bytes); Err("此桌面功能目前仅支持 Windows".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_urls_are_exactly_scoped() {
        for url in ["https://vroid.com/en/studio", "https://store.steampowered.com/app/1486350/VRoid_Studio/?l=schinese", "https://github.com/bocmiao/MIAO-Motion/releases/latest", "https://vrm.dev/licenses/1.0/"] { assert!(allowed_external(&Url::parse(url).unwrap()), "{url}"); }
        for url in ["file:///C:/Windows/system32/cmd.exe", "https://vroid.com.evil.test/en/studio", "https://evil.test/", "https://user@vroid.com/en/studio", "https://vroid.com:444/en/studio", "http://vroid.com/en/studio", "https://github.com/other/repo/releases", "https://github.com/bocmiao/MIAO-Motion/releases-evil", "https://store.steampowered.com/app/14863500/"] { assert!(!allowed_external(&Url::parse(url).unwrap()), "{url}"); }
    }
}
