# Third-party notices

MIAO Motion currently depends on the following open-source packages:

| Component | License | Purpose |
|---|---|---|
| Three.js | MIT | 3D rendering |
| @pixiv/three-vrm | MIT | VRM loading and runtime |
| MediaPipe Tasks Vision | Apache-2.0 | Local face landmarks, expressions and head pose |
| Vite | MIT | Development and production build |
| TypeScript | Apache-2.0 | Type checking |

This list will be generated and verified during release builds as the dependency set grows.

The first launch downloads Google's Face Landmarker model and MediaPipe WebAssembly runtime. Camera frames are processed locally and are not uploaded by MIAO Motion.

No third-party avatar is bundled in the current release.
