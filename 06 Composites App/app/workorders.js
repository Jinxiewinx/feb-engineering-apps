"use strict";
/* workorders.js — the Work Orders tab.
   Same behavior as the original single-purpose app: list, detail, step
   buy-offs stamped with the signed-in user, blocker enforcement, printing.
   Now one tab among several; data goes through core's generic save()/del()
   into the workOrders collection. */

const WO_STATUSES = ["Draft", "Released", "InWork", "Complete", "OnHold"];
const PROCESSES = ["MoldInfusion", "GlassInfusion", "MoldWetLay", "FoamWrapped", "Other"];
const BLOCKER_WORDS = ["frozen", "design review", "drop test", "acceptance criterion"];

/* The training catalog. Ids are referenced from step templates below and from
   the engineer gating map, so they are stable code keys; labels are display
   only. Grants live per-person on roster docs (see fb.rosterGrant). Unlike
   BLOCKER_WORDS there is deliberately NO title fallback: a training gate that
   matched on titles would newly block every record already in Firestore, so
   the gate exists exactly where a template's rule object put it. */
const TRAININGS = {
  moldDesign: "Mold design",
  cnc: "ShopSabre CNC",
  wetLayup: "Wet layup",
  infusion: "Resin infusion",
  foamCore: "Foam core",
  forgedCarbon: "Forged carbon fiber",
};
// Short codes for the capsule pills; long names go in tooltips.
const TRAINING_CODES = {
  moldDesign: "MOLD", cnc: "CNC", wetLayup: "WL",
  infusion: "INF", foamCore: "CORE", forgedCarbon: "FCF",
};
// Which training a manufacturing engineer needs, by process. Mold engineer is
// always gated by moldDesign.
const MFG_ENG_TRAINING = {
  MoldInfusion: "infusion", GlassInfusion: "infusion",
  MoldWetLay: "wetLayup", FoamWrapped: "wetLayup", Other: null,
};

/* ---------- lead-editable catalog (config/trainings) ----------
   The resin-override pattern verbatim: a config doc folds over the code
   consts through ONE accessor. { [id]: { name, code, cs, archived, addedBy,
   addedAt } } — a partial entry on a built-in id renames it, a full entry is
   a lead-added training, null is the revert marker (setConfig merges, and a
   merge cannot delete). Ids are slugs minted once at creation and never
   editable: grants on roster docs, step rules and trainingOverride records
   all reference them forever, which is also why nothing is ever deleted —
   customs ARCHIVE instead, and trainingById still resolves an archived id so
   old grants and override lines keep their names. Built-ins are renameable
   but not archivable: STD_STEPS and MFG_ENG_TRAINING reference them in code.
   A new training gates nothing until a step rule names it — stepTraining()
   still reads only rule.training, so gating stays a deliberate act.
   window.*, not a lexical binding, so fixtures and tests can reach it. */
window.TRAINING_OVERRIDES = null;
let trainingCatalogFetched = false;
function loadTrainingCatalog() {
  if (trainingCatalogFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  trainingCatalogFetched = true;
  fb.getConfig("trainings").then(d => { if (d) { window.TRAINING_OVERRIDES = d; render(); } }).catch(() => {});
}
/* The single choke point: every renderer asks this, never TRAININGS[id] or
   TRAINING_CODES[id] directly, so a rename shows the same name in a pill, a
   matrix header and a gate modal. Validated at read time like resinById: an
   override with no usable name is ignored; archived never sticks to a
   built-in. An id nobody has heard of returns a stub rather than blank —
   an old grant must render SOMETHING. */
function trainingById(id) {
  const builtin = Object.prototype.hasOwnProperty.call(TRAININGS, id);
  const base = builtin
    ? { id, name: TRAININGS[id], code: TRAINING_CODES[id] || String(id).slice(0, 4).toUpperCase(), cs: null, archived: false, builtin: true, unknown: false }
    : { id, name: String(id), code: String(id).slice(0, 4).toUpperCase(), cs: null, archived: false, builtin: false, unknown: true };
  const o = window.TRAINING_OVERRIDES && window.TRAINING_OVERRIDES[id];
  if (!o || typeof o !== "object") return base;
  if (!builtin && !(typeof o.name === "string" && o.name.trim())) return base;
  const out = { ...base, unknown: false };
  if (typeof o.name === "string" && o.name.trim()) out.name = o.name.trim();
  if (typeof o.code === "string" && o.code.trim()) out.code = o.code.trim().toUpperCase().slice(0, 4);
  if (typeof o.cs === "string" && o.cs.trim()) out.cs = o.cs.trim();
  if (!builtin && o.archived === true) out.archived = true;
  return out;
}
/* Built-ins first (their template order is curriculum order), then customs by
   name. Archived entries only when asked for. */
function allTrainings(includeArchived) {
  const customs = Object.keys(window.TRAINING_OVERRIDES || {})
    .filter(id => !Object.prototype.hasOwnProperty.call(TRAININGS, id))
    .map(trainingById)
    .filter(t => !t.unknown)
    .sort((a, b) => a.name.localeCompare(b.name));
  const out = Object.keys(TRAININGS).map(trainingById).concat(customs);
  return includeArchived ? out : out.filter(t => !t.archived);
}

/* ---------- lead-editable technique catalog (config/techniques) ----------
   The trainings pattern above, verbatim: a config doc folds over the code
   consts through ONE accessor. Same rules and for the same reasons — slug ids
   minted once and never editable (wo.processType, part.layupType and step
   rules reference them forever), customs ARCHIVE rather than delete so an old
   run keeps its name, built-ins are renameable but not archivable because
   MFG_ENG_TRAINING and three call sites name them in code, and a rubbish
   override is ignored at read time rather than trusted.

   Entry: { name, layupLabel, mfgTraining, steps: [[title, rule], ...],
            rev, archived, addedBy, addedAt }. null is the revert marker
   (setConfig merges, and a merge cannot delete).

   `rev` is what a work order stamps at birth, so a run can say which version
   of the checklist it was created from. Editing a technique never touches a
   run that already exists: stepFromTemplate copies the steps INTO the document.

   window.*, not a lexical binding, so fixtures and tests can reach it. */
const TECHNIQUE_LAYUP = {
  MoldInfusion: "MOLD INFUSION", GlassInfusion: "GLASS INFUSION",
  MoldWetLay: "MOLD WET LAY", FoamWrapped: "FOAM WRAPPED", Other: "",
};
window.TECHNIQUE_OVERRIDES = null;
let techniqueCatalogFetched = false;
function loadTechniqueCatalog() {
  if (techniqueCatalogFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  techniqueCatalogFetched = true;
  fb.getConfig("techniques").then(d => { if (d) { window.TECHNIQUE_OVERRIDES = d; render(); } }).catch(() => {});
}
/* A step row is [title, rule]. Anything else in a config doc is somebody's
   half-written edit, and a template that throws at instantiation would take a
   work order with it. */
function validSteps(v) {
  if (!Array.isArray(v) || !v.length) return null;
  const out = [];
  for (const row of v) {
    if (!Array.isArray(row) || typeof row[0] !== "string" || !row[0].trim()) return null;
    out.push(row[1] && typeof row[1] === "object" ? [row[0].trim(), row[1]] : [row[0].trim()]);
  }
  return out;
}
function techniqueById(id) {
  const builtin = Object.prototype.hasOwnProperty.call(STD_STEPS, id);
  const base = builtin
    ? { id, name: humanTechnique(id), layupLabel: TECHNIQUE_LAYUP[id] || "",
        mfgTraining: MFG_ENG_TRAINING[id] || null, steps: STD_STEPS[id],
        rev: 0, archived: false, builtin: true, unknown: false }
    : { id, name: String(id), layupLabel: "", mfgTraining: null, steps: STD_STEPS.Other,
        rev: 0, archived: false, builtin: false, unknown: true };
  const o = window.TECHNIQUE_OVERRIDES && window.TECHNIQUE_OVERRIDES[id];
  if (!o || typeof o !== "object") return base;
  // A custom with no usable name is not a technique; a built-in survives one.
  if (!builtin && !(typeof o.name === "string" && o.name.trim())) return base;
  const out = { ...base, unknown: false };
  if (typeof o.name === "string" && o.name.trim()) out.name = o.name.trim();
  if (typeof o.layupLabel === "string" && o.layupLabel.trim()) out.layupLabel = o.layupLabel.trim().toUpperCase();
  if (typeof o.mfgTraining === "string" && o.mfgTraining.trim()) out.mfgTraining = o.mfgTraining.trim();
  const steps = validSteps(o.steps);
  if (steps) out.steps = steps;
  if (Number.isFinite(o.rev)) out.rev = o.rev;
  if (!builtin && o.archived === true) out.archived = true;
  return out;
}
/* "MoldWetLay" is a database value, not something to hand a person at a bench.
   Built-ins get their name from the id; a custom carries its own. */
function humanTechnique(id) {
  // Sentence case, not Title Case: "Mold infusion", the way it is said.
  return String(id).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
    .replace(/^./, c => c.toUpperCase());
}
function allTechniques(includeArchived) {
  const customs = Object.keys(window.TECHNIQUE_OVERRIDES || {})
    .filter(id => !Object.prototype.hasOwnProperty.call(STD_STEPS, id))
    .map(techniqueById)
    .filter(t => !t.unknown)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Built-ins in template order, which is how the shop learned them.
  const out = PROCESSES.map(techniqueById).concat(customs);
  return includeArchived ? out : out.filter(t => !t.archived);
}
function techniqueSteps(id) { return techniqueById(id).steps || STD_STEPS.Other; }
/* The part-level vocabulary, for the tracker's frozen SCREAMING CASE strings. */
function layupTypes() {
  return allTechniques().map(t => t.layupLabel).filter(Boolean);
}
/* ONE map between the two vocabularies. It used to be written out verbatim in
   workorders.js and again in parts.js, with DISAGREEING fallbacks — "Other"
   here and "MoldInfusion" there — so a part with a blank layupType silently
   got a full ten-step infusion checklist instead of the three-step Other one.
   The fallback is now the caller's to state, and both state "Other". */
function processForLayupType(t, fallback) {
  const want = String(t || "").trim().toUpperCase();
  if (!want) return fallback || "Other";
  const hit = allTechniques(true).find(x => x.layupLabel && x.layupLabel.toUpperCase() === want);
  return hit ? hit.id : (fallback || "Other");
}

/* ---------- engineer fields ----------
   One field renderer for both parts and work orders. The name string stays
   authoritative (20+ read sites, travellers, reports — none change); the input
   gains a datalist of people who hold the relevant training, and picking or
   typing a roster name also sets the *Email sidecar so the face is exact.
   Unqualified or off-roster names still save — assignment is planning, the
   buy-off is the enforced record — they just carry a quiet warning. */
function recProcess(rec) {
  if (rec.processType) return rec.processType;
  return processForLayupType(rec.layupType, "Other");
}
function engTrainingFor(rec, key) {
  return key === "moldEngineer" ? "moldDesign" : techniqueById(recProcess(rec)).mfgTraining || null;
}
function engWarnHtml(rec, key) {
  const v = String(rec[key] || "").trim();
  if (!v || (typeof notAPerson === "function" && notAPerson(v))) return "";
  const tr = engTrainingFor(rec, key);
  if (!tr) return "";
  const email = partEngineerEmail(rec, key);
  if (!email) return ` <span class="tny muted">not matched to the roster</span>`;
  if (!hasTraining(email, tr)) return ` <span class="warn tny">not ${esc(trainingById(tr).name)}-trained</span>`;
  return "";
}
function engFld(coll, rec, label, key) {
  const v = rec[key] ?? "";
  const warn = engWarnHtml(rec, key);
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}${warn}</div></div>`;
  const tr = engTrainingFor(rec, key);
  const dl = `dl-${coll}-${key}`;
  const q = tr ? qualifiedFor(tr) : usersSorted();
  return `<div class="f"><label>${label}</label>
    <input list="${dl}" value="${esc(v)}" onchange="setEngineer('${coll}','${esc(rec.id)}','${key}',this.value)">
    <datalist id="${dl}">${q.map(u => `<option value="${esc(u.name || u.email)}">`).join("")}</datalist>
    ${warn}</div>`;
}
function setEngineer(coll, id, key, val) {
  const rec = recById(coll, id);
  if (!rec) return;
  val = String(val || "");
  rec[key] = val;
  const nm = val.trim().toLowerCase();
  const u = nm ? (DB.users || []).find(u => (u.name || "").toLowerCase() === nm || u.email.toLowerCase() === nm) : null;
  rec[key + "Email"] = u ? u.email : "";
  save(coll, rec, key);
  save(coll, rec, key + "Email");
  render();
}

/* Step titles are what someone reads at the bench with gloves on, so they stay
   short and plain. Standard numbers used to be baked into every title; they made
   the printed sheet dense and hard to scan, and the standards themselves live in
   the Documents tab.

   The second slot on each entry is the step's RULE — what the app enforces
   about it. It was a vestigial one-element array left over from when the CS ref
   lived there; the rule goes in an object instead of back into the title, and
   tools/test_app.mjs asserts no title ever contains "CS-" again.

     { kind: "blocker" }             nobody signs a later step until this is signed
     { kind: "hold", from: "resin" } a wait, as long as the recorded resin needs
     { kind: "hold", hours: 4 }      a wait of a fixed length (nothing uses this
                                     yet; Ure-Bond's 4 h clamp is the next one)

   `needs` sits in the SAME object and says what has to EXIST before the step can
   be signed. A buy-off used to record who and when but never what: "Stack
   frozen" could be signed on a work order whose layup stack was empty, and
   "Mold design review" with the CAD nowhere in the app. The signature was the
   record, and the record was a name. See stepEvidence().

   BLOCKER_WORDS still matches on titles as well, and has to: the 26 retro work
   orders and every record already in Firestore predate the rule field, so
   title-matching is the only thing enforcing on them. New templates carry both
   and the two agree. */
const STD_STEPS = {
  MoldInfusion: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Mold design review", { kind: "blocker", needs: ["file"], training: "moldDesign" }],
    ["Glue mold stock", { training: "cnc" }], ["Machine mold", { needs: ["note"], training: "cnc" }],
    ["Seal and release mold"], ["Dry stack and bag", { training: "infusion" }],
    ["Drop test, 1 inHg or less over 10 min", { kind: "blocker", needs: ["note"], training: "infusion" }], ["Infuse", { kind: "startsHold", training: "infusion" }],
    ["Cure and demould", { kind: "hold", from: "resin" }], ["Trim and finish"]],
  GlassInfusion: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Prepare plate and release"],
    ["Dry stack and bag", { training: "infusion" }], ["Drop test, 1 inHg or less over 10 min", { kind: "blocker", needs: ["note"], training: "infusion" }],
    ["Infuse", { kind: "startsHold", training: "infusion" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Cut to DXF, confirm revision"], ["Finish"]],
  MoldWetLay: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Mold design review", { kind: "blocker", needs: ["file"], training: "moldDesign" }],
    ["Glue and machine mold", { needs: ["note"], training: "cnc" }], ["Seal and release mold"],
    ["Wet layup and bag", { kind: "startsHold", training: "wetLayup" }], ["Cure and demould", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  FoamWrapped: [
    ["Stack frozen", { kind: "blocker", needs: ["stack"] }], ["Shape foam core", { training: "foamCore" }],
    ["Wet layup over core", { kind: "startsHold", training: "wetLayup" }], ["Cure", { kind: "hold", from: "resin" }],
    ["Trim and finish"]],
  Other: [["Define acceptance criterion: target and method, set before work starts", { kind: "blocker", needs: ["note"] }],
          ["Execute"], ["Verify against criterion"]],
};
// One place that turns a template row into a stored step, so newWO() and
// resetSteps() can't drift apart on what a fresh step looks like.
function stepFromTemplate(row, i) {
  const s = { seq: i + 1, title: row[0], status: "open", buyoff: { name: "", date: "" }, notes: "", photoRefs: [] };
  if (row[1]) s.rule = row[1];
  return s;
}

/* Retro work orders and anything already saved carry standard numbers, both in
   step titles ("Stack frozen (CS-002 §7.2)") and loose in notes and event-log
   text. Strip them at render time so legacy records read like new ones without
   rewriting stored data. Applied to every free-text field that reaches paper. */
function stripCS(s) {
  return String(s || "")
    // whole parenthesised or bracketed reference, including any section number
    .replace(/\s*[([]\s*CS-\d+[^)\]]*[)\]]/g, "")
    // bare reference mid-sentence, with an optional § clause after it
    .replace(/\s*\bCS-\d+(?:\s*§\s*[\d.–—-]+)?/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function woById(id) { return DB.workOrders.find(w => w.id === id); }
function saveWO(w, field) { w = w || woById(view.id); if (w) save("workOrders", w, field); }

async function newWO(rnd) {
  const id = await allocId("workOrders");
  if (!id) return;
  const wo = {
    id, partName: "", subteam: "AERO", revision: "A", status: "Draft",
    processType: "MoldInfusion", moldEngineer: "", manufacturingEngineer: "",
    createdDate: today(), dueDate: "", partId: "",
    mold: { moldId: "", layers: "", density: "", sealingType: "XCR", location: "" },
    layupStack: [], stackNote: "", bom: [], standardsRefs: [],
    steps: techniqueSteps("MoldInfusion").map(stepFromTemplate),
    qualityChecks: [{ criterion: "mass", target: "", actual: "", pass: null }],
    /* `rnd` here is ONLY the fallback for a run with no part. woIsRnd() asks
       the part first and every time, so a run that gets linked reads its part's
       programme and this field goes dormant. newRunForPart() deliberately does
       NOT set it: that path writes partId, so it inherits, and a copy is
       exactly the drift derivation exists to prevent. */
    weightTargetG: null, weightActualG: null, timeline: [], notes: "", retro: false, rnd: !!rnd,
    createdBy: myEmail(),
  };
  DB.workOrders.push(wo); saveWO(wo);
  view = { ...view, mode: "detail", id, edit: true }; render();
}

// Lead-only: this erases every recorded buy-off on the WO, for the whole team.
function resetSteps(wo) {
  if (!isLead()) { toast("Resetting steps wipes recorded buy-offs, so it's lead-only. Ask the lead.", "error"); return; }
  const signed = (wo.steps || []).filter(isSigned).length;
  confirmModal("Replace steps with the standard list for " + wo.processType + "?" +
    (signed ? " This erases " + signed + " recorded buy-off(s) from the team database. There is no undo." : ""), () => {
    wo.steps = techniqueSteps(wo.processType).map(stepFromTemplate);
    saveWO(wo, "steps"); render();
  });
}

/* ==========================================================================
   DELETING WORK ORDERS, AND EVERYTHING THAT ONLY EXISTS BECAUSE OF THEM

   Deleting one document used to be the whole story, and Firestore has no
   cascade, so it left a trail every time: issues whose workOrderId no longer
   resolved (and an issue CANNOT exist without one — newIssue refuses), every
   photo and CAD file still sitting in Storage under projects/<woId>/, and
   back-pointers on parts, molds and test panels aimed at nothing.

   So there is one delete path now and it takes a LIST. delWO() is that path
   with one id in it, which is the point — the single delete had the same bug.

   WHAT IS NOT REVERSED, and the confirm says so: consuming a BOM line already
   decremented stock and flipped lots to opened. Deleting the run that consumed
   them does not put material back on the shelf, because it was really used.

   NO UNDO. A deleted Storage object cannot be restored, so an Undo bar here
   would be the lying button firestore.rules already warns about — the offer is
   a backup export beforehand instead. */

/* Firebase download URLs carry their own object path, percent-encoded, between
   /o/ and the query string. Recovering it is the only way to delete an image
   that was pasted into a note: those carry a url and no path, and Storage
   LISTING is denied by rule, so an unreferenced object is unreachable forever. */
function storagePathFromUrl(url) {
  const m = /\/o\/([^?]+)/.exec(String(url || ""));
  if (!m) return "";
  try { return decodeURIComponent(m[1]); } catch (e) { return ""; }
}
/* Every Storage object this record is the only reason for. Walks fields rather
   than the bucket, because the bucket cannot be walked. */
function recStoragePaths(rec) {
  const out = [];
  const add = p => { if (p) out.push(p); };
  const fromRef = p => add(typeof p === "string" ? storagePathFromUrl(p) : (p.path || storagePathFromUrl(p.url)));
  (rec.files || []).forEach(fromRef);
  (rec.steps || []).forEach(s => {
    (s.photoRefs || []).forEach(fromRef);
    htmlImgSrcs(s.noteHtml).forEach(u => add(storagePathFromUrl(u)));
  });
  (rec.noteLog || []).forEach(c => htmlImgSrcs(c.html).forEach(u => add(storagePathFromUrl(u))));
  (rec.comments || []).forEach(c => htmlImgSrcs(c.html).forEach(u => add(storagePathFromUrl(u))));
  return [...new Set(out)];
}
/* Everything that goes, and everything that merely loses a pointer. Pure, so
   the confirm text and the delete itself are computed from one answer rather
   than from two walks that could disagree. */
function woDeletionSet(ids) {
  const set = new Set(ids || []);
  const wos = (DB.workOrders || []).filter(w => set.has(w.id));
  // An issue's workOrderId is required, so an orphan is not a record with a
  // dangling field — it is a record the app considers impossible.
  const issues = (DB.projects || []).filter(p => set.has(p.workOrderId));
  const paths = [...new Set([].concat(
    ...wos.map(recStoragePaths), ...issues.map(recStoragePaths)))];
  /* Cleared, not deleted: a part and a mold outlive the run that made them.
     A pointer to a deleted run is the lingering artifact, so it goes. */
  const parts = (DB.parts || []).filter(p => set.has(p.workOrderId));
  const molds = (DB.molds || []).filter(m => set.has(m.wo));
  const items = (DB.items || []).filter(i => set.has(i.wo));
  return { wos, issues, paths, parts, molds, items };
}
function woDeletionSummary(d) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : (many || one + "s")}`;
  // "1 part, 1 mold and 2 test panels" — a comma list ending in "and", because
  // this sentence is read once, under a red button, by somebody deciding.
  const list = a => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  const also = [];
  if (d.issues.length) also.push(n(d.issues.length, "issue"));
  if (d.paths.length) also.push(n(d.paths.length, "uploaded file"));
  const links = [];
  if (d.parts.length) links.push(n(d.parts.length, "part"));
  if (d.molds.length) links.push(n(d.molds.length, "mold"));
  if (d.items.length) links.push(n(d.items.length, "test panel or jig"));
  return `Delete ${n(d.wos.length, "work order")} from the team database for everyone?`
    + (also.length ? ` This also deletes ${also.join(" and ")}.` : "")
    + (links.length ? ` It clears the work-order link on ${list(links)}.` : "")
    + ` Material already consumed by these runs stays consumed. There is no undo —`
    + ` export a backup first if unsure.`;
}
async function woBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can delete work orders.", "error"); return; }
  const d = woDeletionSet(ids);
  if (!d.wos.length) { toast("Nothing selected.", "info"); return; }
  confirmModal(woDeletionSummary(d), async () => {
    const gone = new Set(d.wos.map(w => w.id));
    const issueIds = new Set(d.issues.map(p => p.id));
    try {
      await fb.delMany(
        d.wos.map(w => ({ coll: "workOrders", id: w.id }))
          .concat(d.issues.map(p => ({ coll: "projects", id: p.id }))));
    } catch (e) { toast("Delete failed: " + e.message, "error"); return; }

    // Records are gone; now the bytes they were the only reason for.
    let failed = [];
    if (d.paths.length) {
      try { failed = (await fb.deleteFiles(d.paths)).failed; }
      catch (e) { failed = d.paths; }
    }
    /* Back-pointers, one field each. Not batched with the deletes: these are a
       handful of records and save() is the path that stamps updatedAt and keeps
       the pub mirror right. */
    d.parts.forEach(p => { p.workOrderId = ""; save("parts", p, "workOrderId"); });
    d.molds.forEach(m => { m.wo = ""; save("molds", m, "wo"); });
    d.items.forEach(i => { i.wo = ""; save("items", i, "wo"); });

    DB.workOrders = (DB.workOrders || []).filter(w => !gone.has(w.id));
    DB.projects = (DB.projects || []).filter(p => !issueIds.has(p.id));
    view = { ...view, woPick: null, mode: "list", id: null };
    toast(`${d.wos.length} work order${d.wos.length === 1 ? "" : "s"} deleted`
      + (d.issues.length ? `, with ${d.issues.length} issue${d.issues.length === 1 ? "" : "s"}` : "")
      + (d.paths.length ? ` and ${d.paths.length - failed.length} of ${d.paths.length} uploaded file${d.paths.length === 1 ? "" : "s"}` : "")
      + ".", failed.length ? "error" : "info");
    if (failed.length) toast(`${failed.length} upload${failed.length === 1 ? "" : "s"} could not be removed from storage — the records are gone but the bytes are still there.`, "error");
    render();
  });
}
// One id is a list of one. The single delete had exactly the same trail.
function delWO(id) { woBulkDelete([id]); }

