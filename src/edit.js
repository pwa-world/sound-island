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
    ...(format === "mp3"
      ? ["-c:a", "libmp3lame", "-b:a", "192k"]
      : ["-c:a", "pcm_s16le"]),
    `export.${format}`,
  ];
}
export function stamp(s) {
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}
