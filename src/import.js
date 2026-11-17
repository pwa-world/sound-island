export class InvalidFileError extends Error {
  constructor(reason) {
    super(`文件不合法：${reason}`);
    this.name = "InvalidFileError";
  }
}
export function validateFile(file) {
  if (file.size === 0) throw new InvalidFileError("文件为空，请重新选择。");
}

// Inspect the mounted local file before extracting audio. WORKERFS reads only
// requested byte ranges; it never copies the whole video into WASM memory.
export async function inspectAudio(ff, path) {
  const code = await ff.ffprobe([
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=codec_name,codec_tag_string",
    "-of",
    "json",
    "-o",
    "probe.json",
    path,
  ]);
  // core 0.12.10 may leave ret=-1 after ffprobe emits a complete report.
  // Validate its structured output as well as the exit status.
  let report;
  try {
    report = JSON.parse(await ff.readFile("probe.json", "utf8"));
  } catch {
    throw new InvalidFileError("无法识别媒体格式，或文件头已损坏。");
  }
  if (![0, -1].includes(code) || !Array.isArray(report.streams))
    throw new InvalidFileError("无法识别媒体格式，或文件头已损坏。");
  await ff.deleteFile("probe.json");
  const audio = report.streams?.[0];
  if (!audio) throw new InvalidFileError("文件中没有音轨。");
  if (audio.codec_tag_string === "enca")
    throw new InvalidFileError("音轨已加密，无法在本机提取。");
  if (!audio.codec_name || audio.codec_name === "unknown")
    throw new InvalidFileError("无法识别音轨编码。");
  // Check the actual decoder, not the browser's video playback support.
  const decodable = await ff.exec([
    "-v",
    "error",
    "-xerror",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-t",
    "0.05",
    "-f",
    "null",
    "-",
  ]);
  if (decodable !== 0)
    throw new InvalidFileError(
      `音轨无法解码（${audio.codec_name}），可能不受支持、已加密或已损坏。`,
    );
}
export function extractionArgs(path) {
  return [
    "-i",
    path,
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
  ];
}
