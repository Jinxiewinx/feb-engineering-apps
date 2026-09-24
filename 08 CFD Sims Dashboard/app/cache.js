/* cache.js — what this browser keeps so a report opens instantly the second
   time. Local to the viewer's machine, never shared, and keyed by the report's
   sha256, which is already its identity in the library (the same bytes are
   never stored twice). Content that cannot change needs no invalidation.

   - The PDF bytes, in the Cache API. A second open, a saved view, a link from
     a colleague: no download. Least recently used goes first past BYTES_MAX.
   - The index (pages, panels, text, margins), in IndexedDB. A second open skips
     reading every page's text and the margin pass, which is most of what
     "reading…" was. INDEX_VERSION is part of the key: bump it whenever
     indexer.js or the margin measurement changes what they produce.

   Everything here fails soft. A private window, a full disk, a browser that
   blocks storage: every call returns null or does nothing, and the app goes
   to the network exactly as it did before this file existed. DECISIONS.md #9. */

export const INDEX_VERSION = 1;
const BYTES_MAX = 1024 * 1024 * 1024;          // 1 GB of PDFs, about sixty reports
const CACHE = "cfd-pdf-v1";
const LRU_KEY = "cfd.pdfcache";                // { sha: { size, used } }
const urlFor = (sha) => new URL(`__pdf/${sha}`, location.href).href;

function lru() { try { return JSON.parse(localStorage.getItem(LRU_KEY) || "{}"); } catch { return {}; } }
function saveLru(m) { try { localStorage.setItem(LRU_KEY, JSON.stringify(m)); } catch { /* storage blocked */ } }

export async function getBytes(sha) {
  if (!sha || typeof caches === "undefined") return null;
  try {
    const c = await caches.open(CACHE);
    const res = await c.match(urlFor(sha));
    if (!res) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const m = lru(); m[sha] = { size: bytes.byteLength, used: Date.now() }; saveLru(m);
    return bytes;
  } catch { return null; }
}

export async function hasBytes(sha) {
  if (!sha || typeof caches === "undefined") return false;
  try { return !!(await (await caches.open(CACHE)).match(urlFor(sha))); } catch { return false; }
}

export async function putBytes(sha, bytes) {
  if (!sha || !bytes || typeof caches === "undefined") return;
  try {
    const c = await caches.open(CACHE);
    await c.put(urlFor(sha), new Response(bytes, { headers: { "content-type": "application/pdf" } }));
    const m = lru(); m[sha] = { size: bytes.byteLength, used: Date.now() };
    let total = Object.values(m).reduce((a, v) => a + (v.size || 0), 0);
    for (const [k] of Object.entries(m).sort((a, b) => a[1].used - b[1].used)) {
      if (total <= BYTES_MAX || k === sha) continue;
      await c.delete(urlFor(k));
      total -= m[k].size || 0;
      delete m[k];
    }
    saveLru(m);
  } catch { /* quota or blocked: the network path still works */ }
}

export async function dropBytes(sha) {
  if (!sha || typeof caches === "undefined") return;
  try { await (await caches.open(CACHE)).delete(urlFor(sha)); const m = lru(); delete m[sha]; saveLru(m); } catch { /* nothing to drop */ }
}

/* ---- the index, in IndexedDB ---- */

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open("cfd", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("index");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const idxKey = (sha) => `${sha}|${INDEX_VERSION}|${Math.min(window.devicePixelRatio || 1, 2)}`;

function tx(store, mode, fn) {
  return db().then(d => d && new Promise((resolve) => {
    try {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req?.result ?? null);
      t.onerror = t.onabort = () => resolve(null);
    } catch { resolve(null); }
  }));
}

export async function getIndex(sha) {
  if (!sha) return null;
  return (await tx("index", "readonly", s => s.get(idxKey(sha)))) || null;
}
export async function putIndex(sha, index) {
  if (!sha || !index) return;
  await tx("index", "readwrite", s => s.put(index, idxKey(sha)));
}
export async function dropIndex(sha) {
  if (!sha) return;
  await tx("index", "readwrite", s => s.delete(idxKey(sha)));
}
