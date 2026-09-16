"use strict";
/* timeline.js — the Timeline tab.
   The SN5 "Timeline" sheet reborn: a station x week production schedule.
   Stations are the rows, weeks are the columns, one Firestore doc per week and
   each station its own field, so two people scheduling different stations in
   the same week don't clobber each other.

   Weeks-as-columns is the way round the tab was designed
   (06 Composites App/design/timeline-weeklyplan-mockup-20260728.png) and the way round
   the question comes: "when is Mold 1 free" is one horizontal scan. The first
   build had it transposed, which put the unbounded axis (weeks, one per week
   of the season) on the axis that makes the page taller and the fixed seven
   stations on the axis that has to fit — nine columns with a 900px floor, 2.3
   screens wide on a phone.

   Below 900px the same markup becomes one card per week. That works without
   reordering anything because the DOM is week-major and the wide layout is a
   grid rather than a table: see the .tlgrid block in index.html.

   weeklyplan.js writes goals / doneTickets / cars onto these same docs and
   reads only `id` and `weekOf` off them. Nothing here touches those fields. */

/* field key -> row label. The 7 part-schedulable stations, then two free-text
   rows.

   The field keys are the SN5 tracker's and must not change: they are the
   Firestore field names in every existing schedule doc. The LABELS can, and
   two of them had to. "Mold 1" and "Mold 2" read as two CNC machines, and the
   team has one ShopSabre — the mockup this tab was designed from shows a
   single "ShopSabre" row for exactly that reason. They are two job slots on
   one machine, and a sophomore who reads them as two machines books neither
   and turns up on the same day as someone else. */
const STATIONS = [
  ["mold1", "ShopSabre slot 1"], ["mold2", "ShopSabre slot 2"],
  ["infusion1", "Infusion 1"], ["infusion2", "Infusion 2"],
  ["wetlay1", "Wet Layup 1"], ["wetlay2", "Wet Layup 2"],
  ["waterjet", "Waterjet"],
];
// The two free-text rows, kept separate so the grid can rule a line above them
// and so "how many stations are booked" never counts a note.
const EXTRA_ROWS = [["other", "Other"], ["notes", "Notes"]];
const ALL_ROWS = STATIONS.concat(EXTRA_ROWS);

/* Undo, same shape and same reasoning as PART_UNDO in parts.js: this writes to
   a schedule the whole team reads, and "I fat-fingered that a minute ago" is
   the real failure mode. Module-level so it survives a render. */
let TL_UNDO = null;
/* render() replaces main's innerHTML, which resets the grid's scrollLeft to 0
   and throws you back to the start of the season on every edit. Remembered
   here and restored after each paint by syncTimelineScroll(). */
let TL_SCROLL = null;
/* A week to bring on screen after the next paint, by id. Set when a week is
   added or re-dated, because both move it somewhere the current scroll offset
   isn't. Cleared by syncTimelineScroll() once it has been used. */
let TL_FOCUS = null;

function schedById(id) { return DB.schedule.find(w => w.id === id); }
function saveWeek(w, field) { w = w || schedById(view.id); if (w) save("schedule", w, field); }

/* ---------- week dates ----------
   A weekOf is always the Monday. weeklyplan.js derives its seven day columns
   from it by adding 0..6 days, so a Thursday in the field silently makes that
   tab's "week" run Thursday to Wednesday. Everything that writes a date here
   goes through mondayOf() first.

   Local getters rather than toISOString(), which converts to UTC and hands
   back the previous day for anyone west of Greenwich. */
function tlIso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Sunday is 0, and it ends a week here
  return tlIso(d);
}
function tlAddDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + n);
  return tlIso(d);
}
// The Monday a new week should land on: the one after the last week already
// scheduled, or this week when nothing is. Skips forward over any date already
// taken so two clicks never make two weeks of the same date.
function nextFreeWeekOf() {
  const dated = DB.schedule.filter(w => w.weekOf).map(w => w.weekOf).sort();
  const taken = new Set(dated);
  let d = dated.length ? tlAddDays(dated[dated.length - 1], 7) : mondayOf(today());
  while (d && taken.has(d)) d = tlAddDays(d, 7);
  return d;
}

/* Every new week gets a date. It used to be written with weekOf:"", which put
   it in the undated bucket renderTimeline() files under the collapsed "SN5
   archive" card — so "+ Add week" saved a doc and changed nothing you could
   see, on a tab where the four stat tiles all count dated weeks too. */
