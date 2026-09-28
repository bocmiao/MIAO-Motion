// An isolated Windows 11 API/linking probe, NOT an installed virtual camera.
// No registration, COM server, frame transmission, camera access or persistent writes.
#[cfg(windows)]
fn main() {
    use windows::Win32::Media::MediaFoundation::{
        MFIsVirtualCameraTypeSupported, MFVirtualCameraType_SoftwareCameraSource,
    };
    match unsafe { MFIsVirtualCameraTypeSupported(MFVirtualCameraType_SoftwareCameraSource) } {
        Ok(supported) => println!("software_camera_supported={}", supported.as_bool()),
        Err(error) => println!("capability_query_failed={error}; no camera was registered"),
    }
}

#[cfg(not(windows))]
fn main() {
    println!("Windows 11 Build 22000+ only; no camera was registered");
}
