import { FFmpeg } from "@ffmpeg/ffmpeg";
import { exportFormats, exportArgs, stamp } from "./edit.js";
import "./style.css";
import { engineAssets } from "./engine-assets.js";
import { mountTimeline } from "./timeline.js";
import {
  InvalidFileError,
  validateFile,
  inspectAudio,
  extractionArgs,
} from "./import.js";
const $ = (id) => document.getElementById(id);
$("app").innerHTML =
  `<header><div class="brand"><img src="./icon.svg" alt="">Sound Island</div><div class="header-actions"><span id="offline" class="badge" role="status">正在准备离线资源…</span><button id="install">安装应用 ↗</button></div></header><main><section class="hero"><div><div class="eyebrow">YOUR POCKET AUDIO STUDIO</div><h1>留住声音，<em>随处创作。</em></h1><p>从一段视频，到一段属于你的声音。<br>提取、剪切、导出，在你的小岛上轻松完成。</p></div><div class="island" aria-hidden="true">${[24, 48, 76, 108, 85, 58, 30].map((h) => `<i style="--h:${h}px"></i>`).join("")}</div></section><div id="installHelp" class="install-help" hidden></div><div class="layout"><section class="card"><div class="section-title"><h2><span class="step">01</span>导入与剪切</h2><span class="small">文件仅在本机处理</span></div><div id="drop" class="drop"><div class="file-info"><div class="file-name" id="filename">选择一个视频或音频</div><span class="small">本机处理 · 支持拖入</span></div><button id="choose" class="primary">＋ 选择文件</button><input id="file" type="file" accept="video/*,audio/*,.mkv,.mov,.m4a" aria-describedby="fileHelp" hidden></div><p id="fileHelp" class="small">无文件大小、时长上限。选择后先检查格式与音轨；实际处理能力取决于设备内存。</p><div id="statusBox" class="status-box"><div><div id="status" role="status" aria-live="polite">准备好后，选择一个视频开始吧。</div><progress id="progress" hidden max="1"></progress><span id="elapsed" class="small"></span></div><button id="cancel" hidden>取消</button></div><fieldset id="editor" disabled><div class="wave-wrap" id="timeline"><canvas id="wave" aria-label="音频波形"></canvas><div id="selection"></div><div id="markers"></div><div id="playhead"></div></div><div class="time-row"><span>00:00.0</span><span id="duration">等待导入</span></div><div class="transport"><label>定位时间（秒）<input id="cursor" type="number" min="0" step="0.01" value="0"></label><button id="addMark">打关键帧</button><button id="preview">▶ 试听</button></div><p class="small">点波形定位，或在试听时打关键帧。拖动关键帧可调节切点。</p><section id="markControls" hidden aria-label="关键帧"><h3>关键帧</h3><div id="markList"></div></section><section aria-label="选择片段"><h3>选择片段（可多选）</h3><div id="segments" role="group" aria-label="可导出的片段"></div></section><div class="toolbar"><button id="reset">↺ 重置编辑</button></div><p class="small">从光标试听到下一切点。导出效果可在结果中试听。</p></fieldset></section><aside><section class="card settings"><div class="section-title"><h2><span class="step">02</span>声音与导出</h2></div><fieldset id="settings" disabled><label>音量 <output id="gainLabel">100%</output><input id="gain" type="range" min="0" max="2" step="0.05" value="1"></label><label>淡入 / 淡出<select id="fade"><option value="0">无</option><option value="0.5">0.5 秒</option><option value="1">1 秒</option><option value="2">2 秒</option></select></label><label><input id="reverse" type="checkbox"> 倒放声音</label><div class="divider"></div><label>导出格式<select id="format">${Object.entries(
    exportFormats,
  )
    .map(
      ([format, { label }]) =>
        `<option value="${format}" ${format === "m4a" ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="row small"><span>所选总时长</span><strong id="selected">—</strong></div><button id="export" class="primary">导出并下载 ↓</button></fieldset><div id="result" hidden><strong>已导出片段</strong><div id="exportedFiles"></div><button id="share">分享 / 存储到文件</button></div></section><div class="note"><strong>◉ 你的小岛，不需要网络</strong><p>首次联网完成资源准备后，即可离线导入、剪切和导出。文件不会离开设备。浏览器清理缓存后需重新联网准备。</p><button id="retry" hidden>重新准备离线资源</button></div></aside></div><footer><span>SOUND ISLAND / 声音小岛</span><span>本地处理 · 无需登录 · 为随身创作而生</span></footer></main>`;
let engine,
  source,
  buffer,
  duration = 0,
  busy = false,
  generation = 0,
  jobStarted,
  ticker,
  previewNode,
  playbackRequest,
  context,
  installPrompt;
function say(message, error = false) {
  $("status").textContent = message;
  $("statusBox").classList.toggle("error", error);
}
function stopPreview() {
  cancelAnimationFrame(playbackRequest);
  if (previewNode) {
    previewNode.onended = null;
    previewNode.stop();
    previewNode = null;
  }
  $("preview").textContent = "▶ 试听";
}
function controls() {
  $("choose").disabled = busy;
  $("editor").disabled = busy || !buffer;
  $("settings").disabled = busy || !buffer;
  $("cancel").hidden = !busy;
}
function begin(message) {
  stopPreview();
  busy = true;
  generation++;
  jobStarted = Date.now();
  say(message);
  $("progress").hidden = false;
  $("progress").removeAttribute("value");
  ticker = setInterval(() => {
    $("elapsed").textContent =
      `已用 ${Math.floor((Date.now() - jobStarted) / 1000)} 秒 · 可随时取消`;
  }, 1000);
  controls();
  return generation;
}
function finish(id) {
  if (id !== generation) return;
  busy = false;
  clearInterval(ticker);
  $("progress").hidden = true;
  $("elapsed").textContent = "";
  controls();
}
function cancel(message = "已取消，可以重新选择文件或继续编辑。") {
  generation++;
  engine?.terminate();
  engine = null;
  busy = false;
  clearInterval(ticker);
  $("progress").hidden = true;
  $("elapsed").textContent = "";
  say(message);
  controls();
}
$("cancel").onclick = () => cancel();
async function getEngine(id) {
  if (engine?.loaded) return engine;
  const ff = new FFmpeg();
  engine = ff;
  ff.on("progress", ({ progress }) => {
    if (engine === ff && busy && Number.isFinite(progress))
      $("progress").value = Math.max(0, Math.min(0.99, progress));
  });
  const assets = await engineAssets();
  if (id !== generation) throw Error("cancelled");
  const [coreURL, wasmURL] = assets.map((asset) =>
    URL.createObjectURL(asset.blob),
  );
  try {
    await ff.load({ coreURL, wasmURL });
  } finally {
    URL.revokeObjectURL(coreURL);
    URL.revokeObjectURL(wasmURL);
  }
  if (id !== generation) throw Error("cancelled");
  return ff;
}
const results = [];
function clearResult() {
  for (const entry of results) URL.revokeObjectURL(entry.url);
  results.length = 0;
  $("exportedFiles").replaceChildren();
  $("result").hidden = true;
}
async function importFile(file) {
  if (!file || busy) return;
  try {
    validateFile(file);
  } catch (e) {
    say(e.message, true);
    return;
  }
  const id = begin("正在校验所选文件：准备本地引擎…");
  let ff;
  try {
    ff = await getEngine(id);
    await ff.createDir("/input");
    const mounted = await ff.mount(
      "WORKERFS",
      { blobs: [{ name: "media", data: file }] },
      "/input",
    );
    if (!mounted) throw Error("当前环境无法读取本地文件，请更换浏览器后重试。");
    const path = "/input/media";
    say("正在校验文件格式、音轨和解码支持…");
    await inspectAudio(ff, path);
    if (id !== generation) return;
    say("文件校验通过，正在提取完整音轨…");
    const code = await ff.exec(extractionArgs(path));
    await ff.unmount("/input");
    await ff.deleteDir("/input");
    if (code !== 0)
      throw Error("提取失败：解码过程中发现损坏数据，或设备可用内存不足。");
    const data = await ff.readFile("source.wav");
    if (id !== generation) return;
    await ff.deleteFile("source.wav");
    say("正在生成波形…");
    context ??= new AudioContext();
    const decoded = await context.decodeAudioData(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    if (id !== generation) return;
    source = data;
    buffer = decoded;
    duration = buffer.duration;
    $("filename").textContent = file.name;
    $("filename").title = file.name;
    $("duration").textContent = stamp(duration);
    reset(false);
    clearResult();
    draw();
    say("音轨已提取。点波形定位并添加关键帧，然后选择片段试听或导出。");
  } catch (e) {
    if (id === generation) {
      engine?.terminate();
      engine = null;
      say(
        e instanceof InvalidFileError || e.message?.startsWith("提取失败")
          ? e.message
          : "处理失败：请检查设备可用内存、文件读取权限及离线资源。可取消后重试；这不是文件大小或时长限制。",
        true,
      );
    }
  } finally {
    finish(id);
  }
}
$("choose").onclick = () => $("file").click();
$("file").onchange = (e) => {
  importFile(e.target.files[0]);
  e.target.value = "";
};
$("file").oncancel = () => say("已取消选择文件。");
for (const type of ["dragenter", "dragover"])
  $("drop").addEventListener(type, (e) => {
    e.preventDefault();
    $("drop").classList.add("drag");
  });
$("drop").ondragleave = () => $("drop").classList.remove("drag");
$("drop").ondrop = (e) => {
  e.preventDefault();
  $("drop").classList.remove("drag");
  importFile(e.dataTransfer.files[0]);
};
const timeline = mountTimeline(
  $,
  say,
  stopPreview,
  () => Boolean(buffer) && !busy,
);
function reset(notify = true) {
  stopPreview();
  timeline.reset(duration);
  $("gain").value = 1;
  $("gainLabel").textContent = "100%";
  $("fade").value = 0;
  $("reverse").checked = false;
  if (notify) say("编辑参数已重置，保留完整音轨。");
}
$("reset").onclick = () => reset();
$("gain").oninput = () => {
  $("gainLabel").textContent = `${Math.round($("gain").value * 100)}%`;
  say(`导出音量已设为 ${$("gainLabel").textContent}。`);
};
for (const key of ["fade", "reverse", "format"])
  $(key).onchange = () => say("导出设置已更新，导出后可试听效果。");
function draw() {
  const canvas = $("wave"),
    w = (canvas.width = Math.round(canvas.clientWidth * devicePixelRatio)),
    h = (canvas.height = 140 * devicePixelRatio),
    ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!buffer) return;
  const data = buffer.getChannelData(0),
    bars = Math.max(1, Math.floor(w / (5 * devicePixelRatio))),
    stride = Math.max(1, Math.floor(data.length / bars));
  ctx.fillStyle = "#80996b";
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (
      let j = i * stride;
      j < Math.min((i + 1) * stride, data.length);
      j += Math.max(1, Math.floor(stride / 100))
    )
      peak = Math.max(peak, Math.abs(data[j]));
    const height = Math.max(3, peak * h * 0.85);
    ctx.fillRect(
      (i * w) / bars,
      (h - height) / 2,
      2 * devicePixelRatio,
      height,
    );
  }
}
new ResizeObserver(draw).observe($("wave"));
$("preview").onclick = async () => {
  if (previewNode) {
    stopPreview();
    say("试听已停止。");
    return;
  }
  try {
    await context.resume();
    if (busy || previewNode) return;
    const { start, end } = timeline.previewRange();
    if (start >= end) {
      say("已到音轨末尾，请移动光标或点选片段重新试听。");
      return;
    }
    previewNode = context.createBufferSource();
    previewNode.buffer = buffer;
    previewNode.connect(context.destination);
    previewNode.onended = () => {
      cancelAnimationFrame(playbackRequest);
      timeline.locate(end);
      previewNode = null;
      say("已到片段末尾。");
      $("preview").textContent = "▶ 试听";
    };
    const beganAt = context.currentTime;
    const updateCursor = () => {
      timeline.locate(Math.min(end, start + context.currentTime - beganAt));
      playbackRequest = requestAnimationFrame(updateCursor);
    };
    previewNode.start(0, start, end - start);
    updateCursor();
    $("preview").textContent = "■ 停止";
    say(`从 ${stamp(start)} 试听至 ${stamp(end)}。`);
  } catch {
    say("无法播放，请重试或检查设备音频权限。", true);
  }
};
function downloadSegment(data, number, format, stampId) {
  const file = new File(
    [data],
    `sound-island-segment-${number}-${stampId}.${format}`,
    { type: exportFormats[format].mime },
  );
  const url = URL.createObjectURL(file);
  results.push({ file, url });
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.textContent = `下载片段 ${number}（${format.toUpperCase()}）`;
  const player = document.createElement("audio");
  player.controls = true;
  player.preload = "none";
  player.setAttribute("aria-label", `试听已导出片段 ${number}`);
  player.src = url;
  $("exportedFiles").append(link, player);
  $("result").hidden = false;
  link.click();
}
$("export").onclick = async () => {
  const ranges = timeline.selectedRanges();
  if (!ranges.length || busy) return;
  const settings = {
    gain: +$("gain").value,
    fade: +$("fade").value,
    reverse: $("reverse").checked,
    format: $("format").value,
  };
  const id = begin("正在准备导出…");
  const stampId = Date.now();
  let completed = 0;
  try {
    const ff = await getEngine(id);
    await ff.writeFile("source.wav", source.slice());
    const path = `export.${settings.format}`;
    for (const range of ranges) {
      if (id !== generation) return;
      $("progress").removeAttribute("value");
      say(`正在导出片段 ${range.number}（${completed + 1}/${ranges.length}）…`);
      const code = await ff.exec(exportArgs({ ...range, ...settings }));
      if (code !== 0) throw Error("encode");
      const data = await ff.readFile(path);
      await ff.deleteFile(path);
      if (id !== generation) return;
      if (!completed) clearResult();
      downloadSegment(data, range.number, settings.format, stampId);
      completed++;
    }
    await ff.deleteFile("source.wav");
    if (id === generation)
      say(
        `已导出 ${completed} 个文件并依次请求下载。若浏览器拦截连续下载，可点下方各片段的下载链接。`,
      );
  } catch {
    if (id === generation) {
      engine?.terminate();
      engine = null;
      say(
        `导出中断，本次已完成 ${completed}/${ranges.length} 个片段。可重新选择剩余片段后重试。`,
        true,
      );
    }
  } finally {
    finish(id);
  }
};
$("share").onclick = async () => {
  const files = results.map((entry) => entry.file);
  try {
    if (!navigator.canShare?.({ files })) {
      say("此浏览器不支持分享这些文件，请点各片段的下载链接。");
      return;
    }
    await navigator.share({ files, title: "Sound Island" });
    say("分享操作已完成。");
  } catch (e) {
    say(
      e.name === "AbortError"
        ? "已取消分享。"
        : "分享失败，请点各片段的下载链接。",
      e.name !== "AbortError",
    );
  }
};
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
});
$("install").onclick = async () => {
  if (installPrompt) {
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    say(
      result.outcome === "accepted"
        ? "已接受安装，请查看主屏幕。"
        : "已取消安装，仍可在浏览器中使用。",
    );
    installPrompt = null;
  } else {
    $("installHelp").hidden = !$("installHelp").hidden;
    $("installHelp").textContent =
      "iPhone / iPad：用 Safari 打开，点“分享”→“添加到主屏幕”。Android：在浏览器菜单中选择“安装应用”或“添加到主屏幕”。";
  }
};
async function setupOffline() {
  if (!("serviceWorker" in navigator)) {
    $("offline").textContent = "浏览器不支持离线缓存";
    $("retry").hidden = false;
    return;
  }
  let timer;
  try {
    $("offline").textContent = "正在缓存离线引擎（约 32 MB）";
    $("retry").hidden = true;
    const ready = (async () => {
      const reg =
        (await navigator.serviceWorker.getRegistration("./")) ||
        (await navigator.serviceWorker.register("./sw.js"));
      reg.update().catch(() => {});
      await navigator.serviceWorker.ready;
      const active = reg.active;
      if (!active) throw Error("no worker");
      return await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(
          () => reject(Error("cache check timeout")),
          10000,
        );
        channel.port1.onmessage = (e) => {
          clearTimeout(timeout);
          channel.port1.close();
          resolve(e.data.ready);
        };
        active.postMessage("CHECK_READY", [channel.port2]);
      });
    })();
    const [cached, assets] = await Promise.race([
      Promise.all([ready, engineAssets()]),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("timeout")), 210000);
      }),
    ]);
    if (!cached || !assets.every((asset) => asset.cached))
      throw Error("incomplete");
    $("offline").textContent = "● 离线资源已就绪";
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    $("offline").textContent = "离线资源未就绪";
    $("retry").hidden = false;
  } finally {
    clearTimeout(timer);
  }
}
$("retry").onclick = setupOffline;
setupOffline();
window.addEventListener("offline", () =>
  say("网络已断开；离线资源就绪后，所有编辑功能仍可使用。"),
);
window.addEventListener("online", () => say("网络已连接。"));
window.addEventListener("beforeunload", (e) => {
  if (busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
