import { stamp, validateRange } from "./edit.js";

export function mountTimeline($, say, stopPreview, editable) {
  let duration = 0,
    marks = [],
    selected = [true],
    active = -1,
    cursor = 0;
  const wave = $("timeline");
  function selectedRanges() {
    return selected.flatMap((checked, index) =>
      checked
        ? [
            {
              number: index + 1,
              start: marks[index - 1] ?? 0,
              end: marks[index] ?? duration,
            },
          ]
        : [],
    );
  }
  function locate(time) {
    cursor = Math.min(duration, Math.max(0, time));
    $("cursor").value = Number(cursor.toFixed(3));
    $("playhead").style.left = (100 * cursor) / duration + "%";
  }
  function render() {
    const bounds = [0, ...marks, duration];
    const segments = $("segments");
    while (segments.childElementCount > bounds.length - 1)
      segments.lastElementChild.remove();
    bounds.slice(1).forEach((end, i) => {
      let button = segments.children[i];
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.onclick = () => {
          stopPreview();
          selected[i] = !selected[i];
          if (selected[i]) locate(marks[i - 1] ?? 0);
          render();
          say(`已${selected[i] ? "选中" : "取消选择"}片段 ${i + 1}。`);
        };
        segments.append(button);
      }
      button.textContent = `片段 ${i + 1} · ${stamp(bounds[i])} – ${stamp(end)}`;
      button.setAttribute("aria-pressed", String(selected[i]));
    });
    const ranges = selectedRanges();
    $("selection").replaceChildren(
      ...ranges.map(({ start, end }) => {
        const highlight = document.createElement("span");
        highlight.className = "selection";
        highlight.style.left = (100 * start) / duration + "%";
        highlight.style.width = (100 * (end - start)) / duration + "%";
        return highlight;
      }),
    );
    $("selected").textContent = stamp(
      ranges.reduce((sum, r) => sum + r.end - r.start, 0),
    );
    $("export").textContent = ranges.length
      ? `依次导出 ${ranges.length} 个片段 ↓`
      : "请选择导出片段";
    $("export").disabled =
      !ranges.length ||
      ranges.some((r) => !validateRange(r.start, r.end, duration));
    $("preview").disabled = duration <= 0;
    $("markControls").hidden = !marks.length;
    const list = $("markList");
    while (list.childElementCount > marks.length)
      list.lastElementChild.remove();
    marks.forEach((time, i) => {
      let row = list.children[i];
      if (!row) {
        row = document.createElement("div");
        row.className = "mark-row";
        const label = document.createElement("label");
        label.htmlFor = `mark-time-${i}`;
        label.textContent = `关键帧 ${i + 1}（秒）`;
        const input = document.createElement("input");
        input.id = label.htmlFor;
        input.type = "number";
        input.step = "0.01";
        input.inputMode = "decimal";
        input.onfocus = () => selectMark(i);
        input.onchange = () => {
          active = i;
          move(input.valueAsNumber);
        };
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.setAttribute("aria-label", `删除关键帧 ${i + 1}`);
        remove.onclick = () => removeMark(i);
        row.append(label, input, remove);
        list.append(row);
      }
      row.classList.toggle("active", i === active);
      row.querySelector("input").value = time;
    });
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
      $("markList").children[active].querySelector("input").value =
        marks[active];
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
    selected.splice(i, 1, false, true);
    selectMark(i);
    say(`已添加关键帧，已选中片段 ${i + 2}。`);
  };
  function removeMark(index) {
    stopPreview();
    selected.splice(index, 2, selected[index] || selected[index + 1]);
    marks.splice(index, 1);
    active = Math.min(index, marks.length - 1);
    render();
    say(`已删除关键帧 ${index + 1}，并合并相邻片段。`);
  }
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
    selectedRanges,
    previewRange: () => ({
      start: cursor,
      end: marks.find((time) => time > cursor) ?? duration,
    }),
    locate,
    reset(length) {
      duration = length;
      marks = [];
      selected = [true];
      active = -1;
      $("cursor").max = duration;
      locate(0);
      render();
    },
  };
}
