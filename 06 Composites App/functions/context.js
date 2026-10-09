"use strict";
/* What "Ask Paul" can see, and how it finds things. Read-only, and the only
 * door: askPaul's tools call these four functions and nothing else.
 *
 * RECORDS. The team collections a roster member can already read in the app
 * (fb.js COLLECTIONS), loaded through the Admin SDK once per question and
 * flattened to plain text. Deliberately left out: roster, config, aiUsage,
 * notifications, pub, tracker, meta. Anything in the bin (deleted: true) is
 * skipped. Email addresses are cut down to their name part and *Email fields
 * dropped, because a name is what a person asks about and an address is not.
 *
 * DOCUMENTS. corpus.json, built by tools/build_ai_corpus.mjs from the
 * standards and datasheets the app ships. Nothing from anywhere else.
 *
 * SEARCH is keyword scoring, not embeddings: a few thousand records and ~450
 * sections score in milliseconds, there is no index to keep in sync, and a
 * part number or a lot code (the commonest thing asked) is exactly what
 * keyword search is good at.
 */

const COLLS = ["workOrders", "parts", "projects", "schedule", "budget", "documents", "stock", "stackplans", "molds", "items", "lots", "rnd"];
const KIND = {
  workOrders: "work order", parts: "part", projects: "issue", schedule: "schedule week", budget: "purchase",
  documents: "document", stock: "tooling board", stackplans: "stack plan", molds: "mold", items: "item or shelf",
  lots: "material lot", rnd: "R&D study",
};
// Bookkeeping, not facts anybody asks about.
const DROP = /^(createdAt|updatedAt|updatedBy|createdBy|deletedFiles|trashBatch|purgeAfter|lineId|rid|path|url|receiptUrl|receiptPath|thumb|meshPath|photoRefs|order|rev|seq|.*Email|.*Url)$/i;
const TITLE_KEYS = ["name", "partName", "title", "item", "label"];

const plain = (s) => String(s)
  .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => m.split("@")[0])
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/* A record as indented "key: value" lines, depth-limited. Arrays of objects
 * (steps, lines, comments, coupons) become one compact line each. */
function flatten(v, depth = 0, key = "") {
  if (v == null || v === "") return [];
  if (typeof v === "string") { const t = plain(v); return t ? [t.length > 600 ? t.slice(0, 600) + "…" : t] : []; }
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (v && typeof v.toDate === "function") return [v.toDate().toISOString().slice(0, 10)];
  if (Array.isArray(v)) {
    const items = v.slice(0, 40).map((x) => (x && typeof x === "object" ? inline(x, depth + 1) : flatten(x, depth + 1).join(" "))).filter(Boolean);
    return items.length ? items.map((t) => "- " + t) : [];
  }
  if (typeof v === "object") {
    if (depth > 2) return [];
    const out = [];
    for (const [k, x] of Object.entries(v)) {
      if (DROP.test(k)) continue;
      const lines = flatten(x, depth + 1, k);
      if (!lines.length) continue;
      if (lines.length === 1 && !lines[0].startsWith("- ")) out.push(`${k}: ${lines[0]}`);
      else out.push(`${k}:`, ...lines.map((l) => "  " + l));
    }
    return out;
  }
  return [];
}
/* One line for an array item. Scalars as k=v, and one level of nested object
 * as k.sub=v, which is where a step keeps its buy-off (who signed, when). */
function inline(o, depth) {
  const bits = [];
  for (const [k, x] of Object.entries(o)) {
    if (DROP.test(k) || x == null || x === "") continue;
    if (typeof x !== "object") bits.push(`${k}=${plain(x).slice(0, 160)}`);
    else if (!Array.isArray(x) && typeof x.toDate !== "function") {
      for (const [k2, y] of Object.entries(x)) {
        if (!DROP.test(k2) && y != null && y !== "" && typeof y !== "object") bits.push(`${k}.${k2}=${plain(y).slice(0, 120)}`);
      }
    } else if (Array.isArray(x) && x.length && typeof x[0] !== "object") bits.push(`${k}=${x.slice(0, 12).map((y) => plain(y)).join(", ")}`);
  }
  return bits.join("; ").slice(0, 700) || flatten(o, depth).join("; ").slice(0, 400);
}