/* ---- picking several off the rail ----
   Modelled on the label builder's picker: a map of ids, Select all / None, a
   live count, and a primary action that stays disabled until something is
   ticked. `view.woPick` being null is "not picking" — an explicit state rather
   than inferring it from whether a checkbox happens to be in the DOM. */
function woPickOn() { return !!view.woPick; }
function startWOPick() { view = { ...view, woPick: {} }; render(); }
function cancelWOPick() { view = { ...view, woPick: null }; render(); }
function toggleWOPick(id) {
  const p = view.woPick; if (!p) return;
  if (p[id]) delete p[id]; else p[id] = true;
  render();
}
function woPickAll(on) {
  const p = {};
  // Only what is on screen: ticking "all" while a filter is on must not quietly
  // select the runs the filter is hiding.
  if (on) woIndexRows().forEach(w => { p[w.id] = true; });
  view = { ...view, woPick: p }; render();
}
function woPickedIds() { return Object.keys(view.woPick || {}); }
function deletePickedWOs() { woBulkDelete(woPickedIds()); }
function archivePickedWOs(on) {
  const n = setArchived("workOrders", woPickedIds(), on);
  view = { ...view, woPick: null };
  toast(`${n} work order${n === 1 ? "" : "s"} ${on ? "archived" : "restored"}.`);
  render();
}
function archiveWO(id, on) {
  setArchived("workOrders", [id], on);
  toast(`${id} ${on ? "archived — find it under the archived chip" : "restored"}.`);
  render();
}

/* Two ways to be a blocker, and both have to keep working. The rule field is
   how new templates say it. The title match is how every record already saved
   says it, including all 26 retro work orders — those predate the field, so
   dropping the title path would silently stop enforcing on the entire existing
   database. */
function stepRule(s) { return (s && s.rule) || null; }
function isBlocker(step) {
  if (stepRule(step) && step.rule.kind === "blocker") return true;
  const t = String(step.title || "").toLowerCase();
  return BLOCKER_WORDS.some(g => t.includes(g));
}
function isHoldStep(s) { return !!(stepRule(s) && s.rule.kind === "hold"); }
// The training a step's signer needs, or null. Rule-field only, no title
// fallback (see the TRAININGS comment): untagged steps stay ungated.
function stepTraining(s) { const r = stepRule(s); return (r && r.training) || null; }
function startsHold(s) { return !!(stepRule(s) && s.rule.kind === "startsHold"); }

/* ---------- evidence on a buy-off ----------
   What a signature has to come with. Three checks, each a pure function of the
   work order and the step, so they are testable with no DOM and so the same
   answer drives the disabled button, the modal and the gate inside buyoff().

   A PHOTO IS SUGGESTED, NEVER REQUIRED. Simon's call, and the right one: half
   these steps happen in a dark corner of RFS at eleven at night, and a hard
   photo requirement is how you teach people to sign the traveller the next
   morning from memory instead. It is a line of advice in the modal and nothing
   more. */
const EVIDENCE = {
  stack: {
    label: "a layup stack",
    why: "Freezing a stack that doesn't exist yet is the signature this app was built to stop.",
    fix: "Add plies in the Layup stack section above.",
    has: (wo) => (wo.layupStack || []).length > 0,
  },
  file: {
    // A link counts. The CAD genuinely lives in Drive, and demanding an upload
    // when the file is already linked on this work order just teaches people to
    // upload it twice.
    label: "the CAD, attached or linked",
    why: "A design review with no drawing anywhere is a signature on nothing.",
    fix: "Attach the STEP or SLDPRT under Files, or link it under Documents.",
    has: (wo) => (wo.files || []).length > 0 || (wo.docs || []).length > 0,
  },
  note: {
    label: "a note on this step",
    why: "When it was done, on which machine, and what the numbers were. Nobody remembers in March.",
    fix: "Write it in the step's note field.",
    has: (wo, s) => !!(String((s && s.notes) || "").trim() || String((s && s.noteHtml) || "").replace(/<[^>]*>/g, "").trim()),
  },
};
function stepNeeds(s) { return (stepRule(s) && s.rule.needs) || []; }
function stepHasPhoto(s) {
  return /<img/i.test(String((s && s.noteHtml) || "")) || ((s && s.photoRefs) || []).length > 0;
}
/* { missing: [key], suggested: ["photo"] }. Retro records return nothing
   missing, exactly like every other gate in this file: a historical record
   documents what happened, it does not enforce it after the fact. An override
   already granted clears the requirement too — it was granted in writing. */
function stepEvidence(wo, i) {
  const s = (wo.steps || [])[i];
  const out = { missing: [], suggested: [] };
  if (!s || wo.retro || s.evidenceOverride) return out;
  const needs = stepNeeds(s);
  needs.forEach(k => { const rule = EVIDENCE[k]; if (rule && !rule.has(wo, s)) out.missing.push(k); });
  /* Only steps that want a written note want a photo. Those are the physical
     ones — machining, the drop test — where a photo IS the measurement. Asking
     for a photo of "Stack frozen" would be asking for a photo of a decision,
     and a prompt that fires where it makes no sense is how people learn to
     dismiss the one that does. */
  if (needs.includes("note") && !stepHasPhoto(s)) out.suggested.push("photo");
  return out;
}
function evidenceLabels(keys) { return keys.map(k => (EVIDENCE[k] || {}).label || k); }

/* ---------- photos ----------
   Photos are the documentation this record exists to hold: what the bag
   looked like before pull is a fact nobody can reconstruct in March. Three
   pools already exist and stay where they are written — a step's photoRefs,
   image-typed record files, and <img>s inside step notes and the note log.
   woAllPhotos() is the one read that unifies them for the Photos section;
   uploads go to the step's own photoRefs so a photo travels with its step
   through the same saveField("steps") concurrency machinery as a buy-off.

   photoRefs entries were never written before 2026-08 (every seed row is []),
   so the object shape below is the shape; `filename` mirrors `name` only for
   the legacy `p.filename || p` reader. Bare-string legacy entries are still
   tolerated on read. */
function woPhotoEntry(up) {
  return { id: "P" + Date.now() + Math.random().toString(36).slice(2, 5),
    name: up.name, filename: up.name, url: up.url, path: up.path,
    type: up.type, size: up.size, by: myEmail(), ts: new Date().toISOString(), caption: "" };
}
function htmlImgSrcs(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<img[^>]+src=["']([^"']+)["']/gi))
    if (!m[1].startsWith("data:")) out.push(m[1]);
  return out;
}
// [{url, name, caption?, by?, ts?, stepIndex?, stepTitle?, source}], deduped
// by url with the first pool winning (a step photo pasted into a note counts
// once, as the step's).
function woAllPhotos(wo) {
  const out = [], seen = new Set();
  const push = (p) => { if (p.url && !seen.has(p.url)) { seen.add(p.url); out.push(p); } };
  (wo.steps || []).forEach((s, i) => {
    (s.photoRefs || []).forEach(p => {
      if (typeof p === "string") push({ url: p, name: p, stepIndex: i, stepTitle: stripCS(s.title), source: "step" });
      else push({ url: p.url || "", name: p.name || p.filename || "photo", caption: p.caption || "",
        by: p.by, ts: p.ts, stepIndex: i, stepTitle: stripCS(s.title), source: "step" });
    });
    htmlImgSrcs(s.noteHtml).forEach(u => push({ url: u, name: "step note photo", stepIndex: i, stepTitle: stripCS(s.title), source: "note" }));
  });
  (wo.files || []).forEach(f => {
    if ((f.type || "").startsWith("image/")) push({ url: f.url, name: f.name || "photo", by: f.by, ts: f.ts, source: "file" });
  });
  (wo.noteLog || []).forEach(c => {
    htmlImgSrcs(c.html).forEach(u => push({ url: u, name: "note photo", by: c.email || c.author, ts: c.ts, source: "note" }));
  });
  return out;
}
/* Capture, one tap from the step row — view mode included, because the bench
   is not in edit mode. No `capture` attribute on purpose: with it, iOS and
   Android drop the photo-library option, and half the photos worth attaching
   were taken minutes ago. */
function addStepPhotos(woId, i, opts) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    if (!files.length) return;
    const slot = document.querySelector && document.querySelector(`[data-photo-slot="step"][data-wo="${woId}"][data-step="${i}"]`);
    let ghost = null;
    if (slot && slot.appendChild) { ghost = document.createElement("span"); ghost.className = "ph-uploading"; ghost.textContent = "uploading…"; slot.appendChild(ghost); }
    const entries = [];
    for (const f of files) {
      try {
        const up = await fb.upload(`projects/${woId}/${Date.now()}-${f.name}`, f);
        entries.push(woPhotoEntry(up));
      } catch (e) { toast("Upload failed: " + e.message, "error"); }
    }
    if (ghost) ghost.remove();
    if (entries.length) {
      w.steps[i].photoRefs = (w.steps[i].photoRefs || []).concat(entries);
      saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], photoRefs: (steps[i].photoRefs || []).concat(entries) }; return steps; });
      render();
    }
    if (opts && opts.then) opts.then();
  };
  inp.click();
}
function setStepPhotoCaption(woId, i, photoId, caption) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const apply = refs => (refs || []).map(p => (p && p.id === photoId ? { ...p, caption } : p));
  w.steps[i].photoRefs = apply(w.steps[i].photoRefs);
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], photoRefs: apply(steps[i].photoRefs) }; return steps; });
}

/* ---------- cure holds ----------
   A hold step waits on the clock started by the step before it. That is a
   deliberate non-generalisation: in all four templates the cure directly
   follows the thing that starts it (Infuse, Wet layup and bag, Wet layup over
   core), so a `dependsOn` graph would be four pointers all saying "the previous
   one". If a template ever needs to skip a step, this is where to add it.

   Returns null when there is nothing to enforce, which covers: not a hold step,
   a retro record, and a hold whose clock was never started (nobody has signed
   the step before it, so the existing blocker/sequence rules are what stop you
   — not this). */
function holdState(wo, idx) {
  const s = (wo.steps || [])[idx];
  if (!s || !isHoldStep(s)) return null;
  if (wo.retro) return null; // historical records document, they don't enforce
  const prev = (wo.steps || [])[idx - 1];
  const cure = prev && prev.cure;
  if (!cure || !cure.startedAt) return null;
  const resin = resinById(cure.resin);
  const hours = resinHoldHours(cure.resin);
  if (!(hours > 0)) return null; // unknown resin: nothing defensible to enforce
  const left = msLeft(cure.startedAt, hours);
  return {
    resin, resinId: cure.resin, hours,
    startedAt: cure.startedAt, tempC: cure.tempC ?? null,
    readyAt: fmtReadyAt(cure.startedAt, hours),
    msLeft: left, ready: left == null || left <= 0,
    overridden: !!s.holdOverride, override: s.holdOverride || null,
  };
}
// Is the shop colder than the temperature this hold's number is quoted at?
// Reported, never used to change the number — see the plan and CS-008 §7.5.
function holdIsCold(h) {
  return !!(h && h.tempC != null && h.resin && h.tempC < h.resin.refTempC);
}

/* The waiting notice. Amber `.gate` with ⚠, not the red `.gate.blocked`: the
   app's glyph convention is ! advisory, ⚠ can't-yet, ✕ hard blocked, and a cure
   that hasn't finished is the process working, not something gone wrong.

   No standard reference and no datasheet figure in here on purpose. Every step
   row carrying a citation is what made the old sheet unreadable; the numbers
   and the PDF are one tap away behind "why". */
function holdBanner(h, i) {
  const cold = holdIsCold(h);
  return `<p class="gate"><span class="gi">⚠</span><span>
    Curing until <b>${esc(h.readyAt)}</b> · ${esc(fmtLeft(h.msLeft))}<br>
    ${h.resin ? esc(h.resin.label) : "resin not recorded"}${h.tempC != null ? ` · ${esc(String(h.tempC))} °C` : ""}
    ${cold ? `<br>Colder than this number assumes, so it will run long. Test the flange, not the clock.` : ""}
    ${h.resin ? ` <button class="link no-print" onclick="openWhyHold(${i})">why ${h.resin.febHoldH} h?</button>` : ""}
  </span></p>`;
}
// One line on the step that started the clock, so the record reads back without
// opening anything: what was mixed, when, and how cold the shop was.
function cureSummary(c) {
  const r = resinById(c.resin);
  return (r ? r.label : c.resin || "resin not recorded")
    + " · finished " + fmtWhen(c.startedAt)
    + (c.tempC != null ? " · " + c.tempC + " °C" : "");
}

/* A countdown painted once is wrong a minute later, and a work order left open
   on the bench laptop is the normal case. One interval, armed only while a hold
   banner is actually on screen, and it stops itself the moment one isn't.
   Guarded for the DOM stub in tools/test_app.mjs, same idiom as core.js's
   syncChromeMetrics(). */
let HOLD_TICK = null;
function syncHoldTick() {
  if (typeof document.querySelector !== "function" || typeof setInterval !== "function") return;
  const live = !!document.querySelector("#main .step .gate");
  if (live && !HOLD_TICK) HOLD_TICK = setInterval(() => render(), 60000);
  else if (!live && HOLD_TICK) { clearInterval(HOLD_TICK); HOLD_TICK = null; }
}
function isSigned(s) { return !!(s.buyoff && s.buyoff.name && !/not recorded/i.test(s.buyoff.name)); }
function stepState(s) {
  const st = (s.status || "").toLowerCase();
  if (st.includes("fail") || st.includes("skip")) return "failed";
  if (isSigned(s) || st.startsWith("done")) return "done";
  return "open";
}
function blockerOpenBefore(wo, idx) {
  if (wo.retro) return null; // historical records: blockers are documentation, not enforcement
  for (let i = 0; i < idx; i++) {
    const s = wo.steps[i];
    if (isBlocker(s) && !isSigned(s)) return wo.steps[i];
  }
  return null;
}
// Issues required-linked to this WO (workOrderId, not the informational
// relatedWorkOrders list) — same in-memory filter every other tab uses, no
// Firestore query/index needed. isIssue()/projStatus() live in projects.js;
// script load order doesn't matter here since these only run at call time,
// well after every classic script has finished loading.
function issuesForWO(woId) { return (DB.projects || []).filter(p => isIssue(p) && p.workOrderId === woId); }
// Cancelled issues need no disposition — they turned out not to be real.
function undisposedIssuesForWO(woId) { return issuesForWO(woId).filter(p => projStatus(p) !== "Cancelled" && !p.resolutionMethod); }
/* Issues filed from a step carry stepRef {seq, index, title} — seq is the
   match key (it survives step-array edits better than the index, and the
   title snapshot survives everything). NOT parentId: a sub-ticket can never
   be an issue, and stepRef is a pointer, not a parentage. */
/* Open = still being worked. Deliberately NOT undisposedIssuesForWO: that one
   answers "can this work order close" and is the completion gate. This one
   answers "is anything still going on here", which is the browsing question the
   rail chip asks, and a resolved-but-reopened issue belongs in that answer. */
function openIssuesForWO(woId) {
  return issuesForWO(woId).filter(p => !["Done", "Cancelled"].includes(projStatus(p)));
}
function stepIssues(wo, s) {
  return issuesForWO(wo.id).filter(t => t.stepRef && t.stepRef.seq === s.seq);
}
/* ---------- what the rail says about a run ----------
   Three pure functions, no DOM, so the rail, the overview pane and the tests
   all read the same answer. They sit here beside stepState() rather than down
   among the renderers because they are facts about a work order, not markup. */
function woProgress(w) {
  const steps = (w && w.steps) || [];
  let done = 0, failed = 0;
  steps.forEach(s => { const st = stepState(s); if (st === "done") done++; else if (st === "failed") failed++; });
  return { done, failed, total: steps.length, pct: steps.length ? done / steps.length : 0 };
}
/* Blocked and curing are asked ONLY about the step you would act on next — the
   same definition dashboard.js's blockedNow() uses (`if (i > next) return`).
   Two answers to "is this blocked" that disagreed between the rail and the
   Dashboard would be a bug report, not a nuance.

   Retro and Complete records flag nothing: they are history, and history is not
   waiting on anybody. */
function woFlags(w) {
  const none = { blocked: null, curing: null };
  if (!w || w.retro || w.status === "Complete") return none;
  const steps = w.steps || [];
  const next = steps.findIndex(s => stepState(s) !== "done" && stepState(s) !== "failed");
  if (next < 0) return none;
  const hold = holdState(w, next);
  return {
    blocked: blockerOpenBefore(w, next),
    curing: hold && !hold.ready && !hold.overridden ? hold : null,
  };
}
// isWoLate, not woLate: view.woLate is the filter flag, and one word meaning
// both a predicate and a toggle is how the next person loses an hour.
function isWoLate(w) {
  const d = daysUntil(w && w.dueDate);
  return d != null && d < 0 && w.status !== "Complete";
}

/* ---------- which part a run belongs to ----------
   partOf() (core.js) scans DB.parts, and grouping by part would call it once
   per row per comparison — O(n log n) scans of the whole collection. Resolve
   every run once into a map instead, rebuilt at the top of woIndexRows().

   Deliberately NOT a cache with an invalidation key: the edges change whenever
   somebody confirms a name guess, and a map that went stale on that would
   regroup the rail wrongly with nothing on screen to explain it. Rebuilding is
   26 x 33 comparisons, which is free. */
let WO_PART_MAP = new Map();
function buildWOPartMap() {
  WO_PART_MAP = new Map();
  (DB.workOrders || []).forEach(w => { const r = partOf(w); WO_PART_MAP.set(w.id, r ? r.part : null); });
  return WO_PART_MAP;
}
// Falls back to a direct resolve so a test (or the keyboard handler) can call
// this without having rendered the rail first.
function woPart(w) {
  if (!w) return null;
  if (WO_PART_MAP.has(w.id)) return WO_PART_MAP.get(w.id);
  const r = partOf(w);
  return r ? r.part : null;
}
// "~~unlinked" sorts after every real part name, so the runs with no parent
// land in one block at the bottom rather than scattered under an empty heading.
function woPartSortKey(w) { const p = woPart(w); return p ? (p.partName || p.id).toLowerCase() : "~~unlinked"; }

