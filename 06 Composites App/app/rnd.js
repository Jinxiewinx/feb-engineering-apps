"use strict";
/* rnd.js — the R&D bench.
 *
 * WHAT THIS IS FOR
 * The team makes coupons: ten flat panels at two cure temperatures, six
 * infusion trials, a handful of bond-shear tabs. Until now the app had nowhere
 * to put them. R&D was a boolean on a part, and an individual coupon was a TEXT
 * RANGE on a panel — `coupons: "C01-C12"` on an items/PNL record — so ten
 * coupons were one field on one document and not one of them was individually
 * findable, filterable, labelable or comparable. The alternative was a
 * spreadsheet, and a spreadsheet is what this replaces.
 *
 * So the bar is not "does it work". The bar is MORE USABLE THAN THE SPREADSHEET
 * IT REPLACES, because the spreadsheet is always right there and always
 * good enough. Everything below is shaped by that: no work order, no traveler,
 * no revision, no buy-off, no cure hold. Three clicks from opening the tab to
 * ten rows you can type into.
 *
 * TWO RECORD KINDS, ONE COLLECTION, discriminated on `cls` — the pattern items
 * and lots already use (see the COLLECTIONS comment in fb.js). `cls` IS the id
 * prefix: allocId("rnd", "CPN") mints CPN-SN6-042 with no extra wiring.
 *
 *   RDS  a STUDY. A named collection of coupons. Deliberately ONE shape for
 *        three uses: declare nothing and it is a plain folder; declare a column
 *        with role "input" and it is a test with a swept variable; give it a
 *        `parent` and it is a batch inside a project. No mode switch, no
 *        wizard, nothing to choose up front — which is what stops the empty
 *        state from asking a question nobody wants to answer at a bench.
 *
 *   CPN  a COUPON. One physical test piece. One row.
 *
 * THIS IS NOT `rnd:true` ON A PART, and the shared word is all they have in
 * common. DESIGN-NOTES is emphatic that an R&D PART is "real carbon on a real
 * deadline" which keeps every blocker, every cure hold and every evidence gate.
 * That is the opposite of a coupon. Nothing in this file may ever be read by
 * inSeason(), and NOTHING IN THIS FILE MAY EVER TEST `retro` — the day it does,
 * the feature has quietly become `retro` with a third word. There is a test
 * that reads this source and asserts exactly that.
 *
 * Every top-level binding here is prefixed rd/RD. appload.mjs runs each app
 * file with runInThisContext into ONE shared global lexical scope, so a name
 * collision with any other app file is a hard SyntaxError that kills the whole
 * node suite rather than a shadowed variable.
 */

/* ---------- vocabulary ---------- */

/* Four, deliberately, and not the five a test panel carries (PNL_STAGE is
   Planned/Laid up/Cured/Cut/Tested). "Laid up" is wrong for a coupon cut from
   somebody else's panel, and Cured/Cut are process detail that belongs in a
   declared column if a study cares. A status list nobody keeps accurate is
   worse than a short one everybody does.

   Scrapped earns its place: a scrapped coupon's numbers are a measurement of a
   mistake, and the compare view has to be able to drop it. */
const RD_STATUS = ["Planned", "Made", "Tested", "Scrapped"];
const RD_STUDY_STATUS = ["Active", "Done", "Parked"];

/* What a per-study column may be. `check` is absent on purpose: a checkbox is a
   two-value select that cannot say "not measured yet", and a blank result is
   the single most important value in a half-finished study. */
const RD_COL_TYPES = ["num", "text", "date", "select"];

/* An input is a setting you CHOSE; a result is something you MEASURED. That one
   distinction is the whole reason the compare view can exist — it is what lets
   the app group by the thing you varied and average the thing you got. */
const RD_COL_ROLES = ["input", "result"];

/* Past eight the grid overflows at 1440 and every available fix is "hide the
   columns people came here to fill in". The ninth column is a second study. */
const RD_MAX_COLS = 8;

/* allocIds chunks at 50 and the rules cap a counter write at +50, so 100 works
   mechanically. It is capped anyway because 100 coupons in one press is a typo,
   and a typo that mints ids is expensive to undo. */
const RD_MAX_ROWS = 100;

/* ---------- accessors ---------- */

function rdAll() { return DB.rnd || []; }
function rdStudies() { return rdAll().filter(o => o.cls === "RDS"); }
function rdStudy(id) { return rdAll().find(o => o.id === id && o.cls === "RDS") || null; }
function rdCoupons(studyId) {
  return rdAll().filter(o => o.cls === "CPN" && o.study === studyId).sort((a, b) => cmpId(a.id, b.id));
}
/* One level, and rdChildren never recurses. A two-level tree is a file system,
   and a file system is the thing this is meant to beat. */
function rdChildren(studyId) {
  return rdStudies().filter(s => s.parent === studyId).sort((a, b) => cmpId(a.id, b.id));
}
function rdRoots() {
  return rdStudies().filter(s => !s.parent || !rdStudy(s.parent)).sort((a, b) => cmpId(a.id, b.id));
}
/* Coupons under a study INCLUDING its batches, which is what a project's count
   has to mean or the number on the parent row is smaller than the sum below it. */
function rdCouponsDeep(studyId) {
  return rdCoupons(studyId).concat(...rdChildren(studyId).map(c => rdCoupons(c.id)));
}
function rdStudyOf(coupon) { return coupon && coupon.cls === "CPN" ? rdStudy(coupon.study) : null; }

/* THE ROWS A STUDY'S SHEET SHOWS. A project with batches rolls THEIR coupons
   up; a study with no children shows its own.

   This is what makes nesting worth having, and the first build got it wrong:
   the index row counted deep (12) while the sheet counted direct (0), so
   opening a project said "no coupons yet" underneath a row that had just
   claimed twelve. One number, one place, or the tab is lying to itself.

   It is also the only way a swept variable can span batches — which was the
   stated reason a project inherits its columns down in the first place. */
function rdSheetRows(s) {
  if (!s) return [];
  return rdChildren(s.id).length ? rdCouponsDeep(s.id) : rdCoupons(s.id);
}
/* Coupons go in a batch, never beside one. A project that has batches is an
   index, and "which batch was this in" is not a question the app should let
   somebody leave blank. */
function rdIsParent(s) { return !!s && rdChildren(s.id).length > 0; }

/* The columns a study actually renders: its parent's first, then its own.

   A project's columns are inherited by its batches so a sweep can span them,
   which is the only thing that makes nesting worth having. Concatenated rather
   than merged, and a batch may add its own. `hidden` retires a column without
   destroying the values already measured into it. */
function rdCols(study) {
  if (!study) return [];
  const own = (study.cols || []).filter(c => !c.hidden);
  const parent = study.parent ? rdStudy(study.parent) : null;
  const up = parent ? (parent.cols || []).filter(c => !c.hidden) : [];
  const seen = new Set(up.map(c => c.cid));
  return up.concat(own.filter(c => !seen.has(c.cid)));
}

/* The spine fields a coupon inherits from its study. These are the exact names
   an items/PNL test panel already uses (see SHOP_FIELDS in shop.js) — `by` and
   `laidOn` rather than madeBy/madeOn, because labelLines() already prints those
   two and two names for one fact is how qty/count/lowFlag overlapped three ways
   on lots. */
const RD_INHERITS = ["stack", "fabricLots", "resinLot", "hardenerLot", "lotSource", "laidOn", "by"];

/* THE EFFECTIVE VALUE of an inherited field, resolved at READ time and never
   copied at write time.

   A copy would make "change the resin for this study" a fan-out over N
   documents with no transaction across them and a half-applied state in the
   middle — the same reasoning woIsRnd() derives a run's programme rather than
   storing it. It also means clearing a cell back to "" RESTORES inheritance,
   which is the honest behaviour and needs no third state and no tombstone.

   One hop up to the parent study, matching rdCols. Never spell this fallback
   out by hand at a call site. */
function rdEff(coupon, key) {
  if (!coupon) return "";
  const own = coupon[key];
  if (own !== undefined && own !== null && own !== "") return own;
  const s = rdStudyOf(coupon);
  const mine = s && s.defaults ? s.defaults[key] : "";
  if (mine !== undefined && mine !== null && mine !== "") return mine;
  const up = s && s.parent ? rdStudy(s.parent) : null;
  const theirs = up && up.defaults ? up.defaults[key] : "";
  return theirs === undefined || theirs === null ? "" : theirs;
}
/* Is this coupon's value its own, or the study's? The grid renders an inherited
   value muted, because a coupon showing its study's resin otherwise looks
   identical to one that set it — and then an override is invisible until it
   bites somebody. */
function rdIsInherited(coupon, key) {
  const own = coupon ? coupon[key] : "";
  return !(own !== undefined && own !== null && own !== "");
}

/* ---------- creating ---------- */

