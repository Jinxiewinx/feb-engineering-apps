"use strict";
/* dashboard.js — the Dashboard (home) tab.
   Read-only. Pulls deadlines and assignments out of the other tabs so the
   first thing you see is "what's due and what's on me", not an empty list you
   have to go dig through six tabs to assemble. Everything is a light-link. */

// Who to show in a "Who" column. Ticket assignees are stored as emails, so a
// raw join printed "simon@berkeley.edu / nico@berkeley.edu" right beside a Part
// row reading "Justin" — userName() is what every other surface already uses.
// The SN5 import also left literal stage values ("N/A (Flat)") in 7 parts'
// moldEngineer cells; those are not people and shouldn't read as one.
// notAPerson() lives in core.js beside personRef, which is its main reader.
function whoLabel(vals) {
  return (Array.isArray(vals) ? vals : [vals])
    .filter(v => !notAPerson(v))
    .map(v => (String(v).includes("@") ? userName(v) : v))
    .join(" / ");
}

// Normalize every deadline-bearing record into one shape the dashboard sorts.
function deadlineItems() {
  const items = [];
  DB.parts.forEach(p => items.push({
    coll: "parts", id: p.id, kind: "Part", label: p.partName || p.id,
    who: whoLabel([p.moldEngineer, p.manufacturingEngineer]),
    date: p.layupDeadline, done: partDone(p),
    mine: isMine([p.moldEngineer, p.manufacturingEngineer]),
    // Included, never filtered: an R&D layup that misses its date is really
    // late. `rnd` rides along so the row can say so.
    rnd: isRnd(p),
  }));
  /* NO ISSUE ROWS. Project tickets are shelved (see the TABS row in core.js),
     and every ISSUE requires a workOrderId — v1.0.0 put issues on the run they
     hold up. So an issue row was always a second line about a run already on
     this list, minted here only to be folded away below; the fold is now done
     directly off openIssuesForWO() and the round trip is gone with it.

     What the fold was providing besides the count is kept: an issue with an
     EARLIER date than its run still pulls the run's date forward, so folding
     can never under-report lateness. */
  DB.workOrders.forEach(w => items.push({
    coll: "workOrders", id: w.id, kind: "WO", label: w.partName || w.id,
    who: whoLabel([w.moldEngineer, w.manufacturingEngineer]),
    date: w.dueDate, done: w.status === "Complete",
    mine: isMine([w.moldEngineer, w.manufacturingEngineer]),
    rnd: woIsRnd(w),
  }));
  return items;
}

/* ---------- one row per physical thing ----------
   A part and its work order are the same object seen twice: the part is the
   spec, the work order is the traveler. deadlineItems() emits both, so the
   undertray arrived as "PART UT DIFFUSER" and "WO UT DIFFUSER" — two rows, two
   owners, two dates, counted twice in every total on this page.

   On the SN5 data that is not a rounding error. 25 parts carry a layup
   deadline and 26 work orders carry a due date: 51 dated records describing
   29 physical objects. 22 parts have exactly one same-named work order and no
   name is ambiguous. So "Behind schedule" was overstating by roughly 40%, in
   the second-largest type on the landing page.

   THE WORK ORDER WINS, for three reasons in order: it is where the work is
   (steps, buy-offs, the blocker, the cure), its dueDate is the manufacturing
   commitment rather than the planning date, and it is the record you actually
   want to open. The EARLIER of the two dates is shown, so merging can never
   under-report lateness, and both owners are kept because the mold engineer
   and the manufacturing engineer are often different people and dropping one
   loses whoever is actually late.

   Pairing goes through linkedCounterpart() (core.js) rather than a second rule
   written here: it already tries the explicit id fields and falls back to a
   case-insensitive partName match that returns a counterpart ONLY when exactly
   one matches. Both explicit fields are empty on all 59 SN5 records, so the
   fallback is the path that runs — and an ambiguous name yields null, which
   leaves both rows standing. Guessing a merge is worse than showing two rows,
   because a wrong merge silently deletes somebody's deadline.

   A part with NO work order is never merged away. That is not noise: work
   happening with no traveler is PP-09, and it is worth seeing. */