/* ---------- grouping and sorting the rail ----------
   Parts gets away with a single `group` sentinel because it groups by exactly
   one thing. A run has several parents worth grouping under, so the modes are a
   table: a key present in WO_GROUPS draws headers, anything else is a flat sort. */
const WO_GROUPS = {
  gpart: w => { const p = woPart(w); return p ? p.id : ""; },
  gstatus: w => w.status || "",
  gsub: w => w.subteam || "",
  gproc: w => w.processType || "",
};
const WO_SORT_COLS = {
  gpart: woPartSortKey,
  // Enum order, never alphabetical — Draft/Released/InWork/Complete is progress
  // order and sorted as text it is nonsense. Same rule as PART_SORT_COLS.
  gstatus: w => WO_STATUSES.indexOf(w.status),
  gsub: w => (w.subteam || "~").toLowerCase(),
  gproc: w => (w.processType || "~").toLowerCase(),
  dueDate: w => w.dueDate || "9999",
  id: w => w.id,
  partName: w => (w.partName || "").toLowerCase(),
  status: w => WO_STATUSES.indexOf(w.status),
  progress: w => woProgress(w).pct,
};
const WO_SORT_LABELS = {
  /* No "Group: R&D / season" here. The R&D chip above the rail is the control
     for that now, and a grouping that renders one group whenever the chip is
     off is a second way to say the same thing that is wrong most of the time. */
  gpart: "Group: part", gstatus: "Group: status", gsub: "Group: subteam", gproc: "Group: process",
  dueDate: "Sort: Due", id: "Sort: ID", partName: "Sort: Part", status: "Sort: Status", progress: "Sort: Progress",
};
function woSortKey() { return WO_SORT_COLS[view.sortKey] ? view.sortKey : "gpart"; }
function sortWOsBy(key) {
  if (view.sortKey === key) view.sortDir = view.sortDir === "desc" ? "asc" : "desc";
  else { view.sortKey = key; view.sortDir = "asc"; }
  render();
}
function toggleWOSortDir() { view.sortDir = view.sortDir === "desc" ? "asc" : "desc"; render(); }
function sortedWORows(rows) {
  const get = WO_SORT_COLS[woSortKey()];
  const mul = view.sortDir === "desc" ? -1 : 1;
  // Ties break on due date then id, always ascending. This is what stops rows
  // shuffling between renders when a whole group shares a sort value.
  return rows.slice().sort((a, b) => {
    const av = get(a), bv = get(b);
    if (av < bv) return -mul;
    if (av > bv) return mul;
    return (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.id.localeCompare(b.id);
  });
}

/* ---------- the index rows ----------
   Work orders only. Group headers are NOT in here and must never be: keyboard
   navigation walks this array, and a header in it would let j/k set view.id to
   a part name and silently drop the detail pane back to the overview. */
function woIndexRows() {
  buildWOPartMap();
  const D = DB.workOrders || [];
  const q = (view.q || "").toLowerCase();
  /* Unlike Parts, this rail does NOT hide finished records by default.
     A part is a thing that has to exist by a deadline, so once it is made it
     drops off the list. A work order is the traveler for one run — reading back
     what was done is half of what the tab is for, and the entire SN5 archive is
     Complete, so a done-hiding default lands on an empty rail and reads as a
     broken tab. Open/done are both one chip away instead. */
  let rows = D
    .filter(w => (!view.woOpen || w.status !== "Complete"))
    .filter(w => (!view.woDone || w.status === "Complete"))
    .filter(w => (!view.fStatus || w.status === view.fStatus))
    .filter(w => (!view.fSub || w.subteam === view.fSub))
    .filter(w => (!view.woLate || isWoLate(w)))
    .filter(w => (!view.woMine || isMine([w.moldEngineer, w.manufacturingEngineer])))
    .filter(w => (!view.woIssues || openIssuesForWO(w.id).length))
    /* Season runs or R&D runs, never both — the same switch the Parts rail
       has, and the note on its filter carries the reasoning. Off by default.
       A run is swapped out HERE only: the dashboard, the deadline lists,
       Reports and the printed traveler never filter R&D, so a blocked or late
       trial still surfaces where lateness is looked for. The open run is
       re-added below, so a deep link or a ⌘K hit still opens. */
    .filter(w => (view.woOnlyRnd ? woIsRnd(w) : !woIsRnd(w)))
    // This season by default and archived swapped out, exactly as on Parts.
    .filter(w => view.allSeasons || thisSeason(w))
    .filter(w => (view.showArch ? isArchived(w) : !isArchived(w)))
    .filter(w => !q || w.id.toLowerCase().includes(q) || (w.partName || "").toLowerCase().includes(q));
  // The open run never falls out from under you — a filter that would hide what
  // you are reading keeps it in place instead. This is the whole point of a
  // persistent rail, and without it typing in the search box blanks the pane.
  const sel = selectedWO();
  if (sel && !rows.includes(sel)) rows = rows.concat([sel]);
  return sortedWORows(rows);
}

function woSummary() {
  const D = railLive(DB.workOrders);
  const open = D.filter(w => w.status !== "Complete");
  let curing = 0, blocked = 0, issues = 0;
  D.forEach(w => { const f = woFlags(w); if (f.curing) curing++; if (f.blocked) blocked++; if (openIssuesForWO(w.id).length) issues++; });
  return {
    total: D.length, open: open.length, done: D.length - open.length,
    late: D.filter(isWoLate).length,
    mine: open.filter(w => isMine([w.moldEngineer, w.manufacturingEngineer])).length,
    curing, blocked, issues,
  };
}
function resetWOFilters() { view = { ...view, woOpen: false, woLate: false, woMine: false, woDone: false, woIssues: false, woOnlyRnd: false, fStatus: "", fSub: "", q: "" }; render(); }

/* ---------- selection ----------
   view.mode === "detail" stays the switch, exactly as it was when this tab was
   a full-page swap. A dozen tests set it directly, and print.js's ⌘P mount
   reads it — a different selection model would break both in ways whose symptom
   points somewhere else entirely. */
function selectedWO() { return view.mode === "detail" ? woById(view.id) : null; }
function selectWO(id) {
  view = { ...view, mode: "detail", id, edit: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearWOSelection() { view = { ...view, mode: "list", edit: false }; render(); }

/* Arriving from a lineage bar, the Dashboard or a scanned label goes through
   openRecord(), which sets view.mode/id without ever calling selectWO() — so
   the rail would render with the selected row forty rows below the fold. Called
   from render(), same guarded idiom as syncTimelineScroll(). */
function syncWORailScroll() {
  if (typeof document.querySelector !== "function") return;
  if (view.tab !== "workorders" || view.mode !== "detail" || !view.id) return;
  const el = document.getElementById("pi-" + view.id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}

function renderWorkOrders() {
  const sel = selectedWO();
  return `<div class="mdsplit wosplit ${sel ? "has-sel" : ""}">
    ${renderWOIndex()}${sel ? renderWODetail() : renderWOOverview()}
  </div>`;
}

/* One rail row. Four fixed slots, same grammar as Parts and Molds, so the
   ≤900 collapse and the tablet-band rules apply without knowing what a work
   order is. */
function woIndexItem(w, opts) {
  opts = opts || {};
  const sel = view.mode === "detail" && view.id === w.id;
  const done = w.status === "Complete";
  const pr = woProgress(w);
  const fl = woFlags(w);
  const late = isWoLate(w);
  const engs = [w.moldEngineer, w.manufacturingEngineer].filter(Boolean);
  // Grouped by part, the header already said the part name — repeating it down
  // twelve rows is a column of the same word. Lead with the id instead.
  const name = opts.hidePart
    ? `${esc(w.id)}<span class="tny muted"> rev ${esc(w.revision || "A")}</span>`
    : `${esc(w.partName || w.id)}<span class="tny muted"> ${esc(w.id.replace(/^WO-/, ""))}</span>`;
  // At most ONE flag. Blocked beats curing: one of them is something to fix and
  // the other is something to wait for.
  const flag = fl.blocked ? `<span class="wflag blocked">blocked</span>`
    : fl.curing ? `<span class="wflag curing">curing</span>` : "";
  /* In pick mode the whole row toggles, because a checkbox is a small target on
     the tablet this is used from. The box lives INSIDE .pi-name rather than as a
     fifth child of .pitem, which is a grid with four named columns. */
  const picking = woPickOn();
  const ticked = picking && !!view.woPick[w.id];
  const box = picking
    ? `<input type="checkbox" class="wopick" ${ticked ? "checked" : ""} aria-label="Select ${esc(w.id)}"
        onclick="event.stopPropagation();toggleWOPick('${esc(w.id)}')"> `
    : "";
  return `<div class="pitem ${sel ? "sel" : ""} ${done ? "isdone" : ""} ${ticked ? "picked" : ""} ${isArchived(w) ? "isarch" : ""}" id="pi-${esc(w.id)}"
      role="option" aria-selected="${picking ? ticked : sel}" title="${esc(w.id)} · ${esc(w.processType || "")} · ${esc(w.status || "")}"
      onclick="${picking ? `toggleWOPick('${esc(w.id)}')` : `selectWO('${esc(w.id)}')`}">
    <span class="pi-name">${box}${name}${w.retro ? ' <span class="pill retro tny">retro</span>' : ""}${rndBadge(woIsRnd(w))}${archivedPill(w, true)}</span>
    <span class="pi-due ${late ? "warn" : ""}">${w.dueDate ? shortDate(w.dueDate) + (late ? " " + icon("warning", 12) : "") : ""}</span>
    <span class="pi-sub">${woProgBar(pr)}${flag || `<span class="tny">${esc(opts.hidePart ? (w.processType || "") : (w.subteam || ""))}</span>`}</span>
    <span class="pi-who">${engs.map(e => avatar(e, 20)).join("")}</span>
  </div>`;
}
/* The one number the flat table never had: how far through its buy-offs this
   run is. A bar plus the fraction, because a bar alone can't tell 4/9 from
   40/90 and the fraction alone doesn't scan down a column. */
function woProgBar(pr) {
  const pct = Math.round(pr.pct * 100);
  return `<span class="wprog" title="${pr.done} of ${pr.total} steps signed">
    <span class="wp-bar"><i style="width:${pct}%"></i></span><b>${pr.done}/${pr.total}</b></span>`;
}

function woGroupHead(label, rows, extra) {
  const late = rows.filter(isWoLate).length;
  return `<div class="pgrouphd">
    <span class="pg-name">${label}</span>
    <span class="pg-n">${rows.length} ${rows.length === 1 ? "run" : "runs"}</span>
    ${late ? `<span class="pg-n pg-late">${icon("warning", 12)} ${late} late</span>` : ""}
    ${extra || ""}
  </div>`;
}

/* The rail body. Headers are drawn HERE and nowhere else — see woIndexRows().

   Grouped by part, this also emits a header for every part with no runs at all,
   carrying the button that starts one. Those headers have no rows under them
   and are not in woIndexRows(), so the keyboard never lands on one; they are
   the visible answer to "what haven't we started yet", which is the question
   the flat table could not answer without leaving the tab. */
/* Parts with no run, under the SAME season / archived / R&D switches as the
   runs beside them. Before v4.3.0 this read DB.parts whole, so with the rail
   showing SN6 the "no run yet" headers still listed every SN5 part, and a
   name both seasons used (CLAMSHELL, DASHBOARD) appeared twice. */
function woPartsNoRun() {
  return (DB.parts || []).filter(p => !partRuns(p).length)
    .filter(p => view.allSeasons || thisSeason(p))
    .filter(p => (view.showArch ? isArchived(p) : !isArchived(p)))
    .filter(p => (view.woOnlyRnd ? isRnd(p) : !isRnd(p)));
}
function woIndexBody(rows) {
  const key = woSortKey();
  const grouping = WO_GROUPS[key];
  if (!grouping) return rows.map(w => woIndexItem(w)).join("");

  if (key === "gpart") {
    const groups = new Map();               // partId ("" = unlinked) -> rows
    rows.forEach(w => {
      const g = grouping(w);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(w);
    });
    const entries = [];
    groups.forEach((rs, pid) => {
      if (!pid) return;                     // the unlinked block is appended last
      const p = recById("parts", pid);
      entries.push({ sort: ((p && (p.partName || p.id)) || "").toLowerCase(), pid, p, rows: rs });
    });
    // Parts nobody has started. Interleaved alphabetically rather than dumped in
    // a block at the end, because the point is to see the gap where a run should
    // be, next to the parts that have one.
    woPartsNoRun().forEach(p => {
      if (groups.has(p.id)) return;
      entries.push({ sort: (p.partName || p.id).toLowerCase(), pid: p.id, p, rows: [], empty: true });
    });
    entries.sort((a, b) => a.sort.localeCompare(b.sort));
    let out = entries.map(e => {
      const label = `<span class="pg-open" onclick="event.stopPropagation();openRecord('parts','${esc(e.pid)}')"
        role="button" tabindex="0" title="Open ${esc((e.p && (e.p.partName || e.p.id)) || e.pid)} in Parts">${esc((e.p && (e.p.partName || e.p.id)) || e.pid)}</span>`;
      if (e.empty) {
        return `<div class="pgrouphd norows">
          <span class="pg-name">${label}</span>
          <span class="pg-n">no run yet</span>
          <button class="sm pg-start no-print" onclick="newRunForPart('${esc(e.pid)}')">+ Start run</button>
        </div>`;
      }
      return woGroupHead(label, e.rows) + e.rows.map(w => woIndexItem(w, { hidePart: true })).join("");
    }).join("");
    const loose = groups.get("") || [];
    if (loose.length) {
      // Named, not left as an empty heading: 0 of 33 SN5 parts carry an id link,
      // so this block is the visible to-do list for the archive.
      out += woGroupHead(`<span class="pg-name">Not linked to a part</span>`, loose)
        + loose.map(w => woIndexItem(w)).join("");
    }
    return out;
  }

  let out = "", run = null;
  rows.forEach(w => {
    const g = grouping(w);
    if (g !== run) {
      run = g;
      out += woGroupHead(esc(g || "None"), rows.filter(r => grouping(r) === g));
    }
    out += woIndexItem(w);
  });
  return out;
}

function renderWOIndex() {
  const D = DB.workOrders || [];
  const rows = woIndexRows();
  const s = woSummary();
  const subs = [...new Set(D.map(w => w.subteam))].filter(Boolean).sort();
  const key = woSortKey();
  return `
  <aside class="mdindex" aria-label="Work orders index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        ${woPickOn() ? (() => {
          const n = woPickedIds().length;
          return `<button class="sm" onclick="woPickAll(true)">All ${rows.length}</button>
            <button class="sm" onclick="woPickAll(false)">None</button>
            <span class="muted tny">${n} selected</span>
            <button class="sm" style="margin-left:auto" ${n ? "" : "disabled"} onclick="archivePickedWOs(${view.showArch ? "false" : "true"})">${view.showArch ? "Restore" : "Archive"} ${n || ""}</button>
            ${isLead() ? `<button class="danger sm" ${n ? "" : "disabled"} onclick="deletePickedWOs()">Delete ${n || ""}</button>` : ""}
            <button class="sm ib" onclick="cancelWOPick()">${icon("x", 14)}</button>`;
        })() : `<button class="primary ib"${gx("Sign in to start a run.")} onclick="newWO()">${icon("plus", 15)} New WO</button>
        <button class="ib" onclick="newWO(true)">${icon("plus", 15)} R&amp;D run</button>
        <button class="sm" onclick="openBlankTraveler()">Blank traveler</button>
        ${/* Any roster member can pick, because Archive is a plain update. The
              Delete button inside pick mode is what stays lead-only: the rules
              allow a workOrders delete to leads only, so a member's bulk delete
              would fail server-side, one record at a time, after the confirm. */""}
        ${canEdit() ? `<button class="sm" onclick="startWOPick()">Select…</button>` : ""}
        <span class="muted tny" style="margin-left:auto">${rows.length} of ${D.length} work orders</span>`}
      </div>
      <div class="psum">
        ${summaryChip("open", s.open, !!view.woOpen, "view.woOpen=!view.woOpen;view.woDone=false;render()")}
        ${summaryChip("late", s.late, !!view.woLate, "view.woLate=!view.woLate;view.woMine=false;render()", s.late ? "bad" : "")}
        ${/* Not for a guest: myEmail() is "" so isMine() matches nothing, and
              this would be a chip that can only ever filter to an empty list. */""}
        ${(window.fb && fb.guest) ? "" : summaryChip("mine", s.mine, !!view.woMine, "view.woMine=!view.woMine;view.woLate=false;render()")}
        ${summaryChip("done", s.done, !!view.woDone, "view.woDone=!view.woDone;view.woOpen=false;render()")}
        ${summaryChip("issues", s.issues, !!view.woIssues, "view.woIssues=!view.woIssues;view.woDone=false;render()", s.issues ? "bad" : "")}
        ${/* Same shape and same reasoning as the Parts rail's: only when there
              are R&D runs, counting what exists rather than what is on screen,
              because while it is off that is the number being held back. */""}
        ${(() => { const n = (DB.workOrders || []).filter(woIsRnd).length;
          return n ? summaryChip("R&D", n, !!view.woOnlyRnd, "view.woOnlyRnd=!view.woOnlyRnd;render()") : ""; })()}
        ${(() => { const h = railHeldBack(DB.workOrders);
          return (h.other ? summaryChip(h.otherLabel, h.other, !!view.allSeasons, "view.allSeasons=!view.allSeasons;render()") : "")
            + (h.arch ? summaryChip("archived", h.arch, !!view.showArch, "view.showArch=!view.showArch;render()") : ""); })()}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search id / part…" value="${esc(view.q)}" oninput="searchInput(this)">
        <select title="Status" onchange="view.fStatus=this.value;render()">
          <option value="">All statuses</option>
          ${WO_STATUSES.map(st => `<option ${view.fStatus === st ? "selected" : ""}>${esc(st)}</option>`).join("")}
        </select>
        <select title="Subteam" onchange="view.fSub=this.value;render()">
          <option value="">All subteams</option>
          ${subs.map(st => `<option ${view.fSub === st ? "selected" : ""}>${esc(st)}</option>`).join("")}
        </select>
        <select title="Group or sort by" onchange="sortWOsBy(this.value)">
          ${Object.keys(WO_SORT_LABELS).map(k => `<option value="${k}" ${key === k ? "selected" : ""}>${esc(WO_SORT_LABELS[k])}</option>`).join("")}
        </select>
        <button class="sm sortdir" title="Reverse order" onclick="toggleWOSortDir()">${view.sortDir === "desc" ? "▼" : "▲"}</button>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Work orders">
      ${rows.length || (key === "gpart" && (DB.parts || []).length) ? woIndexBody(rows) : `<div class="pempty muted">${
        D.length ? "No work orders match these filters." : `No work orders yet — <b>New WO</b> to start.`}</div>`}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      selectedWO() ? "<span><kbd>1</kbd>–<kbd>8</kbd> jump</span>" : ""
    }<span><kbd>/</kbd> search</span><span><kbd>e</kbd> edit</span><span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* The blank traveler used to be a naked <select> sitting in the list toolbar.
   There is no room for one in a 320px rail, and it was the only control on the
   tab that did something without a record selected. */
function openBlankTraveler() {
  openModal(`<h3>Print a blank traveler</h3>
    <p class="muted">A paper form with the standard steps for one process and nothing filled in.</p>
    <div class="f"><label>Process</label>
      <select id="blankproc">${allTechniques().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="(function(){var v=document.getElementById('blankproc').value;closeModal();printBlankWO(v);})()">Print</button>
    </div>`);
}

/* ---------- right pane when nothing is selected ----------
   The rail answers "which run"; this answers "what is the state of the build".
   At ≤900 it is never shown, because there the rail owns the screen. */
function renderWOOverview() {
  const D = DB.workOrders || [];
  const s = woSummary();
  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;
  const open = D.filter(w => w.status !== "Complete");
  const curing = [], blocked = [];
  open.forEach(w => { const f = woFlags(w); if (f.curing) curing.push({ w, h: f.curing }); if (f.blocked) blocked.push({ w, b: f.blocked }); });
  const late = D.filter(isWoLate).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
  const mine = open.filter(w => isMine([w.moldEngineer, w.manufacturingEngineer]));
  const noRun = woPartsNoRun();
  const mini = (w, right) => `<div class="pmini" onclick="selectWO('${esc(w.id)}')">
    <span class="pm-name">${esc(w.partName || w.id)}</span>
    ${woProgBar(woProgress(w))}
    <span class="pm-due">${right || (w.dueDate ? shortDate(w.dueDate) : "no date")}</span></div>`;
  return `
  <section class="mddetail" aria-label="Work orders overview">
    <div class="stat-row">
      ${tile(s.open, "Open runs")}${tile(s.late, "Behind due date", s.late ? "bad" : "")}${tile(s.curing, "Curing", s.curing ? "warn" : "")}${tile(s.blocked, "Blocked", s.blocked ? "bad" : "")}
    </div>
    <div class="card">
      <h2>Runs in flight</h2>
      <div class="muted">${s.open} open · ${s.done} complete · ${D.filter(w => w.retro).length} retro records. Pick a run on the left.</div>
      ${curing.length ? `<h3>Waiting on a cure</h3>${curing.map(({ w, h }) =>
        /* An absolute clock time, never a countdown. The 60-second tick that
           keeps a countdown honest is armed only by the Steps section (see
           syncHoldTick), so a countdown painted here would be wrong a minute
           later with nothing to correct it. dashboard.js:162 made the same
           call for the same reason. */
        mini(w, "ready " + esc(h.readyAt))).join("")}` : ""}
      ${blocked.length ? `<h3>Blocked right now</h3>${blocked.map(({ w, b }) =>
        mini(w, esc(stripCS(b.title)))).join("")}` : ""}
      ${late.length ? `<h3>Behind due date</h3>${late.slice(0, 8).map(w => mini(w)).join("")}
        ${!view.woLate ? `<button class="sm no-print" onclick="view.woLate=true;view.woMine=false;render()">Show only these</button>` : ""}` : ""}
      ${mine.length ? `<h3>On you</h3>${mine.slice(0, 8).map(w => mini(w)).join("")}` : ""}
    </div>
    ${/* Only when the rail is NOT already showing them. Grouped by part (the
          default) every one of these has its own header on the left with the
          same button on it, and the pane repeating the list beside it is the
          same twelve rows twice on one screen. Grouped any other way the rail
          drops them, and this is the only place they appear. */""}
    ${noRun.length && woSortKey() !== "gpart" ? `<div class="card">
      <h3>Parts with no run yet</h3>
      <div class="muted tny">Nothing has been started for these. Starting a run copies the part's plan onto it.</div>
      ${noRun.slice(0, 12).map(p => `<div class="pmini">
        <span class="pm-name">${esc(p.partName || p.id)}</span>
        <span class="tny muted">${esc(p.subteam || "")}</span>
        <button class="sm no-print" onclick="event.stopPropagation();newRunForPart('${esc(p.id)}')">+ Start run</button>
      </div>`).join("")}
    </div>` : ""}
    <div class="card no-print">
      <h3>Paper</h3>
      <div class="muted">A blank form to take to the bench when the job is ahead of the record.</div>
      <div style="margin-top:8px"><button onclick="openBlankTraveler()">Print blank traveler</button></div>
    </div>
  </section>`;
}

function fld(wo, label, key, type) {
  const v = wo[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
  if (type === "select-status") return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${WO_STATUSES.map(s => `<option ${v === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`;
  /* The stored VALUE is the id and the label is the technique's name, so a
     lead renaming "Mold wet lay" renames it here too. An archived technique is
     still offered when the run is already on it, or editing any other field
     would silently move the run onto a different process. */
  if (type === "select-process") {
    const opts = allTechniques().concat(allTechniques(true).filter(t => t.archived && t.id === v));
    return `<div class="f"><label>${label}</label><select onchange="updWO('${key}',this.value)">${
      opts.map(t => `<option value="${esc(t.id)}" ${v === t.id ? "selected" : ""}>${esc(t.name)}${t.archived ? " (archived)" : ""}</option>`).join("")}</select></div>`;
  }
  return `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="updWO('${key}',this.value)"></div>`;
}

/* ---------- the detail pane ----------
   A work order carries more than any other record here: eleven header fields, a
   mold block, the layup stack, a BOM, the steps and their buy-offs, quality
   checks, documents, files, an event log, free notes and a comment thread. As a
   full-width page that was one very long scroll with an anchor jumpbar bolted on
   top; beside a rail it would be the same scroll in three quarters of the width.

   So the pane is ordered rather than paginated: the whole record is ONE scroll,
   with Steps at the top because that is the bench action, and the bar above it
   jumps you down to a section instead of swapping which one exists.

   This was briefly one-section-at-a-time, and Simon asked for the scroll back.
   The reason is sound: on a traveler you read across sections constantly (the
   stack while signing "Stack frozen", the BOM while checking what went in), and
   a tab makes you leave one to see the other. What the bar keeps from that
   attempt is the part worth keeping — a count per section, and a dot when
   something in it needs attention, both visible without going there.

   The sections are a table rather than six inline blocks so the jump bar and
   the body cannot disagree about what exists or what order it is in. */
const WO_SECTIONS_BASE = [
  { id: "steps", label: "Steps", anchor: "wo-steps",
    badge: w => { const p = woProgress(w); return p.total ? `${p.done}/${p.total}` : ""; },
    warn: w => { const f = woFlags(w); return !!(f.blocked || f.curing); },
    warnWord: w => (woFlags(w).blocked ? "blocked" : "curing"),
    // Someone can stow even Steps behind the sticky fold; the folded header
    // then still says how far along the run is and that a NOW exists.
    foldHint: w => (!w.retro && (w.steps || []).some(s => stepState(s) !== "done" && stepState(s) !== "failed"))
      ? '<span class="secnav-dot gold" aria-hidden="true" title="has an up-next step"></span>' : "",
    body: (w, E) => woSecSteps(w, E) },
  /* Issues used to be a bare chip row inside Quality, which made a defect that
     holds this run from closing look like a footnote to the acceptance table.
     It is its own section now: the badge counts disposed/total, and the warn
     dot overrides the empty-fold so an undisposed issue can never be stowed. */
  { id: "issues", label: "Issues", anchor: "wo-issues",
    badge: w => { const all = issuesForWO(w.id);
      return all.length ? `${all.filter(p => projStatus(p) === "Done").length}/${all.length}` : ""; },
    warn: w => undisposedIssuesForWO(w.id).length > 0,
    warnWord: w => { const n = undisposedIssuesForWO(w.id).length; return n > 1 ? `${n} undisposed` : "undisposed"; },
    foldWhen: w => !issuesForWO(w.id).length,
    body: (w, E) => woSecIssues(w, E) },
  // Pure reference: the facts band above carries status, due, mass and the
  // engineers, so the field grid folds by default (secFolded opens it in E).
  { id: "overview", label: "Details", anchor: "wo-overview", badge: () => "",
    foldWhen: () => true,
    body: (w, E) => woSecOverview(w, E) },
  { id: "stack", label: "Stack & BOM", anchor: "wo-stack",
    badge: w => String((w.layupStack || []).length || ""),
    subAnchors: ["wo-bom"],
    body: (w, E) => woSecStack(w, E) },
  // An aggregation of the step evidence — the steps show their own strips.
  { id: "photos", label: "Photos", anchor: "wo-photos",
    badge: w => String(woAllPhotos(w).length || ""),
    foldWhen: () => true,
    body: (w, E) => woSecPhotos(w, E) },
  { id: "quality", label: "Quality", anchor: "wo-quality",
    badge: w => String((w.qualityChecks || []).length || ""),
    warn: w => (w.qualityChecks || []).some(q => q.pass === false),
    warnWord: w => { const nf = (w.qualityChecks || []).filter(q => q.pass === false).length; return `${nf} failed`; },
    // Reference-shaped when empty: nothing to read, nothing wrong. Edit mode
    // keeps it open (secFolded) so "+ check" is on screen.
    foldWhen: w => !(w.qualityChecks || []).length,
    body: (w, E) => woSecQuality(w, E) },
  { id: "files", label: "Files & docs", anchor: "wo-docs",
    badge: w => String(((w.docs || []).length + (w.files || []).length) || ""),
    subAnchors: ["wo-files"],
    foldWhen: () => true,
    body: (w, E) => woSecFiles(w, E) },
  { id: "notes", label: "Notes & log", anchor: "wo-log",
    badge: w => String((w.noteLog || []).length || ""),
    subAnchors: ["wo-eventlog"],
    // Folded unless somebody wrote a note since you last looked — then it
    // opens itself and wears the gold dot (gold = new, amber = trouble).
    foldWhen: w => !woNotesFresh(w),
    fresh: w => woNotesFresh(w),
    body: (w, E) => woSecNotes(w, E) },
];

/* Order is a function of edit mode, not a constant.

   Creating a work order (newWO opens in edit) and editing one both put you in
   the Details field grid — and Details was the SECOND card, below a seven-step
   list, so a new run opened already scrolled past the only fields it has. In
   edit mode Details leads; reading a run, Steps leads, because that is the
   bench action.

   Every consumer — the jump bar, the section cards, secJumpOpen and the digit
   keys — goes through this ONE call. That is the whole reason the sections are
   a table: the bar and the body cannot disagree about what order they are in. */
function woSections(E) {
  if (!E) return WO_SECTIONS_BASE;
  const i = WO_SECTIONS_BASE.findIndex(s => s.id === "overview");
  if (i < 0) return WO_SECTIONS_BASE;
  const out = WO_SECTIONS_BASE.slice();
  out.unshift(out.splice(i, 1)[0]);
  return out;
}

/* "New since you last looked", for the Notes & log fold. Session map + a
   localStorage stamp: the stamp advances the moment the record renders, and
   the session map is what keeps the dot and the auto-open stable across the
   constant re-renders while you read — without it, the very stamp that marks
   the note seen would snap the fold shut mid-scroll. Your own note doesn't
   count as news. `var` so the node harness reaches it through globalThis. */
var WO_NOTES_NEW = {};
function woNotesFresh(w) { return !!WO_NOTES_NEW[w.id]; }
function woSyncNotesSeen(w) {
  const log = w.noteLog || [];
  if (!log.length) return;
  const last = log[log.length - 1];
  const ts = String(last.ts || "");
  if (!ts) return;
  let seen = {};
  try { if (typeof localStorage !== "undefined") seen = JSON.parse(localStorage.getItem("feb-wo-notes-seen") || "{}"); } catch (e) { seen = {}; }
  if ((seen[w.id] || "") < ts) {
    if (last.email !== myEmail()) WO_NOTES_NEW[w.id] = true;
    seen[w.id] = ts;
    try { if (typeof localStorage !== "undefined") localStorage.setItem("feb-wo-notes-seen", JSON.stringify(seen)); } catch (e) { /* storage full/blocked — the dot just shows again next visit */ }
  }
}

/* One card per section — the card gap is the zone boundary Simon asked for
   ("distinct zones, quiet inside"). The header replaces the bare h3: same
   label the jump bar uses, the same badge()/warn() answers (one source of
   truth, they cannot disagree), and the attention dot always paired with a
   word because hue is never the only carrier. Sections that are pure
   reference while empty render as a closed <details> whose summary IS the
   header — everything stays one tap away, and woJump() opens it before
   scrolling. The anchor id lives on the header now, not on an h3 inside. */
function woSectionCard(s, wo, E) { return sectionCard(s, wo, E); }
/* Scroll, rather than an <a href="#wo-steps">. The app keeps a deep link in the
   URL hash (syncUrl writes #/WO-SN6-004), and an anchor would overwrite it with
   #wo-steps — so the address bar would stop naming the record you are reading
   and a copied link would land on the tab instead of the run. The old jumpbar
   did use anchors and did exactly that.

   scroll-margin-top on #main [id^="wo-"] (index.html) is what keeps the heading
   clear of the topbar and this bar. */
function woJump(anchor) {
  // A jump to a folded section means "show me": secJumpOpen opens the fold
  // (and any inner <details> like the BOM) before scrolling.
  const wo = woById(view.id);
  if (wo) secJumpOpen(woSections(view.edit), wo, anchor); else secJump(anchor);
}

/* The part this run belongs to, for the header chip and for stackDrift().
   Deliberately the ORIGINAL loose lookup and not woPart()/partOf(): partOf
   refuses when two parts share a name, and the drift comparison has always
   accepted the looser match. Changing which part a stack is compared against is
   not a layout change. */
function woDetailPart(wo) {
  return wo.partId ? recById("parts", wo.partId)
    : DB.parts.find(p => (p.partName || "").toUpperCase() === (wo.partName || "").toUpperCase());
}

function renderWODetail() {
  const wo = woById(view.id);
  // Falls back to the OVERVIEW pane. renderWOList() no longer exists, and a
  // dangling reference here throws inside render() and blanks the page.
  if (!wo) { view.mode = "list"; return renderWOOverview(); }
  const E = view.edit;
  const linkedPart = woDetailPart(wo);
  const undisposed = undisposedIssuesForWO(wo.id);
  const fl = woFlags(wo);
  woSyncNotesSeen(wo); // arms the Notes & log "new" dot + auto-open
  return `
  <section class="mddetail" aria-label="Work order detail" data-lbgroup="workOrders:${esc(wo.id)}">
  <div class="toolbar no-print">
    <button class="ib" onclick="clearWOSelection()">${icon("chevronLeft", 16)} All work orders</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    <button onclick="openPrintPreview('${wo.id}')">Print</button>
    ${labelBtn("workOrders", wo.id)}
    <button onclick="woJump('wo-issues')">⚠ Issues</button>
    ${E ? `<button onclick="archiveWO('${wo.id}',${isArchived(wo) ? "false" : "true"})">${isArchived(wo) ? "Restore" : "Archive"}</button>` : ""}
    ${E && isLead() ? `<button onclick="resetSteps(woById('${wo.id}'))">Reset steps to standard</button>
    <button class="danger" onclick="delWO('${wo.id}')">Delete</button>` : ""}
    <span class="mdnav no-print">
      <button class="sm" title="Previous work order (↑)" onclick="moveWOSelection(-1)">${icon("chevronLeft", 14)}</button>
      <button class="sm" title="Next work order (↓)" onclick="moveWOSelection(1)">${icon("chevronRight", 14)}</button>
    </span>
  </div>
  ${lineageBar("workOrders", wo.id)}
  ${/* Everything in here is true of the whole record, so it renders whichever
        section is open. A gate you can navigate away from is a gate that gets
        walked past. */""}
  <div class="card wohead">
    <h2>${esc(wo.id)} · ${esc(wo.partName || "(unnamed)")} ${wo.retro ? '<span class="pill retro">retro record</span>' : ""}${rndBadge(woIsRnd(wo))}${archivedPill(wo)}</h2>
    ${/* The facts band replaces the old middle-dot run-on line: the answers
          someone actually comes for (can I work it, how far along, when is it
          due, is it on mass, whose is it) each get their own labeled slot.
          Status is the colored select — the statusdrop pattern Budget and
          tickets already use — so changing it needs no edit mode; updWO()
          still carries the CS-003 completion gate. */""}
    <div class="wo-facts">
      <span class="statusdrop ${esc(wo.status)}"><select aria-label="Status" onchange="updWO('status',this.value)">
        ${WO_STATUSES.map(s => `<option ${wo.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select></span>
      ${(() => { const p = woProgress(wo); return p.total ? woProgBar(p) : ""; })()}
      ${wo.dueDate ? `<span class="wo-fact"><span class="wf-lab">Due</span><b class="wf-num ${isWoLate(wo) ? "late" : ""}">${esc(wo.dueDate)}</b>${isWoLate(wo) ? '<span class="warn tny">late</span>' : ""}</span>` : ""}
      ${wo.weightTargetG || wo.weightActualG ? `<span class="wo-fact"><span class="wf-lab">Mass</span><b class="wf-num ${wo.weightActualG && wo.weightTargetG && +wo.weightActualG > +wo.weightTargetG ? "late" : ""}">${esc(wo.weightActualG || "—")}</b><span class="tny muted">/ ${esc(wo.weightTargetG || "—")} g</span></span>` : ""}
      ${(() => {
        const engs = [["moldEngineer", "Mold engineer"], ["manufacturingEngineer", "Manufacturing engineer"]]
          .map(([k, role]) => {
            const nm = String(wo[k] || "").trim();
            if (!nm || (typeof notAPerson === "function" && notAPerson(nm))) return "";
            const email = partEngineerEmail(wo, k);
            return `<span class="wf-eng" title="${esc(role)} — ${esc(nm)}">${avatar(email || nm, 24)}</span>`;
          }).filter(Boolean).join("");
        return engs ? `<span class="wo-fact">${engs}</span>` : "";
      })()}
    </div>
    <div class="muted tny">Rev ${esc(wo.revision)} · ${esc(wo.processType || "")}${linkedPart ? " · part " + chip("parts", linkedPart.id, linkedPart.id) : ""}${wo.updatedAt ? ` · last saved ${fmtWhen(wo.updatedAt)} by ${esc(wo.updatedBy || "?")}` : ""}</div>
    ${undisposed.length ? `<div class="gate blocked"><span class="gi">✕</span><div><b>Can't complete this work order</b> — ${undisposed.length} linked issue${undisposed.length > 1 ? "s" : ""} (${undisposed.map(i => chip("projects", i.id, i.id)).join(", ")}) isn't disposed yet. You don't have to resolve ${undisposed.length > 1 ? "them" : "it"} right now, but ${undisposed.length > 1 ? "they need" : "it needs"} a resolution method before this WO can close. <button class="link no-print" onclick="openWOCloseoutModal('${esc(wo.id)}')">Dispose ${undisposed.length > 1 ? "them" : "it"} now</button></div></div>` : ""}
    ${fl.blocked ? `<p class="gate blocked"><span class="gi">✕</span><span>Blocked by an unsigned blocker: <b>${esc(stripCS(fl.blocked.title))}</b>. <button class="link no-print" onclick="woJump('wo-steps')">Go to steps</button></span></p>` : ""}
    ${fl.curing ? `<p class="gate"><span class="gi">⚠</span><span>Curing until <b>${esc(fl.curing.readyAt)}</b>${fl.curing.resin ? ` · ${esc(fl.curing.resin.label)}` : ""}. <button class="link no-print" onclick="woJump('wo-steps')">Go to steps</button></span></p>` : ""}
    ${E ? `<div class="editnote no-print">${icon("edit", 14)} Editing — every change saves as you make it.</div>` : ""}
  </div>
  ${/* A jump bar, not a switch: every section below is rendered, this scrolls
        to one. Carries the count and the attention dot so you can see there are
        five plies, or that a quality check failed, without going there. */""}
  ${secNav("wosec", woSections(E), wo, "woJump", "Jump to a section of this work order")}
  ${woSections(E).map(s => woSectionCard(s, wo, E)).join("")}
  ${woThreadCard(wo)}
  </section>`;
}

function woSecOverview(wo, E) {
  const moldRows = wo.mold ? `
    <div class="fgroup-label">Mold</div><div class="grid">
      ${mf(wo, "Mold ID", "moldId")}${mf(wo, "Layers", "layers")}${mf(wo, "Density (lb/ft³)", "density")}
      ${mf(wo, "Sealing", "sealingType")}${mf(wo, "Location (update on every move)", "location")}
    </div>` : "";
  // Edit mode keeps every field on one grid — no edit path is lost to the
  // hero. View mode shows the remainder the hero does not carry, in labeled
  // clusters instead of one sixteen-cell wall; mass repeats here because
  // duplication is fine and dropping is not.
  if (E) return `
    <div class="grid">
      ${fld(wo, "Part name", "partName")}${fld(wo, "Subteam", "subteam")}${fld(wo, "Status", "status", "select-status")}
      ${fld(wo, "Process", "processType", "select-process")}${engFld("workOrders", wo, "Mold Engineer", "moldEngineer")}
      ${engFld("workOrders", wo, "Manufacturing Engineer", "manufacturingEngineer")}${fld(wo, "Created", "createdDate")}${fld(wo, "Due", "dueDate")}
      ${fld(wo, "Revision", "revision")}${fld(wo, "Mass target (g)", "weightTargetG")}${fld(wo, "Mass actual (g)", "weightActualG")}
    </div>
    ${moldRows}`;
  return `
    <div class="fgroup-label">Identity</div>
    <div class="grid">
      ${fld(wo, "Part name", "partName")}${fld(wo, "Subteam", "subteam")}${fld(wo, "Revision", "revision")}${fld(wo, "Created", "createdDate")}
    </div>
    <div class="fgroup-label">People</div>
    <div class="grid">
      ${engFld("workOrders", wo, "Mold Engineer", "moldEngineer")}${engFld("workOrders", wo, "Manufacturing Engineer", "manufacturingEngineer")}
    </div>
    <div class="fgroup-label">Mass</div>
    <div class="grid">
      ${fld(wo, "Mass target (g)", "weightTargetG")}${fld(wo, "Mass actual (g)", "weightActualG")}
    </div>
    ${moldRows}`;
}

/* Stack and BOM share a section because both answer "what goes into this part"
   and neither is long enough to own a tab of its own. */
function woSecStack(wo, E) {
  const linkedPart = woDetailPart(wo);
  const stack = (() => {
    // The run's stack is what it actually laid. Say plainly whether that is
    // still the part's plan or has diverged from it, and make the difference
    // one click away rather than something you reconstruct by eye.
    const drift = linkedPart ? stackDrift(linkedPart, wo) : { rows: {}, n: 0 };
    const diverged = wo.stackSource === "asbuilt" && drift.n > 0;
    const src = !linkedPart ? ""
      : diverged
        ? ` <span class="muted nocaps">· as built on this run</span>`
        : ` <span class="muted nocaps">· follows the plan on ${esc(linkedPart.id)}</span>`;
    return `<h3>Layup stack${src} ${wo.stackNote ? `<span class="muted nocaps">· ${esc(wo.stackNote)}</span>` : ""}</h3>
    ${diverged ? `<div class="stack-diff no-print">${icon("warning", 14)}
      <span>${drift.n} ${drift.n === 1 ? "ply differs" : "plies differ"} from ${esc(linkedPart.partName || linkedPart.id)}'s plan.</span>
      <button class="link" onclick="openStackCompare('${esc(wo.id)}')">Compare</button></div>` : ""}
    ${stackFrozen(wo) ? `<div class="tny muted no-print">Stack frozen — the bench is working to this. Editing the part's plan will not move it.</div>` : ""}
    ${plyTable("workOrders", wo, { edit: E, drift: diverged ? drift.rows : {} })}`;
  })();
  return `
    ${stack}
    ${/* Reference data, read at material-pull time, not continuously — so it
          folds even when populated, with the count on the always-visible
          summary. Edit mode opens it: that is when the rows get typed. */""}
    <details class="wo-subfold" ${E ? "open" : ""}>
    <summary id="wo-bom" class="wo-subhd">BOM${(wo.bom || []).length ? ` <span class="wosec-n">${(wo.bom || []).length}</span>` : ' <span class="tny muted nocaps">empty</span>'}${woBomMoneyLine(wo)}</summary>
    ${wo.bomFrom ? `<div class="tny muted">Copied from ${esc(wo.bomFrom)}${wo.bomCopiedOn ? " on " + esc(wo.bomCopiedOn) : ""} — edits here are the as-built record, never the plan.</div>` : ""}
    ${woConsumeUndoBar(wo.id)}
    ${E ? `<table class="sub"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead><tbody>
      ${(wo.bom || []).map((b, i) =>
        `<tr><td><input value="${esc(b.item)}" onchange="ub(${i},'item',this.value)"></td><td><input value="${esc(b.qty)}" onchange="ub(${i},'qty',this.value)"></td><td><input value="${esc(b.unit)}" onchange="ub(${i},'unit',this.value)"></td><td><input value="${esc(b.source)}" onchange="ub(${i},'source',this.value)"></td><td><input value="${esc(b.estCost)}" onchange="ub(${i},'estCost',this.value)"></td></tr>`).join("")}
    </tbody></table>
    <button onclick="woById('${wo.id}').bom.push({lineId:bomLineId(),item:'',qty:'',unit:'',source:'',estCost:'',ref:''});saveWO(woById('${wo.id}'),'bom');render()">+ BOM line</button>`
    : `<table class="sub"><thead><tr><th>Item</th><th>Plan</th><th>Used</th><th>Unit</th><th>Cost</th><th class="no-print"></th></tr></thead><tbody>
      ${(wo.bom || []).map(b => `<tr>
        <td>${esc(b.item)}${b.ref ? ` ${shopRefChip(String(b.ref))}` : ""}${b.source ? ` <span class="tny muted nocaps">· ${esc(b.source)}</span>` : ""}</td>
        <td>${esc(b.qty)}</td>
        <td>${b.consumed
          ? `${esc(b.usedQty) || '<span class="muted" title="quantity unknown">?</span>'}${woBomDelta(b)}`
          : '<span class="muted">—</span>'}</td>
        <td>${esc(b.unit)}</td>
        <td>${b.consumed
          ? (typeof b.costAtConsumption === "number" ? esc(fmtMoney(b.costAtConsumption)) : '<span class="muted" title="No price on record when this was consumed">—</span>')
          : (esc(b.estCost) || (bomLineCost(b) != null ? esc(fmtMoney(bomLineCost(b))) : '<span class="muted">—</span>'))}</td>
        <td class="no-print">${b.lineId && !b.consumed
          ? `<button class="sm" onclick="openConsumeLine('${esc(b.lineId)}')">Consume</button>`
          : woBomPushBtn(wo, b)}</td>
      </tr>`).join("")}
    </tbody></table>`}
    </details>`;
}

/* "planned $41.20 · used $38.75" beside the BOM count — the plan-vs-actual
   read in one glance, each half honest about coverage via bomRollup rules. */
function woBomMoneyLine(wo) {
  const bom = wo.bom || [];
  if (!bom.length) return "";
  const plan = bomRollup(bom);
  const used = bom.reduce((s, l) => s + (typeof l.costAtConsumption === "number" ? l.costAtConsumption : 0), 0);
  const consumed = bom.filter(l => l.consumed).length;
  const bits = [];
  if (plan.priced) bits.push(`planned ≈ ${fmtMoney(plan.total)}${plan.unpriced ? ` (+${plan.unpriced} unpriced)` : ""}`);
  if (consumed) bits.push(`used ${fmtMoney(Math.round(used * 100) / 100) || "$?"}${consumed < bom.length ? ` (${consumed}/${bom.length} logged)` : ""}`);
  return bits.length ? ` <span class="tny muted nocaps">· ${esc(bits.join(" · "))}</span>` : "";
}

/* ▲ over plan, ▼ under, = on the nose — only when both sides parse. */
function woBomDelta(b) {
  const plan = parseLooseMoney(b.qty), used = parseLooseMoney(b.usedQty);
  if (plan == null || used == null) return "";
  if (used > plan) return ' <span title="more than planned">▲</span>';
  if (used < plan) return ' <span title="less than planned">▼</span>';
  return ' <span class="muted" title="exactly as planned">=</span>';
}

/* The push-back button renders only when it can actually land: consumed line,
   a resolvable part, a matching plan line, and a real difference to push. */
function woBomPushBtn(wo, b) {
  if (!b.consumed || !b.lineId) return "";
  const p = woDetailPart(wo);
  const pl = p && (p.bom || []).find(x => x.lineId === b.lineId);
  if (!pl || String(pl.qty) === String(b.usedQty || "")) return "";
  return `<button class="sm" title="Update the plan on ${esc(p.id)} to what this run actually used" onclick="pushBomToPlan('${esc(b.lineId)}')">↩ plan</button>`;
}

function woSecSteps(wo, E) {
  return `
    <div class="tny muted no-print">The gold node is the step to act on now. An amber-ringed node is a blocker: no sign-off, no moving on. A slate node waits on the clock.</div>
    ${(() => {
      // The first not-done, not-failed step is the one to act on right now —
      // computed from existing state (open/done/failed), not a new status
      // value: a real "in progress" status would ripple into printing,
      // CS-013, and the retro-WO convention, well beyond a styling pass.
      // Retro records are historical, nothing on them is "next".
      const nextIdx = wo.retro ? -1 : (wo.steps || []).findIndex(s => stepState(s) !== "done" && stepState(s) !== "failed");
      /* Which rows land inside a done-group (a run of ≥4 consecutive signed
         steps, view mode only). Decided BEFORE rendering: a row inside a
         group keeps its metas inline instead of its own step-more fold — a
         fold inside a fold is two taps to the same history, and content
         behind a hidden summary is exactly what the detailui orphan audit
         exists to catch. */
      const groupable = (wo.steps || []).map((s, i) => !view.edit && stepState(s) === "done" && i !== nextIdx);
      const inGroup = groupable.map(() => false);
      for (let i = 0; i < groupable.length;) {
        if (!groupable[i]) { i++; continue; }
        let j = i; while (j < groupable.length && groupable[j]) j++;
        if (j - i >= 4) for (let k = i; k < j; k++) inGroup[k] = true;
        i = j;
      }
      const rows = (wo.steps || []).map((s, i) => {
      const blocker = isBlocker(s);
      const state = stepState(s);
      const blocked = blockerOpenBefore(wo, i);
      const hold = holdState(wo, i);
      // Waiting on a clock reads like waiting on a signature, because to the
      // person standing there it is the same thing: this step is not yours yet.
      const held = !!hold && !hold.ready && !hold.overridden && state !== "done" && state !== "failed";
      const ev = stepEvidence(wo, i);
      const needsEv = state !== "done" && state !== "failed" && ev.missing.length;
      const isNow = i === nextIdx;
      /* Blocker and hold finally look different, because they are: a blocker
         is a person withholding a signature (amber, in-work-shaped), a hold
         is the clock (slate — the parked color — with a clock glyph). They
         used to share one amber wash. */
      // "future" drives the dashed spine below NOW — walked vs not walked yet.
      const future = state !== "done" && state !== "failed" && !isNow && nextIdx >= 0 && i > nextIdx;
      const rowCls = `step ${blocker ? "is-blocker" : ""} ${held ? "is-held" : ""} ${state === "done" ? "done" : ""} ${state === "failed" ? "failed" : ""} ${isNow ? "upnext" : ""} ${future ? "future" : ""}`;
      const titleLine = `<div class="step-title">${esc(stripCS(s.title))}
        ${isNow ? '<span class="step-badge now">now</span>' : ""}
        ${blocker ? '<span class="step-badge">blocker</span>' : ""}
        ${hold && state !== "done" ? ` <span class="step-badge hold">◷ hold ${hold.hours} h</span>` : ""}
        ${/frozen/i.test(s.title) ? `<button class="link no-print" onclick="woJump('wo-stack')">View stack</button>` : ""}</div>`;
      // What a signed row can tuck away: everything historical. Open rows
      // keep it all inline — that is what you act on.
      const metas = `
          ${s.trainingOverride ? `<div class="meta">Signed without ${esc(trainingById(s.trainingOverride.training).name)} training by ${esc(s.trainingOverride.by)}. <button class="link no-print" onclick="woJump('wo-eventlog')">See the event log</button></div>` : ""}
          ${s.evidenceOverride ? `<div class="meta">Signed without ${esc(evidenceLabels(s.evidenceOverride.missing || []).join(" and "))} by ${esc(s.evidenceOverride.by)}. <button class="link no-print" onclick="woJump('wo-eventlog')">See the event log</button></div>` : ""}
          ${hold && hold.overridden ? `<div class="meta">Hold overridden by ${esc(hold.override.by)}, ${esc(String(hold.override.hoursShort))} h short. <button class="link no-print" onclick="woJump('wo-eventlog')">See the event log</button></div>` : ""}
          ${startsHold(s) && s.cure ? `<div class="meta">${esc(cureSummary(s.cure))}</div>` : ""}
          ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ""}
          ${stepIssues(wo, s).map(t =>
            `<div class="meta">${t.resolutionMethod ? '<span class="ok">✓</span>' : '<span class="warn">⚑</span>'} ${chip("projects", t.id, t.title || t.id)}${t.resolutionMethod ? "" : ' <span class="warn tny">open</span>'}</div>`).join("")}
          ${stepThumbs(wo, i, s)}`;
      const issueCount = stepIssues(wo, s).length;
      const hasExtras = !!(s.trainingOverride || s.evidenceOverride || (hold && hold.overridden) ||
        (startsHold(s) && s.cure) || String(s.notes || "").trim() || (s.photoRefs || []).length || issueCount);
      /* A signed run of ten steps used to dominate the page. Done rows fold
         their history behind a one-line <details> summary saying what is in
         there — everything stays in the DOM, one tap away. Edit mode keeps
         it all inline: editing is when you need the note input on screen. */
      const foldDone = state === "done" && !E && hasExtras && !inGroup[i];
      const doneSummary = [
        (s.photoRefs || []).length ? `${(s.photoRefs || []).length} photo${(s.photoRefs || []).length > 1 ? "s" : ""}` : "",
        String(s.notes || "").trim() ? "note" : "",
        startsHold(s) && s.cure ? "cure record" : "",
        (s.trainingOverride || s.evidenceOverride || (hold && hold.overridden)) ? "override" : "",
        issueCount ? `${issueCount} issue${issueCount > 1 ? "s" : ""}` : "",
      ].filter(Boolean).join(" · ");
      // The node states the row: ✓ walked, ✗ failed, ◷ parked on the clock,
      // otherwise the step number. The seq stays in the title attribute so
      // "which step is this" is never lost.
      const glyph = state === "done" ? "✓" : state === "failed" ? "✗" : held ? "◷" : s.seq;
      const html = `<div class="${rowCls}">
        <div class="num" title="step ${s.seq}">${glyph}</div>
        <div class="body">
          ${titleLine}
          ${/* Said on the row, not only in the modal you get after pressing a
                disabled button — the point is to know what to go and do BEFORE
                you walk over to sign. One line, no citation, same register as
                the hold banner. */""}
          ${needsEv ? `<p class="gate"><span class="gi">⚠</span><span>Needs ${esc(evidenceLabels(ev.missing).join(" and "))} before it can be signed.</span></p>` : ""}
          ${(() => { /* Personal, not a record truth like the evidence line: said
                quietly on the row so you know before you walk over to sign,
                never as a disabled button. */
            const tr = stepTraining(s);
            /* A guest holds no trainings, so without the guard this prints on
               every gated step in the app — reading as a fact about the step
               rather than about who is looking at it. The banner at the top of
               the page has already said why nothing here can be signed. */
            if (window.fb && fb.guest) return "";
            return tr && state !== "done" && state !== "failed" && !wo.retro && !s.trainingOverride && !hasTraining(myEmail(), tr)
              ? `<div class="meta no-print">Needs ${esc(trainingById(tr).name)} training to sign.</div>` : ""; })()}
          ${held ? holdBanner(hold, i) : ""}
          ${foldDone
            ? `<details class="step-more"><summary class="step-disclose">${esc(doneSummary)}</summary>${metas}</details>`
            : metas}
          <!-- Deliberately still a one-line control at rest. This is filled in
               at the bench, on a phone, with gloves on; a bubble menu and a
               slash menu there would be worse than what was here. The button
               beside it opens the full composer in a modal for the case the
               placeholder used to describe — its old text was literally
               "notes / photo filenames", i.e. the workaround for attaching a
               photo was to TYPE THE FILENAME. -->
          ${E ? `<div class="meta no-print stepnote"><input placeholder="notes" value="${esc(s.notes)}" onchange="us(${i},'notes',this.value)">
            <button class="ib sm" title="Write a longer note, with photos" aria-label="Write a longer note for step ${s.seq}" onclick="openStepNote('${wo.id}',${i})">${icon("image", 14)}</button></div>` : ""}
        </div>
        <div class="buyoff">
          ${state === "failed"
            ? `<span class="warn">✗ ${esc(s.status)}</span>`
            : state === "done"
              ? (isSigned(s)
                ? `<span class="ok">✔ ${avatar(s.buyoff.email || s.buyoff.name, 18)} ${esc(s.buyoff.name)} ${esc(s.buyoff.date || "")}</span>`
                : `<span class="muted">done, buy-off not recorded (retro)</span>`)
              : (wo.retro ? `<span class="muted">${esc(s.status || "open")}</span>`
                : held && !isLead()
                  ? `<button disabled title="curing — ${esc(fmtLeft(hold.msLeft))}">buy off as ${esc(signerName())}</button>`
                  : /* Not disabled when evidence is missing: pressing it is how
                       you find out WHAT is missing and get the button that
                       fixes it. A dead grey button with a tooltip nobody on a
                       phone can hover is the version of this that fails. The
                       up-next row's button is the section's one primary. */
                    `<button ${isNow ? 'class="primary"' : ""}${gx("Sign in to sign off on a step — a buy-off carries your name.")} onclick="buyoff(${i})" ${blocked ? "disabled title='blocked by unfinished blocker: " + esc(blocked.title) + "'" : ""}>buy off as ${esc(signerName())}</button>`)}
          ${stepActions(wo, i, s)}
        </div>
      </div>`;
      return { html, grouped: inGroup[i], photos: (s.photoRefs || []).length, seq: s.seq };
      });
      /* A signed run reads as one line, not ten: four or more consecutive done
         rows compress into a <details> group whose summary carries the count
         and the photo tally. The rows inside are the full markup — nothing
         leaves the DOM, one tap opens the whole run. Edit mode never groups
         (inGroup is all-false then): editing is when the note inputs must be
         on screen. The spine stays solid through the group. */
      const out = [];
      for (let i = 0; i < rows.length;) {
        if (!rows[i].grouped) { out.push(rows[i].html); i++; continue; }
        let j = i; while (j < rows.length && rows[j].grouped) j++;
        const run = rows.slice(i, j);
        const ph = run.reduce((a, r) => a + r.photos, 0);
        out.push(`<details class="step-group"><summary class="step-disclose"><span class="num done">✓</span>Steps ${run[0].seq}–${run[run.length - 1].seq} · ${run.length} done${ph ? ` · ${ph} photo${ph > 1 ? "s" : ""}` : ""}</summary>${run.map(r => r.html).join("")}</details>`);
        i = j;
      }
      return `<div class="steps">${out.join("")}</div>`;
    })()}`;
}

/* ---------- an issue's own photos, on the work order ----------
   The same 48px strip a step gets, for the same reason: an issue IS bench
   evidence, and the person who can photograph the defect is standing at the
   run, not at the issue's own page. `.step-photos:empty { display: none }`
   means an issue with no photos costs nothing.

   These render inside data-lbgroup="workOrders:<id>" (renderWODetail), so the
   thumbs join the run's lightbox set and the arrows walk defect photos and
   step photos as one roll. */
function issueThumbs(p) {
  const imgs = (p.files || []).filter(f => (f.type || "").startsWith("image/"));
  const shown = imgs.slice(0, 5);
  return `<div class="step-photos">
    ${shown.map(f => {
      const name = f.name || "photo";
      return `<img class="phmini" loading="lazy" src="${esc(f.url)}" data-lb-src="${esc(f.url)}" data-lb-name="${esc(name)}" alt="${esc(name)}">`;
    }).join("")}
    ${imgs.length > 5 ? `<button class="link no-print" onclick="openRecord('projects','${esc(p.id)}')">+${imgs.length - 5} more</button>` : ""}
  </div>`;
}
/* Straight to the generic record-file picker: it writes entries byte-identical
   to the ones submitWOIssue creates, and storage.rules already allows
   projects/<id>/<file> for image/*, so no rules deploy rides on this. */
function addIssuePhotos(pid) { addRecordFiles("projects", pid, null, "image/*"); }

/* ---------- the Issues rows' unsaved text ----------
   The disposition select and the "what happened" textarea are uncontrolled DOM
   inputs, read only when Resolve is pressed. This tab re-renders on every
   Firestore snapshot — a teammate's save, or your own photo upload, since
   addRecordFiles ends in render() — and each of those took a half-typed root
   cause with it.

   Write-through rather than the closeout modal's harvest-before-render
   (coDrafts): there, one function owns the moment the modal is rebuilt, so it
   can grab the drafts on the way past. Here the render can come from anywhere,
   including another person's browser, so there is no such moment. */
var WI_DRAFTS = {};
function wiDraft(pid, k, v) { (WI_DRAFTS[pid] = WI_DRAFTS[pid] || {})[k] = v; }
function wiClearDraft(pid) { delete WI_DRAFTS[pid]; }

/* ---------- the Issues section ----------
   Everything an issue needs while you are standing at the work order: what is
   open, what it was disposed as, and a way to raise the next one. It is a flat
   list on purpose — sub-tickets were a project-planning device and issues are
   not projects, so a parentId is shown as a read-only "part of" line and never
   as nesting.

   Resolving here goes through resolveIssue(), the SAME choke point the ticket
   page and the closeout modal use: statusGate() validates, Slack announces
   once. A second gate implementation is the bug this section must not become.

   Rows reuse .corow from the closeout modal — same shape, same problem, and
   two stylings of one row is how they drift apart. */
function woSecIssues(wo, E) {
  const all = issuesForWO(wo.id).slice().sort((a, b) => {
    const ad = projStatus(a) === "Done" || projStatus(a) === "Cancelled";
    const bd = projStatus(b) === "Done" || projStatus(b) === "Cancelled";
    if (ad !== bd) return ad ? 1 : -1;          // open first
    return String(a.id).localeCompare(String(b.id));
  });
  const rows = all.map(p => {
    const st = projStatus(p);
    const done = st === "Done" || st === "Cancelled";
    const parent = p.parentId ? parentOf(p) : null;
    const stepLine = p.stepRef
      ? ` · <button class="link" onclick="woJump('wo-steps')" title="Go to the step this was filed from">step ${esc(String(p.stepRef.seq))}${p.stepRef.title ? " · " + esc(p.stepRef.title) : ""}</button>`
      : "";
    const nOther = (p.files || []).filter(f => !(f.type || "").startsWith("image/")).length;
    const meta = `<span class="muted tny">${esc(st)}${p.updatedAt ? " · updated " + esc(fmtWhen(p.updatedAt)) : ""}${nOther ? ` · ${nOther} file${nOther > 1 ? "s" : ""}` : ""}</span>${stepLine}`;
    /* A parentId can only come from before issues went flat. Read-only, so the
       context is not lost, and no nesting UI grows back around it. */
    const pLine = parent
      ? `<div class="muted tny">part of ${chip("projects", parent.id, parent.title || parent.id)}</div>` : "";

    if (done) {
      return `<div class="corow codone"><div><span class="ok">✓</span> ${chip("projects", p.id, p.id)} <b>${esc(p.title || "")}</b>
        <span class="muted tny">— ${st === "Cancelled" ? "cancelled (false alarm)" : "resolved: " + esc(p.resolutionMethod || "?")}</span></div>
        ${pLine}
        ${issueThumbs(p)}
        ${st === "Done" && !E ? `<div><button class="link no-print" onclick="reopenIssue('${esc(p.id)}')">Reopen</button></div>` : ""}</div>`;
    }
    const d = WI_DRAFTS[p.id] || {};
    const method = d.method !== undefined ? d.method : (p.resolutionMethod || "");
    const what = d.what !== undefined ? d.what : (p.whatHappened || "");
    const camera = `<button class="ib sm no-print" title="Add photos to this issue" aria-label="Add photos to ${esc(p.id)}" onclick="addIssuePhotos('${esc(p.id)}')">${icon("image", 14)}</button>`;
    return `<div class="corow">
      <div>${chip("projects", p.id, p.id)} <b>${esc(p.title || "")}</b> ${meta}</div>
      ${pLine}
      ${issueThumbs(p)}
      ${E ? `<div class="muted tny">Leave edit mode to dispose this issue.</div>
      <div class="no-print">${camera}</div>` : `
      <div class="field"><label for="wi-m-${esc(p.id)}">Disposition</label>
        <select id="wi-m-${esc(p.id)}" onchange="wiDraft('${esc(p.id)}','method',this.value)">
          <option value="" ${method ? "" : "selected"}>— not yet disposed —</option>
          ${RESOLUTION_METHODS.map(m => `<option ${method === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></div>
      <div class="field"><label for="wi-w-${esc(p.id)}">What happened</label>
        <textarea id="wi-w-${esc(p.id)}" oninput="wiDraft('${esc(p.id)}','what',this.value)" placeholder="Root cause — required before this work order can close">${esc(what)}</textarea></div>
      <div class="no-print"><button onclick="woResolveIssue('${esc(p.id)}')">Resolve</button>${camera}</div>`}
    </div>`;
  }).join("");

  const n = undisposedIssuesForWO(wo.id).length;
  return `
    ${all.length ? "" : `<p class="muted">No issues on this run.</p>`}
    ${rows}
    ${n ? `<p class="gate blocked"><span class="gi">✕</span><span>${n} issue${n > 1 ? "s" : ""} still ${n > 1 ? "need" : "needs"} a disposition before ${esc(wo.id)} can complete.</span></p>` : ""}
    <div class="no-print"><button onclick="openWOIssue('${esc(wo.id)}')">⚠ Raise an issue</button></div>`;
}

/* Read the row, hand it to the one gate, and render whatever it refuses with.
   resolveIssue returns the refusal string verbatim — the caller never composes
   its own wording, or the two would drift. */
function woResolveIssue(pid) {
  const m = document.getElementById("wi-m-" + pid);
  const w = document.getElementById("wi-w-" + pid);
  const r = resolveIssue(pid, m ? m.value : undefined, w ? w.value : undefined);
  if (r) { toast(r, "error"); return; }
  // Saved, so the draft has done its job. Leaving it would shadow the record.
  wiClearDraft(pid);
}

/* ---------- raising an issue from the work order ----------
   The same reasoning as openStepIssue: purpose-built, NOT the tickets modal.
   That form fronts five fields nobody reporting a defect cares about and
   navigates away on submit. The difference here is only that no step is
   implied — this is a problem with the run, not with one operation in it. */
function openWOIssue(woId) {
  const w = woById(woId); if (!w) return;
  openModal(`
    <h2>Raise an issue — ${esc(w.id)}${w.partName ? " · " + esc(w.partName) : ""}</h2>
    <div class="field"><label for="wi-title">Title</label><input id="wi-title" placeholder="What is wrong, in a few words"></div>
    <div class="field"><label for="wi-what">What happened</label>
      <textarea id="wi-what" placeholder="What went wrong, and why. (needed before this can close)"></textarea></div>
    <div class="row2">
      ${/* No capture attribute, for the same reason as the step picker: on iOS
            it forces the camera and locks out the library, and the photo you
            want is usually the one you already took. */""}
      <div class="field"><label for="wi-photos">Photos</label><input id="wi-photos" type="file" accept="image/*" multiple></div>
      <div class="field"><label for="wi-priority">Priority</label><select id="wi-priority">${PRIORITY.map(pr => `<option ${pr === "Medium" ? "selected" : ""}>${pr}</option>`).join("")}</select></div>
    </div>
    <p class="muted tny">Assigned to you and linked to ${esc(w.id)} — it holds this work order's completion until it is disposed.</p>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitWOIssue('${esc(woId)}')">File issue</button></div>
  `);
  setTimeout(() => { const el = document.getElementById("wi-title"); if (el && el.focus) el.focus(); }, 0);
}
async function submitWOIssue(woId) {
  const w = woById(woId); if (!w) return;
  // Read the WHOLE form before any await: allocId's offline fallback opens a
  // confirm modal that replaces this markup (the submitNewProject footgun).
  const title = ((document.getElementById("wi-title") || {}).value || "").trim();
  const what = ((document.getElementById("wi-what") || {}).value || "");
  const priority = ((document.getElementById("wi-priority") || {}).value || "Medium");
  const filesEl = document.getElementById("wi-photos");
  const files = filesEl && filesEl.files ? Array.from(filesEl.files) : [];
  if (!title) { toast("Give the issue a title.", "error"); return; }
  const id = await allocId("projects");
  if (!id) return;
  const p = {
    id, title, kind: "issue",
    status: "To Do", priority, dueDate: "", subteam: w.subteam || "",
    description: "", assignees: [myEmail()], watchers: [myEmail()],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [],
    files: [], comments: [],
    createdBy: myEmail(), retro: false,
    workOrderId: w.id, resolutionMethod: "", whatHappened: what,
  };
  DB.projects.push(p); saveProj(p);
  // Photos upload after the doc exists; a failed photo is its own toast, never
  // a lost issue. Same entry shape as addRecordFiles.
  let uploaded = 0;
  for (const f of files) {
    try {
      const up = await fb.upload(`projects/${id}/${Date.now()}-${f.name}`, f);
      p.files = (p.files || []).concat([{ id: "F" + Date.now() + Math.random().toString(36).slice(2, 5),
        name: up.name, url: up.url, type: up.type, size: up.size, by: myEmail(), ts: new Date().toISOString(), path: up.path }]);
      uploaded++;
    } catch (e) { toast(`Photo ${f.name} didn't upload: ` + e.message, "error"); }
  }
  if (uploaded) saveProj(p, "files");
  postToSlack(slackIssueCreatedMsg(p));
  closeModal();
  toast(`${id} filed on ${w.id}${uploaded ? ` with ${uploaded} photo${uploaded > 1 ? "s" : ""}` : ""}. It holds this run until it is disposed.`);
  render(); // stay on the WO
}

function woSecQuality(wo, E) {
  // Issues moved out to their own section (wo-issues). Quality means the
  // acceptance table again, and its warn dot means a check FAILED.
  return `
    <h3>Quality checks / acceptance criteria</h3>
    <table class="sub"><thead><tr><th>Criterion</th><th>Target (set at creation!)</th><th>Actual</th><th>Pass</th></tr></thead><tbody>
      ${(wo.qualityChecks || []).map((q, i) => E
        ? `<tr><td><input value="${esc(q.criterion)}" onchange="uq(${i},'criterion',this.value)"></td><td><input value="${esc(q.target)}" onchange="uq(${i},'target',this.value)"></td><td><input value="${esc(q.actual)}" onchange="uq(${i},'actual',this.value)"></td><td><select onchange="uq(${i},'pass',this.value==='true'?true:this.value==='false'?false:null)"><option ${q.pass == null ? "selected" : ""}>—</option><option value="true" ${q.pass === true ? "selected" : ""}>pass</option><option value="false" ${q.pass === false ? "selected" : ""}>FAIL</option></select></td></tr>`
        : `<tr><td>${esc(q.criterion)}</td><td>${esc(q.target)}</td><td>${esc(q.actual)}</td><td>${q.pass === true ? '<span class="ok">pass</span>' : q.pass === false ? '<span class="warn">FAIL</span>' : "—"}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').qualityChecks.push({criterion:'',target:'',actual:'',pass:null});saveWO(woById('${wo.id}'),'qualityChecks');render()">+ check</button>` : ""}`;
}

/* The Photos section: every photo on the record, wherever it was written
   (step photoRefs, image files, note <img>s — woAllPhotos), grouped by step
   because that is the review question ("show me the bag before pull"). Tiles
   are real <img loading="lazy"> with data-lb-src, so the existing lightbox
   collects them and the arrows walk the whole record. Record-level adds go
   to wo.files through the same picker every record uses. */
function addWOPhotos(id) { addRecordFiles("workOrders", id, null, "image/*"); }
function phTile(p, wo, E) {
  const label = p.caption || p.name;
  const tip = [p.name, p.by ? "by " + userName(p.by) : "", p.ts ? String(p.ts).slice(0, 10) : ""].filter(Boolean).join(" · ");
  return `<figure class="phtile">
    <img class="phimg" loading="lazy" src="${esc(p.url)}" data-lb-src="${esc(p.url)}" data-lb-name="${esc(p.name)}" alt="${esc(label)}" title="${esc(tip)}">
    ${E && p.source === "step" && p.id
      ? `<input class="phcap" placeholder="caption" value="${esc(p.caption || "")}" onchange="setStepPhotoCaption('${esc(wo.id)}',${p.stepIndex},'${esc(p.id)}',this.value)">`
      : `<figcaption class="tny muted">${esc(label)}</figcaption>`}
  </figure>`;
}
function woSecPhotos(wo, E) {
  const all = woAllPhotos(wo).map(p => {
    // phTile edits captions by photoRefs id; carry it through the aggregate.
    if (p.source === "step" && p.stepIndex != null) {
      const ref = ((wo.steps[p.stepIndex] || {}).photoRefs || []).find(r => r && r.url === p.url);
      if (ref && ref.id) p.id = ref.id;
    }
    return p;
  });
  if (!all.length) {
    return `<p class="muted">Photos are the record — what did the bag look like before pull? Nobody remembers in March.</p>
      <div class="no-print addrow"><button class="primary" onclick="addWOPhotos('${wo.id}')">+ Add photos</button></div>`;
  }
  const bySteps = new Map();
  for (const p of all) {
    const k = p.stepIndex != null ? p.stepIndex : -1;
    if (!bySteps.has(k)) bySteps.set(k, []);
    bySteps.get(k).push(p);
  }
  const groups = [...bySteps.keys()].sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b));
  return `
    ${groups.map(k => `
      <div class="tny muted phgrp">${k === -1 ? "General" : `Step ${k + 1} · ${esc(bySteps.get(k)[0].stepTitle || "")}`}</div>
      <div class="photogrid">${bySteps.get(k).map(p => phTile(p, wo, E)).join("")}</div>`).join("")}
    <div class="no-print addrow"><button onclick="addWOPhotos('${wo.id}')">+ Add photos</button></div>`;
}
/* The per-step photos live where the work happened, split in two since the
   controls moved right (Simon: all controls to the right of the bar): the
   THUMBS stay under the step body, the buttons live in the right cluster.
   View mode and edit mode both get the camera — the bench is not in edit
   mode, and a photo is documentation, not editing. The data-photo-slot
   attribute stays on the thumbs div: addStepPhotos parks its "uploading…"
   ghost there. */
function stepThumbs(wo, i, s) {
  const refs = s.photoRefs || [];
  const shown = refs.slice(0, 5);
  return `<div class="step-photos" data-photo-slot="step" data-wo="${esc(wo.id)}" data-step="${i}">
    ${shown.map(p => {
      const url = typeof p === "string" ? p : p.url;
      const name = typeof p === "string" ? p : (p.caption || p.name || "photo");
      return url ? `<img class="phmini" loading="lazy" src="${esc(url)}" data-lb-src="${esc(url)}" data-lb-name="${esc(name)}" alt="${esc(name)}">` : "";
    }).join("")}
    ${refs.length > 5 ? `<button class="sm no-print" onclick="woJump('wo-photos')">+${refs.length - 5} more</button>` : ""}
  </div>`;
}
/* The camera and the quick-capture flag, quiet siblings of the buy-off in
   the right cluster — bench utilities, never competing with the one primary. */
function stepActions(wo, i, s) {
  return `<button class="ib sm no-print" title="Add photos to this step" aria-label="Add photos to step ${s.seq}" onclick="addStepPhotos('${esc(wo.id)}',${i})">${icon("image", 14)}</button>
    <button class="ib sm no-print" title="Report an issue on this step" aria-label="Report an issue on step ${s.seq}" onclick="openStepIssue('${esc(wo.id)}',${i})">⚑</button>`;
}

/* Documents and Files are one section because EVIDENCE.file.has() accepts
   either — split across two tabs, the design-review gate would look
   unsatisfiable from whichever one you happened to be looking at. */
function woSecFiles(wo, E) {
  return `
    <!-- The mold drawing, the CAM notes, the DRB deck: the documents that
         explain this job. They used to be a Slack paste, which meant they were
         findable for a day (PP-09). -->
    <h3>Documents</h3>
    ${docLinkList(wo.docs, { onRemove: `rmWoDoc`, empty: "No documents linked yet.", addLabel: "+ Link a document" })}
    <div class="no-print addrow"><button onclick="openDocLinkModal({ coll: 'workOrders', id: '${wo.id}' })">+ Link a document</button></div>
    <!-- Files: a work order could link a Google Doc but not hold a file, so the
         mold CAD lived wherever somebody last pasted it. The design review
         buy-off now wants it here (or linked above — either satisfies the
         check; the CAD really does live in Drive). -->
    <h3 id="wo-files">Files</h3>
    ${(() => {
      // A record with a season of files shouldn't scroll forever: cap the
      // grid at eight and put the rest behind a real button (a button, not a
      // details — the tickets attachment cap set that precedent).
      const files = wo.files || [];
      const capped = files.length > 8 && !view.woFilesAll;
      const shown = capped ? files.slice(0, 8) : files;
      return `<div class="filegrid">
        ${shown.map(fileItem).join("") || '<span class="muted">No files yet.</span>'}
      </div>
      ${capped ? `<div class="no-print addrow"><button class="sm" onclick="view.woFilesAll=true;render()">Show all ${files.length}</button></div>` : ""}`;
    })()}
    <div class="no-print addrow"><button onclick="addRecordFiles('workOrders','${wo.id}')">+ Add files</button></div>`;
}

function woSecNotes(wo, E) {
  const tl = wo.timeline || [];
  const lastEv = tl.length ? tl[tl.length - 1].date : "";
  return `
    ${/* Append-only audit that grows unbounded on real records; the step
          metas that cite it link straight here, and woJump opens the fold.
          Edit mode opens it too — that is when events get corrected. */""}
    <details class="wo-subfold" ${E ? "open" : ""}>
    <summary id="wo-eventlog" class="wo-subhd">Event log${tl.length ? ` <span class="wosec-n">${tl.length}</span>${lastEv ? ` <span class="tny muted nocaps">last ${esc(lastEv)}</span>` : ""}` : ' <span class="tny muted nocaps">empty</span>'}</summary>
    <table class="sub"><thead><tr><th class="w110">Date</th><th>Event</th></tr></thead><tbody>
      ${tl.map((t, i) => E
        ? `<tr><td><input value="${esc(t.date)}" onchange="ut(${i},'date',this.value)"></td><td><input value="${esc(t.note)}" onchange="ut(${i},'note',this.value)"></td></tr>`
        : `<tr><td>${esc(t.date)}</td><td>${esc(t.note)}</td></tr>`).join("")}
    </tbody></table>
    ${E ? `<button onclick="woById('${wo.id}').timeline.push({date:'',note:''});saveWO(woById('${wo.id}'),'timeline');render()">+ event</button>` : ""}
    </details>
    <!-- The old free-text notes blob had no author and no timestamp, and any
         edit silently replaced whatever was there. It stays, authoritative and
         editable, because it is what somebody typed; the log beside it is
         append-only and signed, so "who decided this and when" has an answer. -->
    <h3>Notes</h3>
    ${/* Click the text to write. `notes` stays a plain string because print.js
          prints it onto the paper traveler; the markup lives beside it in
          notesHtml. See richField(). */""}
    ${richField("workOrders", wo.id, "notes", {
      plain: true, label: "Notes",
      empty: "Anything about this job that isn't a step.",
      upload: name => `projects/${wo.id}/${Date.now()}-${name}`,
    })}
    `;
}

/* The note thread gets its own card, after the section cards — the tickets
   argument applies verbatim: inside one big card a comment reads as a
   paragraph in a form; framed like the ticket itself it reads as the
   document it is meant to be. Order unchanged (oldest first, composer
   after), only the frame moved. */
function woThreadCard(wo) {
  return `<div class="card thread-card">
    ${threadHtml("workOrders", wo.id, (wo.noteLog || []), { noun: "Note", empty: "No notes yet. Anything worth telling the next person goes here." })}
    ${(() => {
      rteSetUpload(name => `projects/${wo.id}/${Date.now()}-${name}`);
      const draft = loadDraft("wonote", wo.id);
      return composerHtml({
        targetId: "wo-note",
        html: sanitizeHtml(draft),
        placeholder: "Add a note — what happened, what you measured, a photo…",
        oninput: `draftInput('wonote','${wo.id}',this)`,
        onpost: `postWoNote('${wo.id}')`,
        oncancel: `closeComposer('wo-note')`,
        postLabel: "Add note as " + signerName(),
      });
    })()}
  </div>`;
}

/* field update helpers (operate on current WO; each saves only its field) */
function updWO(key, val) {
  const w = woById(view.id);
  // The CS-003 enforcement point at the Work Order level: intercepting this
  // generic field-write is the actual hook (there's no dedicated "Mark
  // Complete" button — status is just one editable field, same shape as the
  // existing step-blocker check below).
  if (key === "status" && val === "Complete") {
    const undisposed = undisposedIssuesForWO(w.id);
    if (undisposed.length) {
      // Toast first (the harness stub DOM meets the modal second), then the
      // closeout modal instead of a dead end: the tickets get disposed HERE.
      toast(`Can't complete this work order — ${undisposed.length} linked issue${undisposed.length > 1 ? "s" : ""} (${undisposed.map(i => i.id).join(", ")}) ${undisposed.length > 1 ? "aren't" : "isn't"} disposed yet.`, "error");
      openWOCloseoutModal(w.id);
      render(); return;
    }
  }
  w[key] = val; saveWO(w, key);
}

/* ---------- the closeout modal ----------
   Setting a WO Complete over open issues used to be a refusal toast and a
   tour: open each ticket, enter Edit, set the disposition, save, set status,
   come back. Now the refusal opens this modal — one row per undisposed
   issue, disposition + narrative inline, resolved through the SAME
   resolveIssue() choke point the ticket page uses (statusGate validates,
   Slack announces once per issue). Every per-row Resolve commits
   immediately, so Cancel loses nothing and a browser crash mid-modal loses
   nothing; the WO completes only when undisposedIssuesForWO is empty, the
   same single gate as always. */
var CLOSEOUT = null;
// Harvest half-typed narratives BEFORE any re-render: with three rows on
// screen, resolving one must not wipe the text in the other two.
function coDrafts() {
  const drafts = {};
  for (const id of (CLOSEOUT && CLOSEOUT.openIds) || []) {
    const m = document.getElementById("co-m-" + id);
    const t = document.getElementById("co-w-" + id);
    if (m || t) drafts[id] = { method: m ? m.value : undefined, what: t ? t.value : undefined };
  }
  return drafts;
}
function openWOCloseoutModal(woId, drafts, gates) {
  const w = woById(woId); if (!w) return;
  if (!CLOSEOUT || CLOSEOUT.woId !== woId) CLOSEOUT = { woId, resolved: [] };
  const open = undisposedIssuesForWO(woId);
  CLOSEOUT.openIds = open.map(p => p.id);
  drafts = drafts || {}; gates = gates || {};
  const doneRows = CLOSEOUT.resolved.map(id => {
    const p = projById(id) || {};
    return `<div class="corow codone"><span class="ok">✓</span> ${esc(id)} ${esc(p.title || "")} — resolved: ${esc(p.resolutionMethod || "?")}</div>`;
  }).join("");
  const rows = open.map(p => {
    const d = drafts[p.id] || {};
    const method = d.method !== undefined ? d.method : (p.resolutionMethod || "");
    const what = d.what !== undefined ? d.what : (p.whatHappened || "");
    const stepLine = p.stepRef ? ` · on step ${esc(String(p.stepRef.seq))} · ${esc(p.stepRef.title || "")}` : "";
    const nFiles = (p.files || []).length;
    return `<div class="corow">
      <div>${chip("projects", p.id, p.id)} <b>${esc(p.title || "")}</b>
        <span class="muted tny">${p.updatedAt ? "updated " + esc(fmtWhen(p.updatedAt)) : ""}${stepLine}${nFiles ? ` · ${nFiles} file${nFiles > 1 ? "s" : ""}` : ""}</span></div>
      <div class="field"><label>Disposition</label>
        <select id="co-m-${esc(p.id)}">
          <option value="" ${method ? "" : "selected"}>— not yet disposed —</option>
          ${RESOLUTION_METHODS.map(m => `<option ${method === m ? "selected" : ""}>${m}</option>`).join("")}
        </select></div>
      <div class="field"><label>What happened</label>
        <textarea id="co-w-${esc(p.id)}" placeholder="Root cause — required before this can close">${esc(what)}</textarea></div>
      ${gates[p.id] ? `<div class="gate"><span class="gi">⚠</span><div>${esc(gates[p.id])}</div></div>` : ""}
      <div><button onclick="coResolve('${esc(woId)}','${esc(p.id)}')">Resolve</button>
        <button class="link" onclick="coCancelTicket('${esc(woId)}','${esc(p.id)}')">Cancel ticket (false alarm)</button></div>
    </div>`;
  }).join("");
  openModal(`
    <h2>Close out ${esc(woId)} — ${open.length} open issue${open.length > 1 ? "s" : ""} need${open.length > 1 ? "" : "s"} a disposition</h2>
    <p class="muted tny">Each issue needs a resolution method and a documented "what happened" before this work order can complete. Every Resolve saves immediately.</p>
    ${doneRows}${rows}
    <div class="foot">
      <button onclick="CLOSEOUT=null;closeModal();render()">Not now</button>
      <button class="primary" onclick="coResolveAll('${esc(woId)}')">Resolve all &amp; complete work order</button>
    </div>
  `);
}
function coResolve(woId, pid) {
  const drafts = coDrafts();
  const d = drafts[pid] || {};
  const r = resolveIssue(pid, d.method || "", d.what);
  if (r) { openWOCloseoutModal(woId, drafts, { [pid]: r }); return; }
  CLOSEOUT = CLOSEOUT || { woId, resolved: [] };
  CLOSEOUT.resolved.push(pid);
  delete drafts[pid];
  if (undisposedIssuesForWO(woId).length) openWOCloseoutModal(woId, drafts);
  else coComplete(woId);
}
// Top to bottom, stopping at the first gate failure with that row's words on
// it — never a second gate implementation, just resolveIssue in a loop.
function coResolveAll(woId) {
  const drafts = coDrafts();
  for (const pid of ((CLOSEOUT && CLOSEOUT.openIds) || []).slice()) {
    const d = drafts[pid] || {};
    const r = resolveIssue(pid, d.method || "", d.what);
    if (r) { openWOCloseoutModal(woId, drafts, { [pid]: r }); return; }
    CLOSEOUT.resolved.push(pid);
    delete drafts[pid];
  }
  coComplete(woId);
}
/* Cancelled is the "not a real issue" escape hatch, deliberately NOT an
   option in the disposition select (statusGate exempts it — it is not a
   disposition). One unconfirmed click would retire a nonconformance record
   from inside a batch mood, so it confirms, the delProject register. */
function coCancelTicket(woId, pid) {
  const drafts = coDrafts();
  confirmModal(`Cancel ${pid} as not a real issue? It stops holding ${woId} and needs no disposition.`, () => {
    setTicketStatus(pid, "Cancelled");
    if (undisposedIssuesForWO(woId).length) openWOCloseoutModal(woId, drafts);
    else coComplete(woId);
  });
}
function coComplete(woId) {
  const w = woById(woId);
  // Paranoia in the right direction: completion re-checks the ONE gate
  // rather than trusting this modal's bookkeeping.
  if (!w || undisposedIssuesForWO(woId).length) { if (w) openWOCloseoutModal(woId); return; }
  const resolved = (CLOSEOUT && CLOSEOUT.resolved || []).slice();
  CLOSEOUT = null;
  w.status = "Complete"; saveWO(w, "status");
  render();
  openModal(`
    <h2>✓ ${esc(woId)} complete</h2>
    <p>${resolved.length
      ? `${resolved.length} issue${resolved.length > 1 ? "s" : ""} resolved: ${resolved.map(id => { const p = projById(id) || {}; return `${esc(id)} (${esc(p.resolutionMethod || "cancelled")})`; }).join(", ")}. Slack was told about each.`
      : "No open issues remained."}</p>
    <div class="foot"><button class="primary" onclick="closeModal()">Close</button></div>
  `);
}

/* ---------- quick capture from a step ----------
   Purpose-built, NOT the tickets modal: that form fronts five fields nobody
   reporting a defect cares about, its copy is test-pinned, and it navigates
   away on submit. Here the WO and step are already known, the title starts
   with the step name (cursor at the end, you append the defect), photos go in
   AT CREATION, everything else defaults invisibly — and you stay on the WO,
   because the bench user is mid-run. */
function openStepIssue(woId, i) {
  const w = woById(woId); if (!w) return;
  const s = (w.steps || [])[i]; if (!s) return;
  openModal(`
    <h2>Report an issue — ${esc(w.id)}, step ${s.seq} · ${esc(stripCS(s.title))}</h2>
    <div class="field"><label for="si-title">Title</label><input id="si-title" value="${esc(stripCS(s.title))}: "></div>
    <div class="field"><label for="si-what">What happened</label>
      <textarea id="si-what" placeholder="What went wrong, and why. (needed before this can close)"></textarea></div>
    <div class="row2">
      ${/* No capture attribute: on iOS it would force the camera and lock out
            the photo library, and the bag photo you want is usually the one
            you already took. Same reasoning as the step-photo picker. */""}
      <div class="field"><label for="si-photos">Photos of the defect</label><input id="si-photos" type="file" accept="image/*" multiple></div>
      <div class="field"><label for="si-priority">Priority</label><select id="si-priority">${PRIORITY.map(pr => `<option ${pr === "Medium" ? "selected" : ""}>${pr}</option>`).join("")}</select></div>
    </div>
    <p class="muted tny">Assigned to you, linked to ${esc(w.id)} — it lands on the Tickets board and holds this work order's completion until it's disposed.</p>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitStepIssue('${esc(woId)}',${i})">File issue</button></div>
  `);
  // Caret at the END of the prefill, so typing appends the defect.
  setTimeout(() => {
    const el = document.getElementById("si-title");
    if (el && el.focus) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); }
  }, 0);
}
async function submitStepIssue(woId, i) {
  const w = woById(woId); if (!w) return;
  const s = (w.steps || [])[i] || {};
  // Read the WHOLE form before any await: allocId's offline fallback opens a
  // confirm modal that replaces this markup (the submitNewProject footgun).
  const title = ((document.getElementById("si-title") || {}).value || "").trim();
  const what = ((document.getElementById("si-what") || {}).value || "");
  const priority = ((document.getElementById("si-priority") || {}).value || "Medium");
  const filesEl = document.getElementById("si-photos");
  const files = filesEl && filesEl.files ? Array.from(filesEl.files) : [];
  if (!title || title === stripCS(s.title) + ":") { toast("Describe the defect after the step name.", "error"); return; }
  const id = await allocId("projects");
  if (!id) return;
  const p = {
    id, title, kind: "issue",
    status: "To Do", priority, dueDate: "", subteam: w.subteam || "",
    description: "", assignees: [myEmail()], watchers: [myEmail()],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [],
    files: [], comments: [],
    createdBy: myEmail(), retro: false,
    workOrderId: w.id, resolutionMethod: "", whatHappened: what,
    stepRef: { seq: s.seq, index: i, title: stripCS(s.title) },
  };
  DB.projects.push(p); saveProj(p);
  // Photos upload after the doc exists; a failed photo is its own toast,
  // never a lost issue. Same entry shape as addRecordFiles.
  let uploaded = 0;
  for (const f of files) {
    try {
      const up = await fb.upload(`projects/${id}/${Date.now()}-${f.name}`, f);
      p.files = (p.files || []).concat([{ id: "F" + Date.now() + Math.random().toString(36).slice(2, 5),
        name: up.name, url: up.url, type: up.type, size: up.size, by: myEmail(), ts: new Date().toISOString(), path: up.path }]);
      uploaded++;
    } catch (e) { toast(`Photo ${f.name} didn't upload: ` + e.message, "error"); }
  }
  if (uploaded) saveProj(p, "files");
  postToSlack(slackIssueCreatedMsg(p));
  closeModal();
  toast(`${id} filed on step ${s.seq}${uploaded ? ` with ${uploaded} photo${uploaded > 1 ? "s" : ""}` : ""}. It's on the Tickets board.`);
  render(); // stay on the WO — the bench user is mid-run
}
function mf(wo, label, key) {
  const v = (wo.mold || {})[key] ?? "";
  return view.edit
    ? `<div class="f"><label>${label}</label><input value="${esc(v)}" onchange="woById(view.id).mold['${key}']=this.value;saveWO(woById(view.id),'mold')"></div>`
    : `<div class="f"><label>${label}</label><div class="ro">${esc(v) || "—"}</div></div>`;
}
function ub(i, k, v) { woById(view.id).bom[i][k] = v; saveWO(woById(view.id), "bom"); }
function uq(i, k, v) { woById(view.id).qualityChecks[i][k] = v; saveWO(woById(view.id), "qualityChecks"); render(); }
function ut(i, k, v) { woById(view.id).timeline[i][k] = v; saveWO(woById(view.id), "timeline"); }
function us(i, k, v) { const w = woById(view.id); w.steps[i][k] = v; saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], [k]: v }; return steps; }); }
/* ---------- the cure modals ----------
   Buying off the step that starts a cure asks what went in and when, because
   that is the one moment somebody is standing at the part with the answer. The
   time defaults to now and is editable: people write the traveller up after the
   fact, and a start time that lies makes the hold lie. */
