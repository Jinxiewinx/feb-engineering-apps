/* pages.js — the side-by-side page view and its scroll sync.

   Sync is done in STRIP coordinates (PDF points from the top of page 1), not in
   pixels. Two reports rendered at different column widths have different pixel
   heights, so matching scrollTop directly would drift apart the further down you
   go. Converting to points and back keeps them locked wherever you are, and
   keeps working if the columns are ever different widths.

   The lock is a toggle rather than a mode: unlock to scroll one report on its
   own, then Re-sync snaps everything back to whichever column you last touched.
   That is the "look at this one bit closer, then carry on together" move.

   Zoom is a gesture, not a stream of relayouts (2026-09-24). While a pinch is
   in flight the strip is scaled with a CSS transform about the point under the
   fingers, which the compositor does without touching layout or pdf.js; 120 ms
   after the last wheel event the zoom is committed once: boxes resized, scroll
   anchored, and only then are the visible pages re-rasterised at the new
   size. Renders that a later zoom overtakes are cancelled, and a render only
   lands if the scale it was asked for is still the scale wanted. */

import { S, el, esc } from "./core.js";
import { renderRange, panelRange, isCancel } from "./render.js";

const COL_GAP = 22;              // page margin inside a column
const SETTLE_MS = 120;           // quiet time that ends a pinch
const KEEP_SCREENS = 3;          // canvases further away than this are dropped from the DOM
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let cols = [];                   // { doc, scroller, strip, scale, zoom, slots, width }
let leader = 0;                  // last column the user actually scrolled
let quietUntil = 0;              // programmatic smooth scroll in flight: do not mirror
let mirrorFrame = 0;

export function setSync(on) {
  S.sync = on;
  if (on) resyncColumns();
}

/* Re-sync realigns the columns AND turns tracking back on. Matching them once
   and leaving them loose was the old behaviour, and it was useless: the very
   next scroll pulled them apart again. "Snap back to tracking" is one action. */
export function resyncAndLock() {
  S.sync = true;
  matchZoomToLeader();
  resyncColumns();
}

/* Strip position currently at the top of a column's viewport. */
function stripTop(c) {
  return (c.scroller.scrollTop - COL_GAP) / c.scale;
}
/* Programmatic scrolls record what they wrote, so the scroll event they cause
   is recognised as an echo and not mistaken for the user taking the lead. */
function setTop(c, top) {
  if (Math.abs(c.scroller.scrollTop - top) < 1) return;
  c.scroller.scrollTop = top;
  c.expect = c.scroller.scrollTop;
}
function scrollToStrip(c, absY, smooth) {
  const top = absY * c.scale + COL_GAP;
  if (smooth && !reduceMotion()) {
    quietUntil = performance.now() + 900;
    c.scroller.scrollTo({ top, behavior: "smooth" });
  } else setTop(c, top);
}

export function resyncColumns() {
  if (!cols.length) return;
  const src = cols[Math.min(leader, cols.length - 1)];
  const y = stripTop(src);
  for (const c of cols) if (c !== src) { scrollToStrip(c, y); requestDraw(c); }
}

export function scrollToPanel(panelId) {
  for (const c of cols) {
    const p = c.doc.index.panels.find(q => q.id === panelId);
    if (!p) continue;
    scrollToStrip(c, p.absY - 10, true);
    markPanel(c, p);
    requestDraw(c);
  }
}

/* Flash a box around the panel that was jumped to. In a wall of near-identical
   contour plots, "it scrolled somewhere" is not the same as "I can see it". */
function markPanel(c, panel) {
  c.strip.querySelectorAll(".panelmark").forEach(n => n.remove());
  const r = panelRange(panel);
  const box = el("div", "panelmark");
  box.style.top = (r.absY * c.scale + COL_GAP) + "px";
  box.style.height = (r.height * c.scale) + "px";
  c.strip.appendChild(box);
  setTimeout(() => box.classList.add("fade"), 1400);
  setTimeout(() => box.remove(), 2100);
}

