/* The in-memory stand-in for app/library.js that the browser suites route in
   place of the real one (test_viewer_smoke.mjs, test_perf.mjs). Two library
   records that both fetch the DP_22 fixture, one saved view, and window.__stub
   recording what the app handed to the library. */

export const THUMB = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
export const LIB_STUB = `
export const usingEmulators = false;
export const MAX_BYTES = 60 * 1024 * 1024;
const results = (lift, drag) => ({ total: { lift, drag, cl: lift / 245, cd: drag / 245 } });
const recs = [
  { id: "RPT-AAAAAAAA", name: "DP_22", dp: 22, path: "reports/RPT-AAAAAAAA/report.pdf", size: 8470000, sha256: "a".repeat(64), pages: 39, panels: 59, note: "baseline", createdAt: "2026-09-01T00:00:00Z",
    results: results(-486.6, 179.6), meta: { analyst: "beldon", cells: 5304451 }, thumb: { path: "reports/RPT-AAAAAAAA/thumb.png", url: "${THUMB}", panel: "stat-car-0" } },
  { id: "RPT-BBBBBBBB", name: "DP_23", dp: 23, path: "reports/RPT-BBBBBBBB/report.pdf", size: 8470000, sha256: "b".repeat(64), pages: 39, panels: 59, note: "", createdAt: "2026-09-02T00:00:00Z",
    results: results(-501.2, 183.0), meta: {}, thumb: { path: "reports/RPT-BBBBBBBB/thumb.png", url: "${THUMB}", panel: "stat-car-0" } },
];
const views = [{ id: "VW-AAAAAAAA", name: "22 vs 23 swipe", query: "p=viewer&open=RPT-AAAAAAAA,RPT-BBBBBBBB&tab=overlay", reports: ["RPT-AAAAAAAA", "RPT-BBBBBBBB"], createdAt: "2026-09-02T00:00:00Z" }];
window.__stub = { uploads: [], thumbs: [], patches: [], savedViews: [] };
let listener = null, vlistener = null;
export function watchReports(cb) { listener = cb; setTimeout(() => cb(recs.slice()), 0); return () => {}; }
export function watchViews(cb) { vlistener = cb; setTimeout(() => cb(views.slice()), 0); return () => {}; }
export async function findByHash() { return null; }
export async function sha256Hex() { return "c".repeat(64); }
export function newId() { return "RPT-CCCCCCCC"; }
export function cleanName(n) { return String(n || "report").replace(/\\.pdf$/i, "").trim().slice(0, 120); }
export async function uploadPdf(id, bytes, onProgress) {
  onProgress?.(0.5); onProgress?.(1);
  window.__stub.pdfs = (window.__stub.pdfs || 0) + 1;
  return "reports/" + id + "/report.pdf";
}
export async function createRecord(r) {
  const rec = { ...r, name: cleanName(r.name), note: "", createdAt: new Date().toISOString() };
  window.__stub.uploads.push({ name: r.name, bytes: r.size, meta: { pages: r.pages, panels: r.panels, dp: r.dp, results: r.results, meta: r.meta }, thumb: r.thumb || null });
  recs.unshift(rec);
  listener?.(recs.slice());   // what the real onSnapshot does after a write
  return rec;
}
export async function uploadThumb(id, blob, panel) { window.__stub.thumbs.push({ id, size: blob.size, panel }); return { path: "reports/" + id + "/thumb.png", url: "${THUMB}", panel }; }
export async function patch(id, fields) { window.__stub.patches.push({ id, fields }); const r = recs.find(r => r.id === id); if (r) Object.assign(r, fields); listener?.(recs.slice()); }
export async function fetchBytes(rec, onProgress) {
  window.__stub.fetches = (window.__stub.fetches || 0) + 1;
  const res = await fetch("/test/fixtures/DP_22.pdf?" + rec.id);
  onProgress?.(1);
  return new Uint8Array(await res.arrayBuffer());
}
export async function rename() {}
export async function setNote(id, note) { window.__stub.notes = [...(window.__stub.notes || []), { id, note }]; const r = recs.find(r => r.id === id); if (r) r.note = note; listener?.(recs.slice()); }
export async function remove(rec) { window.__stub.removed = [...(window.__stub.removed || []), rec.id]; }
export async function saveView(name, query, reports) { window.__stub.savedViews.push({ name, query, reports }); views.unshift({ id: "VW-B", name, query, reports, createdAt: new Date().toISOString() }); vlistener?.(views.slice()); }
export async function renameView() {}
export async function removeView() {}
`;
