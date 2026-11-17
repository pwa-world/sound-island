import { mkdir,copyFile } from 'node:fs/promises';
await mkdir('public/engine',{recursive:true});
for(const f of ['ffmpeg-core.js','ffmpeg-core.wasm']) await copyFile(`node_modules/@ffmpeg/core/dist/esm/${f}`,`public/engine/${f}`);
