"use strict";
/* molds.js — the Molds tab: molds and their stack plans as one master–detail
   split.

   WHY ONE TAB FOR MOLDS AND PLANS. A stack plan is a mold's file, not a record
   beside it — Simon: "you can condense molds and stock plans, they function the
   same... there should only be an option to make a mold." So the mold carries
   currentPlanId, plans are reached through their mold, and one + Mold button
   opens the planner (which can also just record a mold with no geometry, for
   an SN5 tool being catalogued). The one exception on the rail is a plan whose
   mold is missing, which has nothing to be reached through and would otherwise
   be invisible.

   WHY BOARDS ARE NOT HERE. They used to be, as a third rail group. A board is
   a thing on a shelf, though, and Inventory is where the shelves are — it had
   already been bucketing DB.stock by location for its storage map and its
   contents pages. Only the list sat here. It now lives in Inventory beside
   Items list and Materials list (see the Boards section of stock.js); Molds
   keeps one number, the ft³ on hand, as a tile that opens it. A mold's "cut
   from board" chip and a scanned BRD- label still resolve — moldsOrBoardsFor
   in core.js routes them to Inventory, so nothing dead-ends the way it did
   before boards had a detail page at all.

   SHAPE. The Parts tab's split, transcribed rather than abstracted: a
   persistent rail on the left, the selected record on the right, the season
   view when nothing is picked. ↑/↓ or j/k walk the rail, `1` advances the
   selected mold one named stage through the same quickAdvance the detail
   button uses, `/` searches, esc clears. At or below 900px the same markup
   collapses to list-then-detail via `has-sel`, exactly like parts.js — see the
   responsive block in index.html.

   THE RAIL IS GROUPED BY STAGE, one header per stage a mold is actually at.
   Mold making is a pipeline and the rail now reads like one. Because the group
   is a PARTITION of the already stage-sorted array rather than a filter per
   stage, what renders is moldsFlatRows() with headers dropped in — which is
   what keeps ↑/↓ walking exactly the rows on screen. Group headers are drawn
   by the body renderer and are not rows, so the keyboard cannot land on one.
   The row itself drops the stage word (the header above says it) and spends
   those slots on what you would otherwise open the mold to learn: whether it
   has a home, and whether it has a stack plan.

   WHAT LIVES WHERE. The mold pane is renderShopDetail("molds") embedded, plus
   its plan's artifacts when one is linked — 3D view included. The plan pane is
   renderStackPlan(), reached for a plan with no mold to be shown through. The
   season view carries the stage bar, the board headline, and "Needs a hand":
   the molds with no home, the ones past Designed with no plan, the plans
   carrying slicer warnings, and the plans with no mold. The cut list keeps its
   full-width takeover: it is a batch print artifact, not a record.

   The old `stock` TABS row survives hidden, so #/stock links, stored
   notification links and every test literal keep resolving. Collections,
   prefixes and rules are untouched. */

function moldRecById(id) { return (DB.molds || []).find(m => m.id === id); }
/* An orphan is a plan with nothing to be reached THROUGH: no mold id, or one
   pointing at a mold that is gone. This used to be written out twice with two
   different meanings — the rail tested both halves, the overview only the
   first — so a plan with a dangling moldId showed on the rail offering
   adoption and was invisible on the overview, and createMoldFromPlan refused
   it outright because p.moldId was truthy. One predicate, four callers. */
function planIsOrphan(p) { return !!p && (!p.moldId || !moldRecById(p.moldId)); }

