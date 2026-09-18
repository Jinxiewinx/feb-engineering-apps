"use strict";
/* projects.js — the Tickets tab (jira-style; Firestore collection stays "projects").
   Two kinds share this collection: "project" (R&D, can have sub-tickets) and
   "issue" (production nonconformance — required work-order link, a resolution
   method, and a documented root cause, all enforced before it can close).
   Board or list of tickets; create via a modal with real assignee/part
   pickers; each ticket has its own page with assignees, watchers, a files
   section (uploads), and a rich-text comment thread with image attachments.
   Comments/files append atomically (arrayUnion) so concurrent posts don't
   clobber. "Watched — new activity" is tracked per-browser in localStorage. */

// Old 4-value enum is migrated to the new 6-value one AT READ TIME ONLY — no
// backfill script, same technique as ticketKind()'s default below. A record
// gets the new enum for real the next time someone edits and saves it.
const PROJ_STATUS = ["To Do", "In Progress", "Collecting Data", "On Hold", "Done", "Cancelled"];
const STATUS_MIGRATE = { Backlog: "To Do", Active: "In Progress", Blocked: "On Hold" };
const STATUS_SLUG = { "To Do": "todo", "In Progress": "inprogress", "Collecting Data": "collecting", "On Hold": "onhold", "Done": "done", "Cancelled": "cancelled" };
const RESOLUTION_METHODS = ["UAI (Use As Is)", "Corrective Action", "Rework", "Scrap", "Other"];
const PRIORITY = ["Low", "Medium", "High"];
let PROJ_DRAG = null;
let NEW_TICKET_PARENT = null; // set by openNewSubTicket(), read+cleared by submitNewProject()

function projById(id) { return DB.projects.find(p => p.id === id); }
function saveProj(p, field) { p = p || projById(view.id); if (p) save("projects", p, field); }
// Read-time migration: old records keep their stored string until edited; every
// call site that displays or compares status should go through this, never p.status.
function projStatus(p) { return STATUS_MIGRATE[p.status] || p.status || "To Do"; }
function projStatusClass(status) { return STATUS_SLUG[status] || "todo"; }
function ticketKind(p) { return p.kind === "issue" ? "issue" : "project"; }
function isIssue(p) { return ticketKind(p) === "issue"; }
function subTickets(p) { return DB.projects.filter(t => t.parentId === p.id); }

/* The ticket a sub-ticket hangs off, or null. Returns the record rather than
   the id, because callers want its title: "part of TKT-014" is barely better
   than nothing when what you needed to know is that it belongs to the
   undertray.

   Everywhere inside this tab a sub-ticket is drawn nested under its parent, so
   the context is free. The flat lists elsewhere — the dashboard's deadline
   tables, the Weekly Plan rollup — had no such thing, and "Machine the plug"
   arrived on its own saying nothing about which mold.

   Tolerates a dangling parentId: a ticket whose parent was deleted still
   renders, it just loses the context line. */
function parentOf(p) {
  if (!p || !p.parentId) return null;
  const par = (DB.projects || []).find(x => x.id === p.parentId);
  return par ? { id: par.id, label: par.title || par.id } : null;
}
/* "part of <parent>", in the app's existing quiet register (.tny .muted, the
   same one the dashboard's who-column and the Parts index use). It answers
   "which one?" and must not compete with the thing actually being listed, so
   it is small, grey, and second.

   `inline` is for flex rows like .task-row, where a block would break the row
   onto its own line; block is the default because in a table cell it wants to
   sit under the title rather than trail off the end of it. */
function parentLine(parent, inline) {
  if (!parent) return "";
  const body = `part of ${chip("projects", parent.id, parent.label)}`;
  return inline
    ? `<span class="tny muted">${body}</span>`
    : `<div class="tny muted">${body}</div>`;
}
// The CS-003 enforcement point: an Issue can't be marked Done without a
// disposition and documented root cause. Cancelled needs neither — it's the
// escape hatch for "turned out not to be a real issue," not a disposition.
function statusGate(p, newStatus) {
  if (newStatus !== "Done" || !isIssue(p)) return null;
  if (!p.resolutionMethod) return "Select a resolution method before closing this issue.";
  if (!(p.whatHappened || "").trim()) return "Document what happened before closing this issue.";
  /* THE THIRD CLAUSE (Simon, 2026-09-18). Two questions, two answers: what
     happened is why it went wrong, and this is what was done about it. Asked on
     EVERY method, not only the two where something was physically done — a
     "use as is" with no reason recorded is the disposition you will most want a
     reason for when somebody asks in March why this part flew. The prompt
     changes wording per method so it never reads as the same question twice. */
  if (!(p.dispositionNote || "").trim()) return dispoRefusal(p.resolutionMethod);
  return null;
}

/* One table, three surfaces. The work-order row, the closeout modal and the
   ticket page all ask with these words, so they cannot drift into asking three
   different questions about one field. */
const DISPO_WORDS = {
  "UAI (Use As Is)":    { ask: "Why is it acceptable as it is?",            no: "why it is acceptable as it is" },
  "Corrective Action":  { ask: "What was changed so it cannot recur?",      no: "what was changed" },
  "Rework":             { ask: "What was done to fix it?",                  no: "what was done to fix it" },
  "Scrap":              { ask: "Why could it not be saved?",                no: "why it could not be saved" },
  "Other":              { ask: "What was done?",                            no: "what was done" },
};
const DISPO_FALLBACK = { ask: "What was done?", no: "what was done" };
function dispoWords(method) { return DISPO_WORDS[method] || DISPO_FALLBACK; }
function dispoPrompt(method) { return dispoWords(method).ask; }
/* The refusal is its own phrasing, not the question with the punctuation filed
   off: "Record why could it not be saved" is what that shortcut produces, and a
   gate that refuses in broken English reads as a bug in the gate. */
function dispoRefusal(method) { return `Record ${dispoWords(method).no} before closing this issue.`; }

/* ---- Slack (app → Slack only, one-directional; no backend exists in this
   repo, so this app never accepts inbound Slack traffic) ----
   The webhook URL is fetched from a roster-gated Firestore config doc at
   runtime, never hardcoded — this repo is public source, and a webhook URL
   IS a live credential, unlike the Firebase apiKey (which is safe to publish
   because firestore.rules is the real gate; a raw webhook URL has no such
   second gate once it's out). Cached for the session once fetched. */
let SLACK_CFG_CACHE;
async function slackWebhookUrl() {
  if (SLACK_CFG_CACHE === undefined) {
    const cfg = await fb.getConfig("slack").catch(() => null);
    SLACK_CFG_CACHE = (cfg && cfg.webhookUrl) || "";
  }
  return SLACK_CFG_CACHE;
}
// A failed or unconfigured Slack push must never block the real ticket action
// it's reporting on — best-effort, always swallows its own errors.
async function postToSlack(text) {
  const url = await slackWebhookUrl();
  if (!url) return;
  try {
    // text/plain (not application/json) avoids the CORS preflight a browser-
    // origin POST would otherwise trigger against Slack's webhook endpoint.
    await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ text }) });
  } catch (e) { /* best-effort */ }
}
// Plain Slack mrkdwn text, NOT HTML — esc() (HTML-entity escaping) would leak
// literal "&amp;" etc. into the message, since Slack doesn't decode HTML.
function slackIssueCreatedMsg(p) {
  const who = (p.assignees || []).map(userName).join(", ") || "unassigned";
  return `🆕 New issue *${p.title || p.id}* on ${p.workOrderId || "?"} — ${who}. (${p.id})`;
}
function slackIssueResolvedMsg(p) {
  return `✅ Issue *${p.title || p.id}* resolved — ${p.resolutionMethod || "?"}, by ${signerName()}. (${p.id})`;
}
// Called after any status write that might have just closed an Issue, so all
// three status-change paths (quick dropdown, board drag, full edit form)
// report the same event exactly once, from one place.
function announceIfResolved(p, prevStatus) {
  if (isIssue(p) && projStatus(p) === "Done" && prevStatus !== "Done") postToSlack(slackIssueResolvedMsg(p));
}
// Legacy: earlier projects stored a plain updates[]; show them as comments.
// Newest first: on an active ticket the latest status is what you came for,
// and oldest-first put it several screens down. Order is applied at read time,
// so postComment's append and fb.appendTo stay order-agnostic.
function projComments(p) {
  const legacy = (p.updates || []).map(u => ({ author: u.author, email: u.email, ts: u.ts, html: esc(u.text || "") }));
  return legacy.concat(p.comments || []).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
function projActivity(p) { return p.updatedAt || ""; }

/* ---- per-browser "seen" tracking for watcher unread dots ---- */
function loadSeen() { try { return JSON.parse(localStorage.getItem("feb-proj-seen") || "{}"); } catch (e) { return {}; } }
function markSeen(id) { const s = loadSeen(); const p = projById(id); s[id] = (p && projActivity(p)) || new Date().toISOString(); try { localStorage.setItem("feb-proj-seen", JSON.stringify(s)); } catch (e) {} }
function projUnread(p) { const s = loadSeen(); return (p.watchers || []).includes(myEmail()) && projActivity(p) && projActivity(p) > (s[p.id] || ""); }
function unreadWatched() { return (DB.projects || []).filter(projUnread).length; }

/* ---- create (modal) ---- */
function assigneeItems() { return usersSorted().map(u => ({ value: u.email, label: u.name || u.email, sublabel: u.role, avatarEmail: u.email })); }
function partItems() { return DB.parts.slice().sort((a, b) => (a.partName || a.id).localeCompare(b.partName || b.id)).map(p => ({ value: p.id, label: p.partName || p.id, sublabel: p.id })); }
function ticketItems(excludeId) { return DB.projects.filter(t => t.id !== excludeId).sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id)).map(t => ({ value: t.id, label: t.title || t.id, sublabel: isIssue(t) ? "Issue" : "Project" })); }
function workOrderItems() { return DB.workOrders.slice().sort((a, b) => cmpId(a.id, b.id)).map(w => ({ value: w.id, label: w.partName || w.id, sublabel: w.id })); }
function woSelectOptions(selected) {
  const sorted = DB.workOrders.slice().sort((a, b) => cmpId(a.id, b.id));
  return `<option value="" ${selected ? "" : "selected"} disabled>— choose a work order —</option>` +
    sorted.map(w => `<option value="${esc(w.id)}" ${w.id === selected ? "selected" : ""}>${esc(w.id)} — ${esc(w.partName || "")}</option>`).join("");
}

