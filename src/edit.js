export function validateRange(start, end, duration) {
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= duration + 0.001 &&
    end - start >= 0.05
  );
}
export function filters({ gain = 1, fade = 0, reverse = false }, duration) {
  const f = [`volume=${gain}`];
  if (reverse) f.push("areverse");
  const seconds = Math.min(fade, duration / 2);
  if (seconds > 0)
    f.push(
      `afade=t=in:st=0:d=${seconds}`,
      `afade=t=out:st=${duration - seconds}:d=${seconds}`,
    );
  return f.join(",");
}
export const exportFormats = {
  m4a: {
    label: "M4A · AAC · 192 kbps",
    mime: "audio/mp4",
    args: ["-c:a", "aac", "-b:a", "192k"],
  },
  mp3: {
    label: "MP3 · 192 kbps",
    mime: "audio/mpeg",
    args: ["-c:a", "libmp3lame", "-b:a", "192k"],
  },
  wav: {
    label: "WAV · PCM · 无损编辑",
    mime: "audio/wav",
    args: ["-c:a", "pcm_s16le"],
  },
};
export function exportArgs({ start, end, gain, fade, reverse, format }) {
  return [
    "-ss",
    String(start),
    "-t",
    String(end - start),
    "-i",
    "source.wav",
    "-vn",
    "-af",
    filters({ gain, fade, reverse }, end - start),
    ...exportFormats[format].args,
    `export.${format}`,
  ];
}
export function stamp(s) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
