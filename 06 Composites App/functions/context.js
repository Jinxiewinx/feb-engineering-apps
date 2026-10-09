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

/* The fields a "which ones / where / when" question is usually about. They
 * lead a search snippet, so a list question can be answered from the search
 * results without opening every record (the first live run had to open lots
 * one at a time to find their expiry dates). */
const KEY_FIELDS = ["stage", "status", "location", "expiresOn", "matKey", "qty", "count", "partName", "source", "dateOrdered", "receivedOn", "moldRef"];
function keyLine(r) {
  return KEY_FIELDS.filter((k) => r[k] != null && r[k] !== "" && typeof r[k] !== "object")
    .map((k) => `${k}: ${plain(r[k]).slice(0, 60)}`).join(" · ");
}

function titleOf(r) { for (const k of TITLE_KEYS) if (r[k]) return plain(r[k]).slice(0, 120); return ""; }

/* ---------- what the app shows, labelled the way the app labels it ----------
 * Mirrors the client's own predicates so Paul's picture of the shop is the
 * one on screen (Simon, 2026-10-09: "make sure his context extends to all
 * features in the app"):
 * - projects holds issues AND the shelved project tracker's tickets. Only
 *   kind === "issue" is shown anywhere (projects.js isIssue); shelved tickets
 *   are left out entirely.
 * - R&D is the rnd collection (studies RDS-, coupons CPN-) PLUS parts with
 *   rnd:true and work orders whose part is R&D (core.js isRnd / woIsRnd).
 *   They are labelled so, never counted as season work.
 * - retro (the SN5 archive), archived, and other seasons stay visible in the
 *   app with a label, so they stay visible to Paul with the same label.
 * - deleted:true is the bin; it is not loaded.
 */
const PROJ_STATUS = { Backlog: "To Do", Active: "In Progress", Blocked: "On Hold" };
const projStatus = (p) => PROJ_STATUS[p.status] || p.status || "To Do";

function loadFacts() {
  return corpusFile().facts || { resins: [], materials: [], restock: [], trainings: {} };
}

