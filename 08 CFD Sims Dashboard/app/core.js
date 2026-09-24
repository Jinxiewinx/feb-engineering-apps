/* core.js — state, document loading, routing between the Dashboard and the
   Viewer, and the library wiring.

   Ported from 07 CFD PDF Viewer/app/core.js on 2026-09-02, then given the
   composites app's shell (shell.js) and a Dashboard (dashboard.js) the same
   week. What changed against 07: the Electron bridge and the demo button are
   gone; reports come from a shared library (library.js) as well as local
   files; the URL carries what is open, which view, which plot and which
   overlay, so a link is a comparison and a saved view is a named link; the
   view rows come from indexer.js's matchPanels() instead of an inlined copy;
   results and a thumbnail are extracted at upload and backfilled on open.

   This app uses ES modules rather than the classic global-scope scripts the
   composites app uses. pdf.js ships as a module and drags a module worker
   with it, so there is no honest way around it here. Inline onclick handlers
   in shell and dashboard markup reach the module through window.cfd.

   Everything the views need hangs off S. Views are pure-ish: they read S and
   rebuild their own subtree when render() is called. */

import { indexDocument, withContentSpace, matchPanels } from "./indexer.js";
import { clearCache, measureMargins, renderPanel, dpr } from "./render.js";
import * as cache from "./cache.js";
import { renderPages, resyncColumns, resyncAndLock, setSync, zoomBy, zoomFit, setZoomListener, currentZoom } from "./pages.js";
import { renderPanelView } from "./panels.js";
import { renderOverlay } from "./compare.js";
import { renderSummary } from "./summary.js";
import { renderSearch, focusSearch } from "./search.js";
import { resultsFrom, dpFrom, metaFrom } from "./extract.js";
import * as lib from "./library.js";
import * as shell from "./shell.js";
import { renderDashboard } from "./dashboard.js";
import { $, el, esc, toast, fmtMB, shortDate } from "./util.js";
export { $, el, esc, toast };

/* Bumped by hand at release time; tags are cfd-vX.Y.Z (see README). */
export const APP_VERSION = "0.3.1";

/* ---------- boot splash ----------
   index.html paints it before this module (and pdf.js behind it) has even
   downloaded. Three milestones light three lamps; when all three are lit the
   Continue button appears and the sheet waits for it (or a tap, Enter,
   Space, Escape), the composites app's gate. A slow boot (4 s) offers
   Continue early; a failed one (12 s, or the library errored) offers Retry.
   Nothing here dismisses the sheet on a timer. */
const SPLASH = { fonts: 0, library: 0, views: 0 };   // 0 pending, 1 done, -1 failed
const SPLASH_LABEL = { fonts: "fonts", library: "the library", views: "saved views" };
let splashDone = false;
const FACTS = [
  "Fluent prints lift negative: −487 N in a report is 487 N of downforce.",
  "The coefficients here are on 1 m² at 20 m/s, so Cl × 245 N is the force.",
  "Two identical reports difference to exactly 0.00%. That is how the overlay is checked.",
  "Every named plot is matched across reports by its title, so a renamed view shows as missing, never as the wrong plot.",
  "Print margins are dropped before pages stack, so a plot across a page break renders as one image.",
  "The thumbnail on every card is stat-car-0, the same view for every run, so cards compare at a glance.",
];
function splashEl() { return document.getElementById("splash"); }
function splashStep(key, state) {
  SPLASH[key] = state;
  const el = splashEl(); if (!el) return;
  const lit = Object.values(SPLASH).filter(v => v === 1).length;
  const lamps = el.querySelectorAll(".sp-lamp");
  lamps.forEach((l, i) => { l.classList.toggle("on", i < lit); });
  const failed = Object.entries(SPLASH).filter(([, v]) => v === -1).map(([k]) => k);
  failed.forEach((k, i) => { const l = lamps[lit + i]; if (l) l.classList.add("bad"); });
  const lights = el.querySelector("#sp-lights"); if (lights) lights.setAttribute("aria-valuenow", lit);
  const pending = Object.entries(SPLASH).filter(([, v]) => v === 0).map(([k]) => SPLASH_LABEL[k]);
  const step = el.querySelector("#sp-step");
  if (step) step.textContent = failed.length ? `Could not reach ${failed.map(k => SPLASH_LABEL[k]).join(" and ")}.` : pending.length ? `Waiting for ${pending.join(", ")}…` : "Ready.";
  if (failed.length) el.classList.add("failed");
  if (!pending.length && !failed.length) el.classList.add("ready");
}
/* Somebody said go. The only way down. */
function hideSplash() {
  if (splashDone) return;
  const el = splashEl(); if (!el) return;
  splashDone = true;
  el.setAttribute("aria-hidden", "true");
  el.classList.add("gone");
  const app = document.getElementById("app");
  app.classList.add("sp-arrive"); setTimeout(() => app.classList.remove("sp-arrive"), 500);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
}
(function bootSplash() {
  const el = splashEl(); if (!el) return;
  const fact = el.querySelector("#sp-fact");
  if (fact) fact.textContent = FACTS[new Date().getDate() % FACTS.length];
  try { document.fonts.ready.then(() => splashStep("fonts", 1), () => splashStep("fonts", 1)); }
  catch (e) { splashStep("fonts", 1); }
  setTimeout(() => { if (!splashDone) el.classList.add("slow"); }, 4000);
  setTimeout(() => { if (!splashDone) { for (const k in SPLASH) if (SPLASH[k] === 0) SPLASH[k] = -1; splashStep("library", SPLASH.library); } }, 12000);
  const armed = () => el.classList.contains("ready") || el.classList.contains("slow") || el.classList.contains("failed");
  el.querySelector("#sp-go").onclick = e => { e.stopPropagation(); hideSplash(); };
  el.querySelector("#sp-retry").onclick = e => { e.stopPropagation(); location.reload(); };
  // A tap anywhere on the sheet, or Enter / Space / Escape, once it is armed.
  el.addEventListener("click", () => { if (armed()) hideSplash(); });
  document.addEventListener("keydown", e => {
    if (splashDone || !armed()) return;
    if (["Enter", " ", "Escape"].includes(e.key)) { e.preventDefault(); hideSplash(); }
  });
})();

