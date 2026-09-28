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

The runtime bundle includes the unmodified pixiv Inc. `VRM1_Constraint_Twist_Sample` v1.0.1 (© 2022 pixiv Inc.), separately licensed under [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and the file's metadata, NOT MPL-2.0 or the three-vrm code's MIT license. Metadata permits redistribution, everyone's avatar use and corporate commercial use, does not require credits, and disallows antisocial/hate use. There is no warranty or pixiv endorsement. Source revision, exact hash and size are recorded in `public/example-avatar.json`; `public/example-license.html` accompanies the bundle. The original bytes and license settings are preserved.
