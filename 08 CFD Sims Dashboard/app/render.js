/* render.js — page and panel rasterisation, with a cache.

   Three consumers, one path: the page view wants each page's content slice as
   it scrolls into sight, the panel and overlay views want one panel, which is
   a crop of the strip and may span two pages. All of them go through
   renderRange(), which rasterises ONLY the requested range, straight at the
   size it will be shown. The old path rendered the whole A3 page into a cache
   and then copied the slice out, which drew every page twice and kept both.

   Rendering is cancellable (pass an AbortSignal): a pinch that moves on
   before a render lands must not leave pdf.js grinding through a scale nobody
   wants any more.

   Sizes are snapped. A requested width is rounded UP to the next quarter
   octave (2^(k/4)) of device pixels, so the ten intermediate widths of one
   pinch share a handful of rasters, and CSS scales the canvas the last few
   per cent. Every canvas is capped at MAX_PX pixels: iOS Safari draws nothing
   at all above about 16.7M, and past that point more pixels do not read as
   sharper anyway.

   The cache is bounded by BYTES, not by count. A thumbnail and a 6x-zoomed
   page are not the same cost. */

const MOBILE = typeof matchMedia === "function" && matchMedia("(max-width: 767px), (pointer: coarse)").matches;
const CACHE_BYTES = (MOBILE ? 96 : 320) * 1024 * 1024;
const MAX_PX = 16_000_000;
const MAX_SIDE = 16_384;

const cache = new Map();         // key -> canvas, in LRU order (oldest first)
let cacheBytes = 0;
const inflight = new Map();      // key -> promise, shared by uncancellable callers
const bytesOf = (c) => c.width * c.height * 4;

function cachePut(key, canvas) {
  const old = cache.get(key);
  if (old) { cache.delete(key); cacheBytes -= bytesOf(old); }
  cache.set(key, canvas);
  cacheBytes += bytesOf(canvas);
  for (const [k, c] of cache) {
    if (cacheBytes <= CACHE_BYTES || k === key) break;
    cache.delete(k);
    cacheBytes -= bytesOf(c);
    release(c);
  }
}
function cacheGet(key) {
  const c = cache.get(key);
  if (!c) return null;
  cache.delete(key); cache.set(key, c);          // most recently used
  return c;
}

/* Hand a canvas's backing store back now, rather than whenever the collector
   gets round to it. Safari in particular holds the memory until then. Never on
   a canvas that is on screen: it would go blank. */
export function release(canvas) {
  if (canvas && !canvas.isConnected) { canvas.width = 0; canvas.height = 0; }
}

export function clearCache(docId) {
  for (const [k, c] of [...cache]) {
    if (docId && !k.startsWith(docId + "|")) continue;
    cache.delete(k); cacheBytes -= bytesOf(c); release(c);
  }
}

export function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

/* Device-pixel width to render for `cssWidth`, snapped up to a quarter octave. */
export function snapWidth(cssWidth) {
  const px = Math.max(1, cssWidth * dpr());
  return Math.ceil(2 ** (Math.ceil(Math.log2(px) * 4 - 1e-9) / 4));
}

/* Keep pdf.js's parsed pages warm while the reader is zooming and scrolling,
   and let them go once they have been idle a while. Cleaning up after every
   render, as before, made each zoom step re-parse the page from scratch. */
const touched = new Map();       // doc -> Set(page proxies)
let idleTimer = 0, running = 0;
function remember(doc, page) {
  if (!touched.has(doc)) touched.set(doc, new Set());
  touched.get(doc).add(page);
}
function scheduleCleanup() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (running) return scheduleCleanup();
    for (const pages of touched.values()) for (const p of pages) { try { p.cleanup(); } catch { /* busy: next time */ } }
    touched.clear();
  }, 4000);
}

/* Rasterise [srcY, srcY + srcH] of one page (page points) into ctx at
   `k` device px per point, `dstY` px down. */
