# Third-party software

- `@ffmpeg/ffmpeg` 0.12.15 — MIT. Source: https://github.com/ffmpegwasm/ffmpeg.wasm (tag v0.12.15).
- `@ffmpeg/core` 0.12.10 — GPL-2.0-or-later. The shipped WASM binary is copied unmodified from the npm package. Source/build scripts: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10 ; upstream FFmpeg and codec sources/configuration are referenced by that version's Dockerfile and build scripts. License: https://github.com/FFmpeg/FFmpeg/blob/master/COPYING.GPLv2 . Redistributors must comply with the applicable corresponding-source obligations.
- Vite — MIT (development/build tool only).

Exact dependency versions are locked in package-lock.json. FFmpeg core assets are retrieved from npmmirror with a same-origin fallback.