function newWeek() {
  let max = 0;
  DB.schedule.forEach(w => { const m = String(w.id).match(/^W(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  const id = "W" + String(max + 1).padStart(2, "0");
  const w = { id, weekOf: nextFreeWeekOf(), other: "", notes: "", retro: false };
  STATIONS.forEach(([k]) => (w[k] = ""));
  DB.schedule.push(w); saveWeek(w);
  TL_FOCUS = id;
  render();
  if (typeof toast === "function") toast(`Added the week of ${w.weekOf}. Tap the date to change it.`);
}

/* The date was display-only until now: updWeekDate() existed and nothing
   called it, so a week could be added but never moved, and the eleven imported
   SN5 weeks could never be dated into the grid at all. */
function openWeekDate(weekId) {
  const w = schedById(weekId);
  if (!w) return;
  openModal(`
    <h2>${w.weekOf ? "Week of " + esc(w.weekOf) : esc(w.id)}</h2>
    <p class="muted">Weeks run Monday to Sunday, so the date is that week's Monday. Pick any day in the week and it snaps.</p>
    <div class="field"><label for="tl-week-date">Week of</label>
      <input id="tl-week-date" type="date" autofocus value="${esc(w.weekOf)}">
    </div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitWeekDate('${esc(weekId)}')">Save</button>
    </div>
  `);
}
function submitWeekDate(weekId) {
  const el = document.getElementById("tl-week-date");
  const val = el ? el.value : "";
  closeModal();
  const mon = mondayOf(val);
  if (!mon) { toast("That is not a date the schedule can use.", "error"); return; }
  // Two weeks on the same Monday sort arbitrarily against each other and give
  // Weekly Plan's picker two identical-looking options.
  const clash = DB.schedule.find(x => x.id !== weekId && x.weekOf === mon);
  if (clash) { toast(`The week of ${mon} is already on the schedule as ${clash.id}.`, "error"); return; }
  TL_FOCUS = weekId;
  updWeekDate(weekId, mon);
  if (mon !== val) toast(`Moved to the Monday of that week, ${mon}.`);
}
function delWeek(id) { weeksBulkDelete([id]); }
/* Says what it actually deletes. The doc is shared with Weekly Plan, so this
   takes the weeks' goals and carpools with them — which the old wording
   ("Delete this week from the schedule") did not tell you. Lead-only in the
   rules as well as here, so the blast radius is bounded either way. */
function weeksBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can delete weeks.", "error"); return; }
  const set = new Set(ids || []);
  const weeks = (DB.schedule || []).filter(w => set.has(w.id));
  if (!weeks.length) { toast("Nothing selected.", "info"); return; }
  const goals = weeks.reduce((n, w) => n + (w.goals || []).length, 0);
  const cars = weeks.reduce((n, w) => n + (w.cars || []).length, 0);
  const extra = [];
  if (goals) extra.push(plural(goals, "weekly goal"));
  if (cars) extra.push(plural(cars, "carpool"));
  const what = weeks.length === 1 ? (weeks[0].weekOf ? "the week of " + weeks[0].weekOf : weeks[0].id) : plural(weeks.length, "week");
  bulkDeleteRecords({
    message: `Delete ${what} for everyone?` + (extra.length ? ` This also deletes ${weeks.length === 1 ? "its" : "their"} ${extra.join(" and ")} from the Weekly Plan.` : ""),
    items: weeks.map(w => ({ coll: "schedule", id: w.id })),
    done: `${what} deleted`,
    after: () => { const gone = new Set(weeks.map(w => w.id)); DB.schedule = (DB.schedule || []).filter(w => !gone.has(w.id)); },
  });
}
function deletePickedWeeks() { weeksBulkDelete(pickedIds("schedule")); }

// A cell value is a part id when it matches a known part; otherwise it's free
// text (e.g. an imported SN5 part name we couldn't map). Render accordingly.
function cellView(val) {
  if (!val) return "";
  const p = recById("parts", val);
  return p ? esc(p.partName || p.id) : esc(val);
}

// The row you're standing in. This is the production schedule, so "which week
// is now" is the first question anyone asks of it. weekContains() lives in
// weeklyplan.js; both tabs read the same schedule docs, and it only runs at
// render time so load order doesn't matter.
function isThisWeek(w) {
  return !!w.weekOf && typeof weekContains === "function" && weekContains(w, today());
}
function weekLabel(w) {
  if (!w.weekOf) return esc(w.id);
  const d = new Date(w.weekOf + "T12:00:00");
  return isNaN(d) ? esc(w.weekOf)
    : esc(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
}
function bookedCount(w) { return STATIONS.filter(([k]) => w[k]).length; }

/* ---------- assigning ----------
   A cell holds one of ~33 parts, so it can't be a one-tap write the way a
   Parts stage stepper can — it needs a picker, and the picker is what stops an
   accidental touch from changing a shared schedule. Same idiom weeklyplan.js
   uses for carpools. */
function openAssign(weekId, key) {
  const w = schedById(weekId);
  if (!w) return;
  const label = (ALL_ROWS.find(([k]) => k === key) || [key, key])[1];
  const cur = w[key] || "";
  const free = EXTRA_ROWS.some(([k]) => k === key);
  const parts = DB.parts.slice().sort((a, b) => (a.partName || a.id).localeCompare(b.partName || b.id));
  // An imported SN5 name that never mapped to a part record. Keep it selectable
  // rather than silently dropping it the first time someone opens the picker.
  const known = !cur || !!recById("parts", cur);
  /* The cell used to BE a chip that jumped to the part, and a cell that opens a
     picker cannot also be that link without nesting one control inside
     another. The jump moves here instead, so the cross-link the tab has always
     had still exists — one tap further away, and now next to the thing it
     describes. */
  const linked = !free && cur && recById("parts", cur);
  openModal(`
    <h2>${esc(label)} — ${w.weekOf ? "week of " + esc(w.weekOf) : esc(w.id)}</h2>
    ${linked ? `<p class="muted">Currently ${chip("parts", cur, linked.partName || cur)} — open it in Parts.</p>` : ""}
    ${free ? "" : `<p class="gate"><span class="gi">!</span><span>This is the team's plan, not a booking. ${bookingNote(key)}</span></p>`}
    ${free ? `
      <div class="field"><label>${esc(label)}</label>
        <input id="tl-free" autofocus value="${esc(cur)}" placeholder="${key === "notes" ? "Milestone, break, anything the week needs on it" : "Anything not tied to a station"}">
      </div>`
    : `
      <div class="field"><label>Part</label>
        <select id="tl-part" autofocus>
          <option value="">— nothing scheduled —</option>
          ${!known ? `<option value="${esc(cur)}" selected>${esc(cur)} (text, not a part record)</option>` : ""}
          ${parts.map(p => `<option value="${esc(p.id)}" ${cur === p.id ? "selected" : ""}>${esc(p.partName || p.id)}</option>`).join("")}
        </select>
      </div>`}
    <div class="foot">
      ${cur ? `<button class="danger" onclick="clearStation('${esc(weekId)}','${esc(key)}')">Clear</button>` : ""}
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitAssign('${esc(weekId)}','${esc(key)}')">${cur ? "Save" : "Assign"}</button>
    </div>
  `);
}
/* Scheduling a station here does not reserve the machine. Kept specific rather
   than generic because a vague "book it yourself" is the kind of warning people
   stop reading, and because the own-reservation rule has teeth: block-booking
   through other members is what got members pulled aside at Jacobs
   (#composites, 2026-02-23), and the RFS system carries the same rule.

   The machine is the ShopSabre at RFS. The Jacobs Shopbot is the older machine
   and the fallback we would rather not use (CS-005 §1), so it isn't named here
   — a station row that mentions it invites someone to book it. */
function bookingNote(key) {
  if (key === "mold1" || key === "mold2") {
    return "Whoever runs the job books the ShopSabre at RFS themselves, on the RFS/RSO reservation site. You may only come in for your own reservation, so booking a slot in someone else's name does not work.";
  }
  if (key === "waterjet") return "Waterjet time is booked in slots — whoever cuts reserves it.";
  return "Check the bench is free before you count on it.";
}

function submitAssign(weekId, key) {
  const el = document.getElementById("tl-part") || document.getElementById("tl-free");
  closeModal();
  assignStation(weekId, key, el ? el.value : "");
}
function clearStation(weekId, key) { closeModal(); assignStation(weekId, key, ""); }

/* Kept to the exact signature it has always had: the modal calls it, and so
   does tools/test_app.mjs. Still one save() per field, which is what lets two
   people schedule different stations in the same week. */
function assignStation(weekId, station, partId) {
  const w = schedById(weekId);
  if (!w) return;
  const from = w[station] || "";
  if (from === partId) { render(); return; }
  w[station] = partId;
  saveWeek(w, station);
  TL_UNDO = { id: weekId, key: station, from, to: partId };
  render();
}
function undoTimelineCell() {
  const u = TL_UNDO; TL_UNDO = null;
  if (!u) { render(); return; }
  const w = schedById(u.id);
  if (!w) { toast("That week is gone — nothing to undo.", "error"); render(); return; }
  w[u.key] = u.from;
  saveWeek(w, u.key);
  toast("Undone.");
  render();
}
function dismissTimelineUndo() { TL_UNDO = null; render(); }
function timelineUndoBar() {
  const u = TL_UNDO;
  if (!u) return "";
  const w = schedById(u.id);
  const label = (ALL_ROWS.find(([k]) => k === u.key) || [u.key, u.key])[1];
  const when = w && w.weekOf ? "week of " + w.weekOf : (w ? w.id : "");
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${esc(label)}</b> · ${esc(when)} → <b>${esc(cellView(u.to) || "nothing scheduled")}</b>${u.from ? ` (was ${esc(cellView(u.from))})` : ""} — saved for everyone.</span>
    <button class="sm" onclick="undoTimelineCell()">Undo</button>
    <button class="sm" title="Dismiss" aria-label="Dismiss" onclick="dismissTimelineUndo()">${icon("x", 14)}</button>
  </div>`;
}

function updWeek(weekId, key, val) { const w = schedById(weekId); w[key] = val; saveWeek(w, key); }
/* The date changes which column is "now" and where the week sorts, so unlike
   the free-text fields this one has to repaint. */
function updWeekDate(weekId, val) { updWeek(weekId, "weekOf", val); render(); }

/* ---------- rendering ---------- */

function weekColumn(w, opts) {
  const now = isThisWeek(w);
  const past = !!w.weekOf && !now && w.weekOf < today();
  return `<section class="tl-wk${w.retro ? " retro" : ""}${now ? " now" : ""}${past ? " past" : ""}${pickIs("schedule", w.id) ? " picked" : ""}" data-week="${esc(w.id)}">
    <div class="tl-wkhd${now ? " now" : ""}"${now ? ' aria-label="Week of ' + esc(w.weekOf) + ', the current week"' : ""}${pickOn("schedule") ? ` onclick="togglePick('schedule','${esc(w.id)}')"` : ""}>
      ${pickBox("schedule", w.id)}<button class="tl-wkdate" title="Change this week's date" aria-label="${w.weekOf ? "Week of " + esc(w.weekOf) : esc(w.id) + ", undated"}, change the date" onclick="openWeekDate('${esc(w.id)}')">${weekLabel(w)}</button>
      ${now ? '<span class="pill now">Now</span>' : ""}
      ${opts && opts.lead ? `<button class="ib sm tl-del no-print" title="Delete this week" aria-label="Delete the week of ${esc(w.weekOf || w.id)}" onclick="delWeek('${esc(w.id)}')">${icon("trash", 13)}</button>` : ""}
    </div>
    ${ALL_ROWS.map(([k, label], i) => {
      const val = w[k] || "";
      const free = i >= STATIONS.length;
      return `<button class="tl-cell${val ? "" : " empty"}${now ? " now" : ""}${free ? " tl-note" : ""}"
        onclick="openAssign('${esc(w.id)}','${k}')"
        aria-label="${esc(label)}, ${w.weekOf ? "week of " + esc(w.weekOf) : esc(w.id)}: ${val ? esc(cellView(val)) : "open"}">
        <span class="tl-stname">${esc(label)}</span><span${val ? "" : " class=\"tl-open\""}>${val ? cellView(val) : "open"}</span>
      </button>`;
    }).join("")}
  </section>`;
}

function timelineGrid(weeks, opts) {
  return `<div class="tlwrap"><div class="tlgrid${opts && opts.showPast ? " showpast" : ""}" onscroll="TL_SCROLL = this.scrollLeft; tlEdges(this)">
    <div class="tl-stations">
      <div class="tl-corner">Station</div>
      ${ALL_ROWS.map(([, label], i) =>
        `<div class="tl-strow${i === STATIONS.length ? " tl-sep" : ""}">${esc(label)}</div>`).join("")}
    </div>
    ${weeks.map(w => weekColumn(w, opts)).join("")}
  </div></div>`;
}

/* ---------- Schedule: one tab, two views (2026-08-04) ----------
   Timeline (season by station) and Weekly Plan (week by person) render the
   same `schedule` collection and were separate tabs with a cross-link between
   them. They are now one "Schedule" tab behind this toggle, the same shape as
   Tickets' board/list. The `weekplan` tab id lives on as a hidden alias so
   old links and stored notifications land on the week view. */
function renderSchedule() {
  const week = view.schedView === "week";
  const seg = (on, label, js) => `<button class="ib ${on ? "primary" : ""}" ${on ? "" : `onclick="${js}"`}>${label}</button>`;
  const toggle = `<div class="toolbar no-print">
    ${seg(!week, "Season by station", "view.schedView='stations';render()")}
    ${seg(week, "Week by person", "view.schedView='week';render()")}
  </div>`;
  return toggle + (week ? renderWeekPlan() : renderTimeline());
}

function renderTimeline() {
  const lead = isLead();
  const all = DB.schedule.slice();
  // Dated weeks are the schedule. Undated ones are the SN5 import, which ships
  // every week with weekOf:"" — honest for retro data, and 11 rows of noise at
  // the bottom of a live schedule, which the old build apologised for in a
  // paragraph instead of moving them.
  const dated = all.filter(w => w.weekOf).sort((a, b) => a.weekOf.localeCompare(b.weekOf));
  const undated = all.filter(w => !w.weekOf).sort((a, b) => a.id.localeCompare(b.id));

  if (!all.length) {
    return `<div class="card tl-empty">
      <div class="tl-ei">${icon("timeline", 30)}</div>
      <h2>No weeks scheduled yet</h2>
      <p>The production schedule assigns a part to a station for a given week.</p>
      <div class="toolbar tl-center no-print">
        <button class="primary" onclick="newWeek()">+ Add week</button>
      </div>
    </div>`;
  }

  const cur = dated.find(isThisWeek);
  /* On a phone the grid is a stack of week cards, so the season's finished
     weeks are eight screens between you and the one you came to read. Folded
     away by default down there; on a wide screen they stay in the grid, where
     scrolling past them costs a flick. */
  const past = dated.filter(w => !isThisWeek(w) && w.weekOf < today());
  const scheduled = new Set();
  all.forEach(w => STATIONS.forEach(([k]) => { if (w[k]) scheduled.add(w[k]); }));
  /* Unfinished parts only. Counting every part that Timeline has never touched
     included the ones already off the bench, which made this a large number
     that never went down and trained people to ignore the whole stat row. */
  const unplanned = DB.parts.filter(p =>
    !scheduled.has(p.id) && !(typeof partDone === "function" && partDone(p))).length;

  return `
  ${timelineUndoBar()}
  <div class="stat-row">
    <div class="stat-tile"><div class="bignum">${dated.length}</div><div class="stat-label">Weeks scheduled</div></div>
    <div class="stat-tile"><div class="bignum">${cur ? bookedCount(cur) : "—"}</div><div class="stat-label">${cur ? "Stations booked this week" : "No week is current"}</div></div>
    <div class="stat-tile"><div class="bignum">${scheduled.size}</div><div class="stat-label">Parts on the schedule</div></div>
    <div class="stat-tile"><div class="bignum">${unplanned}</div><div class="stat-label">Parts with no slot</div></div>
  </div>
  <div class="toolbar no-print">
    ${pickOn("schedule") ? "" : `<button class="primary" onclick="newWeek()">+ Add week</button>
    ${cur ? `<button onclick="jumpToThisWeek()">Jump to this week</button>` : ""}
    <span class="muted tl-hint">Tap a cell to schedule a part</span>`}
    ${lead ? pickBar("schedule", {
      // What is on screen: folded-away past weeks and a hidden archive are not.
      all: dated.filter(w => view.tlPast || !past.length || !past.includes(w)).map(w => w.id).concat(view.tlArchive ? undated.map(w => w.id) : []),
      onDelete: "deletePickedWeeks()", hint: "Select several weeks to delete them, goals and carpools included" }) : ""}
  </div>
  ${past.length && !view.tlPast ? `<div class="toolbar tl-earlier no-print"><button class="sm" onclick="view.tlPast=true;render()">Show ${past.length} earlier week${past.length === 1 ? "" : "s"}</button></div>` : ""}
  ${dated.length ? timelineGrid(dated, { lead, showPast: !!view.tlPast || !past.length }) : `<div class="card muted">Every week is undated, so nothing can be placed in order yet. Open one below and give it a date.</div>`}
  ${undated.length ? `
  <div class="card tl-archive">
    <h3>SN5 archive <span class="pill retro">retro</span> · ${undated.length} undated week${undated.length === 1 ? "" : "s"}</h3>
    <div class="toolbar no-print"><button class="sm" onclick="view.tlArchive=!view.tlArchive;render()">${view.tlArchive ? "Hide" : "Show"} archive</button></div>
    ${view.tlArchive ? timelineGrid(undated, { lead }) : ""}
  </div>` : ""}`;
}

/* Put the current week on screen. Called from the toolbar button, and once
   after each paint so an edit doesn't fling you back to the start of the
   season. Guarded with the same optional-function idiom core.js already uses,
   so load order never matters. */
function jumpToThisWeek() {
  /* tools/test_app.mjs runs the whole app against a DOM stub with no
     querySelector and no getBoundingClientRect, and render() calls the sync
     below on EVERY tab. Same guard, and the same reason, as
     syncChromeMetrics() in core.js. */
  if (typeof document.querySelector !== "function") return;
  const el = document.querySelector("#main .tl-wkhd.now");
  const grid = document.querySelector("#main .tlgrid");
  if (!el || !grid) return;
  const rail = grid.querySelector(".tl-corner");
  const railW = rail ? rail.getBoundingClientRect().width : 0;
  const g = grid.getBoundingClientRect(), e = el.getBoundingClientRect();
  /* Already fully in view behind neither edge nor rail: leave it alone. A
     short season fits without scrolling, and nudging it anyway slides the
     first week under the sticky rail and clips it mid-word. */
  if (e.left >= g.left + railW && e.right <= g.right) return;
  grid.scrollLeft += e.left - g.left - railW - 8;
  TL_SCROLL = grid.scrollLeft;
}
/* Bring one week on screen by id. A week that was just added is at the far
   right of a season that may be nine columns wide, and a week that was just
   re-dated has moved; either way the remembered scrollLeft now points at the
   wrong place. Same rail-width maths as jumpToThisWeek(). */
function scrollWeekIntoView(id) {
  if (typeof document.querySelector !== "function") return;
  const grid = document.querySelector("#main .tlgrid");
  if (!grid) return;
  const sec = grid.querySelector(`.tl-wk[data-week="${id}"]`);
  if (!sec) return;
  // Below 900px the grid is a stack of cards and doesn't scroll sideways.
  if (grid.scrollWidth <= grid.clientWidth + 2) {
    if (typeof sec.scrollIntoView === "function") sec.scrollIntoView({ block: "nearest" });
    return;
  }
  /* Measure the HEADER, not the section. On a wide screen .tl-wk is
     `display: contents` — its cells are the grid items and the section itself
     has no box at all, so its rect is 0,0,0,0 and every sum below comes out as
     "scroll to the far left". jumpToThisWeek() targets .tl-wkhd.now for the
     same reason. */
  const hd = sec.querySelector(".tl-wkhd");
  if (!hd) return;
  const rail = grid.querySelector(".tl-corner");
  const railW = rail ? rail.getBoundingClientRect().width : 0;
  const g = grid.getBoundingClientRect(), e = hd.getBoundingClientRect();
  if (e.left < g.left + railW || e.right > g.right) grid.scrollLeft += e.left - g.left - railW - 8;
  TL_SCROLL = grid.scrollLeft;
}
function syncTimelineScroll() {
  if (typeof document.querySelector !== "function") return;
  const grid = document.querySelector("#main .tlgrid");
  if (!grid) return;
  if (TL_FOCUS) { const id = TL_FOCUS; TL_FOCUS = null; scrollWeekIntoView(id); }
  else if (TL_SCROLL != null) grid.scrollLeft = TL_SCROLL;
  else jumpToThisWeek();
  tlEdges(grid);
}
/* Which edges have more behind them. Read from the element rather than from a
   count of weeks, because "does it fit" depends on the window, the sidebar
   rail and how long the part names happen to be. Below 900 the grid is a stack
   of cards and never scrolls, so both come off on their own. */
function tlEdges(grid) {
  const wrap = grid.parentElement;
  if (!wrap || !wrap.classList) return;
  const max = grid.scrollWidth - grid.clientWidth;
  wrap.classList.toggle("more-left", grid.scrollLeft > 2);
  wrap.classList.toggle("more-right", max > 2 && grid.scrollLeft < max - 2);
}