// "ticket" is only the right word before a Kind is picked (or for a sub-ticket,
// which has no Kind at all) — once Kind is Project/Issue, the modal chrome
// should say that, not a generic umbrella word. Kept in one place so the
// initial render and ticketKindChanged() can never drift apart.
function kindNoun(kind) { return kind === "issue" ? "issue" : "project"; }
function openNewProject(parentId) {
  NEW_TICKET_PARENT = parentId || null;
  const forSub = !!NEW_TICKET_PARENT;
  /* A sub-ticket starts from its parent, not from a blank form — the same
     move as newRunForPart() prefilling a run from the part. Related parts and
     work orders carry over (the breakdown is about the same hardware), the
     subteam carries over, and the due date defaults to the parent's and is
     capped there: a child due after its parent is a plan that cannot work.
     Everything stays editable. */
  const parent = forSub ? projById(parentId) : null;
  pickerInit("pa", assigneeItems(), [myEmail()]);
  pickerInit("pp", partItems(), parent ? (parent.relatedParts || []) : []);
  pickerInit("rt", ticketItems(), []);
  pickerInit("rwo", workOrderItems(), parent ? (parent.relatedWorkOrders || []) : []);
  openModal(`
    <h2 id="np-heading">${forSub ? "New sub-ticket" : "New " + kindNoun("project")}</h2>
    ${forSub ? "" : `
    <div class="field"><label>Kind</label>
      <select id="np-kind" onchange="ticketKindChanged()">
        <option value="project">Project — R&amp;D, can have sub-tickets</option>
        <option value="issue">Issue — production nonconformance, links to a work order</option>
      </select>
    </div>`}
    <div class="field"><label>Title</label><input id="np-title" autofocus placeholder="What is this ${forSub ? "sub-task" : kindNoun("project") + "?"}"></div>
    <div class="row2">
      <div class="field"><label>Status</label><select id="np-status">${PROJ_STATUS.map(s => `<option>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Priority</label><select id="np-priority">${PRIORITY.map(s => `<option ${s === "Medium" ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Due date${parent && parent.dueDate ? ` <span class="muted nocaps">— parent is due ${esc(parent.dueDate)}</span>` : ""}</label>
      <input id="np-due" type="date" value="${esc((parent && parent.dueDate) || "")}" ${parent && parent.dueDate ? `max="${esc(parent.dueDate)}"` : ""}></div>
    <div class="field"><label>Subteam <span class="muted nocaps">— for Weekly Plan</span></label>
      <select id="np-subteam"><option value="" ${parent && parent.subteam ? "" : "selected"}>Unassigned</option>${SUBTEAMS.map(s => `<option ${parent && parent.subteam === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <div class="field"><label>Assignees</label>${pickerField("pa")}</div>
    <div id="np-issue-fields" style="display:none">
      <div class="field"><label>Work order <span class="req">*required</span></label><select id="np-wo">${woSelectOptions("")}</select></div>
      <div class="field"><label>What happened</label><textarea id="np-whathappened" placeholder="Root cause / what went wrong… (needed before this can close)"></textarea></div>
    </div>
    <!-- Cross-links and a written description are almost never filled in at the
         moment someone is logging a task, and four more fields pushed Create
         below the fold. Collapsed by default; all of it is editable on the
         ticket page afterwards. The fields still exist in the DOM, so
         submitNewProject() reads them exactly as before whether or not this was
         ever opened. -->
    <details class="moredetails">
      <summary>More details — links and description</summary>
      <div id="np-project-fields">
        <div class="field"><label>Related parts</label>${pickerField("pp")}</div>
      </div>
      <div class="field"><label>Related tickets</label>${pickerField("rt")}</div>
      <div class="field"><label>Related work orders</label>${pickerField("rwo")}</div>
      <div class="field"><label>Description</label>${rteField("np-desc-editor")}</div>
    </details>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button id="np-submit-btn" class="primary" onclick="submitNewProject()">Create ${forSub ? "sub-ticket" : kindNoun("project")}</button></div>
  `);
}
/* The composer lives in rte.js now — one command registry with three shells
   (a scrolling bar, a selection pill on fine pointers, an insert menu), a paste
   pipeline, and drag-and-drop. rteToolbarButtons/rte/rteCode/rteTable and
   attachCommentImage are gone; rteField() is kept below because the create and
   edit MODALS still use a plain always-open editor, where a collapsed stub
   would be an extra click for a field you opened the form to fill in. */
function rteField(targetId, html) {
  return `${rteBar(targetId)}
  <div class="rte prose" id="${targetId}" contenteditable="true" data-ph="Details, goals, links…"
    onpaste="rtePaste(event,'${targetId}')" onkeydown="rteKeys(event,'${targetId}')"
    onkeyup="rteSyncBubble()" onmouseup="rteSyncBubble()" onfocus="RTE_ACTIVE='${targetId}'"
    ondragover="event.preventDefault();this.classList.add('dragover')"
    ondragleave="this.classList.remove('dragover')" ondrop="rteDrop(event,'${targetId}')"
    >${rteSeed(sanitizeHtml(html || ""))}</div>
  ${rteBubbleHtml()}${rteInsertHtml()}`;
}

function openNewSubTicket(parentId) { openNewProject(parentId); }
function ticketKindChanged() {
  const kind = document.getElementById("np-kind").value;
  const isIss = kind === "issue";
  document.getElementById("np-issue-fields").style.display = isIss ? "" : "none";
  document.getElementById("np-project-fields").style.display = isIss ? "none" : "";
  const noun = kindNoun(kind);
  document.getElementById("np-heading").textContent = "New " + noun;
  document.getElementById("np-title").placeholder = "What is this " + noun + "?";
  document.getElementById("np-submit-btn").textContent = "Create " + noun;
}
async function submitNewProject() {
  const title = document.getElementById("np-title").value.trim();
  if (!title) { toast("Give the project a name.","error"); return; }
  const parentId = NEW_TICKET_PARENT;
  const kindEl = document.getElementById("np-kind");
  const kind = parentId ? "project" : (kindEl && kindEl.value === "issue" ? "issue" : "project");
  let workOrderId = "";
  if (kind === "issue") {
    const woEl = document.getElementById("np-wo");
    workOrderId = woEl ? woEl.value : "";
    if (!workOrderId) { toast("An issue needs a work order.", "error"); return; }
  }
  NEW_TICKET_PARENT = null;
  // Read the WHOLE form before the await. allocId()'s offline fallback opens a
  // confirm modal, and openModal() replaces this form's markup — so any field
  // still unread at that point comes back null and throws.
  const assignees = pickerValues("pa");    // honor the picker exactly (don't force creator back in)
  const whEl = document.getElementById("np-whathappened");
  const form = {
    status: document.getElementById("np-status").value,
    priority: document.getElementById("np-priority").value,
    dueDate: document.getElementById("np-due").value,
    subteam: document.getElementById("np-subteam").value,
    description: sanitizeHtml(document.getElementById("np-desc-editor").innerHTML || ""),
    relatedParts: kind === "issue" ? [] : pickerValues("pp"),
    relatedTickets: pickerValues("rt"),
    relatedWorkOrders: pickerValues("rwo"),
    whatHappened: whEl ? whEl.value : "",
  };
  const id = await allocId("projects");
  if (!id) return;
  const p = {
    id, title, kind,
    status: form.status,
    priority: form.priority,
    dueDate: form.dueDate,
    subteam: form.subteam,
    description: form.description,
    assignees,
    // assignees + creator watch by default (creator watches the ticket they
    // made). A sub-ticket also inherits its parent's watchers: whoever asked
    // to be told about the parent asked to be told about its pieces.
    watchers: [...new Set([
      myEmail(), ...assignees,
      ...(parentId ? ((projById(parentId) || {}).watchers || []) : []),
    ])].filter(Boolean),
    relatedParts: form.relatedParts,
    relatedTickets: form.relatedTickets,
    relatedWorkOrders: form.relatedWorkOrders,
    files: [], comments: [],
    createdBy: myEmail(), retro: false,
  };
  if (parentId) p.parentId = parentId;
  if (kind === "issue") {
    p.workOrderId = workOrderId;
    p.resolutionMethod = "";
    p.whatHappened = form.whatHappened;
  }
  DB.projects.push(p); saveProj(p);
  assignees.filter(e => e !== myEmail()).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + title + "”", { tab: "projects", id }).catch(() => {}));
  if (kind === "issue") postToSlack(slackIssueCreatedMsg(p));
  closeModal();
  markSeen(id);
  view = { ...view, tab: "projects", mode: "detail", id, edit: false }; render();
}
function delProject(id) {
  const rec = recById("projects", id);
  confirmModal(`Delete ${id} for everyone? It goes to Recently deleted and can be restored for ${TRASH_DAYS} days.`, async () => {
    await trashRecords([{ coll: "projects", id, files: rec ? recStoragePaths(rec) : [] }]);
    view = { ...view, mode: "list", id: null }; render();
  });
}

/* ---- the tab: master-detail, board as the overview ----
   The last tab to get the rail+pane grammar Parts, Work Orders and Molds
   already speak: a persistent index on the left, the open ticket beside it,
   and the kanban board as the pane when nothing is selected. Going between
   tickets is one click in the rail now instead of detail -> back -> find ->
   detail. The old table view is gone: the rail IS the list, with better
   filters and the keyboard. The board survives because dragging a card
   between statuses is how the Monday meeting actually runs. */
function renderProjects() {
  const sel = selectedTicket();
  /* rail-off: the toolbar toggle can hand the rail's clamp() track to the
     discussion, but the DEFAULT with a ticket open is rail visible — Simon
     tried auto-collapse for two days and asked for the list back
     (2026-08-13). The board never gets the class, and the rail stays in the
     DOM either way — CSS hides it. view.tkRailOff persists across ticket-to-
     ticket navigation because every view spread carries it. */
  const railOff = sel && !!view.tkRailOff;
  return `<div class="mdsplit tkouter ${sel ? "has-sel" : ""}${railOff ? " rail-off" : ""}">
    ${renderTicketIndex()}${sel ? renderProjDetail() : renderTicketOverview()}
  </div>`;
}
function toggleTicketRail() { view = { ...view, tkRailOff: !view.tkRailOff }; render(); }

/* ---------- selection ----------
   view.mode === "detail" stays the switch, exactly as on Work Orders: a dozen
   tests set it directly, and openRecord()/consumePendingLink() write it. */
function selectedTicket() { return view.mode === "detail" ? projById(view.id) : null; }
function selectTicket(id) {
  view = { ...view, mode: "detail", id, edit: false, tkMetaAll: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearTicketSelection() { view = { ...view, mode: "list", edit: false }; render(); }
/* Arriving from a chip, the Dashboard or a deep link goes through openRecord(),
   which never calls selectTicket() — so the rail would render with the selected
   row far below the fold. Called from render(), same guarded idiom as
   syncWORailScroll(). */
function syncTicketRailScroll() {
  if (typeof document.querySelector !== "function") return;
  if (view.tab !== "projects" || view.mode !== "detail" || !view.id) return;
  const el = document.getElementById("pi-" + view.id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}

/* ---------- the index rows ----------
   Group headers are NOT in the plan's row entries and must never be: keyboard
   navigation walks tkIndexRows(), and a header in it would let j/k set view.id
   to a label and silently drop the pane back to the overview.

   Order is genealogy-first: each top-level project followed immediately by its
   sub-tickets (indented), then the issues as their own run. Status grouping
   would tear children from parents (their statuses are independent), and the
   parent-child adjacency is the thing the flat board could never show. */
const TK_STATUS_ORDER = { "In Progress": 0, "On Hold": 1, "Collecting Data": 2, "To Do": 3, "Done": 4, "Cancelled": 5 };
function tkClosed(p) { const st = projStatus(p); return st === "Done" || st === "Cancelled"; }
function isTkLate(p) { const dd = daysUntil(p.dueDate); return dd != null && dd < 0 && !tkClosed(p); }
function tkCmp(a, b) {
  return (TK_STATUS_ORDER[projStatus(a)] - TK_STATUS_ORDER[projStatus(b)])
    || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")
    || cmpId(a.id, b.id);
}
/* One plan for rail body AND keyboard rows, built once, so they cannot
   disagree about order. Entries are {head} labels or {row, child} tickets. */
function tkRailPlan() {
  const q = (view.q || "").toLowerCase();
  const kf = view.tkFilter || "";
  /* Like Work Orders, this rail does NOT hide finished records by default: a
     season's tickets are half archive, and a done-hiding default lands an
     all-done history on an empty rail that reads as a broken tab. Open and
     done are one chip each. */
  let rows = (DB.projects || [])
    .filter(p => !kf || ticketKind(p) === kf)
    .filter(p => !view.tkOpen || !tkClosed(p))
    .filter(p => !view.tkDone || tkClosed(p))
    .filter(p => !view.tkLate || isTkLate(p))
    .filter(p => !view.tkMine || isMine(p.assignees || []))
    .filter(p => !q || (p.title || "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      || (p.assignees || []).some(e => userName(e).toLowerCase().includes(q) || e.toLowerCase().includes(q)));
  // The open ticket never falls out from under you — a filter that would hide
  // what you are reading keeps it in place instead.
  const sel = selectedTicket();
  if (sel && !rows.includes(sel)) rows = rows.concat([sel]);

  const inRows = new Set(rows.map(r => r.id));
  const kids = new Map();       // parentId (present in rows) -> children
  const loose = [];             // children whose parent is filtered out or gone
  rows.filter(p => !isIssue(p) && p.parentId).forEach(p => {
    if (inRows.has(p.parentId)) {
      if (!kids.has(p.parentId)) kids.set(p.parentId, []);
      kids.get(p.parentId).push(p);
    } else loose.push(p);
  });
  const tops = rows.filter(p => !isIssue(p) && !p.parentId).sort(tkCmp);
  const issues = rows.filter(p => isIssue(p) && !p.parentId).sort(tkCmp);
  const byDue = (a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || cmpId(a.id, b.id);

  const entries = [];
  if (tops.length || loose.length) entries.push({ head: "Projects", rows: tops.concat(loose) });
  tops.forEach(p => {
    /* Collapsible sub-tickets (Simon, 2026-08-13). Fold state is per-parent in
       view.tkFold (session-scoped, survives view spreads like tkRailOff).
       Folded children leave the plan entirely, so the keyboard rows derived
       from this same plan skip them too — j/k never lands on a hidden row.
       The one exception is the OPEN ticket: the rail never hides what you
       are reading (same rule the filters follow above), so a selected child
       stays pinned under its folded parent. */
    const ks = (kids.get(p.id) || []).sort(byDue);
    const folded = !!((view.tkFold || {})[p.id]) && ks.length > 0;
    entries.push({ row: p, kids: ks.length, folded });
    ks.forEach(k => { if (!folded || (sel && k.id === sel.id)) entries.push({ row: k, child: true }); });
  });
  loose.sort(tkCmp).forEach(p => entries.push({ row: p }));
  if (issues.length) entries.push({ head: "Issues", rows: issues });
  issues.forEach(p => entries.push({ row: p }));
  return entries;
}
function tkIndexRows() { return tkRailPlan().filter(e => e.row).map(e => e.row); }
function toggleTkFold(id) {
  const f = { ...(view.tkFold || {}) };
  f[id] = !f[id];
  view = { ...view, tkFold: f };
  render();
}

function tkSummary() {
  const D = DB.projects || [];
  const open = D.filter(p => !tkClosed(p));
  return {
    total: D.length, open: open.length, done: D.length - open.length,
    late: D.filter(isTkLate).length,
    mine: open.filter(p => isMine(p.assignees || [])).length,
  };
}
function resetTicketFilters() { view = { ...view, tkOpen: false, tkLate: false, tkMine: false, tkDone: false, tkFilter: "", q: "" }; render(); }

/* One rail row. Four fixed slots, same grammar as the other rails, so the
   ≤900 collapse and the tablet-band rules apply without knowing what a
   ticket is. The status pill takes the slot Work Orders spends on its
   progress bar: status is the one thing a ticket has instead of progress. */
function tkIndexItem(p, opts) {
  opts = opts || {};
  const sel = view.mode === "detail" && view.id === p.id;
  const st = projStatus(p);
  const late = isTkLate(p);
  return `<div class="pitem ${sel ? "sel" : ""} ${tkClosed(p) ? "isdone" : ""} ${opts.child ? "pi-child" : ""}" id="pi-${esc(p.id)}"
      role="option" aria-selected="${sel}" title="${esc(p.id)} · ${esc(st)}"
      onclick="selectTicket('${esc(p.id)}')">
    <span class="pi-name">${opts.kids ? `<button class="pi-fold no-print" aria-expanded="${!opts.folded}"
      title="${opts.folded ? "Show" : "Hide"} ${opts.kids} sub-ticket${opts.kids === 1 ? "" : "s"}"
      onclick="event.stopPropagation();toggleTkFold('${esc(p.id)}')">${opts.folded ? `▸<span class="tny">${opts.kids}</span>` : "▾"}</button>` : ""}${isIssue(p) ? `<span class="kindbadge issue">Issue</span> ` : ""}${esc(p.title || p.id)}${
      projUnread(p) ? ' <span class="unread-dot" title="New activity"></span>' : ""}<span class="tny muted"> ${esc(p.id)}</span></span>
    <span class="pi-due ${late ? "warn" : ""}">${p.dueDate ? shortDate(p.dueDate) + (late ? " " + icon("warning", 12) : "") : ""}</span>
    <span class="pi-sub"><span class="status ${projStatusClass(st)}"><span class="dot"></span>${esc(st)}</span>${
      p.priority === "High" && !tkClosed(p) ? '<span class="prio High tny">High</span>' : ""}</span>
    <span class="pi-who">${(p.assignees || []).slice(0, 3).map(e => avatar(e, 20)).join("")}</span>
  </div>`;
}

function tkGroupHead(label, rows) {
  const late = rows.filter(isTkLate).length;
  return `<div class="pgrouphd">
    <span class="pg-name">${esc(label)}</span>
    <span class="pg-n">${rows.length} ${rows.length === 1 ? "ticket" : "tickets"}</span>
    ${late ? `<span class="pg-n pg-late">${icon("warning", 12)} ${late} late</span>` : ""}
  </div>`;
}

function renderTicketIndex() {
  const D = DB.projects || [];
  const entries = tkRailPlan();
  const nRows = entries.filter(e => e.row).length;
  const s = tkSummary();
  const kf = view.tkFilter || "";
  return `
  <aside class="mdindex" aria-label="Tickets index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib" onclick="openNewProject()">${icon("plus", 15)} New ticket</button>
        <span class="muted tny" style="margin-left:auto">${nRows} of ${D.length} tickets</span>
      </div>
      <div class="psum">
        ${summaryChip("open", s.open, !!view.tkOpen, "view.tkOpen=!view.tkOpen;view.tkDone=false;render()")}
        ${summaryChip("late", s.late, !!view.tkLate, "view.tkLate=!view.tkLate;view.tkMine=false;render()", s.late ? "bad" : "")}
        ${summaryChip("mine", s.mine, !!view.tkMine, "view.tkMine=!view.tkMine;view.tkLate=false;render()")}
        ${summaryChip("done", s.done, !!view.tkDone, "view.tkDone=!view.tkDone;view.tkOpen=false;render()")}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search title / id / assignee…" value="${esc(view.q)}" oninput="searchInput(this)">
        <button class="sm sortdir" title="Clear filters" onclick="resetTicketFilters()">✕</button>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Tickets">
      ${nRows ? entries.map(e => e.head ? tkGroupHead(e.head, e.rows) : tkIndexItem(e.row, { child: e.child, kids: e.kids, folded: e.folded })).join("")
        : `<div class="pempty muted">${D.length ? "No tickets match these filters." : "No tickets yet — <b>New ticket</b> to start one."}</div>`}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      selectedTicket() ? "<span><kbd>1</kbd>–<kbd>5</kbd> jump</span>" : ""
    }<span><kbd>/</kbd> search</span><span><kbd>e</kbd> edit</span><span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* The overview pane: the board, exactly as it was, one level in. */
function renderTicketOverview() {
  return `<section class="mddetail" aria-label="Tickets board">
    ${DB.projects.length === 0
      ? `<div class="card">No tickets yet. <b>+ New ticket</b> to start one.</div>`
      : renderProjBoard()}
  </section>`;
}
/* Sub-tickets used to be filtered out of the board, on the theory that they
   belong to their parent's page. What that actually meant was that breaking a
   ticket down HID the work: "Machine the plug" existed, was assigned, was due
   Friday, and appeared nowhere the team plans from.

   They get their own card, in their own status column — a sub-ticket has its
   own status, so nesting it under a parent in a different column was never
   going to work on a board anyway. What keeps a card from reading as an
   orphan is parentLine(); in the rail it is the indent under the parent. */
function projMatch(p) {
  const q = (view.q || "").toLowerCase();
  const kf = view.tkFilter || "";
  if (kf && ticketKind(p) !== kf) return false;
  return !q || (p.title || "").toLowerCase().includes(q) || (p.assignees || []).some(e => userName(e).toLowerCase().includes(q) || e.toLowerCase().includes(q));
}

function renderProjBoard() {
  const cols = PROJ_STATUS.map(st => {
    const list = DB.projects.filter(p => projStatus(p) === st && projMatch(p))
      .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    return `<div class="col col-${STATUS_SLUG[st]}" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="projDrop('${st}',this)">
      <h4>${st}<span>${list.length}</span></h4>
      ${list.map(projCard).join("")}
    </div>`;
  }).join("");
  // .boardwrap scrolls sideways so all six statuses stay on one row at desktop
  // width instead of wrapping Done and Cancelled under To Do.
  return `<div class="boardwrap"><div class="board">${cols}</div></div>`;
}
function projCard(p) {
  const dd = daysUntil(p.dueDate), late = dd != null && dd < 0 && projStatus(p) !== "Done";
  const av = (p.assignees || []).slice(0, 4).map(e => avatar(e, 22)).join("");
  const nComments = projComments(p).length, nFiles = (p.files || []).length;
  return `<div class="pcard" draggable="true" ondragstart="projDragStart('${p.id}')" onclick="openRecord('projects','${p.id}')">
    <div class="t"><span class="kindbadge ${ticketKind(p)}">${isIssue(p) ? "Issue" : "Project"}</span> ${esc(p.title || p.id)}${projUnread(p) ? ' <span class="unread-dot" title="New activity"></span>' : ""}</div>
    ${parentLine(parentOf(p))}
    <div class="meta">
      <span class="prio ${esc(p.priority)}">${esc(p.priority || "")}</span>
      ${p.dueDate ? `<span class="${late ? "warn" : ""}">${esc(p.dueDate)}${late ? " " + icon("warning", 13) : ""}</span>` : ""}
      <span class="right">${nComments ? `<span class="cnt">${icon("message", 14)}${nComments}</span>` : ""}${nFiles ? `<span class="cnt">${icon("paperclip", 14)}${nFiles}</span>` : ""}<span class="avatar-stack">${av}</span></span>
    </div>
  </div>`;
}
function projDragStart(id) { PROJ_DRAG = id; }
function projDrop(status, el) {
  el.classList.remove("dragover");
  const p = projById(PROJ_DRAG); PROJ_DRAG = null;
  if (!p || projStatus(p) === status) return;
  const blocked = statusGate(p, status);
  if (blocked) { toast(blocked, "error"); render(); return; }
  const prevStatus = projStatus(p);
  p.status = status; saveProj(p, "status"); announceIfResolved(p, prevStatus); render();
}
/* renderProjTable() is gone. The rail is the list now — same records, better
   filters, keyboard walk — and two list-shaped surfaces would drift apart. */

/* ---- ticket page ---- */
function editProject() {
  const p = projById(view.id);
  pickerInit("ea", assigneeItems(), p.assignees || []);
  pickerInit("ep", partItems(), p.relatedParts || []);
  pickerInit("ert", ticketItems(p.id), p.relatedTickets || []);
  pickerInit("erwo", workOrderItems(), p.relatedWorkOrders || []);
  view.edit = true; render();
}
function saveProjectEdits() {
  const p = projById(view.id);
  const newStatus = document.getElementById("ep-status").value;
  // Stage issue-only fields first so the gate check sees the values about to be
  // saved, not the stale ones already on p.
  if (isIssue(p)) {
    const woEl = document.getElementById("ep-wo");
    if (woEl && !woEl.value) { toast("An issue needs a work order.", "error"); return; }
    if (woEl) p.workOrderId = woEl.value;
    p.resolutionMethod = document.getElementById("ep-resolution").value;
  }
  const blocked = statusGate(p, newStatus);
  if (blocked) { toast(blocked, "error"); return; }
  const prevStatus = projStatus(p);
  const wasAssigned = p.assignees || [];
  p.title = document.getElementById("ep-title").value.trim() || p.title;
  p.status = newStatus;
  p.priority = document.getElementById("ep-priority").value;
  p.dueDate = document.getElementById("ep-due").value;
  p.subteam = document.getElementById("ep-subteam").value;
  p.assignees = pickerValues("ea");
  p.relatedTickets = pickerValues("ert");
  p.relatedWorkOrders = pickerValues("erwo");
  if (!isIssue(p)) p.relatedParts = pickerValues("ep");
  // Notify anyone newly assigned.
  p.assignees.filter(e => e !== myEmail() && !wasAssigned.includes(e)).forEach(e =>
    fb.notify(e, "assigned", signerName() + " assigned you to “" + (p.title || p.id) + "”", { tab: "projects", id: p.id }).catch(() => {}));
  // keep watchers ⊇ assignees (assigning someone opts them into updates)
  p.watchers = [...new Set([...(p.watchers || []), ...p.assignees])];
  // Field-scoped writes, NOT a whole-doc save — so a teammate's concurrent
  // comment/file/watcher change (which lands on other fields) can't be clobbered
  // by this edit landing between their write and our Save.
  const fields = ["title", "status", "priority", "dueDate", "subteam", "assignees", "relatedTickets", "relatedWorkOrders", "watchers"];
  fields.push(isIssue(p) ? "workOrderId" : "relatedParts");
  if (isIssue(p)) fields.push("resolutionMethod");
  fields.forEach(f => saveProj(p, f));
  announceIfResolved(p, prevStatus);
  view.edit = false; render();
}
function toggleWatch() {
  const p = projById(view.id);
  const me = myEmail();
  p.watchers = (p.watchers || []).includes(me) ? p.watchers.filter(e => e !== me) : [...(p.watchers || []), me];
  saveProj(p, "watchers"); render();
}
// Quick status change from the top-of-page dropdown — the same gate applies
// whether status changes here or via the full edit form or a board drag.
function setTicketStatus(id, val) {
  const p = projById(id);
  if (!p || projStatus(p) === val) return;
  const blocked = statusGate(p, val);
  if (blocked) { toast(blocked, "error"); render(); return; }
  const prevStatus = projStatus(p);
  p.status = val; saveProj(p, "status"); announceIfResolved(p, prevStatus); render();
}

/* ---- resolving an issue, from any surface ----
   Three surfaces close issues now — the resolve band on the ticket, the WO
   closeout modal, and the old statusdrop — and they all funnel through
   statusGate and announceIfResolved exactly once, from here. Never a second
   gate implementation. */
// Disposition without closing is a real state: it is what unlocks
// undisposedIssuesForWO and lets the WO complete while the ticket stays open.
function setIssueDisposition(id, val) {
  const p = projById(id);
  if (!p || !isIssue(p)) return;
  p.resolutionMethod = val || "";
  saveProj(p, "resolutionMethod");
  render();
}
/* Stage the disposition and (optionally) the narrative, then close through the
   gate. `narrative` undefined means "leave whatHappened alone" — the resolve
   band's richField already saved it in place, and clobbering it would lose
   rich content. When a plain narrative IS written (the closeout modal's
   textarea), the Html sibling is cleared so a stale rich copy can't disagree
   with the plain truth (the notes/notesHtml rule from workorders.js).
   Returns the gate's string on refusal — callers render it verbatim — or
   null on success, with the single Slack announce fired via the choke point. */
function resolveIssue(id, method, narrative, dispo) {
  const p = projById(id);
  if (!p || !isIssue(p)) return "Not an issue.";
  if (method !== undefined && (method || "") !== (p.resolutionMethod || "")) {
    p.resolutionMethod = method || "";
    saveProj(p, "resolutionMethod");
  }
  if (narrative !== undefined) {
    const text = String(narrative).trim();
    if (text && text !== (p.whatHappened || "")) {
      p.whatHappened = text;
      p.whatHappenedHtml = "";
      saveProj(p, "whatHappened");
      saveProj(p, "whatHappenedHtml");
    }
  }
  if (dispo !== undefined) {
    const text = String(dispo).trim();
    if (text && text !== (p.dispositionNote || "")) {
      p.dispositionNote = text;
      saveProj(p, "dispositionNote");
    }
  }
  const blocked = statusGate(p, "Done");
  if (blocked) { render(); return blocked; }
  const prevStatus = projStatus(p);
  p.status = "Done"; saveProj(p, "status");
  announceIfResolved(p, prevStatus);
  render();
  return null;
}
/* Reopen CLEARS the disposition (Simon's pick): reopening means the fix was
   wrong, so the issue must gate its work order again — undisposedIssuesForWO
   keys on resolutionMethod, and a reopened issue that kept one would let a WO
   complete over a problem somebody just said is not fixed. The old method
   survives as a comment, so history is a read not a memory. */
/* The ticket page's own writer for the second narrative. Saves on change like
   every other field there; the gate reads the record, not the box. */
function setDispositionNote(id, val) {
  const p = projById(id);
  if (!p || !isIssue(p)) return;
  const text = String(val || "").trim();
  if (text === (p.dispositionNote || "")) return;
  p.dispositionNote = text;
  saveProj(p, "dispositionNote");
  render();
}

function reopenIssue(id) {
  const p = projById(id);
  if (!p || !isIssue(p) || projStatus(p) !== "Done") return;
  const old = p.resolutionMethod;
  p.status = "In Progress"; saveProj(p, "status");
  p.resolutionMethod = ""; saveProj(p, "resolutionMethod");
  /* The disposition note goes with the disposition. whatHappened SURVIVES a
     reopen — the root cause is still true — but "what was done" is not true any
     more: reopening is somebody saying the fix did not work. Leaving it would
     prefill the next closeout with a stale account of a repair that failed. */
  if (p.dispositionNote) { p.dispositionNote = ""; saveProj(p, "dispositionNote"); }
  const note = `Reopened by ${signerName()}${old ? ` — the “${old}” disposition is withdrawn` : ""}.`;
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), text: note, html: esc(note) };
  p.comments = (p.comments || []).concat([c]);           // optimistic
  saveField("projects", p, "comments", arr => (arr || []).concat([c]));
  // The work order Issues section keeps unsaved row text in WI_DRAFTS; a
  // withdrawn disposition must not come back as a draft shadowing the record.
  if (typeof wiClearDraft === "function") wiClearDraft(id);
  toast(`${p.id} reopened — it gates ${p.workOrderId || "its work order"} again.`);
  render();
}

/* The back button, and what it should say. It used to be "All tickets" and to
   always mean the board, so following a link from one ticket to another and
   pressing it threw away where you were. Now it goes back one step and NAMES
   the step, because a button that says "Back" without saying back to what is a
   guess you have to take before you can find out. With nothing behind you it is
   the old button, word for word. */
function ticketBackBtn() {
  const prev = navPeek();
  const label = !prev || prev.mode !== "detail"
    ? "All tickets"
    : (() => {
        const rec = recById(prev.tab === "workorders" ? "workOrders" : prev.tab, prev.id);
        const name = rec ? (rec.title || rec.partName || rec.id) : prev.id;
        return "Back to " + String(name).slice(0, 28);
      })();
  return `<button class="ib" title="${esc(label)}" onclick="navBack({tab:'projects',mode:'list',id:null})">${icon("chevronLeft", 16)} ${esc(label)}</button>`;
}

/* The rail stays visible when a ticket opens; this toggle hides it (rail-off)
   when the discussion wants the full width, and shows it again. Hidden <=900
   where has-sel hides the rail regardless. */
function ticketRailBtn() {
  const on = !view.tkRailOff;
  return `<button class="ib tkrail-btn" title="${on ? "Hide the tickets list" : "Show the tickets list"}"
    aria-label="${on ? "Hide the tickets list" : "Show the tickets list"}" aria-pressed="${on}"
    onclick="toggleTicketRail()">${icon("menu", 16)}</button>`;
}

/* ---------- the jump bar ----------
   Same idea as WO_SECTIONS, with one difference: a ticket's shape varies by
   kind, so the sections are a FUNCTION returning the filtered list — the bar
   never shows a dead button for a section this ticket does not have, and the
   digit keys index the same filtered array. Nav and body render from one
   call per render, and a test asserts every button's anchor exists on the
   page, so they cannot drift apart. Buttons, never anchors: an href="#tk-…"
   would clobber the #/PROJ-SN6-xxx deep link in the URL hash. */
function tkSections(p) {
  const out = [];
  if (isIssue(p)) out.push({
    id: "issue", label: "Issue", anchor: "tk-issue",
    badge: x => x.resolutionMethod ? "✓" : "",
    warn: x => projStatus(x) !== "Done" && (!x.workOrderId || !!statusGate(x, "Done")),
  });
  out.push({ id: "desc", label: "Description", anchor: "tk-desc", badge: () => "" });
  if (!isIssue(p) && !p.parentId) out.push({
    id: "subs", label: "Sub-tickets", anchor: "tk-subs",
    badge: x => { const k = subTickets(x); return k.length ? `${k.filter(t => projStatus(t) === "Done").length}/${k.length}` : ""; },
    warn: x => subTickets(x).some(isTkLate),
  });
  out.push({
    id: "meta", label: "Details & links", anchor: "tk-meta",
    badge: x => String(((x.assignees || []).length + (x.docs || []).length + (x.files || []).length) || ""),
  });
  out.push({
    id: "comments", label: "Comments", anchor: "tk-comments",
    badge: x => String(projComments(x).length || ""),
    warn: x => projUnread(x),
  });
  return out;
}
function tkSecnav(p) {
  return `<nav class="secnav no-print" aria-label="Jump to a section of this ticket">
    ${tkSections(p).map((s, i) => {
      const n = s.badge ? s.badge(p) : "";
      const warn = s.warn && s.warn(p);
      return `<button type="button" class="secnav-btn ${n ? "" : "empty"} ${warn ? "warn" : ""}"
        id="tksec-${esc(s.id)}" title="${esc(s.label)} (${i + 1})"
        onclick="secJump('${esc(s.anchor)}')">${esc(s.label)}${n ? `<span class="secnav-n">${esc(n)}</span>` : ""}${warn ? '<span class="secnav-dot" aria-hidden="true"></span>' : ""}</button>`;
    }).join("")}
  </nav>`;
}

function renderProjDetail() {
  const p = projById(view.id);
  // A dangling id (deleted ticket, mistyped link) falls back to the overview,
  // never a throw — same guard as the other converted tabs.
  if (!p) { view.mode = "list"; return renderTicketOverview(); }
  markSeen(p.id);
  const E = view.edit;
  const watching = (p.watchers || []).includes(myEmail());
  const kindLabel = isIssue(p) ? "Issue" : "Project";
  if (E) {
    return `<section class="mddetail" aria-label="Ticket detail">
    <div class="toolbar no-print">
      ${ticketBackBtn()}${ticketRailBtn()}
      <span class="kindbadge ${ticketKind(p)}">${kindLabel}</span>
      <button class="primary" onclick="saveProjectEdits()">Save</button>
      <button onclick="view.edit=false;render()">Cancel</button>
      ${isLead() ? `<button class="danger" onclick="delProject('${p.id}')">Delete</button>` : ""}
    </div>
    <div class="card">
      <div class="field"><label>Title</label><input id="ep-title" value="${esc(p.title)}"></div>
      <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Status</label><select id="ep-status">${PROJ_STATUS.map(s => `<option ${projStatus(p) === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Priority</label><select id="ep-priority">${PRIORITY.map(s => `<option ${p.priority === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Due date</label><input id="ep-due" type="date" value="${esc(p.dueDate || "")}"></div>
      <div class="field"><label>Subteam <span class="muted nocaps">— for Weekly Plan</span></label>
        <select id="ep-subteam"><option value="" ${p.subteam ? "" : "selected"}>Unassigned</option>${SUBTEAMS.map(s => `<option ${p.subteam === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Assignees</label>${pickerField("ea")}</div>
      ${isIssue(p) ? `
      <div class="field"><label>Work order <span class="req">*required</span></label><select id="ep-wo">${woSelectOptions(p.workOrderId)}</select></div>
      <div class="field"><label>Resolution method <span class="req">*required to close</span></label>
        <select id="ep-resolution"><option value="" ${p.resolutionMethod ? "" : "selected"}>— not yet disposed —</option>${RESOLUTION_METHODS.map(m => `<option ${p.resolutionMethod === m ? "selected" : ""}>${m}</option>`).join("")}</select></div>
      ` : `<div class="field"><label>Related parts</label>${pickerField("ep")}</div>`}
      <div class="field"><label>Related tickets</label>${pickerField("ert")}</div>
      <div class="field"><label>Related work orders</label>${pickerField("erwo")}</div>
      <!-- Description and What happened are NOT here any more. They are edited
           in place on the ticket page, by clicking the text, so there is one
           place to change each of them rather than two that can disagree about
           which write lands last. -->
    </div></section>`;
  }
  const partChips = (p.relatedParts || []).map(id => chip("parts", id, (recById("parts", id) || {}).partName || id)).join(" ") || '<span class="muted">none</span>';
  const ticketChips = (p.relatedTickets || []).map(id => chip("projects", id, (recById("projects", id) || {}).title || id)).join(" ") || "";
  const woChips = (p.relatedWorkOrders || []).map(id => chip("workOrders", id, id)).join(" ") || "";
  const dd = daysUntil(p.dueDate);
  const st = projStatus(p);
  const gateMsg = isIssue(p) && st !== "Done" ? statusGate(p, "Done") : null;
  const kids = !isIssue(p) && !p.parentId ? subTickets(p) : [];
  return `<section class="mddetail" aria-label="Ticket detail">
  <div class="toolbar no-print">
    ${ticketBackBtn()}${ticketRailBtn()}
    <span class="kindbadge ${ticketKind(p)}">${kindLabel}</span>
    <div class="statusdrop ${projStatusClass(st)}"><select onchange="setTicketStatus('${p.id}',this.value)">${PROJ_STATUS.map(s => `<option ${st === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <button class="primary" onclick="editProject()">Edit</button>
    <button onclick="toggleWatch()">${watching ? "★ Watching" : "☆ Watch"}</button>
  </div>
  ${lineageBar("projects", p.id)}
  <div class="card">
    <h2>${esc(p.title || "(untitled ticket)")}</h2>
    <div class="muted">${esc(p.id)} · <span class="prio ${esc(p.priority)}">${esc(p.priority || "")} priority</span>${p.dueDate ? ` · due ${esc(p.dueDate)}${dd != null ? ` (${dd < 0 ? Math.abs(dd) + " days late" : dd + " days out"})` : ""}` : ""}</div>

    ${/* A jump bar, not a switch: everything below stays rendered, this
          scrolls to it. Counts and attention dots say there are five
          comments, or that an issue still cannot close, without going
          there. Digits 1-5 do the same from the keyboard. */""}
    ${tkSecnav(p)}

    <!-- Split at 901px: metadata into a rail, the narrative into the wide
         column. Five h3-plus-one-chip-row blocks were each spanning the full
         1560px content box to carry a handful of words, and pushing the
         comments (the thing this page is FOR) to roughly y=900, below the fold.

         .tksplit is its OWN grid now, not .mdsplit: since the Tickets tab
         became a master-detail split, the generic <=900 mdsplit rules (single
         column, has-sel hiding the index) would cascade into this inner split
         too. And the DOM puts .tkmain FIRST: on a phone the split stacks by
         source order, so the description and thread come first and the
         metadata lands below them. That retires the forced-open details rail
         (and the accepted phone cost documented with it) by rendering the rail
         differently instead of fighting the element — the fix the postmortem
         in tools/README.md said to wait for. Grid areas put the metadata BAND
         visually on top on wide screens: it was the page's third left column
         (nav sidebar, tickets rail, then this) and the discussion was squeezed
         to ~730px on a 1600px content box. -->
    <!-- data-lbgroup: one photo set for the whole ticket. The Files grid is in
         the rail and the comment photos are in the wide column, and "next
         photo" should walk both — a photo belongs to the ticket, not to the
         column it happens to be rendered in. -->
    <div class="tksplit" data-lbgroup="projects:${esc(p.id)}">
      <div class="tkmain">
    ${isIssue(p) ? `
    ${/* The issue's narrative — work order, what happened, disposition —
          lives in the WIDE column, not the metadata rail: it is the reason
          the record exists, and in the rail it was the thing a phone buried
          below the fold. */""}
    <h3 id="tk-issue">Work order <span class="muted nocaps">— required</span></h3>
    <div class="stagerow">${p.workOrderId ? chip("workOrders", p.workOrderId, p.workOrderId) : '<span class="warn">none set</span>'}</div>
    <h3>What happened <span class="muted nocaps">— required before this can close</span></h3>
    ${richField("projects", p.id, "whatHappened", {
      plain: true, label: "What happened",
      empty: "What went wrong, and why. Photos of the defect belong here.",
      upload: name => `projects/${p.id}/${Date.now()}-${name}`,
    })}
    ${(() => {
      /* The resolve band: the whole close-out on one screen. The disposition
         select saves the moment it changes (disposed-but-open is a real state
         — it is what lets the WO complete), the root cause is the richField
         right above, and the one button closes through resolveIssue — the
         same statusGate + single Slack announce as every other path. The
         band absorbs the old amber banner: failing shows the gate's exact
         words, passing shows the button. It replaces the Edit-form round
         trips: disposition used to be editable ONLY in the edit form while
         the narrative lived ONLY here, so closing one issue was two passes
         through Edit plus the status dropdown. */
      const st = projStatus(p);
      if (st === "Done") return `<h3>Resolution method</h3>
        <div class="resolveband done"><span class="ok">✅ Resolved — ${esc(p.resolutionMethod || "?")}</span>
        <button class="link no-print" onclick="reopenIssue('${p.id}')">Reopen</button></div>`;
      if (st === "Cancelled") return `<h3>Resolution method</h3>
        <div class="muted tny">Cancelled — turned out not to be a real issue, so it needs no disposition.</div>`;
      return `<h3>${esc(dispoPrompt(p.resolutionMethod))}</h3>
      <div class="field no-print">
        <textarea id="tk-dispo-${p.id}" placeholder="Required before this can close."
          onchange="setDispositionNote('${p.id}', this.value)">${esc(p.dispositionNote || "")}</textarea>
      </div>
      <h3>Resolve</h3>
      <div class="resolveband no-print">
        <select aria-label="Resolution method" onchange="setIssueDisposition('${p.id}',this.value)">
          <option value="" ${p.resolutionMethod ? "" : "selected"}>— not yet disposed —</option>
          ${RESOLUTION_METHODS.map(m => `<option ${p.resolutionMethod === m ? "selected" : ""}>${m}</option>`).join("")}
        </select>
        ${gateMsg ? "" : `<button class="primary" onclick="const r=resolveIssue('${p.id}');if(r)toast(r,'error')">Resolve issue</button>`}
      </div>
      ${gateMsg ? `<div class="gate"><span class="gi">⚠</span><div><b>Can't close yet</b> — ${gateMsg}</div></div>` : ""}`;
    })()}
    ` : ""}
    <h3 id="tk-desc">Description</h3>
    ${richField("projects", p.id, "description", {
      label: "Description",
      empty: "What this is, and what done looks like.",
      upload: name => `projects/${p.id}/${Date.now()}-${name}`,
    })}
    ${!isIssue(p) && !p.parentId ? `
    ${/* The ticket is the parent record, so its children get the app's
          sub-collection grammar (table.sub), same as the part page's runs
          table — the flat chip row this replaces said nothing about due
          dates, priority or lateness, which is what you check a breakdown
          for. Statuses stay independent; the count is display only. */""}
    <h3 id="tk-subs">Sub-tickets <span class="muted nocaps">${kids.length ? `— ${kids.filter(k => projStatus(k) === "Done").length} of ${kids.length} done, tracked independently` : ""}</span></h3>
    ${kids.length ? `<table class="sub tksub">
      <thead><tr><th>Ticket</th><th>Status</th><th>Due</th><th>Priority</th><th>Assignees</th></tr></thead>
      <tbody>${kids.map(k => {
        const kst = projStatus(k);
        const kdd = daysUntil(k.dueDate);
        const klate = kdd != null && kdd < 0 && kst !== "Done" && kst !== "Cancelled";
        return `<tr>
          <td>${chip("projects", k.id, k.id)} ${esc(k.title || "")}</td>
          <td><span class="status ${projStatusClass(kst)}"><span class="dot"></span>${esc(kst)}</span></td>
          <td class="${klate ? "warn" : ""}">${k.dueDate ? esc(shortDate(k.dueDate)) + (klate ? " " + icon("warning", 13) : "") : '<span class="muted">—</span>'}</td>
          <td><span class="prio ${esc(k.priority)}">${esc(k.priority || "")}</span></td>
          <td><span class="avatar-stack">${(k.assignees || []).slice(0, 3).map(e => avatar(e, 20)).join("")}</span></td>
        </tr>`;
      }).join("")}</tbody></table>`
      : '<span class="muted">No sub-tickets yet.</span>'}
    <div class="no-print" style="margin-top:6px"><button class="sm" onclick="openNewSubTicket('${p.id}')">+ Add sub-ticket</button></div>
    ` : ""}

  <!-- The thread lives INSIDE the wide column, beside the rail rather than
       stacked under the whole split — otherwise a ticket with a long metadata
       rail pushes the discussion back down the page, which is the problem this
       layout exists to solve. Its own card, because inside one big card a
       comment reads as a paragraph in a form; framed like the ticket itself it
       reads as the document it is meant to be. -->
  <div class="card thread-card">
    ${(() => {
      // Uploads from this composer land in the ticket's own Storage tree, which
      // is the one storage.rules already scopes.
      rteSetUpload(name => `projects/${p.id}/${Date.now()}-${name}`);
      const draft = loadDraft("comment", p.id);
      // Composer at the TOP of the thread (via lead): with newest-first
      // comments, writing and reading the latest update both happen at the top
      // of the card instead of after a scroll to the bottom.
      const composer = composerHtml({
        targetId: "comment-editor",
        html: sanitizeHtml(draft),
        placeholder: "Write a comment…",
        oninput: `draftInput('comment','${p.id}',this)`,
        onpost: `postComment('${p.id}')`,
        oncancel: `closeComposer('comment-editor')`,
        postLabel: "Comment as " + signerName(),
      }) + (draft && composerOpen("comment-editor")
        ? `<div class="muted tny">Draft restored. <button class="link" onclick="discardCommentDraft('${p.id}')">Discard it</button></div>` : "");
      return threadHtml("projects", p.id, projComments(p), {
        lead: composer,
        empty: "No comments yet. The first one usually says what was actually built.",
      });
    })()}
  </div>
      </div>
      <aside class="tkmeta" id="tk-meta" aria-label="Ticket details, files and links">
        ${/* The count line survives from the old disclosure summary: it is
              still the one-glance answer to what is over here, on every
              width, now that there is nothing to open. */""}
        ${(() => {
          const n = [
            [(p.assignees || []).length, "assignee"],
            [(p.docs || []).length, "doc"],
            [(p.files || []).length, "file"],
          ].filter(([c]) => c).map(([c, w]) => `${c} ${w}${c === 1 ? "" : "s"}`);
          return `<div class="tny muted">Details, files and links${n.length ? ` — ${esc(n.join(", "))}` : ""}</div>`;
        })()}
    ${/* Two wrapping rows: people and chips share the first, documents and
          files split the second. The attachment row is height-capped with a
          fade and a "Show all" BUTTON — a class toggle on view.tkMetaAll,
          reset by selectTicket() so every ticket opens capped. Never a
          details element here; see the comment above .tksplit and the
          postmortem in tools/README.md. */""}
    <div class="tkband-row">
      <div class="tkband-g"><h3>Assignees</h3>
        <div class="stagerow">${(p.assignees || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">unassigned</span>'}</div></div>
      <div class="tkband-g"><h3>Watchers <span class="muted nocaps">— flagged on their Dashboard when there's new activity (per browser)</span></h3>
        <div class="stagerow">${(p.watchers || []).map(e => `<span class="chip">${avatar(e, 20)} ${esc(userName(e))}</span>`).join("") || '<span class="muted">none</span>'}</div></div>
      ${isIssue(p) ? "" : `<div class="tkband-g"><h3>Related parts</h3><div class="stagerow">${partChips}</div></div>`}
      ${(ticketChips || woChips) ? `<div class="tkband-g"><h3>Linked</h3><div class="linkrow">${ticketChips}${woChips}</div></div>` : ""}
    </div>
    ${(() => {
      const nAtt = (p.docs || []).length + (p.files || []).length;
      const expanded = !!view.tkMetaAll;
      const capped = !expanded && nAtt > 6;
      return `<div class="tkband-row tkband-attach${capped ? " capped" : ""}">
      <div class="tkband-g grow"><h3>Documents <span class="muted nocaps">— Google Docs, Slides and Sheets</span></h3>
        ${docLinkList(p.docs, { onRemove: `rmProjDoc`, empty: "None linked yet.", addLabel: "+ Link a document" })}
        <div class="no-print" style="margin-top:8px"><button class="sm" onclick="openDocLinkModal({ coll: 'projects', id: '${p.id}' })">+ Link a document</button></div></div>
      <div class="tkband-g grow"><h3>Files</h3>
        <div class="filegrid">
          ${(p.files || []).map(fileItem).join("") || '<span class="muted">No files yet.</span>'}
        </div>
        <div class="no-print" style="margin-top:8px"><button class="sm" onclick="addProjectFiles()">+ Add files</button></div></div>
    </div>
    ${capped ? `<div class="no-print tkband-more"><button class="sm" onclick="view.tkMetaAll=true;render()">Show all ${nAtt} attachments</button></div>` : ""}
    ${expanded && nAtt > 6 ? `<div class="no-print tkband-more"><button class="sm" onclick="view.tkMetaAll=false;render()">Show less</button></div>` : ""}`;
    })()}
      </aside>
    </div>
  </div></section>`;
}

/* One attachment tile, shared by tickets, work orders and the budget receipt.
   A photo opens in the viewer rather than navigating: the thumbnail used to be
   a dead CSS background beside an <a download>, so the only way to LOOK at a
   photo someone had attached was to leave the app and open the raw Storage URL
   — which also threw away any unposted draft on the page.

   The image is still drawn as a background rather than an <img>, because
   `center/cover` is what makes a grid of mixed-aspect shop photos read as a
   grid. So the viewer is told about it by data-lb-src instead, which is also
   what lets the arrows walk a mixed run of grid tiles and inline comment
   photos. Anything that is not an image keeps the download anchor it had. */
/* A PDF in a file grid used to be a download and nothing else: the drawing you
   wanted to glance at made you leave the app, open Preview, and come back. The
   Documents tab has had a real viewer since it shipped, so this reuses its
   iframe rather than inventing a second one. The filename underneath stays a
   download link, because reading it here and having a copy are different jobs. */
function isPdfFile(f) {
  return (f.type || "") === "application/pdf" || /\.pdf$/i.test(f.name || "");
}
function openFilePreview(url, name) {
  openModal(`<h2>${esc(name)}</h2>
    <iframe class="docview" src="${esc(url)}" title="${esc(name)}"></iframe>
    <div class="foot">
      <a href="${esc(url)}" download="${esc(name)}" target="_blank" rel="noopener"><button>Download</button></a>
      <button class="primary" onclick="closeModal()">Close</button>
    </div>`, { wide: true });
}
function fileItem(f) {
  const isImg = (f.type || "").startsWith("image/");
  const name = esc(f.name || "");
  if (!isImg && isPdfFile(f)) {
    return `<div class="fileitem">
      ${/* url and name ride as data-, not as arguments inside an onclick string:
            esc() escapes " but not ', so a file called "Bob's plan.pdf" would
            end the JS literal. Same reason .thumb already carries data-lb-name. */""}
      <button type="button" class="thumb" title="${name}" aria-label="Preview ${name}"
        data-pdf="${esc(f.url)}" data-pdf-name="${name}"
        onclick="openFilePreview(this.dataset.pdf, this.dataset.pdfName)">${icon("file", 26)}</button>
      <div class="fn"><a href="${esc(f.url)}" download="${name}" target="_blank" rel="noopener" title="${name}">${name}</a></div></div>`;
  }
  /* The icon is a link, not a decoration. On a phone the only thing you could
     tap on a non-image file was the filename underneath it — one line of 11.5px
     text, 14px tall, about a third of a fingertip — while the 84px square above
     it did nothing. An image card already had a real target (the thumb opens
     the lightbox); this gives the other kind the same. */
  if (!isImg) {
    return `<div class="fileitem">
      <a class="thumb" href="${esc(f.url)}" download="${name}" target="_blank" rel="noopener" title="${name}" aria-label="Download ${name}">${icon("file", 26)}</a>
      <div class="fn"><a href="${esc(f.url)}" download="${name}" target="_blank" rel="noopener" title="${name}">${name}</a></div></div>`;
  }
  return `<div class="fileitem">
    <button type="button" class="thumb" style="background-image:url('${esc(f.url)}')"
      data-lb-src="${esc(f.url)}" data-lb-name="${name}" title="${name}" aria-label="Open ${name}"></button>
    <div class="fn"><a href="${esc(f.url)}" download="${name}" target="_blank" rel="noopener" title="${name}">${name}</a></div>
  </div>`;
}
/* Attaching a file, for any record that has a `files` array. Written generically
   because work orders needed one too — a mold design review that can be signed
   with the CAD nowhere in the app is a signature on nothing.

   `tree` is the storage.rules prefix, NOT the collection name — parts have
   their own parts/ tree and work orders do not. A work order's files land under
   projects/ deliberately: storage.rules already scopes and content-type-limits
   that tree, and inventing a workOrders/ prefix would mean a rules deploy — the
   one thing in this repo that can lock the team out of their own data — to gain
   nothing. The record itself is roster-gated in Firestore either way.

   NATIVE CAD uploads too, as of August 2026 — see cadOk() in storage.rules for
   why the extension and the content type are both checked. A browser has no
   MIME type for .SLDPRT, so these have to be named by extension in `accept`;
   image/* and the document types can stay as types. A linked Drive document
   still satisfies every "the CAD" evidence check, because for a model anyone
   else needs to OPEN, the Drive copy is the useful one. */
const CAD_EXT = ".step,.stp,.sldprt,.sldasm,.iges,.igs,.x_t,.x_b,.3mf,.f3d,.dxf,.dwg,.stl";
function addRecordFiles(coll, id, tree, accept) {
  const rec = recById(coll, id);
  if (!rec) return;
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = accept || "image/*,application/pdf,.doc,.docx,.txt,.csv," + CAD_EXT;
  inp.multiple = true;
  inp.onchange = async () => {
    const files = Array.from(inp.files || []);
    for (const f of files) {
      try {
        const up = await fb.upload(`${tree || "projects"}/${id}/${Date.now()}-${f.name}`, f);
        const entry = { id: "F" + Date.now() + Math.random().toString(36).slice(2, 5), name: up.name, url: up.url, type: up.type, size: up.size, by: myEmail(), ts: new Date().toISOString(), path: up.path };
        rec.files = (rec.files || []).concat([entry]);
        await fb.appendTo(coll, id, "files", entry).catch(() => save(coll, rec, "files"));
      } catch (e) { toast("Upload failed: " + e.message, "error"); }
    }
    render();
  };
  inp.click();
}
function addProjectFiles() { addRecordFiles("projects", view.id); }

/* ---- rich-text comment editor ---- */
function rte(cmd, val, targetId) { document.execCommand(cmd, false, val); document.getElementById(targetId || "comment-editor").focus(); }
// A bare <img> has no click-to-download affordance — wrap it in a link, same
// as fileItem()'s anchor, so an inline comment image behaves like every other
// attachment instead of being a dead end you can only right-click.
function imgAttachHtml(url, name) {
  return `<a href="${url}" download="${esc(name)}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(name)}"></a>`;
}
// Match @tokens in comment text to roster users. Uses EXACT token equality (not
// substring), so "@Nicole" doesn't also ping "Nico" — the same over-match trap
// isMine() was fixed for. A bare first name still matches everyone who shares it
// (genuinely ambiguous); use @email to disambiguate.
function mentionsIn(text) {
  const tokens = new Set((String(text).match(/@[\w.\-]+(?:@[\w.\-]+)?/g) || []).map(t => t.slice(1).toLowerCase()));
  if (!tokens.size) return [];
  return (DB.users || []).filter(u => {
    const email = u.email.toLowerCase();
    const first = (u.name || "").toLowerCase().split(" ")[0];
    const full = (u.name || "").toLowerCase().replace(/\s+/g, "");
    return tokens.has(email) || (first && tokens.has(first)) || (full && tokens.has(full));
  }).map(u => u.email);
}
function postComment(id) {
  const ed = document.getElementById("comment-editor");
  const html = sanitizeHtml(ed.innerHTML || "");
  const text = ed.textContent || "";
  if (!text.trim() && !/<img/i.test(html)) { toast("Write a comment first.", "error"); return; }
  const p = projById(id);
  const c = { id: "C" + Date.now(), author: signerName(), email: myEmail(), ts: new Date().toISOString(), html };
  p.comments = (p.comments || []).concat([c]); // optimistic
  fb.appendTo("projects", id, "comments", c).catch(() => saveProj(p, "comments"));
  // @mentions → add as watcher + notify.
  const mentioned = mentionsIn(text).filter(e => e !== myEmail());
  if (mentioned.length) {
    p.watchers = [...new Set([...(p.watchers || []), ...mentioned])];
    saveProj(p, "watchers");
    mentioned.forEach(e => fb.notify(e, "mention", signerName() + " mentioned you on “" + (p.title || p.id) + "”", { tab: "projects", id }).catch(() => {}));
  }
  ed.innerHTML = ""; clearDraft("comment", id); render();
}
function rmProjDoc(linkId) { removeDocLink("projects", view.id, linkId); }

/* Cmd/Ctrl+Enter posts. It lives in rteKeys() now, one implementation for every
   composer in the app — commentKeys() used to be here and was never wired to a
   single element, so the hint under every composer promised a shortcut that did
   nothing. */
function discardCommentDraft(id) {
  confirmModal("Throw away this unposted draft?", () => { clearDraft("comment", id); render(); });
}

/* ---------- keyboard ----------
   Same contract as partsKeydown(), woKeydown() and moldsKeydown(): a pure
   function that returns the name of the action it took (or null), so a test
   can drive it without constructing a KeyboardEvent. All the handlers are
   bound to document at once, so the view.tab guard comes first. */
function tkNeighborId(dir) {
  const rows = tkIndexRows();
  if (!rows.length) return null;
  const i = rows.findIndex(p => p.id === view.id);
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + dir))].id;
}
function moveTicketSelection(dir) { const id = tkNeighborId(dir); if (id) selectTicket(id); }

function tkKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "projects") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    // Escape gets you out of the search box; nothing else is stolen from a
    // field you are typing in — and a ticket page is FULL of contenteditable.
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); moveTicketSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); moveTicketSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = tkNeighborId(1); if (id) { selectTicket(id); return "open"; } return null; }
  if (k === "Escape" && view.mode === "detail") { clearTicketSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  if (k === "e" && view.mode === "detail") { view.edit = !view.edit; render(); return "edit"; }
  /* Digits scroll to a section of the open ticket. They index the FILTERED
     section list, same numbers the buttons' tooltips show, so 1 is Issue on
     an issue and Description on a project — the bar and the keys agree. */
  if (view.mode === "detail" && /^[1-5]$/.test(k)) {
    const p = selectedTicket();
    const s = p && tkSections(p)[+k - 1];
    if (s) {
      if (e.preventDefault) e.preventDefault();
      secJump(s.anchor);
      return "section";
    }
  }
  return null;
}
document.addEventListener("keydown", tkKeydown);