async function drawSegment(doc, pageNum, srcY, k, canvas, signal) {
  if (signal?.aborted) throw abortError();
  const page = await doc.pdf.getPage(pageNum);
  remember(doc, page);
  if (signal?.aborted) throw abortError();
  const viewport = page.getViewport({ scale: k });
  const task = page.render({
    canvasContext: canvas.getContext("2d", { alpha: false }),
    viewport,
    transform: [1, 0, 0, 1, 0, -Math.round(srcY * k)],
  });
  const onAbort = () => task.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  running++;
  try { await task.promise; }
  finally { running--; signal?.removeEventListener("abort", onAbort); scheduleCleanup(); }
}
function abortError() { const e = new Error("cancelled"); e.name = "AbortError"; return e; }
export const isCancel = (e) => e && (e.name === "AbortError" || e.name === "RenderingCancelledException");

/* Measure each page's ink margins, so withContentSpace can drop them.

   Renders every page small (a plot is a big object, a coarse raster locates it
   fine) and finds the first and last inked row. Returns per-page
   { top, bottom } in page points. Throwaway canvases, never the render cache,
   three pages at a time. A page that fails to render contributes no trim
   rather than blocking the load. */
export async function measureMargins(doc, opts = {}) {
  const scale = opts.scale || 0.34;
  const threshold = opts.threshold ?? 246;
  const k = scale * dpr();
  const pages = doc.index.pages;
  const out = new Array(pages.length);
  let next = 0, done = 0;
  const canvas = () => document.createElement("canvas");
  async function worker() {
    const cv = canvas();
    while (next < pages.length) {
      const pg = pages[next++];
      let top = 0, bottom = 0;
      try {
        cv.width = Math.ceil(pg.width * k); cv.height = Math.ceil(pg.height * k);
        await drawSegment(doc, pg.index, 0, k, cv);
        const w = cv.width, h = cv.height;
        const data = cv.getContext("2d").getImageData(0, 0, w, h).data;
        const inkRow = (y) => {
          const base = y * w * 4;
          for (let x = 0; x < w; x += 3) {
            const i = base + x * 4;
            if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) return true;
          }
          return false;
        };
        let a = 0, b = 0;
        for (let y = 0; y < h; y++) { if (inkRow(y)) break; a++; }
        for (let y = h - 1; y >= 0; y--) { if (inkRow(y)) break; b++; }
        // A blank page (a === h) would trim everything; leave it whole instead.
        if (a < h) { top = (a / h) * pg.height; bottom = (b / h) * pg.height; }
      } catch { /* leave this page untrimmed */ }
      out[pg.index - 1] = { top, bottom };
      done++;
      if (opts.onProgress) opts.onProgress(done, pages.length);
    }
    cv.width = cv.height = 0;
  }
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

/* Which pages does a content-space range touch, and where does it land on each?

   Ranges are in content space (margins already collapsed, see withContentSpace),
   so a page occupies [cy, cy + cHeight]. The source rows read from the page start
   at cTop, which is what skips the print margin: the whitespace above cTop and
   below cBottom is never sampled, so consecutive pages composite back to back
   with no seam. Falls back to full-page coordinates when a page has no measured
   margins (contentTop/Height absent). */
export function pagesForRange(index, absY, height) {
  const out = [];
  for (const p of index.pages) {
    const cy = p.cy != null ? p.cy : p.absY;
    const cH = p.cHeight != null ? p.cHeight : p.height;
    const cTop = p.cTop != null ? p.cTop : 0;
    const top = cy, bottom = cy + cH;
    if (bottom <= absY || top >= absY + height) continue;
    const takeFrom = Math.max(0, absY - top);            // offset into this page's content
    const takeTo = Math.min(cH, absY + height - top);
    out.push({
      page: p.index,
      srcY: cTop + takeFrom,                             // page points, past the top margin
      srcH: takeTo - takeFrom,
      dstY: Math.max(0, top - absY),                     // where it lands in the output
      pageHeight: p.height,
      pageWidth: p.width,
    });
  }
  return out;
}

/* Draw a strip range onto a canvas `targetWidth` CSS pixels wide.

   Returns a canvas from the cache when one exists at this size. Callers may
   put it on screen and set its CSS size, and must not draw on it; the same
   canvas comes back to the next caller that asks for the same range.

   opts.signal cancels the render. Cancelled renders reject with an error
   isCancel() recognises; callers drop those silently. */