/* ---------- mobile ----------
   One report at a time under 768px: no side panel, no two-report views, a
   select in the toolbar to pick from the library. */
const MQ = matchMedia("(max-width: 767px)");
export function isMobile() { return MQ.matches; }
MQ.addEventListener("change", () => {
  if (isMobile()) {
    if (!["pages", "panels"].includes(S.tab)) S.tab = "pages";
    for (const d of S.docs.slice(1)) removeDoc(d.id);
  }
  renderPage(); syncUrl();
});


const COLORS = ["#FDB515", "#5b8cff", "#34c88f", "#c07de8", "#ef8f5a", "#5ad2d2"];

/* The plot every card shows. Fixed on purpose so cards compare at a glance;
   the name is printed under the thumbnail so a report whose views differ is
   visible rather than silently wrong. */
export const THUMB_PANEL = "stat-car-0";

export const S = {
  page: "dashboard",     // dashboard | viewer
  docs: [],
  tab: "pages",
  zoom: 1,               // multiplier on top of fit-width
  fit: true,
  sync: true,
  panelId: null,         // panel being compared / overlaid
  overlay: { mode: "swipe", a: 0, b: 1, blend: 0.5, swipe: 0.5, amp: 6 },
  query: "",
  library: null,         // null until the first snapshot; then the records, newest first
  views: [],             // saved views
  libQuery: "",
  libError: null,
  addToLibrary: true,    // the checkbox: local files are uploaded as they open
  pagesPos: null,        // { y, panelId }: where the page view was, in strip points
};

const TABS = [
  { id: "pages", label: "Pages" },
  { id: "panels", label: "Panels" },
  { id: "overlay", label: "Overlay" },
  { id: "summary", label: "Summary" },
];

/* ---------- loading ----------

   A report goes on the Open list the moment it is asked for, with a phase
   (downloading N%, reading), and every report asked for at once loads at
   once: a saved view with two reports takes as long as the slower one, not
   the two added up. Bytes and index come from this browser's cache (cache.js)
   when it has them, keyed by sha256, so a second open is a local read. */

let seq = 0;
function newDoc(name, reportId, sha256) {
  const doc = {
    id: "d" + (++seq), name: String(name).replace(/\.pdf$/i, ""), color: COLORS[S.docs.length % COLORS.length],
    pdf: null, index: null, loading: true, reportId: reportId || null, sha256: sha256 || null,
    phase: "read", progress: null, upload: null,
  };
  S.docs.push(doc);
  return doc;
}

/* pdf.js is half a megabyte of module and a 1.3 MB worker. The Dashboard
   never needs it, so it is imported the first time a report is opened, or
   earlier when the browser is idle or the pointer rests on a card. */
let pdfjsP = null;
export function loadPdfjs() {
  return pdfjsP ||= import("./vendor/pdf.mjs").then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;
    return m;
  });
}

/* Parse and index one document from its bytes. `data` is handed to pdf.js,
   which detaches it; callers keep their own copy if they still need one. */
async function readDoc(doc, data) {
  doc.phase = "read"; doc.progress = null; refreshDoc(doc);
  const pdfjs = await loadPdfjs();
  // Keep the loading task: in pdf.js 6 the document proxy has no destroy(),
  // so tearing a report down goes through the task, not the proxy.
  doc.task = pdfjs.getDocument({ data });
  doc.pdf = await doc.task.promise;
  const cached = await cache.getIndex(doc.sha256);
  if (cached && cached.numPages === doc.pdf.numPages) doc.index = cached;
  else {
    const raw = await indexDocument(doc.pdf, { onProgress: (n, of) => { doc.progress = n / of / 2; refreshDoc(doc); } });
    // Drop the page print margins so a plot spanning a page break renders as
    // one continuous image. Needs a canvas, so it runs here rather than inside
    // the (node-testable) indexer.
    doc.index = raw;   // measureMargins reads doc.index.pages
    const margins = await measureMargins(doc, { onProgress: (n, of) => { doc.progress = 0.5 + n / of / 2; refreshDoc(doc); } });
    doc.index = withContentSpace(raw, margins);
    cache.putIndex(doc.sha256, doc.index);
  }
  doc.loading = false; doc.phase = null; doc.progress = null;
}

function dropDoc(doc) {
  try { doc.task?.destroy?.(); } catch { /* already gone */ }
  S.docs = S.docs.filter(d => d !== doc);
}

/* Once the first two reports are in, start comparing: select the first plot. */
function afterOpen() {
  if (S.docs.filter(d => d.index).length >= 2 && !S.panelId) {
    const first = S.docs.find(d => d.index)?.index?.panels?.[0];
    if (first) S.panelId = first.id;
  }
  scheduleRender(); renderChrome(); syncUrl();
}

/* sources: [{ name, data: Uint8Array, reportId?, sha256? }]. Opens them all
   concurrently, in list order. Returns the docs it made (null where a source
   failed). Kept for the console and the tests; the app goes through
   openReports() and ingest(). */
export async function addDocs(sources) {
  const docs = sources.map(src => newDoc(src.name, src.reportId, src.sha256));
  renderChrome();
  const made = await Promise.all(docs.map(async (doc, i) => {
    try {
      const src = sources[i];
      await readDoc(doc, src.data || new Uint8Array(await src.file.arrayBuffer()));
      scheduleRender();
      return doc;
    } catch (e) {
      console.error(e);
      dropDoc(doc);
      toast("Could not read " + sources[i].name + ": " + (e && e.message), "err");
      return null;
    }
  }));
  afterOpen();
  return made;
}

export function removeDoc(id) {
  const d = S.docs.find(x => x.id === id);
  if (!d) return;
  // Tear down through the loading task, guarded: a failed teardown must never
  // stop the report from being removed from the list, which is the bug this
  // replaces (destroy() threw and the filter below never ran).
  d.cancelled = true;
  try { d.task?.destroy?.(); } catch (e) { console.warn("pdf teardown failed", e); }
  clearCache(id);
  S.docs = S.docs.filter(x => x.id !== id);
  if (S.overlay.a >= S.docs.length) S.overlay.a = 0;
  if (S.overlay.b >= S.docs.length) S.overlay.b = Math.min(1, S.docs.length - 1);
  renderChrome(); render(); syncUrl();
}

