import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { exportArgs } from "../src/edit.js";
const require = createRequire(import.meta.url);
test("real bundled WASM extracts a video and exports trimmed WAV and MP3", async () => {
  globalThis.self = { location: { href: "http://localhost/ffmpeg-core.js" } };
  const create = require("@ffmpeg/core");
  const ff = await create({
    wasmBinary: readFileSync(require.resolve("@ffmpeg/core/wasm")),
  });
  let messages = [];
  ff.setLogger(({ message }) => messages.push(message));
  function run(args) {
    ff.reset();
    assert.equal(ff.exec(...args), 0, messages.slice(-8).join("\n"));
  }
  run([
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=32x32:r=10:d=3",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=3",
    "-c:v",
    "mpeg4",
    "-c:a",
    "aac",
    "input.mp4",
  ]);
  run([
    "-i",
    "input.mp4",
    "-map",
    "0:a:0",
    "-vn",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "source.wav",
  ]);
  for (const format of ["wav", "mp3"]) {
    run(
      exportArgs({
        start: 1,
        end: 2,
        gain: 0.5,
        fade: 0.2,
        reverse: true,
        format,
      }),
    );
    const result = ff.FS.readFile(`export.${format}`);
    assert.ok(result.length > 1000);
    if (format === "wav") {
      assert.equal(new TextDecoder().decode(result.slice(0, 4)), "RIFF");
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      let pos = 12;
      let bytes;
      while (pos < result.length - 8) {
        const tag = new TextDecoder().decode(result.slice(pos, pos + 4));
        const size = view.getUint32(pos + 4, true);
        if (tag === "data") {
          bytes = size;
          break;
        }
        pos += 8 + size + (size % 2);
      }
      assert.ok(
        Math.abs(bytes / (44100 * 2 * 2) - 1) < 0.02,
        "WAV duration must match one-second selection",
      );
    }
  }
  // A missing audio track must produce an error instead of a false success.
  run([
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=32x32:r=10:d=1",
    "-c:v",
    "mpeg4",
    "silent.mp4",
  ]);
  ff.reset();
  assert.notEqual(
    ff.exec("-i", "silent.mp4", "-map", "0:a:0", "-vn", "silent.wav"),
    0,
  );
});