function openCureModal(i) {
  const w = woById(view.id);
  const s = w.steps[i];
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  const prior = s.cure || {};
  openModal(`
    <h2>Buy off: ${esc(stripCS(s.title))}</h2>
    <p class="muted">What went in, and when it finished. This starts the cure hold on the next step.</p>
    <div class="field"><label for="cure-resin">Resin mixed</label>
      <select id="cure-resin" autofocus onchange="cureModalPreview()">
        ${RESINS.map(r => `<option value="${esc(r.id)}" ${prior.resin === r.id ? "selected" : ""}>${esc(r.label)} — ${esc(r.use)}</option>`).join("")}
        <option value="" ${prior.resin === "" ? "selected" : ""}>Something else / not recorded</option>
      </select>
    </div>
    <div class="field row2">
      <div><label for="cure-date">Finished on</label><input id="cure-date" type="date" value="${esc((prior.startedAt || "").slice(0, 10) || today())}" onchange="cureModalPreview()"></div>
      <div><label for="cure-time">at</label><input id="cure-time" type="time" value="${esc((prior.startedAt || "").slice(11, 16) || hhmm)}" onchange="cureModalPreview()"></div>
    </div>
    <div class="field"><label for="cure-temp">Shop temperature, °C (optional)</label>
      <input id="cure-temp" type="number" inputmode="numeric" placeholder="e.g. 18" value="${prior.tempC ?? ""}" onchange="cureModalPreview()">
    </div>
    ${lotFieldsHtml(prior)}
    ${bomConsumeFieldsHtml(w)}
    <div id="cure-preview"></div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitCure(${i})">Sign as ${esc(signerName())}</button>
    </div>
  `);
  cureModalPreview();
}
/* Live line under the form. It exists so nobody discovers the length of the
   hold they just started by coming back the next morning and finding the step
   still locked. */