function mergedDeadlineItems() {
  const items = deadlineItems();
  const wos = items.filter(i => i.coll === "workOrders");
  const byWoId = new Map(wos.map(i => [i.id, i]));
  /* Identity, not coll+id. A merged row can ADOPT the part's coll and id (see
     below), and a set keyed on those would then match the survivor and filter
     it out along with the row it absorbed — silently dropping the work
     entirely. The object reference cannot be confused that way. */
  const absorbed = new Set();
  /* Snapshot the part rows BEFORE the loop. The merge can rewrite a surviving
     row's coll and id to the part's (below), and iterating the live array meant
     that rewritten row then matched the "is a part" guard on a later turn,
     looked itself up, found itself in byWoId, and absorbed itself — leaving
     nothing. Only shows up when the work order is Complete, which is every work
     order in the SN5 archive. */
  const partItems = items.filter(i => i.coll === "parts");
  partItems.forEach(it => {
    const part = recById("parts", it.id);
    const wo = part && typeof linkedCounterpart === "function" ? linkedCounterpart("parts", part) : null;
    const row = wo && byWoId.get(wo.id);
    if (!row || row === it) return;         // no match, ambiguous name, or itself
    absorbed.add(it);
    // Earliest date wins, so a merge can only ever report MORE urgency.
    if (it.date && (!row.date || it.date < row.date)) row.date = it.date;
    const who = [row.who, it.who].filter(Boolean).join(" / ");
    row.who = [...new Set(who.split(" / ").filter(Boolean))].join(" / ");
    row.mine = row.mine || it.mine;
    /* Belt and braces. woIsRnd() already derives the run's programme from this
       very part, so the two agree in every case that can actually merge — but
       if they ever disagreed, a badge going missing on a merged row is the
       failure that matters, and OR is the direction that cannot lose it. */
    row.rnd = row.rnd || it.rnd;
    row.partId = it.id;                     // so the row can still link to the part
    /* The work order usually wins, but not when it is closed and the part is
       not: a Complete traveler beside a part still in layup means the work that
       REMAINS is the part's, so that is the record worth opening. Every SN5
       work order is Complete, so without this the whole archive links you to
       finished paperwork.
       Read before the write below — row.done is about to become false, and
       testing it afterwards is how this silently did nothing the first time. */
    if (row.done && !it.done) { row.coll = "parts"; row.id = it.id; row.kind = it.kind; row.label = it.label; }
    row.done = row.done && it.done;         // not finished until both are
  });
  /* Same argument again, one type down. Every issue REQUIRES a workOrderId
     (v1.0.0 put issues on the run they hold up), so an issue row was always a
     second line for a run already on this list — the exact double-count the
     part/work-order merge above exists to undo, and the reason that one was
     worth 40% of "behind schedule".

     Also: an issue filed from a work order carries no due date, so today it
     sinks into the "No date" fold where nobody looks. Folded into its run it
     surfaces on a row that HAS a date, which is strictly more visible.

     Snapshotted before the loop and absorbed by identity for the two reasons
     the part pass documents. The row it merges into may already have adopted
     the part's coll and id up there — byWoId still holds the same object, so
     the lookup keeps working, and the flag belongs on it either way because it
     is the same physical run. */
  /* The flag, read off the run rather than reconstructed from rows that only
     existed to carry it. openIssuesForWO() is the same filter the work order's
     own page uses, so the number on the board and the number inside the record
     cannot disagree.

     Iterated over byWoId rather than over items: a row may have adopted the
     part's coll and id above (a Complete traveler hands the row back to the
     open part), and byWoId still holds that same object — the flag belongs on
     it either way, because it is the same physical run. */
  byWoId.forEach((row, woId) => {
    if (absorbed.has(row)) return;
    const open = typeof openIssuesForWO === "function" ? openIssuesForWO(woId) : [];
    if (open.length) row.issues = open.length;
    /* An issue filed from a step carries no due date and sinks out of sight;
       one that HAS a date, and an earlier one, has to pull the run forward or
       folding would quietly under-report how late the run is. */
    (typeof issuesForWO === "function" ? issuesForWO(woId) : []).forEach(iss => {
      if (!iss.dueDate || projStatus(iss) === "Cancelled" || projStatus(iss) === "Done") return;
      if (!row.date || iss.dueDate < row.date) row.date = iss.dueDate;
    });
  });
  return items.filter(i => !absorbed.has(i));
}

/* ---------- what is stopping work ----------
   A work-order blocker that nobody sees until they open the work order is a
   gate, not a signal — it cannot warn a Monday meeting. The scan already
   existed in reports.js, on the wrong page; this is the same one, narrowed to
   blockers that are actually in the way (nothing later has been signed past
   them) rather than every unsigned blocker on the sheet.

   Retro records return nothing, as everywhere else: a historical record
   documents, it does not enforce. That does mean this is empty on the SN5
   archive — which is exactly why it is a conditional section under a tile that
   can honestly read 0, rather than the hero of the page. */
function blockedNow() {
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro || w.status === "Complete") return;
    const steps = w.steps || [];
    const next = steps.findIndex(s => typeof stepState === "function" && stepState(s) !== "done" && stepState(s) !== "failed");
    if (next < 0) return;
    steps.forEach((s, i) => {
      if (i > next) return;
      if (typeof isBlocker !== "function" || !isBlocker(s, w) || (typeof isSigned === "function" && isSigned(s))) return;
      out.push({ wo: w, step: s, i });
    });
  });
  return out;
}
/* Cure holds, as a CLOCK TIME and never a countdown.
   syncHoldTick() arms a 60-second setInterval whenever it finds `#main .step
   .gate`, and render() rebuilds #main wholesale — so a live countdown here
   would tear the landing page down under your thumb every minute, losing scroll
   and any expanded list. An absolute "ready 14:20" never goes stale, needs no
   timer, and is what you actually set a phone alarm from. The live countdown
   stays inside the work order, where the interval was designed to run. */
function curingNow() {
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro) return;
    (w.steps || []).forEach((s, i) => {
      const h = typeof holdState === "function" ? holdState(w, i) : null;
      if (!h || h.ready || h.overridden) return;
      out.push({ wo: w, step: s, hold: h });
    });
  });
  return out.sort((a, b) => (a.hold.msLeft || 0) - (b.hold.msLeft || 0));
}

/* ---------- what can I actually do right now? ----------
   THE QUESTION THE DASHBOARD NEVER ANSWERED. Everything on the old board was a
   count of things that EXIST: late items, blocked runs, open issues. None of it
   answered "what should I go and do", and the difference matters most for the
   half of the roster who cannot yet do most of it.

   buyoff() is a ladder of gates in a fixed order — sequence, then identity,
   then evidence, then the clock, then CS-013 — and any list that promises a
   signature has to walk the same ladder in the same order or the dashboard
   sends people to a button that refuses them. So this walks it, and reports
   which rung a step is standing on rather than a yes/no.

   The `typeof x === "function"` guards are the idiom this file already uses:
   tools/lib/appload.mjs loads each app file as its own vm.Script, so a helper
   from workorders.js may genuinely not be there yet when this parses. */