async function loadRecords(db) {
  const docOf = async (path) => { try { const d = await db.doc(path).get(); return d.exists ? d.data() || {} : {}; } catch (e) { return {}; } };
  const [snaps, roster, cfg] = await Promise.all([
    Promise.all(COLLS.map((c) => db.collection(c).get())),
    db.collection("roster").get(),
    Promise.all(["season", "budget", "resins", "restock", "trainings"].map((k) => docOf(`config/${k}`))),
  ]);
  const [season, budget, resinCfg, restockCfg, trainCfg] = cfg;
  const code = String(season.code || "SN6");
  const raw = {};
  COLLS.forEach((c, i) => {
    raw[c] = [];
    snaps[i].forEach((d) => { const r = { id: d.id, ...d.data() }; if (!r.deleted) raw[c].push(r); });
  });
  raw.projects = raw.projects.filter((p) => p.kind === "issue");

  const partById = new Map(raw.parts.map((p) => [p.id, p]));
  const woIsRnd = (w) => { const p = partById.get(w.partId || w.part); return p ? !!p.rnd : !!w.rnd; };
  const studyById = new Map(raw.rnd.filter((r) => r.cls === "RDS").map((r) => [r.id, r]));
  const colsOf = (st) => {
    if (!st) return [];
    const parent = st.parent && studyById.get(st.parent);
    return [...(parent ? parent.cols || [] : []), ...(st.cols || [])];
  };
  const otherSeason = (r) => { const m = String(r.id).match(/-SN(\d+)-/); const s = r.season || (m ? "SN" + m[1] : ""); return s && s !== code ? s : ""; };

  const out = [];
  const push = (coll, r, kind, tags, extra) => {
    const body = flatten(extra ? { ...r, ...extra } : r).join("\n");
    const title = titleOf(r);
    const tagLine = tags.filter(Boolean).join(", ");
    out.push({ id: r.id, coll, kind, title, tags: tagLine,
      key: [tagLine && `[${tagLine}]`, keyLine(r)].filter(Boolean).join(" · "),
      body: (tagLine ? `labels: ${tagLine}\n` : "") + body,
      hay: (r.id + " " + title + " " + kind + " " + tagLine + " " + body).toLowerCase() });
  };
  const history = (r) => [r.retro && "SN5 archive", r.archived && "archived", otherSeason(r) && `season ${otherSeason(r)}`];

  for (const c of COLLS) {
    for (const r of raw[c]) {
      if (c === "parts") push(c, r, r.rnd ? "R&D part" : "part", [r.rnd && "R&D", ...history(r)]);
      else if (c === "workOrders") push(c, r, woIsRnd(r) ? "R&D run (work order)" : "work order", [woIsRnd(r) && "R&D", ...history(r)]);
      else if (c === "projects") push(c, r, "issue (nonconformance)", history(r), { status: projStatus(r) });
      else if (c === "rnd" && r.cls === "RDS") push(c, r, r.parent ? "R&D batch (study)" : "R&D study", [r.archived && "archived"], { status: r.status || "Active" });
      else if (c === "rnd" && r.cls === "CPN") {
        // A coupon's numbers are keyed by its study's column ids; name them.
        const cols = colsOf(studyById.get(r.study));
        const vals = {};
        for (const [cid, v] of Object.entries(r.vals || {})) {
          const col = cols.find((x) => x.cid === cid);
          if (v === "" || v == null) continue;
          vals[col ? `${col.name}${col.unit ? " (" + col.unit + ")" : ""}${col.role === "result" ? " [result]" : ""}` : cid] = v;
        }
        push(c, r, "R&D coupon", [r.archived && "archived"], { vals, status: r.status || "Planned" });
      }
      else push(c, r, KIND[c], history(r));
    }
  }

  /* People: name, role, trainings. Never the email (the doc id). */
  const facts = loadFacts();
  const trainName = { ...facts.trainings };
  for (const [id, t] of Object.entries(trainCfg || {})) if (t && t.name) trainName[id] = t.name;
  roster.forEach((d) => {
    const u = d.data() || {};
    const name = String(u.name || d.id.split("@")[0]);
    const r = { id: "PERSON:" + name, name, role: u.showAs || u.role || "member",
      trainings: Object.keys(u.trainings || {}).map((t) => trainName[t] || t) };
    out.push({ id: r.id, coll: "people", kind: "person", title: name, key: `role: ${r.role}${r.trainings.length ? " · trained: " + r.trainings.join(", ") : ""}`,
      body: flatten(r).join("\n"), hay: (name + " person " + r.role + " " + r.trainings.join(" ")).toLowerCase() });
  });

  /* The app's reference tables, with the leads' overrides folded in exactly
     as resinById / restockRules do on the client. */
  const ref = (id, kind, title, obj, src) => {
    const body = flatten(obj).join("\n");
    out.push({ id, coll: "reference", kind, title, key: keyLine(obj) || body.replace(/\n/g, " · ").slice(0, 200), body, src,
      hay: (id + " " + title + " " + kind + " " + body).toLowerCase() });
  };
  for (const r of facts.resins) {
    const o = (resinCfg || {})[r.id] || {};
    const merged = { ...r, ...(o.febHoldH != null ? { febHoldH: o.febHoldH, febBy: o.febBy || r.febBy } : {}) };
    ref("RESIN:" + r.id, "resin system (team cure hold)", r.label,
      { system: r.label, use: r.use, "team hold before demould (hours, enforced)": merged.febHoldH, "set by": merged.febBy,
        "datasheet says": r.sheetSays, "datasheet hold (hours)": r.sheetH, "at (°C)": r.refTempC }, r.doc);
  }
  for (const m of facts.materials) {
    ref("MAT:" + m.matKey, "material", m.label,
      { material: m.label, matKey: m.matKey, "mix ratio": m.ratio, "shelf life (months)": m.shelfLifeMonths, "also called": (m.aliases || []).join(", ") }, m.doc);
  }
  for (const r0 of facts.restock) {
    const r = { ...r0, ...((restockCfg || {})[r0.matKey] || {}) };
    ref("RESTOCK:" + r.matKey, "restock rule", r.label,
      { item: r.label, "reorder when on hand falls to": `${r.minCount} ${r.unit || ""}`.trim(), supplier: r.supplier, "lead time (days)": r.leadDays, why: r.why });
  }
  if (season.code || season.compDate) {
    ref("SEASON", "season", `Season ${season.code || ""}`.trim(),
      { season: season.code, competition: season.compName, "competition date": season.compDate, start: season.seasonStart,
        milestones: (season.milestones || []).map((x) => `${x.date} ${x.label}`) });
  }
  if (budget.categories || budget.total) {
    ref("BUDGET-GOALS", "budget goals", "Composites budget goals",
      { categories: (budget.categories || []).map((x) => `${x.name}: $${x.goal}`), base: budget.total && budget.total.base, contingency: budget.total && budget.total.contingency });
  }

  return { records: out, overview: overview(raw, woIsRnd, season, code) };
}

