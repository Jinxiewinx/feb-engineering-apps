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

import * as pdfjs from "./vendor/pdf.mjs";
import { indexDocument, withContentSpace, matchPanels } from "./indexer.js";
import { clearCache, measureMargins, renderPanel } from "./render.js";
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

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.mjs", import.meta.url).href;

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
  uploads: {},           // docId -> 0..1 while an upload is in flight; -1 while downloading
};

const TABS = [
  { id: "pages", label: "Pages" },
  { id: "panels", label: "Panels" },
  { id: "overlay", label: "Overlay" },
  { id: "summary", label: "Summary" },
];

/* ---------- loading ---------- */

let seq = 0;
/* sources: [{ name, data: Uint8Array } | { name, file: File }], optionally with
   reportId when the bytes came from the library. Returns the docs it made
   (null where a source failed), so a caller can go on to upload them. */
export async function addDocs(sources) {
  const made = [];
  for (const src of sources) {
    const id = "d" + (++seq);
    const doc = {
      id, name: src.name.replace(/\.pdf$/i, ""), color: COLORS[(S.docs.length) % COLORS.length],
      pdf: null, index: null, loading: true, reportId: src.reportId || null,
    };
    S.docs.push(doc);
    renderChrome();
    try {
      const data = src.data || new Uint8Array(await src.file.arrayBuffer());
      // Keep the loading task: in pdf.js 6 the document proxy has no destroy(),
      // so tearing a report down goes through the task, not the proxy.
      // pdf.js transfers the buffer to its worker (detaching it), so the caller
      // keeps its own copy if it still needs the bytes: see ingest().
      doc.task = pdfjs.getDocument({ data });
      doc.pdf = await doc.task.promise;
      doc.index = await indexDocument(doc.pdf);
      // Drop the page print margins so a plot spanning a page break renders as
      // one continuous image. Needs a canvas, so it runs here rather than inside
      // the (node-testable) indexer.
      const margins = await measureMargins(doc);
      doc.index = withContentSpace(doc.index, margins);
      doc.loading = false;
      made.push(doc);
      renderChrome(); render();
    } catch (e) {
      console.error(e);
      S.docs = S.docs.filter(d => d.id !== id);
      made.push(null);
      toast("Could not read " + src.name + ": " + (e && e.message), "err");
      renderChrome(); render();
    }
  }
  // Two documents is the case the app is for, so start comparing immediately.
  if (S.docs.length >= 2 && !S.panelId) {
    const first = S.docs[0].index?.panels?.[0];
    if (first) S.panelId = first.id;
  }
  return made;
}