/* ---------- what a record carries: numbers and a picture ---------- */

function docText(doc) { return doc.index.text.map(t => t.text).join("  "); }

/* dp, results and meta for a record, from the open document. */
function extractAll(doc, name) {
  const text = docText(doc);
  return { dp: dpFrom(name, text), results: resultsFrom(text), meta: metaFrom(text) };
}

/* The card thumbnail: THUMB_PANEL if the report has it, else the first
   contour, else the first plot. Rendered from the open document at the size a
   card shows it (a retina card is about 800 device px), so it costs one small
   canvas and no second read. PNG, because storage.rules says so. */
const THUMB_PX = 800;
async function thumbnail(doc) {
  const panels = doc.index.panels;
  const panel = panels.find(p => p.name === THUMB_PANEL)
    || panels.find(p => p.section === "Contours")
    || panels[0];
  if (!panel) return null;
  const canvas = await renderPanel(doc, panel, THUMB_PX / dpr());
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  return blob ? { blob, panel: panel.name, w: canvas.width, h: canvas.height } : null;
}

/* JSON with sorted keys. Firestore hands maps back sorted, extract.js builds
   them in print order; comparing plain JSON.stringify of the two said
   "changed" every time, and rewrote the record on every open. */
function stable(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}

/* Fill in whatever a record is missing, from the open document. Runs after
   opening an older record (the record predates the dashboard). Anyone may
   write these four fields. */
async function backfill(doc, rec) {
  const patch = {};
  const hasNums = rec.results && rec.results.total, hasMeta = rec.meta && Object.keys(rec.meta).length;
  if (!hasNums || rec.dp == null || !hasMeta) {
    const ex = extractAll(doc, rec.name);
    // Only what actually changed, so a report with no numbers is not
    // rewritten with the same empty map on every open.
    for (const k of ["dp", "results", "meta"]) if (stable(ex[k]) !== stable(rec[k])) patch[k] = ex[k];
  }
  if (!rec.thumb) {
    try {
      const t = await thumbnail(doc);
      if (t) patch.thumb = await lib.uploadThumb(rec.id, t.blob, t.panel);
    } catch (e) { console.warn("thumbnail", e); }
  }
  if (Object.keys(patch).length) {
    try { await lib.patch(rec.id, patch); } catch (e) { console.warn("backfill", e); }
  }
}

/* Local files, from the picker or a drop. Each file is hashed first, which
   says whether the library already has it (from the listener's copy of the
   library, no round trip). A new one starts uploading at once, WHILE it is
   being read; its thumbnail is rendered once the read is done, and the
   record is written once, complete, with the thumbnail in it. The note is
   asked for on the report's row, and nothing waits on it. Two files at a
   time. */
async function ingest(files) {
  if (isMobile()) { files = files.slice(0, 1); for (const d of [...S.docs]) removeDoc(d.id); }
  const queue = [...files];
  const one = async () => { for (let f; (f = queue.shift());) await ingestOne(f); };
  await Promise.all([one(), one()]);
}
async function ingestOne(f) {
  let doc = null;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const sha = await lib.sha256Hex(bytes);
    const known = S.library ? S.library.find(r => r.sha256 === sha) || null
      : await lib.findByHash(sha).catch(() => null);   // the listener has not answered yet
    doc = newDoc(f.name, known?.id, sha);
    renderChrome();
    cache.putBytes(sha, bytes);
    const canUpload = !known && S.addToLibrary && bytes.byteLength < lib.MAX_BYTES;
    const id = canUpload ? lib.newId() : null;
    const up = canUpload ? lib.uploadPdf(id, bytes, p => { doc.upload = p; refreshDoc(doc); }) : null;
    if (up) { doc.upload = 0; up.catch(() => {}); }
    await readDoc(doc, bytes.slice());
    scheduleRender(); afterOpen();

    if (known) {
      toast(`Already in the library as "${known.name}"`);
      backfill(doc, known);
      return;
    }
    if (!S.addToLibrary) return;
    if (!canUpload) { toast(`${doc.name}: open, but over the library's ${fmtMB(lib.MAX_BYTES)} limit, so not uploaded`, "err"); return; }
    const ex = extractAll(doc, f.name);
    const [path, thumbField] = await Promise.all([up, thumbnail(doc).then(t => t && lib.uploadThumb(id, t.blob, t.panel)).catch(e => { console.warn("thumbnail", e); return null; })]);
    const rec = await lib.createRecord({
      id, name: f.name, path, size: bytes.byteLength, sha256: sha,
      pages: doc.index.numPages, panels: doc.index.panels.length, ...ex, thumb: thumbField,
    });
    doc.reportId = rec.id;
    doc.askNote = rec.id;
    toast(`Added "${rec.name}" to the library`, "ok");
  } catch (e) {
    console.error(e);
    if (doc && doc.loading) { dropDoc(doc); scheduleRender(); }
    toast((doc && !doc.loading ? "Upload failed: " : "Could not read " + f.name + ": ") + (e?.message || e), "err");
  } finally {
    if (doc) { doc.upload = null; }
    renderChrome(); syncUrl();
  }
}

/* The bytes of a library record: from this browser's cache, else downloaded
   (with progress) and kept for next time. */
async function recordBytes(rec, onProgress) {
  const hit = await cache.getBytes(rec.sha256);
  if (hit) return hit;
  const inflight = prefetching.get(rec.id);
  const bytes = inflight ? await inflight : await lib.fetchBytes(rec, onProgress);
  if (!inflight) cache.putBytes(rec.sha256, bytes);
  return bytes;
}

/* Library records: each goes on the Open list straight away and they all
   load concurrently. Then whatever a record lacks is backfilled. */
