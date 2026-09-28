# Architecture

The product scope, milestones and release gates are defined in [`PROJECT_PLAN.md`](PROJECT_PLAN.md) and [`ACCEPTANCE.md`](ACCEPTANCE.md).

## v0.2.0 runtime

```text
VRM file → validation → IndexedDB → three-vrm → Three.js renderer
camera → MediaPipe Face Landmarker → smoothing/calibration → VRM bones + expressions
                                                    └────→ preview / broadcast canvas
```

The first runnable release stays a single Vite application. There is no server-side processing, account system, database server, WebSocket layer or desktop shell.

## Components

- `src/main.ts`: camera, MediaPipe lifecycle, VRM loading, rendering, persistence and UI state.
- `src/motion.mjs`: pure blendshape mapping and frame-rate independent damping.
- `tests/motion.test.mjs`: dependency-free solver checks using Node's built-in assertions.
- IndexedDB `miao-motion/assets/current-vrm`: last successfully imported avatar.

## Motion mapping

- MediaPipe facial transformation matrix → calibrated VRM normalized head bone quaternion.
- `eyeBlinkLeft/Right` → VRM separate blink expressions, or combined blink fallback.
- `jawOpen` + `mouthFunnel/Pucker` → VRM `aa` and `oh`.
- `mouthSmileLeft/Right` → VRM `happy` with reduced weight.
- eye look blendshapes → VRM look expressions when supplied by the model.

Missing optional expressions are ignored. The model doctor reports the gap instead of preventing the rest of the avatar from working.

## Broadcast modes

- Normal UI: configuration, camera preview and model diagnostics.
- In-page broadcast: full-window canvas; Escape or double click exits.
- `?broadcast=1&background=transparent`: minimal OBS browser-source page that restores the saved VRM and requests the camera.
- Green background: fallback for OBS window capture with a chroma-key filter.

## Security boundaries

- Runtime server binds to `127.0.0.1`.
- Raw frames are not stored, logged or uploaded.
- Imported VRM data is stored only in the browser origin's IndexedDB.
- Remote MediaPipe WASM and model URLs are pinned to an explicit package/model version.
- No telemetry or crash upload exists.

## Not part of the v0.2.0 runtime

- Body and hand landmarkers.
- Tauri 2 desktop wrapper; scheduled for v0.3 after the browser prototype passes hardware acceptance.
- OBS WebSocket automation.
- Built-in avatar catalogue and character editor.
- Worker-based inference; the main-thread implementation is retained until real profiling shows dropped rendering frames.

## Accepted next architecture decisions

- Tauri 2 is the selected Windows desktop shell for v0.3; Electron is no longer the default candidate.
- Face-only inference stays on the current path until profiling justifies a migration.
- Pose and Hand inference must be prototyped off the render thread before either becomes a default feature.
- Desktop builds bundle MediaPipe runtime/model assets so core tracking works offline.
- Spout2 is a gated feasibility spike, not a v1.0 dependency until measured against transparent-window capture.
