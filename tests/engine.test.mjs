import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { exportArgs } from "../src/edit.js";
import { inspectAudio, extractionArgs, validateFile } from "../src/import.js";
const require = createRequire(import.meta.url);
test("real bundled WASM extracts a video and exports trimmed WAV and MP3", async () => {
  globalThis.self = { location: { href: "http://localhost/ffmpeg-core.js" } };
  const create = require("@ffmpeg/core");
  const ff = await create({
    wasmBinary: readFileSync(require.resolve("@ffmpeg/core/wasm")),
  });
  const adapter = {
    ffprobe: async (args) => {
      ff.reset();
      return ff.ffprobe(...args);
    },
    exec: async (args) => {
      ff.reset();
      return ff.exec(...args);
    },
    readFile: async (path, encoding) => ff.FS.readFile(path, { encoding }),
    deleteFile: async (path) => ff.FS.unlink(path),
  };
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
  // WORKERFS uses FileReaderSync in the browser worker. Model byte-range
  // reads here so the real WASM demuxer runs on a mounted file, not MEMFS.
  globalThis.FileReaderSync = class {
    readAsArrayBuffer(chunk) {
      return chunk.buffer;
    }
  };
  const videoBytes = ff.FS.readFile("input.mp4");
  let reads = 0;
  const blob = {
    size: videoBytes.length,
    slice(start, end) {
      reads++;
      const bytes = videoBytes.slice(start, end);
      return { size: bytes.length, buffer: bytes.buffer };
    },
  };
  ff.FS.mkdir("/input");
  ff.FS.mount(
    ff.FS.filesystems.WORKERFS,
    { blobs: [{ name: "media", data: blob }] },
    "/input",
  );
  assert.deepEqual(ff.FS.readFile("/input/media"), videoBytes);
  await inspectAudio(adapter, "/input/media");
  run(extractionArgs("/input/media"));
  assert.ok(reads > 0, "probe and extraction must read file ranges");
  ff.FS.unmount("/input");
  ff.FS.rmdir("/input");
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
  await assert.rejects(
    inspectAudio(adapter, "silent.mp4"),
    /文件不合法：文件中没有音轨/,
  );
  ff.FS.writeFile("bad.mp4", new TextEncoder().encode("not a media file"));
  await assert.rejects(
    inspectAudio(adapter, "bad.mp4"),
    /文件不合法：无法识别/,
  );
  ff.reset();
  assert.notEqual(
    ff.exec("-i", "silent.mp4", "-map", "0:a:0", "-vn", "silent.wav"),
    0,
  );
  // A file larger than the old cap is not rejected by selection validation.
  assert.doesNotThrow(() => validateFile({ size: 151 * 1024 * 1024 }));
  assert.throws(() => validateFile({ size: 0 }), /文件不合法：文件为空/);
  // Verify the production extraction command retains audio past ten minutes.
  run([
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=8000:cl=mono",
    "-t",
    "602",
    "-c:a",
    "pcm_s16le",
    "long.wav",
  ]);
  await inspectAudio(adapter, "long.wav");
  run(extractionArgs("long.wav"));
  ff.reset();
  assert.ok(
    [0, -1].includes(
      ff.ffprobe(
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        "-o",
        "duration.json",
        "source.wav",
      ),
    ),
  );
  const report = JSON.parse(
    ff.FS.readFile("duration.json", { encoding: "utf8" }),
  );
  assert.ok(
    Number(report.format.duration) >= 602,
    "do not truncate long audio",
  );
});
