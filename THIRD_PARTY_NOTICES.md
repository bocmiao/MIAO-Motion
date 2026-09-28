# Third-party notices

MIAO Motion currently depends on the following open-source packages:

| Component | License | Purpose |
|---|---|---|
| Three.js | MIT | 3D rendering |
| @pixiv/three-vrm | MIT | VRM loading and runtime |
| MediaPipe Tasks Vision | Apache-2.0 | Local face landmarks, expressions and head pose |
| Vite | MIT | Development and production build |
| TypeScript | Apache-2.0 | Type checking |

`npm run prepare:assets` generates `public/licenses/THIRD_PARTY_LICENSES.txt` from the production dependency tree. Vite copies it into `dist/licenses/`, and the Windows portable job packages that directory with the project license and notices.

Google's Face Landmarker model is distributed under Apache-2.0. The build downloads it from the official MediaPipe URL (or an operator-supplied mirror/local path) and always verifies SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Its Apache-2.0 text is included in the generated third-party license bundle. MediaPipe WebAssembly is copied from the lockfile-pinned `@mediapipe/tasks-vision` package. Release builds serve both from the local application; camera frames are not uploaded by MIAO Motion.

No third-party avatar is bundled in the current release.