function cureModalPreview() {
  const box = document.getElementById("cure-preview");
  if (!box) return;
  const id = (document.getElementById("cure-resin") || {}).value || "";
  const r = resinById(id);
  const tempRaw = (document.getElementById("cure-temp") || {}).value;
  const temp = tempRaw === "" || tempRaw == null ? null : Number(tempRaw);
  if (!r) {
    box.innerHTML = `<p class="gate"><span class="gi">!</span><span>No resin recorded means no cure hold on the next step. Write what you used into the step notes so the record is still honest.</span></p>`;
    return;
  }
  const cold = temp != null && !isNaN(temp) && temp < r.refTempC;
  box.innerHTML = `
    <p class="gate"><span class="gi">${cold ? "⚠" : "!"}</span><span>
      Sets a <b>${r.febHoldH} h</b> hold on the next step.
      ${cold ? `At ${esc(String(temp))} °C the shop is below the ${r.refTempC} °C this number is quoted at, so the part will cure slower than the clock suggests. Fingernail-test the flange before you trust it.`
             : `The datasheet asks for ${esc(r.sheetSays)}.`}
    </span></p>`;
}
function submitCure(i) {
  const w = woById(view.id);
  const id = (document.getElementById("cure-resin") || {}).value || "";
  const date = (document.getElementById("cure-date") || {}).value || today();
  const time = (document.getElementById("cure-time") || {}).value || "00:00";
  const tempRaw = (document.getElementById("cure-temp") || {}).value;
  const startedAt = new Date(date + "T" + time).toISOString();
  const cure = { resin: id, startedAt, ...readLotFields() };
  // Materials read here too — everything before closeModal, same footgun.
  const materials = w ? readBomConsumeFields(w) : [];
  if (tempRaw !== "" && tempRaw != null && !isNaN(Number(tempRaw))) cure.tempC = Number(tempRaw);
  closeModal();
  signStep(i, { cure });
  if (materials.length) consumeBomLines(w, materials);
}

