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

The optional Pose and Hand Landmarker models are also bundled for offline use. Official download paths and mandatory SHA-256 checks are in `scripts/prepare-body-models.mjs`; their Apache-2.0 license text is included in the runtime notices. Softcam and Microsoft's separate MIT texts are included as well. Native dependency source and provenance are preserved under `native/`.

The procedural cat “喵小动” is generated entirely from project-owned geometry by `scripts/generate-miao-avatar.mjs`; it does not derive from the pixiv model. Its asset terms are supplied in `public/miao-license.html` and the VRM metadata.

`npm run prepare:assets` generates `public/licenses/THIRD_PARTY_LICENSES.txt` from the production dependency tree. Vite copies it into `dist/licenses/`, and the Windows portable job packages that directory with the project license and notices.

Google's Face Landmarker model is distributed under Apache-2.0. The build downloads it from the official MediaPipe URL (or an operator-supplied mirror/local path) and always verifies SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Its Apache-2.0 text is included in the generated third-party license bundle. MediaPipe WebAssembly is copied from the lockfile-pinned `@mediapipe/tasks-vision` package. Release builds serve both from the local application; camera frames are not uploaded by MIAO Motion.

The runtime bundle includes the unmodified pixiv Inc. `VRM1_Constraint_Twist_Sample` v1.0.1 (© 2022 pixiv Inc.), separately licensed under [VRM Public License 1.0](https://vrm.dev/licenses/1.0/) and the file's metadata, NOT MPL-2.0 or the three-vrm code's MIT license. Metadata permits redistribution, everyone's avatar use and corporate commercial use, does not require credits, and disallows antisocial/hate use. There is no warranty or pixiv endorsement. Source revision, exact hash and size are recorded in `public/example-avatar.json`; `public/example-license.html` accompanies the bundle. The original bytes and license settings are preserved.

## Rust / Windows desktop

Windows 依赖及构建依赖的完整许可收录于 [RUST_THIRD_PARTY_LICENSES.txt](native/licenses/RUST_THIRD_PARTY_LICENSES.txt)，随包复制至 public/licenses。生成命令为 node scripts/prepare-rust-licenses.mjs；输入使用锁定的 Cargo 依赖。缺省许可证文件的 crate 使用固定上游提交的许可，来源保存在 native/licenses/upstream；selectors 使用其声明的标准 MPL-2.0 文本。
