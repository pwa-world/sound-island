import { stamp, validateRange } from "./edit.js";

export function mountTimeline($, say, stopPreview, editable) {
  let duration = 0,
    marks = [],
    selected = 0,
    active = -1,
    cursor = 0;
  const wave = $("timeline");
  function range() {
    return {
      start: marks[selected - 1] ?? 0,
      end: marks[selected] ?? duration,
    };
  }
  function locate(time) {
    cursor = Math.min(duration, Math.max(0, time));
    $("cursor").value = Number(cursor.toFixed(3));
    $("playhead").style.left = (100 * cursor) / duration + "%";
  }
  function render() {
    const bounds = [0, ...marks, duration];
    $("segment").replaceChildren(
      ...bounds
        .slice(1)
        .map(
          (end, i) =>
            new Option(
              `片段 ${i + 1} · ${stamp(bounds[i])} – ${stamp(end)}`,
              i,
            ),
        ),
    );
    $("segment").value = selected;
    const { start, end } = range();
    $("selection").style.left = (100 * start) / duration + "%";
    $("selection").style.width = (100 * (end - start)) / duration + "%";
    $("selected").textContent = stamp(end - start);
    $("export").textContent = `导出片段 ${selected + 1} 并下载 ↓`;
    $("preview").disabled = $("export").disabled = !validateRange(
      start,
      end,
      duration,
    );
    $("markControls").hidden = !marks.length;
    $("markList").replaceChildren(
      ...marks.map((t, i) => new Option(`关键帧 ${i + 1} · ${stamp(t)}`, i)),
    );
    $("markList").value = active;
    $("markTime").value = marks[active] ?? "";
    $("markers").replaceChildren(
      ...marks.map((time, i) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "keyframe";
        marker.dataset.index = i;
        marker.setAttribute("aria-label", `关键帧 ${i + 1}，${time} 秒`);
        marker.setAttribute("aria-pressed", String(i === active));
        marker.textContent = i + 1;
        marker.style.left = (100 * time) / duration + "%";
        return marker;
      }),
    );
  }
  function selectMark(index) {
    stopPreview();
    active = index;
    locate(marks[index]);
    render();
  }
  function allowed(time, previous, next) {
    return (
      validateRange(previous, time, duration) &&
      validateRange(time, next, duration)
    );
  }
  function move(time) {
    const previous = marks[active - 1] ?? 0,
      next = marks[active + 1] ?? duration;
    if (!allowed(time, previous, next)) {
      $("markTime").value = marks[active];
      say("关键帧须位于相邻边界之间，各片段至少保留 0.05 秒。", true);
      return;
    }
    stopPreview();
    marks[active] = time;
    locate(time);
    render();
    say(`关键帧 ${active + 1} 已移至 ${time.toFixed(2)} 秒。`);
  }
  $("cursor").onchange = () => {
    stopPreview();
    const time = $("cursor").valueAsNumber;
    if (!Number.isFinite(time) || time < 0 || time > duration) {
      locate(cursor);
      say("定位时间须在音轨内。", true);
      return;
    }
    locate(time);
  };
  $("addMark").onclick = () => {
    let i = marks.findIndex((t) => t >= cursor);
    if (i < 0) i = marks.length;
    if (!allowed(cursor, marks[i - 1] ?? 0, marks[i] ?? duration)) {
      say("请在片段内部定位，新关键帧与两边至少相距 0.05 秒。", true);
      return;
    }
    stopPreview();
    marks.splice(i, 0, cursor);
    selected = i + 1;
    selectMark(i);
    say(`已添加关键帧，当前选中片段 ${selected + 1}。`);
  };
  $("removeMark").onclick = () => {
    stopPreview();
    if (selected > active) selected--;
    marks.splice(active, 1);
    active = Math.min(active, marks.length - 1);
    render();
    say("已删除关键帧，并合并相邻片段。");
  };
  $("markList").onchange = () => selectMark(Number($("markList").value));
  $("markTime").onchange = () => move($("markTime").valueAsNumber);
  $("segment").onchange = () => {
    stopPreview();
    selected = Number($("segment").value);
    locate(range().start);
    render();
    say(`已选中片段 ${selected + 1}。`);
  };
  function waveTime(event) {
    const rect = wave.getBoundingClientRect();
    return Math.min(
      duration,
      Math.max(
        0,
        Math.round(
          ((event.clientX - rect.left) / rect.width) * duration * 100,
        ) / 100,
      ),
    );
  }
  let drag = null;
  wave.onpointerdown = (event) => {
    if (!editable() || !event.isPrimary || event.button !== 0) return;
    const marker = event.target.closest(".keyframe");
    stopPreview();
    wave.setPointerCapture(event.pointerId);
    if (marker) {
      selectMark(Number(marker.dataset.index));
      drag = { index: active, x: event.clientX };
    } else {
      drag = { index: -1 };
      locate(waveTime(event));
    }
  };
  wave.onpointermove = (event) => {
    if (!drag || !wave.hasPointerCapture(event.pointerId)) return;
    if (drag.index < 0) {
      locate(waveTime(event));
      return;
    }
    if (Math.abs(event.clientX - drag.x) < 2) return;
    const t = waveTime(event);
    if (allowed(t, marks[active - 1] ?? 0, marks[active + 1] ?? duration))
      move(t);
  };
  wave.onlostpointercapture = () => {
    drag = null;
  };
  wave.onclick = (event) => {
    const marker = event.target.closest(".keyframe");
    if (editable() && marker && event.detail === 0)
      selectMark(Number(marker.dataset.index));
  };
  return {
    range,
    locate,
    reset(length) {
      duration = length;
      marks = [];
      selected = 0;
      active = -1;
      $("cursor").max = duration;
      locate(0);
      render();
    },
  };
}