/* ---------- materials consumed ----------
 *
 * The BOM rows a run copied from its part are the PLAN; consuming records
 * what actually went in, per line: usedQty, who, when, and the cost at that
 * moment (usedQty × the ref record's unitCost, frozen — prices drift, history
 * shouldn't). Consumption is always one explicit action — a per-line button,
 * or one confirm inside the cure buy-off where people already stand with the
 * empty pot — never a silent side effect, and a consumed line refuses to log
 * again, so the two doors can't double-count. Forward action, undo bar after,
 * per the house pattern.
 *
 * Stock effects, split by what a number honestly means (Simon's ruling):
 * boards have a numeric count, so consuming decrements it; lots' qty is free
 * text by design, so a lot line instead offers "still fine / running low /
 * now empty", which writes lowFlag or stage — the stage transitions ARE the
 * stock signal for materials. */

let WO_CONSUME_UNDO = null;

function woBomLine(w, lid) { return lid ? (w && w.bom || []).find(l => l.lineId === lid) : null; }

function bomConsumeCost(l, usedQty) {
  const rec = bomRefRec(l.ref);
  if (rec && typeof rec.unitCost === "number") {
    const q = parseLooseMoney(usedQty);
    return q == null ? null : Math.round(rec.unitCost * q * 100) / 100;
  }
  return parseLooseMoney(l.estCost);
}

