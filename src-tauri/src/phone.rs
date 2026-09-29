use std::{net::{Ipv4Addr, UdpSocket}, sync::Mutex, time::{Duration, Instant}};

const PORT: u16 = 49983;
const HANDSHAKE: &[u8] = b"iFacialMocap_sahuasouryya9218sauhuiayeta91555dy3719";
/// Repeat the handshake while the phone is silent: it may start iFacialMocap after
/// the PC, restart the app, or lose the single UDP handshake packet.
const HANDSHAKE_INTERVAL: Duration = Duration::from_secs(2);

pub struct Receiver {
    socket: UdpSocket,
    peer: Ipv4Addr,
    last_handshake: Instant,
    last_data: Option<Instant>,
}

impl Receiver {
    fn handshake(&mut self) -> std::io::Result<()> {
        self.last_handshake = Instant::now();
        self.socket.send_to(HANDSHAKE, (self.peer, PORT)).map(|_| ())
    }

    /// No handshake while packets arrive; resume every 2 s once the phone goes quiet.
    fn handshake_due(&self, now: Instant) -> bool {
        let streaming = self.last_data.is_some_and(|at| now.duration_since(at) < HANDSHAKE_INTERVAL);
        !streaming && now.duration_since(self.last_handshake) >= HANDSHAKE_INTERVAL
    }
}

#[derive(Default)]
pub struct Phone(pub Mutex<Option<Receiver>>);

#[tauri::command]
pub fn phone_start(peer: String, state: tauri::State<'_, Phone>) -> Result<String, String> {
    let peer: Ipv4Addr = peer.parse().map_err(|_| "请输入手机的局域网 IPv4 地址")?;
    if !peer.is_private() && !peer.is_loopback() { return Err("只允许本机或局域网手机地址".into()); }
    let mut guard = state.0.lock().map_err(|_| "手机接收器不可用")?;
    *guard = None;
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, PORT)).map_err(|_| "手机接收端口 49983 被占用")?;
    socket.set_nonblocking(true).map_err(|e| e.to_string())?;
    let mut receiver = Receiver { socket, peer, last_handshake: Instant::now(), last_data: None };
    receiver.handshake().map_err(|_| "无法联系手机")?;
    let route = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|e| e.to_string())?;
    route.connect((peer, PORT)).map_err(|e| e.to_string())?;
    let address = route.local_addr().map_err(|e| e.to_string())?.ip().to_string();
    *guard = Some(receiver);
    Ok(address)
}

#[tauri::command]
pub fn phone_stop(state: tauri::State<'_, Phone>) { if let Ok(mut s) = state.0.lock() { *s = None; } }

/// Errors after which the socket is still usable. Windows reports an ICMP "port
/// unreachable" for an earlier handshake (phone app not running yet) as
/// WSAECONNRESET (10054) and an oversized datagram as WSAEMSGSIZE (10040).
fn recoverable(error: &std::io::Error) -> bool {
    use std::io::ErrorKind::*;
    matches!(error.kind(), ConnectionReset | ConnectionRefused | Interrupted | TimedOut)
        || matches!(error.raw_os_error(), Some(10040 | 10054))
}

#[tauri::command]
pub fn phone_poll(state: tauri::State<'_, Phone>) -> Option<String> {
    let mut guard = state.0.lock().ok()?;
    let receiver = guard.as_mut()?;
    let mut data = [0u8; 8192];
    let mut latest = None;
    // Bound work and memory, ignore every sender except the explicitly chosen phone.
    for _ in 0..16 {
        match receiver.socket.recv_from(&mut data) {
            Ok((length, sender)) if sender.ip() == receiver.peer && length < data.len() => {
                if let Ok(text) = std::str::from_utf8(&data[..length]) {
                    latest = Some(text.to_owned());
                    receiver.last_data = Some(Instant::now());
                }
            }
            Ok(_) => {},
            Err(error) if recoverable(&error) => continue,
            // WouldBlock: nothing queued. Anything else: try again on the next poll.
            Err(_) => break,
        }
    }
    if receiver.handshake_due(Instant::now()) {
        // A transient send failure is retried on the next interval.
        let _ = receiver.handshake();
    }
    latest
}
