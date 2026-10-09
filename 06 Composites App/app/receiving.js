"use strict";
/* receiving.js — the receiving desk: many things, onto many shelves, in one pass.
 *
 * WHY THIS IS NOT A MODAL. The old flow (invReceive, in inventory.js) took ONE
 * destination shelf for a whole delivery, offered three blank rows of
 * class / name / vendor lot, and had no quantity, no cost, no expiry and no
 * undo. A mixed Easy Composites order lands as rolls AND jugs AND consumables
 * that belong on three different shelves, so the one-shelf assumption was
 * wrong for the commonest case, and the second pass to fix it never happened —
 * which is how the storage map came to claim things were somewhere they had
 * never been. And #modal .modal is capped at 640px, which is not a grid.
 *
 * WHAT IT IS INSTEAD. A fourth Inventory view: an index on the left (what is
 * on order, or what shelves exist) and a working sheet on the right. The sheet
 * is a sibling of the budget line-item grid and inherits its one hard-won
 * rule — a cell edit NEVER calls render(), because onchange fires while Tab is
 * already carrying focus and a repaint destroys the field mid-hop.
 *
 * ONE SURFACE, THREE FRAMINGS. The same grid, reframed by where you came from:
 *   toolbar        -> the desk, index in "orders" mode
 *   Incoming line  -> the desk, that whole order seeded as rows
 *   a shelf card   -> the desk, single pane, that shelf locked in
 * The third is the phone case, and it has to stay at about seven taps for two
 * items or it has failed.
 *
 * The sheet holds no records. Nothing is written until you commit, which is
 * what lets it be fast: no per-keystroke save, no id burnt on a typo.
 */

/* ---------- state ----------
   Rows live here, not in the DOM, because #main is replaced wholesale on every
   render and a Firestore snapshot can arrive mid-sentence. Every cell writes
   its value into the model on change; the DOM is never the source of truth. */
let RX = null;
let RX_PROPOSAL = null;   // frozen when the confirm opens (see rxConfirm)
let RX_UNDO = null;       // single slot, same shape as CUTS_UNDO / SHOP_UNDO

const RX_DRAFT_KEY = "feb-rx:sheet";
const RX_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/* Deliberately NOT under DRAFT_NS. draftsPending() warns on tab close whenever
   any key under that namespace exists, and clears only on post — so an
   abandoned sheet would nag on every close forever. A sheet that survives a
   reload does not need a nag; it needs an expiry. */

/* The four things a person picks from, and the two fields they set. Four
   distinct initials on purpose: f / r / h / c each select natively.
   `role` matters even though the co-location warning is gone: the cure
   buy-off's lot pickers filter on it (defaultLot), and it is what keeps a
   hardener from being offered as the resin. */
const RX_CLASSES = [
  { key: "FAB", label: "Fabric", cls: "FAB", role: "" },
  { key: "RSN:resin", label: "Resin", cls: "RSN", role: "resin" },
  { key: "RSN:hardener", label: "Hardener", cls: "RSN", role: "hardener" },
  { key: "CON", label: "Consumable", cls: "CON", role: "" },
];
function rxClassOf(k) { return RX_CLASSES.find(c => c.key === k) || RX_CLASSES[3]; }

/* Fabric and resin are tracked one physical unit per record, because "which
   roll went into this panel" is the question the lots collection exists to
   answer and a count cannot answer it. Consumables are one record carrying a
   count: nobody puts a QR label on each of fifty mixing cups. */
function rxIsTracked(clsKey) { const c = rxClassOf(clsKey); return c.cls === "FAB" || c.cls === "RSN"; }

function rxQtyNum(v) {
  const n = parseLooseMoney(v);      // refuses "1O0" rather than reading 100
  return n == null ? null : n;
}
/* How many records this one row will create, and what count each carries. */
function rxRecordCount(r) {
  const n = rxQtyNum(r.qty);
  if (!rxIsTracked(r.cls)) return { records: 1, count: n == null ? "" : n };
  if (n == null || n < 1) return { records: 1, count: "" };
  return { records: Math.floor(n), count: "" };
}
function rxTotals(rows) {
  let records = 0, lines = 0;
  const bins = new Set();
  for (const r of rows || []) {
    if (!String(r.name || "").trim()) continue;
    lines++;
    records += rxRecordCount(r).records;
    bins.add(r.bin || "");
  }
  return { records, lines, bins: bins.size };
}

function rxBlankRow(preset) {
  return {
    rid: bomLineId(),
    cls: (preset && preset.cls) || "CON",
    name: "", qty: "1", bin: (preset && preset.bin) || "",
    vendorLot: "", ehs: "", supplier: (preset && preset.supplier) || "",
    unitCost: "", expiresOn: "", matKey: "",
    buyRef: null, ...(preset || {}),
  };
}

/* ---------- opening it ---------- */

/* binId locks the sheet to one shelf and drops the index — the phone framing.
   from seeds rows from a purchase. Neither is required. */
function openReceiving(opts) {
  const o = opts || {};
  const restored = o.fresh ? null : rxDraftLoad();
  RX = restored || {
    rows: [], supplier: "", receivedOn: today(), buyId: "",
    defBin: o.binId || "", lockBin: o.binId || "", index: "orders",
  };
  if (o.binId) { RX.defBin = o.binId; RX.lockBin = o.binId; }
  if (o.buyId) rxSeedFromOrder(o.buyId, true);
  if (!RX.rows.length) RX.rows.push(rxBlankRow({ bin: RX.defBin, supplier: RX.supplier }));
  /* Arriving from a scanned-but-unknown EH&S tag (scanToOpen's onUnknown):
     the code lands in the tag cell of a fresh chemical row, and the person
     types what the container actually is. Resin is the commonest guess and a
     wrong one is fixed in a normal cell, per the house prefill rule. */
  let focusRid = RX.rows[0].rid;
  if (o.ehs) {
    const code = typeof ehsNorm === "function" ? ehsNorm(o.ehs) : String(o.ehs);
    let row = RX.rows.find(r => !String(r.name || "").trim() && !String(r.ehs || "").trim());
    if (!row) { row = rxBlankRow({ bin: RX.defBin, supplier: RX.supplier }); RX.rows.push(row); }
    row.cls = "RSN:resin";
    row.ehs = code;
    focusRid = row.rid;
    rxDraftSave();
  }
  view = { ...view, tab: "inventory", invView: "desk", mode: "list", id: null, edit: false };
  render();
  rxFocus(focusRid, "name");
}

/* Every open line of a purchase becomes a row, prefilled with what the team
   already typed when they bought it. This is the answer to "no import, no
   paste" that costs nobody anything: it is our own recorded data, not a
   foreign spreadsheet. The old flow could only ever take ONE line per modal
   trip, so a twelve-line order was twelve trips. */
