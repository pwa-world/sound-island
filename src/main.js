import { FFmpeg } from "@ffmpeg/ffmpeg";
import { exportArgs, validateRange, stamp } from "./edit.js";
import "./style.css";
const $ = (id) => document.getElementById(id);
$("app").innerHTML =
  `<header><div class="brand"><img src="./icon.svg" alt="">Sound Island</div><div class="header-actions"><span id="offline" class="badge" role="status">正在准备离线资源…</span><button id="install">安装应用 ↗</button></div></header><main><section class="hero"><div><div class="eyebrow">YOUR POCKET AUDIO STUDIO</div><h1>留住声音，<em>随处创作。</em></h1><p>从一段视频，到一段属于你的声音。<br>提取、剪切、导出，在你的小岛上轻松完成。</p></div><div class="island" aria-hidden="true">${[24, 48, 76, 108, 85, 58, 30].map((h) => `<i style="--h:${h}px"></i>`).join("")}</div></section><div id="installHelp" class="install-help" hidden></div><div class="layout"><section class="card"><div class="section-title"><h2><span class="step">01</span>导入与剪切</h2><span class="small">文件仅在本机处理</span></div><div id="drop" class="drop"><div class="upload-symbol" aria-hidden="true">↥</div><div class="file-name" id="filename">把视频里的声音，带到这里</div><p>从相册或文件选择，也可以拖入视频</p><button id="choose" class="primary">＋ 选择视频 / 音频</button><input id="file" type="file" accept="video/*,audio/*,.mkv,.mov,.m4a" hidden><p class="small">MP4 · MOV · WebM · 常见音频格式<br>单文件 ≤ 150 MB · 音轨 ≤ 10 分钟</p></div><fieldset id="editor" disabled><div class="wave-wrap"><canvas id="wave" aria-label="音频波形"></canvas><div id="selection" class="selection"></div></div><div class="time-row"><span>00:00.0</span><span id="duration">等待导入</span></div><div class="fields"><label>起点（秒）<input id="start" type="number" min="0" step="0.1" value="0"><input id="startRange" aria-label="拖动剪切起点" type="range" min="0" step="0.1" value="0"></label><label>终点（秒）<input id="end" type="number" min="0" step="0.1" value="0"><input id="endRange" aria-label="拖动剪切终点" type="range" min="0" step="0.1" value="0"></label></div><div class="toolbar"><button id="preview">▶ 试听选区</button><button id="reset">↺ 重置编辑</button></div><p class="small">试听原始选区；音量、淡入淡出与倒放效果在导出结果中试听。</p></fieldset><div id="statusBox" class="status-box"><div><div id="status" role="status" aria-live="polite">准备好后，选择一个视频开始吧。</div><progress id="progress" hidden max="1"></progress><span id="elapsed" class="small"></span></div><button id="cancel" hidden>取消</button></div></section><aside><section class="card settings"><div class="section-title"><h2><span class="step">02</span>声音与导出</h2></div><fieldset id="settings" disabled><label>音量 <output id="gainLabel">100%</output><input id="gain" type="range" min="0" max="2" step="0.05" value="1"></label><label>淡入 / 淡出<select id="fade"><option value="0">无</option><option value="0.5">0.5 秒</option><option value="1">1 秒</option><option value="2">2 秒</option></select></label><label><input id="reverse" type="checkbox"> 倒放声音</label><div class="divider"></div><label>导出格式<select id="format"><option value="mp3">MP3 · 192 kbps · 更小体积</option><option value="wav">WAV · PCM · 无损编辑</option></select></label><div class="row small"><span>选区时长</span><strong id="selected">—</strong></div><button id="export" class="primary">导出音频 ↗</button></fieldset><div id="result" hidden><strong>你的声音，准备好了。</strong><audio id="outputAudio" controls></audio><a id="download" class="download">保存音频 ↓</a><button id="share">分享 / 存储到文件</button></div></section><div class="note"><strong>◉ 你的小岛，不需要网络</strong><p>首次联网完成资源准备后，即可离线导入、剪切和导出。文件不会离开设备。浏览器清理缓存后需重新联网准备。</p><button id="retry" hidden>重新准备离线资源</button></div></aside></div><footer><span>SOUND ISLAND / 声音小岛</span><span>本地处理 · 无需登录 · 为随身创作而生</span></footer></main>`;
