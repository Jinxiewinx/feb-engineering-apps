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
  parts: { file: "parts", rows: () => DB.parts, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["layupType", r => r.layupType], ["cad", r => r.cadProgress], ["mold", r => r.moldProgress], ["layup", r => r.layupProgress], ["moldEngineer", r => personText(r, "moldEngineer")], ["mfgEngineer", r => personText(r, "manufacturingEngineer")], ["weightG", r => r.weightG], ["deadline", r => r.layupDeadline], ["rnd", r => isRnd(r) ? "R&D" : ""]] },
  workOrders: { file: "work-orders", rows: () => DB.workOrders, cols: [["id", r => r.id], ["part", r => r.partName], ["subteam", r => r.subteam], ["process", r => r.processType], ["status", r => r.status], ["moldEngineer", r => personText(r, "moldEngineer")], ["mfgEngineer", r => personText(r, "manufacturingEngineer")], ["due", r => r.dueDate], ["rnd", r => woIsRnd(r) ? "R&D" : ""]] },
  projects: { file: "issues", rows: () => DB.projects.filter(isIssue), cols: [["id", r => r.id], ["title", r => r.title], ["status", r => projStatus(r)], ["workOrder", r => r.workOrderId], ["resolution", r => r.resolutionMethod], ["priority", r => r.priority], ["due", r => r.dueDate], ["assignees", r => (r.assignees || []).join("; ")]] },
  budget: { file: "budget", rows: () => DB.budget, cols: [["id", r => r.id], ["item", r => r.item], ["purchaser", r => personText(r, "purchaser")], ["purpose", r => r.purpose],
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
/* ALWAYS OPEN (Simon, 2026-09-17). It was behind a toggle in the toolbar, which
   is the wrong shape for the one thing on this tab somebody arrives already
   worried about: you come here because something is missing, and a button you
   have to find first is a button you do not know to press.

   Empty is the normal state and says so plainly rather than rendering a bare
   heading over nothing. */
function trashSection() {
  const all = allTrashed();
  if (!all.length) {
    return `<h2>Recently deleted</h2>
      <div class="card"><p class="muted">Nothing has been deleted. Anything deleted lands here for
        ${TRASH_DAYS} days, with its uploads, and comes back whole.</p></div>`;
  }
  const overdue = all.filter(x => x.rec.purgeAfter && x.rec.purgeAfter <= today());
  const oldest = Math.max(...all.map(x => daysSince(x.rec.deletedAt)));
  const files = all.reduce((n, x) => n + (x.rec.deletedFiles || []).length, 0);
  /* Grouped by the gesture, not by the day: a work order and the issues that
     went with it were one decision and are one row to put back. */
  const groups = new Map();
  for (const x of all) {
    const k = x.rec.trashBatch || x.rec.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(x);
  }
  const overdueFiles = overdue.reduce((n, x) => n + (x.rec.deletedFiles || []).length, 0);
  return `
  <h2>Recently deleted <span class="muted" style="font-size:13px">— ${all.length} record${all.length === 1 ? "" : "s"}, oldest ${oldest} day${oldest === 1 ? "" : "s"}</span></h2>
  <div class="card">
    <p class="muted tny">${groups.size} deletion${groups.size === 1 ? "" : "s"}${files ? `, holding ${files} upload${files === 1 ? "" : "s"}` : ""}.
      Uploads stay where they are until the bin is emptied, so a restored record comes back whole.
      Restoring one brings back everything that was deleted with it.</p>
    ${overdue.length ? `<div class="warn">${icon("warning", 14)}
      <b>${overdue.length} record${overdue.length === 1 ? " is" : "s are"} past ${TRASH_DAYS} days.</b>
      ${isLead()
        ? `Emptying deletes ${overdue.length} record${overdue.length === 1 ? "" : "s"}${overdueFiles ? ` and ${overdueFiles} uploaded file${overdueFiles === 1 ? "" : "s"}` : ""} for good.
           <button class="sm" onclick="purgeTrash()">Empty them</button>`
        : "A lead empties the bin."}
      </div>` : ""}
    <div class="trashlist">${[...groups].map(([k, set]) => trashRowHtml(k, set)).join("")}</div>
  </div>`;
}
function trashRowHtml(k, set) {
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

/* ---------- the numbers the board is made of ----------
   ONE source, read by the screen and by the printed sheet. They used to be the
   same expressions written out twice, which is the drift that puts a different
   blocker count on paper than on the wall behind it. */
function statusBoardData() {
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
  /* Season spend is composites' own line; purchases charged to another team's
     budget are summed beside it rather than into it. */
  const spendRows = typeof compositesBuys === "function" ? compositesBuys() : DB.budget;
  const money = rs => rs.reduce((s, b) => s + (parseFloat(String(b.cost).replace(/[^0-9.\-]/g, "")) || 0), 0);
  return {
    stages, partStage, woInWork, openBlockers, upcoming,
    spend: money(spendRows),
    offSpend: typeof offBudgetBuys === "function" ? money(offBudgetBuys()) : 0,
    openOrders: DB.budget.filter(b => typeof buyReimbursed === "function" ? !buyReimbursed(b) : b.status !== "Reimbursed").length,
  };
}

/* ---------- the tab ----------
   It was one very long row of buttons and then the board. Simon, 2026-09-17:
   the exports are not what anybody comes here for. So the tab reads top to
   bottom in the order somebody actually wants it — this week's board, what has
   been deleted, the techniques the shop runs — and the exports and the one-off
   maintenance actions sit at the bottom under their own heading.

   Not folded away. `DESIGN-NOTES.md` is explicit that a closed <details> skips
   PAINTING its content, which has bitten this app twice; demoting by POSITION
   costs nothing and hides nothing. */
function renderReports() {
  return `
  <div class="toolbar no-print">
    <button class="primary" onclick="printStatusBoard()">${icon("print", 15)} Print status board</button>
  </div>
  ${statusBoardScreen()}
  ${typeof trashSection === "function" ? trashSection() : ""}
  ${typeof techniqueSection === "function" ? techniqueSection() : ""}
  ${toolsSection()}`;
}

function statusBoardScreen() {
  const d = statusBoardData();
  return `
  <h2>Weekly status board <span class="muted" style="font-size:13px">— ${today()}</span></h2>
  <div class="rgrid">
    <div class="card">
      <h3>Parts by layup stage</h3>
      <!-- stageClass, so a count wears its stage's color the way Parts draws
           it: grey to start, amber under way, green done. The stage list here
           intentionally differs from PART_STAGES: this board counts every
           part's layupProgress directly, all-parts denominator. -->
      <div class="stagerow">${d.stages.map(s => `<span class="stage ${stageClass(s, d.stages)}">${esc(s)}: <b>${d.partStage[s]}</b></span>`).join("")}</div>
    </div>
    <div class="card">
      <h3>Work orders in progress (${d.woInWork.length})</h3>
      ${d.woInWork.length ? d.woInWork.map(w => `<div class="srow">
        <span class="sr-main"><span class="kind">WO</span> ${chip("workOrders", w.id, w.partName || w.id)}${rndBadge(woIsRnd(w))}</span>
        <span class="srow-meta">${esc(personText(w, "manufacturingEngineer") || personText(w, "moldEngineer") || "unassigned")}</span>
      </div>`).join("") : '<p class="muted">None marked in-work.</p>'}
    </div>
    <div class="card">
      <h3>Open blockers (${d.openBlockers.length})</h3>
      ${d.openBlockers.length ? d.openBlockers.map(b => `<div class="srow">
        <span class="sr-main">${chip("workOrders", b.wo.id, b.wo.partName || b.wo.id)}${rndBadge(woIsRnd(b.wo))} <b>${esc(stripCS(b.step.title))}</b></span>
        <span class="srow-meta">step ${esc(b.step.seq)} · unsigned</span>
      </div>`).join("") : '<p class="muted">No unsigned blockers on active work orders.</p>'}
    </div>
    <div class="card">
      <h3>Deadlines in the next two weeks (${d.upcoming.length})</h3>
      ${d.upcoming.length ? d.upcoming.map(i => `<div class="srow">
        <span class="sr-main"><span class="kind">${i.kind}</span> ${chip(i.coll, i.id, i.label)}${rndBadge(i.rnd)}</span>
        <span class="srow-meta">${esc(i.date)} (${daysUntil(i.date)}d)${i.who ? " · " + esc(i.who) : ""}</span>
      </div>`).join("") : '<p class="muted">Nothing due in the next two weeks.</p>'}
    </div>
    <div class="card">
      <h3>Budget</h3>
      <p>Season spend <b>$${d.spend.toFixed(0)}</b>${d.offSpend ? ` · $${d.offSpend.toFixed(0)} on other budgets` : ""} · ${d.openOrders} awaiting reimbursement.</p>
    </div>
  </div>`;
}

/* ---------- the status board, on paper ----------
   It used to call window.print() on the screen markup with a .no-print toolbar
   — the last printable in the app that worked that way, and it showed: app
   chrome in the margins, cards breaking across the fold, colour-coded pills
   that a laser renders as four identical grey lozenges.

   It is a sheet now, in the same house grammar as the traveler and the mold
   drawings: black masthead, gold underrule, ws-h section rules, ws-t tables.
   That grammar is designed for a laser and for a wall — nothing on it depends
   on colour, every count is a number rather than a coloured chip, and the
   headers repeat if a long week runs to a second page.

   THE MONDAY MEETING IS THE POINT, so it ends with ruled lines. The board is
   read standing up in Dwinelle with somebody writing on it; a printout with
   nowhere to write gets notes in the margin or not at all. */

/* The Monday of the week this is printed in, so two people printing on
   different days of the same week file the same sheet. */
function weekOfLabel(d) {
  const t = d ? new Date(d) : new Date();
  const dow = (t.getDay() + 6) % 7;                 // Monday = 0
  t.setDate(t.getDate() - dow);
  return t.toISOString().slice(0, 10);
}
/* A table, or the one line that says there is nothing in it. An empty <table>
   with a header row and no body reads as a rendering fault on paper. */
function boardTable(head, rows, empty) {
  if (!rows.length) return `<p class="ws-none">${esc(empty)}</p>`;
  return `<table class="ws-t"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
function statusBoardSheetHtml() {
  const d = statusBoardData();
  const rnd = on => on ? ' <span class="ws-rnd">R&amp;D</span>' : "";

  const wo = d.woInWork.map(w => `<tr>
    <td class="idc">${esc(w.id)}</td>
    <td>${esc(w.partName || w.id)}${rnd(woIsRnd(w))}</td>
    <td>${esc(w.subteam || "")}</td>
    <td>${esc(personText(w, "manufacturingEngineer") || personText(w, "moldEngineer") || "unassigned")}</td></tr>`);

  const blk = d.openBlockers.map(b => `<tr>
    <td class="idc">${esc(b.wo.id)}</td>
    <td>${esc(b.wo.partName || b.wo.id)}${rnd(woIsRnd(b.wo))}</td>
    <td><b>${esc(stripCS(b.step.title))}</b></td>
    <td class="num">${esc(b.step.seq)}</td></tr>`);

  const due = d.upcoming.map(i => `<tr>
    <td class="datec">${esc(i.date)}</td>
    <td class="num">${daysUntil(i.date)}d</td>
    <td>${esc(i.kind)} ${esc(i.label)}${rnd(i.rnd)}</td>
    <td>${esc(i.who || "")}</td></tr>`);

  /* Six lines. Enough for a meeting, not so many that the sheet becomes a
     notebook and the board above it stops being the point. */
  const noteLines = new Array(6).fill('<tr><td class="ws-write"></td></tr>').join("");

  return `<div class="wsheet"><div class="ws-page"><table class="pgflow"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="ws-head">
    <div class="brand">FEB COMPOSITES <span class="sub">SN6</span></div>
    ${/* The masthead's empty middle carries the one number the meeting is
          about, when there is one. Same slot the traveler stamps RETRO or
          DRAFT into, and the same reason: it is the thing somebody walking
          past a sheet on the wall should read without picking it up. */""}
    ${d.openBlockers.length ? `<div class="ws-stamp">${d.openBlockers.length} blocker${d.openBlockers.length === 1 ? "" : "s"} open</div>` : ""}
    <div class="idblock">
      <div class="idcell wide"><div class="lab">Report</div><div class="val">Weekly status</div></div>
      <div class="idcell"><div class="lab">Week of</div><div class="val">${esc(weekOfLabel())}</div></div>
    </div>
  </div>
  <div class="ws-rule"></div>
  <div class="ws-sheetkind">
    <span>Monday meeting board. Mark it up here, then put the decisions in the app.</span>
    <span>Printed ${esc(today())}</span>
  </div>

  <div class="ws-h">Parts by layup stage <span class="hint">${DB.parts.length} part${DB.parts.length === 1 ? "" : "s"} counted</span></div>
  <div class="ws-grid">
    ${d.stages.map(st => `<div class="ws-f"><div class="lab">${esc(st)}</div><div class="val filled big">${d.partStage[st]}</div></div>`).join("")}
  </div>

  <div class="ws-h">Work orders in progress <span class="hint">${d.woInWork.length}</span></div>
  ${boardTable('<th class="idc">Work order</th><th>Part</th><th>Subteam</th><th>Engineer</th>', wo,
    "Nothing is marked in-work. If that is wrong, the status is wrong.")}

  <div class="ws-h">Open blockers <span class="hint">${d.openBlockers.length}</span></div>
  ${boardTable('<th class="idc">Work order</th><th>Part</th><th>Step waiting on a signature</th><th class="num">#</th>', blk,
    "No unsigned blockers on active work orders.")}

  <div class="ws-h">Deadlines in the next two weeks <span class="hint">${d.upcoming.length}</span></div>
  ${boardTable('<th class="datec">Date</th><th class="num">In</th><th>What</th><th>Who</th>', due,
    "Nothing due in the next two weeks.")}

  <div class="ws-h">Budget</div>
  <div class="ws-grid c3">
    <div class="ws-f"><div class="lab">Season spend</div><div class="val filled big">$${d.spend.toFixed(0)}</div></div>
    <div class="ws-f"><div class="lab">On other budgets</div><div class="val filled big">$${d.offSpend.toFixed(0)}</div></div>
    <div class="ws-f"><div class="lab">Awaiting reimbursement</div><div class="val filled big">${d.openOrders}</div></div>
  </div>

  <div class="ws-h">Decisions and actions <span class="hint">written here, then entered in the app</span></div>
  <table class="ws-t ws-notes"><tbody>${noteLines}</tbody></table>
  </td></tr></tbody></table></div></div>`;
}
function printStatusBoard() {
  if (typeof mountSheet !== "function") { toast("Print system not loaded.", "error"); return; }
  mountSheet(statusBoardSheetHtml(), true,
    `US Letter · week of ${weekOfLabel()} · this is exactly what prints`,
    `status board ${weekOfLabel()}`);
  document.body.classList.add("previewing");
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
}

/* ---------- layup techniques ----------
   Moved off the Work Orders toolbar (Simon, 2026-09-17), where it was a modal
   behind a button, and inlined here. A technique is a checklist the whole shop
   runs to, so it is worth being able to READ without being a lead and without
   opening anything — a member can see what the steps are and which of them
   they are trained to sign.

   The step template still edits in a modal, because it is a long form and this
   tab is a page you scan. Everything else — add, rename, archive — is here.
   The functions themselves stay in workorders.js beside techniqueById and the
   gate ladder they belong to; only the screen moved. */
function techniqueSection() {
  if (typeof allTechniques !== "function") return "";
  const lead = isLead();
  const list = allTechniques(lead);   // a member has no use for the archived ones
  const rows = list.map(t => {
    const n = tqUsedBy(t.id);
    const gate = t.mfgTraining && typeof trainingById === "function" ? trainingById(t.mfgTraining).name : "";
    return `<div class="tqcard${t.archived ? " arch" : ""}">
      <span class="tq-name"><b>${esc(t.name)}</b>${t.builtin ? ' <span class="muted tny">built-in</span>' : ""}${t.archived ? ' <span class="pill archived tny">archived</span>' : ""}
        <div class="muted tny">${t.steps.length} step${t.steps.length === 1 ? "" : "s"}${gate ? ` · engineer needs ${esc(gate)}` : ""}${
          n ? ` · ${n} run${n === 1 ? "" : "s"}` : " · no runs yet"}</div></span>
      <span class="tq-steps tny muted">${t.steps.slice(0, 4).map(r => esc(r[0])).join(" → ")}${t.steps.length > 4 ? " → …" : ""}</span>
      ${lead ? `<span class="tqact">
        <button class="sm" onclick="openTechniqueEdit('${esc(t.id)}')">Edit steps</button>
        ${t.builtin ? "" : t.archived
          ? `<button class="sm" onclick="setTechniqueArchived('${esc(t.id)}',false)">Restore</button>`
          : `<button class="sm" onclick="setTechniqueArchived('${esc(t.id)}',true)">Archive</button>`}
      </span>` : ""}
    </div>`;
  }).join("");
  return `
  <h2>Layup techniques <span class="muted" style="font-size:13px">— ${list.filter(t => !t.archived).length} in use</span></h2>
  <div class="card">
    <p class="muted tny">A technique is a checklist and the gates on it. Editing one never changes a run
      that already exists: its steps were copied in when it was created, which is what makes a buy-off
      mean something. Runs on an older version say so and can take the new steps without losing a
      signature. Nothing is deleted — archiving hides a technique from new runs while every run made on
      it keeps its name.</p>
    <div class="tqlist">${rows}</div>
    ${lead ? `
    <h3 style="margin-top:14px">Add a technique</h3>
    <div class="row2">
      <div class="field"><label for="tq-name">Name</label><input id="tq-name" placeholder="e.g. Glass wrapped core"></div>
      <div class="field"><label for="tq-from">Start from</label>
        <select id="tq-from">${allTechniques().map(t => `<option value="${esc(t.id)}">${esc(t.name)} (${t.steps.length} steps)</option>`).join("")}</select></div>
    </div>
    <div class="muted tny">A copy of that checklist, to edit. Starting from a blank page means forgetting
      the stack freeze and the drop test, which is what those steps are there to stop.</div>
    <div class="addrow" style="margin-top:8px"><button class="primary" onclick="submitTechniqueAdd()">Add technique</button></div>` : ""}
  </div>`;
}

/* Last on the page on purpose. Everything here is either a once-a-term export
   or a one-off repair, and neither is why anybody opens this tab. */
function toolsSection() {
  return `
  <h2>Exports and maintenance</h2>
  <div class="card no-print">
    <h3>Export a CSV</h3>
    <div class="muted tny">For the advisor spreadsheet and end-of-term reporting. R&amp;D is a column in each, never a filter.</div>
    <div class="addrow" style="margin-top:8px">
      <button onclick="exportCSV('parts')">Parts</button>
      <button onclick="exportCSV('workOrders')">Work orders</button>
      <button onclick="exportCSV('projects')">Issues</button>
      <button onclick="exportCSV('budget')">Budget</button>
      <button onclick="invExportCSV('flat')">Inventory</button>
      <button onclick="invExportCSV('locations')">Locations</button>
    </div>
    <h3 style="margin-top:14px">Labels</h3>
    <div class="addrow">
      <button onclick="openLabelBuilder()">${icon("print", 15)} Label sheet</button>
      <button onclick="openCustomLabel()">${icon("print", 15)} Custom label</button>
      <button onclick="openLabelSetup()" title="Which stock this device prints labels on">Label media</button>
    </div>
    ${isLead() ? `
    <h3 style="margin-top:14px">Maintenance</h3>
    <div class="muted tny">One-off repairs. None of these are part of anybody's week.</div>
    <div class="addrow" style="margin-top:8px">
      <button onclick="rebuildScanMirror()" title="Re-publish the public scan nameplates for every physical record">Rebuild scan mirror</button>
      <button onclick="setupTrackerFeed()" title="Publish the part list to the Google Sheet feed and copy its URL">Tracker feed</button>
      <button onclick="findMoldsInWorkOrders()" title="Turn the free-text mold names on work orders into real mold records">Find molds in work orders</button>
      <button onclick="backfillPartWorkOrderLinks()" title="Link each part to the work order with the same name">Link parts to work orders</button>
    </div>` : ""}
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