export async function openReports(recs, opts = {}) {
  recs = recs.filter(rec => {
    if (!S.docs.some(d => d.reportId === rec.id)) return true;
    if (!opts.quiet) toast(`"${rec.name}" is already open`);
    return false;
  });
  if (!recs.length) return;
  if (isMobile()) { recs = recs.slice(0, 1); for (const d of [...S.docs]) removeDoc(d.id); }   // one at a time on a phone
  loadPdfjs();
  const docs = recs.map(rec => {
    const d = newDoc(rec.name, rec.id, rec.sha256);
    d.phase = "download"; d.progress = 0;
    return d;
  });
  renderChrome(); scheduleRender();
  await Promise.all(docs.map(async (doc, i) => {
    const rec = recs[i];
    try {
      const data = await recordBytes(rec, p => { doc.progress = p; refreshDoc(doc); });
      if (doc.cancelled) return;
      await readDoc(doc, data);
      if (doc.cancelled) return;
      scheduleRender(); renderChrome();
      backfill(doc, rec);
    } catch (e) {
      if (doc.cancelled) return;
      console.error(e);
      dropDoc(doc);
      toast("Could not open " + rec.name + ": " + (e?.message || e), "err");
    }
  }));
  afterOpen();
}
export function openReport(rec, opts = {}) { return openReports([rec], opts); }

/* From a dashboard card: open it (or several) and go to the viewer. */
export async function openInViewer(...ids) {
  const recs = ids.map(id => (S.library || []).find(r => r.id === id)).filter(Boolean);
  if (!recs.length) return;
  setTab("viewer");
  await openReports(recs, { quiet: true });
}

/* Warm the cache for a record the pointer is resting on: pdf.js, and the
   report's bytes if this browser does not have them. One at a time, never on
   a metered connection, never on a phone. */
const prefetching = new Map();
export async function prefetch(id) {
  const rec = (S.library || []).find(r => r.id === id);
  if (!rec || prefetching.size || isMobile() || navigator.connection?.saveData) return;
  if (S.docs.some(d => d.reportId === id)) return;
  loadPdfjs();
  if (await cache.hasBytes(rec.sha256)) return;
  const job = lib.fetchBytes(rec).then(b => { cache.putBytes(rec.sha256, b); return b; });
  prefetching.set(id, job);
  job.catch(() => {}).finally(() => prefetching.delete(id));
}

export async function renameReport(id) {
  const rec = (S.library || []).find(r => r.id === id); if (!rec) return;
  const name = prompt("Rename report", rec.name);
  if (name == null || !name.trim() || name.trim() === rec.name) return;
  try {
    await lib.rename(rec.id, name);
    for (const d of S.docs) if (d.reportId === rec.id) d.name = lib.cleanName(name);
    renderChrome(); render();
  } catch (e) { toast("Rename failed: " + (e?.message || e), "err"); }
}
export async function editNote(id) {
  const rec = (S.library || []).find(r => r.id === id); if (!rec) return;
  const note = prompt(`Note for "${rec.name}"\n\nWhat this run is about, one line.`, rec.note || "");
  if (note == null) return;
  try { await lib.setNote(rec.id, note.trim()); }
  catch (e) { toast("Could not save the note: " + (e?.message || e), "err"); }
}
export async function deleteReport(id) {
  const rec = (S.library || []).find(r => r.id === id); if (!rec) return;
  if (!confirm(`Delete "${rec.name}" from the shared library?\n\nEveryone loses it. Anything open stays open until closed.`)) return;
  try {
    await lib.remove(rec);
    for (const d of S.docs) if (d.reportId === rec.id) d.reportId = null;
    toast(`Deleted "${rec.name}"`);
    renderChrome(); syncUrl();
  } catch (e) { toast("Delete failed: " + (e?.message || e), "err"); }
}
export function reportMenu(id) {
  const rec = (S.library || []).find(r => r.id === id); if (!rec) return;
  const c = prompt(`"${rec.name}"\n\nType  rename,  note  or  delete`, "note");
  if (c === "rename") renameReport(id); else if (c === "delete") deleteReport(id); else if (c === "note") editNote(id);
}

/* ---------- saved views ---------- */

/* Library ids of what is open, each once: the same report opened twice (the
   0.00% self-check) is one id, since openReport() refuses a duplicate. */
function openIds() { return [...new Set(S.docs.map(d => d.reportId).filter(Boolean))]; }

export async function saveView() {
  const ids = openIds();
  if (ids.length < 1) { toast("Open a library report first; a view names what is open.", "err"); return; }
  const local = S.docs.length - ids.length;
  const dflt = S.docs.map(d => d.name).join(" vs ") + (S.tab !== "pages" ? ` · ${S.tab}` : "");
  const name = prompt(`Name this view${local ? `\n\n(${local} open file${local > 1 ? "s are" : " is"} not in the library and will not be part of it)` : ""}`, dflt);
  if (name == null || !name.trim()) return;
  try {
    await lib.saveView(name.trim(), currentQuery(), ids);
    toast(`Saved "${name.trim()}". It is on the Dashboard for everyone.`, "ok");
  } catch (e) { toast("Could not save the view: " + (e?.message || e), "err"); }
}
export function openView(id) {
  const v = S.views.find(v => v.id === id); if (!v) return;
  // Close what is open first: removeDoc() rewrites the URL from state, so the
  // view's query is handed to applyUrl() directly rather than via the bar.
  for (const d of [...S.docs]) removeDoc(d.id);
  S.panelId = null;
  urlApplied = false;
  applyUrl(v.query);
}
export async function renameView(id) {
  const v = S.views.find(v => v.id === id); if (!v) return;
  const name = prompt("Rename view", v.name);
  if (name == null || !name.trim()) return;
  try { await lib.renameView(id, name.trim()); } catch (e) { toast("Rename failed: " + (e?.message || e), "err"); }
}
export async function deleteView(id) {
  const v = S.views.find(v => v.id === id); if (!v) return;
  if (!confirm(`Delete the saved view "${v.name}"?`)) return;
  try { await lib.removeView(id); } catch (e) { toast("Delete failed: " + (e?.message || e), "err"); }
}

/* ---------- panels helpers shared by the views ---------- */

/* One row per plot name across every open report, in report order, with a
   cell per report (null where that report lacks the plot). matchPanels() is
   the tested implementation in indexer.js; 07 carried an untested copy. */
