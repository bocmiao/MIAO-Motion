# Architecture

The product scope, milestones and independent validation ledger are defined in [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`ACCEPTANCE.md`](ACCEPTANCE.md).

## v0.2.1 runtime

```text
VRM file → validation/license/performance doctor → IndexedDB model library → three-vrm → Three.js renderer
camera → MediaPipe Face Landmarker → smoothing/calibration → VRM bones + expressions
                                                    └────→ preview / broadcast canvas
named profiles ↔ validated settings; runtime events → persistent sanitized log → diagnostic download
```

The frontend remains a single Vite application and now has a Tauri 2 shell that embeds the same production assets. There is no server-side processing, account system, database server or WebSocket layer.

## Components

- `src/main.ts`: camera selection, MediaPipe lifecycle, VRM loading, rendering and UI state.
- `src/storage.mjs`: IndexedDB v4 models/profiles CRUD, transactional file deduplication and legacy cleanup.
- `src/app-utils.mjs`: validated settings/profile, camera and model error messages, file limits, tracking quality and model performance classification.
- `src/capture.mjs`: camera constraints/errors, media-track cleanup and GPU→CPU detector fallback.
- `src/broadcast.mjs`: browser-source URL and broadcast background transitions.
- `src/avatar-utils.mjs`: MToon/morph-aware model metrics, mirror mapping, relative-quaternion head calibration, gaze angles and idle blink.
- `src/motion.mjs`: pure blendshape mapping and frame-rate independent damping.
- `tests/*.test.mjs`: granular solver, settings, declarations, lifecycle, storage, launcher and DOM contracts using Node's built-in test runner.
- `tests/e2e`: Playwright smoke checks for onboarding, keyboard import, settings, model fixtures/library, broadcast feedback and camera retry.
- `tests/fixtures`: deterministic project-owned minimal and corrupt VRM inputs.
- IndexedDB v4: multiple Blob models with thumbnails/recent time plus named profiles. Upgrade migrates v1 `assets/current-vrm`, retains v2/v3 models and removes the legacy Blob only in the same successful transaction.
- LocalStorage: camera/background/mirror/sensitivity/smoothing/render/view/output/onboarding settings and up to 80 sanitized diagnostic events.
- `src-tauri`: transparent Tauri 2 WebView shell with core-only permissions and Windows NSIS configuration.

## Motion mapping

- MediaPipe facial transformation matrix → `inverse(neutral) × current` relative quaternion → bounded VRM normalized head rotation. Mirror off preserves pitch/yaw/roll; mirror on keeps pitch and negates yaw/roll. VRM 0.x then negates quaternion x/z to match the VRM 1.0 normalized-bone frame. Model switches retain camera neutral calibration.
- `eyeBlinkLeft/Right` → VRM separate blink expressions, or combined blink fallback.
- `jawOpen` + `mouthFunnel/Pucker` → VRM `aa` and `oh`.
- `mouthSmileLeft/Right` → VRM `happy` with reduced weight.
- eye look blendshapes → bounded degree yaw/pitch through VRM LookAt: positive pitch looks DOWN, negative looks UP, covering bone and expression appliers.
- one mirror setting consistently swaps left/right eyelids and gaze, and reverses head yaw/roll.
- no-face state → neutral head, idle blink and subtle chest breathing.

Missing optional expressions are ignored. The model doctor reports the gap instead of preventing the rest of the avatar from working.
Missing the normalized head bone is a blocking issue. The performance doctor also counts rendered triangles, unique materials/textures and estimates texture/geometry memory; these are guidance thresholds until calibrated on real devices.

## Broadcast modes

- Normal UI: configuration, camera preview and model diagnostics.
- In-page broadcast: full-window canvas; Escape or double click exits.
- Green background + window capture: recommended route; the app window must not be minimized or fully occluded.
- `?broadcast=1&background=transparent`: experimental OBS browser-source page with an interactive missing-model/error overlay. OBS CEF has separate storage and may require `--enable-media-stream`.

## Security boundaries

- Runtime server binds to `127.0.0.1`.
- Raw frames are not stored, logged or uploaded.
- Imported VRM data is stored only in the browser origin's IndexedDB.
- Build preparation copies WASM from the lockfile-pinned MediaPipe package and verifies the Face Landmarker model against a pinned SHA-256; runtime loads both from the local origin.
- A restrictive CSP limits runtime connections and executable resources to the local origin/blob URLs.
- The Node-free portable package uses a PowerShell `TcpListener` bound to `127.0.0.1`, without http.sys URL ACLs. Bounded requests, per-client exception isolation and path checks protect the local static-file server.
- Tauri grants Camera only to the bundled origin (or exact local development origin in debug builds); other permission kinds and external navigation are denied. OS privacy policy is never bypassed.
- No telemetry or crash upload exists.
- Settings and diagnostics are exported only after a user click. Diagnostic reports exclude frames, model content, local paths and camera device IDs.

## Not part of the v0.2.1 runtime

- Body and hand landmarkers.
- Native virtual camera and Spout2 output.
- OBS WebSocket automation.
- Built-in avatar catalogue and character editor.
- Worker-based inference; the main-thread implementation is retained until real profiling shows dropped rendering frames.

## Accepted next architecture decisions

- Tauri 2 is already packaged in v0.2.1; Electron is not a parallel implementation.
- Face-only inference stays on the current path until profiling justifies a migration.
- Pose and Hand inference must be prototyped off the render thread before either becomes a default feature.
- Desktop packaging reuses the prepared MediaPipe runtime/model assets so core tracking works offline.
- Spout2 remains an optional feasibility spike, not a v1.0 dependency until measured against transparent-window capture.
