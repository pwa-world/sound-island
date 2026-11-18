import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const engineDirectory = "node_modules/@ffmpeg/core";
const { version } = JSON.parse(readFileSync(engineDirectory + "/package.json"));
const integrity = {};
for (const filename of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const bytes = readFileSync(engineDirectory + "/dist/esm/" + filename);
  integrity[filename] =
    "sha256-" + createHash("sha256").update(bytes).digest("base64");
}
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  define: {
    __CORE_VERSION__: JSON.stringify(version),
    __CORE_INTEGRITY__: JSON.stringify(integrity),
  },
});