export function panelRows() {
  const withIx = S.docs.filter(d => d.index);
  if (!withIx.length) return [];
  const rows = matchPanels(withIx.map(d => d.index));
  for (const r of rows) r.order = (r.cells.find(Boolean) || {}).order ?? 0;
  return rows;
}
export function currentRow() {
  const rows = panelRows();
  return rows.find(r => r.id === S.panelId) || rows[0] || null;
}
export function selectPanel(id, opts = {}) {
  S.panelId = id;
  syncUrl();
  if (S.tab === "pages" && !opts.stay) {
    // In page view, jumping to a panel scrolls every column to it.
    import("./pages.js").then(m => m.scrollToPanel(id));
    renderChrome();
    return;
  }
  render(); renderChrome();
}

/* ---------- URL state ---------- */

/* ?p=viewer&open=RPT-A,RPT-B&tab=overlay&panel=Contours/velo-wing-3&mode=diff&a=0&b=1
   Enough to send someone a comparison, and exactly what a saved view stores.
   Only library reports can be named; a local file that was not uploaded has
   no id and simply does not appear. No `p` means the Dashboard unless
   something is open. */
export function currentQuery() {
  const p = new URLSearchParams();
  const ids = openIds();
  if (S.page === "viewer") p.set("p", "viewer");
  if (ids.length) p.set("open", ids.join(","));
  if (S.tab !== "pages") p.set("tab", S.tab);
  if (S.panelId && S.tab !== "pages") p.set("panel", S.panelId);
  if (S.tab === "overlay") {
    if (S.overlay.mode !== "swipe") p.set("mode", S.overlay.mode);
    if (S.overlay.a !== 0) p.set("a", S.overlay.a);
    if (S.overlay.b !== 1) p.set("b", S.overlay.b);
  }
  return p.toString();
}
export function syncUrl() {
  const qs = currentQuery();
  const next = location.pathname + (qs ? "?" + qs : "");
  if (next !== location.pathname + location.search) history.replaceState(null, "", next);
}
let urlApplied = false;
async function applyUrl(qs = location.search) {
  if (urlApplied || !S.library) return;
  urlApplied = true;
  const p = new URLSearchParams(qs);
  let ids = (p.get("open") || "").split(",").filter(Boolean);
  if (isMobile()) ids = ids.slice(0, 1);
  S.page = p.get("p") === "viewer" || ids.length ? "viewer" : "dashboard";
  const tab = p.get("tab"); if (TABS.some(t => t.id === tab) && !(isMobile() && !["pages", "panels"].includes(tab))) S.tab = tab;
  const mode = p.get("mode"); if (["swipe", "blend", "diff"].includes(mode)) S.overlay.mode = mode;
  const a = +p.get("a"), b = +p.get("b");
  renderPage();
  const panel = p.get("panel");
  const missing = ids.filter(id => !S.library.some(r => r.id === id));
  await openReports(ids.map(id => S.library.find(r => r.id === id)).filter(Boolean), { quiet: true });
  if (missing.length) toast(`Not in the library any more: ${missing.join(", ")}`, "err");
  if (panel && panelRows().some(r => r.id === panel)) S.panelId = panel;
  if (Number.isInteger(a) && p.has("a")) S.overlay.a = Math.min(a, Math.max(0, S.docs.length - 1));
  if (Number.isInteger(b) && p.has("b")) S.overlay.b = Math.min(b, Math.max(0, S.docs.length - 1));
  render(); renderChrome(); syncUrl();
}

/* ---------- pages: Dashboard and Viewer ---------- */

export function setTab(page) {
  if (!shell.TABS.some(t => t.id === page)) return;
  S.page = page;
  renderPage();
  syncUrl();
}

/* The viewer's DOM is built once and kept; leaving the tab detaches it and
   coming back re-attaches it, so open reports, scroll and zoom survive. */
let viewerRoot = null;
function buildViewer() {
  const root = el("div", "viewer");
  root.innerHTML = `
    <div class="vtool">
      <div class="tabs" id="tabs"></div>
      <select id="mobilepick" title="Pick a report from the library"></select>
      <div class="spacer"></div>
      <div class="ctl" id="synccontrols">
        <button id="synctoggle" class="tgl on" title="Lock scrolling together (S)"><span class="ico">⇅</span><span class="lbl">Synced</span></button>
        <button id="resync" title="Snap every report back to the leader (R)">Re-sync</button>
      </div>
      <div class="ctl zoom">
        <button id="zoomout" title="Zoom out">−</button>
        <span id="zoomlabel">100%</span>
        <button id="zoomin" title="Zoom in">+</button>
        <button id="zoomfit" title="Fit width">Fit</button>
      </div>
      <button id="saveview" title="Save what is open, with its view and plot, as a named view on the Dashboard">Save view</button>
    </div>
    <div class="vbody">
      <aside class="vside">
        <div class="side-sec">
          <div class="side-h">Open</div>
          <div id="doclist" class="doclist"></div>
          <div id="doclist-empty" class="lib-note">Nothing open. Pick from the library below, or open PDFs from this computer.</div>
          <button class="ghost wide" id="addbtn">+ Open PDFs from this computer</button>
          <label class="chk"><input type="checkbox" id="addtolib" checked> Also add them to the shared library</label>
        </div>
        <div class="side-sec lib">
          <div class="side-h">Library <span class="hint" id="libcount"></span></div>
          <input id="libsearch" class="search" placeholder="filter reports…" autocomplete="off">
          <div id="liblist" class="doclist scroll"></div>
        </div>
        <div class="side-sec grow">
          <div class="side-h">Find <span class="hint" id="searchcount"></span></div>
          <input id="search" class="search" placeholder="plot name or text…  (/)" autocomplete="off">
          <div id="results" class="results"></div>
        </div>
      </aside>
      <div class="vmain" id="vmain">
        <div id="empty" class="empty">
          <div class="empty-card">
            <h1>Compare CFD reports</h1>
            <p>Open two or more Fluent report PDFs. They scroll together, and every named plot is matched across reports so you can put the same contour side by side, or lay one over the other to see what moved.</p>
            <p>Reports opened here go into a library the whole team shares. The address bar carries what you have open, so a link is a comparison, and Save view keeps one on the Dashboard.</p>
            <div class="empty-actions"><button class="primary" id="openbtn2">Open PDFs from this computer</button></div>
            <p class="fineprint">Drag PDFs anywhere onto this window.</p>
          </div>
        </div>
      </div>
    </div>`;
  // The empty state is held aside: render() empties #vmain, which would
  // otherwise destroy it the first time a report opens.
  root._empty = root.querySelector("#empty");
  root._empty.remove();
  // Wiring, once.
  root._empty.querySelector("#openbtn2").onclick = pick;
  root.querySelector("#addbtn").onclick = pick;
  root.querySelector("#mobilepick").onchange = e => {
    const v = e.target.value;
    if (v === "__pick") { pick(); e.target.value = S.docs[0]?.reportId || ""; return; }
    const rec = (S.library || []).find(r => r.id === v);
    if (rec) openReport(rec, { quiet: true });
  };
  root.querySelector("#saveview").onclick = saveView;
  root.querySelector("#addtolib").onchange = e => { S.addToLibrary = e.target.checked; };
  root.querySelector("#libsearch").oninput = e => { S.libQuery = e.target.value; renderChrome(); };
  root.querySelector("#synctoggle").onclick = () => { S.sync = !S.sync; setSync(S.sync); renderChrome(); };
  root.querySelector("#resync").onclick = () => { resyncAndLock(); renderChrome(); toast("Tracking together again"); };
  root.querySelector("#zoomin").onclick = () => zoomStep(1.25);
  root.querySelector("#zoomout").onclick = () => zoomStep(1 / 1.25);
  root.querySelector("#zoomfit").onclick = () => {
    if (S.tab === "pages") { zoomFit(); updateZoomLabel(); }
    else { S.fit = true; S.zoom = 1; render(); updateZoomLabel(); }
  };
  return root;
}
/* In page view the zoom controls rescale the columns in place, which keeps the
   scroll position. Elsewhere they still go through a re-render, since those
   views have nothing to preserve. */
