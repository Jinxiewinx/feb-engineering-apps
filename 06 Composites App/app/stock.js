"use strict";
/* stock.js — the Stock tab: polyurethane tooling-board inventory.
   CS-011 wants a live board record and never had one; the Master Tracker sheet
   went stale in SN5 and nobody trusted it. This is that record, plus the input
   the mold stack planner needs.

   A full 4x8 sheet and a 19x30 offcut are the SAME KIND OF OBJECT here — both
   are just a board with dimensions. That's deliberate: it means remnants come
   back into inventory for free instead of needing their own system.

   UNITS: dimensions are stored AS ENTERED with a unit tag, never normalised on
   write. Storing canonical mm and redisplaying in inches drifts on every edit
   (48 -> 1219.2 -> 47.99999 -> saved). toMm() is the ONLY conversion point;
   everything downstream (slicer, stack planner) reads through it. */

const DENSITIES = [30, 45, 60];      // lb/ft^3 — CS-003 §5. 60 seals better (CS-004).
/* Grades to OFFER, not grades allowed: density is typed, not picked, because
   the rack has always held sheets outside the catalogue and the dropdown just
   refused to say so. The union means a 45lb sheet somebody entered last week is
   one keystroke away AND the catalogue grades still appear on an empty rack.
   Numeric sort — localeCompare puts 100 before 30. */
function densityOptions() {
  const set = new Set(DENSITIES);
  const add = v => { const d = canonDensity(v); if (d != null) set.add(d); };
  (DB.stock || []).forEach(b => add(b.density));
  (DB.molds || []).forEach(m => add(m.density));
  (DB.stackplans || []).forEach(p => add(p.density));
  return [...set].sort((a, b) => a - b);
}
/* How much board each grade actually has. The mold planned at 45lb that
   matched nothing on the rack was this number being invisible until after
   Plan was pressed. */
function densityStockCounts() {
  const m = new Map();
  for (const b of (DB.stock || [])) {
    const d = canonDensity(b.density);
    if (d == null) continue;
    m.set(d, (m.get(d) || 0) + (b.qty || 1));
  }
  return m;
}
/* How much board there is inside a DECLARED RANGE, and which grades make it up.
   The mold modal needs both: the total says whether the plan is buildable at
   all, and the breakdown says what feed rate you are letting yourself in for,
   because the densest board in a stack sets the CNC feed for the whole thing. */
function densityRangeStock(dMin, dMax) {
  const lo = canonDensity(dMin);
  const hi = canonDensity(dMax) ?? lo;
  const grades = [];
  let boards = 0;
  for (const [d, n] of densityStockCounts()) {
    if (lo != null && (d < lo || d > hi)) continue;
    boards += n; grades.push([d, n]);
  }
  grades.sort((a, b) => a[0] - b[0]);
  return { boards, grades, max: grades.length ? grades[grades.length - 1][0] : null };
}
/* Read the mold modal's density pair. A BLANK MAX MEANS MAX = MIN, so the
   one-grade case — which is every mold anybody planned before ranges existed —
   is still reachable by typing one number and ignoring the second field. */
function readMoldDensityRange(val) {
  const min = canonDensity(val("ml-density-min"));
  const rawMax = String(val("ml-density-max") ?? "").trim();
  const max = rawMax === "" ? min : canonDensity(rawMax);
  return { min, max };
}

/* One datalist, one call site shape. The id has to be unique per rendered
   input, because two datalists sharing an id is the silently-wrong-suggestions
   bug nobody reports. */
function densityInput(id, value, attrs) {
  return `<input id="${id}" list="dl-${id}" inputmode="decimal" value="${esc(value ?? "")}" placeholder="e.g. 30" ${attrs || ""}>
    <datalist id="dl-${id}">${densityOptions().map(d => `<option value="${d}"></option>`).join("")}</datalist>`;
}
const UNITS = ["in", "mm"];
const MAX_DIM_MM = 10000;            // 10 m. Anything larger is a typo or a unit mistake.
/* The cap handed to the slicer when a mold's section split has been waived.
   1 km, which no stack reaches, so sectionize returns one section. FINITE on
   purpose: slicer.js prints the cap into its warning text as
   (maxDepth / 25.4).toFixed(0), and Infinity renders as "Infinity in". */
const NO_SPLIT_DEPTH_MM = 1e6;

/* The waiver is the MOLD's, not the plan's: it is a fact about how the tool was
   designed and it has to survive a re-plan. The plan records the cap it was
   actually sliced under (splitWaived / maxCutDepthMm) because the drawings read
   the plan; this records who made the claim, because somebody has to own it. */
function setNoSplit(mold, on) {
  if (!mold || !!mold.noSplit === !!on) return;
  mold.noSplit = !!on;
  mold.noSplitBy = on ? myEmail() : "";
  mold.noSplitAt = on ? today() : "";
  save("molds", mold, "noSplit"); save("molds", mold, "noSplitBy"); save("molds", mold, "noSplitAt");
}

/* ---------- units: one conversion point ---------- */
function toMm(d) {
  if (!d || typeof d.value !== "number") return NaN;
  return d.unit === "mm" ? d.value : d.value * 25.4;
}
function fmtDim(d) {
  if (!d || typeof d.value !== "number") return "—";
  // Trim trailing zeros so 48.00 reads as 48 but 47.5 keeps its half.
  const n = Math.round(d.value * 1000) / 1000;
  return `${n}${d.unit === "mm" ? " mm" : "″"}`;
}
/* Parse one dimension field. Returns { dim } or { err } — never throws, never
   returns a half-valid dim, because a bad board silently entering inventory is
   how the stale Master Tracker happened. */
function parseDim(raw, unit) {
  const s = String(raw ?? "").trim();
  if (!s) return { err: "is required" };
  const v = Number(s);
  if (!Number.isFinite(v)) return { err: "must be a number" };
  if (v <= 0) return { err: "must be greater than zero" };
  const dim = { value: v, unit: UNITS.includes(unit) ? unit : "in" };
  if (toMm(dim) > MAX_DIM_MM) return { err: "is over 10 m — check the units" };
  return { dim };
}

function boardById(id) { return (DB.stock || []).find(b => b.id === id); }
/* How much board there IS. Area used to answer this and it is the wrong
   question: "how much face" is what you ask about fabric, but a mold is cut
   out of a solid and eats thickness, so a 3in sheet and a 1in sheet of the
   same face are not remotely the same stock. Cubic feet rather than litres or
   in³ because density is already lb/ft³ — multiply the two and you have the
   weight of what is on the rack, in the units the datasheet and the shop both
   already use. */
const MM3_PER_FT3 = 28316846.6;
function boardVolumeFt3(b) {
  const l = toMm(b.len), w = toMm(b.wid), t = toMm(b.thk);
  if (![l, w, t].every(Number.isFinite)) return 0;
  return (l * w * t) / MM3_PER_FT3 * (b.qty || 1);
}
// Group key for the summary: boards of the same thickness+density are
// interchangeable stock, which is exactly the bucket the packer will use.
function thkKey(b) { return `${Math.round(toMm(b.thk) * 10) / 10}mm · ${canonDensity(b.density) ?? 30} lb`; }

/* ---------- boards, grouped by size ----------
   Simon: "we don't need each of them being their own item as we really only
   care about xyz and density." So the rack READS as one row per size with a
   quantity, which is how anybody standing in front of it would describe it.

   The documents still exist one per board, and that is deliberate: a BRD- id
   carries a printed QR label that is physically stuck to a physical board, and
   `mold.board` points at one. Merging two docs of the same size would orphan
   every label already on the rack. So this is a display-time grouping, and the
   individual boards, with their labels and locations, come back when a size row
   is opened. */
function boardSizeKey(b) {
  const l = toMm(b.len), w = toMm(b.wid), t = toMm(b.thk);
  if (![l, w, t].every(Number.isFinite)) return "?";
  const r = v => Math.round(v * 10) / 10;
  // Face dimensions are sorted, because tooling board has no grain and the
  // packer turns blanks freely — a 48x96 and a 96x48 are the same stock.
  return `${r(Math.max(l, w))}x${r(Math.min(l, w))}x${r(t)}|${canonDensity(b.density) ?? 30}`;
}
function groupBoards(list) {
  const m = new Map();
  for (const b of (list || [])) {
    const key = boardSizeKey(b);
    if (!m.has(key)) {
      const l = toMm(b.len), w = toMm(b.wid);
      m.set(key, {
        key, id: "SZ:" + key, lenMm: Math.max(l, w), widMm: Math.min(l, w),
        thkMm: toMm(b.thk), density: canonDensity(b.density) ?? 30, qty: 0, ft3: 0, members: [],
      });
    }
    const g = m.get(key);
    g.qty += b.qty || 1;
    g.ft3 += boardVolumeFt3(b);
    g.members.push(b);
  }
  return [...m.values()].sort((a, b) => (a.thkMm - b.thkMm)
    || (b.lenMm * b.widMm - a.lenMm * a.widMm) || a.key.localeCompare(b.key));
}
function boardGroupByKey(key) {
  return groupBoards(DB.stock || []).find(g => g.key === key) || null;
}
// mm is the geometry, inches is what the shop reads. Both, always.
function fmtMm(mm) {
  if (!Number.isFinite(mm)) return "—";
  return `${Math.round(mm / 25.4 * 100) / 100}″`;
}
function groupLabel(g) {
  return `${fmtMm(g.lenMm)} × ${fmtMm(g.widMm)} × ${fmtMm(g.thkMm)}`;
}

/* ---------- create / edit ---------- */
/* `preset` prefills a NEW board without making it an edit: b is still the
   editing flag, so the footer button and submitBoard's id are unaffected.
   Each caller carries only what it actually knows. "+ Board this size" passes
   the size and grade and nothing else — another sheet of that stock is not a
   copy of that sheet's label, shelf or provenance. "Log offcuts" passes only
   the mold it came off, because the size of a remnant is whatever is left and
   only the person holding it knows that. Quantity starts at one either way:
   you are recording what is in front of you. */
function boardModal(b, preset) {
  const e = b || preset || {};
  const dimRow = (key, label, d) => `
    <div class="field"><label>${label}</label>
      <input id="bd-${key}" value="${esc(d ? d.value : "")}" placeholder="0">
      <select id="bd-${key}-u">${UNITS.map(u => `<option ${(d ? d.unit : "in") === u ? "selected" : ""}>${u}</option>`).join("")}</select>
    </div>`;
  openModal(`
    <h2>${b ? "Edit board" : "Add board"}</h2>
    <div class="field"><label>Label (optional)</label><input id="bd-label" value="${esc(e.label || "")}" placeholder="e.g. rack A, top shelf"></div>
    ${dimRow("len", "Length", e.len)}
    ${dimRow("wid", "Width", e.wid)}
    ${dimRow("thk", "Thickness", e.thk)}
    <div class="field"><label>Density (lb/ft³)</label>${densityInput("bd-density", canonDensity(e.density) ?? 30)}</div>
    <div class="field"><label>Quantity</label><input id="bd-qty" value="${esc(e.qty || 1)}"></div>
    <div class="field"><label>Stored at</label><select id="bd-location">
      <option value="">—</option>
      ${(DB.items || []).filter(b2 => b2.cls === "BIN" && b2.stage !== "Retired").map(b2 =>
        `<option value="${esc(b2.id)}" ${e.location === b2.id ? "selected" : ""}>${esc(b2.name || b2.id)}</option>`).join("")}
    </select></div>
    <div class="field"><label>Where it came from</label><input id="bd-origin" value="${esc(e.origin || "")}" placeholder="work order or mold it came off, if it is a leftover"></div>
    <div class="field"><label>Notes</label><textarea id="bd-notes" rows="2"
      placeholder="anything the next person should know — bumpy face, off-colour, a soft corner, which end is square">${esc(e.notes || "")}</textarea></div>
    <div class="field"><label>Unit cost ($, per sheet)</label><input id="bd-unitcost" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(e.unitCost ?? "")}" placeholder="leave blank if unknown"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitBoard(${b ? `'${esc(b.id)}'` : "null"})">${b ? "Save" : "Add"}</button></div>
  `);
}
function newBoard() { boardModal(null); }
/* + Board this size, from a size pane. Reads the size back off the group's
   first member rather than off the synthetic SZ: key, so the new sheet is
   entered in the units the old one was measured in — the key is canonical mm
   and would silently retype an inch rack as millimetres. */
function newBoardLike(gid) {
  const g = boardGroupByKey(String(gid).replace(/^SZ:/, ""));
  const m = g && g.members[0];
  if (!m) { newBoard(); return; }
  boardModal(null, { len: m.len, wid: m.wid, thk: m.thk, density: m.density });
}
function editBoard(id) { const b = boardById(id); if (b) boardModal(b); }

/* Read the modal into a validated board. Returns null (and toasts) on the first
   bad field, so the user fixes one thing at a time instead of hunting. */
function readBoardForm() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const out = {};
  for (const [key, label] of [["len", "Length"], ["wid", "Width"], ["thk", "Thickness"]]) {
    const r = parseDim(val("bd-" + key), val(`bd-${key}-u`));
    if (r.err) { toast(`${label} ${r.err}.`, "error"); return null; }
    out[key] = r.dim;
  }
  const notes = String(val("bd-notes")).trim();
  const qty = Number(String(val("bd-qty")).trim() || "1");
  if (!Number.isFinite(qty) || qty < 1 || Math.floor(qty) !== qty) { toast("Quantity must be a whole number, 1 or more.", "error"); return null; }
  const dens = canonDensity(val("bd-density"));
  if (dens == null) { toast("Density is a plain number in lb/ft³ — 30, 45, 60.", "error"); return null; }
  // Optional. Blank stays blank — a board with no cost is un-costed, not free.
  const rawCost = String(val("bd-unitcost")).trim();
  const unitCost = rawCost === "" ? "" : Math.round(Number(rawCost) * 100) / 100;
  if (rawCost !== "" && (!Number.isFinite(unitCost) || unitCost < 0)) { toast("Unit cost needs to be a plain number of dollars.", "error"); return null; }
  return {
    ...out, qty, unitCost,
    label: String(val("bd-label")).trim(),
    density: dens,
    origin: String(val("bd-origin")).trim(),
    notes,
    location: String(val("bd-location")).trim(),
  };
}
async function submitBoard(id) {
  const f = readBoardForm();
  if (!f) return;
  let b;
  if (id) {
    b = boardById(id);
    if (!b) { toast("That board is gone — someone else deleted it.", "error"); closeModal(); render(); return; }
    Object.assign(b, f);
  } else {
    const newId = await allocId("stock");
    if (!newId) return;
    b = { id: newId, ...f, createdBy: myEmail(), ts: new Date().toISOString() };
    (DB.stock = DB.stock || []).push(b);
  }
  save("stock", b);
  closeModal(); render();
  toast(id ? "Board updated." : "Board added.");
}
function delBoard(id) { boardsBulkDelete([id]); }
/* The row's trash, the pane's Delete and the list's Select… all land here.
   Lead-only like the rules; a board record is a label stuck to a real sheet,
   so removing ten by mistake is ten labels to reprint. */
function boardsBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can remove boards.", "error"); return; }
  const set = new Set(ids || []);
  const boards = (DB.stock || []).filter(b => set.has(b.id));
  if (!boards.length) { toast("Nothing selected.", "info"); return; }
  const what = boards.length === 1 ? `board ${boards[0].id}` : plural(boards.length, "board");
  bulkDeleteRecords({
    message: `Remove ${what} from inventory for everyone? A mold cut from one keeps the board id as text.`,
    items: boards.map(b => ({ coll: "stock", id: b.id })),
    ok: "Remove",
    done: `${what} removed`,
    after: () => { const gone = new Set(boards.map(b => b.id)); DB.stock = (DB.stock || []).filter(b => !gone.has(b.id)); },
  });
}
function deletePickedBoards() { boardsBulkDelete(pickedIds("boards")); }

/* ==========================================================================
   The Boards view of Inventory.

   Boards used to be a third group on the Molds rail, beside molds and stack
   plans. They are not that: a board is a thing on a shelf, which is what
   Inventory is for, and Inventory already had them — invIndex has bucketed
   DB.stock by location since boards gained one, and a shelf's contents page
   has always listed its tooling board. Only the LIST lived in the wrong tab.

   The renderers live in this file rather than inventory.js because this file
   owns the board data, the modal that edits it, and the eight helpers these
   panes read (groupBoards, boardSizeKey, groupLabel, boardVolumeFt3, fmtDim,
   fmtMm, thkKey, boardById). Moving the rendering "into the Inventory file"
   would split it from its data and make inventory.js reach across for all
   eight. Script order allows the call this way round: stock.js loads first.

   Flat, like Items list and Materials list. Inventory has no rail anywhere —
   the map is a grid of cards, the receiving desk drops the index on purpose —
   and a fourth navigation shape inside one tab is a tab that behaves
   differently depending on which segment you happened to press.
   ========================================================================== */

/* ==========================================================================
   GROUPING AND SORTING THE RACK

   Same shape as WO_GROUPS / WO_SORT_COLS in workorders.js, and for the same
   reason: some questions about the rack are "show me it broken up by X" and
   some are "put it in order by X", and one control should answer both. A key in
   BOARD_GROUPS draws a card per value; anything else flattens to one table.

   THE DEFAULT IS GRADE, and grade-grouped output is byte-for-byte what this
   list printed before the control existed — so nobody who never touches it sees
   anything move. Grade leads because it is the axis the packer refuses to
   substitute across silently (CS-004), so it is the one that decides whether a
   job can be cut at all.

   ONE ROW IS ONE BOARD. Simon: "Each board should have its own entry (line) and
   number... even if they are stacked on top of each other we want to
   differentiate them. This will aid in tracking."

   The list used to collapse same-size records into one row reading
   "BRD-SN6-020 +3 more", which is a fair summary of the rack and useless for
   tracking a specific sheet: four boards with four printed labels and four
   distinct ids showed as one line, and there was no way to say which of them
   was on which shelf, which had the soft corner, or which one a mold was cut
   from. Sizes are still summarised — the card headers count them, and the
   by-thickness panel is unchanged — but the row is the board.
   ========================================================================== */

/* Partition functions: raw board record -> the card it belongs on. Grade and
   thickness are already inside boardSizeKey, so partitioning by them can never
   split a size row. Location is not, and splitting there is correct: a card is
   then a shelf, and "what is on this shelf" is the question being asked. */
const BOARD_GROUPS = {
  grade: b => String(canonDensity(b.density) ?? 30),
  thickness: b => String(Math.round(toMm(b.thk) * 10) / 10),
  location: b => String(b.location || ""),
};
const BOARD_GROUP_LABEL = {
  grade: v => `${v} lb/ft³`,
  thickness: v => `${fmtMm(Number(v))} board`,
  location: v => v ? shopRefChip(v) : `<span class="muted">No location</span>`,
};
/* One board, with everything the list sorts or prints already worked out — so
   the comparator never calls toMm() and the row markup never re-derives. */
function boardRow(b) {
  const l = toMm(b.len), w = toMm(b.wid);
  return {
    rec: b, id: b.id,
    // Face dims sorted, same as boardSizeKey: board has no grain, so a 48x96
    // and a 96x48 are one size and must print as one.
    lenMm: Math.max(l, w), widMm: Math.min(l, w), thkMm: toMm(b.thk),
    density: canonDensity(b.density) ?? 30,
    qty: b.qty || 1, ft3: boardVolumeFt3(b),
    location: b.location || "", index: BOARD_INDEX.get(b.id) ?? 0, ts: b.ts || "",
  };
}
const BOARD_SORT_COLS = {
  grade: r => r.density,
  thickness: r => r.thkMm,
  // Longest dimension first: it is what decides whether a big blank fits at all.
  size: r => -Math.max(r.lenMm, r.widMm),
  // How many boards sit on top of this one, in its own pile.
  index: r => r.index,
  location: r => (r.location || "~").toLowerCase(),
  id: r => r.id,
  recent: r => r.ts,
};
/* Keys whose natural order is not string order. Ids are PREFIX-SNx-NNN and the
   padding stops at 999, so plain comparison puts BRD-SN6-1000 before
   BRD-SN6-999 — the same trap cmpId exists for. */
const BOARD_SORT_CMP = { id: (a, b) => cmpId(a.id, b.id) };
const BOARD_SORT_LABELS = {
  grade: "Group: grade", thickness: "Group: thickness", location: "Group: location",
  index: "Sort: rack order", size: "Sort: size", id: "Sort: board id", recent: "Sort: newest",
};
/* Grade is the default, and "the default" has to mean the pre-existing order —
   see the header note. */
function boardSortKey() { return BOARD_SORT_COLS[view.sortKey] ? view.sortKey : "grade"; }
function sortBoardsBy(key) {
  if (view.sortKey === key) view.sortDir = view.sortDir === "desc" ? "asc" : "desc";
  else { view.sortKey = key; view.sortDir = "asc"; }
  render();
}
function toggleBoardSortDir() { view.sortDir = view.sortDir === "desc" ? "asc" : "desc"; render(); }
/* INSIDE A GROUP CARD THE TIE-BREAK *IS* THE ORDER. Every row on a card shares
   the card's value, so the primary key cannot separate them and the chain below
   decides everything the reader sees. Worth saying plainly, because it means a
   tie-break is not a detail here — and because the direction toggle only
   applies to the primary key, so ▲/▼ reverses the CARDS and not the rows in
   them.

   Grouped by SHELF, that order has to be the pile: a location card is a picture
   of a physical stack, and rack order is the one key that only means anything
   within a shelf, so leaving it unused on the one view built around a shelf was
   backwards. Simon, asked which he wanted: "pile order".

   Everywhere else the chain is thickness up, then face area down, then id —
   which is what keeps the default grade view reading the way it always did,
   with the boards that used to hide behind "+3 more" listed under each other in
   id order. A total order is not decoration either way: without one the rows
   reshuffle whenever a Firestore snapshot re-renders. */
const BOARD_ROW_TIES = {
  // Top of the pile first. Unfiled boards are all index 0, so they tie here and
  // fall through to the size chain, which is right — there is no pile to read.
  location: (a, b) => a.index - b.index,
};
function sortedBoardRows(rows, key) {
  const get = BOARD_SORT_COLS[key];
  const cmp = BOARD_SORT_CMP[key];
  const tie = BOARD_ROW_TIES[key];
  const mul = view.sortDir === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    if (cmp) { const c = cmp(a, b); if (c) return c * mul; }
    else {
      const av = get(a), bv = get(b);
      if (av < bv) return -mul;
      if (av > bv) return mul;
    }
    return (tie ? tie(a, b) : 0)
      || (a.thkMm - b.thkMm) || (b.lenMm * b.widMm - a.lenMm * a.widMm) || cmpId(a.id, b.id);
  });
}
/* Recomputed per render and read by BOARD_SORT_COLS.index. A module-level slot
   rather than a threaded argument because the comparator signature is fixed by
   the pattern this copies; renderBoardsList fills it before it sorts anything. */
let BOARD_INDEX = new Map();

function renderBoardsList() {
  const q = (view.q || "").toLowerCase();
  BOARD_INDEX = boardIndexById();
  const dens = view.invDens ? canonDensity(view.invDens) : null;
  /* Filtered per BOARD, not per size row. The old haystack was
     JSON.stringify(members), which matched raw JSON keys as well as values;
     this names the fields somebody would actually search on. */
  const rows = (DB.stock || []).map(boardRow)
    .filter(r => dens == null || r.density === dens)
    .filter(r => !q || [r.id, r.rec.label, r.rec.notes, r.rec.origin, r.rec.location,
      r.density, groupLabel(r)].join(" ").toLowerCase().includes(q));
  const sortKey = boardSortKey();

  const boards = rows.reduce((n, r) => n + r.qty, 0);
  const sizes = new Set(rows.map(r => boardSizeKey(r.rec))).size;
  const ft3 = rows.reduce((n, r) => n + r.ft3, 0);
  const homeless = (DB.stock || []).filter(b => !b.location).length;
  const tile = (n, label, cls) => `<div class="stat-tile"><div class="bignum ${cls || ""}">${n}</div><div class="stat-label">${esc(label)}</div></div>`;

  /* Board on hand by thickness. This used to sit on the Molds overview, which
     is the wrong place to ask it: it is the question you ask standing at the
     rack, deciding whether to cut or to order. */
  const buckets = {};
  (DB.stock || []).forEach(b => { buckets[thkKey(b)] = (buckets[thkKey(b)] || 0) + boardVolumeFt3(b); });
  const grades = [...new Set((DB.stock || []).map(b => canonDensity(b.density) ?? 30))].sort((a, b) => a - b);

  return `
  <div class="stat-row">
    ${tile(boards, "Boards")}${tile(sizes, "Sizes")}${tile(ft3.toFixed(1), "ft³ on hand")}${
      /* Amber, not red: a board nobody has given a shelf is a gap to close, not
         a thing that is wrong. Same reading as the dashboard's Unassigned. */
      homeless ? tile(homeless, homeless === 1 ? "board with no location" : "boards with no location", "warn") : ""}
  </div>
  <div class="filters no-print">
    <input id="searchbox" placeholder="search id / size / label / notes…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    <select title="Board grade" onchange="view.invDens=this.value;render()">
      <option value="">All grades</option>
      ${grades.map(d => `<option value="${d}" ${String(view.invDens) === String(d) ? "selected" : ""}>${d} lb/ft³</option>`).join("")}
    </select>
    <select title="Group or sort by" onchange="sortBoardsBy(this.value)">
      ${Object.keys(BOARD_SORT_LABELS).map(k => `<option value="${k}" ${sortKey === k ? "selected" : ""}>${esc(BOARD_SORT_LABELS[k])}</option>`).join("")}
    </select>
    <button class="sm sortdir" title="Reverse order" onclick="toggleBoardSortDir()">${view.sortDir === "desc" ? "▼" : "▲"}</button>
    ${view.q || view.invDens ? `<button class="sm" onclick="view.q='';view.invDens='';render()">Clear</button>` : ""}
    ${isLead() ? pickBar("boards", { all: rows.map(r => r.id), onDelete: "deletePickedBoards()", deleteLabel: "Remove", hint: "Select several boards to remove them from the rack" }) : ""}
  </div>
  ${!rows.length ? `<div class="card"><span class="muted">${
    (DB.stock || []).length ? "Nothing matches these filters."
    : `No board stock recorded yet. <b>+ Board</b> for each sheet and offcut on the rack at RFS.`}</span></div>` : ""}
  ${boardSections(rows, sortKey)}
  ${Object.keys(buckets).length ? `<div class="card">
    <h3>Board on hand, by thickness</h3>
    <div class="grid">
      ${Object.keys(buckets).sort().map(k => `<div class="f"><label>${esc(k)}</label><div class="ro">${buckets[k].toFixed(2)} ft³</div></div>`).join("")}
    </div>
  </div>` : ""}`;
}

/* One card per group value, or one flat table when the key is a sort rather
   than a grouping. Sections are ordered by the same comparator as the rows
   inside them, so reversing the direction reverses the whole list rather than
   flipping rows inside frozen cards. */