function rxSeedFromOrder(buyId, silent) {
  const b = recById("budget", buyId);
  if (!b) return;
  RX.buyId = buyId;
  if (!RX.supplier) RX.supplier = b.source || "";
  const open = invIncoming().filter(x => x.buy.id === buyId);
  for (const { line, left } of open) {
    const each = buyLineEach(line);
    RX.rows.push(rxBlankRow({
      cls: rxGuessClass(line.desc),
      name: String(line.desc || ""),
      qty: String(left != null && left > 0 ? left : (line.qty || "1")),
      bin: RX.defBin,
      supplier: b.source || "",
      unitCost: each == null ? "" : String(each),
      buyRef: { buyId, lineId: line.lineId },
    }));
  }
  if (!silent) { rxDraftSave(); render(); }
}

/* A guess, never a mode. Same rule fillLinesFromReceipt states: a wrong guess
   is fixed by typing in a normal cell, and if this function were deleted every
   row would simply default to Consumable and the sheet would still work. */
function rxGuessClass(desc) {
  const d = String(desc || "").toLowerCase();
  if (/hardener|at30|at19|206\b/.test(d)) return "RSN:hardener";
  if (/resin|epoxy|in2|xcr|105\b/.test(d)) return "RSN:resin";
  if (/twill|carbon|fibre|fiber|glass|kevlar|cloth|gsm|weave|biax/.test(d)) return "FAB";
  return "CON";
}

/* ---------- the draft ---------- */
function rxDraftSave() {
  try {
    if (!RX || !RX.rows.some(r => String(r.name || "").trim())) { localStorage.removeItem(RX_DRAFT_KEY); return; }
    localStorage.setItem(RX_DRAFT_KEY, JSON.stringify({ at: Date.now(), rx: RX }));
  } catch (e) { /* a full or blocked localStorage must never break typing */ }
}
function rxDraftLoad() {
  try {
    const raw = localStorage.getItem(RX_DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.rx || !Array.isArray(d.rx.rows)) return null;
    // A sheet nobody came back to inside a day is abandoned, not in progress.
    if (!d.at || Date.now() - d.at > RX_DRAFT_MAX_AGE_MS) { localStorage.removeItem(RX_DRAFT_KEY); return null; }
    return d.rx;
  } catch (e) { return null; }
}
function rxDraftClear() { try { localStorage.removeItem(RX_DRAFT_KEY); } catch (e) {} }

/* ---------- row edits ----------
   NO render() in here, on purpose. onchange fires while Tab is already moving
   focus to the next cell, and a whole-page repaint destroys that field
   mid-hop: the grid becomes untabbable. The three things a row edit can change
   — its record count, the running total, and whether the Expires column is
   needed at all — are patched in place instead. Only the last of those can
   change the table's shape, and only that one repaints. */
function rxRow(rid) { return RX && RX.rows.find(r => r.rid === rid); }

function rxUpd(rid, key, val) {
  const r = rxRow(rid);
  if (!r) return;
  const hadCols = rxCols();
  r[key] = val;
  if (key === "bin") RX.defBin = val;          // later rows follow the shelf you just set
  if (key === "supplier") RX.supplier = val;
  if (key === "name" && !r.matKey) rxInferFromName(r);
  if (key === "expiresOn") r.expiryAi = false;   // a person typed it: it is theirs now
  rxDraftSave();
  const nowCols = rxCols();
  if (hadCols.join() !== nowCols.join()) { renderSoonKeepFocus(); return; }
  rxRefresh(rid);
}
/* The live half: while a quantity is being typed the fan-out number moves,
   with no save and no repaint. Type 3 next to a fabric and "3 records" appears
   before you finish the keystroke — the surprise is spent here, in the grid,
   not in a confirm dialog forty rows later. */
function rxLive(rid) {
  const r = rxRow(rid);
  if (!r) return;
  const q = (document.getElementById("rxq-" + rid) || {}).value;
  rxPaintFan(rid, { ...r, qty: q });
}
function rxPaintFan(rid, r) {
  const el = document.getElementById("rxf-" + rid);
  if (!el) return;
  el.textContent = rxFanText(r);
  el.title = rxFanTitle(r);
  el.className = "rx-fan" + (rxRecordCount(r).records > 1 && rxFanText(r) ? " many" : "");
}
function rxRefresh(rid) {
  if (rid) { const r = rxRow(rid); if (r) rxPaintFan(rid, r); }
  const t = rxTotals(RX.rows);
  const tot = document.getElementById("rx-total");
  if (tot) tot.innerHTML = rxTotalText(t);
  const btn = document.getElementById("rx-commit");
  if (btn) btn.textContent = t.records ? `Review ${t.records} record${t.records === 1 ? "" : "s"}` : "Nothing to add yet";
}
function rxTotalText(t) {
  if (!t.lines) return `<span class="muted">Nothing typed yet.</span>`;
  return `<b>${t.lines}</b> line${t.lines === 1 ? "" : "s"} · <b>${t.records}</b> record${t.records === 1 ? "" : "s"}`
    + (RX.lockBin ? "" : ` · ${t.bins} ${t.bins === 1 ? "shelf" : "shelves"}`);
}

/* A name that matches something already on a shelf brings its own facts with
   it: the 40th roll of 195 Twill should not be retyped. Only ever fills a
   BLANK cell — what the user typed always wins, the same rule partBomPick
   follows. */
function rxInferFromName(r) {
  const name = String(r.name || "").trim().toLowerCase();
  if (!name) return;
  const prior = (DB.lots || []).find(o => String(o.name || "").trim().toLowerCase() === name);
  if (prior) {
    if (!r.matKey && prior.matKey) r.matKey = prior.matKey;
    if (!r.supplier && prior.supplier) r.supplier = prior.supplier;
    if (!r.unitCost && typeof prior.unitCost === "number") r.unitCost = String(prior.unitCost);
  }
  /* The materials alias table is the second source: a human wrote "at30
     means AT30" there, so it fills a still-blank matKey the same way a prior
     lot would. It carries no safety fields, so nothing here can guess one. */
  if (!r.matKey && typeof matForName === "function") {
    const mat = matForName(name);
    if (mat) r.matKey = mat.matKey;
  }
  /* The restock table knows what a material IS — that acetone is flammable and
     AT30 is a hardener — in a way a delivery never does. Inference runs from
     the rule, never from pattern-matching the name: a wrong hazard guessed out
     of a string files a silent false all-clear on the flammables check. */
  const rule = r.matKey && typeof restockRuleFor === "function" ? restockRuleFor(r.matKey) : null;
  if (rule) {
    if (!r.supplier && rule.supplier) r.supplier = rule.supplier;
    if (rule.role && rxClassOf(r.cls).cls === "RSN") r.cls = "RSN:" + rule.role;
  }
}

