"use strict";
/* reports.js — the Reports tab.
   CSV exports per dataset (for spreadsheets / advisor updates) and a printable
   Monday-meeting status board. Read-only; builds from the in-memory data. */

function toCSV(rows, cols) {
  const esc = v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(c => esc(c.label)).join(",")]
    .concat(rows.map(r => cols.map(c => esc(c.get(r))).join(",")))
    .join("\n");
}
function downloadCSV(name, csv) {
  downloadBlob(name, new Blob([csv], { type: "text/csv" }));
}
/* R&D is a COLUMN here and never a filter. The advisor export is the full
   picture, and the question it has to be able to answer — how much of this was
   trials rather than the car — is unanswerable if the trials are missing
   instead of marked. Same reasoning as budget's two money columns below. */
const CSV_SPECS = {
  parts: { file: "parts", rows: () => DB.parts, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["layupType", r => r.layupType], ["cad", r => r.cadProgress], ["mold", r => r.moldProgress], ["layup", r => r.layupProgress], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["weightG", r => r.weightG], ["deadline", r => r.layupDeadline], ["rnd", r => isRnd(r) ? "R&D" : ""]] },
  workOrders: { file: "work-orders", rows: () => DB.workOrders, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["process", r => r.processType], ["status", r => r.status], ["moldEngineer", r => r.moldEngineer], ["mfgEngineer", r => r.manufacturingEngineer], ["due", r => r.dueDate], ["rnd", r => woIsRnd(r) ? "R&D" : ""]] },
  projects: { file: "issues", rows: () => DB.projects.filter(isIssue), cols: [["id", r => r.id], ["title", r => r.title], ["status", r => projStatus(r)], ["workOrder", r => r.workOrderId], ["resolution", r => r.resolutionMethod], ["priority", r => r.priority], ["due", r => r.dueDate], ["assignees", r => (r.assignees || []).join("; ")]] },
  budget: { file: "budget", rows: () => DB.budget, cols: [["id", r => r.id], ["item", r => r.item], ["purchaser", r => r.purchaser], ["purpose", r => r.purpose],
    // Two status columns, because there are two tracks: where the goods are and
    // where the money is. chargedTo is blank for composites' own spend, so the
    // advisor can sum our season without filtering anything out.
    ["orderStatus", r => typeof buyStatus === "function" ? buyStatus(r) : r.status],
    ["reimbursement", r => typeof reimbStatus === "function" ? reimbStatus(r) : ""],
    ["chargedTo", r => (typeof isOffBudget === "function" && isOffBudget(r)) ? String(r.chargedTo || "").trim() : ""],
    ["cost", r => r.cost],
    // Both money columns on purpose: cost is the hand-set number the app
    // sums, lineSum is what the line items add to. Exporting only one would
    // hide a mismatch from the advisor spreadsheet.
    ["lineSum", r => { const s = typeof buyLineSum === "function" ? buyLineSum(r) : { count: 0 }; return s.count ? s.sum.toFixed(2) : ""; }],
    ["lineCount", r => (r.lines || []).length || ""],
    ["dateOrdered", r => r.dateOrdered]] },
};
function exportCSV(which) {
  const s = CSV_SPECS[which]; if (!s) return;
  const cols = s.cols.map(([label, get]) => ({ label, get }));
  downloadCSV(`feb-${s.file}-${today()}.csv`, toCSV(s.rows(), cols));
  toast(s.file + " CSV downloaded.");
}

/* ---------- recently deleted ----------
   Deleting stopped being final in September 2026: every delete path in the app
   writes a tombstone, the record leaves every rail and every count, its public
   nameplate goes, and its uploads are left exactly where they are. This is the
   only screen that can see any of it, because DB[coll] deliberately cannot.

   It lives on Reports rather than on a tab of its own: it spans every
   collection, so it belongs to none of them, and Reports is already where the
   cross-cutting lead tools are.

   Any roster member restores, because any roster member can delete. Only a lead
   empties, because emptying is the one irreversible step in the feature and the
   one that takes the Storage objects with it. */