/* Where a ref lives, by prefix — same trust the scan router puts in ids. */
function bomRefColl(id) {
  const s = String(id || "");
  if (/^(FAB|RSN|CON)-/.test(s)) return "lots";
  if (/^BRD-/.test(s)) return "stock";
  if (/^(JIG|PNL)-/.test(s)) return "items";
  return "";
}

function consumeBomLines(w, entries) {
  if (!w || !(entries || []).length) return;
  const undo = { woId: w.id, lines: [], stock: [], lots: [] };
  const patches = new Map();
  for (const e of entries) {
    const l = woBomLine(w, e.lineId);
    if (!l || l.consumed) continue;                    // no double-logging, ever
    undo.lines.push({ lineId: l.lineId, prev: {
      usedQty: l.usedQty || "", consumed: !!l.consumed, consumedAt: l.consumedAt || "",
      consumedBy: l.consumedBy || "", costAtConsumption: l.costAtConsumption ?? "" } });
    const patch = { usedQty: String(e.usedQty ?? ""), consumed: true, consumedAt: today(), consumedBy: signerName() };
    const c = bomConsumeCost(l, e.usedQty);
    patch.costAtConsumption = c == null ? "" : c;
    Object.assign(l, patch);
    patches.set(l.lineId, patch);

    const coll = bomRefColl(l.ref);
    if (coll === "stock") {
      const rec = recById("stock", l.ref);
      const dec = Math.round(Number(String(e.usedQty || "").trim()));
      if (rec && typeof rec.qty === "number" && Number.isFinite(dec) && dec > 0) {
        undo.stock.push({ id: rec.id, prev: rec.qty });
        rec.qty = Math.max(0, rec.qty - dec);
        saveField("stock", rec, "qty", q => Math.max(0, (Number(q) || 0) - dec));
      }
    }
    if (coll === "lots" && e.lotAfter) {
      const rec = recById("lots", l.ref);
      if (rec) {
        undo.lots.push({ id: rec.id, prevLow: rec.lowFlag || "", prevStage: rec.stage || "", prevQty: rec.qty || "", prevCount: rec.count });
        /* Writes the coarse level rather than stamping lowFlag. lowFlag is now
           an override for a person who looked at the shelf and knows better;
           the reorder decision is derived from the level and the restock rule,
           so that running OUT is expressible — which is the state the old
           model lost, because an Empty container drops out of every count. */
        if (e.lotAfter === "low") { rec.qty = "Low"; save("lots", rec, "qty"); }
        if (e.lotAfter === "empty") {
          rec.stage = "Empty"; save("lots", rec, "stage");
          rec.qty = "Empty"; save("lots", rec, "qty");
          if (!rec.emptiedOn) { rec.emptiedOn = today(); save("lots", rec, "emptiedOn"); }
          if (rec.cls === "CON" && Number(rec.count) > 0) { rec.count = 0; save("lots", rec, "count"); }
        }
      }
    }
  }
  if (!patches.size) return;
  saveField("workOrders", w, "bom", arr => (arr || []).map(x => patches.has(x.lineId) ? { ...x, ...patches.get(x.lineId) } : x));
  const spent = [...patches.values()].reduce((s, p) => s + (typeof p.costAtConsumption === "number" ? p.costAtConsumption : 0), 0);
  const n = patches.size;
  WO_CONSUME_UNDO = undo;
  toast(spent > 0
    ? `Logged ${fmtMoney(Math.round(spent * 100) / 100)} of materials into ${w.id}.`
    : `${n} material line${n === 1 ? "" : "s"} logged into ${w.id}.`);
  render();
}

function woConsumeUndo() {
  const u = WO_CONSUME_UNDO;
  if (!u) return;
  const w = recById("workOrders", u.woId);
  const prevBy = new Map(u.lines.map(x => [x.lineId, x.prev]));
  if (w) {
    (w.bom || []).forEach(l => { const p = prevBy.get(l.lineId); if (p) Object.assign(l, p); });
    saveField("workOrders", w, "bom", arr => (arr || []).map(x => prevBy.has(x.lineId) ? { ...x, ...prevBy.get(x.lineId) } : x));
  }
  for (const s of u.stock) { const r = recById("stock", s.id); if (r) { r.qty = s.prev; save("stock", r, "qty"); } }
  for (const lt of u.lots) {
    const r = recById("lots", lt.id);
    if (!r) continue;
    r.lowFlag = lt.prevLow; r.stage = lt.prevStage; r.qty = lt.prevQty;
    save("lots", r, "lowFlag"); save("lots", r, "stage"); save("lots", r, "qty");
    if (r.count !== lt.prevCount) { r.count = lt.prevCount; save("lots", r, "count"); }
  }
  WO_CONSUME_UNDO = null;
  toast("Materials log undone.");
  render();
}
function dismissConsumeUndo() { WO_CONSUME_UNDO = null; render(); }
function woConsumeUndoBar(woId) {
  const u = WO_CONSUME_UNDO;
  if (!u || u.woId !== woId) return "";
  const n = u.lines.length;
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${n} material line${n === 1 ? "" : "s"}</b> logged as used — saved for everyone.</span>
    <button class="sm" onclick="woConsumeUndo()">Undo</button>
    <button class="sm" title="Dismiss" aria-label="Dismiss" onclick="dismissConsumeUndo()">${icon("x", 14)}</button>
  </div>`;
}

/* One line, from the bench: prefilled with the plan, one tap to log. */
function openConsumeLine(lid) {
  const w = woById(view.id);
  const l = woBomLine(w, lid);
  if (!l || l.consumed) return;
  const isLot = bomRefColl(l.ref) === "lots";
  openModal(`
    <h2>Log material used</h2>
    <p class="muted">${esc(l.item || "This line")} — planned ${esc(l.qty || "?")} ${esc(l.unit || "")}.</p>
    <div class="field"><label for="cn-one">Actually used${l.unit ? ` (${esc(l.unit)})` : ""}</label>
      <input id="cn-one" value="${esc(l.usedQty || l.qty || "")}" autofocus placeholder="blank = unknown"></div>
    ${isLot ? `<div class="field"><label for="cnlot-one">The lot afterwards</label>
      <select id="cnlot-one"><option value="">still fine</option><option value="low">running low — flag a reorder</option><option value="empty">now empty</option></select></div>` : ""}
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitConsumeLine('${esc(lid)}')">Log it</button>
    </div>`);
}
function submitConsumeLine(lid) {
  const w = woById(view.id);
  const usedQty = (document.getElementById("cn-one") || {}).value || "";
  const lotAfter = (document.getElementById("cnlot-one") || {}).value || "";
  closeModal();
  consumeBomLines(w, [{ lineId: lid, usedQty, lotAfter }]);
}

/* The buy-off door: the cure modal already asks "what went in"; this is the
   same question with quantities, prefilled from the plan so the common case
   is zero extra typing. Only unconsumed lines appear. */
function bomConsumeFieldsHtml(w) {
  const open = (w && w.bom || []).filter(l => l.lineId && !l.consumed);
  if (!open.length) return "";
  return `<div class="field"><label>Materials used — prefilled from the plan, fix any that differ</label>
    ${open.map(l => {
      const isLot = bomRefColl(l.ref) === "lots";
      return `<div class="grid" style="grid-template-columns: 2fr 1fr${isLot ? " 1fr" : ""}; gap: 6px">
        <span class="ro tny">${esc(l.item || l.lineId)} <span class="muted">plan ${esc(l.qty || "?")} ${esc(l.unit || "")}</span></span>
        <input id="cn-${esc(l.lineId)}" value="${esc(l.qty || "")}" title="actually used — blank means unknown">
        ${isLot ? `<select id="cnlot-${esc(l.lineId)}"><option value="">lot: still fine</option><option value="low">running low</option><option value="empty">now empty</option></select>` : ""}
      </div>`;
    }).join("")}
    <div class="tny muted">Blank means "didn't measure" — that stays honest in the record.</div>
  </div>`;
}
function readBomConsumeFields(w) {
  return (w && w.bom || []).filter(l => l.lineId && !l.consumed).map(l => {
    const el = document.getElementById("cn-" + l.lineId);
    if (!el) return null;
    return { lineId: l.lineId, usedQty: el.value || "", lotAfter: (document.getElementById("cnlot-" + l.lineId) || {}).value || "" };
  }).filter(Boolean);
}

/* Actuals over the plan, one tap: the third layup's plan should be the second
   layup's reality (the anti-tribal-knowledge loop). Last write wins, with the
   provenance stamped on the line so "where did this number come from" always
   has an answer. Never fires automatically. */
function pushBomToPlan(lid) {
  const w = woById(view.id);
  const l = woBomLine(w, lid);
  if (!w || !l || !l.consumed) return;
  const p = woDetailPart(w);
  const pl = p && (p.bom || []).find(x => x.lineId === lid);
  if (!pl) { toast("The part's plan has no matching line — edit the plan on the part directly.", "error"); return; }
  const patch = { qty: l.usedQty || pl.qty, updatedFrom: { woId: w.id, at: today(), by: signerName() } };
  Object.assign(pl, patch);
  saveField("parts", p, "bom", arr => (arr || []).map(x => x.lineId === lid ? { ...x, ...patch } : x));
  toast(`Plan on ${p.id} updated from ${w.id} — the next run starts from reality.`);
  render();
}

/* ---------- which lots went in ----------
 *
 * This lives in the cure modal and nowhere else, on purpose. That modal is
 * already the one moment somebody is standing at the part having just mixed
 * resin, and it already asks what went in and when. A separate prompt would be
 * a second interruption at the same instant, and the second one is the one
 * people learn to dismiss.
 *
 * THE DESIGN IS DEFAULT-AND-CONFIRM, NOT SELECT.
 * What actually happens at 11pm is that nothing gets scanned: the roll is
 * already unrolled, the jug is "the one that was open", and the phone is across
 * the room because their hands are covered in resin. So each field is
 * pre-filled with the most recently opened lot of that class and asks for one
 * confirmation. Right by default about 90% of the time beats blank 100% of the
 * time, and it costs one tap instead of three scans.
 *
 * "I don't know" IS A VALID ANSWER and records lotSource: "unknown". A gate
 * that can only be satisfied by a lie gets satisfied by a lie — the same
 * principle as the "not recorded (retro)" sentinel in the SN5 work orders and
 * CS-013 §8's ban on fabricated buy-offs. An honest `unknown` is worth more
 * than a confident wrong lot, and it is the second-order failure that matters:
 * with two jugs on the bench, scanning the NEAREST one produces a precise,
 * confident, wrong record.
 */
const LOT_FIELDS = [
  ["lotFabric", "Fabric", "FAB"],
  ["lotResin", "Resin", "RSN"],
  ["lotHardener", "Hardener", "RSN"],
];

// The lot most recently opened for a class: the one that is physically on the
// bench, assuming CS-011's "one open container per material" rule is kept.
function defaultLot(cls, role) {
  const cand = (DB.lots || [])
    .filter(l => l.cls === cls && l.stage === "Open")
    .filter(l => !role || !l.role || l.role === role)
    .sort((a, b) => String(b.openedOn || "").localeCompare(String(a.openedOn || "")));
  return cand.length ? cand[0].id : "";
}

function lotFieldsHtml(prior) {
  const any = (DB.lots || []).length;
  if (!any) {
    return `<p class="gate"><span class="gi">!</span><span>No material lots exist yet, so this layup
      can't record which roll and which jug went in. Add them under <b>Inventory</b> and label the
      containers; then this asks one question instead of nobody being able to answer it in March.</span></p>`;
  }
  return `<h3 style="margin-bottom:2px">Which lots went in</h3>
    <p class="muted tny" style="margin-top:0">Pre-filled with whatever is currently open. Change it if it's wrong,
    and say so if you don't know — an honest "not recorded" is worth more than a confident guess.</p>
    ${LOT_FIELDS.map(([key, label, cls]) => {
      const role = key === "lotResin" ? "resin" : key === "lotHardener" ? "hardener" : "";
      const cur = prior[key] != null ? prior[key] : defaultLot(cls, role);
      const opts = (DB.lots || []).filter(l => l.cls === cls && (!role || !l.role || l.role === role));
      return `<div class="field"><label for="${key}">${esc(label)}</label>
        <div style="display:flex;gap:8px">
          <select id="${key}" style="flex:1 1 auto;min-width:0">
            ${opts.map(l => `<option value="${esc(l.id)}" ${l.id === cur ? "selected" : ""}>${esc(l.name || l.id)}${l.vendorLot ? " · lot " + esc(l.vendorLot) : ""}</option>`).join("")}
            <option value="unknown" ${cur === "unknown" ? "selected" : ""}>I don't know / not recorded</option>
          </select>
          ${typeof scanSupported === "function" && scanSupported()
            ? `<button type="button" class="sm ib" title="Scan the container's label" onclick="scanLotInto('${key}','${cls}')">${icon("scan", 15)}</button>` : ""}
        </div></div>`;
    }).join("")}`;
}

/* Scanned beats remembered, and the record says which it was. lotSource is a
   first-class field precisely so an inferred lot is distinguishable from a
   verified one rather than both looking equally authoritative in March. */
const LOT_SCANNED = {};
function scanLotInto(key, cls) {
  openScan({
    title: "Scan the container",
    hint: "Point the camera at the label on the roll or jug.",
    accept: id => String(id).startsWith(cls + "-"),
    onCode: id => {
      const sel = document.getElementById(key);
      if (sel && [...sel.options].some(o => o.value === id)) { sel.value = id; LOT_SCANNED[key] = true; }
      else toast(`${id} isn't in Inventory yet.`, "error");
    },
  });
}