function rxAdd(afterRid) {
  const seed = rxRow(afterRid);
  const row = rxBlankRow({
    cls: seed ? seed.cls : "CON",
    bin: seed ? seed.bin : RX.defBin,
    supplier: RX.supplier,
  });
  const i = seed ? RX.rows.indexOf(seed) + 1 : RX.rows.length;
  RX.rows.splice(i, 0, row);
  rxDraftSave();
  render();
  rxFocus(row.rid, "name");
  return row.rid;
}
function rxDel(rid) {
  const i = RX.rows.findIndex(r => r.rid === rid);
  if (i < 0) return;
  RX.rows.splice(i, 1);
  if (!RX.rows.length) RX.rows.push(rxBlankRow({ bin: RX.defBin, supplier: RX.supplier }));
  rxDraftSave();
  render();
}
function rxFocus(rid, cell) {
  const el = document.getElementById(`rx${cell === "name" ? "n" : cell}-${rid}`);
  if (el && el.focus) el.focus();
}

/* ---------- the keyboard ----------
   Enter is the engine: commit this row, open the next one already carrying the
   class, shelf and supplier, and put the caret in its name. A stock-take row
   is then name, Tab, count, Enter.

   The arrow keys are a deliberate local exception to the house pattern, where
   a tab-level handler bails inside an INPUT or SELECT. In the class cell they
   must NOT change the value: that cell decides how many records the row makes
   and which safety warnings apply, and a spreadsheet reflex silently turning a
   fabric row into a resin one is the worst kind of wrong. Letter type-ahead
   still works, because that is how you pick a class without the mouse. */
function rxKeydown(e) {
  if (!RX || !e || view.tab !== "inventory" || view.invView !== "desk") return null;
  if (document.getElementById("modal") && String((document.getElementById("modal") || {}).innerHTML || "").trim()) {
    if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return null;
  }
  const t = e.target || {};
  const id = String(t.id || "");
  const rid = id.startsWith("rx") && id.includes("-") ? id.slice(id.indexOf("-") + 1) : "";

  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    if (e.preventDefault) e.preventDefault();
    rxConfirm();
    return "confirm";
  }
  if (!rid || !rxRow(rid)) return null;

  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    if (e.preventDefault) e.preventDefault();
    const r = rxRow(rid);
    const isLast = RX.rows[RX.rows.length - 1].rid === rid;
    if (isLast && !String(r.name || "").trim()) return "noop";   // no runaway blank rows
    rxAdd(rid);
    return "addrow";
  }
  if ((e.key === "ArrowDown" || e.key === "ArrowUp")) {
    const isSelect = String(t.tagName || "").toUpperCase() === "SELECT";
    const step = e.key === "ArrowDown" ? 1 : -1;
    // In a text cell only jump when the caret is already at the end/start, so
    // arrows still edit inside a value.
    if (!isSelect && !e.altKey) {
      const v = String(t.value || "");
      const at = typeof t.selectionStart === "number" ? t.selectionStart : v.length;
      if (step > 0 && at < v.length) return null;
      if (step < 0 && at > 0) return null;
    }
    const i = RX.rows.findIndex(r => r.rid === rid);
    const next = RX.rows[i + step];
    if (!next) return null;
    if (e.preventDefault) e.preventDefault();
    const cell = id.slice(0, id.indexOf("-"));
    const el = document.getElementById(cell + "-" + next.rid);
    if (el && el.focus) el.focus();
    return "move";
  }
  if (e.key === "Backspace" && (e.metaKey || e.ctrlKey)) {
    if (e.preventDefault) e.preventDefault();
    rxDel(rid);
    return "delrow";
  }
  return null;
}
document.addEventListener("keydown", rxKeydown);

/* ---------- paste ----------
   Somebody will copy a block out of an order confirmation email and hit
   Cmd-V, and a grid that swallows forty rows into one cell is the moment they
   go back to a spreadsheet. This is a PREFILL, never a mode — the same rule
   fillLinesFromReceipt states: a wrong read is fixed by typing in a normal
   cell, and if this handler were deleted every row would still work by hand.
   Columns are read positionally from whatever the paste happens to have:
   name first, then a number, then anything that looks like a lot code. */
function rxPaste(e, rid) {
  const cd = e && (e.clipboardData || window.clipboardData);
  const text = cd && cd.getData ? cd.getData("text") : "";
  if (!text || (text.indexOf("\n") < 0 && text.indexOf("\t") < 0)) return null;  // a plain word: let the browser paste it
  if (e.preventDefault) e.preventDefault();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const start = RX.rows.findIndex(r => r.rid === rid);
  const made = [];
  lines.forEach((line, k) => {
    const cells = line.split("\t").map(c => c.trim());
    const name = cells[0] || "";
    if (!name) return;
    const qty = cells.find((c, i) => i > 0 && rxQtyNum(c) != null);
    const row = rxBlankRow({
      cls: rxGuessClass(name), name,
      qty: qty != null ? String(rxQtyNum(qty)) : "1",
      bin: RX.defBin, supplier: RX.supplier,
    });
    rxInferFromName(row);
    made.push(row);
    // The row the caret was in gets overwritten by the first pasted line, so a
    // paste into an empty sheet does not leave a blank row above the block.
    if (k === 0 && start >= 0 && !String(RX.rows[start].name || "").trim()) RX.rows.splice(start, 1, row);
    else RX.rows.splice(start >= 0 ? start + k : RX.rows.length, 0, row);
  });
  rxDraftSave();
  render();
  toast(`${made.length} line${made.length === 1 ? "" : "s"} pasted — check the class and the shelf on each.`);
  return made.length;
}

/* ---------- ✨ from a packing slip ----------
   The paste path above, fed by a photo instead of an email. parsePackingSlip
   reads name, shipped quantity, and the lot and expiry where they are printed;
   everything the app already knows better (class, matKey, supplier, cost)
   comes from rxGuessClass and rxInferFromName exactly as for a pasted line, so
   the model never decides what a material IS. Rows land in the same grid and
   go through the same review. The photo is only input: it is deleted once
   read, so no record points at it.

   An expiry the model read carries expiryAi until a person edits that cell,
   and the lot is then stamped "vendor label (AI read)" rather than "vendor
   label", so a date nobody looked at stays distinguishable from one somebody
   typed off the jug. */
function rxFromSlip() {
  if (aiJobBusy()) return;
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*,application/pdf";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    aiJobStart("slip", "Uploading the packing slip…");
    let up = null;
    try {
      up = await fb.upload(`receiving/rx-${Date.now()}/${f.name || "slip.jpg"}`, f);
      aiJobPhase("Reading the slip…");
      const out = await fb.call("parsePackingSlip", { path: up.path });
      const n = rxAddSlipRows(out);
      if (n) aiJobDone(`${n} line${n === 1 ? "" : "s"} read from the slip. Check the class, the shelf and the count on each.`);
      else aiJobFail("Couldn't find any lines on that slip. Type them in, or paste from the order email.");
    } catch (e) {
      aiJobFail(aiErrorText(e, "Packing slip reading isn't available right now. Type the lines in, or paste them from the order email."));
    } finally {
      if (up) fb.deleteFile(up.path);
    }
  };
  inp.click();
}
/* Split out so the test harness can feed it an answer without a camera.
   Returns how many rows it added; the caller reports it. */