export async function renderRange(doc, absY, height, targetWidth, opts = {}) {
  const index = doc.index;
  const pageW = index.pages[0].width;
  let pxW = snapWidth(targetWidth);
  // Cap the pixel count (and either side), keeping the aspect.
  const aspect = height / pageW;
  const over = Math.max(1, Math.sqrt((pxW * pxW * aspect) / MAX_PX), pxW / MAX_SIDE, (pxW * aspect) / MAX_SIDE);
  if (over > 1) pxW = Math.floor(pxW / over);
  const k = pxW / pageW;                                   // device px per point
  const pxH = Math.max(1, Math.round(height * k));
  const key = `${doc.id}|${absY.toFixed(2)}|${height.toFixed(2)}|${pxW}`;
  const style = (c) => { c.style.width = targetWidth + "px"; c.style.height = (height * targetWidth / pageW) + "px"; return c; };

  const hit = cacheGet(key);
  if (hit) return style(hit);
  if (!opts.signal && inflight.has(key)) return style(await inflight.get(key));

  const job = (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = pxW; canvas.height = pxH;
    const segs = pagesForRange(index, absY, height);
    try {
      if (segs.length === 1 && segs[0].dstY === 0) {
        // One page covers the range: pdf.js draws straight into the result.
        await drawSegment(doc, segs[0].page, segs[0].srcY, k, canvas, opts.signal);
      } else {
        /* pdf.js clears the whole canvas before drawing a page, so a range
           that spans a page break draws each piece on its own and stacks them. */
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, pxW, pxH);
        for (const seg of segs) {
          const h = Math.max(1, Math.round(seg.srcH * k));
          const piece = document.createElement("canvas");
          piece.width = pxW; piece.height = h;
          await drawSegment(doc, seg.page, seg.srcY, k, piece, opts.signal);
          ctx.drawImage(piece, 0, Math.round(seg.dstY * k));
          piece.width = piece.height = 0;
        }
      }
    } catch (e) { release(canvas); throw e; }
    cachePut(key, canvas);
    return canvas;
  })();

  if (opts.signal) return style(await job);
  inflight.set(key, job);
  try { return style(await job); }
  finally { inflight.delete(key); }
}

/* A panel, cropped so the following panel's title does not bleed in. */
export function panelRange(panel) {
  const trim = Math.min(14, panel.height * 0.03);
  return { absY: panel.absY - 4, height: Math.max(40, panel.height - trim) };
}

export async function renderPanel(doc, panel, targetWidth, opts) {
  const r = opts?.range || panelRange(panel);
  return renderRange(doc, r.absY, r.height, targetWidth, opts);
}

/* Where the ink actually is, as offsets in strip points from the top of the
   given range.

   The source layout leaves a lot of empty space around a plot (in the sample,
   roughly the top 40% of a panel is blank), so cropping to content makes the
   comparison panes far denser. Rows are sampled rather than scanned pixel by
   pixel; a plot is a large object and there is no need to be exact about a
   hairline. */
