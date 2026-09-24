/* library.js — the shared report library. The ONLY file that talks to Firebase.

   No auth anywhere in here, on purpose: the library is open to anyone with
   the link (Simon, 2026-09-02). What bounds an open, billed bucket is the
   rules (../firestore.rules, ../storage.rules): one PDF per record, 60 MB,
   a fixed record shape. This file keeps to that shape and does the one thing
   the rules cannot, which is refusing to upload a file whose hash is already
   in the library.

   Records are small on purpose (DECISIONS.md #3): the page and panel index is
   recomputed from the PDF on open, never stored. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, updateDoc,
  deleteDoc, getDocs, query, where, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  getStorage, connectStorageEmulator, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const cfg = window.FIREBASE_CONFIG;
if (!cfg || !cfg.projectId) throw new Error("FIREBASE_CONFIG missing: edit firebase-config.js");

const app = initializeApp(cfg);
/* The library and the views are kept in IndexedDB between visits, so the
   Dashboard paints from the last copy at once and the listener brings it up
   to date. Where IndexedDB is unavailable the SDK falls back to memory. */
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const storage = getStorage(app);

// Local dev: talk to the emulators on this app's offset ports (firebase.json).
// Set useEmulators: false in firebase-config.js to test localhost against prod.
const onLocalhost = ["localhost", "127.0.0.1"].includes(location.hostname);
export const usingEmulators = cfg.useEmulators === true || (cfg.useEmulators !== false && onLocalhost);
if (usingEmulators) {
  connectFirestoreEmulator(db, "127.0.0.1", 8090);
  connectStorageEmulator(storage, "127.0.0.1", 9198);
}

export const MAX_BYTES = 60 * 1024 * 1024;   // mirrors storage.rules and firestore.rules
const COLL = "reports";
const VIEWS = "views";

/* Every reader gets the whole library, newest first, live. A few hundred
   records at ~300 bytes each is one cheap listener. */
export function watchReports(cb, onError) {
  const q = query(collection(db, COLL), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => normalise(d.data())));
  }, err => { console.error("library", err); onError?.(err); });
}
function normalise(r) {
  const t = r.createdAt;
  return { ...r, note: r.note || "", createdAt: t && typeof t.toDate === "function" ? t.toDate().toISOString() : (t || null) };
}

export async function findByHash(sha256) {
  const snap = await getDocs(query(collection(db, COLL), where("sha256", "==", sha256)));
  return snap.empty ? null : normalise(snap.docs[0].data());
}

export async function sha256Hex(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* Ids are made here rather than from a counter: a counter needs a transaction
   on meta/, and that rule assumes a roster member. Eight base32 characters
   is 40 bits; a collision inside one team's library is not a real event. */
const B32 = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function newId() {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return "RPT-" + [...a].map(v => B32[v % B32.length]).join("");
}

/* Uploads are content-addressed in effect (a record never changes its file),
   so browsers and the CDN may keep them for good. */
const IMMUTABLE = "public, max-age=31536000, immutable";

/* Upload a PDF's bytes under a record id made with newId(). Starts at once,
   while the app is still reading the file; the record is written afterwards
   by createRecord(), once, with everything in it. Storage first, then
   Firestore: a record never points at a file that is not there. Resolves to
   the storage path. */
export async function uploadPdf(id, bytes, onProgress) {
  if (bytes.byteLength >= MAX_BYTES) throw new Error(`Over the ${Math.round(MAX_BYTES / 1048576)} MB library limit`);
  const path = `${COLL}/${id}/report.pdf`;
  const task = uploadBytesResumable(sRef(storage, path), bytes, { contentType: "application/pdf", cacheControl: IMMUTABLE });
  await new Promise((res, rej) => task.on("state_changed",
    s => onProgress?.(s.bytesTransferred / s.totalBytes), rej, res));
  return path;
}

/* The record for an uploaded PDF. `r` carries id, name, path, size, sha256,
   pages, panels, dp, results, meta and, if there is one, thumb. */
export async function createRecord(r) {
  const rec = {
    id: r.id, name: cleanName(r.name), path: r.path, size: r.size, sha256: r.sha256,
    pages: r.pages | 0, panels: r.panels | 0, createdAt: serverTimestamp(),
    dp: Number.isInteger(r.dp) ? r.dp : null,
    results: r.results && typeof r.results === "object" ? r.results : {},
    meta: r.meta && typeof r.meta === "object" ? r.meta : {},
  };
  if (r.thumb) rec.thumb = r.thumb;
  await setDoc(doc(db, COLL, r.id), rec);
  return { ...rec, note: "", createdAt: new Date().toISOString() };
}
export function cleanName(name) {
  const n = String(name || "report").replace(/\.pdf$/i, "").trim();
  return (n || "report").slice(0, 120);
}

/* Fetch the PDF bytes for a record. getDownloadURL carries a token that
   bypasses rules, and the bucket's CORS (../cors.json) is what lets fetch()
   read it from the hosting origin. */
export async function fetchBytes(rec, onProgress) {
  const url = await getDownloadURL(sRef(storage, rec.path));
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + rec.name);
  const total = +res.headers.get("content-length") || rec.size || 0;
  if (!onProgress || !res.body || !total) return new Uint8Array(await res.arrayBuffer());
  // Streamed, so the Open list can say how far along the download is.
  const parts = [];
  let n = 0;
  for (const reader = res.body.getReader(); ;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.byteLength;
    onProgress(Math.min(1, n / total));
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.byteLength; }
  return out;
}