function boardSections(rows, key) {
  const part = BOARD_GROUPS[key];
  if (!part) return boardCard("", rows, key, true);
  const buckets = new Map();
  for (const r of rows) {
    const v = part(r.rec);
    if (!buckets.has(v)) buckets.set(v, []);
    buckets.get(v).push(r);
  }
  const sections = [...buckets.entries()].map(([v, rs]) => ({ v, rs }));
  /* Order the cards by the same key, using each card's first row as its
     representative — so "grade, descending" walks the grades downward, and the
     no-location card lands where an empty value sorts rather than in a special
     place. */
  const mul = view.sortDir === "desc" ? -1 : 1;
  const rep = s => sortedBoardRows(s.rs, key)[0];
  sections.sort((a, b) => {
    const ra = rep(a), rb = rep(b);
    const cmp = BOARD_SORT_CMP[key];
    if (cmp) { const c = cmp(ra, rb); if (c) return c * mul; }
    else {
      const av = BOARD_SORT_COLS[key](ra), bv = BOARD_SORT_COLS[key](rb);
      if (av < bv) return -mul;
      if (av > bv) return mul;
    }
    return String(a.v).localeCompare(String(b.v));
  });
  return sections.map(s => boardCard(BOARD_GROUP_LABEL[key](s.v), s.rs, key, false)).join("");
}
function boardCard(label, rs, key, flat) {
  const rows = sortedBoardRows(rs, key);
  if (!rows.length) return "";
  const boards = rows.reduce((n, r) => n + r.qty, 0);
  const sizes = new Set(rows.map(r => boardSizeKey(r.rec))).size;
  /* The rack-order column earns its width when that is what you asked for, and
     on a shelf card, where it is what the rows are ordered by — an order the
     reader cannot check is worse than no order. */
  const showIndex = key === "index" || key === "location";
  return `<div class="card">
    ${flat ? "" : `<div class="pgrouphd"><span class="pg-name">${label}</span>
      <span class="pg-n">${boards} board${boards === 1 ? "" : "s"}</span>
      <span class="pg-n">${sizes} size${sizes === 1 ? "" : "s"}</span>
      <span class="pg-n">${rows.reduce((n, r) => n + r.ft3, 0).toFixed(1)} ft³</span></div>`}
    <table class="list">
      <tr><th>Board</th><th>Size</th>${flat ? "<th>Grade</th>" : ""}${showIndex ? "<th>Rack order</th>" : ""}<th>Qty</th><th>Volume</th><th>Where</th></tr>
      ${rows.map(r => {
        const b = r.rec;
        /* The id leads, because that is what is printed on the label stuck to
           this sheet and what anybody standing at the rack reads off it. One
           row, one label, one board. */
        const note = b.notes || b.label || "";
        return `<tr onclick="selectInvRec('${esc(b.id)}')">
          <td><b>${esc(b.id)}</b>${note ? `<div class="tny muted">${esc(note.length > 46 ? note.slice(0, 45) + "…" : note)}</div>` : ""}</td>
          <td>${esc(groupLabel(r))}</td>
          ${flat ? `<td>${esc(r.density)} lb/ft³</td>` : ""}
          ${showIndex ? `<td class="tny">${r.location ? (r.index === 0 ? "on top" : `${r.index} deep`) : `<span class="muted">unfiled</span>`}</td>` : ""}
          ${/* A record covering several identical sheets is the one thing left
                that this list cannot tell apart — they share one id and one
                label. Say so on the row rather than letting a bare "4" read
                like the old grouping. */""}
          <td>${esc(r.qty)}${r.qty > 1 ? ` <span class="muted tny" title="One record, ${esc(r.qty)} sheets — they share this id, so they cannot be tracked apart. Edit it to qty 1 and add the others as their own boards.">not tracked apart</span>` : ""}</td>
          <td>${r.ft3.toFixed(2)} ft³</td>
          <td class="tny">${r.location ? shopRefChip(String(r.location)) : `<span class="muted">—</span>`}</td>
        </tr>`;
      }).join("")}
    </table>
  </div>`;
}

/* ---------- size pane ----------
   A size of board, and however many of them are on the rack. The individual
   documents are still here, at the bottom, because a BRD- id is what a printed
   label carries and what mold.board points at — but you have to want them.
   Simon: "we really only care about xyz and density." */
function boardSizePane(g) {
  if (!g) { view.mode = "list"; view.id = null; return renderBoardsList(); }
  const ids = new Set(g.members.map(b => b.id));
  const usedBy = (DB.molds || []).filter(m => ids.has(m.board));
  const where = [...new Set(g.members.map(b => b.location).filter(Boolean))];
  return `
  <section class="mddetail" aria-label="Board size detail">
    <div class="toolbar no-print">
      <button class="ib" onclick="clearInvSelection()">${icon("chevronLeft", 16)} All boards</button>
      <button class="primary ib" onclick="newBoardLike('${esc(g.id)}')">+ Board this size</button>
    </div>
    <div class="card">
      <h2>${esc(groupLabel(g))}</h2>
      <div class="muted">${esc(g.density)} lb/ft³ · ${esc(g.qty)} on the rack · ${g.ft3.toFixed(2)} ft³</div>
      <div class="grid">
        <div class="f"><label>Length</label><div class="ro">${fmtMm(g.lenMm)} <span class="muted tny">(${Math.round(g.lenMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Width</label><div class="ro">${fmtMm(g.widMm)} <span class="muted tny">(${Math.round(g.widMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Thickness</label><div class="ro">${fmtMm(g.thkMm)} <span class="muted tny">(${Math.round(g.thkMm * 10) / 10} mm)</span></div></div>
        <div class="f"><label>Density</label><div class="ro">${esc(g.density)} lb/ft³</div></div>
        <div class="f"><label>Quantity</label><div class="ro">${esc(g.qty)}</div></div>
        <div class="f"><label>Volume</label><div class="ro">${g.ft3.toFixed(2)} ft³ <span class="muted tny">≈ ${Math.round(g.ft3 * (canonDensity(g.density) ?? 30))} lb</span></div></div>
        <div class="f"><label>Stored at</label><div class="ro">${where.length ? where.map(l => shopRefChip(String(l))).join(" ") : "—"}</div></div>
      </div>
      ${usedBy.length ? `<h3>Molds cut from boards this size</h3>
        <div class="stagerow">${usedBy.map(m => `<span class="chip" onclick="openRecord('molds','${esc(m.id)}')">${esc(m.name || m.id)}</span>`).join("")}</div>` : ""}
      <h3>The boards themselves</h3>
      <div class="muted tny">One record each, because a BRD- label is stuck to a physical board and a mold points at the one it was cut from.</div>
      <table class="list">
        <tr>${pickOn("boards") ? "<th></th>" : ""}<th>Board</th><th>Qty</th><th>Where</th><th></th></tr>
        ${g.members.map(b => `<tr class="${pickIs("boards", b.id) ? "picked" : ""}"${pickOn("boards") ? ` onclick="togglePick('boards','${esc(b.id)}')"` : ""}>
          ${pickOn("boards") ? `<td class="pickcell">${pickBox("boards", b.id)}</td>` : ""}
          <td${pickOn("boards") ? "" : ` onclick="selectInvRec('${esc(b.id)}')"`}><b>${esc(b.id)}</b>${
            b.label ? ` <span class="muted tny">${esc(b.label)}</span>` : ""}${
            b.origin ? ` <span class="muted tny">· from ${esc(b.origin)}</span>` : ""}${
            b.notes ? `<div class="tny muted">${esc(b.notes)}</div>` : ""}</td>
          <td>${esc(b.qty || 1)}</td>
          <td class="tny">${b.location ? shopRefChip(String(b.location)) : "—"}</td>
          <td>${labelBtn("stock", b.id)}<button class="ib sm" onclick="editBoard('${esc(b.id)}')">${icon("edit", 14)}</button>${
            isLead() ? `<button class="danger ib sm" onclick="delBoard('${esc(b.id)}')">${icon("trash", 14)}</button>` : ""}</td>
        </tr>`).join("")}
      </table>
    </div>
  </section>`;
}

/* ---------- board pane ----------
   The detail page boards never had, and what makes a BRD- link land somewhere.
   Read-only on purpose: the modal is already the editor, and two editable
   surfaces for one record is how fields fight. */
function boardPane(b) {
  if (!b) { view.mode = "list"; view.id = null; return renderBoardsList(); }
  const usedBy = (DB.molds || []).filter(m => m.board === b.id);
  return `
  <section class="mddetail" aria-label="Board detail">
    <div class="toolbar no-print">
      <button class="ib" onclick="clearInvSelection()">${icon("chevronLeft", 16)} All boards</button>
      <button class="primary ib" onclick="editBoard('${esc(b.id)}')">${icon("edit", 15)} Edit</button>
      ${labelBtn("stock", b.id)}
      ${isLead() ? `<button class="danger" onclick="delBoard('${esc(b.id)}')">Delete</button>` : ""}
    </div>
    <div class="card" data-lbgroup="stock:${esc(b.id)}">
      <h2>${esc(b.id)}</h2>
      <div class="muted">${b.label ? esc(b.label) + " · " : ""}${
        b.ts ? "added " + fmtWhen(b.ts) : ""}${b.createdBy ? " by " + esc(b.createdBy) : ""}</div>
      <h3>Details</h3>
      <div class="grid">
        <div class="f"><label>Length</label><div class="ro">${fmtDim(b.len)}</div></div>
        <div class="f"><label>Width</label><div class="ro">${fmtDim(b.wid)}</div></div>
        <div class="f"><label>Thickness</label><div class="ro">${fmtDim(b.thk)}</div></div>
        <div class="f"><label>Density</label><div class="ro">${esc(canonDensity(b.density) ?? b.density)} lb/ft³</div></div>
        <div class="f"><label>Quantity</label><div class="ro">${esc(b.qty || 1)}</div></div>
        <div class="f"><label>Volume</label><div class="ro">${boardVolumeFt3(b).toFixed(2)} ft³ <span class="muted tny">≈ ${Math.round(boardVolumeFt3(b) * (canonDensity(b.density) ?? 30))} lb</span></div></div>
        <div class="f"><label>Stored at</label><div class="ro">${b.location ? shopRefChip(String(b.location)) : "—"}</div></div>
        ${/* parentId since September 2026; before that the only provenance was
              the two free-text strings, which nothing could parse back into a
              link. Not backfilled — regexing unparsed text is a guess — so the
              string is still the fallback and still what older boards show. */""}
        ${b.parentId && boardById(b.parentId)
          ? `<div class="f"><label>From</label><div class="ro">${shopRefChip(String(b.parentId))}${
              b.origin ? ` <span class="muted tny">${esc(b.origin)}</span>` : ""}</div></div>`
          : b.origin ? `<div class="f"><label>From</label><div class="ro">${esc(b.origin)}</div></div>` : ""}
      </div>
      ${b.notes ? `<h3>Notes</h3><p class="ro">${esc(b.notes)}</p>` : ""}
      ${/* The list is one row per board now, so the size view — and the
            "+ Board this size" shortcut on it — is reached from here. */""}
      <div class="muted tny">${(() => {
        const key = boardSizeKey(b);
        const n = (DB.stock || []).filter(x => boardSizeKey(x) === key).length;
        return n > 1
          ? `<a href="#/${esc("SZ:" + key)}" onclick="event.preventDefault();selectInvRec('${esc("SZ:" + key)}')">${n - 1} other board${n === 2 ? "" : "s"} this size</a>`
          : `<a href="#/${esc("SZ:" + key)}" onclick="event.preventDefault();selectInvRec('${esc("SZ:" + key)}')">Only board this size</a>`;
      })()}</div>
      ${usedBy.length ? `<h3>Molds cut from this board</h3>
        <div class="stagerow">${usedBy.map(m => `<span class="chip" onclick="openRecord('molds','${esc(m.id)}')">${esc(m.name || m.id)}</span>`).join("")}</div>` : ""}
    </div>
  </section>`;
}

/* ==========================================================================
   Mold stack plans — upload an STL, slice it, prove the mold fits the blocks.
   ========================================================================== */

/* Refuse absurd meshes BEFORE handing them to a Worker. An out-of-memory kill
   inside a Worker is a silent death: the worker just stops and no error event
   ever arrives, so the user sits watching a progress bar forever. A guard plus
   an onerror handler is the difference between "too big, export coarser" and
   an app that hangs. */
const MAX_STL_BYTES = 64 * 1024 * 1024;
const SLICE_TIMEOUT_MS = 120000;
/* Firestore caps a document at 1 MiB. Contours are the only unbounded part of
   a plan, so they get thinned until the record fits — see fitPlanForStorage. */
const PLAN_BYTE_BUDGET = 900000;

/* Run the slicer. Uses a Worker in the browser so the tab stays alive; falls
   back to a direct call where Worker is absent (the node test harness), which
   is the same code either way because slicer.js is pure. */
/* Same job, no Worker: used by the node test harness, and it keeps the two
   paths honest because slicer.js is pure either way. */
function runSliceInline(msg) {
  let tris, displayTris;
  if (msg.box) {
    tris = boxTris(msg.box.len, msg.box.wid, msg.box.hgt);
    // Closed solid for the viewer; boxTris is 4 open walls (see the worker).
    displayTris = blankTris({ x0: 0, y0: 0, x1: msg.box.len, y1: msg.box.wid }, 0, msg.box.hgt);
  } else {
    const bodies = splitBodies(scaleTris(parseSTL(msg.buffer).tris, msg.unit));
    if (msg.cmd === "bodies") {
      return {
        type: "bodies", triangleCount: 0,
        bodies: bodies.map((b, i) => ({
          index: i, triangles: b.tris.length,
          w: b.bounds.x1 - b.bounds.x0, d: b.bounds.y1 - b.bounds.y0, h: b.bounds.z1 - b.bounds.z0,
        })),
      };
    }
    tris = (bodies[msg.bodyIndex || 0] || {}).tris;
    if (!tris) throw new Error("That body is not in this file.");
    displayTris = tris;
  }
  // Same injection as the Worker path, so the two cannot drift.
  const opts = { ...(msg.opts || {}) };
  if (msg.supply) opts.supply = msg.supply;
  if (msg.boards && msg.boards.length) {
    opts.score = layers => moldCost(layers, msg.boards,
      { densityMin: msg.densityMin, densityMax: msg.densityMax }).cost;
  }
  const r = (msg.thicknesses && msg.thicknesses.length)
    ? sliceMold(tris, msg.thicknesses, opts)
    : planMold(tris, msg.available, opts);
  let meshStl = null;
  try { meshStl = meshStlForStorage(displayTris); } catch (e) { meshStl = null; }
  return {
    layers: r.layers, sections: (r.sections || []).map(s => ({ index: s.index, height: s.height, count: s.layers.length })),
    bounds: r.bounds, warnings: r.warnings, composition: r.composition || msg.thicknesses,
    considered: r.considered || 0, alternatives: r.alternatives || [], cost: r.cost || 0,
    usedRack: !!(msg.boards && msg.boards.length),
    monolithic: !!r.monolithic,
    triangleCount: tris.length, meshStl,
  };
}

