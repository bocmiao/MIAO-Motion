use std::{net::{Ipv4Addr, UdpSocket}, sync::Mutex};

#[derive(Default)]
pub struct Phone(pub Mutex<Option<(UdpSocket, Ipv4Addr)>>);

#[tauri::command]
pub fn phone_start(peer: String, state: tauri::State<'_, Phone>) -> Result<String, String> {
    let peer: Ipv4Addr = peer.parse().map_err(|_| "请输入手机的局域网 IPv4 地址")?;
    if !peer.is_private() && !peer.is_loopback() { return Err("只允许本机或局域网手机地址".into()); }
    let mut guard = state.0.lock().map_err(|_| "手机接收器不可用")?;
    *guard = None;
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 49983)).map_err(|_| "手机接收端口 49983 被占用")?;
    socket.set_nonblocking(true).map_err(|e| e.to_string())?;
    socket.send_to(b"iFacialMocap_sahuasouryya9218sauhuiayeta91555dy3719", (peer, 49983)).map_err(|_| "无法联系手机")?;
    let route = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|e| e.to_string())?;
    route.connect((peer, 49983)).map_err(|e| e.to_string())?;
    let address = route.local_addr().map_err(|e| e.to_string())?.ip().to_string();
    *guard = Some((socket, peer));
    Ok(address)
}

#[tauri::command]
pub fn phone_stop(state: tauri::State<'_, Phone>) { if let Ok(mut s) = state.0.lock() { *s = None; } }

#[tauri::command]
pub fn phone_poll(state: tauri::State<'_, Phone>) -> Option<String> {
    let guard = state.0.lock().ok()?;
    let (socket, peer) = guard.as_ref()?;
    let mut data = [0u8; 8192];
    let mut latest = None;
    // Bound work and memory, ignore every sender except the explicitly chosen phone.
    for _ in 0..16 {
        match socket.recv_from(&mut data) {
            Ok((length, sender)) if sender.ip() == *peer && length < data.len() => {
                if let Ok(text) = std::str::from_utf8(&data[..length]) { latest = Some(text.to_owned()); }
            }
            Ok(_) => {},
            Err(_) => break,
        }
    }
    latest
}