/* Whatever a record is missing: dp, results, meta, thumb. The rules let
   anyone write those four and nothing else, so an old record catches up the
   first time anyone opens it. */
export async function patch(id, fields) {
  const allowed = {};
  for (const k of ["dp", "results", "meta", "thumb"]) if (k in fields) allowed[k] = fields[k];
  if (Object.keys(allowed).length) await updateDoc(doc(db, COLL, id), allowed);
}

/* The card thumbnail, next to the report in the bucket. Returns the thumb
   field for the record. */
export async function uploadThumb(id, blob, panel) {
  const path = `${COLL}/${id}/thumb.png`;
  const r = sRef(storage, path);
  const task = uploadBytesResumable(r, blob, { contentType: "image/png", cacheControl: IMMUTABLE });
  await new Promise((res, rej) => task.on("state_changed", null, rej, res));
  const url = await getDownloadURL(r);
  return { path, url, panel: String(panel || "").slice(0, 120) };
}

export async function rename(id, name) {
  await updateDoc(doc(db, COLL, id), { name: cleanName(name) });
}
export async function setNote(id, note) {
  await updateDoc(doc(db, COLL, id), { note: String(note || "").slice(0, 500) });
}
/* Files first, then the record; a missing file counts as already gone. */
export async function remove(rec) {
  for (const path of [rec.path, rec.thumb && rec.thumb.path].filter(Boolean)) {
    try { await deleteObject(sRef(storage, path)); }
    catch (e) { if (e?.code !== "storage/object-not-found") throw e; }
  }
  await deleteDoc(doc(db, COLL, rec.id));
}

/* ---------- saved views ----------
   A view is a name for a viewer URL query: which reports, which tab, which
   plot, which overlay. The report ids ride alongside so the Dashboard can
   say "DP_22 vs DP_23" without parsing the query. */
export function watchViews(cb, onError) {
  const q = query(collection(db, VIEWS), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => cb(snap.docs.map(d => normalise(d.data()))),
    err => { console.error("views", err); onError?.(err); });
}
export async function saveView(name, queryString, reportIds) {
  const id = "VW-" + newId().slice(4);
  const rec = { id, name: String(name).slice(0, 80), query: String(queryString).slice(0, 600),
    reports: reportIds.slice(0, 12), createdAt: serverTimestamp() };
  await setDoc(doc(db, VIEWS, id), rec);
  return { ...rec, createdAt: new Date().toISOString() };
}
export async function renameView(id, name) { await updateDoc(doc(db, VIEWS, id), { name: String(name).slice(0, 80) }); }
export async function removeView(id) { await deleteDoc(doc(db, VIEWS, id)); }