function signableSteps(email) {
  email = String(email || (typeof myEmail === "function" ? myEmail() : "")).toLowerCase();
  const lead = typeof isLead === "function" && isLead();
  const out = [];
  (DB.workOrders || []).forEach(w => {
    if (w.retro || w.status === "Complete") return;   // history signs nothing
    const steps = w.steps || [];
    /* The same definition of "next" as woFlags() and blockedNow(). Three
       surfaces disagreeing about which step is live is a bug report, not a
       nuance, so it is copied deliberately rather than re-derived. */
    const next = steps.findIndex(s =>
      typeof stepState === "function" && stepState(s) !== "done" && stepState(s) !== "failed");
    if (next < 0) return;
    const s = steps[next];

    // 1. SEQUENCE. Looks strictly BEFORE next — so when the next step IS the
    //    blocker this is null, and that is the most valuable item on the page:
    //    sign it and the whole run moves.
    const blocker = typeof blockerOpenBefore === "function" ? blockerOpenBefore(w, next) : null;

    // 2. IDENTITY. Rule field only; an untagged step is ungated by design.
    const tr = typeof stepTraining === "function" ? stepTraining(s) : null;
    const trained = !tr || !!s.trainingOverride
      || (typeof hasTraining === "function" && hasTraining(email, tr));

    // 3. EVIDENCE. NOT a hard bar — pressing the button is how you find out
    //    what is missing and get the control that fixes it. So it demotes.
    const ev = typeof stepEvidence === "function" ? stepEvidence(w, next) : { missing: [] };

    // 4. THE CLOCK. A member gets a toast; a LEAD gets openHoldOverride(). So
    //    whether this gate stops you is genuinely role-dependent, in the data.
    const h = typeof holdState === "function" ? holdState(w, next) : null;
    const curing = h && !h.ready && !h.overridden ? h : null;

    // 5. CS-013. A design review signed by whoever made the thing is not a
    //    review. Inverted rather than filtered: it ranks DOWN for the creator
    //    and UP for everyone else, which is a distinction nothing on screen
    //    has ever drawn.
    const selfReview = /design review/i.test(s.title || "")
      && !!email && email === String(w.createdBy || "").toLowerCase();

    const qualified = (tr && typeof qualifiedFor === "function") ? qualifiedFor(tr) : [];
    out.push({
      wo: w, step: s, i: next, tr, blocker, curing, selfReview,
      missing: ev.missing || [],
      isBlockerStep: typeof isBlocker === "function" && isBlocker(s, w),
      mine: typeof isMine === "function" && isMine([w.moldEngineer, w.manufacturingEngineer]),
      // Scarce: almost nobody else can do it, so it is much more yours.
      scarce: !!tr && qualified.length > 0 && qualified.length <= 2,
      qualified,
      // How much this ONE signature unlocks. It is why a blocker outranks a
      // late deadline, so it is a number rather than a feeling.
      releases: Math.max(0, steps.length - next - 1),
      state:
        blocker ? "blocked"                    // not yours: the blocker is the item
        : curing && !lead ? "curing"           // nothing to do but know when
        : curing ? "overridable"               // a lead CAN act on this one
        : !trained ? "untrained"
        : (ev.missing || []).length ? "needs-evidence"
        : "ready",
    });
  });
  return out;
}

/* Waiting on YOU: ready, or one errand short, and either carrying your name or
   held by a training almost nobody has. Everything else that is ready is real
   work and belongs to the team — it ranks below, never in the hero. */
function waitingOnMe(email) {
  return signableSteps(email).filter(s =>
    (s.state === "ready" || s.state === "needs-evidence") && (s.mine || s.scarce) && !s.selfReview);
}
function readyForAnyone(email) {
  return signableSteps(email).filter(s => s.state === "ready" && !s.mine && !s.scarce);
}

/* THE ANSWER FOR A FIRST-YEAR. A member with no trainings has an empty
   "waiting on you" forever, which is the worst possible first impression of a
   board built to answer "what do I do next". Turn the gate into the next
   action: which training would unlock the most work that is ready RIGHT NOW,
   and who on the roster can teach it. */
function trainingGaps(email) {
  const need = new Map();
  signableSteps(email).forEach(s => {
    if (s.state !== "untrained") return;
    need.set(s.tr, (need.get(s.tr) || 0) + 1);
  });
  return [...need].map(([id, n]) => ({
    id, n,
    name: (typeof trainingById === "function" ? trainingById(id).name : id),
    who: (typeof qualifiedFor === "function" ? qualifiedFor(id) : []),
  })).sort((a, b) => b.n - a.n);
}

/* Ranking, used in ONE place: inside "waiting on you", where every item is the
   same kind of thing and an order is defensible. The lanes themselves are
   deliberately not scored against each other — "is this blocker more urgent
   than that deadline" is a question with no honest answer, and inventing one
   is how a board starts lying quietly.

   Small integers, added, so a lead can reproduce the order in their head. A
   score nobody can argue with is a score nobody trusts. */
/* The TIER is what kind of stop this is; the bonuses only order things within
   a tier. For that to be true rather than merely intended, the tiers have to be
   spaced further apart than every bonus added together — otherwise a late,
   scarce, mine, releases-everything purchase approval outranks a live blocker,
   and the ordering silently stops meaning what the names say.

   45 is the most the bonuses can add (15 + 12 + 8 + 10), so the tiers sit 50
   apart. A test pins the relationship, because getting it wrong is invisible:
   the board still renders, in a slightly wrong order, forever. */
const ACT_BASE = {
  blockerAtNext: 250,   // your signature IS the gate; signing it moves the run
  signoffReady: 200,
  needsEvidence: 150,   // yours to sign, but go and take the photo first
  overridable: 100,     // a cure that is ready and waiting on a lead
  approval: 50,         // over $50, awaiting sign-off (lead only)
  unassigned: 0,        // open, dated, nobody's name on it
};
/* The most a deadline can be worth. Capped at all because the SN5 archive is
   full of records three hundred days past their date, and uncapped any one of
   them would sit permanently above a run that is stopping the shop today.
   Capped at THIS because of the tier arithmetic above. */
const ACT_LATE_CAP = 15;
function actScore(a) {
  let s = ACT_BASE[a.base] || 0;
  const dd = typeof daysUntil === "function" ? daysUntil(a.date) : null;
  if (dd != null && dd < 0) s += Math.min(ACT_LATE_CAP, -dd);
  if (a.mine) s += 12;              // yours beats the team's, never by a whole tier
  if (a.scarce) s += 8;
  if (a.releases) s += Math.min(10, a.releases);
  if (a.rnd) s -= 4;                // real work, not a season deliverable
  if (a.selfReview) s -= 40;        // CS-013: your own review is not yours to sign
  return s;
}
function actSort(a, b) {
  return (b.score || 0) - (a.score || 0) || dashSort(a, b);
}

/* Which board to draw. A third value beyond lead/member, because a guest is not
   a member with less — a work queue filtered to nothing is a blank apology, and
   a guest gets a different page rather than an emptier one. */
function dashRole() {
  if (window.fb && fb.guest) return "guest";
  return (typeof isLead === "function" && isLead()) ? "lead" : "member";
}

/* A stable tiebreak when two things fall on the same date: the run before the
   part it makes, and both before an issue against them. It outlived the bucket
   list it was written for — the lanes still need two equal dates to order the
   same way on every render, or rows swap places under your thumb. */
