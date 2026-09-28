# Architecture

Current scope and evidence: [third-round remediation](ROUND3_REMEDIATION.md), [validation status](VALIDATION_STATUS.md), [device acceptance](ACCEPTANCE.md).

## v0.3.0 runtime

```text
VRM / bundled avatar → model doctor → IndexedDB → three-vrm → Three.js canvas
webcam → local Face + optional Pose/Hand engines → bones / expressions
microphone → local RMS amplitude → mouth override
specified LAN phone → desktop UDP receiver → iFacialMocap parser → face motion
canvas → preview / green-screen broadcast / desktop DirectShow sender
user action → local OBS WebSocket v5 → dedicated scene and window source
```

One Vite application is embedded by Tauri or served by the loopback portable server. No cloud frame processing, account service, remote database, recording or telemetry is included.

## Components and lifecycle

- `src/main.ts`: camera lifecycle, model generation guards, face calibration, rendering and UI integration.
- `src/render-ready.ts`: shader compilation, render submission and GPU fence; no ready status before completion.
- `src/storage.mjs`: IndexedDB v4 model/profile transactions and migration.
- `src/avatar-utils.mjs`, `motion.mjs`, `capture.mjs`: model metrics, bone framing, mirrored motion and camera helpers.
- `src/studio-tools.ts`: per-model material color preferences, local expression keys, microphone lifecycle, adaptive pixel ratio and user-triggered version checks.
- `src/body-tracking.ts`: optional offline CPU Pose/Hand inference, capped at 10 Hz; missing bones ignored and stale tracked limbs restored. It currently runs on the main thread and is not enabled by default.
- `src/phone.ts` and `src-tauri/src/phone.rs`: bounded UDP polling from one explicitly chosen private IPv4 sender; packet size capped, no video traffic.
- `src/obs.ts`: localhost WebSocket v5 authentication, bounded request lifetime, new scene/window source/chroma filter/fit transform. Does not start streaming.
- `src/native-camera.ts` and `src-tauri/src/native_camera.rs`: one binary frame request in flight, fixed 640×360 BGR, at most 15 FPS, sender release on stop/exit.
- `native/`: MIT Softcam plus Microsoft DirectShow base classes; independent camera GUID/shared memory names; fixed sibling DLL registration helper with UAC.
- `public/release-info.js`: semantic version selection from complete GitHub release assets; no hardcoded version/hash.
- `scripts/prepare-*.mjs`: pinned offline models, WASM, example and license preparation; `generate-miao-avatar.mjs` generates original geometry.
- `tests/e2e`: real rendered pixels, asynchronous failure/lifecycle cases, local engines, microphone and protocol simulation. Windows CI independently tests actual DirectShow reception and package installation.

## Motion precedence

Fresh phone face input takes precedence over webcam face input; after 500 ms without a phone update, webcam input or idle animation resumes. Body tracking affects limbs. Microphone amplitude overrides mouth channels; selected expressions are applied after ordinary face mapping. Only supported model channels are enabled.

VRM 0 and VRM 1 retain their orientation conversion. Head rotation is calibrated relative to the neutral quaternion and bounded before applying. Mirror changes lateral gaze/eyelids and yaw/roll without reversing pitch. Framing accounts for geometry above the head bone (hair/ears), body bounds and viewport aspect.

## Storage

IndexedDB stores Blob models, thumbnails and named profiles. LocalStorage stores validated app settings, per-model material color overrides and bounded sanitized diagnostic events. OBS passwords, microphone samples, phone packets and frames are not persisted. Desktop and browser origins have separate model libraries.

## Security and distribution boundaries

- Portable HTTP binds only to 127.0.0.1; path traversal and malformed methods are rejected.
- Face/Pose/Hand models are verified at build time and shipped locally; runtime inference is offline.
- CSP permits the local app, GitHub API for explicit update/download checks and OBS at 127.0.0.1:4455. It does not permit arbitrary remote scripts.
- Tauri camera/microphone permissions are allowed only for the bundled origin (or exact debug origin). Requests occur through user controls; external navigation is denied.
- Phone receiver binds UDP 49983 only after the connect action, accepts data only from the specified LAN peer, bounds work per poll and closes on stop.
- Native registration runs a fixed bundled helper and fixed sibling DLL; UI cannot supply arbitrary command/path arguments. Registration requests Windows UAC, not silent elevation.
- DirectShow supports 64-bit receivers only in this build; no alpha, no guarantee of UWP/32-bit compatibility. Unregister the component before removing the application.
- Signing, mirrors and community accounts remain unconfigured per the owner; [integration instructions](DISTRIBUTION_SETUP.md) cover their later setup.

## Remaining extensions

Full wardrobe mesh editing/export, global expression hotkeys, automatic update installation, Spout2/VMC, cross-platform releases and worker-based body inference are outside this beta. Real camera/phone/OBS/meeting software and novice testing remain necessary; mocked IPC and engine startup do not prove physical-device compatibility.