const zoomStep = (factor) => {
  if (S.tab === "pages") { zoomBy(factor); updateZoomLabel(); }
  else { S.fit = false; S.zoom = Math.max(0.15, Math.min(6, S.zoom * factor)); render(); updateZoomLabel(); }
};
/* The zoom readout, and nothing else. A pinch calls this every frame; it used
   to rebuild the whole side panel, search results included, on every event. */
function updateZoomLabel() {
  const lbl = document.getElementById("zoomlabel");
  if (!lbl) return;
  const z = S.tab === "pages" && S.docs.length ? currentZoom() : S.zoom;
  lbl.textContent = S.fit ? "Fit" : Math.round(z * 100) + "%";
}

export function renderPage() {
  shell.renderSidebar(S.page);
  shell.renderTopbar(S.page, APP_VERSION);
  const main = $("#main");
  if (S.page === "viewer") {
    if (!viewerRoot) viewerRoot = buildViewer();
    if (viewerRoot.parentNode !== main) { main.innerHTML = ""; main.appendChild(viewerRoot); }
    renderChrome(); render();
  } else {
    if (viewerRoot && viewerRoot.parentNode === main) main.removeChild(viewerRoot);
    main.innerHTML = renderDashboard();
  }
}
function refreshDashboard() {
  if (S.page === "dashboard") $("#main").innerHTML = renderDashboard();
}

/* Snapshots from the two listeners arrive in bursts (both at boot, one per
   write after an upload). Draw once per frame, whatever arrived. */
let pageFrame = 0;
function schedulePage() {
  if (pageFrame) return;
  pageFrame = requestAnimationFrame(() => {
    pageFrame = 0;
    if (S.page === "dashboard") refreshDashboard(); else renderChrome();
  });
}

/* ---------- viewer chrome ----------

   Built once in buildViewer(); after that each part is updated in place, and
   only when what it shows changed. The Open and Library lists are keyed by
   id, so an upload's progress tick touches one bar and a new record adds one
   row, rather than every call rebuilding the side panel and the search
   results with it (what a pinch used to trigger 60 times a second). */

function inViewer() { return viewerRoot && viewerRoot.parentNode; }

export function renderChrome() {
  if (!inViewer()) { if (S.page === "dashboard") refreshDashboard(); return; }
  renderTabs();
  renderDocList();
  renderLibList();
  renderMobilePick();
  $("#saveview").disabled = !S.docs.some(d => d.reportId);
  $("#synccontrols").style.display = S.tab === "pages" ? "" : "none";
  $("#synctoggle").classList.toggle("on", S.sync);
  $("#synctoggle").querySelector(".lbl").textContent = S.sync ? "Synced" : "Free";
  $("#resync").disabled = S.docs.filter(d => d.index).length < 2;
  viewerRoot.querySelector(".ctl.zoom").style.display = (S.tab === "pages" || S.tab === "panels") ? "" : "none";
  updateZoomLabel();
  // Search depends on the open reports, the query and the selected plot only.
  const sk = S.docs.filter(d => d.index).map(d => d.id).join() + "|" + S.query + "|" + S.panelId;
  if (sk !== lastSearchKey) { lastSearchKey = sk; renderSearch(); }
}
let lastSearchKey = null;

function tabAllowed(id) {
  if (isMobile()) return id === "pages" || id === "panels";
  return !((id === "overlay" || id === "summary") && S.docs.filter(d => d.index).length < 2);
}
export function setViewTab(id) {
  if (!tabAllowed(id) || S.tab === id) return;
  S.tab = id; render(); renderChrome(); syncUrl();
}
function renderTabs() {
  const tabs = $("#tabs");
  if (isMobile() && !["pages", "panels"].includes(S.tab)) S.tab = "pages";
  if (!tabs.children.length) for (const t of TABS) {
    const b = el("button", "", t.label);
    b.dataset.tab = t.id;
    b.onclick = () => setViewTab(t.id);
    tabs.appendChild(b);
  }
  for (const b of tabs.children) {
    const id = b.dataset.tab;
    b.hidden = isMobile() && !["pages", "panels"].includes(id);
    b.disabled = !tabAllowed(id);
    b.classList.toggle("active", S.tab === id);
  }
}