const KIND_RANK = { WO: 0, Part: 1, Issue: 2 };
function dashSort(a, b) {
  return (a.date || "9999").localeCompare(b.date || "9999")
    || (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)
    || String(a.label).localeCompare(String(b.label));
}


/* Lead-only editor for config/season. Milestones as date-label lines rather
   than a row editor: a season has a handful, and a lead sets them twice a
   year. Writing goes through fb.setConfig, which stamps updatedAt/By. */
function editSeason() {
  const s = window.SEASON || {};
  openModal(`
    <h2>Season settings</h2>
    <div class="field"><label>Season code</label><input id="sea-code" value="${esc(s.code || "SN6")}" placeholder="SN6" pattern="SN\\d+">
      <div class="tny muted">Goes into every new id (WO-SN6-041) and picks which season the rails show. Change it once, when the next car starts; last season's records stay, one chip away.</div></div>
    <div class="field"><label>Competition name</label><input id="sea-name" value="${esc(s.compName || "")}" placeholder="FSAE Michigan"></div>
    <div class="field"><label>Competition date</label><input id="sea-date" type="date" value="${esc(s.compDate || "")}"></div>
    <div class="field"><label>Season start (optional)</label><input id="sea-start" type="date" value="${esc(s.seasonStart || "")}"></div>
    <div class="field"><label>Milestones — one per line: YYYY-MM-DD Label</label>
      <textarea id="sea-ms" rows="4" placeholder="2027-01-20 All molds cut">${esc((s.milestones || []).map(m => `${m.date} ${m.label}`).join("\n"))}</textarea></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitSeason()">Save</button></div>
  `);
}
async function submitSeason() {
  const milestones = document.getElementById("sea-ms").value.split("\n")
    .map(l => l.trim()).filter(Boolean)
    .map(l => { const m = l.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/); return m ? { date: m[1], label: m[2] } : null; })
    .filter(Boolean);
  const code = document.getElementById("sea-code").value.trim().toUpperCase();
  if (!/^SN\d+$/.test(code)) { toast("Season code looks like SN6 or SN7.", "error"); return; }
  const data = {
    code,
    compName: document.getElementById("sea-name").value.trim(),
    compDate: document.getElementById("sea-date").value,
    seasonStart: document.getElementById("sea-start").value,
    milestones,
  };
  try {
    await fb.setConfig("season", data);
    window.SEASON = data;
    closeModal(); render(); toast("Season saved.");
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}


/* ---------- the activity feed ----------
   Every synced doc carries updatedAt/updatedBy and every comment a ts, and
   until now the only surface reading any of it was the watched-tickets card.
   One merged stream instead: record touches, comments, and step buy-offs
   across tickets, parts, work orders and molds. Newest first, ONE event per
   record per calendar day (a save-then-comment is one line of news, not
   two), capped. Notifications stay out: they are per-user and the bell owns
   them. Watched tickets with unread activity still pin to the top wearing
   the gold dot — that is a personal signal, not program news. */