const boundsMemo = new WeakMap();   // canvas -> { key, value }: cached canvases are read again on every tab visit
export function contentBounds(canvas, rangeHeight, opts = {}) {
  const memoKey = `${rangeHeight}|${opts.threshold ?? 247}|${opts.minGapPts ?? 40}`;
  const m = boundsMemo.get(canvas);
  if (m && m.key === memoKey && m.w === canvas.width) return m.value;
  const value = measureBounds(canvas, rangeHeight, opts);
  boundsMemo.set(canvas, { key: memoKey, w: canvas.width, value });
  return value;
}
function measureBounds(canvas, rangeHeight, opts) {
  const threshold = opts.threshold ?? 247;      // below this counts as ink
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return { top: 0, bottom: rangeHeight };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; }
  catch { return { top: 0, bottom: rangeHeight }; }   // tainted canvas, don't guess

  const rowHasInk = (y) => {
    const base = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i = base + x * 4;
      if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) return true;
    }
    return false;
  };

  const toPts = (px) => (px / h) * rangeHeight;

  /* Group the inked rows into blocks, splitting on any blank run longer than
     minGap. The panels have a characteristic shape: a title line, a wide empty
     band, then the plot. Knowing where the blocks are is what lets the caller
     drop the band without touching the plot itself. */
  const minGapPx = Math.max(4, (opts.minGapPts ?? 40) / rangeHeight * h);
  const blocks = [];
  let runStart = -1, blankRun = 0;
  for (let y = 0; y < h; y++) {
    if (rowHasInk(y)) {
      if (runStart < 0) runStart = y;
      blankRun = 0;
    } else if (runStart >= 0) {
      blankRun++;
      if (blankRun >= minGapPx) { blocks.push([runStart, y - blankRun]); runStart = -1; blankRun = 0; }
    }
  }
  if (runStart >= 0) blocks.push([runStart, h - 1]);
  if (!blocks.length) return { top: 0, bottom: rangeHeight, blocks: [] };

  return {
    top: toPts(blocks[0][0]),
    bottom: toPts(blocks[blocks.length - 1][1] + 1),
    blocks: blocks.map(([a, b]) => ({ top: toPts(a), bottom: toPts(b + 1) })),
  };
}

/* Crop several already-rendered panels to ONE shared content box.

   Joint rather than per-panel is the whole point. Cropping each report to its
   own content would leave them at different offsets, and the difference view
   would then light up everywhere from a pure alignment artefact rather than
   from anything that changed in the solve. Taking the union of the content
   boxes keeps every report on identical coordinates while still removing the
   dead space.

   Works on the pixels that were already drawn, so this costs a canvas copy
   rather than a second render. */
export function jointCrop(canvases, rangeHeight, opts = {}) {
  const pad = opts.pad ?? 6;                    // strip points of breathing room
  const live = canvases.filter(Boolean);
  if (!live.length) return { canvases, top: 0, height: rangeHeight };

  let top = Infinity, bottom = -Infinity;
  for (const c of live) {
    const b = contentBounds(c, rangeHeight, opts);
    let start = b.top;
    /* Crop down to the plot when the panel is the usual "title, empty band,
       plot" shape. Keyed on the last block dominating the panel rather than on
       the first block being thin: the header area also carries the section rules
       either side of the title, so it is taller than the text alone. The panel
       name is already in the toolbar and the column header, so dropping it from
       the image loses nothing. A single-block panel (most convergence plots) is
       left alone. */
    if (b.blocks.length >= 2) {
      const last = b.blocks[b.blocks.length - 1];
      const lastIsDominant = (last.bottom - last.top) > rangeHeight * 0.45;
      const roomAbove = last.top > rangeHeight * 0.10;
      if (lastIsDominant && roomAbove) start = last.top;
    }
    top = Math.min(top, start);
    bottom = Math.max(bottom, b.bottom);
  }
  top = Math.max(0, top - pad);
  bottom = Math.min(rangeHeight, bottom + pad);
  const height = bottom - top;

  // Not worth cropping if there is little to gain, and never crop to nothing.
  if (!isFinite(height) || height < rangeHeight * 0.25 || height > rangeHeight * 0.97) {
    return { canvases, top: 0, height: rangeHeight };
  }

  const out = canvases.map(c => {
    if (!c) return c;
    const scale = c.height / rangeHeight;       // device px per strip point
    const sy = Math.round(top * scale);
    const sh = Math.round(height * scale);
    const cropped = document.createElement("canvas");
    cropped.width = c.width;
    cropped.height = sh;
    const cssW = parseFloat(c.style.width) || c.width;
    cropped.style.width = cssW + "px";
    cropped.style.height = (cssW * sh / c.width) + "px";
    const cx = cropped.getContext("2d", { alpha: false });
    cx.fillStyle = "#fff";
    cx.fillRect(0, 0, cropped.width, cropped.height);
    cx.drawImage(c, 0, sy, c.width, sh, 0, 0, c.width, sh);
    return cropped;
  });
  return { canvases: out, top, height };
}
