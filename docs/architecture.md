# Architecture

## Current spike

The first runnable spike deliberately uses a single Vite application:

```text
camera permission ─┐
                   ├─ browser UI
VRM file → three-vrm → Three.js preview
```

This proves local file handling, VRM rendering, camera permissions and WebGL performance before adding a desktop shell.

## Planned local pipeline

```text
camera → MediaPipe Tasks Worker → motion solver → filters/calibration
                                              → VRM mapping → preview
                                              → local state → OBS Browser Source
```

## Decisions

- Windows is the first supported platform.
- VRM 0.x and 1.0 are the first avatar formats.
- MediaPipe Tasks Vision replaces the deprecated Kalidokit/legacy Holistic path.
- OBS remains a separate application and is controlled over its WebSocket protocol.
- The desktop-shell decision between Tauri and Electron follows measured spike results.
- JSON is enough for early local configuration; SQLite is deferred until a real indexing or migration need appears.

## Security boundaries

- Core functionality must work offline.
- Future local services bind only to `127.0.0.1` and use per-session tokens.
- Raw frames, audio and avatar files are not included in logs or crash reports.