function dashFeedEvents() {
  const ev = [];
  const push = (ts, who, verb, coll, id, label) => { if (ts) ev.push({ ts: String(ts), who, verb, coll, id, label }); };
  (DB.projects || []).filter(isIssue).forEach(p => {
    push(p.updatedAt, p.updatedBy, "updated", "projects", p.id, p.title || p.id);
    (p.comments || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "projects", p.id, p.title || p.id));
  });
  (DB.parts || []).forEach(p => {
    push(p.updatedAt, p.updatedBy, "updated", "parts", p.id, p.partName || p.id);
    (p.commentLog || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "parts", p.id, p.partName || p.id));
  });
  (DB.workOrders || []).forEach(w => {
    if (w.retro) return;   // the SN5 archive documents, it is not news
    push(w.updatedAt, w.updatedBy, "updated", "workOrders", w.id, w.partName || w.id);
    (w.noteLog || []).forEach(c => push(c.ts, c.email || c.author, "commented on", "workOrders", w.id, w.partName || w.id));
    (w.steps || []).forEach(s => {
      if (s.buyoff && s.buyoff.name && s.buyoff.date && !/not recorded/i.test(s.buyoff.name))
        push(s.buyoff.date, s.buyoff.name, "signed a step on", "workOrders", w.id, w.partName || w.id);
    });
  });
  (DB.molds || []).forEach(m => push(m.updatedAt, m.updatedBy, "updated", "molds", m.id, m.name || m.id));
  ev.sort((a, b) => b.ts.localeCompare(a.ts));
  const seen = new Set();
  return ev.filter(e => {
    const k = e.coll + "|" + e.id + "|" + e.ts.slice(0, 10);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/* ============================================================================
   THE PIT BOARD
   ============================================================================
   Round five. Rounds one through four were a grid of modules, and the last of
   them left five of eleven areas able to render nothing at all — so on a quiet
   week, or on the SN5 archive where every run is retro, the page had holes in
   the middle of it.

   The fix is not tighter packing. It is that a module which can vanish was
   answering a question nobody asked it. Four lanes, each a QUESTION, and a lane
   with no answer says so in a sentence — because "nothing is blocked" is real
   information at a Monday meeting and an empty column is not.

   THE ALERT STRIP IS GONE, and that is the deletion this round is really about.
   It counted "Late 3" and then a module below listed the three. One fact drawn
   twice, in two places that could disagree. Each lane header is its own numeral
   now, attached to the thing it counts — which is exactly the argument the old
   groupHead() already made about its own numbers.

   NO SCORE ACROSS LANES. "Is this blocker more urgent than that deadline" has
   no honest answer, and inventing one is how a board starts lying quietly.
   actScore ranks INSIDE "waiting on you", where everything is the same kind of
   thing, and nowhere else. */

const LANES = [
  { id: "stopped", cls: "l-stopped", label: "Stopped", scope: "runs" },
  { id: "you", cls: "l-you", label: "Waiting on you", scope: "steps" },
  { id: "due", cls: "l-due", label: "Due this week", scope: "items" },
  { id: "clock", cls: "l-clock", label: "On the clock", scope: "" },
];

/* FIRST LANE WINS, keyed on coll|id, so one thing appears exactly once — the
   same discipline the old bucket list enforced and for the same reason.

   The consequence has to be said on screen: a run that is three days late AND
   has a step you can sign appears only in lane 2, so the numerals do not sum to
   "everything open". Each header carries its scope for that reason, and lane 3
   says "Later — 9" rather than implying it is everything. Getting this wrong is
   how a lead concludes the board is lying to them. */
function laneFill(email, role) {
  const seen = new Set();
  /* ONE KEY CONVENTION, and it has to be the one mergedDeadlineItems uses —
     "<coll>|<id>" — or the lanes cannot dedupe against each other at all. */
  const take = (k) => { if (seen.has(k)) return false; seen.add(k); return true; };
  const woKey = (w) => "workOrders|" + w.id;
  const sig = signableSteps(email);
  const L = { stopped: [], you: [], due: [], clock: [] };

  /* 1. STOPPED — a run whose next step nobody can sign. Two shapes, and the
        difference matters: a blocker AT the live step is work waiting on a
        person, and a blocker BEHIND it means the run walked past a gate, which
        is a record that lies and is worse. */
  sig.filter(s => s.state === "blocked").forEach(s => {
    if (take(woKey(s.wo))) L.stopped.push({ ...s, why: "stranded" });
  });
  blockedNow().forEach(b => {
    if (take(woKey(b.wo))) L.stopped.push({ ...b, why: "gate" });
  });

  /* 2. WAITING ON YOU — the only lane with an order inside it. */
  waitingOnMe(email).forEach(s => {
    if (take(woKey(s.wo))) {
      L.you.push({ ...s, kind: "sign", date: s.wo.dueDate,
        score: actScore({ base: s.state === "needs-evidence" ? "needsEvidence" : "signoffReady",
          date: s.wo.dueDate, mine: s.mine, scarce: s.scarce, releases: s.releases,
          selfReview: s.selfReview, rnd: typeof woIsRnd === "function" && woIsRnd(s.wo) }) });
    }
  });
  if (role === "lead") {
    sig.filter(s => s.state === "overridable").forEach(s => {
      if (take(woKey(s.wo))) L.you.push({ ...s, kind: "override",
        score: actScore({ base: "overridable", mine: s.mine }) });
    });
    (DB.budget || []).filter(b => typeof needsApproval === "function" && needsApproval(b)).forEach(b => {
      if (take("budget|" + b.id)) L.you.push({ kind: "approval", rec: b, score: actScore({ base: "approval" }) });
    });
    mergedDeadlineItems().filter(i => !i.done && !i.who).forEach(i => {
      if (take(i.coll + "|" + i.id)) L.you.push({ ...i, kind: "unassigned",
        score: actScore({ base: "unassigned", date: i.date, rnd: i.rnd }) });
    });
  }
  L.you.sort(actSort);

  /* 3. DUE THIS WEEK — inside seven days, late first. Anything further out
        lives behind one button and is NOT in the header's numeral. */
  const later = [];
  mergedDeadlineItems().filter(i => !i.done).forEach(i => {
    const dd = daysUntil(i.date);
    if (dd == null || dd > 7) { if (dd != null) later.push(i); return; }
    if (take(i.coll + "|" + i.id)) L.due.push(i);
  });
  L.due.sort(dashSort);
  L.laterCount = later.length;
  L.laterNext = later.sort(dashSort)[0] || null;

  /* 4. ON THE CLOCK — things running without you, and when you come back.
        Structurally never empty once a season exists, which is the point. */
  curingNow().forEach(c => { if (take(woKey(c.wo))) L.clock.push({ kind: "cure", ...c }); });
  const s = window.SEASON;
  const next = ((s && s.milestones) || [])
    .filter(m => m.date && daysUntil(m.date) != null && daysUntil(m.date) >= 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  if (next) L.clock.push({ kind: "milestone", ...next });
  return L;
}

/* THE ANTI-HOLE MECHANISM, expressed in code rather than in a comment.

   Exactly one function renders a lane, and `emptyFn` is a REQUIRED parameter —
   a lane physically cannot ship without an empty state, because there is
   nowhere to put one that skips it. That is the whole reason round four could
   leave holes: every module decided for itself whether it had anything to say,
   and five of them could answer "no" by returning "". */
function laneShell(lane, rows, n, emptyFn, extra, scope) {
  if (typeof emptyFn !== "function") throw new Error("a lane needs an empty state: " + lane.id);
  const sc = scope != null ? scope : (n === 1 ? lane.scope.replace(/s$/, "") : lane.scope);
  return `<div class="bmod dlane ${lane.cls}">
    <div class="dlane-hd">
      <span class="bnum ${n ? (lane.id === "stopped" || lane.id === "due" ? "bad" : lane.id === "you" ? "warn" : "") : ""}">${n}</span>
      <span class="dlane-lbl">${lane.label}</span>
      ${n && sc ? `<span class="gh-n tny">${esc(sc)}</span>` : ""}
    </div>
    ${rows || `<div class="dlane-empty">${emptyFn()}</div>`}
    ${extra || ""}
  </div>`;
}

/* One row, one shape, every lane. The chip is the only clickable thing in it —
   the row itself is not a control, which is what keeps a screen reader from
   announcing every line twice. */
function laneRow(cls, main, meta) {
  return `<div class="srow">${cls ? `<span class="sdot ${cls}"></span>` : ""}
    <span class="sr-main">${main}</span>
    ${meta ? `<span class="srow-meta">${meta}</span>` : ""}</div>`;
}

function laneStopped(L) {
  const rows = L.stopped.slice(0, 6).map(s => {
    const step = (s.why === "stranded" ? s.blocker : s.step) || s.step || {};
    const who = whoLabel([s.wo.moldEngineer, s.wo.manufacturingEngineer]);
    return laneRow("bad",
      `${chip("workOrders", s.wo.id, s.wo.partName || s.wo.id)} <b>${esc(step.title || "")}</b> unsigned`,
      `${who || "nobody assigned"}${s.why === "stranded"
        ? " · signed past — the record is wrong" : ""}${s.releases ? ` · holds ${s.releases} step${s.releases === 1 ? "" : "s"}` : ""}`);
  }).join("");
  return laneShell(LANES[0], rows, L.stopped.length,
    () => "Nothing is blocked. Every open run's next step is available to somebody.",
    L.stopped.length > 6 ? `<div class="srow-meta">and ${L.stopped.length - 6} more</div>` : "");
}

function laneYou(L, email) {
  const rows = L.you.slice(0, 6).map(a => {
    if (a.kind === "approval") {
      return laneRow("warn", `${chip("budget", a.rec.id, a.rec.item || a.rec.id)} over $50, awaiting your sign-off`,
        `$${(typeof num === "function" ? num(a.rec.cost) : 0).toFixed(0)}`);
    }
    if (a.kind === "unassigned") {
      return laneRow("warn", `${chip(a.coll, a.id, a.label)} has nobody on it`, a.date ? esc(a.date) : "no date");
    }
    const step = a.step || {};
    if (a.kind === "override") {
      return laneRow("warn", `${chip("workOrders", a.wo.id, a.wo.partName || a.wo.id)} <b>${esc(step.title || "")}</b>`,
        `curing · ready ${esc((a.curing && a.curing.readyAt) || "")} · a lead can release it`);
    }
    const short = (a.missing || []).length;
    return laneRow("warn",
      `${chip("workOrders", a.wo.id, a.wo.partName || a.wo.id)} <b>${esc(step.title || "")}</b>`,
      short
        ? `needs ${esc((typeof evidenceLabels === "function" ? evidenceLabels(a.missing) : a.missing).join(", "))} first`
        : `ready now${a.scarce ? " · few people can sign this" : ""}${a.releases ? ` · releases ${a.releases}` : ""}`);
  }).join("");

  /* THE EMPTY STATE THAT MATTERS MOST. A member with no trainings would
     otherwise see an empty lane every day with nothing to do about it, which is
     the worst possible first impression of a board built to answer "what do I
     do next". Turn the gate into the next action. */
  const empty = () => {
    const gaps = trainingGaps(email);
    if (gaps.length) {
      const g = gaps[0];
      const who = (g.who || []).map(u => u.name || u.email).slice(0, 3).join(", ");
      return `Nothing needs your signature yet. <b>${g.n}</b> step${g.n === 1 ? "" : "s"} ${g.n === 1 ? "is" : "are"} waiting on
        <b>${esc(g.name)}</b> training — ${who ? `${esc(who)} ${(g.who.length === 1 ? "has" : "have")} it.` : "nobody holds it yet."}
        <button class="dg-more" onclick="setTab('people')">See People</button>`;
    }
    const ready = readyForAnyone(email).length;
    return ready
      ? `Nothing needs your signature. <b>${ready}</b> step${ready === 1 ? "" : "s"} ${ready === 1 ? "is" : "are"} ready for the people trained on ${ready === 1 ? "it" : "them"}.`
      : "Nothing needs your signature, and nothing else is waiting on anybody either.";
  };
  return laneShell(LANES[1], rows, L.you.length, empty,
    L.you.length > 6 ? `<div class="srow-meta">and ${L.you.length - 6} more</div>` : "");
}

function laneDue(L) {
  const rows = L.due.slice(0, 7).map(i => {
    const dd = daysUntil(i.date);
    const late = dd != null && dd < 0;
    return laneRow(late ? "bad" : "warn",
      `${chip(i.coll, i.id, i.label)}${typeof rndBadge === "function" ? rndBadge(i.rnd) : ""}${
        i.issues ? ` <span class="warn tny" title="${i.issues} open issue${i.issues > 1 ? "s" : ""}">⚑ ${i.issues}</span>` : ""}`,
      `${esc(i.who || "nobody")} · ${esc(i.date)}${late ? ` (${Math.abs(dd)}d late)` : dd === 0 ? " (today)" : ` (${dd}d)`}`);
  }).join("");
  const empty = () => L.laterNext
    ? `Nothing is due before <b>${esc(L.laterNext.date)}</b>. Next up: ${esc(L.laterNext.label)}.`
    : `No part or run carries a date yet. <button class="dg-more" onclick="setTab('season')">Set them on Season</button>`;
  const nLate = L.due.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; }).length;
  const scope = nLate === L.due.length ? (nLate === 1 ? "late" : "all late")
    : nLate ? `items · ${nLate} late` : (L.due.length === 1 ? "item" : "items");
  return laneShell(LANES[2], rows, L.due.length, empty,
    L.laterCount ? `<button class="dg-more" onclick="setTab('workorders')">Later — ${L.laterCount}</button>` : "",
    scope);
}

function laneClock(L, role) {
  const cures = L.clock.filter(c => c.kind === "cure");
  const ms = L.clock.find(c => c.kind === "milestone");
  const s = window.SEASON;
  const rows = cures.slice(0, 4).map(c => laneRow("warn",
    `${chip("workOrders", c.wo.id, c.wo.partName || c.wo.id)} <b>${esc((c.step || {}).title || "")}</b>`,
    `ready <span class="cure-at">${esc((c.hold && c.hold.readyAt) || "")}</span>${
      c.hold && c.hold.resin ? ` · ${esc(c.hold.resin.name || c.hold.resinId || "")}` : ""}`)).join("");

  const tail = [
    ms ? `<div class="srow-meta">next: <b>${esc(ms.label)}</b> · ${esc(ms.date)} (${daysUntil(ms.date)}d)</div>` : "",
    s && s.compDate
      ? `<button class="b-tminus dlane-tminus" onclick="${role === "lead" ? "editSeason()" : "setTab('timeline')"}">
          <span class="bnum">${Math.max(0, daysUntil(s.compDate) ?? 0)}</span>
          <span class="bl">days to ${esc(s.compName || "competition")}</span></button>`
      : `<div class="dlane-empty">No competition date set.${role === "lead"
          ? ` <button class="dg-more" onclick="editSeason()">Set the season</button>` : ""}</div>`,
  ].join("");

  return laneShell(LANES[3], rows, cures.length,
    () => "No cure is running — nothing is waiting on a clock.", tail);
}

/* ---------- the program strip ----------
   Six facts that are a monthly read rather than a daily one, on one line each.
   They were five separate modules, four of which could render nothing; here a
   fact with no value prints a labelled em-dash instead of disappearing, so the
   strip is the same height whatever the data says. */
function dashProgram(role) {
  const parts = (DB.parts || []).filter(p => typeof inSeason === "function" ? inSeason(p) : !p.retro);
  const live = (DB.molds || []).filter(m => m.stage !== "Retired");
  const bars = (typeof PART_STAGES !== "undefined" && typeof stageBreakdown === "function")
    ? PART_STAGES.map(st => {
        const b = stageBreakdown(st.key, st.vals, parts);
        const tot = Object.values(b).reduce((a, n) => a + n, 0) || 1;
        return `<div class="stagebreak"><div class="sb-label">${esc(st.label)}</div>
          <div class="sb-bar">${["st-done", "st-mid", "st-0", "st-na"].map(k => b[k]
            ? `<span class="sb-seg ${k}" style="width:${(b[k] / tot) * 100}%" title="${b[k]}"></span>` : "").join("")}</div>
          <div class="sb-nums tny">${b["st-done"]} done · ${b["st-mid"]} under way · ${b["st-0"]} to start</div></div>`;
      }).join("")
    : "";
  const molds = typeof moldsStageBar === "function" ? moldsStageBar(live) : "";

  /* "Unreimbursed" is a fact about the MONEY track, so it reads reimbStatus()
     and not the goods status beside it — a part that arrived last month is
     still money somebody is owed. Off-budget purchases count: the team owes
     the purchaser either way. */
  const openOrders = (DB.budget || []).filter(b => typeof buyReimbursed === "function" ? !buyReimbursed(b) : b.status !== "Reimbursed");
  const openSum = openOrders.reduce((a, b) => a + (typeof num === "function" ? num(b.cost) : 0), 0);
  const approvals = (DB.budget || []).filter(b => typeof needsApproval === "function" && needsApproval(b)).length;

  const wk = typeof weekPlanWeeks === "function" ? weekPlanWeeks() : [];
  const cur = wk.filter(w => w.weekOf <= today()).slice(-1)[0];
  /* bookedCount() already exists in timeline.js and is the ONE definition of
     'booked' — it walks STATIONS (which are [key, label] pairs, and whose values
     live as fields directly on the week record) and deliberately excludes the
     two free-text rows, so a note never counts as a booking. Re-deriving it here
     is how the dashboard and the schedule would come to disagree. */
  const booked = cur && typeof bookedCount === "function" ? bookedCount(cur) : 0;
  const nStations = typeof STATIONS !== "undefined" ? STATIONS.length : 0;

  const done = (DB.parts || []).filter(p => typeof partDone === "function" && partDone(p)).length;
  const signed = (DB.workOrders || []).reduce((n, w) =>
    n + (w.steps || []).filter(st => typeof isSigned === "function" && isSigned(st)).length, 0);
  const open = mergedDeadlineItems().filter(i => !i.done);
  const lateNow = open.filter(i => { const d = daysUntil(i.date); return d != null && d < 0; }).length;

  const line = (label, val) => `<span class="dprog-i"><b>${val}</b> ${label}</span>`;
  return `<div class="bmod dprog">
    <div class="bmod-hd"><span>The program</span><span class="gh-n">${parts.length} part${parts.length === 1 ? "" : "s"} · ${live.length} mold${live.length === 1 ? "" : "s"}</span>
      ${role === "lead" && window.SEASON && SEASON.compDate
        ? `<button class="icon-btn" title="Edit season" aria-label="Edit season" onclick="editSeason()">✎</button>` : ""}</div>
    <div class="dprog-bars">${bars}${molds}</div>
    <div class="dprog-row">
      ${line("unreimbursed", "$" + openSum.toFixed(0))}
      ${approvals ? line("over $50 awaiting sign-off", approvals) : line("awaiting sign-off", "—")}
      ${line(`of ${nStations} stations booked at RFS`, nStations ? booked : "—")}
      ${role === "lead" ? dashStore() : ""}
    </div>
    <div class="dprog-row">
      ${line(lateNow ? `days clean — ${lateNow} late right now` : "days clean", lateNow ? 0 : "✓")}
      ${line(`layup${done === 1 ? "" : "s"} banked all season`, done)}
      ${line(`step sign-off${signed === 1 ? "" : "s"} all season`, signed)}
    </div>
  </div>`;
}

/* The store, as one line. It was a module that returned "" whenever the shop
   was tidy — which is the good case, and the case that left a hole. */
function dashStore() {
  if (typeof invIndex !== "function") return "";
  const lots = (DB.lots || []).filter(o => o.stage !== "Empty");
  const expired = lots.filter(lotExpired).length;
  const low = lots.filter(lotIsLow).length;
  const bits = [];
  if (expired) bits.push(`${expired} expired`);
  if (low) bits.push(`${low} low`);
  const txt = bits.length ? bits.join(", ") : "nothing flagged";
  return `<span class="dprog-i"><button class="link" onclick="view.invFlag='reorder';setTab('inventory')"><b>Store</b> ${esc(txt)}</button></span>`;
}

/* ---------- around the shop ----------
   The things that are not work: where to go, what happened, and the fact. */
function dashFoot() {
  const tile = (go, label, meta) => `<button class="b-tile" onclick="${go}">
    <span class="tl">${label}</span>${meta ? `<span class="tm">${meta}</span>` : ""}</button>`;
  const ext = (url, label) => `<a class="b-tile" href="${esc(url)}" target="_blank" rel="noopener">
    <span class="tl">${esc(label)}</span><span class="tm">pinned · opens in Google</span></a>`;
  const pinned = (DB.documents || []).filter(d => d.pinned && d.url).slice(0, 3);

  const ev = typeof dashFeedEvents === "function" ? dashFeedEvents().slice(0, 3) : [];
  const feed = ev.length
    ? ev.map(e => `<div class="srow"><span class="sr-main">${chip(e.coll, e.id, e.label)} ${esc(e.verb)}</span>
        <span class="srow-meta">${esc(whoLabel(e.who) || "somebody")} · ${esc(String(e.ts).slice(0, 10))}</span></div>`).join("")
    : `<div class="srow-meta">Nothing has been touched yet.</div>`;

  const f = typeof factOfTheDay === "function" ? factOfTheDay(view.factN) : null;
  const raceday = window.SEASON && SEASON.compDate === today();
  return `<div class="bmod dfoot">
    <div class="bmod-hd"><span>Around the shop</span></div>
    <div class="lgrid">
      ${tile("setTab('workorders');view.woIssues=true;render()", "Open issues", "runs with one open")}
      ${tile("setTab('workorders');view.woLate=true;render()", "Late WOs", "past due only")}
      ${tile("view.invFlag='reorder';setTab('inventory')", "Reorder list", "low + expired")}
      ${tile("view.schedView='week';setTab('timeline')", "Week plan", "goals by person")}
      ${tile("setTab('reports')", "Reports", "counts + CSV")}
      ${tile("setTab('documents')", "Documents", "shelf + uploads")}
      ${pinned.map(d => ext(d.url, d.title || d.id)).join("")}
    </div>
    <div class="dfoot-band">${feed}</div>
    ${/* Its own surface, inside the same ruled band. Stacked straight under the
          activity feed with nothing between them, the fact read as the last row
          of it — one more thing that happened in the shop, rather than the one
          thing here that is not news. */""}
    ${raceday
      ? `<div class="dlore"><div class="dlore-hd">Race day</div>
        <p class="fq">It's race day. Everything on this board already happened. Go run the car.</p></div>`
      : f ? `<div class="dlore">
        <div class="dlore-hd">${f.src === "lore" ? "Team lore" : "Shop knowledge · the wider world"}</div>
        <p class="fq">${esc(f.t)}</p>
        <div class="fmeta"><button class="dg-more" onclick="view={...view,factN:(view.factN||0)+1};render()">Another one</button></div>
      </div>` : ""}
  </div>`;
}

/* ---------- the page ---------- */
function renderDashboard() {
  const role = dashRole();
  if (role === "guest") return renderShowcase(showcaseData());
  const email = typeof myEmail === "function" ? myEmail() : "";
  const L = laneFill(email, role);
  const raceday = window.SEASON && SEASON.compDate === today();
  return `<div class="dboard${raceday ? " raceday" : ""}">
    ${laneStopped(L)}
    ${laneYou(L, email)}
    ${laneDue(L)}
    ${laneClock(L, role)}
    ${dashProgram(role)}
    ${dashFoot()}
  </div>`;
}

/* ---------- the guest showcase ----------
   A DIFFERENT PAGE, not a filtered one. A work queue with everything filtered
   out is a blank apology, and a guest has no work — they are looking at what
   the team is building.

   Nothing here is a chip. chip() emits an openRecord() button and a data-open
   deep-link hook, and a guest tapping into a detail page is a dead end with a
   permission error behind it. Plain labels, deliberately.

   Built against a plain object so where the data comes from can change without
   touching the render — a guest reads live collections today, and may read a
   curated mirror later. */
function showcaseData() {
  const parts = (DB.parts || []).filter(p => typeof inSeason === "function" ? inSeason(p) : !p.retro);
  const live = (DB.molds || []).filter(m => m.stage !== "Retired");
  const s = window.SEASON || {};
  return {
    season: { name: s.compName || "", date: s.compDate || "", milestones: s.milestones || [] },
    parts: parts.map(p => ({
      name: p.partName || p.id, subteam: p.subteam || "",
      status: typeof seasonStatus === "function" ? seasonStatus(p) : { cls: "st-0", label: "" },
    })),
    molds: { live: live.length, cut: live.filter(m => m.stage !== "Designed").length },
    counts: {
      layups: parts.filter(p => typeof partDone === "function" && partDone(p)).length,
      signoffs: (DB.workOrders || []).reduce((n, w) =>
        n + (w.steps || []).filter(st => typeof isSigned === "function" && isSigned(st)).length, 0),
    },
  };
}

function renderShowcase(d) {
  const dd = d.season.date ? daysUntil(d.season.date) : null;
  const bars = (typeof PART_STAGES !== "undefined" && typeof stageBreakdown === "function")
    ? PART_STAGES.map(st => {
        const rows = (DB.parts || []).filter(p => typeof inSeason === "function" ? inSeason(p) : !p.retro);
        const b = stageBreakdown(st.key, st.vals, rows);
        const tot = Object.values(b).reduce((a, n) => a + n, 0) || 1;
        return `<div class="stagebreak"><div class="sb-label">${esc(st.label)}</div>
          <div class="sb-bar">${["st-done", "st-mid", "st-0", "st-na"].map(k => b[k]
            ? `<span class="sb-seg ${k}" style="width:${(b[k] / tot) * 100}%"></span>` : "").join("")}</div>
          <div class="sb-nums tny">${b["st-done"]} done · ${b["st-mid"]} under way · ${b["st-0"]} to start</div></div>`;
      }).join("")
    : "";
  return `<div class="dboard showcase">
    <div class="bmod sc-head">
      <div class="sc-team">Formula Electric at Berkeley · Composites · SN6</div>
      ${d.season.date
        ? `<div class="sc-tminus"><span class="bnum">${Math.max(0, dd ?? 0)}</span>
             <span class="bl">days to ${esc(d.season.name || "competition")}</span></div>`
        : `<div class="sc-tminus"><span class="bl">the season is being planned</span></div>`}
    </div>
    <div class="bmod sc-prog">
      <div class="bmod-hd"><span>The car so far</span><span class="gh-n">${d.molds.cut} of ${d.molds.live} molds past design</span></div>
      ${bars}
    </div>
    <div class="bmod sc-parts">
      <div class="bmod-hd"><span>What we are making</span><span class="gh-n">${d.parts.length} part${d.parts.length === 1 ? "" : "s"} on the car</span></div>
      ${d.parts.length
        ? `<div class="sc-grid">${d.parts.map(p => `<div class="sc-card">
            <span class="sc-name">${esc(p.name)}</span>
            <span class="sc-sub">${esc(p.subteam)}</span>
            <span class="stage ${p.status.cls}">${esc(p.status.label)}</span>
          </div>`).join("")}</div>`
        : `<p class="muted">The season has not been laid out yet.</p>`}
    </div>
    <div class="bmod sc-nums">
      <div class="bmod-hd"><span>By the numbers</span></div>
      <div class="dprog-row">
        <span class="dprog-i"><b>${d.counts.layups}</b> layups banked</span>
        <span class="dprog-i"><b>${d.counts.signoffs}</b> step sign-offs</span>
        <span class="dprog-i"><b>${d.molds.live}</b> live molds</span>
      </div>
    </div>
  </div>`;
}