/* The human label stem for a study's coupons, so they read C01…C10 whatever
   their Firestore ids are. */
function rdNextLabelNum(study) {
  if (!study) return 1;
  if (Number.isFinite(Number(study.labelNext)) && Number(study.labelNext) > 0) return Number(study.labelNext);
  const stem = study.labelPrefix || "C";
  const re = new RegExp("^" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$");
  let max = 0;
  for (const c of rdCoupons(study.id)) {
    const m = re.exec(String(c.label || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function rdNewStudyModal(parentId) {
  if (guestBlocked("create a study")) return;
  const parent = parentId ? rdStudy(parentId) : null;
  const roots = rdRoots();
  openModal(`<h2>${parent ? "New batch" : "New study"}</h2>
    ${parent ? `<p class="tny muted">Inside <b>${esc(parent.name || parent.id)}</b>. Its columns and materials carry down.</p>` : ""}
    <div class="grid">
      <label class="f"><span>Name</span>
        <input id="rd-name" autofocus placeholder="${parent ? "Round 2 — 140 °C" : "Flat panel cure temp"}"></label>
      <label class="f"><span>What are we trying to find out? <span class="tny muted">optional</span></span>
        <input id="rd-q" placeholder="Does a 20 °C hotter post-cure move the tensile knee?"></label>
      <label class="f"><span>Coupon labels start with</span>
        <input id="rd-stem" value="C" maxlength="4"></label>
      <label class="f"><span>Make this many coupons now</span>
        <input id="rd-n0" type="number" min="0" max="${RD_MAX_ROWS}" value="0"></label>
      ${!parent && roots.length ? `<label class="f"><span>Part of <span class="tny muted">optional</span></span>
        <select id="rd-parent"><option value="">— on its own —</option>
        ${roots.map(r => `<option value="${esc(r.id)}">${esc(r.name || r.id)}</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="rdCreateStudy('${esc(parentId || "")}')">Create</button>
    </div>`);
}

/* READ THE WHOLE FORM BEFORE AWAITING ANYTHING. allocId's offline fallback opens
   a modal of its own, and openModal() replaces what is on screen — including
   the inputs still being read. The same rule as every other create path here;
   it is written on allocId itself. */
async function rdCreateStudy(parentId) {
  const name = String((document.getElementById("rd-name") || {}).value || "").trim();
  const question = String((document.getElementById("rd-q") || {}).value || "").trim();
  const stem = String((document.getElementById("rd-stem") || {}).value || "C").trim() || "C";
  const n0 = Math.max(0, Math.min(RD_MAX_ROWS, parseInt((document.getElementById("rd-n0") || {}).value, 10) || 0));
  const picked = String((document.getElementById("rd-parent") || {}).value || "");
  const parent = parentId || picked || "";
  if (!name) { toast("A study needs a name.", "error"); return; }
  /* One level, enforced here as well as in the picker: a batch may not itself
     be a parent, and the picker only ever offers roots. Two guards because the
     picker is a UI and this is the rule. */
  const up = parent ? rdStudy(parent) : null;
  if (up && up.parent) { toast("A batch cannot hold batches — pick the project instead.", "error"); return; }

  const id = await allocId("rnd", "RDS");
  if (!id) return;                                   // allocId toasts its own failure
  const s = {
    id, cls: "RDS", name, question, status: "Active", parent,
    labelPrefix: stem, labelNext: 1,
    cols: [], defaults: {}, notes: "", notesHtml: "",
    createdBy: myEmail(), createdOn: today(),
  };
  (DB.rnd = DB.rnd || []).push(s);
  save("rnd", s);
  closeModal();
  view = { ...view, rdStudy: id, rdPane: "study", mode: "detail", id, edit: false };
  render(); syncUrl();
  if (n0 > 0) await rdAddRows(n0);
}

/* Bulk create. The one moment in this tab that stages anything, and it follows
   submitSeasonLayout step for step because every step of that is load-bearing. */
async function rdAddRows(count) {
  if (guestBlocked("add coupons")) return;
  const study = rdStudy(view.rdStudy);
  if (!study) return;
  /* Guarded here as well as hidden in the toolbar: the toolbar is a UI and this
     is the rule. A coupon beside the batches rather than in one of them is a
     provenance hole with no way to close it afterwards. */
  if (rdIsParent(study)) { toast("Open a batch to add coupons — a project holds batches, not coupons.", "error"); return; }
  /* Read the form BEFORE the await, for the reason on rdCreateStudy. */
  const typed = count !== undefined ? count
    : parseInt((document.getElementById("rd-n") || {}).value, 10);
  const n = Math.max(1, Math.min(RD_MAX_ROWS, typed || 10));
  const stem = study.labelPrefix || "C";
  const first = rdNextLabelNum(study);

  /* labelNext ADVANCES FIRST, before the ids exist. A crash after this point
     gaps the human labels; a crash before it would mint a SECOND C03 on the
     next press. A gap is invisible and costs nothing. A duplicate written in
     Sharpie on a physical coupon is unrecoverable. */
  study.labelNext = first + n;
  save("rnd", study, "labelNext");

  const ids = await allocIds("rnd", "CPN", n);
  if (ids.length < n) {
    /* ABORT AND WRITE NOTHING. A partial block is how you get a study with
       four of the ten coupons somebody thinks they made. */
    toast(`Only ${ids.length} of ${n} coupon IDs came back. Nothing was written — try again when you are back online.`, "error");
    return;
  }

  /* Nothing from `defaults` is copied in: inheritance is resolved at read time
     by rdEff, so fixing the study's resin lot afterwards fixes its coupons. */
  const made = ids.map((id, i) => ({
    id, cls: "CPN", study: study.id,
    label: stem + String(first + i).padStart(2, "0"),
    status: "Planned", vals: {}, notes: "", notesHtml: "", photos: [],
    createdBy: myEmail(),
  }));
  for (const o of made) (DB.rnd = DB.rnd || []).push(o);

  try {
    if (made.length > 8 && window.fb && fb.importMany) {
      await fb.importMany("rnd", made);
      /* importMany does NOT call pubSync, which save() does on every write. A
         coupon carries a printed QR, and without the public mirror that label
         scans to "no record with this ID yet" — silently, days later, at the
         bench. publishPub is the batched mirror writer. */
      if (fb.publishPub && typeof pubProjection === "function") {
        await fb.publishPub(made.map(o => pubProjection("rnd", o)).filter(Boolean));
      }
    } else {
      for (const o of made) save("rnd", o);
    }
  } catch (e) {
    toast("Some coupons may not have saved: " + (e && e.message ? e.message : e), "error");
  }

  RD_UNDO = { ids: made.map(o => o.id), n: made.length, study: study.id, prevLabelNext: first };
  render();
}

/* ---------- deleting a study ----------

   The coupons go with it, after a confirm that NAMES THE COUNT. A study is not
   a folder you can peek into before deleting — the count is the only warning
   somebody gets, and "and its 10 coupons" is the difference between a confident
   press and a regretted one.

   A PROJECT WITH BATCHES REFUSES. Deleting three rounds of work with one press
   is not a thing to offer, and the batches are right there in the index. */
async function rdDelStudy(id) {
  const s = rdStudy(id);
  if (!s || guestBlocked("delete a study")) return;
  const kids = rdChildren(id);
  if (kids.length) {
    toast(`"${s.name || s.id}" holds ${kids.length} batch${kids.length === 1 ? "" : "es"}. Delete those first — this is three rounds of work, not one press.`, "error");
    return;
  }
  const rows = rdCoupons(id);
  /* PLAIN TEXT, not markup: confirmModal runs its message through esc(), so a
     <b> here prints as a literal tag in front of somebody about to delete ten
     coupons. Quotes do the emphasis instead. */
  const name = s.name || s.id;
  const what = rows.length
    ? `Delete "${name}" and its ${rows.length} coupon${rows.length === 1 ? "" : "s"}? Their measurements go with them.`
    : `Delete "${name}"?`;
  confirmModal(what, async () => {
    const gone = [s, ...rows];
    RD_UNDO = { kind: "delete", recs: JSON.parse(JSON.stringify(gone)), n: rows.length, name: s.name || s.id };
    DB.rnd = rdAll().filter(o => o.id !== id && o.study !== id);
    if (view.rdStudy === id) { view.rdStudy = null; if (view.id === id) view.id = null; }
    render();
    try {
      /* delMany over one-at-a-time: a study and ten coupons is eleven round
         trips otherwise, and a half-finished delete leaves coupons pointing at
         a study that is gone. */
      if (window.fb && fb.delMany) await fb.delMany(gone.map(o => ({ coll: "rnd", id: o.id })));
      else for (const o of gone) await del("rnd", o.id);
    } catch (e) {
      toast("Some records may not have been deleted: " + (e && e.message ? e.message : e), "error");
    }
  }, { ok: "Delete", danger: true });
}

/* ---------- duplicate a study as a template ----------

   Repeat testing is the normal case, not the exception: the same sweep, a new
   batch, next week. Without this you rebuild the columns and re-pick the
   materials by hand every time, which is exactly the friction that sends
   somebody back to the spreadsheet they already have.

   The COLUMNS KEEP THEIR cids. Two studies sharing a column id is not a
   collision, it is the thing that makes "cure temp across every sweep we ever
   ran" answerable later. Coupons are NOT copied — a template is the setup, not
   the results — and labelNext resets so the new run starts at 01. */
async function rdDuplicateStudy(id) {
  const s = rdStudy(id);
  if (!s || guestBlocked("duplicate a study")) return;
  const newId = await allocId("rnd", "RDS");
  if (!newId) return;
  const copy = {
    id: newId, cls: "RDS",
    name: (s.name || "Study") + " (copy)",
    question: s.question || "",
    status: "Active",
    parent: s.parent || "",
    labelPrefix: s.labelPrefix || "C",
    labelNext: 1,
    cols: JSON.parse(JSON.stringify(s.cols || [])),
    defaults: JSON.parse(JSON.stringify(s.defaults || {})),
    notes: "", notesHtml: "", photos: [],
    createdBy: myEmail(), createdOn: today(),
  };
  (DB.rnd = DB.rnd || []).push(copy);
  save("rnd", copy);
  view.rdStudy = newId;
  render();
  /* Count the EFFECTIVE columns, not the copy's own. Duplicating a batch copies
     no columns at all — they belong to the project both batches hang off — so
     counting `copy.cols` told somebody "0 columns" about a grid that was about
     to render three. The number has to be the one they are going to see. */
  const n = rdCols(copy).length;
  toast(`Copied the setup — ${n} column${n === 1 ? "" : "s"} and the materials. No coupons yet.`);
}

/* ---------- labels ---------- */

/* Every coupon in the study, as one sheet. The single most useful printing this
   tab does: you cut ten coupons and you want ten tags in one press, not ten
   presses. A rolled-up project prints its batches' too, which is what is on
   screen. */
function rdPrintCouponLabels(id) {
  const s = rdStudy(id);
  if (!s) return;
  const rows = rdSheetRows(s);
  if (!rows.length) { toast("No coupons to label yet.", "error"); return; }
  openLabelPreview(rows.map(o => ({ coll: "rnd", o })));
}

/* ---------- export ---------- */

/* The columns a study exports, spine first then its own, so the header reads
   the way the grid does. Shared by the CSV and the clipboard TSV so the two can
   never disagree about what "all the data" means. */
function rdExportCols(s) {
  const cols = rdCols(s);
  const out = [
    { label: "id", get: r => r.id },
    { label: "study", get: r => { const o = rdStudy(r.study); return o ? (o.name || o.id) : r.study; } },
    { label: "label", get: r => r.label },
    { label: "status", get: r => r.status },
  ];
  for (const c of cols) {
    out.push({ label: c.unit ? `${c.name} (${c.unit})` : c.name, get: r => (r.vals || {})[c.cid] ?? "" });
  }
  /* The inherited fields are exported RESOLVED, not raw. A blank resin cell in
     a spreadsheet somebody opens next year is a lie by omission — the coupon
     did have a resin, it just took it from its study. */
  for (const k of RD_INHERITS) out.push({ label: k, get: r => rdEff(r, k) });
  out.push({ label: "notes", get: r => r.notes || "" });
  out.push({ label: "photos", get: r => (r.photos || []).length || "" });
  return out;
}

function rdExportCSV(id) {
  const s = rdStudy(id);
  if (!s) return;
  const rows = rdSheetRows(s);
  const name = String(s.name || s.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadCSV(`rnd-${name || s.id}`, toCSV(rows, rdExportCols(s)));
}

/* Copy beats a download on a phone, where a browser download often silently
   does nothing — the same reasoning the Inventory export runs on. TSV because
   Sheets does not reliably unquote CSV on paste. */
function rdCopyTSV(id) {
  const s = rdStudy(id);
  if (!s) return;
  copyText(toTSV(rdSheetRows(s), rdExportCols(s)), "the study");
}

/* The printable report: what you hand a reviewer, or put in front of a
   professor. Through mountSheet, like every other printable in the app, so it
   gets the preview, the grayscale proof and Save — and NOT a raw window.print(),
   which is the thing reports.js is still being chased about. */
function rdPrintReport(id) {
  const s = rdStudy(id);
  if (!s) return;
  const cols = rdCols(s);
  const rows = rdSheetRows(s);
  const mat = RD_INHERITS.map(k => {
    const v = (s.defaults || {})[k];
    return v ? `<span><b>${esc(k)}</b> ${esc(String(v))}</span>` : "";
  }).filter(Boolean).join("");
  const photos = (s.photos || []).slice(0, 6);
  const html = `<div class="rdrep-page">
    <h1>${esc(s.name || s.id)}</h1>
    <div class="rdrep-meta">${esc(s.id)} · ${esc(s.status || "Active")}${
      s.createdOn ? " · started " + esc(s.createdOn) : ""}${
      s.createdBy ? " · " + esc(userName(s.createdBy)) : ""} · ${rows.length} coupon${rows.length === 1 ? "" : "s"}</div>
    ${s.question ? `<p class="rdrep-q">${esc(s.question)}</p>` : ""}
    ${mat ? `<div class="rdrep-mat">${mat}</div>` : ""}
    <table class="rdrep-tbl">
      <thead><tr><th>Label</th>${rdIsParent(s) ? "<th>Batch</th>" : ""}<th>Status</th>${
        cols.map(c => `<th>${esc(c.name)}${c.unit ? ` (${esc(c.unit)})` : ""}</th>`).join("")}<th>Notes</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><b>${esc(r.label || r.id)}</b></td>
        ${rdIsParent(s) ? `<td>${esc(((rdStudy(r.study) || {}).name) || "")}</td>` : ""}
        <td>${esc(r.status || "")}</td>
        ${cols.map(c => `<td>${esc(String((r.vals || {})[c.cid] ?? ""))}</td>`).join("")}
        <td>${esc(r.notes || "")}</td></tr>`).join("")}</tbody>
    </table>
    ${rdCompareTableHtml(s, cols, rows)}
    ${photos.length ? `<div class="rdrep-photos">${
      photos.map(p => `<figure><img src="${esc(p.url)}" alt="${esc(p.name || "")}"><figcaption>${esc(p.caption || p.name || "")}</figcaption></figure>`).join("")}</div>` : ""}
  </div>`;
  mountSheet(html, true, `${esc(s.name || s.id)} · ${rows.length} coupon${rows.length === 1 ? "" : "s"}`,
    `rnd-${String(s.id).toLowerCase()}`);
  document.body.classList.add("previewing");
}

/* ---------- undo ----------
   One slot, the shape RX_UNDO / CUTS_UNDO / SHOP_UNDO already use. It deletes
   exactly what it created and puts labelNext back, so pressing Add rows again
   reuses the numbers rather than skipping them. */
let RD_UNDO = null;

function rdUndoBar() {
  if (!RD_UNDO) return "";
  const say = RD_UNDO.kind === "delete"
    ? `Deleted <b>${esc(RD_UNDO.name)}</b>${RD_UNDO.n ? ` and its ${RD_UNDO.n} coupon${RD_UNDO.n === 1 ? "" : "s"}` : ""}.`
    : `${RD_UNDO.n} coupon${RD_UNDO.n === 1 ? "" : "s"} added.`;
  return `<div class="undobar no-print">
    <span>${say}</span>
    ${RD_UNDO.kind === "delete" ? "" :
      `<button class="ib" onclick="rdPrintCouponLabels(view.rdStudy)">${icon("print", 15)} Print labels</button>`}
    <button class="ib" onclick="rdUndo()">Undo</button>
    <button class="ib" onclick="RD_UNDO=null;render()">Dismiss</button>
  </div>`;
}

async function rdUndo() {
  const u = RD_UNDO;
  if (!u) return;
  RD_UNDO = null;

  /* Putting a deleted study back. The records were snapshotted before the
     delete rather than rebuilt from the UI, so a coupon comes back with its
     measurements, its notes and its photo list intact — an undo that restored
     the row but not the numbers would be worse than no undo, because it looks
     like it worked. */
  if (u.kind === "delete") {
    for (const o of u.recs) (DB.rnd = DB.rnd || []).push(o);
    view.rdStudy = u.recs[0] ? u.recs[0].id : view.rdStudy;
    render();
    try {
      if (window.fb && fb.importMany && u.recs.length > 8) await fb.importMany("rnd", u.recs);
      else for (const o of u.recs) save("rnd", o);
    } catch (e) {
      toast("Some records may not have come back: " + (e && e.message ? e.message : e), "error");
      return;
    }
    toast(`"${u.name}" is back.`);
    return;
  }

  const study = rdStudy(u.study);
  if (study) { study.labelNext = u.prevLabelNext; save("rnd", study, "labelNext"); }
  DB.rnd = rdAll().filter(o => !u.ids.includes(o.id));
  render();
  for (const id of u.ids) { try { await del("rnd", id); } catch (e) { /* reported below */ } }
  toast(`${u.n} coupon${u.n === 1 ? "" : "s"} removed. Bin any labels you printed.`);
}

/* ---------- photos ----------

   Studies AND coupons. The study's are the panel before it was cut, the bag on
   the shelf, the setup on the machine. A coupon's is almost always the FAILURE
   SURFACE, which is the thing that says whether a number is a real result or a
   grip that slipped — the one photograph in coupon testing that is evidence
   rather than a record.

   `projects/` is the storage tree, not a new `rnd/` one. projects.js:1053 makes
   the argument for work orders and it holds here: storage.rules already scopes
   and content-type-limits that tree, and inventing a prefix costs a rules
   deploy — the one thing in this repo that can lock the team out of its own
   data — to gain nothing. The record is roster-gated in Firestore either way. */
function rdAddPhotos(id) {
  if (guestBlocked("add photos")) return;
  if (typeof addRecordFiles !== "function") { toast("Photo upload is unavailable.", "error"); return; }
  addRecordFiles("rnd", id, "projects", "image/*");
}

/* addRecordFiles writes to `files`, which is the shape every other record in
   the app uses; `photos` is what this collection was modelled with. Read both
   so neither an older coupon nor a newly uploaded one goes missing. */
function rdPhotos(rec) {
  return [].concat(rec && rec.photos || [], rec && rec.files || [])
    .filter(p => p && p.url && (!p.type || /^image\//.test(p.type)));
}

/* A coupon's photos in a modal rather than in the grid. The row is already
   carrying the columns somebody came to type into, and a thumbnail strip inside
   a table cell is how a fast grid stops being fast. */
function rdOpenPhotos(id) {
  const r = rdAll().find(o => o.id === id && o.cls === "CPN");
  if (!r) return;
  const s = rdStudyOf(r);
  openModal(`<h2>${esc(r.label || r.id)} <span class="tny muted">${esc(s ? (s.name || "") : "")}</span></h2>
    <p class="tny muted">The failure surface is the useful one — it is what says whether a
    number is a result or a grip that slipped.</p>
    ${rdPhotoStrip(r, canEdit())}
    <div class="foot"><button onclick="closeModal()">Done</button></div>`);
}

function rdPhotoStrip(rec, E) {
  const ph = rdPhotos(rec);
  if (!ph.length && !E) return "";
  return `<div class="rdphotos">
    ${ph.map(p => `<figure class="phtile">
      <img class="phimg" loading="lazy" src="${esc(p.url)}" data-lb-src="${esc(p.url)}"
        data-lb-name="${esc(p.name || "")}" alt="${esc(p.caption || p.name || "photo")}">
      <figcaption class="tny muted">${esc(p.caption || p.name || "")}</figcaption>
    </figure>`).join("")}
    ${E ? `<button class="ib rdphadd" onclick="rdAddPhotos('${esc(rec.id)}')">${icon("image", 15)} Add photo</button>` : ""}
  </div>`;
}

/* ---------- the tab ---------- */

/* THE ROUTER, and the one function in this file that has to be read carefully.

   renderRnd() used to CONSUME view.id — map a deep link to view.rdStudy and
   null the field, because leaving it set re-selected the study every render.
   It cannot any more. view.id IS the bench's selection now, and the real part
   and run detail renderers read it: not once, here, but from dozens of inline
   on* handlers at CLICK time, minutes after this function returned. There is
   no window in which to set it and put it back.

   So this normalises instead of consuming. It decides which pane the id
   belongs to, and only ever rewrites view.id when what is in it is a coupon
   (a row, with no pane of its own) or is gone.

   view.rdPane is DERIVED here on every render and is never the source of
   truth. That is also what makes navBack() work for nothing: navHere() records
   {tab, mode, id}, and restoring that triple rebuilds the pane from the id. */
function rdNormalize() {
  const id = String(view.id || "");
  const pfx = (id.match(/^([A-Z]+)-/) || [])[1];

  /* A coupon opens the sheet it sits in — a coupon on its own is a row with no
     context, and the thing you actually wanted was the study. This is the one
     piece of the old consumption worth keeping. */
  if (pfx === "CPN") {
    const c = rdAll().find(o => o.id === id && o.cls === "CPN");
    const s = c && rdStudy(c.study);
    if (s) { view.rdStudy = s.id; view.id = s.id; view.rdPane = "study"; view.mode = "detail"; return; }
  }
  if (pfx === "RDS" && rdStudy(id)) {
    view.rdStudy = id; view.rdPane = "study"; view.mode = "detail"; return;
  }
  /* mode is tested for a part and a run and NOT for a study, and that asymmetry
     is load-bearing: clearPartSelection() sets mode:"list" and leaves view.id
     alone, so the bench's "All parts" press has to read as "back to the strip".
     It does, for free, by falling through these two lines to the tail. */
  if (view.mode === "detail" && pfx === "P" && typeof partById === "function" && partById(id)) { view.rdPane = "part"; return; }
  if (view.mode === "detail" && pfx === "WO" && typeof woById === "function" && woById(id)) { view.rdPane = "run"; return; }

  /* Land in something. Opening the tab with an index and no sheet is a screen
     asking you to pick before it shows you anything, and the most recently
     worked-on study is nearly always the one you came for. */
  const s = rdStudy(view.rdStudy) || rdDefaultStudy();
  view.rdPane = "study";
  view.rdStudy = s ? s.id : null;
  view.id = s ? s.id : null;
  view.mode = s ? "detail" : "list";
}

/* Extracted from renderRnd so the router and the strip agree on "where do I
   land": the most recently worked-on live Active study, then any live one,
   then anything at all. */
function rdDefaultStudy() {
  const live = rdStudies().filter(s => !isArchived(s));
  return live.filter(s => s.status === "Active")[0] || live[0] || rdStudies()[0] || null;
}

function renderRnd() {
  rdNormalize();
  const sel = rdStudy(view.rdStudy);
  /* The empty state is for an EMPTY BENCH, not for "nothing selected" — it says
     "no studies yet", which would be a lie the moment one existed. */
  return `${rdToolbar(sel)}${rdUndoBar()}${rdIndexHtml(sel)}${sel ? rdSheetHtml(sel) : rdEmptyHtml()}`;
}

function rdToolbar(sel) {
  const studies = rdStudies().length;
  const coupons = rdAll().filter(o => o.cls === "CPN").length;
  return `<div class="toolbar no-print">
    <button class="primary ib"${gx("Sign in to add a study.")} onclick="rdNewStudyModal()">${icon("plus", 15)} New study</button>
    ${sel && !sel.parent ? `<button class="ib"${gx("Sign in to add a batch.")} onclick="rdNewStudyModal('${esc(sel.id)}')">${icon("plus", 15)} New batch</button>` : ""}
    <span class="tny muted">${coupons} coupon${coupons === 1 ? "" : "s"} · ${studies} stud${studies === 1 ? "y" : "ies"}</span>
    <span style="flex:1"></span>
    ${sel && !sel.parent && canEdit() ? `<button class="sm" onclick="rdArchiveStudy('${esc(sel.id)}',${isArchived(sel) ? "false" : "true"})">${isArchived(sel) ? "Restore" : "Archive"} study</button>` : ""}
    ${!sel ? ""
      : rdIsParent(sel)
        /* A project holds batches, and a coupon belongs in one of them. Offering
           Add rows here would mint coupons that sit beside the batches rather
           than in any of them — a provenance hole with no way to close it
           afterwards. Say where they go instead. */
        ? `<span class="tny muted">Coupons go in a batch — open one to add rows.</span>`
        : `<label class="tny muted" for="rd-n">Rows</label>
      <input id="rd-n" class="rdn" type="number" min="1" max="${RD_MAX_ROWS}" value="10" aria-label="How many coupons to add">
      <button class="ib"${gx("Sign in to add coupons.")} onclick="rdAddRows()">${icon("plus", 15)} Add rows</button>`}
  </div>`;
}

/* The empty state says what the thing IS, in the shop's own words, and offers
   exactly one button. It does not ask which kind of study you want — the whole
   point of one record shape is that the question never has to be asked. */
function rdEmptyHtml() {
  return `<div class="card rdempty">
    <h3>No studies yet</h3>
    <p>A study is a named set of coupons — a flat-panel cure sweep, a bond-shear
    trial, a box of offcuts you want to keep track of. Make one, press
    <b>Add rows</b>, and type into the grid. No work order, no traveler.</p>
    <p class="tny muted">Add columns for whatever this test measures. Mark one a
    setting you chose and another something you measured, and the compare view
    turns itself on.</p>
    <button class="primary ib"${gx("Sign in to add a study.")} onclick="rdNewStudyModal()">${icon("plus", 15)} New study</button>
  </div>`;
}

function rdStudyRow(s, isChild) {
  const n = isChild ? rdCoupons(s.id).length : rdCouponsDeep(s.id).length;
  const cols = rdCols(s);
  const ins = cols.filter(c => c.role === "input").length;
  const res = cols.filter(c => c.role === "result").length;
  const on = view.rdStudy === s.id;
  return `<div class="rdrow${isChild ? " rdchild" : ""}${on ? " on" : ""}${pickIs("rnd", s.id) ? " picked" : ""}">
    ${pickBox("rnd", s.id)}<button class="rd-open" onclick="${pickClick("rnd", s.id, `rdOpen('${esc(s.id)}')`)}">${esc(s.name || s.id)}</button>
    <span class="tny muted">${n} coupon${n === 1 ? "" : "s"}</span>
    <span class="stage ${s.status === "Done" ? "st-done" : s.status === "Parked" ? "st-na" : "st-mid"}">${esc(s.status || "Active")}</span>${archivedPill(s, true)}
    <span class="tny muted">${ins || res ? `${ins} in · ${res} result` : ""}</span>
  </div>`;
}

function rdIndexHtml(sel) {
  const all = rdRoots();
  if (!all.length) return "";
  /* Archived studies (and their batches) leave the index, not the database;
     the open study stays listed so archiving it does not blank the sheet. */
  const arch = all.filter(isArchived).length;
  const roots = all.filter(r => view.rdArch ? isArchived(r) : (!isArchived(r) || (sel && sel.id === r.id)));
  const shown = roots.map(r => r.id).concat(roots.flatMap(r => rdChildren(r.id).map(c => c.id)));
  return `<div class="card rdindex no-print">
    ${canEdit() ? `<div class="toolbar rdpick">${pickBar("rnd", { all: shown, onDelete: "deletePickedStudies()", hint: "Select several studies to delete them, coupons included" })}</div>` : ""}
    ${roots.map(r => rdStudyRow(r, false) + rdChildren(r.id).map(c => rdStudyRow(c, true)).join("")).join("")}
    ${arch ? `<label class="tny muted rdarch"><input type="checkbox" ${view.rdArch ? "checked" : ""} onchange="view.rdArch=this.checked;render()"> ${arch} archived stud${arch === 1 ? "y" : "ies"}</label>` : ""}
    ${rdPartsHtml()}
  </div>`;
}
/* Several studies from the index's Select…. Unlike rdDelStudy, a picked
   project takes its batches with it (the single delete refuses, because one
   press should not be three rounds of work; picking them together is that
   decision made out loud). Coupons go with their studies, and the whole set
   is snapshotted for the undo bar, same as one study. Open to every member,
   like the rest of the bench. */
function rdBulkDeleteStudies(ids) {
  if (guestBlocked("delete studies")) return;
  const set = new Set(ids || []);
  const studies = rdStudies().filter(s => set.has(s.id));
  if (!studies.length) { toast("Nothing selected.", "info"); return; }
  const withKids = new Map(studies.map(s => [s.id, s]));
  studies.forEach(s => rdChildren(s.id).forEach(c => withKids.set(c.id, c)));
  const all = [...withKids.values()];
  const coupons = all.flatMap(s => rdCoupons(s.id));
  const gone = all.concat(coupons);
  const what = studies.length === 1 ? `"${studies[0].name || studies[0].id}"` : plural(studies.length, "study", "studies");
  const extra = [];
  if (all.length > studies.length) extra.push(plural(all.length - studies.length, "batch", "batches"));
  if (coupons.length) extra.push(plural(coupons.length, "coupon"));
  bulkDeleteRecords({
    message: `Delete ${what}${extra.length ? ` and ${extra.join(" and ")}` : ""}? ${coupons.length ? "Their measurements go with them. " : ""}Undo is offered for a moment afterwards.`,
    items: gone.map(o => ({ coll: "rnd", id: o.id })),
    done: `${what} deleted`,
    after: () => {
      RD_UNDO = { kind: "delete", recs: JSON.parse(JSON.stringify(gone)), n: coupons.length, name: studies.length === 1 ? (studies[0].name || studies[0].id) : plural(studies.length, "study", "studies") };
      const ids = new Set(gone.map(o => o.id));
      DB.rnd = rdAll().filter(o => !ids.has(o.id));
      if (ids.has(view.rdStudy)) view.rdStudy = null;
      if (ids.has(view.id)) view.id = null;
    },
  });
}
function deletePickedStudies() { rdBulkDeleteStudies(pickedIds("rnd")); }

/* A study is archived as a whole: the batches under it follow the root, so a
   parked project does not leave stray batches in the index. */
function rdArchiveStudy(id, on) {
  const s = rdStudy(id);
  if (!s) return;
  const ids = [id].concat(rdChildren(id).map(c => c.id));
  const n = setArchived("rnd", ids, on);
  if (n) toast(`${s.name || s.id} ${on ? "archived" : "restored"}.`);
  render();
}

/* The read-only cross-reference to R&D PARTS.

   Two different things share the word "R&D" in this app and both are
   legitimate: a part flagged rnd:true is a real part with a full traveler that
   is simply not a season deliverable, and a coupon is a test piece with no
   traveler at all. This tab is the one place to look, so it names them — but it
   does not own them, which is why every row leaves for the Parts tab and why
   the note says so out loud rather than letting somebody try to add a coupon
   here. Derived live from DB.parts, never copied.

   The Parts rail keeps its own R&D chip. That is how you filter while you are
   already over there, and it is unchanged by any of this. */
function rdPartsHtml() {
  const parts = (DB.parts || []).filter(isRnd).sort((a, b) => cmpId(a.id, b.id));
  if (!parts.length) return "";
  /* A CLASS-DRIVEN FOLD, never <details>. conventions.md is explicit: a closed
     <details> skips painting and vanishes from print, and the one exception in
     the app is .wo-subfold. Same shape as .wosec.folded — a real <button>
     toggling a class on the container. */
  const open = !!view.rdPartsOpen;
  return `<div class="rdparts${open ? "" : " folded"}">
    <button class="rdparts-hd" aria-expanded="${open}"
      onclick="view.rdPartsOpen=!view.rdPartsOpen;render()">
      ${icon(open ? "chevronDown" : "chevronRight", 14)} R&amp;D parts (${parts.length})</button>
    <div class="rdparts-body">
      <p class="tny muted">Real parts with real travelers that are not season
      deliverables — a mold shakedown keeps every blocker and every cure hold.
      They live on the Parts tab and are only listed here.</p>
      ${parts.map(p => `<div class="rdrow">
        <button class="rd-open" onclick="openRecord('parts','${esc(p.id)}')">${esc(p.partName || p.id)} ${icon("externalLink", 12)}</button>
        <span class="tny muted">${esc(p.id)}</span>
        <span class="tny muted">${esc(p.subteam || "")}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

/* Selects; it does not toggle. renderRnd re-selects the moment nothing is
   chosen, so a toggle would close a study and reopen it in the same frame —
   and "close this study" is not a thing anybody needs, because the way out of
   a study is another study. */
function rdOpen(id) {
  if (!rdStudy(id)) return;
  view = { ...view, rdStudy: id, rdPane: "study", mode: "detail", id, edit: false };
  render(); syncUrl();
}

/* ---------- the sheet ---------- */

function rdSheetHtml(s) {
  const parent = s.parent ? rdStudy(s.parent) : null;
  const rows = rdSheetRows(s);
  const cols = rdCols(s);
  return `<div class="card rdsheet">
    <div class="rdhead">
      <h2>${esc(s.name || s.id)}</h2>
      <span class="tny muted">${esc(s.id)}</span>
      ${parent ? `<span class="tny muted">in <button class="rd-open tny" onclick="rdOpen('${esc(parent.id)}')">${esc(parent.name || parent.id)}</button></span>` : ""}
      <span style="flex:1"></span>
      ${canEdit() ? `<select class="rdstat" aria-label="Study status" onchange="rdStudyUpd('${esc(s.id)}','status',this.value)">
        ${RD_STUDY_STATUS.map(v => `<option ${v === (s.status || "Active") ? "selected" : ""}>${v}</option>`).join("")}
      </select>` : `<span class="stage ${s.status === "Done" ? "st-done" : s.status === "Parked" ? "st-na" : "st-mid"}">${esc(s.status || "Active")}</span>`}
    </div>
    ${s.question ? `<p class="rdq">${esc(s.question)}</p>` : ""}
    ${/* The study's own actions, in one row under its head rather than scattered
          through the page. Ordered by how often they are reached for: label the
          bag and the coupons, get the data out, then the two that change or end
          the study. Delete is last and is the only one wearing `danger`. */""}
    <div class="toolbar rdacts no-print">
      <button class="ib" onclick="printOneLabel('rnd','${esc(s.id)}')" title="A 4x1 label for the bag or tray this study lives in">${icon("print", 15)} Study label</button>
      <button class="ib" onclick="rdPrintCouponLabels('${esc(s.id)}')" title="One label per coupon, on a single sheet">${icon("print", 15)} Coupon labels</button>
      <button class="ib" onclick="rdPrintReport('${esc(s.id)}')" title="A printable one-page report: the table, the comparison and the photos">${icon("file", 15)} Report</button>
      <button class="ib" onclick="rdExportCSV('${esc(s.id)}')" title="One row per coupon, every column">${icon("download", 15)} CSV</button>
      <button class="ib" onclick="rdCopyTSV('${esc(s.id)}')" title="Paste straight into a Google Sheet — works on a phone, where a download often does nothing">${icon("file", 15)} Copy</button>
      <span style="flex:1"></span>
      <button class="ib"${gx("Sign in to duplicate a study.")} onclick="rdDuplicateStudy('${esc(s.id)}')" title="Same columns and materials, no coupons — for the next round">Duplicate</button>
      <button class="ib danger"${gx("Sign in to delete a study.")} onclick="rdDelStudy('${esc(s.id)}')">${icon("trash", 15)} Delete study</button>
    </div>
    ${rdPhotoStrip(s, canEdit())}
    ${rdMatBar(s)}
    ${rdColBar(s, cols)}
    ${rows.length ? rdGridHtml(s, cols, rows)
      : rdIsParent(s)
        ? `<p class="tny muted rdnorows">No coupons in any batch yet. Open a batch and press <b>Add rows</b>.</p>`
        : `<p class="tny muted rdnorows">No coupons yet. Set <b>Rows</b> above and press <b>Add rows</b>.</p>`}
    ${rdCompareHtml(s, cols, rows)}
  </div>`;
}

/* A study-level write. Safe to render() from — it is a study field, not a grid
   cell, so nothing is mid-Tab. */
function rdStudyUpd(id, key, val) {
  const s = rdStudy(id);
  if (!s || guestBlocked("edit this study")) return;
  s[key] = val;
  save("rnd", s, key);
  render();
}

/* ---------- materials ----------

   DECLARED ONCE, ON THE STUDY, and inherited by every coupon in it. Ten coupons
   were laid up from one roll and one jug on one afternoon; asking ten times is
   exactly the friction that sends somebody back to the spreadsheet.

   The field names are the ones an items/PNL test panel already uses, so a
   coupon and a panel describe their materials identically and labelLines needs
   no second vocabulary. Nothing is decremented — the app has never tracked
   quantities, only containers — so this is a POINTER to the lot record, which
   is what makes "which roll went into this" answerable at all.

   THIS UI IS WHY THE MODEL IS WORTH HAVING. Round one shipped rdEff, RD_INHERITS
   and `defaults` with no way to set them, so labels printed a blank resin and
   the export resolved an inheritance nobody could establish. A model with no
   way in is not a feature. */
function rdMatBar(s) {
  const open = view.rdMatOpen === s.id;
  const E = canEdit();
  const d = s.defaults || {};
  const parent = s.parent ? rdStudy(s.parent) : null;
  const pd = parent && parent.defaults ? parent.defaults : {};

  const ro = v => `<div class="ro">${esc(v == null ? "" : String(v))}</div>`;
  const fld = (key, label, kind) => {
    const own = d[key];
    const inherited = (own === undefined || own === null || own === "") && pd[key];
    const shown = inherited ? pd[key] : (own ?? "");
    const hint = inherited ? ` <span class="tny muted rd-inh" title="From ${esc(parent.name || parent.id)}">inherited</span>` : "";
    let ctl;
    if (!E) ctl = ro(shown);
    else if (kind === "FAB" || kind === "RSN") {
      const opts = typeof shopRefOptions === "function" ? shopRefOptions(kind, own || "") : [];
      ctl = `<select onchange="rdDefUpd('${esc(s.id)}','${esc(key)}',this.value)">
        <option value="">${inherited ? "— inherited —" : "—"}</option>${opts.join("")}</select>`;
    } else if (kind === "src") {
      const vals = ["", "scanned", "inferred", "recalled", "partial", "unknown"];
      ctl = `<select onchange="rdDefUpd('${esc(s.id)}','${esc(key)}',this.value)">${
        vals.map(v => `<option value="${esc(v)}" ${v === (own || "") ? "selected" : ""}>${v || "—"}</option>`).join("")}</select>`;
    } else {
      ctl = `<input ${kind === "date" ? 'type="date"' : ""} value="${esc(own ?? "")}"
        placeholder="${inherited ? esc(String(pd[key])) : ""}"
        onchange="rdDefUpd('${esc(s.id)}','${esc(key)}',this.value)">`;
    }
    return `<label class="f"><span>${esc(label)}${hint}</span>${ctl}</label>`;
  };

  /* The one-line summary on the closed fold, because "what went into this" is
     read far more often than it is set. */
  const sum = RD_INHERITS.map(k => {
    const v = d[k] ?? pd[k];
    return v ? esc(String(v)) : "";
  }).filter(Boolean).slice(0, 4).join(" · ");

  return `<div class="rdmat${open ? "" : " folded"}">
    <button class="rdparts-hd" aria-expanded="${open}"
      onclick="view.rdMatOpen = view.rdMatOpen === '${esc(s.id)}' ? null : '${esc(s.id)}'; render()">
      ${icon(open ? "chevronDown" : "chevronRight", 14)} Materials${sum ? ` · <span class="rdmatsum">${sum}</span>` : ""}</button>
    <div class="rdmat-body">
      <p class="tny muted">Set once here; every coupon in this study inherits it.
      A coupon that was different can say so on its own row — clearing that cell
      hands it back to the study.</p>
      <div class="grid">
        ${fld("stack", "Layup stack", "text")}
        ${fld("fabricLots", "Fabric lot", "FAB")}
        ${fld("resinLot", "Resin lot", "RSN")}
        ${fld("hardenerLot", "Hardener lot", "RSN")}
        ${fld("lotSource", "Lot record", "src")}
        ${fld("laidOn", "Laid up on", "date")}
        ${fld("by", "Laid up by", "text")}
      </div>
    </div>
  </div>`;
}

/* A study-level write, so render() is safe — nothing here is a grid cell being
   Tab-ed out of. Clearing a field DELETES it rather than storing "", which is
   what lets a batch fall back to its project. */
function rdDefUpd(id, key, val) {
  const s = rdStudy(id);
  if (!s || guestBlocked("set the materials")) return;
  s.defaults = { ...(s.defaults || {}) };
  if (String(val || "").trim() === "") delete s.defaults[key];
  else s.defaults[key] = val;
  save("rnd", s, "defaults");
  render();
}

/* ---------- columns ---------- */

function rdColBar(s, cols) {
  const open = view.rdColsOpen === s.id;
  const own = (s.cols || []).filter(c => !c.hidden);
  const inherited = cols.length - own.length;
  return `<div class="rdcols${open ? "" : " folded"} no-print">
    <button class="rdparts-hd" aria-expanded="${open}"
      onclick="view.rdColsOpen = view.rdColsOpen === '${esc(s.id)}' ? null : '${esc(s.id)}'; render()">
      ${icon(open ? "chevronDown" : "chevronRight", 14)} Columns (${cols.length})${inherited ? ` · ${inherited} from the project` : ""}</button>
    <div class="rdcols-body">
      <p class="tny muted">Mark a column <b>input</b> if it is a setting you chose,
      <b>result</b> if it is something you measured. One of each turns on Compare.</p>
      ${own.map(c => `<div class="rdcol">
        <b>${esc(c.name)}</b>
        <span class="tpill">${esc(c.role)}</span>
        <span class="tny muted">${esc(c.type)}${c.unit ? " · " + esc(c.unit) : ""}</span>
        <span style="flex:1"></span>
        <button class="ib"${gx("Sign in to edit columns.")} onclick="rdHideCol('${esc(s.id)}','${esc(c.cid)}')" title="Retire this column — the values already measured into it are kept">Retire</button>
      </div>`).join("")}
      ${own.length >= RD_MAX_COLS
        ? `<p class="tny muted">That is ${RD_MAX_COLS} columns, which is as wide as the grid goes without hiding the ones you came to fill in. The ninth column is a second study.</p>`
        : `<div class="rdcol rdcolnew">
        <input id="rd-cname" placeholder="Column name" list="rd-cnames" aria-label="Column name">
        <datalist id="rd-cnames">${rdColNameSuggestions().map(n => `<option value="${esc(n)}"></option>`).join("")}</datalist>
        <select id="rd-crole" aria-label="Role">${RD_COL_ROLES.map(r => `<option value="${r}">${r}</option>`).join("")}</select>
        <select id="rd-ctype" aria-label="Type">${RD_COL_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
        <input id="rd-cunit" class="rdunit" placeholder="unit" aria-label="Unit">
        <button class="primary ib"${gx("Sign in to add a column.")} onclick="rdAddCol('${esc(s.id)}')">Add column</button>
      </div>`}
    </div>
  </div>`;
}

/* Every column name already used anywhere on the bench, offered as a datalist.

   One line, and it is the difference between a compare view that can eventually
   work across studies and one that never can: left alone, people type
   "thickness" in one study, "Thickness" in the next and "thk" in the third, and
   no machine can merge those back. The same lesson matKey learned on lots. */
function rdColNameSuggestions() {
  const seen = new Set();
  for (const s of rdStudies()) for (const c of s.cols || []) if (c.name) seen.add(c.name);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

function rdAddCol(studyId) {
  const s = rdStudy(studyId);
  if (!s || guestBlocked("add a column")) return;
  const name = String((document.getElementById("rd-cname") || {}).value || "").trim();
  const role = String((document.getElementById("rd-crole") || {}).value || "input");
  const type = String((document.getElementById("rd-ctype") || {}).value || "num");
  const unit = String((document.getElementById("rd-cunit") || {}).value || "").trim();
  if (!name) { toast("A column needs a name.", "error"); return; }
  const own = (s.cols || []).filter(c => !c.hidden);
  if (own.length >= RD_MAX_COLS) { toast(`${RD_MAX_COLS} columns is the limit — the ninth is a second study.`, "error"); return; }
  if (own.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast("This study already has a column with that name.", "error"); return; }
  /* Keyed by a MINTED cid, never by the name: renaming a column must not orphan
     the values measured into it, and two columns can be named the same by
     accident. bomLineId is the app's existing row-id generator. */
  s.cols = (s.cols || []).concat([{ cid: bomLineId(), name, role, type, unit, hidden: false }]);
  save("rnd", s, "cols");
  render();
}

/* Retire, never delete. The values stay on their coupons — a measurement is
   evidence, and a column somebody stopped caring about is not a reason to
   destroy what was recorded through it. */
function rdHideCol(studyId, cid) {
  const s = rdStudy(studyId);
  if (!s || guestBlocked("edit columns")) return;
  const c = (s.cols || []).find(x => x.cid === cid);
  if (!c) return;
  c.hidden = true;
  save("rnd", s, "cols");
  render();
}

/* ---------- the grid ----------

   table.sub with table-layout: fixed, which is receiving's shape and the only
   one that handles a DYNAMIC column set for free: each cell carries an
   rdc-<key> class, so the spine gets fixed widths and the user columns share
   what is left. Season's ".shead and .sline share ONE declaration of the
   tracks" idiom cannot be used here — the tracks are not knowable when the CSS
   is written, and computing grid-template-columns into the markup would put a
   layout literal in the HTML.

   The Season DISCIPLINE still applies and is what the widths below encode:
   exactly one column may shrink to nothing (notes), the label never does, and
   nothing scrolls sideways.

   WHY `by` AND `laidOn` ARE NOT COLUMNS. They are on the study instead, as
   defaults every coupon inherits. At a bench the whole batch was laid up by the
   same person on the same day; making that two more cells to fill ten times
   over is exactly the friction that sends people back to the spreadsheet. A
   coupon can still carry its own — rdEff resolves it — there is just no reason
   to spend two columns asking. */
function rdGridHtml(s, cols, rows) {
  /* A rolled-up project has to say which batch each row came from, or two
     coupons labelled A01 and B01 from different batches read as one list with
     no provenance. A batch's own sheet does not need the column. */
  const roll = rdIsParent(s);
  return `<div class="rdgridwrap">
  <table class="sub rdgrid">
    <thead><tr>
      <th class="rdc-label">Label</th>
      ${roll ? `<th class="rdc-batch">Batch</th>` : ""}
      <th class="rdc-status">Status</th>
      ${cols.map(c => `<th class="rdc-user rdc-${c.role}">${esc(c.name)}${c.unit ? ` <span class="tny muted">${esc(c.unit)}</span>` : ""}</th>`).join("")}
      <th class="rdc-notes">Notes</th>
      <th class="rdc-act" aria-label="Row actions"></th>
    </tr></thead>
    <tbody>${rows.map(r => rdRowHtml(s, cols, r, roll)).join("")}</tbody>
  </table></div>`;
}

function rdRowHtml(s, cols, r, roll) {
  const E = canEdit();
  const ro = v => `<div class="ro">${esc(v == null ? "" : String(v))}</div>`;
  const own = roll ? rdStudy(r.study) : null;
  return `<tr data-rd="${esc(r.id)}">
    <td class="rdc-label" data-label="Label"><b>${esc(r.label || r.id)}</b></td>
    ${roll ? `<td class="rdc-batch" data-label="Batch">${own
      ? `<button class="rd-open tny" onclick="rdOpen('${esc(own.id)}')">${esc(own.name || own.id)}</button>` : ""}</td>` : ""}
    <td class="rdc-status" data-label="Status">${E
      ? `<select data-cell="status" onchange="rdUpd('${esc(r.id)}','status',this.value)">
          ${RD_STATUS.map(v => `<option ${v === (r.status || "Planned") ? "selected" : ""}>${v}</option>`).join("")}
        </select>`
      : ro(r.status || "Planned")}</td>
    ${cols.map(c => `<td class="rdc-user rdc-${c.role}" data-label="${esc(c.name)}">${
      rdCell(r, c, E)}</td>`).join("")}
    <td class="rdc-notes" data-label="Notes">${E
      ? `<input data-cell="notes" value="${esc(r.notes || "")}" onchange="rdUpd('${esc(r.id)}','notes',this.value)" onpaste="rdPaste(event,'${esc(r.id)}',null)">`
      : ro(r.notes)}</td>
    ${/* Three per-coupon actions, and they earn the width: a label for the
          specimen, its photos (the failure surface is the evidence a number is
          real), and delete. The photo button carries its count, so a coupon
          that has one is visible without opening anything. */""}
    <td class="rdc-act">${(() => {
      const nph = rdPhotos(r).length;
      return `<button class="ib rowact" title="Print a label for this coupon" onclick="printOneLabel('rnd','${esc(r.id)}')">${icon("print", 13)}</button>
      ${E || nph ? `<button class="ib rowact${nph ? " has" : ""}" title="${nph ? nph + " photo" + (nph === 1 ? "" : "s") : "Add a photo — the failure surface, usually"}" onclick="rdOpenPhotos('${esc(r.id)}')">${icon("image", 13)}${nph ? `<span class="rdphn">${nph}</span>` : ""}</button>` : ""}
      ${E ? `<button class="ib rowact" title="Delete this coupon" onclick="rdDelCoupon('${esc(r.id)}')">${icon("x", 13)}</button>` : ""}`;
    })()}</td>
  </tr>`;
}

function rdCell(r, c, E) {
  const v = (r.vals || {})[c.cid];
  const val = v == null ? "" : String(v);
  /* THE GUEST CASCADE DOES NOT REACH THIS TAB. render() turns ~130 inputs into
     text by clearing view.edit, but this grid has no Edit button and is always
     "editing", so read-only has to be handled right here. Everywhere else in
     the app this is free; here it is not. */
  if (!E) return `<div class="ro">${esc(val)}</div>`;
  const on = `onchange="rdVal('${esc(r.id)}','${esc(c.cid)}',this.value)" onpaste="rdPaste(event,'${esc(r.id)}','${esc(c.cid)}')"`;
  if (c.type === "select") {
    return `<select data-cell="${esc(c.cid)}" ${on}><option value=""></option>${
      (c.opts || []).map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  }
  const type = c.type === "num" ? "number" : c.type === "date" ? "date" : "text";
  return `<input data-cell="${esc(c.cid)}" type="${type}" ${c.type === "num" ? 'step="any" inputmode="decimal"' : ""} value="${esc(val)}" ${on}>`;
}

/* ---------- writing a cell ----------

   A CELL EDIT NEVER CALLS render(). onchange fires while Tab is already
   carrying focus to the next cell, and a repaint destroys the field mid-hop —
   the one hard-won invariant the receiving desk is built on. Only a change to
   the SHAPE of the grid (a column added or retired) may repaint, and that goes
   through render() from the column bar where nothing is mid-Tab.

   These records are live, unlike receiving's staged sheet, because a coupon has
   to be labelable and scannable the moment it exists, and because results
   arrive over a week rather than in one sitting. So each edit is one field
   write — which is exactly what save()'s `field` argument is for, and what lets
   two people fill different columns of the same study at once. */
function rdUpd(id, key, val) {
  const r = rdAll().find(o => o.id === id && o.cls === "CPN");
  if (!r || guestBlocked("edit this coupon")) return;
  r[key] = val;
  save("rnd", r, key);
}

function rdVal(id, cid, val) {
  const r = rdAll().find(o => o.id === id && o.cls === "CPN");
  if (!r || guestBlocked("edit this coupon")) return;
  const s = rdStudyOf(r);
  const col = rdCols(s).find(c => c.cid === cid);
  const txt = String(val == null ? "" : val).trim();
  /* Refuse rather than silently parse. "2.1mm" in a numeric cell becomes 2.1 if
     you let parseFloat have it, and a number that quietly dropped its unit is
     worse than a rejected keystroke — updShop's `num` path took the same view,
     and the unit is already printed in the header so there is nothing to type. */
  if (col && col.type === "num" && txt !== "" && !Number.isFinite(Number(txt))) {
    toast(`"${txt}" is not a number. ${col.unit ? "The unit (" + col.unit + ") is in the header — just the number here." : "Just the number here."}`, "error");
    return;
  }
  r.vals = { ...(r.vals || {}) };
  if (txt === "") delete r.vals[cid]; else r.vals[cid] = col && col.type === "num" ? Number(txt) : txt;
  save("rnd", r, "vals");
}

function rdDelCoupon(id) {
  const r = rdAll().find(o => o.id === id && o.cls === "CPN");
  if (!r || guestBlocked("delete a coupon")) return;
  confirmModal(`Delete ${r.label || r.id}? Its measurements go with it.`, async () => {
    DB.rnd = rdAll().filter(o => o.id !== id);
    render();
    try { await del("rnd", id); } catch (e) { toast("Could not delete: " + (e && e.message ? e.message : e), "error"); }
  }, { ok: "Delete", danger: true });
}

/* ---------- paste ----------

   IT FILLS A COLUMN; IT DOES NOT CREATE ROWS. Ten Instron readings pasted into
   the first of ten existing rows land in those ten rows. An overrun stops and
   says so rather than minting coupons — unlike the receiving desk there is no
   commit step to catch a mis-paste here, and every created row burns an id.

   This is a PREFILL, never a mode: delete this handler and every cell still
   works by hand. It is also the single most likely thing to send somebody back
   to a spreadsheet, which is why the toast names the overrun exactly. */
function rdPaste(e, id, cid) {
  const txt = (e.clipboardData || window.clipboardData || {}).getData
    ? (e.clipboardData || window.clipboardData).getData("text") : "";
  if (!txt || !/[\r\n\t]/.test(txt)) return;          // a single value is an ordinary paste
  const vals = txt.split(/\r?\n/).map(v => v.split("\t")[0].trim()).filter((v, i, a) => !(v === "" && i === a.length - 1));
  if (vals.length < 2) return;
  e.preventDefault();
  const s = rdStudy(view.rdStudy);
  /* The rows ON SCREEN, which on a rolled-up project spans its batches — fill
     down has to follow what you can see, not what the study owns directly. */
  const rows = rdSheetRows(s);
  const start = rows.findIndex(r => r.id === id);
  if (start < 0) return;
  const room = rows.length - start;
  const used = Math.min(room, vals.length);
  for (let i = 0; i < used; i++) {
    if (cid) rdVal(rows[start + i].id, cid, vals[i]);
    else rdUpd(rows[start + i].id, "notes", vals[i]);
  }
  /* A shape change, not a cell edit — the values just written are not on screen
     until this repaint, and nothing is mid-Tab because the paste ended the
     interaction. */
  render();
  if (vals.length > used) {
    toast(`Filled ${used} of ${vals.length} — ${vals.length - used} value${vals.length - used === 1 ? " had" : "s had"} nowhere to go. Add rows first.`, "error");
  } else {
    toast(`Filled ${used} row${used === 1 ? "" : "s"}.`);
  }
}

/* ---------- compare ----------

   Only when the study has something to compare: at least one input column, one
   result column, and three coupons carrying values. A button that is always
   there is a button that usually disappoints.

   Deliberately NOT a chart. At a bench you read the numbers off; the app has no
   chart vocabulary and adding one commits the design system to a family it does
   not have. Anything more serious than this belongs in a real analysis tool,
   with the CSV. */
function rdCompareHtml(s, cols, rows) {
  const ins = cols.filter(c => c.role === "input");
  const res = cols.filter(c => c.role === "result");
  if (!ins.length || !res.length) return "";
  const live = rows.filter(r => view.rdCmpScrap ? true : r.status !== "Scrapped");
  if (live.length < 3) return "";
  const open = view.rdCmpOpen === s.id;
  const by = ins.find(c => c.cid === view.rdCmpBy) || ins[0];

  return `<div class="rdcmp${open ? "" : " folded"}">
    <button class="rdparts-hd" aria-expanded="${open}"
      onclick="view.rdCmpOpen = view.rdCmpOpen === '${esc(s.id)}' ? null : '${esc(s.id)}'; render()">
      ${icon(open ? "chevronDown" : "chevronRight", 14)} Compare</button>
    <div class="rdcmp-body">
      <div class="toolbar no-print">
        <label class="tny muted" for="rd-cmpby">Group by</label>
        <select id="rd-cmpby" onchange="view.rdCmpBy=this.value;render()">
          ${ins.map(c => `<option value="${esc(c.cid)}" ${c.cid === by.cid ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
        <label class="tny muted"><input type="checkbox" ${view.rdCmpScrap ? "checked" : ""}
          onchange="view.rdCmpScrap=this.checked;render()"> include scrapped</label>
      </div>
      ${rdCompareTableHtml(s, cols, rows)}
    </div>
  </div>`;
}

/* The compare TABLE on its own, so the printed report and the on-screen fold
   are the same numbers from the same code. A report that recomputed its own
   averages is a report that can disagree with the screen it was printed from,
   which is worse than having no report. */
function rdCompareTableHtml(s, cols, rows) {
  const ins = cols.filter(c => c.role === "input");
  const res = cols.filter(c => c.role === "result");
  if (!ins.length || !res.length) return "";
  const live = rows.filter(r => view.rdCmpScrap ? true : r.status !== "Scrapped");
  if (live.length < 3) return "";
  const by = ins.find(c => c.cid === view.rdCmpBy) || ins[0];

  const groups = new Map();
  for (const r of live) {
    const k = (r.vals || {})[by.cid];
    const key = k == null || k === "" ? "—" : String(k);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  /* Numeric group values sort NUMERICALLY. 120/140/160 read as 120/160/140
     under a string sort, which makes a sweep look unordered. */
  const keys = [...groups.keys()].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });

  const cell = (list, c) => {
    const nums = list.map(r => (r.vals || {})[c.cid]).filter(v => v !== undefined && v !== "" && Number.isFinite(Number(v))).map(Number);
    if (!nums.length) {
      const txt = list.map(r => (r.vals || {})[c.cid]).filter(v => v !== undefined && v !== "");
      return txt.length ? `<span class="tny muted">${txt.length} recorded</span>` : "";
    }
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const lo = Math.min(...nums), hi = Math.max(...nums);
    /* THE MEAN CARRIES THE DECIMALS ITS INPUTS HAD, no more. A fixed 2 turns
       eight whole-Newton readings into "619.00 N", which claims a hundredth of
       a Newton nobody measured — the same species of false confidence as
       averaging over blanks. Capped at 3 so a stray long float cannot widen
       the column. */
    const dp = Math.min(3, Math.max(...nums.map(n => {
      const t = String(n); const i = t.indexOf(".");
      return i < 0 ? 0 : t.length - i - 1;
    })));
    return `${mean.toFixed(dp)} <span class="tny muted">${lo === hi ? "" : lo + "–" + hi}</span>`;
  };
  /* Coverage rides WITH the number, never silently. Averaging over the coupons
     that happen to have a value and reporting it as the study's result is how a
     test lies. */
  const coverage = res.map(c => {
    const n = live.filter(r => { const v = (r.vals || {})[c.cid]; return v !== undefined && v !== ""; }).length;
    return `${esc(c.name)}: ${n} of ${live.length}`;
  }).join(" · ");

  return `<table class="sub rdcmptable">
      <thead><tr><th>${esc(by.name)}</th><th>n</th>${res.map(c => `<th>${esc(c.name)}${c.unit ? ` <span class="tny muted">${esc(c.unit)}</span>` : ""}</th>`).join("")}</tr></thead>
      <tbody>${keys.map(k => `<tr>
        <td data-label="${esc(by.name)}"><b>${esc(k)}</b></td>
        <td data-label="n">${groups.get(k).length}</td>
        ${res.map(c => `<td data-label="${esc(c.name)}">${cell(groups.get(k), c)}</td>`).join("")}
      </tr>`).join("")}</tbody>
    </table>
    <p class="tny muted">${coverage}. Blanks are left out of the averages.</p>`;
}
