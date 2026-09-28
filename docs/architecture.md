# Architecture

The product scope, milestones and release gates are defined in [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`ACCEPTANCE.md`](ACCEPTANCE.md).

## v0.2.1 runtime

```text
VRM file → validation/performance doctor → IndexedDB → three-vrm → Three.js renderer
camera → MediaPipe Face Landmarker → smoothing/calibration → VRM bones + expressions
                                                    └────→ preview / broadcast canvas
settings JSON ↔ validated profile; runtime events → local diagnostic download
```

The first runnable release stays a single Vite application. There is no server-side processing, account system, database server, WebSocket layer or desktop shell.

## Components

- `src/main.ts`: camera selection, MediaPipe lifecycle, VRM loading, rendering, persistence and UI state.
- `src/app-utils.mjs`: validated settings/profile, camera and model error messages, file limits, tracking quality and model performance classification.
- `src/avatar-utils.mjs`: MToon/morph-aware model metrics, mirror mapping, relative-quaternion head calibration, gaze angles and idle blink.
- `src/motion.mjs`: pure blendshape mapping and frame-rate independent damping.
- `tests/*.test.mjs`: granular solver, settings, declarations, lifecycle, storage, launcher and DOM contracts using Node's built-in test runner.
- `tests/e2e`: Playwright smoke checks for onboarding, keyboard import, settings, broadcast feedback and camera re-entry.
- IndexedDB v2 `miao-motion/models/current`: last successfully imported avatar as a Blob plus name, type, size and update time. Upgrade migrates v1 `assets/current-vrm`.
- LocalStorage `miao-motion-settings-v1`: camera choice, background, mirror mode, sensitivity, render quality and onboarding completion.

## Motion mapping

- MediaPipe facial transformation matrix → `inverse(neutral) × current` relative quaternion → bounded VRM normalized head rotation.
- `eyeBlinkLeft/Right` → VRM separate blink expressions, or combined blink fallback.
- `jawOpen` + `mouthFunnel/Pucker` → VRM `aa` and `oh`.
- `mouthSmileLeft/Right` → VRM `happy` with reduced weight.
- eye look blendshapes → bounded degree yaw/pitch through VRM LookAt, covering bone and expression appliers.
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
- The Node-free portable package uses a PowerShell `HttpListener` bound to `127.0.0.1`; its path check rejects traversal outside `dist`.
- No telemetry or crash upload exists.
- Settings and diagnostics are exported only after a user click. Diagnostic reports exclude frames, model content, local paths and camera device IDs.

## Not part of the v0.2.1 runtime

- Body and hand landmarkers.
- Tauri 2 desktop wrapper; scheduled for v0.3 after the browser prototype passes hardware acceptance.
- OBS WebSocket automation.
- Built-in avatar catalogue and character editor.
- Worker-based inference; the main-thread implementation is retained until real profiling shows dropped rendering frames.

## Accepted next architecture decisions

- Tauri 2 is the selected Windows desktop shell for v0.3; Electron is no longer the default candidate.
- Face-only inference stays on the current path until profiling justifies a migration.
- Pose and Hand inference must be prototyped off the render thread before either becomes a default feature.
- Desktop packaging reuses the prepared MediaPipe runtime/model assets so core tracking works offline.
- Spout2 is a gated feasibility spike, not a v1.0 dependency until measured against transparent-window capture.
