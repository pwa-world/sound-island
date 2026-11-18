const mirror =
  "https://registry.npmmirror.com/@ffmpeg/core/" +
  __CORE_VERSION__ +
  "/files/dist/esm/";
const cacheName =
  "ffmpeg-assets:" + new URL(".", document.baseURI).pathname + __CORE_VERSION__;
let pending;

async function loadAsset(filename, cache) {
  const key = mirror + filename;
  const saved = await cache?.match(key);
  if (saved) return { blob: await saved.blob(), cached: true };
  const mime = filename.endsWith(".js")
    ? "text/javascript"
    : "application/wasm";
  let blob;
  for (const url of [key, new URL("engine/" + filename, document.baseURI)]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(url, {
        integrity: __CORE_INTEGRITY__[filename],
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      blob = new Blob([await response.blob()], { type: mime });
      break;
    } catch (error) {
      if (url !== key) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  if (cache) {
    try {
      await cache.put(
        key,
        new Response(blob, { headers: { "Content-Type": mime } }),
      );
      return { blob, cached: true };
    } catch {
      /* Storage may be full. The downloaded engine can still run. */
    }
  }
  return { blob, cached: false };
}

async function prepare() {
  const cache = await globalThis.caches?.open(cacheName).catch(() => null);
  return Promise.all(
    ["ffmpeg-core.js", "ffmpeg-core.wasm"].map((name) =>
      loadAsset(name, cache),
    ),
  );
}
export function engineAssets() {
  pending ??= prepare().finally(() => {
    pending = null;
  });
  return pending;
}