function rxAddSlipRows(out) {
  const got = (out && out.rows) || [];
  if (!got.length) return 0;
  if (!String(RX.supplier || "").trim() && out.supplier) RX.supplier = out.supplier;
  const made = got.map(g => {
    const row = rxBlankRow({
      cls: rxGuessClass(g.name), name: g.name,
      qty: g.qty && rxQtyNum(g.qty) != null ? String(rxQtyNum(g.qty)) : "1",
      vendorLot: g.vendorLot || "", expiresOn: g.expiresOn || "", expiryAi: !!g.expiresOn,
      bin: RX.defBin, supplier: RX.supplier,
    });
    rxInferFromName(row);
    return row;
  });
  // Blank rows give way to the slip, same as a paste into an empty sheet.
  RX.rows = RX.rows.filter(r => String(r.name || "").trim()).concat(made);
  rxDraftSave();
  render();
  return made.length;
}

/* ---------- which columns exist ----------
   Asked of the schema rather than re-derived, because SHOP_FIELDS_BY_CLASS is
   already the one place that answers "does this class have this field" and a
   second copy would drift. Fabric has no expiry and no hazard on purpose. */
function rxCols() {
  const spec = shopSpec("lots");
  const classes = [...new Set((RX.rows || []).map(r => rxClassOf(r.cls).cls))];
  const any = (key) => classes.some(c => shopFieldApplies(spec, c, key));
  const out = ["cls", "name", "qty"];
  if (!RX.lockBin) out.push("bin");
  out.push("vendorLot");
  if (any("ehsBarcode")) out.push("ehs");
  if (any("expiresOn")) out.push("expiresOn");
  out.push("unitCost");
  return out;
}

/* ---------- render ---------- */

function renderInvDesk() {
  if (!RX) openReceivingState();
  const cols = rxCols();
  const single = !!RX.lockBin;
  return `
  ${rxUndoBar()}
  <div class="toolbar no-print">
    <button class="ib" onclick="rxLeave()">${icon("chevronLeft", 16)} ${single ? esc(rxBinName(RX.lockBin)) : "Storage map"}</button>
    <span style="flex:1"></span>
    <span class="tny muted nocaps" id="rx-total">${rxTotalText(rxTotals(RX.rows))}</span>
    <button class="primary ib" id="rx-commit" onclick="rxConfirm()">${esc(rxCommitLabel())}</button>
  </div>
  ${rxBusyLine()}
  ${single ? "" : rxIndexHtml()}
  <div class="card rxsheet">
    <h2>${single ? "Add to this shelf" : "Receiving desk"}</h2>
    ${rxHeadHtml()}
    ${rxGridHtml(cols)}
    <div class="rxfoot no-print">
      <button class="sm" onclick="rxAdd()">+ line</button>
      ${aiOn() ? `<button class="sm" onclick="rxFromSlip()" title="Photograph the packing slip; its lines become rows you check" ${aiJobBusy() ? "disabled" : ""}>${aiJobBusy("slip") ? "✨ Reading…" : "✨ From packing slip"}</button>` : ""}
      <span class="kbdhint tny muted nocaps">Enter starts the next line · Ctrl+Enter to review · paste a block from an email</span>
    </div>
  </div>`;
}

function rxCommitLabel() {
  const t = rxTotals(RX.rows);
  return t.records ? `Review ${t.records} record${t.records === 1 ? "" : "s"}` : "Nothing to add yet";
}
function openReceivingState() {
  RX = rxDraftLoad() || { rows: [], supplier: "", receivedOn: today(), buyId: "", defBin: "", lockBin: "", index: "orders" };
  if (!RX.rows.length) RX.rows.push(rxBlankRow({}));
}
function rxBinName(id) {
  const b = shopById("items", id);
  return (b && (b.name || b.id)) || id || "";
}

/* Somebody else is receiving right now. Not a lock and not a warning — three
   people typing different shelves is the normal case, and coordinating them
   would cost more than it saves. But two people logging the SAME box is a real
   and silent failure, found a month later by a stock walk turning up two of
   everything. So the fact goes on screen and is left there. */
function rxBusyLine() {
  const mine = myEmail();
  const cut = Date.now() - 60 * 60 * 1000;
  const others = new Map();
  for (const o of DB.lots || []) {
    if (!o.createdBy || o.createdBy === mine) continue;
    const t = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
    if (!t || t < cut) continue;
    others.set(o.createdBy, (others.get(o.createdBy) || 0) + 1);
  }
  if (!others.size) return "";
  const bits = [...others.entries()].map(([who, n]) => `${esc(String(who).split("@")[0])} added ${n}`);
  return `<div class="rxbusy tny muted no-print">In the last hour: ${bits.join(" · ")}. Same delivery?</div>`;
}