/* The dashboard's numbers, worked out the way the app works them out, for
 * "how many / which are" questions that keyword search answers badly. */
function overview(raw, woIsRnd, season, code) {
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const count = (arr, f) => arr.reduce((m, x) => { const k = f(x) || "(none)"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const live = (r) => !r.retro && !r.archived;
  const studies = raw.rnd.filter((r) => r.cls === "RDS"), coupons = raw.rnd.filter((r) => r.cls === "CPN");
  const roots = studies.filter((s) => !s.parent && !s.archived);
  const wos = raw.workOrders.filter((w) => live(w) && !woIsRnd(w));
  const late = wos.filter((w) => w.dueDate && w.dueDate < today && w.status !== "Complete");
  const openIssues = raw.projects.filter((p) => !["Done", "Cancelled"].includes(projStatus(p)));
  const lotsLive = raw.lots.filter((l) => !l.emptiedOn && l.stage !== "Empty");
  const expired = lotsLive.filter((l) => l.expiresOn && l.expiresOn < today);
  const expiring = lotsLive.filter((l) => l.expiresOn && l.expiresOn >= today && l.expiresOn <= soon);
  const parts = raw.parts.filter((p) => live(p) && !p.rnd);
  const ids = (a) => a.slice(0, 25).map((x) => x.id).join(", ") + (a.length > 25 ? ` …and ${a.length - 25} more` : "");
  return {
    ref: "OVERVIEW", today, season: code,
    "days to competition": season.compDate ? Math.round((new Date(season.compDate) - new Date(today)) / 864e5) : undefined,
    "R&D": {
      "studies (top level, not archived) by status": count(roots, (s) => s.status || "Active"),
      "studies and batches, all": studies.length,
      "coupons by status": count(coupons, (c) => c.status || "Planned"),
      "R&D parts": raw.parts.filter((p) => p.rnd).length,
      "R&D runs (work orders)": raw.workOrders.filter(woIsRnd).length,
    },
    "season parts (not R&D, not archived)": parts.length,
    "work orders (not R&D, not archived) by status": count(wos, (w) => w.status),
    "late work orders": { count: late.length, ids: ids(late) },
    "open issues": { count: openIssues.length, ids: ids(openIssues) },
    "molds by stage": count(raw.molds.filter(live), (m) => m.stage),
    "material lots in use": lotsLive.length,
    "lots past expiry": { count: expired.length, ids: ids(expired) },
    "lots expiring in 30 days": { count: expiring.length, ids: ids(expiring) },
    "purchases by status": count(raw.budget.filter((b) => !b.archived), (b) => b.status),
  };
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

function searchRecords(records, query, kinds, limit = 20) {
  const ts = terms(query);
  const want = Array.isArray(kinds) && kinds.length ? new Set(kinds) : null;
  return records
    .filter((r) => !want || want.has(r.coll) || (want.has("rnd") && /^R&D/.test(r.kind)))
    .map((r) => ({ r, s: ts.length ? score(r.hay, (r.id + " " + r.title).toLowerCase(), ts) : 0 }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({ ref: r.id, kind: r.kind, title: r.title, snippet: (r.key || r.body.replace(/\n/g, " · ")).slice(0, 240) }));
}

function getRecord(records, id) {
  const r = records.find((x) => x.id.toLowerCase() === String(id || "").trim().toLowerCase());
  if (!r) return null;
  return { ref: r.id, kind: r.kind, title: r.title, text: r.body.slice(0, 6000), ...(r.src ? { src: r.src } : {}) };
}

let CORPUS = null, CORPUS_FILE = null;
function corpusFile() { return CORPUS_FILE || (CORPUS_FILE = require("./corpus.json")); }
function corpus() {
  if (!CORPUS) {
    CORPUS = corpusFile().sections.map((s) => ({ ...s, hay: (s.title + " " + s.section + " " + s.text).toLowerCase() }));
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

const KINDS = [...COLLS, "people", "reference"];
module.exports = { COLLS, KINDS, KIND, overview, loadRecords, searchRecords, getRecord, searchDocs, readDocSection, docSource, flatten, plain, terms };