function runSlice(msg, onProgress) {
  if (typeof Worker === "undefined") {
    return new Promise((resolve, reject) => {
      try { resolve(runSliceInline(msg)); } catch (e) { reject(e); }
    });
  }
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker("slicer.worker.js"); }
    catch (e) { reject(new Error("Couldn't start the slicer. If you opened this from a file:// path, serve it over http instead.")); return; }
    const timer = setTimeout(() => { w.terminate(); reject(new Error("Slicing took over two minutes and was stopped. Try exporting the STL at a coarser tolerance.")); }, SLICE_TIMEOUT_MS);
    const finish = (fn, arg) => { clearTimeout(timer); w.terminate(); fn(arg); };
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "progress") { if (onProgress) onProgress(m.value); return; }
      if (m.type === "bodies") return finish(resolve, m);
      // meshStl rides alongside `result` (it's transferred, not cloned) — fold
      // it in so both the Worker and inline paths hand back one shape.
      if (m.type === "done") return finish(resolve, { ...m.result, meshStl: m.meshStl || null });
      if (m.type === "error") {
        const err = new Error(m.message);
        err.region = m.region;
        return finish(reject, err);
      }
    };
    // Fires on an uncaught throw AND is our only signal if the worker dies.
    w.onerror = () => finish(reject, new Error("The slicer stopped unexpectedly. The mesh may be too large for this browser — try a coarser STL export."));
    w.postMessage(msg);
  });
}

/* Thin contours until the record fits Firestore, and say so if detail is lost.
   Blanks and layer geometry are never dropped — they are what the shop cuts —
   so this always converges instead of failing to save. */
function fitPlanForStorage(plan) {
  const size = p => JSON.stringify(p).length;
  const notes = [];
  if (size(plan) <= PLAN_BYTE_BUDGET) return { plan, notes };
  for (const eps of [0.5, 1, 2, 5]) {
    plan.layers.forEach(L => L.islands.forEach(is => { is.contour = simplify(is.contour, eps); }));
    if (size(plan) <= PLAN_BYTE_BUDGET) {
      notes.push(`Outlines were simplified to ${eps}mm so the plan fits storage. Blank sizes are unaffected.`);
      return { plan, notes };
    }
  }
  plan.layers.forEach(L => L.islands.forEach(is => { is.contour = []; }));
  notes.push("Outlines were too detailed to store, so the view shows blocks only. Blank sizes are unaffected.");
  return { plan, notes };
}

/* Distinct thicknesses actually on the rack, in mm — what the planner is
   allowed to choose from. No point offering a 3in stack we do not own.

   Takes a RANGE. No arguments still means every grade; one argument means that
   grade only, which is what min == max is. */
function stockThicknessesMm(dMin, dMax) {
  const lo = dMin == null ? null : canonDensity(dMin);
  const hi = dMax == null ? lo : canonDensity(dMax);
  const set = new Map();
  for (const b of (DB.stock || [])) {
    if (lo != null) { const d = canonDensity(b.density); if (d == null || d < lo || d > hi) continue; }
    const mm = toMm(b.thk);
    if (Number.isFinite(mm) && mm > 0) set.set(Math.round(mm * 10) / 10, true);
  }
  return [...set.keys()].sort((a, b) => a - b);
}

/* Sample molds served alongside the app (06 Composites App/app/samples/, built by
   tools/gen_sample_molds.mjs). Meeting the planner shouldn't require exporting
   something from Fusion first, and these are also the fastest way to reproduce a
   report — each one covers a different path. */
const SAMPLE_MOLDS = [
  { file: "nosecone-plug.stl", label: "Nosecone plug — 22 × 13 × 4.6in, one section" },
  { file: "undertray-diffuser.stl", label: "Undertray diffuser — 9.4in tall, splits into 2 sections" },
  { file: "clamshell-assembly.stl", label: "Clamshell assembly — 3 separate bodies in one file" },
];
/* Fetch a sample straight into MOLD_BUF, which is where a picked file would
   have landed — so submitMold() needs no special case for it. */
async function loadSampleMold(file) {
  if (!file) { MOLD_BUF = null; MOLD_BODIES = null; return; }
  const prog = document.getElementById("ml-progress");
  if (prog) prog.textContent = "Loading sample…";
  try {
    const buf = await (await fetch("samples/" + file)).arrayBuffer();
    MOLD_BUF = { buffer: buf, name: file, size: buf.byteLength, key: "sample:" + file };
    MOLD_BODIES = null;
    // Samples are written in millimetres; say so rather than leaving the 25.4x
    // trap open on a file the user didn't export and can't check.
    const u = document.getElementById("ml-unit");
    if (u) u.value = "mm";
    if (prog) prog.textContent = `${file} loaded (${Math.round(buf.byteLength / 1024)} KB) — hit Plan.`;
  } catch (e) {
    MOLD_BUF = null;
    if (prog) prog.textContent = "";
    toast("Couldn't load that sample.", "error");
  }
}

/* One way in. Simon: "there should only be an option to make a mold." This is
   the + Mold button, the Re-plan button, and nothing else. `existing` is set
   when re-planning, which prefills the name and density and, on submit, points
   that mold at the new plan instead of creating another one. */
