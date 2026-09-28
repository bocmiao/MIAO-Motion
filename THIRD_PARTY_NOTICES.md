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

The build downloads Google's Face Landmarker model from the official MediaPipe URL and verifies SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. MediaPipe WebAssembly is copied from the lockfile-pinned `@mediapipe/tasks-vision` package. Release builds serve both from the local application; camera frames are not uploaded by MIAO Motion.

No third-party avatar is bundled in the current release.