export function renderPages(main) {
  for (const c of cols) { c.ro?.disconnect(); abortAll(c); }
  cols = [];
  const wrap = el("div", "vcols");
  const ready = S.docs.filter(d => d.index);

  for (const doc of ready) {
    const col = el("div", "vcol");
    col.innerHTML = `<div class="vcol-h">
      <span class="swatch" style="background:${doc.color}"></span>
      <span class="nm">${esc(doc.name)}</span>
      <span class="meta">${doc.index.numPages} pages</span>
    </div>`;

    const scroller = el("div", "scroller");
    const strip = el("div", "strip");
    scroller.appendChild(strip);
    col.appendChild(scroller);
    wrap.appendChild(col);

    cols.push({ doc, scroller, strip, scale: 1, zoom: S.fit ? 1 : S.zoom, slots: [], width: 0 });
  }
  main.appendChild(wrap);

  // Width is known only once the columns are in the DOM.
  for (const c of cols) {
    c.width = c.scroller.clientWidth;
    c.scale = fitScale(c) * c.zoom;
    buildStrip(c);
  }

  for (const [i, c] of cols.entries()) {
    /* Trackpad pinch arrives as a wheel event with ctrlKey set, which is the
       only signal Chromium gives for it. Cmd-scroll is handled too since that
       is the other habit people have. preventDefault stops the browser zooming
       the whole UI out from under the app. */
    c.scroller.addEventListener("wheel", (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      /* A trackpad pinch sends a stream of small deltas; a mouse wheel with ctrl
         held sends one of about 120. Clamping per event keeps the pinch smooth
         without letting a single wheel notch jump three times the scale. */
      const d = Math.max(-25, Math.min(25, e.deltaY));
      pinch(c, Math.exp(-d * 0.01), e.clientX, e.clientY);
    }, { passive: false });

    c.scroller.addEventListener("scroll", () => {
      if (c.expect != null && Math.abs(c.scroller.scrollTop - c.expect) <= 1) {
        c.expect = null;                         // our own write coming back
        requestDraw(c);
        return;
      }
      c.expect = null;
      requestDraw(c);
      if (performance.now() < quietUntil) return;
      leader = i;
      S.pagesPos = { y: stripTop(c), panelId: S.panelId };
      if (S.sync && cols.length > 1) requestMirror(c);
    }, { passive: true });

    /* The column changed width (window resize, side panel, a column added):
       rescale in place around the top of the view, no rebuild. */
    c.ro = new ResizeObserver(() => {
      const w = c.scroller.clientWidth;
      if (!w || w === c.width) return;
      clearTimeout(c.resizeTimer);
      c.resizeTimer = setTimeout(() => {
        const y = stripTop(c);
        c.width = c.scroller.clientWidth;
        c.scale = fitScale(c) * c.zoom;
        rescaleStrip(c);
        setTop(c, y * c.scale + COL_GAP);
        requestDraw(c);
      }, 100);
    });
    c.ro.observe(c.scroller);
  }

  // Restore where the user was, so switching tabs is not a reset: the last
  // scroll position, unless a different panel was picked since.
  const pos = S.pagesPos;
  const p = S.panelId && ready[0]?.index.panels.find(q => q.id === S.panelId);
  if (pos && pos.panelId === S.panelId) for (const c of cols) setTop(c, pos.y * c.scale + COL_GAP);
  else if (p) for (const c of cols) scrollToStrip(c, p.absY - 10);
  cols.forEach(draw);
}

/* Mirror the leader's position onto the other columns once per frame. */
function requestMirror(src) {
  cancelAnimationFrame(mirrorFrame);
  mirrorFrame = requestAnimationFrame(() => {
    const y = stripTop(src);
    for (const o of cols) if (o !== src) { setTop(o, y * o.scale + COL_GAP); requestDraw(o); }
  });
}

function requestDraw(c) {
  if (c.drawFrame) return;
  c.drawFrame = requestAnimationFrame(() => { c.drawFrame = 0; draw(c); });
}

/* ---------- zoom ---------- */

/* Base scale that makes a page exactly fit the column width. */
function fitScale(c) {
  const avail = (c.width || c.scroller.clientWidth) - COL_GAP * 2;
  return avail / c.doc.index.pages[0].width;
}

const clampZoom = (z) => Math.max(0.15, Math.min(6, z));

/* One wheel event of a pinch. Accumulates, previews with a transform once per
   frame, and commits after SETTLE_MS of quiet. */