function uploadMold(existing) {
  const avail = stockThicknessesMm();
  const e = existing || {};
  const dMin = canonDensity(e.densityMin ?? e.density) ?? 30;
  const dMax = canonDensity(e.densityMax ?? e.densityMin ?? e.density) ?? dMin;
  const counts = densityStockCounts();
  /* A re-plan keeps the blank shape the mold was last planned with; a wrong
     silent reset here would turn a block into a staircase without anyone
     choosing it. New molds step, which is what every plan did before the
     block option existed. */
  const curPlan = existing && typeof currentPlanFor === "function" ? currentPlanFor(existing) : null;
  const shape = curPlan && curPlan.monolithic ? "block" : "steps";
  openModal(`
    <h2>${existing ? "Re-plan " + esc(e.name || e.id) : "New mold"}</h2>
    <div class="field"><label>Name</label><input id="ml-name" value="${esc(e.name || "")}" placeholder="e.g. UT nose plug"></div>
    <div class="field"><label>Board density, min (lb/ft³)</label>${densityInput("ml-density-min", dMin)}</div>
    <div class="field"><label>Board density, max (lb/ft³)</label>${densityInput("ml-density-max", dMax === dMin ? "" : dMax, `placeholder="same as min"`)}
      <span class="muted tny">Leave max blank to hold the mold to one grade, which is what
        every mold did before ranges existed. Give a range and <b>any board inside it may
        supply any blank</b> — including two grades glued edge to edge in one layer — so the
        <b>highest</b> grade in the range is the feed rate the whole mold gets machined at.
        ${counts.size ? `On the rack: ${[...counts].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} lb (${n})`).join(" · ")}.`
                      : "Nothing on the rack yet."}</span></div>
    <div class="field"><label>Start from</label><select id="ml-src" onchange="moldSrcChanged()">
      <option value="box">dimensions (X &times; Y &times; Z)</option>
      <option value="stl">an STL file &mdash; beta</option>
      ${existing ? "" : `<option value="none">nothing yet &mdash; just record the mold</option>`}
    </select></div>
    <div id="ml-box">
      <div class="field"><label>Length (X)</label><input id="ml-bl" placeholder="0"><select id="ml-bl-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      <div class="field"><label>Width (Y)</label><input id="ml-bw" placeholder="0"><select id="ml-bw-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
      <div class="field"><label>Height (Z)</label><input id="ml-bh" placeholder="0"><select id="ml-bh-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <div id="ml-stl" style="display:none">
      <div class="field"><label>Mold STL</label><input id="ml-file" type="file" accept=".stl,model/stl,application/sla"></div>
      <div class="field"><label>…or try a sample</label>
        <select id="ml-sample" onchange="loadSampleMold(this.value)">
          <option value="">— none —</option>
          ${SAMPLE_MOLDS.map(s => `<option value="${esc(s.file)}">${esc(s.label)}</option>`).join("")}
        </select>
        <span class="muted tny">Shipped with the app, so you can see the planner work without exporting anything first.</span></div>
      <div class="field"><label>STL units</label><select id="ml-unit">
        <option value="mm">millimetres</option><option value="in">inches</option>
      </select><span class="muted tny">An STL carries no units. Getting this wrong is a 25.4&times; mistake.</span></div>
      <div class="field"><label>Blank shape</label><select id="ml-shape">
        <option value="steps" ${shape === "steps" ? "selected" : ""}>step each layer in to the mold</option>
        <option value="block" ${shape === "block" ? "selected" : ""}>one solid block around the whole mold</option>
      </select><span class="muted tny">Stepped layers follow the mold's taper, so the upper boards are
        smaller and less board is used. A block gives every layer the same footprint, the whole
        mold's outline plus margin, so the glued stack is one rectangular brick: more board, but
        nothing to line up between layers and a plain box for CAM stock. The cut list packs the
        blanks onto sheets with straight-through cuts either way.</span></div>
      <div class="field"><label></label><span class="muted tny"><b>Beta.</b> Real exports still turn up surprises &mdash; assemblies holding many bodies, rough meshes, odd draft. Check the stack view before anyone cuts, and fall back to dimensions if it looks wrong.</span></div>
    </div>
    ${/* A stack over 6in is sectioned because the ShopSabre cannot plunge
          deeper than that. Sometimes the design gets around it — a shallow
          cavity in a tall blank, dowelled inserts, a face machined from both
          sides — and sectioning a mold that does not need it costs a setup and
          a mating surface. Outside the STL block on purpose: a typed box stack
          gets tall the same way an STL does.

          Worded as the claim being made ("machined depth stays under"), not as
          the outcome ("no split"), because the claim is the thing that can be
          wrong and the thing the next person has to check. */""}
    <div class="field"><label>Machined depth</label>
      <label class="chk"><input type="checkbox" id="ml-nosplit" ${e.noSplit ? "checked" : ""}>
        Machined depth stays under 6in — do not section this stack</label>
      <span class="muted tny">Tick this only when the DESIGN keeps the cutter inside 6in of a face
        it can reach. Nothing here measures the cavity, so the plan takes your word for it, says so
        on the drawing, and records who said it. Leave it clear and a tall stack is split into
        sections with dowel and datum features expected in CAD.</span></div>
    <div class="field"><label>Boards</label><select id="ml-mode" onchange="moldModeChanged()">
      <option value="auto">choose them for me, from stock</option>
      <option value="manual">I'll pick the thicknesses</option>
    </select></div>
    <div class="field" id="ml-avail"><label></label><span class="muted tny">${avail.length
      ? `Available on the rack: ${avail.map(t => (Math.round(t / 25.4 * 100) / 100) + "″").join(", ")}`
      : `<b>No board stock recorded yet</b> — add boards first, or the planner has nothing to choose from.`}</span></div>
    <div class="field" id="ml-manual" style="display:none"><label>Thicknesses, bottom to top</label>
      <input id="ml-thk" placeholder="e.g. 2, 2, 1">
      <select id="ml-thk-u">${UNITS.map(u => `<option ${u === "in" ? "selected" : ""}>${u}</option>`).join("")}</select>
    </div>
    <div id="ml-bodies"></div>
    <div id="ml-progress" class="muted tny"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitMold()">Plan</button></div>
  `);
}
function moldSrcChanged() {
  const v = (document.getElementById("ml-src") || {}).value;
  const stl = v === "stl", none = v === "none";
  const a = document.getElementById("ml-stl"), b = document.getElementById("ml-box");
  if (a) a.style.display = stl ? "" : "none";
  if (b) b.style.display = (stl || none) ? "none" : "";
  // Nothing to slice means nothing to choose boards for.
  for (const id of ["ml-mode", "ml-avail", "ml-manual"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = none ? "none" : (id === "ml-manual"
      ? ((document.getElementById("ml-mode") || {}).value === "manual" ? "" : "none") : "");
  }
}
function moldModeChanged() {
  const m = document.getElementById("ml-manual");
  if (m) m.style.display = document.getElementById("ml-mode").value === "manual" ? "" : "none";
}

let MOLD_BUF = null;     // last STL read, so picking a body doesn't re-read the file
/* null = this file has not been probed for separate bodies yet. Explicit state
   rather than "is the picker in the DOM?" — control flow that depends on an
   element existing is invisible to tests and breaks the moment markup moves. */
let MOLD_BODIES = null;

async function submitMold() {
  const val = k => (document.getElementById(k) || {}).value || "";
  const name = String(val("ml-name")).trim();
  /* "nothing yet" records the mold and stops. An SN5 mold being catalogued has
     no STL, and reports.js's importer needs a mold to exist without geometry —
     but as a branch here, not as a second button on the rail. */
  if (val("ml-src") === "none") {
    if (!name) { toast("Give the mold a name.", "error"); return; }
    const id = await allocId("molds");
    if (!id) return;
    const nd = readMoldDensityRange(val);
    const nlo = nd.min ?? 30, nhi = nd.max ?? nlo;
    // `density` stays, equal to min, so every reader that wants one number keeps working.
    const m = { id, name, stage: "Designed", density: String(nlo),
      densityMin: String(nlo), densityMax: String(nhi), createdBy: myEmail() };
    (DB.molds = DB.molds || []).push(m);
    save("molds", m);
    closeModal();
    view = { ...view, tab: "molds", mode: "detail", id };
    render();
    toast(`${name} recorded at “Designed”. Plan its stack whenever the CAD is ready.`);
    return;
  }
  const isBox = val("ml-src") !== "stl";
  const auto = val("ml-mode") !== "manual";
  const { min: dLo, max: dHi } = readMoldDensityRange(val);
  if (dLo == null || dHi == null) { toast("Board density is a plain number in lb/ft³ — 30, 45, 60.", "error"); return; }
  if (dHi < dLo) { toast(`The maximum density has to be at least the minimum — you asked for ${dLo} to ${dHi}.`, "error"); return; }
  const density = dLo;   // the one number every downstream reader still wants

  let thkMm = null;
  if (!auto) {
    const tUnit = val("ml-thk-u") === "mm" ? "mm" : "in";
    const list = String(val("ml-thk")).split(/[, ]+/).filter(Boolean).map(Number);
    if (!list.length || list.some(n => !Number.isFinite(n) || n <= 0)) {
      toast("List the board thicknesses bottom to top, e.g. 2, 2, 1.", "error"); return;
    }
    thkMm = list.map(v => toMm({ value: v, unit: tUnit }));
  }
  const available = stockThicknessesMm(dLo, dHi);
  /* The rack itself, not just the distinct thicknesses on it. Two things need
     it: compositionCandidates must not propose four 3in layers against one 3in
     sheet, and moldCost scores a candidate by actually packing it. Filtered to
     the DECLARED RANGE. CS-004 still says grades are not interchangeable
     silently — the range is where somebody says so out loud, and inside it the
     boards are one pool, which is why `supply` below sums across grades rather
     than per grade.
     Empty (nobody has entered stock yet) means neither is applied and planning
     falls back to the volume heuristic. */
  const rack = boardsForPacking().filter(b => b.density >= dLo && b.density <= dHi);
  const supply = {};
  for (const b of rack) {
    const k = Math.round(b.thk * 10) / 10;
    supply[k] = (supply[k] || 0) + (b.qty || 1);
  }
  if (auto && !available.length) {
    // Name the grades that DO have board. "pick the other density" was fine
    // when there were two; density is typed now, so say what is actually there.
    const have = [...densityStockCounts().keys()].sort((a, b) => a - b);
    const asked = dLo === dHi ? `${dLo} lb` : `${dLo}–${dHi} lb`;
    toast(`No ${asked} board stock on the rack — the planner picks thicknesses from what you actually have. ${
      have.length ? `Add boards, widen the range, or plan at ${have.join(" or ")} lb.` : "Add boards first."}`, "error");
    return;
  }

  const prog = document.getElementById("ml-progress");
  const setProg = m => { if (prog) prog.textContent = m; };

  /* A LARGE FINITE SENTINEL, never Infinity: slicer.js formats the cap into
     warning text with (maxDepth / 25.4).toFixed(0), and Infinity prints as
     "Infinity in". sectionize with a huge cap returns one section with
     L.section === 0 on every layer, so every consumer of the split — the
     drawings, planSetups, exportSectionStl — works unchanged with no edits. */
  const noSplit = !!(document.getElementById("ml-nosplit") || {}).checked;
  const noSplitOpts = noSplit ? { maxCutDepth: NO_SPLIT_DEPTH_MM } : {};

  let msg, sourceName, sourceBytes = 0;
  if (isBox) {
    const dim = (k) => parseDim(val("ml-b" + k), val(`ml-b${k}-u`));
    const L = dim("l"), W = dim("w"), H = dim("h");
    for (const [r, label] of [[L, "Length"], [W, "Width"], [H, "Height"]]) {
      if (r.err) { toast(`${label} ${r.err}.`, "error"); return; }
    }
    msg = { cmd: "slice", box: { len: toMm(L.dim), wid: toMm(W.dim), hgt: toMm(H.dim) }, thicknesses: thkMm, available, boards: rack, supply, densityMin: dLo, densityMax: dHi, opts: { ...noSplitOpts } };
    sourceName = `block ${fmtDim(L.dim)} x ${fmtDim(W.dim)} x ${fmtDim(H.dim)}`;
  } else {
    const fileEl = document.getElementById("ml-file");
    const f = fileEl && fileEl.files && fileEl.files[0];
    if (!f && !MOLD_BUF) { toast("Pick an STL first.", "error"); return; }
    if (f) {
      // The <input type="file"> is never cleared, so f is still truthy on the
      // second "Plan" click after picking a body — without this key check,
      // MOLD_BODIES got reset to null on every submit, re-triggering the
      // "pick one" prompt forever instead of ever reaching bodyIndex below.
      const key = f.name + ":" + f.size;
      if (!MOLD_BUF || MOLD_BUF.key !== key) {
        if (f.size > MAX_STL_BYTES) { toast(`That STL is ${Math.round(f.size / 1e6)} MB. Export it at a coarser tolerance — the limit is ${MAX_STL_BYTES / 1e6} MB.`, "error"); return; }
        setProg("Reading the file…");
        MOLD_BUF = { buffer: await f.arrayBuffer(), name: f.name, size: f.size, key };
        MOLD_BODIES = null;   // genuinely a new file — re-probe
      }
    }
    const unit = val("ml-unit") === "in" ? "in" : "mm";
    /* A real export is often an assembly. Ask which body BEFORE planning, or
       we would slice the bounding box of everything and plan a void. */
    if (MOLD_BODIES === null) {
      setProg("Looking for separate bodies…");
      const info = await runSlice({ cmd: "bodies", buffer: MOLD_BUF.buffer, unit, cacheKey: MOLD_BUF.key });
      MOLD_BODIES = info.bodies || [];
      if (MOLD_BODIES.length > 1) {
        const host = document.getElementById("ml-bodies");
        if (host) host.innerHTML = `<div class="field"><label>Which body?</label><select id="ml-body">
          ${MOLD_BODIES.map(b => `<option value="${b.index}">#${b.index + 1} — ${(b.w / 25.4).toFixed(1)} &times; ${(b.d / 25.4).toFixed(1)} &times; ${(b.h / 25.4).toFixed(1)} in (${b.triangles.toLocaleString()} tris)</option>`).join("")}
        </select></div><div class="muted tny">This file holds ${MOLD_BODIES.length} separate bodies — an assembly export, not one mold. Plan them one at a time.</div>`;
        setProg("");
        toast(`${MOLD_BODIES.length} bodies in that file — pick one, then Plan again.`, "info");
        return;
      }
      const host = document.getElementById("ml-bodies");
      if (host) host.innerHTML = `<input type="hidden" id="ml-body" value="0">`;
    }
    msg = {
      cmd: "slice", buffer: MOLD_BUF.buffer, unit, cacheKey: MOLD_BUF.key,
      bodyIndex: Number((document.getElementById("ml-body") || {}).value || 0),
      thicknesses: thkMm, available, boards: rack, supply, densityMin: dLo, densityMax: dHi,
      // A typed box is a block already, so the choice only exists for an STL.
      opts: { monolithic: val("ml-shape") === "block", ...noSplitOpts },
    };
    sourceName = MOLD_BUF.name; sourceBytes = MOLD_BUF.size;
  }

  try {
    setProg("Planning…");
    const result = await runSlice(msg, v => setProg(`Planning… ${Math.round(v * 100)}%`));
    const id = await allocId("stackplans");
    if (!id) return;
    const raw = {
      id, name: name || sourceName, source: sourceName, sourceBytes,
      // `density` is min, kept so the grade grouping and the SZ: key read one number.
      density, densityMin: dLo, densityMax: dHi,
      unit: isBox ? "mm" : (val("ml-unit") === "in" ? "in" : "mm"),
      thicknessesMm: result.composition || thkMm, bounds: result.bounds,
      layers: result.layers, sections: result.sections || [],
      warnings: result.warnings || [], considered: result.considered || 0,
      alternatives: result.alternatives || [], usedRack: !!result.usedRack, cost: result.cost || 0,
      monolithic: !!result.monolithic,
      /* What this plan was actually sliced under. Every consumer of the split
         reads the PLAN (drawings, planSetups, exportSectionStl), so the plan
         has to carry the cap or a re-plan silently changes the wall drawings. */
      splitWaived: noSplit, maxCutDepthMm: noSplit ? NO_SPLIT_DEPTH_MM : MAX_CUT_DEPTH_MM,
      triangleCount: result.triangleCount || 0,
      by: myEmail(), ts: new Date().toISOString(),
    };
    /* The mesh may have been laid flat on a picked bottom face by the Fusion
       add-in. Its matrix rides on the plan so the stock export can undo it. */
    const frame = typeof fusionFrame === "function" ? fusionFrame() : null;
    if (frame) raw.frame = frame;
    const { plan, notes } = fitPlanForStorage(raw);
    plan.notes = notes;
    /* Park the mold mesh in Storage so the 3D view survives a reload. That
       reload is the whole point: CS-003 §7.2 has someone who did NOT design the
       mold sign off on the fit, and they open the plan later, on their own
       laptop. Firestore can't hold it (1 MiB doc cap, and contours already
       compete for that), so it goes to Storage as a binary STL — which
       slicer.js's parseSTL reads straight back.

       Deliberately non-fatal. A plan whose mesh failed to upload still has its
       blanks, its cut list and its exploded SVG; the viewer just says it has no
       mesh. Losing the cut list because a photo-sized upload timed out on shop
       wifi would be a far worse trade. */
    if (result.meshStl) {
      try {
        setProg("Saving the 3D view…");
        const file = new Blob([result.meshStl], { type: "model/stl" });
        file.name = `${id}-mesh.stl`;
        const rec = await fb.upload(`stackplans/${id}/mesh.stl`, file);
        plan.meshPath = rec.path;
        plan.meshUrl = rec.url;
      } catch (e) {
        notes.push("The 3D view couldn't be saved, so this plan shows blocks only. The blanks and cut list are unaffected.");
      }
    }
    /* The plan is born attached to a mold record, at "Designed". Before this,
       a stack plan was an island a free-text name deep, and the mold record —
       the thing CS-003 §7.2's sign-off wants to hang off — only appeared after
       machining, back-filled. The mold is created first so the plan can carry
       the link before its one save. Non-fatal: if the id allocation fails
       (offline against an exhausted local counter), the plan still saves and
       the pane offers "Create mold from this plan" later. */
    let moldId = "";
    try {
      /* Re-planning an existing mold points it at the new plan and keeps the
         old one on planHistory; otherwise a fresh mold is born here, at
         "Designed", so the CS-003 §7.2 sign-off has a record to hang off. */
      const existing = MOLD_REPLAN ? moldRecById(MOLD_REPLAN) : null;
      if (existing) {
        moldId = existing.id;
        plan.moldId = moldId;
        setNoSplit(existing, noSplit);
        // A re-plan from Fusion refreshes the document link (new version, maybe a new body).
        const fs = typeof fusionStamp === "function" ? fusionStamp() : null;
        if (fs) { existing.fusion = fs; save("molds", existing, "fusion"); }
        setCurrentPlan(existing, plan.id);
      } else {
        moldId = (await allocId("molds")) || "";
        if (moldId) {
          const m = {
            id: moldId, name: plan.name, stage: "Designed",
            density: String(dLo), densityMin: String(dLo), densityMax: String(dHi),
            layers: (plan.thicknessesMm || []).length ? `${plan.thicknessesMm.length} layers` : "",
            createdBy: myEmail(),
          };
          if (noSplit) { m.noSplit = true; m.noSplitBy = myEmail(); m.noSplitAt = today(); }
          /* Where the mesh came from, when the Fusion add-in handed it in
             (fusion.js). Absent for a browser upload, on purpose: an empty
             block would render an empty section. */
          const fs = typeof fusionStamp === "function" ? fusionStamp() : null;
          if (fs) m.fusion = fs;
          (DB.molds = DB.molds || []).push(m);
          save("molds", m);
          plan.moldId = moldId;
          setCurrentPlan(m, plan.id);
        }
      }
    } catch (e) { moldId = ""; }
    MOLD_REPLAN = "";
    (DB.stackplans = DB.stackplans || []).push(plan);
    save("stackplans", plan);
    // Hand the layers back to Fusion if that is where the mesh came from.
    if (typeof fusionPlanSaved === "function") fusionPlanSaved(plan, moldId);
    closeModal();
    view = moldId
      ? { ...view, tab: "molds", mode: "detail", id: moldId }
      : { ...view, tab: "molds", mode: "detail", id };
    render();
    toast(notes.length ? notes[0] : (moldId ? `Mold sliced — ${plan.name} created at “Designed”.` : "Mold sliced."));
  } catch (e) {
    setProg("");
    toast(e.message || "Slicing failed.", "error");
    if (e.region) toast(`Look near X ${e.region.x.toFixed(0)}, Y ${e.region.y.toFixed(0)} on layer ${e.region.layer}.`, "error");
  }
}

function planById(id) { return (DB.stackplans || []).find(p => p.id === id); }
/* One path with the mold's own delete (molds.js moldsBulkDelete): the stored
   mesh goes with the plan either way. */
function delStackPlan(id) { moldsBulkDelete([id]); }

/* ---------- the cut list ----------
   This is the batch view, and batching is the whole point: caking one mold by
   eye is already decent, the win is packing several molds' blanks into one pool
   of board and spending the offcut pile first. */
/* ---------- which plans the cut list may propose ----------
   It used to propose ALL of them. `DB.stackplans` is every plan ever sliced, so
   the pool held retired molds, last season's work, molds already machined, and
   both halves of every re-plan. Nesting is a pool problem: one stale plan does
   not just add a row, it changes which boards get opened for everything else,
   and then somebody cuts a mold that was cut in March.

   Eligibility is the mold's stage, and it is HARD at "Designed" on Simon's
   call. The override is walking the mold back a stage, which asks first and
   says it erases recorded work — a trail, rather than a checkbox nobody
   remembers ticking.

   Three ways to be held back, and the reason is returned rather than a boolean
   so the screen can say which. A plan vanishing with no explanation reads as a
   bug, and orphans in particular are exactly the records nobody is watching. */
function cutHeldBackReason(p) {
  if (!p) return "gone";
  const mold = recById("molds", p.moldId);
  if (!mold) return "no mold";
  if (mold.stage !== "Designed") return "at " + String(mold.stage || "an unknown stage").toLowerCase();
  /* A re-plan leaves BOTH plans on the mold and only one is real. Without this
     the superseded one's blanks stay in the pool forever, and the mold gets cut
     to a shape nobody chose. currentPlanFor falls back to newest-by-ts, so SN5
     plans written before the pointer existed still resolve. */
  const cur = typeof currentPlanFor === "function" ? currentPlanFor(mold) : null;
  if (cur && cur.id !== p.id) return "superseded";
  return "";
}
function cutEligiblePlans() { return (DB.stackplans || []).filter(p => !cutHeldBackReason(p)); }

/* The set the screen is actually about. ONE function, because the list, the
   commit modal and the print each used to write the same `filter` expression
   out by hand, and a commit that consumes board the list never showed is the
   expensive kind of drift. A cutSel left pointing at a plan that has since been
   held back is ignored rather than obeyed, so the picker cannot strand you on
   an empty screen. */
function cutScopePlans() {
  const eligible = cutEligiblePlans();
  const sel = eligible.some(p => p.id === view.cutSel) ? view.cutSel : "";
  return { eligible, sel, plans: sel ? eligible.filter(p => p.id === sel) : eligible };
}

/* What is being held back, and why, with a way out for the orphans. */
function cutHeldBackCard() {
  const held = (DB.stackplans || []).map(p => ({ p, why: cutHeldBackReason(p) })).filter(h => h.why);
  if (!held.length) return "";
  const orphans = held.filter(h => h.why === "no mold");
  const byWhy = new Map();
  held.forEach(h => byWhy.set(h.why, (byWhy.get(h.why) || 0) + 1));
  const reasons = [...byWhy].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${n} ${why}`).join(", ");
  return `<div class="card"><div class="muted tny"><b>${held.length} plan${held.length === 1 ? "" : "s"} held back</b> — ${esc(reasons)}.
    Only a mold still at Designed is cut from here; walk a mold back a stage to re-cut it.</div>
    ${orphans.length ? `<div class="no-print addrow" style="margin-top:6px">${orphans.slice(0, 6).map(h =>
      `<button class="sm" onclick="createMoldFromPlan('${esc(h.p.id)}')">Create a mold for ${esc(h.p.name || h.p.id)}</button>`).join(" ")}
      ${orphans.length > 6 ? `<span class="muted tny">and ${orphans.length - 6} more on the Molds overview.</span>` : ""}</div>` : ""}
  </div>`;
}