function trashTitle(coll, rec) {
  return rec.name || rec.partName || rec.title || rec.item || rec.label || rec.id;
}
const TRASH_NOUN = {
  workOrders: "work order", parts: "part", projects: "issue", schedule: "week",
  budget: "purchase", documents: "document", stock: "board", stackplans: "stack plan",
  molds: "mold", items: "item", lots: "material", rnd: "R&D record",
};
function trashCard() {
  const all = allTrashed();
  const overdue = all.filter(x => x.rec.purgeAfter && x.rec.purgeAfter <= today());
  const oldest = all.length ? Math.max(...all.map(x => daysSince(x.rec.deletedAt))) : 0;
  if (!all.length) {
    return `<div class="card"><h3>Recently deleted</h3>
      <p class="muted">Nothing has been deleted. Anything that is goes here for ${TRASH_DAYS} days,
        with its uploads, and comes back whole.</p></div>`;
  }
  /* Grouped by the gesture, not by the day: a work order and the issues that
     went with it were one decision and are one row to put back. */
  const groups = new Map();
  for (const x of all) {
    const k = x.rec.trashBatch || x.rec.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const rows = [...groups].map(([k, set]) => {
    const lead = set[0].rec;
    const age = daysSince(lead.deletedAt);
    const left = TRASH_DAYS - age;
    const names = set.slice(0, 3).map(x => `${esc(trashTitle(x.coll, x.rec))} <span class="muted tny">${esc(TRASH_NOUN[x.coll] || x.coll)}</span>`).join(", ");
    const files = set.reduce((n, x) => n + (x.rec.deletedFiles || []).length, 0);
    /* Wrapping rows, not a table. Four columns at 320px squeezed "Restore" to
       one letter per line — the same reason the offcut pane and the technique
       step editor are flex rows. */
    return `<div class="trashrow">
      <span class="trash-what">${names}${set.length > 3 ? ` <span class="muted tny">and ${set.length - 3} more</span>` : ""}
        ${files ? `<div class="muted tny">${files} upload${files === 1 ? "" : "s"} kept with ${set.length === 1 ? "it" : "them"}</div>` : ""}</span>
      <span class="tny muted trash-who">${esc(userName(lead.deletedBy) || lead.deletedBy || "?")} ·
        ${age === 0 ? "today" : age + " day" + (age === 1 ? "" : "s") + " ago"}</span>
      <span class="tny ${left <= 0 ? "done" : left <= 7 ? "mid" : "muted"}">${left <= 0 ? "past " + TRASH_DAYS + " days" : left + " day" + (left === 1 ? "" : "s") + " left"}</span>
      <button class="sm" style="margin-left:auto" onclick="restoreTrashBatch('${esc(k)}')">Restore</button>
    </div>`;
  });
  return `<div class="card">
    <h3>Recently deleted</h3>
    <p class="muted tny">${all.length} record${all.length === 1 ? "" : "s"} in ${groups.size} deletion${groups.size === 1 ? "" : "s"};
      oldest ${oldest} day${oldest === 1 ? "" : "s"}. Uploads are kept until the bin is emptied, so a
      restored record comes back whole. Restoring one brings back everything deleted with it.</p>
    ${overdue.length ? `<div class="warn">${icon("warning", 14)}
      <b>${overdue.length} record${overdue.length === 1 ? " is" : "s are"} past ${TRASH_DAYS} days.</b>
      ${isLead()
        ? `Emptying deletes ${overdue.length} record${overdue.length === 1 ? "" : "s"} and
           ${overdue.reduce((n, x) => n + (x.rec.deletedFiles || []).length, 0)} uploaded file${overdue.reduce((n, x) => n + (x.rec.deletedFiles || []).length, 0) === 1 ? "" : "s"} for good.
           <button class="sm" onclick="purgeTrash()">Empty them</button>`
        : "A lead empties the bin."}
      </div>` : ""}
    <div class="trashlist">${rows.join("")}</div>
  </div>`;
}
async function restoreTrashBatch(key) {
  const set = allTrashed().filter(x => (x.rec.trashBatch || x.rec.id) === key);
  if (!set.length) { render(); return; }
  const n = await untrashRecords(set.map(x => ({ coll: x.coll, id: x.rec.id })));
  if (n) toast(`${n} record${n === 1 ? "" : "s"} restored.`);
  render();
}

/* THE PURGE. Client-side and lead-only, because this project has no scheduler:
   functions/index.js is one parseReceipt callable, and a scheduled function
   would be a second deploy target and a billing surface for a tidying job. So
   retention is best-effort and the card says the oldest age out loud, rather
   than implying a clock that does not exist.

   BOUNDED per press. A lead on shop wifi emptying four hundred documents plus
   their Storage objects will fail somewhere in the middle, and bulkDeleteRecords
   reports failures rather than hiding them — but a partial sweep of a bounded
   batch leaves a sane state, and a partial sweep of everything does not. */
const PURGE_BATCH = 25;
async function purgeTrash() {
  if (!isLead()) { toast("Emptying the bin is lead-only — it cannot be undone.", "error"); return; }
  const due = allTrashed().filter(x => x.rec.purgeAfter && x.rec.purgeAfter <= today());
  if (!due.length) { toast("Nothing is past " + TRASH_DAYS + " days yet.", "info"); return; }
  const take = due.slice(0, PURGE_BATCH);
  const files = [].concat(...take.map(x => x.rec.deletedFiles || []));
  const oldest = Math.max(...take.map(x => daysSince(x.rec.deletedAt)));
  confirmModal(
    `Permanently delete ${take.length} record${take.length === 1 ? "" : "s"}`
    + (files.length ? ` and ${files.length} uploaded file${files.length === 1 ? "" : "s"}` : "")
    + `? The oldest was deleted ${oldest} days ago. This cannot be undone — the files in particular are gone for good.`
    + (due.length > take.length ? ` ${due.length - take.length} more stay for now; press again to continue.` : ""),
    async () => {
      try { await fb.delMany(take.map(x => ({ coll: x.coll, id: x.rec.id }))); }
      catch (e) { toast("Empty failed: " + e.message, "error"); return; }
      take.forEach(x => { DB.trash[x.coll] = trashedIn(x.coll).filter(r => r.id !== x.rec.id); });
      let note = "";
      if (files.length && fb.deleteFiles) {
        try {
          const r = await fb.deleteFiles(files);
          if (r && r.failed && r.failed.length) note = ` ${r.failed.length} file${r.failed.length === 1 ? "" : "s"} could not be removed from storage.`;
        } catch (e) { note = " The files could not be removed from storage."; }
      }
      toast(`${take.length} record${take.length === 1 ? "" : "s"} permanently deleted.${note}`, note ? "error" : undefined);
      render();
    }, { ok: "Delete for good", danger: true });
}

function renderReports() {
  // Status board data
  const stages = ["Not Started", "In Layup", "Layup Complete", "Polished"];
  const partStage = {}; stages.forEach(s => partStage[s] = 0);
  DB.parts.forEach(p => { if (partStage[p.layupProgress] != null) partStage[p.layupProgress]++; else partStage["Not Started"]++; });
  const woInWork = DB.workOrders.filter(w => w.status === "InWork");
  const openBlockers = [];
  DB.workOrders.forEach(w => {
    if (w.retro) return;
    (w.steps || []).forEach(s => { if (typeof isBlocker === "function" && isBlocker(s, w) && !isSigned(s)) openBlockers.push({ wo: w, step: s }); });
  });
  const upcoming = (typeof deadlineItems === "function" ? deadlineItems() : [])
    .filter(i => !i.done && i.date && daysUntil(i.date) != null && daysUntil(i.date) >= 0 && daysUntil(i.date) <= 14)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Season spend is composites' own line; purchases charged to another team's
  // budget are summed beside it rather than into it.
  const spendRows = typeof compositesBuys === "function" ? compositesBuys() : DB.budget;
  const money = rs => rs.reduce((s, b) => s + (parseFloat(String(b.cost).replace(/[^0-9.\-]/g, "")) || 0), 0);
  const spend = money(spendRows);
  const offSpend = typeof offBudgetBuys === "function" ? money(offBudgetBuys()) : 0;
  const openOrders = DB.budget.filter(b => typeof buyReimbursed === "function" ? !buyReimbursed(b) : b.status !== "Reimbursed").length;

  return `
  <div class="toolbar no-print">
    <b style="align-self:center">Export CSV:</b>
    <button onclick="exportCSV('parts')">Parts</button>
    <button onclick="exportCSV('workOrders')">Work Orders</button>
    <button onclick="exportCSV('projects')">Issues</button>
    <button onclick="exportCSV('budget')">Budget</button>
    <button onclick="invExportCSV('flat')">Inventory</button>
    <button onclick="invExportCSV('locations')">Locations</button>
    <button onclick="openLabelBuilder()">${icon("print", 15)} Labels</button>
    <button onclick="openCustomLabel()">${icon("print", 15)} Custom label</button>
    <button onclick="openLabelSetup()" title="Which stock this device prints labels on">Label media</button>
    ${isLead() ? `<button onclick="rebuildScanMirror()" title="Re-publish the public scan nameplates for every physical record">Rebuild scan mirror</button>
    <button onclick="setupTrackerFeed()" title="Publish the part list to the Google Sheet feed and copy its URL">Tracker feed</button>
    <button onclick="findMoldsInWorkOrders()" title="Turn the free-text mold names on work orders into real mold records">Find molds in work orders</button>
    <button onclick="backfillPartWorkOrderLinks()" title="Link each part to the work order with the same name">Link parts to work orders</button>` : ""}
    <button onclick="view={...view,repTrash:!view.repTrash};render()">${icon("trash", 15)} Recently deleted${
      (typeof allTrashed === "function" && allTrashed().length) ? ` (${allTrashed().length})` : ""}</button>
    <button class="primary" style="margin-left:auto" onclick="window.print()">Print status board</button>
  </div>
  ${view.repTrash && typeof trashCard === "function" ? trashCard() : ""}
  <h2>Weekly status board <span class="muted" style="font-size:13px">— ${today()}</span></h2>
  <div class="rgrid">
    <div class="card">
      <h3>Parts by layup stage</h3>
      <!-- stageClass, so a count wears its stage's color the way Parts draws
           it: grey to start, amber under way, green done. The stage list here
           intentionally differs from PART_STAGES: this board counts every
           part's layupProgress directly, all-parts denominator. -->
      <div class="stagerow">${stages.map(s => `<span class="stage ${stageClass(s, stages)}">${esc(s)}: <b>${partStage[s]}</b></span>`).join("")}</div>
    </div>
    <div class="card">
      <h3>Work orders in progress (${woInWork.length})</h3>
      ${woInWork.length ? woInWork.map(w => `<div class="srow">
        <span class="sr-main"><span class="kind">WO</span> ${chip("workOrders", w.id, w.partName || w.id)}${rndBadge(woIsRnd(w))}</span>
        <span class="srow-meta">${esc(w.manufacturingEngineer || w.moldEngineer || "unassigned")}</span>
      </div>`).join("") : '<p class="muted">None marked in-work.</p>'}
    </div>
    <div class="card">
      <h3>Open blockers (${openBlockers.length})</h3>
      ${openBlockers.length ? openBlockers.map(b => `<div class="srow">
        <span class="sr-main">${chip("workOrders", b.wo.id, b.wo.partName || b.wo.id)}${rndBadge(woIsRnd(b.wo))} <b>${esc(stripCS(b.step.title))}</b></span>
        <span class="srow-meta">step ${esc(b.step.seq)} · unsigned</span>
      </div>`).join("") : '<p class="muted">No unsigned blockers on active work orders.</p>'}
    </div>
    <div class="card">
      <h3>Deadlines in the next two weeks (${upcoming.length})</h3>
      ${upcoming.length ? upcoming.map(i => `<div class="srow">
        <span class="sr-main"><span class="kind">${i.kind}</span> ${chip(i.coll, i.id, i.label)}${rndBadge(i.rnd)}</span>
        <span class="srow-meta">${esc(i.date)} (${daysUntil(i.date)}d)${i.who ? " · " + esc(i.who) : ""}</span>
      </div>`).join("") : '<p class="muted">Nothing due in the next two weeks.</p>'}
    </div>
    <div class="card">
      <h3>Budget</h3>
      <p>Season spend <b>$${spend.toFixed(0)}</b>${offSpend ? ` · $${offSpend.toFixed(0)} on other budgets` : ""} · ${openOrders} awaiting reimbursement.</p>
    </div>
  </div>`;
}

/* Rebuild every public scan nameplate.
 *
 * fb.save() mirrors a record into `pub` as it goes, but three cases slip past
 * that and there is no way to notice any of them from inside the app:
 *
 *   1. records that existed before labels were a feature — the whole SN5
 *      archive, and everything created in SN6 up to today;
 *   2. writes that never go through save(): fb.mutateField() (step buy-offs)
 *      and fb.appendTo() (comment and update logs) both write straight to the
 *      document;
 *   3. any window where the pub write was rejected — mid-rules-deploy, or an
 *      offline queue that was dropped. pubSync() only warns to the console on
 *      failure, deliberately, because a mirror failure must never surface as a
 *      save failure.
 *
 * So the mirror is allowed to drift, and this is the thing that pays for it.
 * Lead-only, because it writes once per physical record and there is no reason
 * for anyone else to run it.
 */
async function rebuildScanMirror() {
  if (!isLead()) return;
  if (typeof pubProjection !== "function") { toast("labels.js not loaded.", "error"); return; }

  const recs = [];
  for (const coll of ["molds", "workOrders", "parts", "stock", "items", "lots"]) {
    for (const o of DB[coll] || []) {
      const p = pubProjection(coll, o);
      if (p) recs.push(p);
    }
  }
  if (!recs.length) { toast("Nothing to publish yet."); return; }

  const ok = await confirmAsync(
    `Re-publish ${recs.length} public scan nameplate${recs.length === 1 ? "" : "s"}?\n\n` +
    `Each one carries only the ID, class, name, stage, location and work order — ` +
    `the same facts already printed on the physical label. No names, no layup stacks, no files.`,
    { ok: "Publish", danger: false });
  if (!ok) return;

  toast(`Publishing ${recs.length}…`);
  try {
    // publishPub, not importMany: importMany stamps updatedBy with an email,
    // which the /pub rules reject and which must never be published anyway.
    await fb.publishPub(recs);
    toast(`${recs.length} scan nameplate${recs.length === 1 ? "" : "s"} published.`);
  } catch (e) {
    toast("Couldn't publish: " + (e && e.message || e), "error");
  }
}