function rxHeadHtml() {
  const bins = invActiveBins();
  return `<div class="rxhead">
    <div class="f"><label>Supplier</label>
      <input id="rx-sup" list="rx-suppliers" value="${esc(RX.supplier)}"
             onchange="RX.supplier=this.value;rxDraftSave()"></div>
    <div class="f"><label>Arrived</label>
      <input id="rx-on" type="date" value="${esc(RX.receivedOn)}"
             onchange="RX.receivedOn=this.value;rxDraftSave()"></div>
    ${RX.lockBin ? "" : `<div class="f"><label>New lines land on</label>
      <select id="rx-defbin" onchange="RX.defBin=this.value;rxDraftSave()">
        <option value="">— no shelf yet —</option>
        ${bins.map(b => `<option value="${esc(b.id)}" ${RX.defBin === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
      </select></div>`}
    <datalist id="rx-suppliers">${rxSupplierOptions()}</datalist>
    <datalist id="rx-names">${rxNameOptions()}</datalist>
  </div>`;
}
function rxSupplierOptions() {
  const seen = new Set();
  for (const o of DB.lots || []) if (o.supplier) seen.add(String(o.supplier));
  if (typeof restockRules === "function") for (const r of restockRules()) if (r.supplier) seen.add(r.supplier);
  return [...seen].sort((a, b) => a.localeCompare(b)).map(x => `<option value="${esc(x)}"></option>`).join("");
}
function rxNameOptions() {
  const seen = new Set();
  for (const o of DB.lots || []) if (o.name) seen.add(String(o.name));
  if (typeof restockRules === "function") for (const r of restockRules()) if (r.label) seen.add(r.label);
  return [...seen].sort((a, b) => a.localeCompare(b)).map(x => `<option value="${esc(x)}"></option>`).join("");
}

const RX_HEAD = { cls: "Class", name: "What is it", qty: "How many", bin: "Shelf",
                  vendorLot: "Vendor lot", ehs: "EH&S tag", expiresOn: "Expires", unitCost: "$ each" };

function rxGridHtml(cols) {
  return `<table class="sub rxgrid">
    <thead><tr>${cols.map(c => `<th class="rxc-${c}">${esc(RX_HEAD[c])}</th>`).join("")}<th class="rxc-x"></th></tr></thead>
    <tbody>${RX.rows.map(r => rxRowHtml(r, cols)).join("")}</tbody>
  </table>`;
}

/* The readout has to fit BESIDE the count input, on one line, in a cell
   deliberately kept narrow so the material name keeps its width. "1 record of
   12" did not: it wrapped to three lines and the column read as broken rather
   than as information. Short forms, and the long sentence moves to the title. */
function rxFanText(r) {
  if (!String(r.name || "").trim()) return "";   // an unnamed line makes nothing, and should not say otherwise
  const { records, count } = rxRecordCount(r);
  if (rxIsTracked(r.cls)) return records === 1 ? "1 record" : records + " records";
  return count === "" || Number(count) === 1 ? "1 record" : "1 of " + count;
}
/* What the short form means, spelled out for hover and for screen readers —
   "1 of 3" is compact, not self-explaining. */
function rxFanTitle(r) {
  if (!String(r.name || "").trim()) return "";
  const { records, count } = rxRecordCount(r);
  if (rxIsTracked(r.cls)) {
    return records === 1
      ? "One record: this class is tracked one container per record."
      : `${records} records, one per container: this class is tracked one container per record.`;
  }
  return count === "" || Number(count) === 1
    ? "One record."
    : `One record carrying a count of ${count}.`;
}

function rxRowHtml(r, cols) {
  const spec = shopSpec("lots");
  const cls = rxClassOf(r.cls).cls;
  const many = rxRecordCount(r).records > 1;
  const cell = {
    cls: `<select id="rxcls-${r.rid}" aria-label="Class" onchange="rxUpd('${r.rid}','cls',this.value)">
        ${RX_CLASSES.map(c => `<option value="${c.key}" ${r.cls === c.key ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
      </select>`,
    name: `<input id="rxn-${r.rid}" list="rx-names" value="${esc(r.name)}" placeholder="what is it"
        aria-label="What is it" onpaste="rxPaste(event,'${r.rid}')"
        onchange="rxUpd('${r.rid}','name',this.value)">`,
    qty: `<input id="rxq-${r.rid}" class="bl-n" inputmode="numeric" value="${esc(r.qty)}" aria-label="How many"
        oninput="rxLive('${r.rid}')" onchange="rxUpd('${r.rid}','qty',this.value)"><span class="rx-fan ${many ? "many" : ""}" id="rxf-${r.rid}" title="${esc(rxFanTitle(r))}">${esc(rxFanText(r))}</span>`,
    bin: `<select id="rxbin-${r.rid}" aria-label="Shelf" onchange="rxUpd('${r.rid}','bin',this.value)">
        <option value="">— none yet —</option>
        ${invActiveBins().map(b => `<option value="${esc(b.id)}" ${r.bin === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
      </select>`,
    vendorLot: `<input id="rxv-${r.rid}" value="${esc(r.vendorLot)}" placeholder="lot #" aria-label="Vendor lot"
        onchange="rxUpd('${r.rid}','vendorLot',this.value)">`,
    /* The UC EH&S tag going onto (or already on) this container. Typed, fed
       by a keyboard-mode scanner, or camera-scanned with the button — which
       stays open across codes, so a three-jug line is three scans into one
       cell. A row fanning out to several containers takes several codes,
       space- or comma-separated, dealt to the records in order. */
    ehs: shopFieldApplies(spec, cls, "ehsBarcode")
      ? `<span class="rx-ehs"><input id="rxh-${r.rid}" value="${esc(r.ehs || "")}" placeholder="tag code" aria-label="EH&S tag"
          autocapitalize="characters" autocomplete="off" spellcheck="false"
          onchange="rxUpd('${r.rid}','ehs',this.value)">${typeof scanSupported === "function" && scanSupported()
            ? `<button type="button" class="sm ib" tabindex="-1" title="Scan the tag(s) with the camera" onclick="rxScanEhs('${r.rid}')">${icon("scan", 13)}</button>` : ""}</span>`
      : `<span class="rx-na">—</span>`,
    expiresOn: shopFieldApplies(spec, cls, "expiresOn")
      ? `<input id="rxe-${r.rid}" type="date" value="${esc(r.expiresOn)}" aria-label="Expires"
          onchange="rxUpd('${r.rid}','expiresOn',this.value)">`
      : `<span class="rx-na">—</span>`,
    unitCost: `<input id="rxu-${r.rid}" class="bl-n" inputmode="decimal" value="${esc(r.unitCost)}" aria-label="Cost each"
        onchange="rxUpd('${r.rid}','unitCost',this.value)">`,
  };
  return `<tr id="rxr-${r.rid}">
    ${cols.map(c => `<td class="rxc-${c}" data-label="${esc(RX_HEAD[c] || "")}">${cell[c]}</td>`).join("")}
    <td class="rxc-x"><button class="danger ib sm" tabindex="-1" title="Remove this line"
      onclick="rxDel('${r.rid}')">${icon("trash", 13)}</button></td>
  </tr>`;
}

/* The index. Orders mode is the existing Incoming query; shelves mode is the
   stock-take framing, where the organising axis is the shelf you are standing
   at rather than the order you are reconciling. Same grid either way — the
   mode changes what you read FROM, never how you type. */
/* A strip above the sheet rather than a pane beside it. Measured: the split
   left the grid 784px at 1440 and 490px at 1100, which eight columns and a
   material name cannot live in — so the sheet was overflowing sideways at the
   design width, and the only fixes available were hiding the columns people
   came to fill in. Full width instead, and the index reads as what it is: a
   thing you consult now and then, not a thing you look at while typing. It is
   also the shape Incoming already has on the storage map. */
function rxIndexHtml() {
  const m = RX.index === "shelves" ? "shelves" : "orders";
  const open = RX.index ? invIncoming().length : 0;
  return `<div class="card rxindex no-print">
    <div class="toolbar">
      <button class="ib ${m === "orders" ? "primary" : ""}" onclick="RX.index='orders';render()">On order${open ? " · " + open : ""}</button>
      <button class="ib ${m === "shelves" ? "primary" : ""}" onclick="RX.index='shelves';render()">Shelves</button>
      <span style="flex:1"></span>
      <button class="ib" onclick="RX.index = RX.index ? '' : 'orders'; render()">${RX.index ? "Hide" : "Show"}</button>
    </div>
    ${RX.index ? `<div class="rxindex-body">${m === "orders" ? rxOrdersList() : rxShelvesList()}</div>` : ""}
  </div>`;
}

function rxOrdersList() {
  const inc = invIncoming();
  if (!inc.length) return `<div class="tny muted">Nothing is on order — when a purchase on the Budget tab carries line items, they wait here until they turn up.</div>`;
  const byBuy = new Map();
  for (const x of inc) {
    if (!byBuy.has(x.buy.id)) byBuy.set(x.buy.id, { buy: x.buy, lines: [] });
    byBuy.get(x.buy.id).lines.push(x);
  }
  return [...byBuy.values()].map(({ buy, lines }) => `
    <div class="pgrouphd"><span class="pg-name">${esc(buy.id)}${buy.source ? " · " + esc(buy.source) : ""}</span>
      <span class="pg-n">${lines.length} open</span>
      <button class="sm" onclick="rxSeedFromOrder('${esc(buy.id)}')">Take all ${lines.length}</button></div>
    ${lines.map(({ line, left, ordered, got }) => `
      <div class="pmini rxline">
        <span class="pm-name">${esc(line.desc)}</span>
        <span class="tny muted">${got ? `${got} of ${ordered} in · ` : ""}${left} to come</span>
        <button class="sm" onclick="rxTakeLine('${esc(buy.id)}','${esc(line.lineId)}')">Take</button>
      </div>`).join("")}`).join("");
}
function rxTakeLine(buyId, lineId) {
  const b = recById("budget", buyId);
  const x = invIncoming().find(i => i.buy.id === buyId && i.line.lineId === lineId);
  if (!x) return;
  const each = buyLineEach(x.line);
  const row = rxBlankRow({
    cls: rxGuessClass(x.line.desc), name: String(x.line.desc || ""),
    qty: String(x.left || 1), bin: RX.defBin, supplier: (b && b.source) || RX.supplier,
    unitCost: each == null ? "" : String(each),
    buyRef: { buyId, lineId },
  });
  rxInferFromName(row);
  const last = RX.rows[RX.rows.length - 1];
  if (last && !String(last.name || "").trim()) RX.rows.splice(RX.rows.length - 1, 1, row);
  else RX.rows.push(row);
  if (!RX.buyId) RX.buyId = buyId;
  rxDraftSave();
  render();
  rxFocus(row.rid, "qty");
}

function rxShelvesList() {
  const idx = invIndex();
  const bins = invActiveBins();
  if (!bins.length) return `<div class="pempty muted">No storage locations yet. Make one with <b>+ Location</b> on the storage map first — a shelf has to exist before anything can live on it.</div>`;
  const bySite = new Map();
  for (const b of bins) {
    const s = b.site || "Unassigned";
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s).push(b);
  }
  const order = [...INV_SITES.filter(s => bySite.has(s)), ...[...bySite.keys()].filter(s => !INV_SITES.includes(s))];
  return order.map(s => `
    <div class="pgrouphd"><span class="pg-name">${esc(s)}</span><span class="pg-n">${bySite.get(s).length}</span></div>
    ${bySite.get(s).map(b => {
      const n = invBucketCount(idx.by.get(b.id) || invEmptyBucket());
      const age = invDaysSince(b.walkedAt);
      return `<button class="pitem ${RX.defBin === b.id ? "sel" : ""}" onclick="rxPickShelf('${esc(b.id)}')">
        <span class="pi-name">${esc(b.name || b.id)}</span>
        <span class="pi-sub tny muted">${n} on it${age == null ? " · never confirmed" : ` · walked ${age}d ago`}</span>
      </button>`;
    }).join("")}`).join("");
}
function rxPickShelf(binId) {
  RX.defBin = binId;
  // Rows nobody has given a shelf follow the one you just picked; rows already
  // placed are left alone, because a shelf someone typed is a decision.
  for (const r of RX.rows) if (!r.bin) r.bin = binId;
  rxDraftSave();
  render();
  const blank = RX.rows.find(r => !String(r.name || "").trim());
  rxFocus((blank || RX.rows[RX.rows.length - 1]).rid, "name");
}

function rxLeave() {
  const t = rxTotals(RX.rows);
  const to = RX.lockBin;
  if (!t.lines) { rxDraftClear(); RX = null; }
  else toast(`${t.lines} line${t.lines === 1 ? "" : "s"} kept. Reopen Receive to finish them.`, "info");
  view = { ...view, tab: "inventory", invView: "map", mode: to ? "detail" : "list", id: to || null };
  render();
}

/* ---------- commit ----------
 *
 * The shape is stock.js's, which is the app's only other multi-record write and
 * earned these rules the hard way: freeze the proposal when the confirm opens
 * (a Firestore snapshot can re-render at any moment, and the thing confirmed
 * must be the thing written), read every checkbox BEFORE the first await (an
 * offline allocId opens its own modal over this one), re-validate against live
 * data, and abort WHOLE if the world moved — a half-written delivery is worse
 * than none.
 */
function rxConfirm() {
  if (!RX) return;
  const rows = RX.rows.filter(r => String(r.name || "").trim());
  if (!rows.length) { toast("Nothing to add — name at least one thing.", "error"); return; }

  const bad = rows.find(r => rxIsTracked(r.cls) && rxQtyNum(r.qty) != null && rxQtyNum(r.qty) > 50);
  if (bad) {
    toast(`${bad.name}: ${rxQtyNum(bad.qty)} separately labelled units is more than one delivery. Split it, or make it a consumable with a count.`, "error");
    rxFocus(bad.rid, "qty");
    return;
  }
  RX_PROPOSAL = {
    receivedOn: RX.receivedOn || today(),
    supplier: RX.supplier || "",
    rows: JSON.parse(JSON.stringify(rows)),
  };
  openModal(rxConfirmHtml());
}

function rxConfirmHtml() {
  const p = RX_PROPOSAL;
  const byBin = new Map();
  p.rows.forEach((r, i) => {
    const k = r.bin || "";
    if (!byBin.has(k)) byBin.set(k, []);
    byBin.get(k).push({ r, i });
  });
  const total = p.rows.reduce((n, r) => n + rxRecordCount(r).records, 0);
  const warn = rxProposedWarnings(p);
  return `<h2>Create ${total} record${total === 1 ? "" : "s"}?</h2>
  <p class="muted tny">Fabric and resin become one record and one QR label each, so 3 rolls of one cloth is 3 records.
    Consumables become one record carrying a count. Untick anything that did not actually turn up.</p>
  <div class="lblist">
    ${[...byBin.entries()].map(([bin, items]) => `
      <div class="pgrouphd"><span class="pg-name">${bin ? esc(rxBinName(bin)) : "No shelf yet"}</span>
        <span class="pg-n">${items.reduce((n, x) => n + rxRecordCount(x.r).records, 0)}</span></div>
      ${items.map(({ r, i }) => `<label class="cutrow">
        <input type="checkbox" id="rxk-${i}" checked>
        <span><b>${esc(r.name)}</b> ×${esc(r.qty || "1")} → ${esc(rxFanText(r))}
          <span class="tny muted">${esc(rxClassOf(r.cls).label)}${r.vendorLot ? " · lot " + esc(r.vendorLot) : ""}${rxEhsTokens(r).length ? " · EH&amp;S " + esc(rxEhsTokens(r).join(" ")) : ""}${r.buyRef ? " · from " + esc(r.buyRef.buyId) : ""}</span></span>
      </label>`).join("")}`).join("")}
  </div>
  ${warn.map(w => `<div class="warn">${icon("warning", 14)} ${esc(w)}</div>`).join("")}
  ${p.rows.some(r => !r.bin) ? `<p class="muted tny">Lines with no shelf land in <b>No location</b> on the storage map, where they can be put away later.</p>` : ""}
  <p class="muted tny">All dated ${esc(p.receivedOn)}, sealed. Labels are queued for printing, not printed now.</p>
  <div class="foot">
    <button onclick="closeModal()">Back to the sheet</button>
    <button class="primary" onclick="rxSubmit()">Create ${total} record${total === 1 ? "" : "s"}</button>
  </div>`;
}

/* The chemical-storage checks, run against what each shelf WOULD hold once
   this delivery lands — so a problem is caught before the write instead of
   turning up as a red chip on the map afterwards. This is only possible at
   all because the sheet captures hazard, which the old modal never asked
   for. */
/* The EH&S codes a row carries, normalised, in the order they will be dealt
   to the row's records. Classes outside the campus chemical system get none
   even if something was typed — the cell renders as — for them anyway. */
function rxEhsTokens(r) {
  if (!shopFieldApplies(shopSpec("lots"), rxClassOf(r.cls).cls, "ehsBarcode")) return [];
  return String(r.ehs || "").split(/[\s,;]+/).map(ehsNorm).filter(Boolean);
}

/* Camera-scan tags into one line's cell, sticky: the camera stays open, each
   new tag appends, a repeat of one already in the cell is said and skipped.
   A code that resolves to an existing record is refused by accept() — that
   tag is on a jug the app already tracks, not on this delivery. */
function rxScanEhs(rid) {
  openScan({
    title: "Scan EH&S tags",
    hint: "Point the camera at the UC sticker on each container for this line. The camera stays open.",
    sticky: true,
    accept: () => false,
    onUnknown: code => {
      const r = rxRow(rid);
      if (!r) return;
      const tags = String(r.ehs || "").split(/[\s,;]+/).filter(Boolean);
      if (tags.some(t => ehsKey(t) === ehsKey(code))) { setScanState(`${code} is already on this line.`); return; }
      tags.push(code);
      r.ehs = tags.join(" ");
      rxDraftSave();
      const el = document.getElementById("rxh-" + rid);
      if (el) el.value = r.ehs;
      rxRefresh(rid);
    },
  });
}

/* One tag, one container — checked across the sheet AND against what already
   exists, before the write, while the person holding the jug can still fix
   it. A mismatch between codes typed and records made is also said here:
   dealing 2 tags across 3 jugs silently is how the third jug ends up
   untagged in our records and nobody knows which. */
function rxEhsWarnings(rows) {
  const out = [];
  const seen = new Map();
  for (const r of rows) {
    const tags = rxEhsTokens(r);
    if (!tags.length) continue;
    const { records } = rxRecordCount(r);
    if (tags.length > records) {
      out.push(`${r.name}: ${tags.length} EH&S tags for ${records} record${records === 1 ? "" : "s"} — the extras will be dropped.`);
    } else if (tags.length > 1 && tags.length < records) {
      out.push(`${r.name}: ${tags.length} EH&S tags for ${records} records — the last ${records - tags.length} will have none.`);
    }
    for (const t of tags) {
      const k = typeof ehsKey === "function" ? ehsKey(t) : t;
      if (seen.has(k)) out.push(`EH&S tag ${t} appears on two lines (${seen.get(k)} and ${r.name}) — one tag, one container.`);
      else seen.set(k, r.name);
      const dupe = typeof ehsConflict === "function" ? ehsConflict(t, null) : null;
      if (dupe) out.push(`EH&S tag ${t} is already on ${dupe.o.name || dupe.id} (${dupe.id}) — one tag, one container.`);
    }
  }
  return out;
}

function rxProposedWarnings(p) {
  const out = [...rxEhsWarnings(p.rows)];
  const byBin = new Map();
  for (const r of p.rows) {
    if (!r.bin) continue;
    if (!byBin.has(r.bin)) byBin.set(r.bin, []);
    byBin.get(r.bin).push(r);
  }
  for (const [binId, rows] of byBin) {
    const bin = shopById("items", binId);
    if (!bin) continue;
    /* No resin+hardener co-location check — the team stores them together
       (lead decision 2026-08-28; see the matching note in invLocWarnings). */
    const flam = rows.filter(r => {
      const rule = r.matKey && typeof restockRuleFor === "function" ? restockRuleFor(r.matKey) : null;
      return rule && rule.hazard === "flammable";
    });
    if (flam.length && bin.flam !== "Yes") {
      out.push(`${flam.length} flammable item${flam.length === 1 ? "" : "s"} would land on ${rxBinName(binId)}, which is not a rated location.`);
    }
  }
  return out;
}

async function rxSubmit() {
  const p = RX_PROPOSAL;
  if (!p) return;
  /* Everything read before the first await. The offline allocId path opens its
     OWN modal over this one, and openModal replaces whatever was there —
     including the form still being read. */
  const take = p.rows.filter((r, i) => {
    const el = document.getElementById("rxk-" + i);
    return el ? !!el.checked : true;
  });
  if (!take.length) { toast("Nothing ticked — nothing created.", "info"); return; }

  // Re-validate: abort whole if the world moved while the modal was open.
  for (const r of take) {
    if (!r.bin) continue;
    const bin = shopById("items", r.bin);
    if (!bin || bin.stage === "Retired") {
      toast(`${rxBinName(r.bin)} is gone or retired — pick another shelf.`, "error");
      RX_PROPOSAL = null; closeModal(); render(); return;
    }
  }

  const today0 = p.receivedOn || today();
  const batch = "RX-" + today0 + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  // One id block per class, not one transaction per record.
  const need = new Map();
  for (const r of take) {
    const c = rxClassOf(r.cls).cls;
    need.set(c, (need.get(c) || 0) + rxRecordCount(r).records);
  }
  const pool = new Map();
  for (const [c, n] of need) {
    const ids = await allocIds("lots", c, n);
    if (ids.length < n) {
      toast(`Only ${ids.length} of ${n} ${c} IDs came back. Nothing was written — try again when you are back online.`, "error");
      RX_PROPOSAL = null; closeModal(); return;
    }
    pool.set(c, ids);
  }

  const made = [];
  for (const r of take) {
    const c = rxClassOf(r.cls);
    const { records, count } = rxRecordCount(r);
    const cost = parseLooseMoney(r.unitCost);
    const tags = rxEhsTokens(r);
    for (let k = 0; k < records; k++) {
      const id = pool.get(c.cls).shift();
      const o = {
        id, cls: c.cls, name: String(r.name).trim(), stage: "Sealed",
        receivedOn: today0, location: r.bin || "", createdBy: myEmail(), rxBatch: batch,
      };
      if (c.role) o.role = c.role;
      if (r.matKey) o.matKey = r.matKey;
      if (r.vendorLot) o.vendorLot = r.vendorLot;
      if (tags[k]) o.ehsBarcode = tags[k];
      if (r.supplier || p.supplier) o.supplier = r.supplier || p.supplier;
      if (r.expiresOn && shopFieldApplies(shopSpec("lots"), c.cls, "expiresOn")) {
        o.expiresOn = r.expiresOn;
        o.expirySource = r.expiryAi ? AI_EXPIRY_SOURCE : "vendor label";
      }
      if (cost != null) { o.unitCost = cost; o.costUnit = "ea"; }
      if (!rxIsTracked(r.cls) && count !== "") { o.count = Number(count); o.countedAt = today0; }
      /* n is how many of the ordered line's units THIS record accounts for.
         Received quantity is then a sum over the records that exist, exactly
         as received-ness used to be the existence of one — so Incoming stays a
         query and undo needs nothing rolled back. */
      if (r.buyRef) o.buyRef = { buyId: r.buyRef.buyId, lineId: r.buyRef.lineId, n: rxIsTracked(r.cls) ? 1 : (count === "" ? 1 : Number(count)) };
      made.push(o);
    }
  }

  for (const o of made) (DB.lots = DB.lots || []).push(o);
  try {
    if (made.length > 8 && fb.importMany) {
      await fb.importMany("lots", made);
      /* importMany does NOT call pubSync, which save() does on every write. A
         received lot gets a printed QR label, and without the public mirror
         that label scans to "no record with this ID yet" — silently, days
         later, at the shelf. publishPub is the batched mirror writer, and it
         deliberately does not go through importMany because /pub's hasOnly()
         clause rejects the updatedBy that importMany stamps. */
      if (fb.publishPub && typeof pubProjection === "function") {
        await fb.publishPub(made.map(o => pubProjection("lots", o)).filter(Boolean));
      }
    } else {
      for (const o of made) save("lots", o);
    }
  } catch (e) {
    toast("Some records may not have saved: " + (e && e.message ? e.message : e), "error");
  }

  // One write per purchase, not one per line.
  const byBuy = new Map();
  for (const o of made) {
    if (!o.buyRef) continue;
    if (!byBuy.has(o.buyRef.buyId)) byBuy.set(o.buyRef.buyId, new Map());
    const m = byBuy.get(o.buyRef.buyId);
    m.set(o.buyRef.lineId, [...(m.get(o.buyRef.lineId) || []), o.id]);
  }
  const undoLines = [];
  for (const [buyId, lines] of byBuy) {
    const bb = recById("budget", buyId);
    if (!bb) continue;
    for (const [lineId, ids] of lines) {
      const bl = (bb.lines || []).find(x => x.lineId === lineId);
      undoLines.push({ buyId, lineId, ids, prevLotRefs: bl ? (bl.lotRefs || []).slice() : [], prevReceivedOn: bl ? bl.receivedOn || "" : "" });
      if (bl) { bl.lotRefs = [...(bl.lotRefs || []), ...ids]; bl.receivedOn = today0; }
    }
    saveField("budget", bb, "lines", arr => (arr || []).map(x => {
      const ids = lines.get(x.lineId);
      return ids ? { ...x, lotRefs: [...(x.lotRefs || []), ...ids], receivedOn: today0 } : x;
    }));
  }

  RX_UNDO = {
    ids: made.map(o => o.id), n: made.length, batch,
    bins: [...new Set(made.map(o => o.location).filter(Boolean))],
    lines: undoLines,
    rows: JSON.parse(JSON.stringify(take)),
  };
  RX_PROPOSAL = null;
  closeModal();

  /* Stay in the grid. Navigating to the shelf after every batch is fine for one
     delivery and brutal across a stock-take, so the rows clear, the caret goes
     back to a fresh first cell, and the undo bar carries the links instead. */
  const keepBin = RX.defBin, keepLock = RX.lockBin, keepSup = RX.supplier, keepIdx = RX.index;
  RX = { rows: [rxBlankRow({ bin: keepBin, supplier: keepSup })], supplier: keepSup,
         receivedOn: today0, buyId: "", defBin: keepBin, lockBin: keepLock, index: keepIdx };
  rxDraftClear();
  toast(`${made.length} record${made.length === 1 ? "" : "s"} added. Labels are queued.`);
  render();
  rxFocus(RX.rows[0].rid, "name");
}

/* Undo deletes what it created and puts the sheet back, so a correction is one
   edit rather than twenty minutes of retyping. The outstanding quantities on
   the purchase need nothing rolled back: they are derived from the records, so
   deleting the records re-derives them. */
function rxUndoBar() {
  if (!RX_UNDO) return "";
  const u = RX_UNDO;
  const where = u.bins.length ? u.bins.map(b => `<button class="chip" onclick="openRecord('inventory','${esc(b)}')">${esc(rxBinName(b))}</button>`).join(" ") : "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${u.n} record${u.n === 1 ? "" : "s"} added</b> ${where}</span>
    <button class="sm" onclick="rxPrintBatch()">Print ${u.n} label${u.n === 1 ? "" : "s"}</button>
    <button class="sm" onclick="rxUndo()">Undo</button>
    <button class="sm ib" onclick="RX_UNDO=null;render()">${icon("close", 14)}</button>
  </div>`;
}
function rxPrintBatch() {
  const u = RX_UNDO;
  if (!u) return;
  const recs = u.ids.map(id => shopById("lots", id)).filter(Boolean);
  if (!recs.length) { toast("Those records are gone.", "error"); return; }
  if (typeof openLabelPreview === "function") openLabelPreview(recs.map(o => ({ coll: "lots", o })));
}
async function rxUndo() {
  const u = RX_UNDO;
  if (!u) return;
  RX_UNDO = null;
  for (const id of u.ids) {
    const i = (DB.lots || []).findIndex(o => o.id === id);
    if (i >= 0) DB.lots.splice(i, 1);
    del("lots", id);
  }
  for (const l of u.lines) {
    const bb = recById("budget", l.buyId);
    if (!bb) continue;
    const bl = (bb.lines || []).find(x => x.lineId === l.lineId);
    if (bl) { bl.lotRefs = l.prevLotRefs.slice(); bl.receivedOn = l.prevReceivedOn; }
    saveField("budget", bb, "lines", arr => (arr || []).map(x =>
      x.lineId === l.lineId ? { ...x, lotRefs: l.prevLotRefs.slice(), receivedOn: l.prevReceivedOn } : x));
  }
  if (RX && u.rows && u.rows.length) {
    RX.rows = u.rows.map(r => ({ ...r, rid: bomLineId() }));
    rxDraftSave();
  }
  toast(`${u.n} record${u.n === 1 ? "" : "s"} removed. The lines are back on the sheet${u.n ? " — bin any labels you printed" : ""}.`);
  render();
}
