# Third-party notices

MIAO Motion currently depends on the following open-source packages:

| Component | License | Purpose |
|---|---|---|
| Three.js | MIT | 3D rendering |
| @pixiv/three-vrm | MIT | VRM loading and runtime |
| MediaPipe Tasks Vision | Apache-2.0 | Local face landmarks, expressions and head pose |
| Vite | MIT | Development and production build |
| TypeScript | Apache-2.0 | Type checking |
| @tauri-apps/api | MIT / Apache-2.0 | Desktop IPC |
| tshino/softcam | MIT | DirectShow virtual camera; pinned revision in native/README.md |
| Microsoft DirectShow Base Classes | MIT | Camera filter support; copyright headers preserved |

## Bundled machine-learning models

| Model | License | Source | Distribution |
|---|---|---|---|
| Google MediaPipe Face Landmarker (`face_landmarker.task`, float16) | Apache-2.0 | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | Bundled in the installer and portable package |
| Google MediaPipe Pose Landmarker Lite (`pose_landmarker_lite.task`, float16) | Apache-2.0 | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | Bundled in the installer and portable package |
| Google MediaPipe Hand Landmarker (`hand_landmarker.task`, float16) | Apache-2.0 | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | Bundled in the installer and portable package |

The Pose and Hand Landmarker models power the optional body and hand tracking and run entirely on the local device. Official download paths and mandatory SHA-256 checks (`59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` for Pose Landmarker Lite, `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` for Hand Landmarker) are in `scripts/prepare-body-models.mjs`; the build refuses files that do not match. The models are redistributed unmodified, and their Apache-2.0 license text is included in the runtime notices (`licenses/THIRD_PARTY_LICENSES.txt`). Softcam and Microsoft's separate MIT texts are included as well. Native dependency source and provenance are preserved under `native/`.

The procedural cat “喵小动” is generated entirely from project-owned geometry by `scripts/generate-miao-avatar.mjs`; it does not derive from the pixiv model. It is licensed under the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) as recorded in its VRM metadata (author: MIAO Motion contributors; everyone may use it as an avatar, including corporate commercial use, modify it and redistribute it; no credit required; excessively violent, excessively sexual, political/religious and antisocial/hate use are not permitted). Characters exported from the in-app editor keep the same author and license metadata and carry the user's chosen name. Plain-language terms are in `public/miao-license.html`. The license does not grant rights to the “喵动 / MIAO Motion” names or logos; see [TRADEMARKS.md](TRADEMARKS.md).

`npm run prepare:assets` generates `public/licenses/THIRD_PARTY_LICENSES.txt` from the production dependency tree. Vite copies it into `dist/licenses/`, and the Windows portable job packages that directory with the project license and notices.

Google's Face Landmarker model is distributed under Apache-2.0. The build downloads it from the official MediaPipe URL (or an operator-supplied mirror/local path) and always verifies SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Its Apache-2.0 text is included in the generated third-party license bundle. MediaPipe WebAssembly is copied from the lockfile-pinned `@mediapipe/tasks-vision` package. Release builds serve both from the local application; camera frames are not uploaded by MIAO Motion.

The runtime bundle includes the unmodified pixiv Inc. `VRM1_Constraint_Twist_Sample` v1.0.1 (© 2022 pixiv Inc.), separately licensed under [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and the file's metadata, NOT MPL-2.0 or the three-vrm code's MIT license. Metadata permits redistribution, everyone's avatar use and corporate commercial use, does not require credits, and disallows antisocial/hate use. There is no warranty or pixiv endorsement. Source revision, exact hash and size are recorded in `public/example-avatar.json`; `public/example-license.html` accompanies the bundle. The original bytes and license settings are preserved.

## Rust / Windows desktop

The Windows desktop app is built from Rust crates (Tauri and its dependencies). The full license list for every Rust runtime and build dependency is kept at [native/licenses/RUST_THIRD_PARTY_LICENSES.txt](native/licenses/RUST_THIRD_PARTY_LICENSES.txt) and is shipped with the application as `licenses/RUST_THIRD_PARTY_LICENSES.txt` (also linked from the offline help page).

Windows 依赖及构建依赖的完整许可收录于 [RUST_THIRD_PARTY_LICENSES.txt](native/licenses/RUST_THIRD_PARTY_LICENSES.txt)，随包复制至 public/licenses 并随应用分发（离线帮助页有入口）。生成命令为 node scripts/prepare-rust-licenses.mjs；输入使用锁定的 Cargo 依赖。缺省许可证文件的 crate 使用固定上游提交的许可，来源保存在 native/licenses/upstream；selectors 使用其声明的标准 MPL-2.0 文本。