function titleOf(r) { for (const k of TITLE_KEYS) if (r[k]) return plain(r[k]).slice(0, 120); return ""; }

async function loadRecords(db) {
  const snaps = await Promise.all(COLLS.map((c) => db.collection(c).get()));
  const out = [];
  snaps.forEach((snap, i) => {
    const coll = COLLS[i];
    snap.forEach((d) => {
      const r = { id: d.id, ...d.data() };
      if (r.deleted) return;
      const body = flatten(r).join("\n");
      out.push({ id: r.id, coll, kind: KIND[coll], title: titleOf(r), body, hay: (r.id + " " + titleOf(r) + " " + body).toLowerCase() });
    });
  });
  return out;
}

/* ---------- scoring ---------- */
const STOP = new Set("a an the of and or to in on for is are was were what which who where when how why do does did be it this that with at by from as any all my our we i me you there their them".split(" "));
const terms = (q) => [...new Set(String(q || "").toLowerCase().split(/[^a-z0-9#.-]+/).map((t) => t.replace(/^[.-]+|[.-]+$/g, "")).filter((t) => t && !STOP.has(t)))];

function score(hay, head, ts) {
  let s = 0;
  for (const t of ts) {
    if (!hay.includes(t)) continue;
    let n = 0, i = -1;
    while ((i = hay.indexOf(t, i + 1)) !== -1 && n < 20) n++;
    s += 1 + Math.log(n);
    if (head.includes(t)) s += 3;           // a hit in the id or title is worth more
  }
  return s;
}

function searchRecords(records, query, kinds, limit = 12) {
  const ts = terms(query);
  const want = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
  return records
    .filter((r) => !want || want.has(r.coll))
    .map((r) => ({ r, s: ts.length ? score(r.hay, (r.id + " " + r.title).toLowerCase(), ts) : 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({ ref: r.id, kind: r.kind, title: r.title, snippet: r.body.replace(/\n/g, " · ").slice(0, 220) }));
}

function getRecord(records, id) {
  const r = records.find((x) => x.id.toLowerCase() === String(id || "").trim().toLowerCase());
  if (!r) return null;
  return { ref: r.id, kind: r.kind, title: r.title, text: r.body.slice(0, 6000) };
}

let CORPUS = null;
function corpus() {
  if (!CORPUS) {
    CORPUS = require("./corpus.json").sections.map((s) => ({ ...s, hay: (s.title + " " + s.section + " " + s.text).toLowerCase() }));
  }
  return CORPUS;
}
function searchDocs(query, limit = 6) {
  const ts = terms(query);
  return corpus()
    .map((s) => ({ s, sc: ts.length ? score(s.hay, (s.doc + " " + s.title + " " + s.section).toLowerCase(), ts) : 0 }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(({ s }) => ({ ref: s.ref, doc: s.doc, title: s.title, section: s.section, snippet: s.text.replace(/\s+/g, " ").slice(0, 240) }));
}
function readDocSection(ref) {
  const s = corpus().find((x) => x.ref.toLowerCase() === String(ref || "").trim().toLowerCase());
  return s ? { ref: s.ref, doc: s.doc, title: s.title, section: s.section, text: s.text } : null;
}
function docSource(ref) {
  const s = corpus().find((x) => x.ref === ref);
  return s ? { type: "doc", ref: s.ref, doc: s.doc, title: s.title, section: s.section, src: s.src } : null;
}

module.exports = { COLLS, KIND, loadRecords, searchRecords, getRecord, searchDocs, readDocSection, docSource, flatten, plain, terms };