function renderMobilePick() {
  const mp = $("#mobilepick");
  const cur = S.docs[0]?.reportId || "";
  const key = cur + "|" + (S.docs[0]?.name || "") + "|" + (S.library || []).map(r => r.id + r.name + r.dp).join();
  if (mp._key === key) return;
  mp._key = key;
  mp.innerHTML = `<option value="" ${cur ? "" : "selected"} disabled>${S.docs.length ? esc(S.docs[0].name) : "Pick a report…"}</option>` +
    (S.library || []).map(r => `<option value="${esc(r.id)}" ${r.id === cur ? "selected" : ""}>${esc(r.name)}${Number.isInteger(r.dp) ? ` (DP ${r.dp})` : ""}</option>`).join("") +
    `<option value="__pick">Open a PDF from this phone…</option>`;
}

/* ---- the Open list ---- */
const docRows = new Map();   // doc id -> row element
function docMeta(d) {
  if (d.phase === "download") return d.progress ? `downloading ${Math.round(d.progress * 100)}%` : "downloading…";
  if (d.loading) return d.progress ? `reading ${Math.round(d.progress * 100)}%` : "reading…";
  if (d.upload != null) return `uploading ${Math.round(d.upload * 100)}%`;
  return d.index.numPages + "p · " + d.index.panels.length;
}
function docBar(d) {
  if (d.upload != null) return d.upload;
  if (d.loading) return d.progress;
  return null;
}
/* One row, in place. Also what progress callbacks call, so a tick costs a
   text node and a style write. */
export function refreshDoc(d) {
  const row = docRows.get(d.id);
  if (!row) return;
  row.classList.toggle("loading", !!d.loading);
  row._meta.textContent = docMeta(d);
  const bar = docBar(d);
  row._prog.hidden = bar == null;
  if (bar != null) row._prog.firstChild.style.transform = `scaleX(${Math.max(0.02, bar)})`;
  row._prog.classList.toggle("up", d.upload != null);
  if (row._nm.textContent !== d.name) { row._nm.textContent = d.name; row._nm.title = d.name; }
  row._sw.style.background = d.color;
  // The note, asked on the row once the record exists; nothing waits for it.
  if (d.askNote && !row._note) {
    const f = el("form", "notefield");
    f.innerHTML = `<input maxlength="500" placeholder="What changed in this run? One line for its card" aria-label="Note for ${esc(d.name)}"><button type="submit" class="sm">Save</button><button type="button" class="sm ghost" title="Skip">✕</button>`;
    const input = f.querySelector("input");
    const done = () => { d.askNote = null; f.remove(); row._note = null; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const note = input.value.trim(), id = d.askNote;
      done();
      if (!note) return;
      try { await lib.setNote(id, note); toast("Note saved", "ok"); }
      catch (err) { toast("Could not save the note: " + (err?.message || err), "err"); }
    };
    f.querySelector("button[type=button]").onclick = done;
    input.onkeydown = e => { if (e.key === "Escape") done(); };
    row.appendChild(f);
    row._note = f;
    if (!document.activeElement || document.activeElement === document.body) input.focus({ preventScroll: true });
  }
}
function renderDocList() {
  const list = $("#doclist");
  const live = new Set(S.docs.map(d => d.id));
  for (const [id, row] of docRows) if (!live.has(id)) { row.remove(); docRows.delete(id); }
  for (const d of S.docs) {
    let row = docRows.get(d.id);
    if (!row) {
      row = el("div", "doc");
      row.innerHTML = `<span class="swatch"></span><span class="nm"></span><span class="meta"></span><div class="prog" hidden><i></i></div>`;
      row._sw = row.children[0]; row._nm = row.children[1]; row._meta = row.children[2]; row._prog = row.children[3];
      const x = el("button", "x", "✕");
      x.title = "Close this report";
      x.setAttribute("aria-label", "Close " + d.name);
      x.onclick = () => removeDoc(d.id);
      row.insertBefore(x, row._prog);
      docRows.set(d.id, row);
    }
    list.appendChild(row);   // moves it into order; a no-op when it already is
    refreshDoc(d);
  }
  $("#doclist-empty").hidden = S.docs.length > 0;
  $("#addtolib").checked = S.addToLibrary;
}

/* ---- the Library list ---- */
const libRows = new Map();   // record id -> row element
function renderLibList() {
  const ll = $("#liblist");
  const note = ll.querySelector(".lib-note");
  const setNote = (cls, html) => {
    let n = ll.querySelector(".lib-note");
    if (!html) { n?.remove(); return; }
    if (!n) { n = el("div"); ll.prepend(n); }
    n.className = "lib-note" + (cls ? " " + cls : ""); n.innerHTML = html;
  };
  if (S.libError) { setNote("err", "Library unavailable: " + esc(S.libError)); }
  else if (!S.library) { setNote("", `<span class="skel-line"></span><span class="skel-line short"></span>`); }
  else if (!S.library.length) setNote("", "Nothing here yet. Open a PDF and it is added for everyone.");
  else setNote(null, null);
  void note;

  const recs = S.library || [];
  const live = new Set(recs.map(r => r.id));
  for (const [id, row] of libRows) if (!live.has(id)) { row.remove(); libRows.delete(id); }
  const q = S.libQuery.trim().toLowerCase();
  let shown = 0;
  for (const r of recs) {
    let row = libRows.get(r.id);
    if (!row) {
      row = el("div", "doc lib");
      row.innerHTML = `<span class="swatch"></span><span class="nm"></span><span class="meta"></span>`;
      const acts = el("span", "acts");
      const o = el("button", "sm", "Open");
      o.onclick = () => openReport(S.library.find(x => x.id === r.id));
      const m = el("button", "sm ghost", "⋯");
      m.title = "Rename, note or delete";
      m.setAttribute("aria-label", "More for " + r.name);
      m.onclick = (e) => reportMenu(r.id, e.currentTarget);
      acts.append(o, m);
      row.appendChild(acts);
      row._o = o;
      row.onmouseenter = () => prefetch(r.id);
      libRows.set(r.id, row);
    }
    const open = S.docs.find(d => d.reportId === r.id);
    const sig = [r.name, r.note, r.pages, r.panels, r.size, r.createdAt, open ? open.color : ""].join("|");
    if (row._sig !== sig) {
      row._sig = sig;
      const [sw, nm, meta] = row.children;
      sw.style.background = open ? open.color : "transparent";
      sw.style.border = "1px solid " + (open ? open.color : "var(--line)");
      nm.textContent = r.name; nm.title = r.note ? r.name + "\n" + r.note : r.name;
      meta.textContent = `${r.pages}p · ${r.panels} · ${fmtMB(r.size)} · ${shortDate(r.createdAt)}`;
      row.classList.toggle("open", !!open);
      row._o.disabled = !!open; row._o.title = open ? "Already open" : "Open this report";
    }
    const match = !q || r.name.toLowerCase().includes(q) || (r.note || "").toLowerCase().includes(q);
    row.hidden = !match;
    if (match) shown++;
    ll.appendChild(row);
  }
  if (S.library && S.library.length && !shown) setNote("", "No report matches.");
  $("#libcount").textContent = S.library ? `${S.library.length}` : "";
}

