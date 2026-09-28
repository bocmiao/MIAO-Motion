# Security policy

Only the latest code on `main` is currently supported. The project is pre-release. Please do not publish vulnerabilities that could expose webcam data, local files, OBS credentials or local service tokens in a public issue.

Use GitHub's private security advisory form: <https://github.com/bocmiao/MIAO-Motion/security/advisories/new>. If the repository setting is temporarily unavailable, open a minimal public issue without exploit details and ask a maintainer to enable a private channel.

The application must never log raw webcam frames, microphone audio, OBS passwords, local access tokens or user avatar contents.

When reporting, include the affected commit, impact and minimal reproduction without attaching private avatars, camera frames, credentials or absolute local paths. Maintainers will acknowledge a valid private report before requesting additional diagnostic data.