function pinch(originCol, factor, clientX, clientY) {
  const targets = S.sync ? cols : [originCol];
  for (const c of targets) {
    if (!c.gesture) {
      const r = c.strip.getBoundingClientRect();
      const sr = c.scroller.getBoundingClientRect();
      c.gesture = { zoom0: c.zoom, factor: 1, ox: clientX - r.left, oy: clientY - r.top, vx: clientX - sr.left, vy: clientY - sr.top };
      c.strip.style.transformOrigin = `${c.gesture.ox}px ${c.gesture.oy}px`;
      c.strip.style.willChange = "transform";
      abortAll(c);
    }
    const g = c.gesture;
    g.factor = clampZoom(g.zoom0 * g.factor * factor) / g.zoom0;
    clearTimeout(g.settle);
    g.settle = setTimeout(() => commitPinch(c), SETTLE_MS);
    if (!g.frame) g.frame = requestAnimationFrame(() => {
      g.frame = 0;
      c.strip.style.transform = `scale(${g.factor})`;
    });
  }
  S.zoom = originCol.gesture.zoom0 * originCol.gesture.factor;
  S.fit = false;
  notifyZoom();
}

function commitPinch(c) {
  const g = c.gesture;
  if (!g) return;
  cancelAnimationFrame(g.frame);
  c.gesture = null;
  c.strip.style.transform = "";
  c.strip.style.willChange = "";
  applyZoom(c, g.zoom0 * g.factor, g.vx, g.vy);
}

/* Set a column's zoom, keeping the content under viewport point (vx, vy) put. */
function applyZoom(c, zoom, vx, vy) {
  const s0 = c.scale;
  const p0 = c.slots[0] ? parseFloat(c.slots[0].box.style.left) : COL_GAP;
  const ax = (c.scroller.scrollLeft + vx - p0) / s0;       // points from the page's left edge
  const ay = (c.scroller.scrollTop + vy - COL_GAP) / s0;   // strip points
  c.zoom = clampZoom(zoom);
  c.scale = fitScale(c) * c.zoom;
  rescaleStrip(c);
  const p1 = c.slots[0] ? parseFloat(c.slots[0].box.style.left) : COL_GAP;
  c.scroller.scrollLeft = Math.max(0, ax * c.scale + p1 - vx);
  setTop(c, ay * c.scale + COL_GAP - vy);
  draw(c);
}

/* Resize the existing boxes to the new scale without rebuilding. Canvases
   stretch to fill (soft for a moment) until the sharp render replaces them. */
function rescaleStrip(c) {
  const colW = c.width || c.scroller.clientWidth;
  for (const s of c.slots) {
    const p = c.doc.index.pages[s.page - 1];
    const cH = p.cHeight != null ? p.cHeight : p.height;
    const cy = p.cy != null ? p.cy : p.absY;
    const w = p.width * c.scale, h = cH * c.scale;
    const y = cy * c.scale + COL_GAP;
    const left = Math.max(COL_GAP, (colW - w) / 2);
    s.y = y; s.h = h;
    s.box.style.top = y + "px"; s.box.style.left = left + "px";
    s.box.style.width = w + "px"; s.box.style.height = h + "px";
  }
  const last = c.slots[c.slots.length - 1];
  c.strip.style.height = (last ? last.y + last.h : 0) + COL_GAP + "px";
  c.strip.style.width = Math.max(colW, (c.slots[0] ? parseFloat(c.slots[0].box.style.width) : 0) + COL_GAP * 2) + "px";
}

/* Notifies core.js so the zoom readout in the toolbar stays truthful. Once
   per frame at most; it only sets a label. */
let onZoomChange = null, zoomFrame = 0;
export function setZoomListener(fn) { onZoomChange = fn; }
function notifyZoom() {
  if (zoomFrame || typeof onZoomChange !== "function") return;
  zoomFrame = requestAnimationFrame(() => { zoomFrame = 0; onZoomChange(); });
}

/* Buttons and keys: zoom every column when tracking is on, otherwise the one
   last scrolled. Same rule as scrolling. Anchored on the middle of the view. */
