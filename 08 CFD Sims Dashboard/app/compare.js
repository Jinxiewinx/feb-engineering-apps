/* compare.js — lay two reports over each other and show what moved.

   Three modes, one rendering path. Both panels are drawn to offscreen canvases
   at identical size first, which is what makes them comparable at all, then
   composited:

   - Blend    fade between A and B. Good for "did the shock move".
   - Swipe    a draggable divider, A on the left, B on the right. Good for
              judging a boundary because the eye is very good at spotting a
              discontinuity across a straight edge.
   - Diff     per-pixel absolute difference, amplified. Good for "is anything
              different at all", which is often the real question.

   The difference is computed by hand rather than with a canvas blend mode
   because we also want the number: what fraction of the panel actually changed.
   Two identical reports must come out at exactly 0.00%, which doubles as a
   correctness check on the whole alignment and rendering path. */

import { S, el, esc, panelRows, currentRow, selectPanel, syncUrl } from "./core.js";
import { renderPanel, panelRange, jointCrop } from "./render.js";

const MODES = [
  ["diff", "Difference"],
  ["blend", "Blend"],
  ["swipe", "Swipe"],
];

export function renderOverlay(main) {
  const ready = S.docs.filter(d => d.index);
  if (ready.length < 2) {
    main.appendChild(el("div", "empty", `<div class="empty-card">Open a second report to overlay.</div>`));
    return;
  }
  if (S.overlay.a >= ready.length) S.overlay.a = 0;
  if (S.overlay.b >= ready.length) S.overlay.b = 1;

  const rows = panelRows();
  const row = currentRow();

  /* ---- toolbar ---- */
  const bar = el("div", "ovbar");

  const sel = el("select");
  for (const r of rows) {
    const o = el("option", "", esc(r.name) + (r.section ? "  ·  " + esc(r.section) : ""));
    o.value = r.id;
    if (row && r.id === row.id) o.selected = true;
    sel.appendChild(o);
  }
  sel.onchange = () => selectPanel(sel.value, { stay: true });
  bar.appendChild(sel);

  const seg = el("div", "seg");
  for (const [id, label] of MODES) {
    const b = el("button", S.overlay.mode === id ? "active" : "", label);
    b.onclick = () => { S.overlay.mode = id; renderOverlayStage(); syncUrl(); };
    seg.appendChild(b);
  }
  bar.appendChild(seg);

  const pick = (which) => {
    const s = el("select");
    ready.forEach((d, i) => {
      const o = el("option", "", esc(d.name));
      o.value = i;
      if (S.overlay[which] === i) o.selected = true;
      s.appendChild(o);
    });
    s.onchange = () => { S.overlay[which] = +s.value; renderOverlayStage(); syncUrl(); };
    return s;
  };
  const pairing = el("label", "", "");
  pairing.appendChild(document.createTextNode("A"));
  pairing.appendChild(pick("a"));
  pairing.appendChild(document.createTextNode("B"));
  pairing.appendChild(pick("b"));
  bar.appendChild(pairing);

  const ctrl = el("label", "", "");
  bar.appendChild(ctrl);
  const legend = el("div", "ovlegend");
  bar.appendChild(legend);
  main.appendChild(bar);

  const stage = el("div", "ovstage");
  main.appendChild(stage);

  /* Each call bumps the generation; a render that finishes after a newer one
     started (a quick A/B or mode change) is dropped instead of painted over
     the newer result. */
  let gen = 0;
  async function renderOverlayStage() {
    const my = ++gen;
    // Rebuild the mode buttons' active state without rebuilding the toolbar.
    [...seg.children].forEach((b, i) => b.classList.toggle("active", MODES[i][0] === S.overlay.mode));
    ctrl.innerHTML = "";
    legend.innerHTML = "";
    if (!stage.querySelector(".ovhold")) stage.innerHTML = `<div class="ovskel skel-block"></div>`;
    else stage.classList.add("busy");

    const r = currentRow();
    const A = ready[S.overlay.a], B = ready[S.overlay.b];
    const pa = r && r.cells[ready.indexOf(A)];
    const pb = r && r.cells[ready.indexOf(B)];
    if (!pa || !pb) {
      stage.classList.remove("busy");
      stage.innerHTML = `<div class="absent" style="color:var(--muted);padding:40px">
        This panel is not in both reports, so there is nothing to overlay.</div>`;
      return;
    }

    const width = Math.min(1100, Math.max(360, stage.clientWidth - 40));

    /* Both panels are rendered over the same strip range and then cropped with
       one shared box. Independent ranges or independent crops would offset the
       two images by a few points, and the difference view would report that
       offset as change across the entire panel. */
    const ra = panelRange(pa), rb = panelRange(pb);
    const rangeHeight = Math.max(ra.height, rb.height);
    let ca, cb;
    try {
      const [ra0, rb0] = await Promise.all([
        renderPanel(A, pa, width, { range: { absY: ra.absY, height: rangeHeight } }),
        renderPanel(B, pb, width, { range: { absY: rb.absY, height: rangeHeight } }),
      ]);
      if (my !== gen) return;
      [ca, cb] = jointCrop([ra0, rb0], rangeHeight).canvases.map(copyCanvas);
    } catch (e) {
      if (my !== gen) return;
      stage.classList.remove("busy");
      stage.innerHTML = `<div class="absent" style="color:var(--bad);padding:40px">Could not render this panel: ${esc(e?.message || e)}</div>`;
      return;
    }
    stage.classList.remove("busy");

    const W = Math.min(ca.width, cb.width), H = Math.min(ca.height, cb.height);
    const cssH = H / (ca.width / width);
    const hold = el("div", "ovhold");
    hold.style.width = width + "px";
    hold.style.height = cssH + "px";
    for (const c of [ca, cb]) { c.style.width = width + "px"; c.style.height = (c.height / (c.width / width)) + "px"; }
    stage.innerHTML = "";
    stage.appendChild(hold);

    /* What Export PNG saves: the view as it is, composited on demand. */
    let exportCanvas = () => ca;

    if (S.overlay.mode === "blend") {
      /* Two stacked canvases, B's opacity on the slider: the compositor does
         the blend, nothing is repainted per step. */
      cb.classList.add("ovtop");
      hold.append(ca, cb);
      const slider = el("input");
      slider.type = "range"; slider.min = 0; slider.max = 1; slider.step = 0.01; slider.value = S.overlay.blend;
      slider.setAttribute("aria-label", "Blend between A and B");
      const paintBlend = () => { cb.style.opacity = S.overlay.blend; legendBlend(); };
      slider.oninput = () => { S.overlay.blend = +slider.value; paintBlend(); };
      ctrl.appendChild(document.createTextNode("A"));
      ctrl.appendChild(slider);
      ctrl.appendChild(document.createTextNode("B"));
      const legendBlend = () => {
        legend.innerHTML = `<span><b style="color:${A.color}">${esc(A.name)}</b> ${Math.round((1 - S.overlay.blend) * 100)}%</span>
          <span><b style="color:${B.color}">${esc(B.name)}</b> ${Math.round(S.overlay.blend * 100)}%</span>`;
        legend.appendChild(save);
      };
      exportCanvas = () => compose(W, H, (x) => { x.drawImage(ca, 0, 0); x.globalAlpha = S.overlay.blend; x.drawImage(cb, 0, 0); });
      paintBlend();

    } else if (S.overlay.mode === "swipe") {
      /* B on top of A, clipped from the divider rightwards with clip-path. */
      cb.classList.add("ovtop");
      hold.append(ca, cb);
      const div = el("div", "divider");
      div.setAttribute("role", "slider"); div.setAttribute("aria-label", "Swipe between A and B"); div.tabIndex = 0;
      hold.appendChild(div);
      let frame = 0;
      const paintSwipe = () => {
        frame = 0;
        const pct = S.overlay.swipe * 100;
        cb.style.clipPath = `inset(0 0 0 ${pct}%)`;
        div.style.left = pct + "%";
        div.setAttribute("aria-valuenow", Math.round(pct));
      };
      const onMove = ev => {
        const rect = hold.getBoundingClientRect();
        const px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
        S.overlay.swipe = Math.max(0, Math.min(1, px / rect.width));
        if (!frame) frame = requestAnimationFrame(paintSwipe);
      };
      const start = ev => {
        ev.preventDefault();
        onMove(ev);
        const stop = () => { removeEventListener("mousemove", onMove); removeEventListener("mouseup", stop); };
        addEventListener("mousemove", onMove); addEventListener("mouseup", stop);
      };
      div.addEventListener("mousedown", start);
      hold.addEventListener("mousedown", start);
      /* Touch: passive is off so the drag does not also scroll the page. */
      const tstart = ev => {
        ev.preventDefault();
        onMove(ev);
        const tstop = () => { removeEventListener("touchmove", onMove); removeEventListener("touchend", tstop); removeEventListener("touchcancel", tstop); };
        addEventListener("touchmove", onMove, { passive: false }); addEventListener("touchend", tstop); addEventListener("touchcancel", tstop);
      };
      div.addEventListener("touchstart", tstart, { passive: false });
      hold.addEventListener("touchstart", tstart, { passive: false });
      div.onkeydown = e => {
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === "ArrowLeft") S.overlay.swipe = Math.max(0, S.overlay.swipe - step);
        else if (e.key === "ArrowRight") S.overlay.swipe = Math.min(1, S.overlay.swipe + step);
        else return;
        e.preventDefault(); paintSwipe();
      };
      legend.innerHTML = `<span>left <b style="color:${A.color}">${esc(A.name)}</b></span>
        <span>right <b style="color:${B.color}">${esc(B.name)}</b></span><span>drag the divider</span>`;
      exportCanvas = () => compose(W, H, (x) => {
        x.drawImage(ca, 0, 0);
        const sx = Math.round(W * S.overlay.swipe);
        x.drawImage(cb, sx, 0, W - sx, H, sx, 0, W - sx, H);
      });
      paintSwipe();

    } else {
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      out.style.width = width + "px"; out.style.height = cssH + "px";
      hold.appendChild(out);
      const ctx = out.getContext("2d");
      const slider = el("input");
      slider.type = "range"; slider.min = 1; slider.max = 20; slider.step = 1; slider.value = S.overlay.amp;
      slider.setAttribute("aria-label", "Amplify the difference");
      ctrl.appendChild(document.createTextNode("Amplify"));
      ctrl.appendChild(slider);

      // Read each canvas's pixels directly rather than drawing both onto one
      // scratch canvas and reading it back twice. That round-trip added a
      // couple of least-significant-bit differences on a GPU-backed canvas, so
      // two identical reports read as "0.00% differ" instead of identical.
      const readCanvas = (cv) => {
        if (cv.width === W && cv.height === H) return cv.getContext("2d").getImageData(0, 0, W, H);
        const t = document.createElement("canvas");
        t.width = W; t.height = H;
        const tc = t.getContext("2d", { willReadFrequently: true });
        tc.drawImage(cv, 0, 0);
        return tc.getImageData(0, 0, W, H);
      };
      const a = readCanvas(ca).data, b = readCanvas(cb).data;

      /* The per-pixel difference, the changed count and the peak do not
         depend on the amplify setting, so they are computed once. Moving the
         slider then only maps each difference through a 766-entry colour
         table into the same ImageData, once per frame at most. */
      const n = W * H;
      const diff = new Uint16Array(n);
      let changed = 0, peak = 0;
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        diff[p] = d;
        if (d > 8) changed++;
        if (d > peak) peak = d;
      }
      const img = ctx.createImageData(W, H);
      const o32 = new Uint32Array(img.data.buffer);
      const lut = new Uint32Array(766);
      const le = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
      let frame = 0;
      const paintDiff = () => {
        frame = 0;
        const amp = S.overlay.amp;
        for (let d = 0; d < 766; d++) {
          const v = Math.min(255, d * amp / 3);
          // Unchanged pixels stay near-white so the plot's own geometry is still
          // faintly readable; changes burn in as dark heat.
          const R = 255 - v | 0, G = 255 - v * 0.72 | 0, Bc = 255 - v * 0.25 | 0;
          lut[d] = le ? (255 << 24 | Bc << 16 | G << 8 | R) >>> 0 : (R << 24 | G << 16 | Bc << 8 | 255) >>> 0;
        }
        for (let p = 0; p < n; p++) o32[p] = lut[diff[p]];
        ctx.putImageData(img, 0, 0);
      };
      slider.oninput = () => { S.overlay.amp = +slider.value; if (!frame) frame = requestAnimationFrame(paintDiff); };
      const pct = (changed / n) * 100;
      const same = changed === 0;
      legend.innerHTML =
        `<span class="diffstat ${same ? "same" : "diff"}">${same ? "identical" : pct.toFixed(2) + "% of pixels differ"}</span>
         <span>peak Δ ${peak}</span>
         <span><b style="color:${A.color}">${esc(A.name)}</b> vs <b style="color:${B.color}">${esc(B.name)}</b></span>`;
      // Exposed for the browser-driven checks: identical inputs must be 0.
      window.__lastDiff = { changed, total: n, pct, peak };
      exportCanvas = () => out;
      paintDiff();
    }

    legend.appendChild(save);
    save.onclick = () => {
      const x = exportCanvas();
      x.toBlob(blob => {
        if (!blob) return;
        const a = document.createElement("a");
        a.download = `${r.name}-${A.name}-vs-${B.name}-${S.overlay.mode}.png`;
        a.href = URL.createObjectURL(blob);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    };
  }
  const save = el("button", "ghost", "Export PNG");

  renderOverlayStage();
}

/* A private copy of a canvas: what render.js hands out may be the cached
   original, which other views also show, and this view restyles and stacks
   its canvases. */
function copyCanvas(c) {
  const out = document.createElement("canvas");
  out.width = c.width; out.height = c.height;
  const x = out.getContext("2d", { alpha: false, willReadFrequently: true });
  x.drawImage(c, 0, 0);
  return out;
}
function compose(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d", { alpha: false });
  x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
  draw(x);
  return c;
}