/* Re-render the active view once per frame at most, however many documents
   finish loading in it. */
let renderFrame = 0;
export function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); });
}

export function render() {
  if (!inViewer()) return;
  cancelAnimationFrame(renderFrame); renderFrame = 0;
  const main = $("#vmain");
  main.innerHTML = "";
  if (!S.docs.length) { main.appendChild(viewerRoot._empty); return; }
  if (!S.docs.some(d => d.index)) { main.appendChild(skeletonColumns()); return; }
  if (S.tab === "pages") renderPages(main);
  else if (S.tab === "panels") renderPanelView(main);
  else if (S.tab === "overlay") renderOverlay(main);
  else if (S.tab === "summary") renderSummary(main);
  syncUrl();
}

/* What the Viewer shows while its reports are still arriving: a column per
   report with page-shaped placeholders, instead of the "Compare CFD reports"
   welcome card, which read as "nothing happened". */
function skeletonColumns() {
  const wrap = el("div", "vcols skel");
  for (const d of S.docs) {
    const col = el("div", "vcol");
    col.innerHTML = `<div class="vcol-h"><span class="swatch" style="background:${d.color}"></span><span class="nm">${esc(d.name)}</span><span class="meta">${esc(docMeta(d))}</span></div>
      <div class="scroller"><div class="skel-page"></div><div class="skel-page"></div></div>`;
    wrap.appendChild(col);
  }
  return wrap;
}

/* ---------- wiring ---------- */

function pick() { $("#filepick").click(); }
$("#filepick").onchange = e => {
  const files = [...e.target.files].filter(f => /\.pdf$/i.test(f.name));
  e.target.value = "";
  if (files.length) { if (S.page !== "viewer") setTab("viewer"); ingest(files); }
};
setZoomListener(updateZoomLabel);

// Drag and drop anywhere.
let dragDepth = 0;
addEventListener("dragenter", e => { e.preventDefault(); if (++dragDepth === 1) $("#drop").classList.add("on"); });
addEventListener("dragleave", e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $("#drop").classList.remove("on"); } });
addEventListener("dragover", e => e.preventDefault());
addEventListener("drop", e => {
  e.preventDefault(); dragDepth = 0; $("#drop").classList.remove("on");
  const files = [...(e.dataTransfer?.files || [])].filter(f => /\.pdf$/i.test(f.name));
  if (files.length) { if (S.page !== "viewer") setTab("viewer"); ingest(files); }
  else toast("Those were not PDFs.", "err");
});

addEventListener("keydown", e => {
  if (S.page !== "viewer" || shell.lightboxOpen()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); focusSearch(); return; }
  if (typing) return;
  if (e.key === "s" || e.key === "S") { S.sync = !S.sync; setSync(S.sync); renderChrome(); }
  if (e.key === "r" || e.key === "R") { resyncAndLock(); renderChrome(); }
  if (e.key === "j" || e.key === "k") {
    const rows = panelRows(); if (!rows.length) return;
    const i = Math.max(0, rows.findIndex(r => r.id === S.panelId));
    const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === "j" ? 1 : -1)))];
    if (next) selectPanel(next.id);
  }
  if (e.key >= "1" && e.key <= "4") setViewTab(TABS[+e.key - 1].id);
});

/* The page view follows its columns' width itself (a ResizeObserver per
   column, rescaling in place). The other views re-render, once the window
   has stopped moving. */
let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (S.docs.length && inViewer() && S.tab !== "pages") render(); }, 150);
});

/* Inline handlers in shell and dashboard markup. */
window.cfd = {
  setTab, pick, saveView, openView, renameView, deleteView,
  openInViewer, renameReport, editNote, deleteReport, reportMenu, prefetch,
  closeLightbox: shell.closeLightbox, lbStep: shell.lbStep,
};

$("#lightbox-root").innerHTML = shell.lightboxHtml();
shell.installLightbox();
renderPage();

lib.watchReports(recs => {
  S.library = recs; S.libError = null;
  schedulePage();
  splashStep("library", 1);
  applyUrl();
}, err => { S.libError = err?.code || err?.message || String(err); schedulePage(); splashStep("library", -1); });
lib.watchViews(views => { S.views = views; schedulePage(); splashStep("views", 1); },
  () => splashStep("views", -1));

/* Once the page is up and the browser has nothing better to do, fetch pdf.js
   and its worker, so the first report opened does not wait for them. */
(window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => {
  loadPdfjs().then(() => fetch(new URL("./vendor/pdf.worker.mjs", import.meta.url), { priority: "low" })).catch(() => {});
}, { timeout: 4000 });

// Handy in the console and used by the browser-driven checks.
window.CFD = { S, addDocs, ingest, openReport, openReports, setViewTab, render, renderChrome, renderPage, setTab, panelRows, selectPanel, currentQuery, isMobile, APP_VERSION };