export function zoomBy(factor) {
  if (!cols.length) return;
  const originCol = cols[Math.min(leader, cols.length - 1)];
  const targets = S.sync ? cols : [originCol];
  for (const c of targets) applyZoom(c, c.zoom * factor, c.scroller.clientWidth / 2, c.scroller.clientHeight / 2);
  S.zoom = originCol.zoom;
  S.fit = false;
  notifyZoom();
}

export function zoomFit() {
  for (const c of cols) applyZoom(c, 1, 0, 0);
  S.zoom = 1; S.fit = true;
  notifyZoom();
}

function matchZoomToLeader() {
  if (!cols.length) return;
  const src = cols[Math.min(leader, cols.length - 1)];
  for (const c of cols) {
    if (c === src || c.zoom === src.zoom) continue;
    applyZoom(c, src.zoom, 0, 0);
  }
}

export function currentZoom() {
  if (!cols.length) return 1;
  const g = cols[0].gesture;
  return g ? g.zoom0 * g.factor : cols[0].zoom;
}

/* Lay the pages out in CONTENT space, butted together with no gap, so a plot
   that spans a page break reads as one continuous image. Each box shows a page's
   content slice; the print margins were dropped by withContentSpace. */
function buildStrip(c) {
  const { strip, doc } = c;
  strip.innerHTML = "";
  c.slots = [];
  for (const p of doc.index.pages) {
    const box = el("div", "pagewrap");
    box.innerHTML = `<div class="placeholder"></div><div class="pagenum">${p.index}</div>`;
    strip.appendChild(box);
    c.slots.push({ page: p.index, box, y: 0, h: 0 });
  }
  rescaleStrip(c);
}

function abortAll(c) {
  for (const s of c.slots) if (s.ctrl) { s.ctrl.abort(); s.ctrl = null; s.pending = null; }
}

/* Render the pages near the viewport, nearest first, at the column's current
   scale. A slot remembers the scale it has on screen (drawn) and the one on
   its way (pending); nothing is asked for twice, and a render that lands after
   the scale moved on is dropped rather than stamped as current. */
function draw(c) {
  if (c.gesture) return;
  const top = c.scroller.scrollTop, vh = c.scroller.clientHeight;
  const pad = vh * 0.75, keep = vh * KEEP_SCREENS;
  const want = c.scale;
  const near = [];
  for (const s of c.slots) {
    const visible = s.y + s.h > top - pad && s.y < top + vh + pad;
    if (visible) { if (s.drawn !== want && s.pending !== want) near.push(s); continue; }
    if (s.pending != null && s.pending !== want) { s.ctrl?.abort(); s.ctrl = null; s.pending = null; }
    // Far away: give the canvas back (the render cache may still hold it).
    if (s.drawn != null && (s.y + s.h < top - keep || s.y > top + vh + keep)) {
      s.box.querySelector("canvas")?.remove();
      if (!s.box.querySelector(".placeholder")) s.box.insertBefore(el("div", "placeholder"), s.box.firstChild);
      s.drawn = null;
    }
  }
  near.sort((a, b) => Math.abs(a.y - top) - Math.abs(b.y - top));
  for (const slot of near) {
    slot.ctrl?.abort();
    const ctrl = slot.ctrl = new AbortController();
    slot.pending = want;
    const p = c.doc.index.pages[slot.page - 1];
    const cH = p.cHeight != null ? p.cHeight : p.height;
    const cy = p.cy != null ? p.cy : p.absY;
    renderRange(c.doc, cy, cH, p.width * want, { signal: ctrl.signal }).then((canvas) => {
      if (slot.ctrl !== ctrl) return;              // superseded
      slot.ctrl = null; slot.pending = null;
      if (!slot.box.isConnected || c.scale !== want) return;
      slot.drawn = want;
      canvas.style.width = "100%"; canvas.style.height = "100%";
      const old = slot.box.firstChild;
      if (old !== canvas) {
        if (old && (old.tagName === "CANVAS" || old.classList.contains("placeholder"))) old.replaceWith(canvas);
        else slot.box.insertBefore(canvas, old);
      }
    }).catch((e) => {
      if (slot.ctrl === ctrl) { slot.ctrl = null; slot.pending = null; }
      if (!isCancel(e)) console.warn("page render", slot.page, e);
    });
  }
}