let engine,
  source,
  buffer,
  duration = 0,
  busy = false,
  generation = 0,
  jobStarted,
  ticker,
  deadline,
  previewNode,
  context,
  resultURL,
  resultBlob,
  resultName,
  installPrompt;
function say(message, error = false) {
  $("status").textContent = message;
  $("statusBox").classList.toggle("error", error);
}
function stopPreview() {
  if (previewNode) {
    previewNode.stop();
    previewNode = null;
  }
  $("preview").textContent = "▶ 试听选区";
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
  deadline = setTimeout(
    () => cancel("处理超过 3 分钟，已停止。请尝试较短的视频。"),
    180000,
  );
  controls();
  return generation;
}
function finish(id) {
  if (id !== generation) return;
  busy = false;
  clearInterval(ticker);
  clearTimeout(deadline);
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
  clearTimeout(deadline);
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
  await ff.load({
    coreURL: new URL("engine/ffmpeg-core.js", document.baseURI).href,
    wasmURL: new URL("engine/ffmpeg-core.wasm", document.baseURI).href,
  });
  if (id !== generation) throw Error("cancelled");
  return ff;
}
function clearResult() {
  if (resultURL) URL.revokeObjectURL(resultURL);
  resultURL = null;
  resultBlob = null;
  $("outputAudio").pause();
  $("outputAudio").removeAttribute("src");
  $("result").hidden = true;
}
async function importFile(file) {
  if (!file || busy) return;
  if (file.size > 150 * 1024 * 1024) {
    say("文件超过 150 MB，请先选择较小的视频。", true);
    return;
  }
  const id = begin("正在启动本地音频引擎…");
  let ff;
  try {
    ff = await getEngine(id);
    say("正在读取文件…");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (id !== generation) return;
    const ext =
      file.name
        .split(".")
        .pop()
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8) || "bin";
    const path = `input.${ext}`;
    await ff.writeFile(path, bytes);
    say("正在提取音轨…");
    const code = await ff.exec([
      "-i",
      path,
      "-map",
      "0:a:0",
      "-vn",
      "-t",
      "601",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-c:a",
      "pcm_s16le",
      "source.wav",
    ]);
    await ff.deleteFile(path);
    if (code !== 0)
      throw Error("无法提取音轨：视频可能没有音轨，或编码不受支持。");
    const data = await ff.readFile("source.wav");
    if (id !== generation) return;
    say("正在生成波形…");
    context ??= new AudioContext();
    const decoded = await context.decodeAudioData(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
    if (id !== generation) return;
    if (decoded.duration > 600.05)
      throw Error("音轨超过 10 分钟，请选择较短的视频。");
    source = data;
    buffer = decoded;
    duration = buffer.duration;
    $("filename").textContent = file.name;
    $("duration").textContent = stamp(duration);
    for (const key of ["start", "end", "startRange", "endRange"])
      $(key).max = duration;
    reset(false);
    clearResult();
    draw();
    say("音轨已提取。调整起止时间后，可试听选区或导出。");
  } catch (e) {
    if (id === generation) {
      engine?.terminate();
      engine = null;
      say(
        e.message?.includes("音轨")
          ? e.message
          : "处理失败。请检查剩余内存、离线资源是否就绪，或换一个视频重试。",
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
function rangeValid() {
  return validateRange(+$("start").value, +$("end").value, duration);
}
function selection(notify = true) {
  stopPreview();
  const start = +$("start").value,
    end = +$("end").value;
  $("startRange").value = start;
  $("endRange").value = end;
  const valid = rangeValid();
  $("export").disabled = !valid;
  $("preview").disabled = !valid;
  $("selected").textContent = valid ? stamp(end - start) : "无效区间";
  $("selection").style.left =
    `${Math.max(0, Math.min(100, (start / duration) * 100))}%`;
  $("selection").style.width =
    `${Math.max(0, Math.min(100, ((end - start) / duration) * 100))}%`;
  if (notify)
    say(
      valid
        ? `选区已更新：${stamp(start)} → ${stamp(end)}`
        : "终点需大于起点至少 0.05 秒，且不能超出音轨。",
      !valid,
    );
}
for (const key of ["start", "end"]) {
  $(key).oninput = () => selection();
  $(key + "Range").oninput = (e) => {
    $(key).value = e.target.value;
    selection();
  };
}
function reset(notify = true) {
  $("start").value = 0;
  $("end").value = duration;
  $("gain").value = 1;
  $("gainLabel").textContent = "100%";
  $("fade").value = 0;
  $("reverse").checked = false;
  selection(false);
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
    previewNode = context.createBufferSource();
    previewNode.buffer = buffer;
    previewNode.connect(context.destination);
    previewNode.onended = () => {
      previewNode = null;
      $("preview").textContent = "▶ 试听选区";
    };
    previewNode.start(
      0,
      +$("start").value,
      +$("end").value - +$("start").value,
    );
    $("preview").textContent = "■ 停止试听";
    say("正在试听原始选区…");
  } catch {
    say("无法播放，请重试或检查设备音频权限。", true);
  }
};
$("export").onclick = async () => {
  if (!rangeValid() || busy) return;
  const id = begin("正在准备导出…");
  try {
    const ff = await getEngine(id);
    await ff.writeFile("source.wav", source);
    const options = {
      start: +$("start").value,
      end: +$("end").value,
      gain: +$("gain").value,
      fade: +$("fade").value,
      reverse: $("reverse").checked,
      format: $("format").value,
    };
    say("正在剪切并编码音频…");
    const code = await ff.exec(exportArgs(options));
    if (code !== 0) throw Error("encode");
    const data = await ff.readFile(`export.${options.format}`);
    await ff.deleteFile(`export.${options.format}`);
    if (id !== generation) return;
    clearResult();
    resultBlob = new Blob([data], {
      type: options.format === "mp3" ? "audio/mpeg" : "audio/wav",
    });
    resultName = `sound-island-${Date.now()}.${options.format}`;
    resultURL = URL.createObjectURL(resultBlob);
    $("outputAudio").src = resultURL;
    $("download").href = resultURL;
    $("download").download = resultName;
    $("result").hidden = false;
    say(
      `导出完成 · ${(resultBlob.size / 1024 / 1024).toFixed(2)} MB。请保存到设备。`,
    );
  } catch {
    if (id === generation) {
      engine?.terminate();
      engine = null;
      say("导出失败，请尝试较短选区或 WAV 格式。", true);
    }
  } finally {
    finish(id);
  }
};
$("download").onclick = () =>
  say("已请求保存音频；若浏览器打开预览，请使用分享菜单存储到文件。");
$("share").onclick = async () => {
  try {
    const file = new File([resultBlob], resultName, { type: resultBlob.type });
    if (!navigator.canShare?.({ files: [file] })) {
      say("此浏览器不支持文件分享，请使用“保存音频”。");
      return;
    }
    await navigator.share({ files: [file], title: "Sound Island" });
    say("分享操作已完成。");
  } catch (e) {
    say(
      e.name === "AbortError" ? "已取消分享。" : "分享失败，请使用“保存音频”。",
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
    const cached = await Promise.race([
      ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("timeout")), 120000);
      }),
    ]);
    if (!cached) throw Error("incomplete");
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