/* ---------- selection ---------- */
function moldsSelected() {
  if (view.mode !== "detail" && view.mode !== "plan") return null;
  const id = String(view.id || "");
  if (id.startsWith("MOLD-")) return { kind: "mold", rec: moldRecById(id) };
  // Boards are Inventory's now — moldsOrBoardsFor sends a BRD- or SZ: id
  // there, so one arriving here is stale and falls through to the overview.
  if (id.startsWith("STK-")) return { kind: "plan", rec: planById(id) };
  return null;
}
function selectMoldsRec(id) {
  view = { ...view, mode: "detail", id, edit: false };
  render();
  const el = document.getElementById("pi-" + id);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function clearMoldsSelection() { view = { ...view, mode: "list", id: null, edit: false }; render(); }

/* ---------- the rail rows ----------
   One flat, ordered array of everything the rail shows, so keyboard walking
   and rendering can never disagree about what is next. Group headers are
   drawn by the body renderer and are not rows. */
function moldStagePct(m) {
  /* Retired is off the track, so it has no position on the bar. It reads full
     rather than empty because the mold is done being a mold, and the mark
     class beside it (st-na) is what says "retired" — this number only says how
     far along it got. It used to fall out of the arithmetic as 125%, which the
     bar clipped but the caption printed verbatim. */
  if (m.stage === "Retired") return 100;
  const i = MOLD_TRACK.indexOf(m.stage);
  if (i <= 0) return 0;
  return Math.round((i / (MOLD_TRACK.length - 1)) * 100);
}
function moldStageMarkClass(m) {
  const cls = shopStageClass(SHOP.molds, m);
  return cls === "Cancelled" ? "st-na" : cls === "Complete" ? "st-done" : cls === "Draft" ? "st-0" : "st-mid";
}
/* ---------- moving a stage ----------
   The detail pane's stage control, in the Parts tab's stepper idiom: the whole
   enum laid out as tappable steps, current filled, the rest outlined. It used
   to be a <select> behind Edit plus a next-stage button — advancing was fine,
   but "we skipped sealing" or "this actually went back to the board" meant
   Edit → find the field → open the dropdown → pick. One control, always live,
   and the display can't drift from the editor because they are the same thing.

   "Retired" renders like the parts stepper's N/A step (dashed, off the track):
   it is how a mold leaves the progression, not a step along it, which is also
   why moldStagePct measures over MOLD_TRACK above. */
function moldStageRow(m) {
  const cur = MOLD_STAGE.includes(m.stage) ? m.stage : MOLD_STAGE[0];
  const at = MOLD_TRACK.indexOf(cur);
  const step = v => {
    const isCur = v === cur;
    const retired = v === "Retired";
    const i = MOLD_TRACK.indexOf(v);
    const state = retired ? "st-na" : i === 0 ? "st-0" : i >= MOLD_TRACK.length - 1 ? "st-done" : "st-mid";
    const past = !isCur && !retired && at >= 0 && i < at;
    const cls = ["pstep", isCur ? "cur " + state : "", past ? "past" : "", retired ? "na" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}"${isCur ? ' aria-current="step"' : ""}
      title="${isCur ? "Stage is " + esc(v) : "Set stage to " + esc(v)}"
      onclick="setMoldStage('${esc(m.id)}','${esc(v)}',event)">${esc(v)}</button>`;
  };
  return `<div class="pstage" style="margin-top:8px">
    <div class="ps-label">Stage</div>
    <div class="ps-steps" role="group" aria-label="Mold stage">${MOLD_STAGE.map(step).join("")}</div>
  </div>`;
}
/* Same grading as setPartStage, because a click here is a write everyone sees:
   forward by one applies at once (undo bar via SHOP_UNDO, same as
   quickAdvance — including the offcut offer on "Board glued"); skipping ahead
   asks, naming the steps it would mark done; moving back asks (it erases
   recorded work); Retired asks (it takes the mold off the rail). */
function setMoldStage(id, val, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const m = moldRecById(id);
  if (!m || !MOLD_STAGE.includes(val)) return null;
  const cur = MOLD_STAGE.includes(m.stage) ? m.stage : MOLD_STAGE[0];
  if (cur === val) return null;                       // clicking where you already are does nothing
  const name = m.name || m.id;
  const from = MOLD_TRACK.indexOf(cur);                    // -1 when coming back from Retired
  const to = MOLD_TRACK.indexOf(val);
  const apply = () => applyMoldStage(m, val);
  if (val === "Retired") {
    confirmModal(`Retire ${name}? It comes off the rail for everyone (still findable under the Retired filter).`,
      apply, { ok: "Retire" });
    return "confirm-retire";
  }
  if (from >= 0 && to < from) {
    confirmModal(`Move ${name} back from “${cur}” to “${val}”? Everyone on the team sees this.`,
      apply, { ok: "Move back", danger: false });
    return "confirm-back";
  }
  if (from >= 0 && to - from > 1) {
    const skipped = MOLD_TRACK.slice(from + 1, to).map(s => `“${s}”`);
    confirmModal(`Move ${name} straight to “${val}”? That marks ${skipped.join(" and ")} done without anyone recording ${skipped.length === 1 ? "it" : "them"}.`,
      apply, { ok: "Skip ahead", danger: false });
    return "confirm-jump";
  }
  if (from < 0) {
    confirmModal(`Bring ${name} back from Retired, at “${val}”?`, apply, { ok: "Un-retire" });
    return "confirm-unretire";
  }
  apply();
  return "applied";
}
function applyMoldStage(m, val) {
  const from = MOLD_STAGE.includes(m.stage) ? m.stage : MOLD_STAGE[0];
  m.stage = val;
  save("molds", m, "stage");
  SHOP_UNDO = { coll: "molds", id: m.id, from, to: val, name: m.name || m.id, prev: {} };
  toast(`${m.name || m.id} → ${val}`);
  render();
}

function moldsRailRows() {
  const q = (view.q || "").toLowerCase();
  const has = (o, extra) => !q || (JSON.stringify(o) + " " + (extra || "")).toLowerCase().includes(q);

  let molds = (DB.molds || [])
    .filter(m => view.fRetired ? true : m.stage !== "Retired")
    .filter(m => !view.fStatus || m.stage === view.fStatus)
    /* Applied HERE, with the other filters, not at render time. It used to be
       spliced into the group's .map() call, so moldsFlatRows — which is what
       the keyboard walks — disagreed with the DOM whenever the chip was on,
       and ↓ stepped through molds that were not on screen. */
    .filter(m => !view.fNoHome || !m.location)
    .filter(m => has(m))
    .sort((a, b) => (MOLD_STAGE.indexOf(a.stage) - MOLD_STAGE.indexOf(b.stage)) || String(a.name || a.id).localeCompare(String(b.name || b.id)));

  /* Stack plans are NOT a rail group any more. A plan is a mold's file, not a
     record in its own right — Simon: "there should only be an option to make a
     mold." An orphaned plan (made before molds were created automatically) is
     the one exception: it has no mold to be reached through, so it still shows
     until somebody adopts it. */
  let plans = (DB.stackplans || [])
    .filter(planIsOrphan)
    .filter(p => has(p))
    .slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));

  /* The selected record never falls out from under you — same rule as the
     Parts rail, and the reason a filter can't blank the pane you are reading.

     But "put it back" is not the same as "put it in the ORPHAN list". Pushing
     a LINKED plan into `plans` conjured a group header reading "Plans with no
     mold" over a row that printed its own mold id one slot to the right, and
     stole the sel highlight off the mold. A linked plan is not a rail row at
     all: it is represented by its mold's row. See moldsRailSelId. */
  const sel = moldsSelected();
  if (sel && sel.rec) {
    if (sel.kind === "mold" && !molds.includes(sel.rec)) molds.push(sel.rec);
    else if (sel.kind === "plan" && planIsOrphan(sel.rec) && !plans.includes(sel.rec)) plans.push(sel.rec);
  }
  return { molds, plans };
}
function moldsFlatRows() {
  const { molds, plans } = moldsRailRows();
  return [...molds, ...plans];
}

/* One header per stage, in MOLD_STAGE order, produced by WALKING the sorted
   array rather than filtering it once per stage. The sort in moldsRailRows is
   already stage-then-name, so grouping is just a partition — which means what
   renders is literally moldsFlatRows() with headers dropped in, and
   moldsNeighborId cannot disagree with what is on screen. A stage nobody is at
   gets no header; the overview's stage bar is where "which stages are empty"
   is answered. Retired sorts last in MOLD_STAGE, so it groups last for free. */
function moldsStageGroups(molds) {
  const out = [];
  for (const m of molds) {
    const stage = MOLD_STAGE.includes(m.stage) ? m.stage : MOLD_STAGE[0];
    const cur = out[out.length - 1];
    if (cur && cur.stage === stage) cur.rows.push(m);
    else out.push({ stage, rows: [m] });
  }
  return out;
}

/* Which rail row wears `sel`. A plan opened through its mold marks the MOLD:
   there is no plan row to mark, and an unmarked rail while a pane is open
   reads as "nothing is selected". Shared with moldsNeighborId so the keyboard
   walks from the same row the eye is on — otherwise findIndex misses, and the
   first arrow key jumps to the top of the rail. */
function moldsRailSelId() {
  if (view.mode !== "detail" && view.mode !== "plan") return null;
  const sel = moldsSelected();
  if (!sel || !sel.rec) return null;
  if (sel.kind === "plan" && !planIsOrphan(sel.rec)) return sel.rec.moldId;
  return sel.rec.id;
}

function moldsRailItem(kind, o) {
  const sel = moldsRailSelId() === o.id;
  const open = `selectMoldsRec('${esc(o.id)}')`;
  if (kind === "mold") {
    const done = o.stage === "Retired";
    /* The stage WORD is gone from the row: the header directly above it says
       the stage, and repeating it in every row is the noise that made the rail
       hard to scan. It survives in the tooltip and on the detail pill. The
       slots it frees go to the two things you would otherwise have to open the
       mold to find out — whether it has a home, and whether it has a plan. */
    const home = o.location ? ((shopById("items", o.location) || {}).name || String(o.location)) : "";
    const hasPlan = !!currentPlanFor(o);
    return `<div class="pitem ${sel ? "sel" : ""} ${done ? "isdone" : ""} ${pickIs("molds", o.id) ? "picked" : ""}" id="pi-${esc(o.id)}" role="option" aria-selected="${pickOn("molds") ? pickIs("molds", o.id) : sel}"
        title="${esc(o.id)} · ${esc(o.stage || "")}" onclick="${pickClick("molds", o.id, open)}">
      <span class="pi-name">${pickBox("molds", o.id)}${esc(o.name || o.id)}</span>
      <span class="pi-due">${home
        ? `<span class="tny muted">${esc(home.length > 18 ? home.slice(0, 17) + "…" : home)}</span>`
        : `<span class="tny warn">no home</span>`}</span>
      <span class="pi-sub"><span class="prog3"><span class="sg ${moldStageMarkClass(o)}" title="${esc(o.stage || "")}"><b>M</b><i style="width:${moldStagePct(o)}%"></i></span></span><span class="tny muted">${moldStagePct(o)}%</span></span>
      <span class="pi-who">${(bits => bits.length
        ? `<span class="tny muted">${bits.join(" · ")}</span>` : "")([
          hasPlan ? "" : "no plan",
          Number(o.uses) ? `${esc(o.uses)} uses` : "",
        ].filter(Boolean))}</span>
    </div>`;
  }
  if (kind === "plan") {
    const blocks = (o.layers || []).reduce((n, L) => n + (L.blanks || []).length, 0);
    return `<div class="pitem ${sel ? "sel" : ""} ${pickIs("molds", o.id) ? "picked" : ""}" id="pi-${esc(o.id)}" role="option" aria-selected="${pickOn("molds") ? pickIs("molds", o.id) : sel}"
        title="${esc(o.id)}" onclick="${pickClick("molds", o.id, open)}">
      <span class="pi-name">${pickBox("molds", o.id)}${esc(o.name || o.id)}${(o.warnings || []).length ? ` ${icon("warning", 12)}` : ""}</span>
      <span class="pi-due"><span class="tny muted">${fmtWhen(o.ts)}</span></span>
      <span class="pi-sub"><span class="tny">${(o.layers || []).length} layers · ${blocks} blocks</span></span>
      <span class="pi-who">${o.moldId ? `<span class="tny muted">${esc(o.moldId)}</span>` : `<span class="tny muted">no mold</span>`}</span>
    </div>`;
  }
  return "";
}

function moldsGroupHead(name, bits) {
  return `<div class="pgrouphd"><span class="pg-name">${esc(name)}</span>${
    bits.filter(Boolean).map(b => `<span class="pg-n">${b}</span>`).join("")}</div>`;
}

function renderMoldsRail() {
  const { molds, plans } = moldsRailRows();
  const allMolds = DB.molds || [];
  const retired = allMolds.filter(m => m.stage === "Retired").length;
  const noHome = allMolds.filter(m => m.stage !== "Retired" && !m.location).length;
  // Warnings among the plans THIS HEADER HEADS. It used to count every plan in
  // the collection, so a linked plan's warning showed up as a number over the
  // unlinked list — which is not where you would go looking for it.
  const planWarn = plans.filter(p => (p.warnings || []).length).length;
  const total = molds.length + plans.length;
  const sel = moldsSelected();

  return `
  <aside class="mdindex" aria-label="Molds index">
    <div class="pindex-head no-print">
      <div class="toolbar">
        <button class="primary ib"${gx("Sign in to plan a mold.")} onclick="uploadMold()">+ Mold</button>
      </div>
      <div class="toolbar">
        ${pickOn("molds") ? "" : `${(DB.stackplans || []).length ? `<button class="ib" onclick="view={...view,mode:'cuts',cutSel:''};render()">${icon("print", 15)} Cut list</button>` : ""}
        ${(allMolds.length + (DB.stock || []).length) ? `<button class="ib" onclick="openLabelBuilder('molds')">${icon("print", 15)} Labels</button>` : ""}
        ${fusionHost() ? "" : `<button class="ib" onclick="window.open(ADDIN_RELEASE_URL, '_blank', 'noopener')" title="Plan a mold's stack from inside Fusion. Opens the add-in download.">${icon("download", 15)} Plan from Fusion</button>`}`}
        ${isLead() ? pickBar("molds", { all: molds.map(m => m.id).concat(plans.map(p => p.id)), onDelete: "deletePickedMolds()", hint: "Select several molds to delete them, with their stack plans" }) : ""}
      </div>
      <div class="psum">
        ${retired ? summaryChip("retired", retired, !!view.fRetired, "view.fRetired=!view.fRetired;render()") : ""}
        ${noHome ? summaryChip("no home", noHome, !!view.fNoHome, "view.fNoHome=!view.fNoHome;render()", "bad") : ""}
      </div>
      <div class="pfilters">
        <input id="searchbox" placeholder="search molds / plans / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
        <select title="Mold stage" onchange="view.fStatus=this.value;render()">
          <option value="">All stages</option>
          ${MOLD_STAGE.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="plist" role="listbox" aria-label="Molds and plans">
      ${total === 0 ? `<div class="pempty muted">${
        (DB.molds || []).length ? "Nothing matches these filters."
        : "Nothing here yet — <b>+ Mold</b>, or import the SN5 molds with <b>Find molds in work orders</b> under Reports."}</div>` : ""}
      ${/* Count only. "no home" belongs to the row that has it — every row
            already says so in red, and the chip above counts them — and a
            header reading "1  1 no home" is two numbers you have to stop and
            tell apart. */
        moldsStageGroups(molds).map(g => moldsGroupHead(g.stage, [
          `${g.rows.length} mold${g.rows.length === 1 ? "" : "s"}`,
        ]) + g.rows.map(m => moldsRailItem("mold", m)).join("")).join("")}
      ${plans.length ? moldsGroupHead("Unlinked plans", [
        `${plans.length}`, planWarn ? `${icon("warning", 12)} ${planWarn} with warnings` : ""]) : ""}
      ${plans.map(p => moldsRailItem("plan", p)).join("")}
      <div class="plistfade" aria-hidden="true"></div>
    </div>
    <div class="keyhint no-print muted tny"><span><kbd>↑</kbd><kbd>↓</kbd> move</span>${
      sel && sel.kind === "mold" ? "<span><kbd>1</kbd> advance stage</span>" : ""
    }<span><kbd>/</kbd> search</span>${sel && sel.kind === "mold" ? "<span><kbd>e</kbd> edit</span>" : ""}<span><kbd>esc</kbd> back</span></div>
  </aside>`;
}

/* ---------- the season view (nothing selected) ---------- */
/* One stagebreak bar for the live molds, MOLD_STAGE order with Retired off
   the track. Two callers: the Molds season pane and the Dashboard's Season
   panel. Extracted rather than duplicated so the two can never disagree. */
function moldsStageBar(liveMolds) {
  const live = liveMolds || (DB.molds || []).filter(m => m.stage !== "Retired");
  const counts = MOLD_TRACK.map(s => live.filter(m => m.stage === s).length);
  const tot = counts.reduce((a, b) => a + b, 0) || 1;
  const segCls = i => i === 0 ? "st-0" : i >= MOLD_TRACK.length - 1 ? "st-done" : "st-mid";
  return `<div class="stagebreak">
    <div class="sb-label">Molds</div>
    <div class="sb-bar">${counts.map((n, i) => n ? `<span class="sb-seg ${segCls(i)}" style="width:${(n / tot) * 100}%" title="${n} ${esc(MOLD_STAGE[i])}"></span>` : "").join("")}</div>
    <div class="sb-nums tny">${counts.map((n, i) => n ? `<span class="${i === 0 ? "muted" : i >= MOLD_TRACK.length - 1 ? "done" : "mid"}">${n} ${esc(MOLD_STAGE[i].toLowerCase())}</span>` : "").filter(Boolean).join(" · ") || '<span class="muted">no live molds</span>'}</div>
  </div>`;
}

function moldsOverview() {
  const molds = DB.molds || [];
  const live = molds.filter(m => m.stage !== "Retired");
  const ready = live.filter(m => m.stage === "Ready for layup").length;
  const noHome = live.filter(m => !m.location).length;
  const ft3 = (DB.stock || []).reduce((n, b) => n + boardVolumeFt3(b), 0);

  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;
  /* The one board number Molds still carries. The rack itself is Inventory's
     now, but "have we got board" is a mold-making question, so the headline
     stays here and the tile is the way through to the list. */
  const boardTile = `<div class="stat-tile" role="button" tabindex="0" title="Open the rack in Inventory"
      onclick="view={...view,tab:'inventory',invView:'boards',mode:'list',id:null,q:''};render();syncUrl()">
    <div class="bignum">${ft3.toFixed(1)}</div><div class="stat-label">ft³ board on hand ▸</div></div>`;

  // Where the live molds stand, MOLD_STAGE order — the parts-tab bar idiom.
  // Shared with the Dashboard's Season panel, so it lives in its own function.
  const stageBar = moldsStageBar(live);

  /* Enough board for what is planned? The same math as the cut list's header,
     summarised to one sentence — the full per-board diagrams stay behind the
     Cut list button. */
  let shortLine = "";
  const blanks = (typeof blanksFromPlans === "function" && (DB.stackplans || []).length) ? blanksFromPlans(DB.stackplans) : [];
  if (blanks.length) {
    const res = packAll(blanks, boardsForPacking(), {});
    shortLine = res.shortfall.length
      ? `<div class="warn">${icon("warning", 14)} <b>Short ${res.shortfall.length} blank${res.shortfall.length === 1 ? "" : "s"}</b> across the planned molds — nothing on the rack fits them. Open the cut list for the sizes.</div>`
      : `<div class="muted">Every planned blank fits the rack: ${blanks.length} blanks across ${res.boardsUsed} board${res.boardsUsed === 1 ? "" : "s"}.</div>`;
  }

  /* The fix-me list. Four questions that used to be answered in four different
     places, or nowhere: which molds have no home, which have been machined
     with no stack plan on file, which plans came back from the slicer with a
     warning nobody has read, and which plans have no mold to be reached
     through. Each row opens the thing it is about. Rendered only when there is
     something in it — an empty "Needs a hand" card is a card that teaches you
     to stop reading it. */
  const homeless = live.filter(m => !m.location);
  // Past "Designed": a mold nobody has cut yet is allowed to have no plan.
  const noPlan = live.filter(m => MOLD_STAGE.indexOf(m.stage) > 0 && !currentPlanFor(m));
  const warned = (DB.stackplans || []).filter(p => (p.warnings || []).length);
  const unlinked = (DB.stackplans || []).filter(planIsOrphan);

  const chips = list => `<div class="stagerow">${list}</div>`;
  const needs = [
    homeless.length ? `<h3>No home location</h3>
      <div class="muted tny">A mold with no shelf is a mold somebody walks the shop looking for.</div>
      ${chips(homeless.map(m => `<span class="chip" onclick="selectMoldsRec('${esc(m.id)}')">${esc(m.name || m.id)}</span>`).join(""))}` : "",
    noPlan.length ? `<h3>No stack plan on file</h3>
      <div class="muted tny">Past “Designed” with nothing to cut from. Plan the stack, or record why there is no file.</div>
      ${chips(noPlan.map(m => `<span class="chip" onclick="selectMoldsRec('${esc(m.id)}')">${esc(m.name || m.id)} <span class="tny muted">${esc(m.stage || "")}</span></span>`).join(""))}` : "",
    warned.length ? `<h3>Plans with warnings</h3>
      <div class="muted tny">The slicer had something to say about these — thinned outlines, a mold near the block edge. Read before cutting.</div>
      ${chips(warned.map(p => `<span class="chip" onclick="selectMoldsRec('${esc(p.moldId && moldRecById(p.moldId) ? p.moldId : p.id)}')">${icon("warning", 12)} ${esc(p.name || p.id)}</span>`).join(""))}` : "",
    unlinked.length && isLead() ? `<h3>Unlinked plans</h3>
      <div class="muted tny">No mold to be reached through — made before planning created the mold record, or pointing at one since deleted. Open each to link or adopt it.</div>
      ${chips(unlinked.map(p => `<span class="chip" onclick="selectMoldsRec('${esc(p.id)}')">${esc(p.name || p.id)} <span class="tny muted">${fmtWhen(p.ts)}</span></span>`).join(""))}` : "",
  ].filter(Boolean);

  return `
  <section class="mddetail" aria-label="Molds overview">
    <div class="stat-row">
      ${tile(live.length, "Molds")}${tile(ready, "Ready for layup")}${tile(noHome, "No home location", noHome ? "warn" : "")}${boardTile}
    </div>
    <div class="card">
      <h2>Mold making this season</h2>
      <div class="muted">${live.length} live mold${live.length === 1 ? "" : "s"} · ${(DB.stackplans || []).length} stack plan${(DB.stackplans || []).length === 1 ? "" : "s"}. Pick anything on the left to open it.</div>
      ${stageBar}
      ${shortLine}
    </div>
    ${needs.length ? `<div class="card">
      <h2>Needs a hand</h2>
      ${needs.join("")}
    </div>` : ""}
  </section>`;
}

/* ---------- plan pane ----------
   renderStackPlan() unchanged underneath; this wraps it as the right-hand pane
   and, for a plan that has no mold, offers the two adoption actions.

   Only two ways in now that the mold pane carries its own 3D view: an orphan
   from the rail, or an "Earlier:" chip on a mold that has been re-planned.
   Both want exactly what this renders — the adoption offer, or the Superseded
   warning that says do not cut from this one. */
function moldsPlanPane(p) {
  if (!p) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const owner = p.moldId ? moldRecById(p.moldId) : null;
  const adopt = planIsOrphan(p) && isLead() ? `<div class="card no-print">
    <b>No mold record is linked to this plan.</b>
    <div class="muted tny">Plans made before 2026-08 predate the automatic mold record.</div>
    <div class="toolbar" style="margin-top:6px">
      <button class="ib" onclick="createMoldFromPlan('${esc(p.id)}')">Create mold from this plan</button>
      <select onchange="if(this.value)linkPlanToMold('${esc(p.id)}',this.value)">
        <option value="">Link to an existing mold…</option>
        ${(DB.molds || []).map(m => `<option value="${esc(m.id)}">${esc(m.name || m.id)} · ${esc(m.id)}</option>`).join("")}
      </select>
    </div>
  </div>` : "";
  const cur = owner ? currentPlanFor(owner) : null;
  const superseded = cur && cur.id !== p.id;
  const ownerLine = owner ? `<div class="card no-print"><b>Mold:</b> <span class="chip" onclick="selectMoldsRec('${esc(owner.id)}')">${esc(owner.name || owner.id)}</span>
    <span class="muted tny">· stage ${esc(owner.stage || "—")}</span>
    ${superseded ? `<div class="warn" style="margin-top:6px">${icon("warning", 14)}
      <b>Superseded</b> by ${esc(cur.name || cur.id)}, planned ${fmtWhen(cur.ts)}. Do not cut from this one.
      ${isLead() ? `<button class="sm" style="margin-left:8px" onclick="makeCurrentPlan('${esc(owner.id)}','${esc(p.id)}')">Make this the current plan</button>` : ""}
    </div>` : ""}</div>` : "";
  return `<section class="mddetail" aria-label="Stack plan">${ownerLine}${adopt}${renderStackPlan()}</section>`;
}

async function createMoldFromPlan(planId) {
  const p = planById(planId);
  if (!p || !planIsOrphan(p)) return;
  const id = await allocId("molds");
  if (!id) return;
  const m = {
    id, name: p.name || p.id, stage: "Designed",
    density: String(canonDensity(p.density) ?? ""), layers: (p.thicknessesMm || []).length ? `${p.thicknessesMm.length} layers` : "",
    createdBy: myEmail(),
  };
  DB.molds.push(m);
  save("molds", m);
  p.moldId = id;
  save("stackplans", p, "moldId");
  setCurrentPlan(m, p.id);
  toast(`${m.name} created at “Designed” and linked to this plan.`);
  selectMoldsRec(id);
}
/* Re-plan an existing mold. The old plan is never deleted — it goes onto
   planHistory and stays openable, because somebody may already have cut from
   it and the drawings on the shop wall have its id on them. */
let MOLD_REPLAN = "";
function replanMold(moldId) {
  const m = moldRecById(moldId);
  if (!m) return;
  MOLD_REPLAN = moldId;
  uploadMold(m);
}
/* Point a mold at a plan, pushing whatever it pointed at before onto the
   history. The one place currentPlanId is written, so the invariant "the
   previous current is always in planHistory" holds by construction. */
function setCurrentPlan(mold, planId) {
  if (!mold || !planId) return;
  const prev = mold.currentPlanId;
  mold.currentPlanId = planId;
  if (prev && prev !== planId) {
    mold.planHistory = [{ id: prev, ts: new Date().toISOString(), by: myEmail() }]
      .concat((mold.planHistory || []).filter(h => h.id !== prev))
      .slice(0, 10);
  }
  save("molds", mold, "currentPlanId", "planHistory");
}
function makeCurrentPlan(moldId, planId) {
  const m = moldRecById(moldId);
  if (!m || !planById(planId)) return;
  setCurrentPlan(m, planId);
  toast(`${planById(planId).name || planId} is now the current plan.`);
  render();
}
function linkPlanToMold(planId, moldId) {
  const p = planById(planId);
  if (!p || !moldRecById(moldId)) return;
  p.moldId = moldId;
  save("stackplans", p, "moldId");
  setCurrentPlan(moldRecById(moldId), p.id);
  toast(`Plan linked to ${moldId}.`);
  render();
}

/* ---------- mold pane extras ----------
   Everything a linked mold's plan has to say, on the mold: the rotatable 3D
   view, the exploded stack, the blanks table, the plan's own warnings and
   notes, and the Drawings / STL export actions. Newest linked plan is current;
   older ones are chips. Rendered by shop.js's detail through the hook below,
   so Materials and Items stay untouched.

   The 3D view is HERE, not one click away. It used to live only on the plan
   pane, so "show me this mold turning" meant pressing a button that selected
   the PLAN — which switched the pane, dropped the sel highlight off the mold,
   and made a group header appear reading "Plans with no mold" over the plan
   you had just opened from its mold. The viewer is where the thing it shows
   is, and the plan pane is now only for plans that have no mold.

   Single-mount still holds, by construction rather than by hope: meshViewHtml
   is the only thing that schedules mvMount, its two callers are this function
   and renderStackPlan, and renderMoldsTab reaches them through mutually
   exclusive branches of one if/else chain. mvMount's per-element guard is the
   backstop, and mvSweep in render() releases a context whose canvas has gone. */
function moldPlanSection(m) {
  const plans = plansForMold(m);
  if (!plans.length) {
    return isLead() ? `<h3>Mold file</h3>
      <div class="muted tny">No stack plan yet — this mold was recorded by hand or imported.</div>
      <div class="toolbar no-print"><button class="ib" onclick="replanMold('${esc(m.id)}')">${icon("parts", 15)} Plan the stack</button></div>` : "";
  }
  const p = plans[0];
  const nSec = sectionCount(p);
  return `<h3>Mold file</h3>
    <div class="muted tny">${esc(p.id)} · ${(p.layers || []).length} layers · planned ${fmtWhen(p.ts)}</div>
    ${plans.length > 1 ? `<div class="muted tny">Earlier: ${plans.slice(1).map(x =>
      `<span class="chip tny" onclick="selectMoldsRec('${esc(x.id)}')">${esc(x.name || x.id)} · ${fmtWhen(x.ts)}</span>`).join(" ")}</div>` : ""}
    <div class="toolbar no-print">
      ${isLead() ? `<button class="ib" onclick="replanMold('${esc(m.id)}')">${icon("edit", 15)} Re-plan</button>` : ""}
      <button class="ib" onclick="openDrawings('${esc(p.id)}')">${icon("print", 15)} Drawings</button>
      ${nSec === 1 ? `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',0)">${icon("download", 15)} Stock STL</button>`
        : Array.from({ length: nSec }, (_, i) => `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',${i})">${icon("download", 15)} STL S${i + 1}</button>`).join("")}
    </div>
    ${(p.warnings || []).map(w => `<div class="warn">${icon("warning", 14)} ${esc(w)}</div>`).join("")}
    ${(p.notes || []).map(n => `<div class="muted tny">${esc(n)}</div>`).join("")}
    <h3>Mold in stock <span class="muted" style="text-transform:none">— drag to rotate, scroll or pinch to zoom</span></h3>
    ${meshViewHtml(p)}
    <h3>Stack</h3>
    ${stackSvg(p)}
    <p class="muted tny">Dashed outline is the mold at the top of each layer. Check it sits inside every block before initialling the CS-003 §7.2 review step.</p>
    ${stackTable(p)}`;
}

/* ---------- the tab ---------- */
function renderMoldsTab() {
  if (view.mode === "cuts") return renderCutList();
  const sel = moldsSelected();
  let pane;
  if (!sel) pane = moldsOverview();
  else if (sel.kind === "plan") pane = moldsPlanPane(sel.rec);
  else pane = `<section class="mddetail" aria-label="Mold detail">${renderShopDetail("molds", { embedded: true })}</section>`;
  const undo = (typeof shopUndoBar === "function" ? shopUndoBar() : "")
    + (typeof cutsUndoBar === "function" ? cutsUndoBar() : "");
  return `${undo}<div class="mdsplit ${sel ? "has-sel" : ""}">${renderMoldsRail()}${pane}</div>`;
}

/* ---------- deleting molds ----------
   ONE path for a mold's Delete button, a plan's Delete button and the rail's
   Select…, so the cascade and the wording never disagree. A stack plan is
   part of its mold (see the README), so deleting a mold takes its plans and
   their stored meshes with it instead of leaving orphans on the rail; an
   orphan plan picked on its own goes the same way. Lead-only, matching the
   rules, and said up front rather than failing after the confirm. */
function moldsBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can delete molds.", "error"); return; }
  const set = new Set(ids || []);
  const molds = (DB.molds || []).filter(m => set.has(m.id));
  const moldIds = new Set(molds.map(m => m.id));
  const plans = (DB.stackplans || []).filter(p => set.has(p.id) || moldIds.has(p.moldId));
  if (!molds.length && !plans.length) { toast("Nothing selected.", "info"); return; }
  const linked = plans.filter(p => moldIds.has(p.moldId)).length;
  const loose = plans.length - linked;
  const what = [];
  if (molds.length) what.push(molds.length === 1 ? `mold ${molds[0].name || molds[0].id}` : plural(molds.length, "mold"));
  if (loose) what.push(plural(loose, "unlinked stack plan"));
  const msg = `Delete ${what.join(" and ")} for everyone?`
    + (linked ? ` ${linked === 1 ? "Its stack plan goes" : `Their ${linked} stack plans go`} with ${molds.length === 1 ? "it" : "them"}.` : "")
    + " There is no undo — export a backup first if unsure.";
  bulkDeleteRecords({
    message: msg,
    items: molds.map(m => ({ coll: "molds", id: m.id })).concat(plans.map(p => ({ coll: "stackplans", id: p.id }))),
    files: plans.map(p => p.meshPath),
    done: what.join(" and ") + " deleted",
    after: () => {
      const gone = new Set(plans.map(p => p.id));
      DB.molds = (DB.molds || []).filter(m => !moldIds.has(m.id));
      DB.stackplans = (DB.stackplans || []).filter(p => !gone.has(p.id));
    },
  });
}
function deletePickedMolds() { moldsBulkDelete(pickedIds("molds")); }

/* ---------- keyboard ----------
   Same contract as partsKeydown: pure decisions, returns the action name so
   the node harness can drive it without a real KeyboardEvent. */
function moldsNeighborId(dir) {
  const rows = moldsFlatRows();
  if (!rows.length) return null;
  const i = rows.findIndex(r => r.id === moldsRailSelId());
  if (i < 0) return rows[dir > 0 ? 0 : rows.length - 1].id;
  return rows[Math.min(rows.length - 1, Math.max(0, i + dir))].id;
}
function moveMoldsSelection(dir) {
  const id = moldsNeighborId(dir);
  if (id) selectMoldsRec(id);
}
function moldsKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "molds") return null;
  if (view.mode === "cuts") return null;
  const modal = document.getElementById("modal");
  if (modal && typeof modal.className === "string" && modal.className.includes("open")) return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  const k = e.key;
  if (typing) {
    if (k === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (k === "ArrowDown" || k === "j") { if (e.preventDefault) e.preventDefault(); moveMoldsSelection(1); return "next"; }
  if (k === "ArrowUp" || k === "k") { if (e.preventDefault) e.preventDefault(); moveMoldsSelection(-1); return "prev"; }
  if (k === "Enter" && view.mode !== "detail") { const id = moldsNeighborId(1); if (id) { selectMoldsRec(id); return "open"; } return null; }
  if (k === "Escape" && (view.mode === "detail" || view.mode === "plan")) { clearMoldsSelection(); return "clear"; }
  if (k === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  const sel = moldsSelected();
  if (k === "e" && sel && sel.kind === "mold") { view.edit = !view.edit; render(); return "edit"; }
  if (k === "1" && sel && sel.kind === "mold") {
    if (e.preventDefault) e.preventDefault();
    if (typeof quickAdvance === "function" && shopNextStage(SHOP.molds, sel.rec)) quickAdvance("molds", sel.rec.id);
    else toast(`${sel.rec.name || sel.rec.id} is already “${sel.rec.stage}”.`, "info");
    return "stage";
  }
  return null;
}
document.addEventListener("keydown", moldsKeydown);