function readLotFields() {
  if (!(DB.lots || []).length) return {};
  const out = {};
  let anyKnown = false, anyScanned = false, anyUnknown = false;
  for (const [key] of LOT_FIELDS) {
    const el = document.getElementById(key);
    const v = el ? el.value : "";
    if (!v || v === "unknown") { anyUnknown = true; continue; }
    out[key] = v;
    anyKnown = true;
    if (LOT_SCANNED[key]) anyScanned = true;
  }
  for (const k of Object.keys(LOT_SCANNED)) delete LOT_SCANNED[k];
  out.lotSource = !anyKnown ? "unknown" : anyScanned ? "scanned" : anyUnknown ? "partial" : "recalled";
  return out;
}

/* Why this many hours. The step row deliberately carries no standard reference
   and no datasheet figure — that was making every row a wall of citation — so
   the traceability CS-000 §8 wants lives one tap in, next to the button that
   opens the actual PDF. */
function openWhyHold(i) {
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h || !h.resin) return;
  const r = h.resin;
  openModal(`
    <h2>Why ${r.febHoldH} hours?</h2>
    <div class="field"><label>Resin</label><div class="ro">${esc(r.label)}</div></div>
    <div class="field"><label>Datasheet</label><div class="ro">${esc(r.sheetSays)}</div></div>
    <div class="field"><label>FEB holds it</label><div class="ro">${r.febHoldH} h — longer than the datasheet asks for, on purpose.${r.overridden ? " (set from the app by a lead, not the code table)" : ""}</div></div>
    ${r.febBy ? `<div class="field"><label>Signed off by</label><div class="ro">${esc(r.febBy)}</div></div>` : ""}
    ${h.tempC != null ? `<div class="field"><label>Shop temperature recorded</label><div class="ro">${esc(String(h.tempC))} °C${holdIsCold(h) ? ` — below the ${r.refTempC} °C the datasheet number is quoted at` : ""}</div></div>` : ""}
    <div class="foot">
      ${typeof openEditResinHold === "function" && isLead() ? `<button onclick="closeModal();openEditResinHold('${esc(r.id)}')">Change this hold…</button>` : ""}
      <button onclick="closeModal()">Close</button>
      <button class="primary" onclick="closeModal();openDatasheet('${esc(r.doc)}')">Open the datasheet</button>
    </div>
  `);
}
/* Documents owns the PDF viewer, and its manifest is fetched lazily the first
   time that tab renders. Jumping straight to openDocument() from here finds an
   empty manifest and shows nothing, so: switch tabs first, let the load happen,
   then open. */
function openDatasheet(src) {
  setTab("documents");
  // Documents fetches its manifest lazily on first render of that tab. setTab()
  // triggers that render, but the fetch resolves a tick later, so poll briefly
  // rather than calling openDocument() into an empty manifest and showing
  // nothing. Bounded, so a failed fetch gives up instead of spinning.
  if (typeof loadManifest === "function") loadManifest();
  const tryOpen = (n) => {
    if (typeof DOCS_MANIFEST !== "undefined" && (DOCS_MANIFEST || []).length) { openDocument(src); return; }
    if (n > 0) setTimeout(() => tryOpen(n - 1), 120);
  };
  tryOpen(12);
}

/* Overriding a hold is a lead call, and it costs a sentence. An unlogged
   override is worth nothing to the next person reading the record, and a hold
   nobody can ever pass just gets worked around outside the app — which is
   worse, because then it isn't written down anywhere. */
function openHoldOverride(i) {
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h) return;
  const short = Math.max(1, Math.ceil(h.msLeft / 3600000));
  openModal(`
    <h2>Demould early?</h2>
    <p class="gate"><span class="gi">✕</span><span><b>${short} h of a ${h.hours} h hold remain.</b> ${h.resin ? esc(h.resin.label) : ""}${holdIsCold(h) ? ` — and at ${esc(String(h.tempC))} °C it is curing slower than that clock, not faster` : ""}.</span></p>
    <div class="field"><label for="hold-why">Why are you demoulding early?</label>
      <textarea id="hold-why" autofocus rows="3" placeholder="What you checked, and who accepted the risk"></textarea>
    </div>
    <p class="muted">This goes in the event log with your name, the time, and how short it was.</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitHoldOverride(${i})">Override anyway</button>
    </div>
  `);
}
function submitHoldOverride(i) {
  const el = document.getElementById("hold-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  const h = holdState(w, i);
  if (!h) { closeModal(); return; }
  const short = Math.max(1, Math.ceil(h.msLeft / 3600000));
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), hoursShort: short, reason: why };
  // The event log is where a WO records things that happened to it, so the
  // override lands there rather than in a store invented for it.
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `Cure hold overridden by ${ov.by} with ${short} h of ${h.hours} remaining. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  signStep(i, { holdOverride: ov });
}

/* What's missing, why it matters, and the shortest path to fixing it. Modelled
   on openHoldOverride(): naming the thing and putting the fix one tap away is
   what stops a gate being worked around outside the app, which is worse than no
   gate at all because then it isn't written down anywhere. */
function openEvidenceModal(i) {
  const w = woById(view.id);
  const s = w.steps[i];
  const ev = stepEvidence(w, i);
  const rows = ev.missing.map(k => {
    const r = EVIDENCE[k];
    return `<p class="gate blocked"><span class="gi">✕</span><span><b>Needs ${esc(r.label)}.</b> ${esc(r.why)}<br>
      <span class="muted">${esc(r.fix)}</span></span></p>`;
  }).join("");
  openModal(`
    <h2>Can't sign off yet</h2>
    <p class="muted">${esc(stripCS(s.title))} — step ${s.seq} of ${esc(w.id)}.</p>
    ${rows}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      ${ev.missing.includes("note") ? `<button class="primary" onclick="closeModal();openStepNote('${w.id}',${i})">Write the note</button>` : ""}
      ${ev.missing.includes("file") ? `<button class="primary" onclick="closeModal();addRecordFiles('workOrders','${w.id}')">Add the file</button>` : ""}
      ${isLead() ? `<button class="danger" onclick="openEvidenceOverride(${i})">Sign without it</button>` : ""}
    </div>
  `);
}
/* A lead can sign anyway, and it costs a sentence. Same bargain as the cure
   hold: a gate nobody can ever pass gets worked around, and an unlogged
   exception is worth nothing to whoever reads this record in March. */
function openEvidenceOverride(i) {
  const w = woById(view.id);
  const ev = stepEvidence(w, i);
  const what = evidenceLabels(ev.missing).join(" and ");
  openModal(`
    <h2>Sign without ${esc(what)}?</h2>
    <p class="gate"><span class="gi">⚠</span><span>This goes in the event log with your name, the time, and what was missing.</span></p>
    <div class="field"><label for="ev-why">Why is this being signed without it?</label>
      <textarea id="ev-why" autofocus rows="3" placeholder="Where the evidence actually is, or why it doesn't exist"></textarea>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitEvidenceOverride(${i})">Sign it anyway</button>
    </div>
  `);
}
function submitEvidenceOverride(i) {
  const el = document.getElementById("ev-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  const ev = stepEvidence(w, i);
  const what = evidenceLabels(ev.missing).join(" and ");
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), missing: ev.missing.slice(), reason: why };
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `“${stripCS(w.steps[i].title)}” signed by ${ov.by} without ${what}. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  signStep(i, { evidenceOverride: ov });
}

/* Who may sign, before what the signature needs. The gate names the training,
   shows who on the roster holds it, and for a lead puts the override one tap
   away — same bargain as evidence and cure holds. Leads are NOT implicitly
   qualified: an untrained lead signing leaves a reasoned record, not a silent
   pass. Retro WOs and untagged steps never get here. */
function openTrainingGate(i, tr) {
  const w = woById(view.id);
  const s = w.steps[i];
  const q = qualifiedFor(tr);
  const who = q.length
    ? `<p class="muted" style="margin-bottom:4px">Any of these people can sign this step:</p>
       <div class="trwrap">${q.map(u => `<span class="chip">${avatar(u, 20)} ${esc(u.name || u.email)}</span>`).join("")}</div>`
    : `<p class="muted">Nobody on the roster holds this training yet — a lead can grant it on the People tab.</p>`;
  openModal(`
    <h2>Not yet — this step needs ${esc(trainingById(tr).name)} training</h2>
    <p class="muted">${esc(stripCS(s.title))} — step ${s.seq} of ${esc(w.id)}.</p>
    <p class="gate blocked"><span class="gi">✕</span><span><b>You're not recorded as ${esc(trainingById(tr).name)}-trained.</b>
      Trainings are granted by a lead on the People tab.</span></p>
    ${who}
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      ${isLead() ? `<button class="danger" onclick="openTrainingOverride(${i},'${tr}')">Sign without it</button>` : ""}
    </div>
  `);
}
function openTrainingOverride(i, tr) {
  openModal(`
    <h2>Sign without ${esc(trainingById(tr).name)} training?</h2>
    <p class="gate"><span class="gi">⚠</span><span>This goes in the event log with your name, the time, and the missing training.</span></p>
    <div class="field"><label for="tr-why">Why is this being signed by someone untrained?</label>
      <textarea id="tr-why" autofocus rows="3" placeholder="Who supervised, or why the training doesn't apply here"></textarea>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="danger" onclick="submitTrainingOverride(${i},'${tr}')">Sign it anyway</button>
    </div>
  `);
}
function submitTrainingOverride(i, tr) {
  const el = document.getElementById("tr-why");
  const why = (el ? el.value : "").trim();
  if (!why) { toast("An override needs a reason. That's the whole point of it.", "error"); return; }
  const w = woById(view.id);
  closeModal();
  const ov = { by: signerName(), email: myEmail(), at: new Date().toISOString(), training: tr, reason: why };
  w.timeline = w.timeline || [];
  w.timeline.push({
    date: today(),
    note: `“${stripCS(w.steps[i].title)}” signed by ${ov.by} without ${trainingById(tr).name} training. Reason: ${why}`,
  });
  saveWO(w, "timeline");
  // Merge the override onto the step, then rejoin the normal pipeline so the
  // evidence, photo, and cure gates still apply to this signature.
  Object.assign(w.steps[i], { trainingOverride: ov });
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], trainingOverride: ov }; return steps; });
  buyoff(i);
}

async function buyoff(i) {
  const w = woById(view.id);
  const blocked = blockerOpenBefore(w, i);
  if (blocked) { toast("Blocked by unfinished blocker: " + blocked.title, "error"); return; }
  // Who may sign, before what the signature needs: identity is the cheapest
  // check, and failing it after someone typed an evidence note wastes the note.
  const tr = stepTraining(w.steps[i]);
  if (tr && !w.retro && !hasTraining(myEmail(), tr) && !w.steps[i].trainingOverride) {
    openTrainingGate(i, tr);
    return;
  }
  // What the signature has to come with. Before the cure path, because a cure
  // modal that collects a resin and a time and THEN refuses to sign has wasted
  // the one moment somebody was standing at the part with the answer.
  const ev = stepEvidence(w, i);
  if (ev.missing.length) { openEvidenceModal(i); return; }
  // Suggested, not required — and Cancel now IS the camera: it opens the
  // picker for this step, and when the photo lands the buy-off resumes on
  // its own. One gesture covers "sign it, with the photo it deserves".
  if (ev.suggested.includes("photo") && !(await confirmAsync(
      "No photo on this step. A photo of what you signed for is the difference between a record and a name.",
      { title: "Sign without a photo?", ok: "Sign it anyway", danger: false }))) {
    addStepPhotos(w.id, i, { then: () => buyoff(i) });
    return;
  }
  // CS-013: a design review signed by whoever made the thing isn't a review.
  if (w.steps[i].title.toLowerCase().includes("design review") && myEmail() &&
      myEmail() === w.createdBy &&
      !await confirmAsync("You created this work order. A design review should be signed off by someone else. Sign it anyway?",
        { title: "Self-review", ok: "Sign it anyway" })) return;
  // Starting a cure: ask what and when before signing. signStep() does the write.
  if (startsHold(w.steps[i]) && !w.retro) { openCureModal(i); return; }
  /* A hold is re-checked here and not just at render, so a step that came ready
     while the page sat open signs without a refresh. The countdown on screen
     can be a minute stale; this cannot. */
  const h = holdState(w, i);
  if (h && !h.ready && !h.overridden) {
    if (!isLead()) {
      toast(`Still curing — ${fmtLeft(h.msLeft)}. A lead can override if it really can't wait.`, "error");
      return;
    }
    openHoldOverride(i);
    return;
  }
  signStep(i);
}

/* The actual write, shared by the plain path and by both modals. Extra fields
   are merged onto the step in the same transactional re-apply as the buy-off,
   so a teammate signing a different step at the same moment can't erase them
   and a cure record can't land without its signature. */
function signStep(i, extra) {
  const w = woById(view.id);
  const bo = {
    name: signerName(), email: fb.user.email, uid: fb.user.uid,
    date: today(), time: new Date().toISOString(),
  };
  const patch = { buyoff: bo, status: "done", ...(extra || {}) };
  Object.assign(w.steps[i], patch); // optimistic local
  // Concurrency-safe: re-apply just this step on fresh server data so a
  // teammate buying off a different step at the same moment can't erase it.
  saveField("workOrders", w, "steps", steps => { steps[i] = { ...steps[i], ...patch }; return steps; });
  render();
}
function rmWoDoc(linkId) { removeDocLink("workOrders", view.id, linkId); }

/* Append-only, authored note log on a work order — the same shape as a ticket
   comment, so threadHtml/commentHtml render it and edit/remove work on it for
   free. saveField, not a whole-field write, so two people adding notes from the
   bench at the same time do not clobber each other. */
function postWoNote(id) {
  const box = document.getElementById("wo-note");
  const html = sanitizeHtml((box && box.innerHTML) || "");
  const text = String((box && box.textContent) || "").trim();
  if (!text && !/<img/i.test(html)) { toast("Write the note first.", "error"); return; }
  const w = woById(id);
  if (!w) return;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), html };
  w.noteLog = (w.noteLog || []).concat([c]);
  saveField("workOrders", w, "noteLog", arr => (arr || []).concat([c]));
  if (box) box.innerHTML = "";
  clearDraft("wonote", id);
  closeComposer("wo-note");
  render();
}
/* A step note long enough to want a photo gets the full composer, in a modal —
   which is also the right shape on a phone, where #modal already solves the
   safe-area padding and keeps the save button above the keyboard. */
function openStepNote(woId, i) {
  const w = woById(woId);
  if (!w || !w.steps || !w.steps[i]) return;
  const s = w.steps[i];
  rteSetUpload(name => `projects/${woId}/${Date.now()}-${name}`);
  openModal(`
    <h2>${esc(stripCS(s.title))}</h2>
    <p class="muted">Step ${s.seq} of ${esc(woId)}. Photos, measurements, anything the next person needs.</p>
    ${composerHtml({
      targetId: "step-note",
      html: sanitizeHtml(s.noteHtml || esc(s.notes || "")),
      alwaysOpen: true,
      placeholder: "What happened at this step…",
      onpost: `saveStepNote('${woId}',${i})`,
      oncancel: `closeModal()`,
      postLabel: "Save note",
      hint: "",
    })}
  `);
}
function saveStepNote(woId, i) {
  const box = document.getElementById("step-note");
  const html = sanitizeHtml((box && box.innerHTML) || "");
  const text = String((box && box.textContent) || "").trim();
  const w = woById(woId);
  if (!w) return;
  closeModal();
  // Both fields: `notes` is what the printed traveler and the one-line input
  // read, `noteHtml` is the long form. Keeping them in step means the paper
  // sheet never goes blank because someone used the rich editor.
  w.steps[i].notes = text;
  w.steps[i].noteHtml = html;
  saveField("workOrders", w, "steps", arr => {
    arr[i] = { ...arr[i], notes: text, noteHtml: html };
    return arr;
  });
  render();
}

/* ---------- keyboard ----------
   Same contract as partsKeydown() and moldsKeydown(): a pure function that
   returns the name of the action it took (or null), so a test can drive it
   without constructing a KeyboardEvent.

   All three handlers are bound to document at once, so the view.tab guard has
   to come first — right after the modifier check. */
function woNeighborId(dir) {
  const rows = woIndexRows();
  if (!rows.length) return null;
  const i = rows.findIndex(w => w.id === view.id);
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + dir))].id;
}
function moveWOSelection(dir) { const id = woNeighborId(dir); if (id) selectWO(id); }

function woKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "workorders") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    // Escape gets you out of the search box; nothing else is stolen from a
    // field you are typing in.
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); moveWOSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); moveWOSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = woNeighborId(1); if (id) { selectWO(id); return "open"; } return null; }
  if (k === "Escape" && view.mode === "detail") { clearWOSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  if (k === "e" && view.mode === "detail") { view.edit = !view.edit; render(); return "edit"; }
  /* 1-8 scroll to a section of the open record. Digits are free here in a way
     they are not on Parts, which spends 1/2/3 advancing stages: a work order
     has no stage enum to advance. There is no ←/→ any more, because with the
     whole record in one scroll there is no "current section" for them to step
     from — that was a switch, and this is a jump. */
  const SEC = woSections(view.edit);
  if (view.mode === "detail" && /^[1-8]$/.test(k) && SEC[+k - 1]) {
    if (e.preventDefault) e.preventDefault();
    woJump(SEC[+k - 1].anchor);
    return "section";
  }
  return null;
}
document.addEventListener("keydown", woKeydown);