export function removeDoc(id) {
  const d = S.docs.find(x => x.id === id);
  // Tear down through the loading task, guarded: a failed teardown must never
  // stop the report from being removed from the list, which is the bug this
  // replaces (destroy() threw and the filter below never ran).
  try { d?.task?.destroy?.(); } catch (e) { console.warn("pdf teardown failed", e); }
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
   contour, else the first plot. Rendered from the open document at 640 px
   wide, so it costs one canvas and no second read. */
async function thumbnail(doc) {
  const panels = doc.index.panels;
  const panel = panels.find(p => p.name === THUMB_PANEL)
    || panels.find(p => p.section === "Contours")
    || panels[0];
  if (!panel) return null;
  const canvas = await renderPanel(doc, panel, 640);
  const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
  return blob ? { blob, panel: panel.name, w: canvas.width, h: canvas.height } : null;
}

/* Fill in whatever a record is missing, from the open document. Runs after
   an upload (the record is fresh) and after opening an older record (the
   record predates the dashboard). Anyone may write these four fields. */
async function backfill(doc, rec) {
  const patch = {};
  const hasNums = rec.results && rec.results.total, hasMeta = rec.meta && Object.keys(rec.meta).length;
  if (!hasNums || rec.dp == null || !hasMeta) {
    const ex = extractAll(doc, rec.name);
    // Only what actually changed, so a report with no numbers is not
    // rewritten with the same empty map on every open.
    for (const k of ["dp", "results", "meta"]) if (JSON.stringify(ex[k]) !== JSON.stringify(rec[k] ?? null)) patch[k] = ex[k];
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

/* Local files, from the picker or a drop. Each is opened first (so the
   indexer has run), then uploaded to the library unless the checkbox says
   not to, with its numbers, its thumbnail, and a note if the uploader types
   one. The upload gets the original bytes; the viewer got a copy, because
   pdf.js detaches what it is handed. */
async function ingest(files) {
  if (isMobile()) { files = files.slice(0, 1); for (const d of [...S.docs]) removeDoc(d.id); }
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const [doc] = await addDocs([{ name: f.name, data: bytes.slice() }]);
    if (!doc || !S.addToLibrary) continue;
    if (bytes.byteLength >= lib.MAX_BYTES) { toast(`${doc.name}: open, but over the library's ${fmtMB(lib.MAX_BYTES)} limit, so not uploaded`, "err"); continue; }
    S.uploads[doc.id] = 0; renderChrome();
    try {
      const ex = extractAll(doc, f.name);
      const rec = await lib.upload(bytes, f.name, { pages: doc.index.numPages, panels: doc.index.panels.length, ...ex },
        p => { S.uploads[doc.id] = p; renderChrome(); });
      doc.reportId = rec.id;
      if (rec.existing) { toast(`Already in the library as "${rec.name}"`); await backfill(doc, rec); }
      else {
        toast(`Added "${rec.name}" to the library`, "ok");
        await backfill(doc, { ...rec, thumb: null });
        const note = prompt(`What changed in "${rec.name}"?\n\nOne line, shown on its card. Leave blank to skip.`, "");
        if (note && note.trim()) await lib.setNote(rec.id, note.trim());
      }
    } catch (e) {
      console.error(e);
      toast("Upload failed: " + (e?.message || e), "err");
    } finally {
      delete S.uploads[doc.id]; renderChrome(); syncUrl();
    }
  }
}

/* A library record: fetch its bytes and open it, once; then backfill what
   the record lacks. */
export async function openReport(rec, opts = {}) {
  if (S.docs.some(d => d.reportId === rec.id)) { if (!opts.quiet) toast(`"${rec.name}" is already open`); return; }
  if (isMobile()) for (const d of [...S.docs]) removeDoc(d.id);   // one at a time on a phone
  const id = "d" + (seq + 1);
  S.uploads[id] = -1; // -1: downloading, indeterminate
  try {
    const data = await lib.fetchBytes(rec);
    const [doc] = await addDocs([{ name: rec.name, data, reportId: rec.id }]);
    if (doc) backfill(doc, rec);
  } catch (e) {
    console.error(e);
    toast("Could not open " + rec.name + ": " + (e?.message || e), "err");
  } finally {
    delete S.uploads[id]; renderChrome(); syncUrl();
  }
}
/* From a dashboard card: open it and go to the viewer. */
export async function openInViewer(id) {
  const rec = (S.library || []).find(r => r.id === id); if (!rec) return;
  setTab("viewer");
  await openReport(rec, { quiet: true });
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
  const missing = [];
  for (const id of ids) {
    const rec = S.library.find(r => r.id === id);
    if (rec) await openReport(rec, { quiet: true }); else missing.push(id);
  }
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

/* ---------- viewer chrome ---------- */

function inViewer() { return viewerRoot && viewerRoot.parentNode; }

export function renderChrome() {
  if (!inViewer()) { if (S.page === "dashboard" && S.library) $("#main").innerHTML = renderDashboard(); return; }
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  const mobile = isMobile();
  if (mobile && !["pages", "panels"].includes(S.tab)) S.tab = "pages";
  for (const t of TABS) {
    if (mobile && !["pages", "panels"].includes(t.id)) continue;
    const b = el("button", S.tab === t.id ? "active" : "", t.label);
    b.onclick = () => { S.tab = t.id; render(); renderChrome(); syncUrl(); };
    b.disabled = (t.id === "overlay" || t.id === "summary") && S.docs.length < 2;
    tabs.appendChild(b);
  }
  $("#saveview").disabled = !S.docs.some(d => d.reportId);
  const mp = $("#mobilepick");
  const cur = S.docs[0]?.reportId || "";
  mp.innerHTML = `<option value="" ${cur ? "" : "selected"} disabled>${S.docs.length ? esc(S.docs[0].name) : "Pick a report…"}</option>` +
    (S.library || []).map(r => `<option value="${esc(r.id)}" ${r.id === cur ? "selected" : ""}>${esc(r.name)}${Number.isInteger(r.dp) ? ` (DP ${r.dp})` : ""}</option>`).join("") +
    `<option value="__pick">Open a PDF from this phone…</option>`;

  // Open reports.
  const list = $("#doclist");
  list.innerHTML = "";
  for (const d of S.docs) {
    const row = el("div", "doc" + (d.loading ? " loading" : ""));
    const up = S.uploads[d.id];
    const meta = d.loading ? "reading…" : up != null && up >= 0 ? `uploading ${Math.round(up * 100)}%` : d.index.numPages + "p · " + d.index.panels.length;
    row.innerHTML = `<span class="swatch" style="background:${d.color}"></span>
      <span class="nm" title="${esc(d.name)}">${esc(d.name)}</span>
      <span class="meta">${esc(meta)}</span>`;
    if (up != null && up >= 0) row.appendChild(el("div", "prog", `<i style="width:${Math.round(up * 100)}%"></i>`));
    const x = el("button", "x", "✕");
    x.title = "Close this report";
    x.onclick = () => removeDoc(d.id);
    row.appendChild(x);
    list.appendChild(row);
  }
  $("#doclist-empty").hidden = S.docs.length > 0;
  $("#addtolib").checked = S.addToLibrary;

  // The library.
  const ll = $("#liblist");
  ll.innerHTML = "";
  const q = S.libQuery.trim().toLowerCase();
  if (S.libError) ll.appendChild(el("div", "lib-note err", "Library unavailable: " + esc(S.libError)));
  else if (!S.library) ll.appendChild(el("div", "lib-note", "Loading the library…"));
  else {
    const recs = S.library.filter(r => !q || r.name.toLowerCase().includes(q) || (r.note || "").toLowerCase().includes(q));
    if (!S.library.length) ll.appendChild(el("div", "lib-note", "Nothing here yet. Open a PDF and it is added for everyone."));
    else if (!recs.length) ll.appendChild(el("div", "lib-note", "No report matches."));
    const busy = Object.values(S.uploads).some(v => v === -1);
    for (const r of recs) {
      const open = S.docs.find(d => d.reportId === r.id);
      const row = el("div", "doc lib" + (open ? " open" : ""));
      row.innerHTML = `<span class="swatch" style="background:${open ? open.color : "transparent"};border:1px solid ${open ? open.color : "var(--line)"}"></span>
        <span class="nm" title="${esc(r.note ? r.name + "\n" + r.note : r.name)}">${esc(r.name)}</span>
        <span class="meta">${r.pages}p · ${r.panels} · ${fmtMB(r.size)} · ${shortDate(r.createdAt)}</span>`;
      const acts = el("span", "acts");
      const o = el("button", "sm", "Open"); o.disabled = !!open || busy; o.title = open ? "Already open" : "Open this report";
      o.onclick = () => openReport(r);
      const m = el("button", "sm ghost", "⋯"); m.title = "Rename, note or delete";
      m.onclick = () => reportMenu(r.id);
      acts.append(o, m);
      row.appendChild(acts);
      ll.appendChild(row);
    }
  }
  $("#libcount").textContent = S.library ? `${S.library.length}` : "";

  $("#synccontrols").style.display = S.tab === "pages" ? "" : "none";
  $("#synctoggle").classList.toggle("on", S.sync);
  $("#synctoggle").querySelector(".lbl").textContent = S.sync ? "Synced" : "Free";
  $("#resync").disabled = S.docs.length < 2;
  viewerRoot.querySelector(".ctl.zoom").style.display = (S.tab === "pages" || S.tab === "panels") ? "" : "none";
  const z = S.tab === "pages" && S.docs.length ? currentZoom() : S.zoom;
  $("#zoomlabel").textContent = S.fit ? "Fit" : Math.round(z * 100) + "%";
  renderSearch();
}

export function render() {
  if (!inViewer()) return;
  const main = $("#vmain");
  main.innerHTML = "";
  if (!S.docs.length) { main.appendChild(viewerRoot._empty); return; }
  if (S.tab === "pages") renderPages(main);
  else if (S.tab === "panels") renderPanelView(main);
  else if (S.tab === "overlay") renderOverlay(main);
  else if (S.tab === "summary") renderSummary(main);
  syncUrl();
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
  if (e.key >= "1" && e.key <= "4") { S.tab = TABS[+e.key - 1].id; render(); renderChrome(); syncUrl(); }
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
  openInViewer, renameReport, editNote, deleteReport, reportMenu,
  closeLightbox: shell.closeLightbox, lbStep: shell.lbStep,
};

$("#lightbox-root").innerHTML = shell.lightboxHtml();
shell.installLightbox();
renderPage();

lib.watchReports(recs => {
  S.library = recs; S.libError = null;
  if (S.page === "dashboard") renderPage(); else renderChrome();
  splashStep("library", 1);
  applyUrl();
}, err => { S.libError = err?.code || err?.message || String(err); if (S.page === "dashboard") renderPage(); else renderChrome(); splashStep("library", -1); });
lib.watchViews(views => { S.views = views; if (S.page === "dashboard") renderPage(); splashStep("views", 1); },
  () => splashStep("views", -1));

// Handy in the console and used by the browser-driven checks.
window.CFD = { S, addDocs, ingest, openReport, render, renderChrome, renderPage, setTab, panelRows, selectPanel, currentQuery, isMobile, APP_VERSION };