function blanksFromPlans(plans) {
  const out = [];
  plans.forEach(p => {
    /* A plan written before ranges existed carries only `density`, and falls
       through to lo === hi — the behaviour it was planned under. No migration. */
    const lo = canonDensity(p.densityMin ?? p.density) ?? 30;
    const hi = canonDensity(p.densityMax ?? p.densityMin ?? p.density) ?? lo;
    (p.layers || []).forEach((L, i) => (L.blanks || []).forEach((b, k) => out.push({
      id: `${p.name} L${i + 1}${L.blanks.length > 1 ? String.fromCharCode(97 + k) : ""}`,
      // `layer` rides along so the commit can record which grade each LAYER was
      // actually cut from — the layer sheet is the one that sits on the machine.
      planId: p.id, layer: i, w: b.x1 - b.x0, h: b.y1 - b.y0,
      thickness: L.thickness, density: lo, densityMin: lo, densityMax: hi,
    })));
  });
  return out;
}
/* The trailing number of a BRD- id. NOT cmpId: we need the number itself to
   rank by, not an ordering. An id with no trailing digits sorts last, and
   deterministically. */
function boardIdTail(id) {
  const m = /(\d+)\s*$/.exec(String(id || ""));
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
function boardsForPacking() {
  const idx = boardIndexById();
  return (DB.stock || []).map(b => ({
    id: b.id, label: b.label, location: b.location || "",
    len: toMm(b.len), wid: toMm(b.wid), thk: toMm(b.thk),
    density: canonDensity(b.density) ?? 30, qty: b.qty || 1,
    index: idx.get(b.id) ?? 0,
  })).filter(b => Number.isFinite(b.len) && Number.isFinite(b.wid) && Number.isFinite(b.thk));
}

/* ONE definition of "index", because two would drift and the whole feature is
   the packer and the rack list agreeing about which board is easiest to get at.

   INDEX — the board's rank within its OWN storage location, which is what the
     packer spends in boardCost(). A stack lives on one shelf, so a board on a
     different shelf is not "under" anything here; ranking globally would price a
     walk across the container as if it were a lift.

     Derived from the id, because ids are minted in order and a rack is only ever
     added to from the top — so "entered earlier" reads as "further down the
     pile". It is a proxy, and a soft one: it goes wrong the first time somebody
     restacks a shelf, which is exactly why DIG_WORTH_BLANK is small.

     A board with NO location is index 0, and that is the DEFINED behaviour, not
     a fallback — you cannot be buried in a pile nobody has written down. It also
     makes the whole preference a no-op on a rack nobody has filed, which is what
     sn5-stock.json is. */
function boardIndexById() {
  const out = new Map(), byLoc = new Map();
  for (const b of (DB.stock || [])) {
    if (!b.location) { out.set(b.id, 0); continue; }
    if (!byLoc.has(b.location)) byLoc.set(b.location, []);
    byLoc.get(b.location).push(b);
  }
  for (const list of byLoc.values()) {
    list.sort((a, b) => (boardIdTail(a.id) - boardIdTail(b.id)) || cmpId(a.id, b.id));
    list.forEach((b, i) => out.set(b.id, i));
  }
  return out;
}
function renderCutList() {
  const { eligible, sel, plans } = cutScopePlans();
  const blanks = blanksFromPlans(plans);
  const boards = boardsForPacking();
  const res = blanks.length && boards.length ? packAll(blanks, boards, {}) : null;
  const back = (typeof cutsUndoBar === "function" ? cutsUndoBar() : "") +
    `<div class="toolbar no-print"><button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft", 16)} All stock</button>
    <select onchange="view.cutSel=this.value;render()">
      <option value="">Every mold ready to cut (${eligible.length})</option>
      ${eligible.map(p => `<option value="${esc(p.id)}" ${sel === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
    </select>
    <button onclick="printCutSet()">${icon("print", 15)} Print cut list</button>
    ${sel ? `<button class="ib" onclick="openDrawings('${esc(sel)}')">${icon("print", 15)} This mold's drawings</button>` : ""}
    ${res && res.plans.length ? `<button class="primary" style="margin-left:auto" onclick="openCommitCutsModal()">Mark these boards cut…</button>` : ""}</div>`;
  if (!blanks.length) return back + cutHeldBackCard() +
    `<div class="card">${(DB.stackplans || []).length
      ? "Nothing to cut: every plan on file is held back for the reason above. A mold is cut from here only while it is still at Designed."
      : "Nothing to cut yet — plan a mold first."}</div>`;
  if (!boards.length) return back + `<div class="card">No board stock recorded, so there is nothing to cut from. Add boards first.</div>`;

  const util = utilisation(res.plans);
  return back + cutHeldBackCard() + `
  <div class="card">
    <h2>Cut list</h2>
    <div class="muted">${blanks.length} blanks from ${plans.length} mold${plans.length > 1 ? "s" : ""} · ${res.boardsUsed} board${res.boardsUsed === 1 ? "" : "s"} opened · ${(util * 100).toFixed(0)}% of opened board used · kerf ${KERF_MM}mm</div>
    ${feedRateBand(res)}
    ${res.shortfall.length ? `<div class="warn">${icon("warning", 14)} <b>Short ${res.shortfall.length} blank${res.shortfall.length > 1 ? "s" : ""}.</b> Nothing on the rack fits these — order board before starting:
      <ul>${res.shortfall.map(s => `<li>${esc(s.id)} — ${mmIn(s.w)} &times; ${mmIn(s.h)} at ${mmIn(s.thickness)} thick</li>`).join("")}</ul></div>` : ""}
    ${res.degraded ? `<div class="warn">${icon("warning", 14)} <b>Narrowed search.</b> This batch is large enough that the planner scored only the smallest few boards that could hold the biggest blank, rather than every board on the rack. The plan is valid; it may not be the cheapest one.</div>` : ""}
  </div>
  ${res.plans.map((pl, i) => `<div class="card">
    <h3>Board ${i + 1} — ${esc(pl.board.src.id)}${pl.board.src.label ? " · " + esc(pl.board.src.label) : ""}</h3>
    <div class="muted tny">${mmIn(pl.board.w)} &times; ${mmIn(pl.board.h)} &times; ${mmIn(pl.thickness)} · ${
      // Bold the board that sets the feed rate for everything glued to it.
      pl.density === res.maxDensity && res.densitiesUsed.length > 1
        ? `<b>${pl.density} lb/ft³ — sets the feed</b>` : `${pl.density} lb/ft³`}</div>
    ${cutDiagram(pl)}
    <table class="list">
      <tr><th>#</th><th>Cut</th></tr>
      ${cutSequence(pl).map(c => `<tr><td><b>${c.n}</b></td><td>${esc(c.text)}</td></tr>`).join("")}
    </table>
    <div class="muted tny">Yields: ${pl.placed.map(p => esc(p.part.id) + (p.rotated ? " (turned 90°)" : "")).join(", ")}${pl.leftover.length ? ` · keeps ${pl.leftover.length} reusable offcut${pl.leftover.length > 1 ? "s" : ""}` : ""}</div>
  </div>`).join("")}`;
}
/* WHAT FEED RATE DOES THIS GET MACHINED AT?
   The densest board in a stack sets the ShopSabre feed for the whole thing —
   you cannot run the 30lb layers fast and the 45lb layer slow when they are one
   glued block. Now that a mold can be planned against a RANGE of grades, that
   number is no longer whatever the user typed, so it has to be said out loud
   wherever the cut is about to happen. One line, its own band, never appended
   to the run-on muted line above it. */
function feedRateBand(res) {
  if (!res || res.maxDensity == null) return "";
  const many = res.densitiesUsed.length > 1;
  return `<div class="warn">${icon("warning", 14)}
    <b>Machine at the ${res.maxDensity} lb/ft³ feed.</b>
    ${many ? `Boards opened: ${res.densitiesUsed.join(", ")} lb/ft³. The densest board in a stack
      sets the feed for the whole thing.` : `Every board opened is ${res.maxDensity} lb/ft³.`}</div>`;
}

/* The label inside one blank on the nest. Plan names are long ("Clamshell
   Mold With Mating Surface · Clamshell Mold Body L1") and blanks are often
   narrow, so a centred one-liner ran across three neighbours (Simon,
   2026-09-16). Two rules: the label lives in a nested <svg> the size of the
   blank, which clips anything that would spill, so a label can never cross
   an edge; and it is two lines, the layer tag ("L1", "L2b") on its own line
   because that is what somebody at the saw matches against the cut list,
   with the plan name above it shortened to fit with an ellipsis. Width is
   estimated at 0.55em per character, which is about right for the UI font
   and errs long, so text that "fits" really does. Too small for either line
   and it draws nothing rather than a fragment. */
function nestLabel(p, x, y, w, h) {
  const id = String(p.part.id || "");
  const m = id.match(/^(.*?)\s*(L\d+[a-z]?)$/);
  const name = m ? m[1] : id, tag = m ? m[2] : "";
  const TAG = 11, NAME = 9, pad = 4;
  const fits = (str, px, size) => str.length * size * 0.55 <= px;
  const shorten = (str, px, size) => {
    if (fits(str, px, size)) return str;
    const n = Math.floor(px / (size * 0.55)) - 1;
    return n >= 3 ? str.slice(0, n) + "…" : "";
  };
  const inner = w - 2 * pad;
  const lines = [];
  if (tag && fits(tag, inner, TAG)) lines.push({ t: tag, size: TAG, weight: 600 });
  const short = shorten(name, inner, NAME);
  if (short && h >= (lines.length ? TAG + NAME + 6 : NAME + 4)) lines.unshift({ t: short, size: NAME, weight: 400 });
  if (!lines.length || h < TAG + 2) return "";
  const total = lines.reduce((s, l) => s + l.size, 0) + (lines.length - 1) * 3;
  let cy = h / 2 - total / 2;
  const text = lines.map(l => {
    cy += l.size;
    const el = `<text x="${(w / 2).toFixed(1)}" y="${(cy - 2).toFixed(1)}" font-size="${l.size}" font-weight="${l.weight}" text-anchor="middle" fill="currentColor">${esc(l.t)}</text>`;
    cy += 3;
    return el;
  }).join("");
  return `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" overflow="hidden"><title>${esc(id)}</title>${text}</svg>`;
}

/* Top-down view of one board. Black and white only — this gets printed on the
   laser at RFS, same rule as the traveler. */
function cutDiagram(pl) {
  const W = 640, s = W / pl.board.w, H = Math.max(60, pl.board.h * s);
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" width="100%" role="img" aria-label="Cutting layout for this board" style="max-height:340px">
    <rect x="0" y="0" width="${W}" height="${H.toFixed(0)}" fill="none" stroke="currentColor" stroke-width="1.5"/>
    ${pl.placed.map(p => `<rect x="${(p.x * s).toFixed(1)}" y="${((pl.board.h - p.y - p.h) * s).toFixed(1)}" width="${(p.w * s).toFixed(1)}" height="${(p.h * s).toFixed(1)}"
      fill="none" stroke="currentColor" stroke-width="1.6"/>
      ${nestLabel(p, p.x * s, (pl.board.h - p.y - p.h) * s, p.w * s, p.h * s)}`).join("")}
    ${pl.cuts.map((c, i) => c.axis === "x"
      ? `<line x1="${(c.at * s).toFixed(1)}" y1="${((pl.board.h - c.to) * s).toFixed(1)}" x2="${(c.at * s).toFixed(1)}" y2="${((pl.board.h - c.from) * s).toFixed(1)}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3"/>`
      : `<line x1="${(c.from * s).toFixed(1)}" y1="${((pl.board.h - c.at) * s).toFixed(1)}" x2="${(c.to * s).toFixed(1)}" y2="${((pl.board.h - c.at) * s).toFixed(1)}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3"/>`).join("")}
  </svg>`;
}
/* ---------- marking the cut done ----------
   The approved phase-2 piece: the list stops being advice and becomes a
   transaction. Cut boards leave the rack (qty down, row deleted at zero) and
   every leftover the packer kept (already tagged with its boardId and
   filtered to >= MIN_REMNANT_MM) goes back on it as a new, smaller board
   row — a remnant is not a separate kind of thing, origin carries the
   provenance.

   Two hard rules, both learned elsewhere in this file's history:
   - The proposal is SNAPSHOTTED by the button handler, never read from the
     render path: renderCutList() re-runs packAll on every render and a
     Firestore snapshot can re-render at any moment, so the thing confirmed
     must be frozen the moment the modal opens.
   - The commit re-checks the rack before writing and aborts whole if a
     board vanished or thinned under the snapshot — a partial write of a
     stale plan would silently eat somebody's stock. */
let CUT_PROPOSAL = null;
let CUTS_UNDO = null;
let CUT_FEED = "";      // the feed-rate band, kept so the pane can repaint without re-packing

function openCommitCutsModal() {
  const plans = cutScopePlans().plans;
  const res = packAll(blanksFromPlans(plans), boardsForPacking(), {});
  if (!res.plans.length) { toast("Nothing to cut.", "info"); return; }
  /* uid per offcut, minted once, the plyTable/stackMutate idiom: the pane
     re-renders itself after every add and delete, and a row identified by its
     index loses the caret the moment a row above it goes. */
  let seq = 0;
  const off = (pl, o, scrap) => ({
    uid: "o" + (++seq),
    label: `offcut of ${pl.board.src.id}`,
    // mm, as the packer measured them, rounded once here rather than at write.
    // The row shows these as inches beside the field; the value stays mm.
    w: Math.round(o.w), h: Math.round(o.h),
    keep: !scrap, scrap: !!scrap,
  });
  CUT_PROPOSAL = res.plans.map(pl => ({
    boardId: pl.board.src.id, label: pl.board.src.label || "",
    w: pl.board.w, h: pl.board.h, thickness: pl.thickness, density: pl.density,
    yields: pl.placed.map(p => p.part.id),
    /* Which mold and which layer each blank off this board belongs to, so the
       commit can write back what grade each one actually got cut from — the
       planned range says what was allowed, only the commit says what happened. */
    refs: pl.placed.map(p => ({ planId: p.part.planId, layer: p.part.layer }))
      .filter(r => r.planId),
    take: true,
    /* Ticked remnants first, then the sub-4in slivers unticked. The packer
       never counted those as recovered value and still does not; whether one
       is worth keeping is a judgement for the person holding it. */
    offcuts: pl.leftover.map(o => off(pl, o, false))
      .concat((pl.scrap || []).map(o => off(pl, o, true))),
  }));
  CUT_FEED = feedRateBand(res);
  openModal(`
    <h2>Mark these boards cut?</h2>
    <p class="muted tny">These boards leave the rack and the offcuts below come back on it as new
      stock. <b>Correct the sizes before you commit</b> — the packer's numbers are what it planned
      to cut, not what is in your hand. Untick a board you did not actually cut.</p>
    ${CUT_FEED}
    <div id="cc-body">${ccBodyHtml()}</div>
    <div class="foot">
      <button onclick="CUT_PROPOSAL=null;closeModal()">Cancel</button>
      <button class="primary" onclick="submitCommitCuts()">Mark cut</button>
    </div>
  `, { wide: true });
}

/* ---------- the review pane ----------
   It used to be one checkbox per board and the words "keeps 2 offcuts". The
   sizes were never shown, so a board left the rack and two BRD- records
   appeared with dimensions nobody had looked at — and a remnant is exactly the
   thing the packer is most likely to be wrong about, because it is whatever is
   left after everything that mattered was placed.

   Re-rendered on its own, never through render(): the app re-renders on every
   Firestore snapshot, and a half-typed dimension cannot survive that. */
function ccBodyHtml() {
  return (CUT_PROPOSAL || []).map((p, i) => `
    <div class="ccboard${p.take ? "" : " off"}">
      <label class="cutrow"><input type="checkbox" id="cc-${i}" ${p.take ? "checked" : ""}
        onchange="ccBoardTake(${i}, this.checked)">
        <span><b>${esc(p.boardId)}</b>${p.label ? " · " + esc(p.label) : ""} — ${mmIn(p.w)} &times; ${mmIn(p.h)} &times; ${mmIn(p.thickness)}
          <span class="muted tny">yields ${p.yields.map(esc).join(", ")}</span></span>
      </label>
      <div class="ccoffs">
        ${p.offcuts.length ? p.offcuts.map(o => ccOffHtml(i, o)).join("")
          : '<div class="muted tny">Nothing comes back off this one.</div>'}
        <div class="no-print addrow"><button class="sm" onclick="ccOffAdd(${i})">+ Add offcut</button></div>
      </div>
    </div>`).join("");
}
function ccOffHtml(i, o) {
  const u = esc(o.uid);
  return `<div class="ccoff${o.scrap ? " scrap" : ""}">
    <input type="checkbox" ${o.keep ? "checked" : ""} aria-label="Keep this offcut"
      onchange="ccOffUpd(${i},'${u}','keep',this.checked)">
    <input class="ccoff-label" value="${esc(o.label)}" aria-label="Label"
      onchange="ccOffUpd(${i},'${u}','label',this.value)">
    <span class="ccoff-dims">
      <input type="number" min="0" step="1" value="${o.w}" aria-label="X in millimetres"
        onchange="ccOffUpd(${i},'${u}','w',this.value)">
      <span aria-hidden="true">&times;</span>
      <input type="number" min="0" step="1" value="${o.h}" aria-label="Y in millimetres"
        onchange="ccOffUpd(${i},'${u}','h',this.value)">
      <span class="muted tny">mm · ${mmIn(o.w)} &times; ${mmIn(o.h)}${o.scrap ? " · scrap" : ""}</span>
    </span>
    <button type="button" class="sm ib" title="Drop this offcut" aria-label="Drop this offcut"
      onclick="ccOffDel(${i},'${u}')">${icon("x", 14)}</button>
  </div>`;
}
/* Repaint the pane only. render() would rebuild the page behind the modal and
   is not what changed. */
function ccRefresh() {
  const host = document.getElementById("cc-body");
  if (host) host.innerHTML = ccBodyHtml();
}
function ccOffFind(i, uid) {
  const p = (CUT_PROPOSAL || [])[i];
  return p ? (p.offcuts || []).find(o => o.uid === uid) : null;
}
function ccBoardTake(i, on) {
  const p = (CUT_PROPOSAL || [])[i];
  if (p) { p.take = !!on; ccRefresh(); }
}
function ccOffUpd(i, uid, key, val) {
  const o = ccOffFind(i, uid);
  if (!o) return;
  if (key === "w" || key === "h") {
    const n = Math.round(Number(val));
    o[key] = Number.isFinite(n) && n > 0 ? n : 0;
    /* Typed a real size into a sliver and it stops being scrap — that is the
       whole point of showing them. It never goes back the other way on its
       own; unticking is how you say no. */
    if (o.scrap && o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM) { o.scrap = false; o.keep = true; }
  } else if (key === "keep") {
    o.keep = !!val;
  } else {
    o[key] = String(val);
  }
  ccRefresh();
}
function ccOffAdd(i) {
  const p = (CUT_PROPOSAL || [])[i];
  if (!p) return;
  /* Zero, not a guess. The packer knows what it planned to leave; a piece the
     packer did not predict is one only the person holding it can measure —
     same reasoning as the blank dimensions in logOffcutFromMold. A kept offcut
     still at zero stops the commit rather than writing a nonsense board. */
  p.offcuts.push({ uid: "o" + Date.now() + Math.random().toString(36).slice(2, 5),
    label: `offcut of ${p.boardId}`, w: 0, h: 0, keep: true, scrap: false });
  ccRefresh();
}
function ccOffDel(i, uid) {
  const p = (CUT_PROPOSAL || [])[i];
  if (!p) return;
  p.offcuts = (p.offcuts || []).filter(o => o.uid !== uid);
  ccRefresh();
}
/* Anything typed but not yet committed by a change event, plus a checkbox set
   directly. The snapshot is authoritative; this only stops it going stale. */
function ccSyncFromDom() {
  (CUT_PROPOSAL || []).forEach((p, i) => {
    const el = document.getElementById("cc-" + i);
    /* Only when the element actually reports a boolean. A real checkbox always
       does; a node that does not is telling us nothing, and taking `undefined`
       as "unticked" would untick the whole pane. */
    if (el && typeof el.checked === "boolean") p.take = el.checked;
  });
}

async function submitCommitCuts() {
  const prop = CUT_PROPOSAL || [];
  /* THE SNAPSHOT IS THE FORM. It used to be the other way round: the DOM was
     read here, before any await, because an offline allocId opens its own modal
     over this one and the fields would be gone by then. That worked for a row
     of checkboxes and would not survive a pane full of editable dimensions.

     So every control writes straight into CUT_PROPOSAL as it changes, and this
     reads only the snapshot. ccSyncFromDom is belt and braces for a value typed
     and not yet committed — an in-flight IME composition, or a test that sets
     .checked directly without firing onchange. */
  ccSyncFromDom();
  const checked = prop.filter(p => p.take);
  if (!checked.length) { toast("Nothing ticked — nothing marked.", "info"); return; }
  /* A kept offcut still at zero is an added row nobody measured. Abort whole
     rather than write a board with no size or drop the row silently — the same
     stance the stale-rack check below takes, for the same reason. */
  for (const p of checked) {
    const bad = (p.offcuts || []).find(o => o.keep && !(o.w > 0 && o.h > 0));
    if (bad) { toast(`"${bad.label}" off ${p.boardId} has no size. Measure it, or untick it.`, "error"); return; }
  }
  const perBoard = new Map();
  checked.forEach(p => perBoard.set(p.boardId, (perBoard.get(p.boardId) || 0) + 1));
  for (const [id, k] of perBoard) {
    const b = boardById(id);
    if (!b || (b.qty || 1) < k) { toast("The rack changed under this plan — re-check the cut list.", "error"); return; }
  }
  const undo = { decremented: [], created: [], nBoards: 0, nOff: 0 };
  for (const [id, k] of perBoard) {
    const b = boardById(id);
    undo.nBoards += k;
    if ((b.qty || 1) - k >= 1) {
      b.qty = (b.qty || 1) - k;
      save("stock", b, "qty");
      undo.decremented.push({ id, by: k, deleted: null });
    } else {
      // Keep the full row so undo can put it back exactly as it was.
      undo.decremented.push({ id, by: k, deleted: { ...b } });
      del("stock", id);
      DB.stock = (DB.stock || []).filter(x => x.id !== id);
    }
  }
  for (const p of checked) {
    const parent = undo.decremented.find(d => d.id === p.boardId);
    const live = boardById(p.boardId);
    const loc = (parent && parent.deleted ? parent.deleted.location : live && live.location) || "";
    for (const o of p.offcuts) {
      if (!o.keep) continue;                     // reviewed and declined, or a sliver left as scrap
      const nid = await allocId("stock");
      if (!nid) continue;                        // offline and declined: skip this offcut, keep the rest honest
      const row = {
        id: nid, label: o.label || `offcut of ${p.boardId}`,
        // mm, as the packer measured them or as the person at the saw corrected
        // them — never round-tripped through the entry units (this file's
        // header rule). The pane types in mm for exactly that reason.
        len: { value: Math.round(o.w), unit: "mm" }, wid: { value: Math.round(o.h), unit: "mm" },
        thk: { value: p.thickness, unit: "mm" }, qty: 1, density: p.density,
        origin: `cut ${today()} from ${p.boardId}`, location: loc,
        /* The structured back-link the two provenance STRINGS above could never
           be parsed into. label and origin stay verbatim — the label printer
           and a season of records depend on them — and nothing is backfilled,
           because regexing unparsed free text is a guess. */
        parentId: p.boardId, parentLabel: p.label || "",
        createdBy: myEmail(), ts: new Date().toISOString(),
      };
      (DB.stock = DB.stock || []).push(row);
      save("stock", row);
      undo.created.push(nid);
      undo.nOff++;
    }
  }
  /* WHAT GRADE DID THIS MOLD ACTUALLY GET? The plan records the range that was
     allowed; this is the point where it stops being advice, so this is where
     the answer gets written down. The mold carries the max on its own record
     because "what feed rate does this want" is asked at the machine, standing
     nowhere near the cut list. */
  const cutDens = new Map();     // planId -> { all: Set, byLayer: Map(layer -> Set) }
  for (const p of checked) for (const r of (p.refs || [])) {
    if (!cutDens.has(r.planId)) cutDens.set(r.planId, { all: new Set(), byLayer: new Map() });
    const e = cutDens.get(r.planId);
    e.all.add(p.density);
    if (r.layer == null) continue;
    if (!e.byLayer.has(r.layer)) e.byLayer.set(r.layer, new Set());
    e.byLayer.get(r.layer).add(p.density);
  }
  undo.densityCut = [];
  undo.moved = [];               // molds this commit walked forward, for the toast
  for (const [pid, e] of cutDens) {
    const plan = planById(pid);
    if (!plan) continue;
    const used = [...e.all].sort((a, b) => a - b);
    const max = used[used.length - 1];
    /* Per layer, the grade that layer is machined at — its own max, because a
       layer glued from two grades runs at the higher one just as the stack does. */
    const byLayer = {};
    for (const [L, set] of e.byLayer) byLayer[L] = Math.max(...set);
    const mold = plan.moldId ? moldRecById(plan.moldId) : null;
    undo.densityCut.push({ planId: pid, prevPlan: plan.densityCut ?? null,
      moldId: mold ? mold.id : null, prevMold: mold ? (mold.densityCutMax ?? null) : null,
      prevStage: mold ? (mold.stage ?? null) : null });
    plan.densityCut = { used, max, byLayer, ts: new Date().toISOString(), by: myEmail() };
    save("stackplans", plan, "densityCut");
    if (mold) {
      mold.densityCutMax = String(max); save("molds", mold, "densityCutMax");
      /* THE BOARDS ARE CUT, SO THE MOLD IS AT "Tooling cut". Without this the
         cut list is an annoyance rather than a filter: only molds at Designed
         are offered, so every commit would have to be followed by somebody
         remembering to walk the mold forward by hand, and within a month
         people would simply leave molds at Designed so the list kept working.

         Only from Designed, and only forward. This is not the stepper, which
         asks before skipping or reversing — it is a side effect of an action
         the person already confirmed, so it moves exactly one step and the
         undo bar puts it back. */
      /* Which board this mold came off. Read by the size view, the board
         detail's "Molds cut from this board" join and the printed label, and
         written by NOTHING until now, so that join has been aspirational since
         it was added. Only when the answer is unambiguous: a mold nested
         across two boards has no single one. */
      const from = [...new Set(checked.filter(c => (c.refs || []).some(r => r.planId === pid)).map(c => c.boardId))];
      if (from.length === 1 && !mold.board) { mold.board = from[0]; save("molds", mold, "board"); }
      if (mold.stage === "Designed") {
        mold.stage = "Tooling cut";
        save("molds", mold, "stage");
        undo.moved.push(mold.name || mold.id);
      }
    }
  }

  CUTS_UNDO = undo; CUT_PROPOSAL = null;
  closeModal();
  /* A batch cuts several molds at once, so the toast has to name the stage
     move — it is a write on somebody else's record and it happened silently. */
  const moved = undo.moved.length === 1 ? `${undo.moved[0]} moved to Tooling cut`
    : undo.moved.length ? `${undo.moved.length} molds moved to Tooling cut` : "";
  toast(`${undo.nBoards} board${undo.nBoards === 1 ? "" : "s"} marked cut${undo.nOff ? ` — ${undo.nOff} offcut${undo.nOff === 1 ? "" : "s"} added` : ""}${moved ? " — " + moved : ""}.`);
  view = { ...view, mode: "list" };
  render();
}

/* The first multi-record undo in the app: the memento holds every decrement
   (with the full row when the decrement deleted it) and every created offcut
   id, so one press restores the exact rack. Same single-slot semantics as
   PART_UNDO and SHOP_UNDO: the next commit replaces it. */
function undoCuts() {
  const u = CUTS_UNDO; CUTS_UNDO = null;
  if (!u) { render(); return; }
  /* The as-cut grade goes back to whatever it was too — including back to
     "never cut", which is `undefined`, not 0 and not the planned range. */
  (u.densityCut || []).forEach(d => {
    const plan = planById(d.planId);
    if (plan) {
      if (d.prevPlan == null) delete plan.densityCut; else plan.densityCut = d.prevPlan;
      save("stackplans", plan, "densityCut");
    }
    const mold = d.moldId ? moldRecById(d.moldId) : null;
    if (mold) {
      if (d.prevMold == null) delete mold.densityCutMax; else mold.densityCutMax = d.prevMold;
      save("molds", mold, "densityCutMax");
      /* And back to the stage it was at. A no-op unless the commit moved it,
         because prevStage is stamped whether or not it did. */
      if (d.prevStage != null && mold.stage !== d.prevStage) { mold.stage = d.prevStage; save("molds", mold, "stage"); }
    }
  });
  u.created.forEach(id => { del("stock", id); DB.stock = (DB.stock || []).filter(x => x.id !== id); });
  u.decremented.forEach(d => {
    if (d.deleted) {
      const row = { ...d.deleted };
      (DB.stock = DB.stock || []).push(row);
      save("stock", row);
    } else {
      const b = boardById(d.id);
      if (b) { b.qty = (b.qty || 1) + d.by; save("stock", b, "qty"); }
    }
  });
  toast("Undone — boards back on the rack.");
  render();
}
function dismissCutsUndo() { CUTS_UNDO = null; render(); }
function cutsUndoBar() {
  const u = CUTS_UNDO;
  if (!u) return "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${u.nBoards} board${u.nBoards === 1 ? "" : "s"} marked cut</b>${u.nOff ? ` · ${u.nOff} offcut${u.nOff === 1 ? "" : "s"} added` : ""} — saved for everyone.</span>
    ${/* The receiving desk's idiom: records first, labels when you are at the
          printer. An unlabelled offcut is an unidentifiable board inside a
          week, and this is the only moment anybody knows which ones are new. */""}
    ${u.nOff ? `<button class="sm" onclick="openLabelBuilder('stock', ${JSON.stringify(u.created)})">${icon("print", 14)} Print labels</button>` : ""}
    <button class="sm" onclick="undoCuts()">Undo</button>
    <button class="sm ib" onclick="dismissCutsUndo()">${icon("x", 14)}</button>
  </div>`;
}

/* ---------- the cut list, as a real sheet set ----------
   THE ONE PLACE A PACK IS BUILT, and the boundary between this file and the
   pure drawing code. Everything in the return value is plain data — no DOM, no
   DB — because drawings.js has to stay renderable under node.

   `mineId` is whose blanks get called out on the nest; null means nobody is,
   which is what the batch document wants. `plans` defaults to every stack plan:
   a mold drawing needs the BATCH pack, because showing the blanks belonging to
   OTHER molds that share a board is only answerable from one. */
function cutPack(mineId, plans) {
  const all = plans || DB.stackplans || [];
  const boards = boardsForPacking();
  const blanks = blanksFromPlans(all);
  const res = (blanks.length && boards.length) ? packAll(blanks, boards, {}) : null;
  if (!res) return null;
  return {
    pack: res,
    mineId: mineId || null,
    planNames: Object.fromEntries(all.map(p => [p.id, p.name || p.id])),
    /* layer index -> machine setup number, per plan. A cut sheet has to say
       which SETUP a blank feeds, and it cannot reach into DB for a plan it is
       not about — the batch document is about many molds at once. */
    planSetups: Object.fromEntries(all.map(p =>
      [p.id, (p.layers || []).map(L => (L.section || 0) + 1)])),
    stamp: batchStamp(all, boards),
  };
}

/* Replaces a print path that bypassed the house print system entirely: it threw
   renderCutList()'s screen markup into #printroot inside a bare <div
   class="sheet">, stripped the toolbar with a regex and called window.print().
   No title block, no sheet numbers, no pagination, no preview, no B&W proof and
   no Save — the only printable in the app that worked that way.

   It prints WHAT IS ON SCREEN, cutSel and all, so the button can never disagree
   with the list above it. The cover sheet states the scope, so a page found in
   a drawer next week still says what it was a plan for. */
function printCutSet() {
  const { sel, plans } = cutScopePlans();
  const cut = cutPack(null, plans);
  if (!cut) { toast("Nothing to cut yet — plan a mold, and record some board stock, first.", "info"); return; }
  const one = sel ? plans.find(p => p.id === sel) : null;
  const html = cutSetHtml(cut, {
    by: typeof myEmail === "function" ? myEmail() : "",
    printed: today(),
    title: one ? `CUT LIST — ${String(one.name || one.id).toUpperCase()}` : "CUT LIST — ALL PLANNED MOLDS",
  });
  const n = planCutSheets(cut, { scope: "batch", mineId: null }).length;
  mountSheet(html, true, `US Letter · ${n} sheets · this is exactly what prints`, `Cut list ${today()}`);
  document.body.classList.add("previewing");
  if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
}
/* Write the planned blocks of one section out as a binary STL, in the mold's own
   CAD coordinates and in millimetres — so it lands on the model in CAD with
   nothing to align, and CAM can use it as the stock body directly.

   One file per SECTION, not per mold: a mold past the ShopSabre's 6in cut depth
   is already split by sectionize() into separate machine setups, and a single
   stock solid taller than the machine can cut is not something CAM can use. */
/* The planned blocks of one section, in the frame the CAD model is actually
   in. A plan made from a bottom face picked in Fusion was sliced in a rotated
   frame; its matrix (plan.frame, model -> planning) is undone here so the
   export lands on the model with nothing to align, same as an upright one. */
function sectionTrisInModelFrame(plan, sectionIndex) {
  const tris = sectionTris(plan, sectionIndex);
  const m = plan && plan.frame && plan.frame.matrix;
  return isRigidMatrix(m) ? transformTris(tris, invertRigid(m)) : tris;
}
function exportSectionStl(planId, sectionIndex) {
  const p = planById(planId);
  if (!p) { toast("That plan is gone.", "error"); return; }
  const tris = sectionTrisInModelFrame(p, sectionIndex);
  if (!tris.length) { toast("That section has no blocks in it.", "error"); return; }
  const many = sectionCount(p) > 1;
  const header = `FEB ${p.id}${many ? ` section ${sectionIndex + 1}` : ""} stock - millimetres`;
  const safe = String(p.name || p.id).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || p.id;
  downloadBlob(`${safe}-stock${many ? `-S${sectionIndex + 1}` : ""}.stl`,
    new Blob([writeBinarySTL(tris, header)], { type: "model/stl" }));
  toast(`${tris.length / 12} block${tris.length === 12 ? "" : "s"} exported in mm, at the mold's own origin.`);
}

/* Why these boards and not the other ones.

   The planner trades board against glue joints at a fixed rate — a joint is
   worth a quarter of a sheet — and that number is a judgement call, not
   physics. Printed here with the runners-up beside it, because an exchange rate
   nobody can see is one nobody can argue with, and one nobody can argue with
   never gets tuned. CS-003 §7.3 is a 4h clamp per glue-up, so the cost being
   priced is real hours.

   Note this is scored as if this were the only mold being cut. The cut list
   packs every planned mold's blanks together and is the authority on how much
   board actually gets opened; the two will differ. Subtracting other plans'
   commitments here would make replanning order-dependent and make this page
   change when somebody edits a different mold. */
function whyTheseBoards(p) {
  const alts = p.alternatives || [];
  const inch = c => c.map(t => (Math.round(t / 25.4 * 100) / 100) + "″").join(" + ");
  const joints = Math.max(0, (p.layers || []).length - 1);
  if (!p.usedRack) {
    return `<h3>Why these boards</h3>
      <p class="muted tny">Scored on board volume only — there was no board stock recorded when this was planned, so the planner could not check what the rack actually holds. Add boards and re-plan for a real answer.</p>`;
  }
  if (!alts.length) return "";
  return `<h3>Why these boards</h3>
    <p class="muted tny">${esc(inch(p.thicknessesMm || []))} — ${joints} glue joint${joints === 1 ? "" : "s"},
      ${joints * 4}h of clamp time under CS-003 §7.3. Scored against the boards on the rack, pricing one glue joint
      at a quarter of a 4×8 sheet. Runners-up:</p>
    <table class="list">
      <tr><th>Stack</th><th>Glue joints</th><th>Cost</th></tr>
      ${alts.map(a => `<tr>
        <td>${esc(inch(a.composition || []))}</td>
        <td>${esc(a.joints)}</td>
        <td class="tny">${a.cost > (p.cost || 0) ? "+" : ""}${(((a.cost - (p.cost || 0)) / (p.cost || 1)) * 100).toFixed(0)}%</td>
      </tr>`).join("")}
    </table>
    ${whyTheseLifts(p)}
    <p class="muted tny">Costed as if this were the only mold being cut. The cut list packs every planned mold together and is the authority on how much board actually gets opened.</p>`;
}

/* THE SECOND EXCHANGE RATE, AND WHETHER IT EVER DECIDES ANYTHING.
   boardCost prices a lift at DIG_WORTH_BLANK per board dug through, and the
   whole argument for the number being 0.05 is that it is too small to buy a
   worse nest. That argument is only worth making if somebody can check it, so
   the last column says, per board, how much the winner beat the next-best
   candidate by — and therefore whether the lift charge changed the answer or
   merely rode along. If it never decides anything, the constant is too small
   and this table is the evidence for saying so. */
function whyTheseLifts(p) {
  const boards = boardsForPacking();
  if (!boards.length) return "";
  const res = packAll(blanksFromPlans([p]), boards, {});
  if (!res.plans.length) return "";
  const anyLift = res.plans.some(pl => pl.digCost > 0);
  return `<p class="muted tny">Beside board and glue joints, the planner prefers the board nearest the
      top of its own pile, priced at <b>5% of the blank</b> per board it has to be dug out from under.
      Deliberately small: on this rack the gap between two genuine board choices is around 0.65 in the
      same units, so a board would have to be about thirteen down before this could pick a worse nest.
      Nesting first, lifting second — but not never.</p>
    <table class="list">
      <tr><th>Board</th><th>Where</th><th>Index</th><th>Lift charge</th><th>Beat next by</th></tr>
      ${res.plans.map(pl => {
        const decided = pl.margin != null && pl.digCost > 0 && pl.margin < pl.digCost;
        return `<tr>
        <td>${esc(pl.board.src.id)}</td>
        <td class="tny">${pl.board.src.location ? shopRefChip(String(pl.board.src.location)) : `<span class="muted">unfiled</span>`}</td>
        <td>${pl.index}</td>
        <td class="tny">${pl.digCost ? "+" + pl.digCost.toFixed(2) : "—"}</td>
        <td class="tny">${pl.margin == null ? "only candidate"
          : pl.margin.toFixed(2) + (decided ? " — the lift decided this" : "")}</td>
      </tr>`; }).join("")}
    </table>
    ${anyLift ? "" : `<p class="muted tny">Nothing on this plan was dug for: every board opened was already on top of its pile, so the lift charge changed nothing here.</p>`}`;
}

function renderStackPlan() {
  const p = planById(view.id);
  if (!p) { view.mode = "list"; view.id = null; return moldsOverview(); }
  const h = p.bounds ? (p.bounds.z1 - p.bounds.z0) : 0;
  const nSec = sectionCount(p);
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list',id:null};render()">${icon("chevronLeft", 16)} All molds</button>
    <button class="ib" onclick="openDrawings('${esc(p.id)}')">${icon("print", 15)} Drawings</button>
    ${nSec === 1
      ? `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',0)">${icon("download", 15)} Export stock STL</button>`
      : `<span class="muted tny" style="align-self:center">Export stock STL:</span>` +
        Array.from({ length: nSec }, (_, i) =>
          `<button class="ib" onclick="exportSectionStl('${esc(p.id)}',${i})">${icon("download", 15)} Section ${i + 1}</button>`).join("")}
    ${isLead() ? `<button class="danger" onclick="delStackPlan('${esc(p.id)}')">Delete</button>` : ""}
  </div>
  <div class="card">
    <h2>${esc(p.name)}</h2>
    <div class="muted">${esc(p.id)} · ${p.layers.length} layers${p.monolithic ? " as one solid block" : ""}${p.frame && p.frame.matrix ? " · laid flat on a face picked in Fusion" : ""} · mold ${mmIn(h)} tall · from ${esc(p.source)}${p.triangleCount ? ` (${p.triangleCount.toLocaleString()} triangles)` : ""} · ${esc(p.by || "")} ${fmtWhen(p.ts)}</div>
    ${(p.warnings || []).map(w => `<div class="warn">${icon("warning", 14)} ${esc(w)}</div>`).join("")}
    ${(p.notes || []).map(n => `<div class="muted tny">${esc(n)}</div>`).join("")}
    <h3>Mold in stock <span class="muted" style="text-transform:none">— drag to rotate, scroll or pinch to zoom</span></h3>
    ${meshViewHtml(p)}
    <h3>Stack</h3>
    ${stackSvg(p)}
    <p class="muted tny">Dashed outline is the mold at the top of each layer. Check it sits inside every block before initialling the CS-003 §7.2 review step.</p>
    <h3>Blanks to cut</h3>
    ${stackTable(p)}
    ${whyTheseBoards(p)}
  </div>`;
}
