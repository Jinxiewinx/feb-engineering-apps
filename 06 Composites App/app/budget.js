"use strict";
/* budget.js — the Budget tab.
   The SN5 "Budget" sheet reborn: purchase requests through their lifecycle,
   with season spend at a glance so we don't find out we're over at the worst
   possible time.

   ---------- two tracks, not one ----------
   A purchase has two separate lives and the old single status could only tell
   one of them. Submitted → Ordered → Reimbursed reads like a line but isn't:
   "Ordered" is a fact about the goods, "Reimbursed" is a fact about the money,
   and a member who fronted their card routinely has the part on the shelf
   weeks before the treasurer pays them back. Marking such a purchase
   "Reimbursed" said it had arrived; marking it "Ordered" said nobody owed
   anyone anything. Both were lies half the time.

   So the two tracks are two fields:

     status  — the goods:  Submitted → Purchased → Arrived
     reimb   — the money:  Submitted → Approved  → Reimbursed

   They advance independently. Legacy records carry only `status` with the old
   vocabulary, so both are read through buyStatus()/reimbStatus(), which map
   Ordered → Purchased and Reimbursed → Arrived + Reimbursed. Nothing is
   rewritten in place: the mapping is read-time, and a record only gains a
   `reimb` field when someone actually sets one.

   ---------- whose budget ----------
   Not everything bought on a composites run is composites' money. Somebody
   drives to McMaster for the whole team and comes back with a chassis bolt
   order; the cost is real, the reimbursement is real, and it must not eat our
   season goal. `chargedTo` names the budget it lands on. Blank (or the word
   "Composites") means ours and behaves exactly as before; anything else is
   off-budget: still listed, still costed, still owed back to whoever paid,
   still gated at $50, but out of the season total and out of every goal bar.
   Free text on purpose — the subteam names are theirs, not ours, and a fixed
   list we guessed at would be wrong in a way nobody could fix from the app. */

const BUY_STATUS = ["Submitted", "Purchased", "Arrived"];        // the goods
const REIMB_STATUS = ["Submitted", "Approved", "Reimbursed"];    // the money
// What the single-status era wrote. Read-time only; see the header.
const LEGACY_BUY_STATUS = { Ordered: "Purchased", Reimbursed: "Arrived" };
const PURPOSE = ["Manufacturing", "Testing", "Restock", "Tooling", "Other"];

function buyById(id) { return DB.budget.find(b => b.id === id); }
function saveBuy(b, field) { b = b || buyById(view.id); if (b) save("budget", b, field); }
function buyStatus(b) {
  const s = String((b && b.status) || "");
  return BUY_STATUS.includes(s) ? s : (LEGACY_BUY_STATUS[s] || "Submitted");
}
function reimbStatus(b) {
  const r = String((b && b.reimb) || "");
  if (REIMB_STATUS.includes(r)) return r;
  // The one thing the old vocabulary did say about money.
  return String((b && b.status) || "") === "Reimbursed" ? "Reimbursed" : "Submitted";
}
function buyArrived(b) { return buyStatus(b) === "Arrived"; }
function buyReimbursed(b) { return reimbStatus(b) === "Reimbursed"; }
function buyStatusClass(s) {
  return { Submitted: "Draft", Ordered: "InWork", Purchased: "InWork", Arrived: "Complete",
           Approved: "InWork", Reimbursed: "Complete" }[s] || "Draft";
}
function num(v) { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }

/* Blank means ours. "Composites" typed out means ours too — somebody will,
   and having the app treat their own team's name as a foreign budget would be
   a nasty little trap. */
function isOffBudget(b) {
  const c = String((b && b.chargedTo) || "").trim();
  return !!c && !/^composites$/i.test(c);
}
function chargedToLabel(b) {
  const c = String((b && b.chargedTo) || "").trim();
  return isOffBudget(b) ? c : "Composites";
}
// Every roll-up that answers "how much of the composites budget is gone".
function compositesBuys() { return (DB.budget || []).filter(b => !isOffBudget(b)); }
function offBudgetBuys() { return (DB.budget || []).filter(isOffBudget); }

/* FEB purchasing rule: anything over $50 needs sign-off before it's ordered
   (CS-012 §7.1). That gate belongs to the money track — it clears when the
   treasurer marks it Approved, not when somebody marks the goods ordered,
   which is what it used to do. It applies to off-budget purchases too: the
   rule is about the size of the spend, not about whose line it lands on. */
function needsApproval(b) { return num(b.cost) > 50 && reimbStatus(b) === "Submitted"; }

/* ---------- goals ----------
   Lead-set spending targets, stored in config/budget (the same lead-writable,
   roster-readable doc family the resin cure overrides use):
     { categories: [{ name, goal }], total: { base, contingency } }
   The categories REPLACE the fixed PURPOSE list in the purchase form once
   defined; old purchases keep whatever purpose string they have and roll up
   as "not in a category" if it matches nothing. The season total is its own
   number on purpose — Simon wants slack, so it does not have to equal the
   category sum — and its base/contingency split stays quiet (a tick on the
   bar and a tooltip), not a headline. */
let budgetCfgFetched = false;
window.BUDGET_CFG = window.BUDGET_CFG || null;
function fetchBudgetCfg() {
  if (budgetCfgFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  budgetCfgFetched = true;
  fb.getConfig("budget").then(d => { if (d) { window.BUDGET_CFG = d; render(); } }).catch(() => {});
}
function budgetCats() { return ((window.BUDGET_CFG || {}).categories || []).filter(c => c && c.name); }
function budgetTotal() { const t = (window.BUDGET_CFG || {}).total || {}; return { base: num(t.base), contingency: num(t.contingency) }; }
// Goals are composites goals, so off-budget purchases are not in this sum.
function catSpend(name) {
  const k = String(name || "").toLowerCase();
  return compositesBuys().filter(b => String(b.purpose || "").toLowerCase() === k).reduce((s, b) => s + num(b.cost), 0);
}
/* Members front their own money and wait; this is the treasurer's nag list.
   Off-budget purchases ARE on it — whose line the cost lands on is nothing to
   do with whether somebody is still out of pocket. */
/* Grouped by PERSON (personKey), not by the text typed into the box: "Nico"
   and "Nico Rossi" used to be two rows each owed part of one person's money. */
function owedRows() {
  const m = new Map();
  (DB.budget || []).filter(b => !buyReimbursed(b) && num(b.cost)).forEach(b => {
    const k = personKey(b, "purchaser") || "—";
    const row = m.get(k) || { key: k, ref: personRef(b, "purchaser"), amt: 0 };
    row.amt += num(b.cost);
    m.set(k, row);
  });
  return [...m.values()].sort((a, b) => b.amt - a.amt);
}

function goalBar(label, spent, goal, opts) {
  opts = opts || {};
  const pct = goal > 0 ? Math.min(100, spent / goal * 100) : 0;
  const cls = goal > 0 && spent > goal ? "over" : (goal > 0 && spent / goal >= 0.8 ? "warn" : "");
  return `<div class="goalrow ${opts.season ? "season" : ""}" ${opts.title ? `title="${opts.title}"` : ""}>
    <span class="goallabel">${esc(label)}</span>
    <span class="goaltrack"><span class="goalfill ${cls}" style="width:${pct.toFixed(1)}%"></span>${opts.tickPct != null ? `<span class="goaltick" style="left:${opts.tickPct.toFixed(1)}%"></span>` : ""}</span>
    <span class="goalnum ${cls === "over" ? "over" : ""}">$${spent.toFixed(0)} / $${goal.toFixed(0)}${cls === "over" ? " · OVER" : ""}</span>
  </div>`;
}
function budgetBoardsHtml(totalSpent) {
  const cats = budgetCats();
  const T = budgetTotal();
  const cap = T.base + T.contingency;
  if (!cats.length && !cap) {
    return isLead() ? `<div class="card no-print"><span class="muted">No budget goals set yet.</span>
      <button class="sm" onclick="openBudgetGoals()">Set budget goals</button></div>` : "";
  }
  const categorized = cats.reduce((s, c) => s + catSpend(c.name), 0);
  const loose = totalSpent - categorized;
  const owed = owedRows();
  return `<div class="budget-boards">
    <div class="card goalcard">
      <h3 class="goalhead">Budget goals ${isLead() ? `<button class="sm no-print" onclick="openBudgetGoals()">Edit goals</button>` : ""}</h3>
      ${cap ? goalBar("Season", totalSpent, cap, {
        season: true,
        // The quiet split: the tick marks where base ends and contingency begins.
        tickPct: cap > 0 ? Math.min(100, T.base / cap * 100) : null,
        title: `base $${T.base.toFixed(0)} + contingency $${T.contingency.toFixed(0)}`,
      }) : ""}
      ${cats.map(c => goalBar(c.name, catSpend(c.name), num(c.goal))).join("")}
      ${loose > 0.005 && cats.length ? `<div class="muted tny" style="margin-top:6px">$${loose.toFixed(2)} not in any category</div>` : ""}
    </div>
    ${owed.length ? `<div class="card owedcard">
      <h3>Waiting on reimbursement</h3>
      ${owed.map(o => `<div class="orow">${personChip(o.ref, { empty: "<span>—</span>" })}<b>$${o.amt.toFixed(2)}</b></div>`).join("")}
    </div>` : ""}
  </div>`;
}

/* The purchase's category is over its goal (counting this purchase): shown on
   the detail as a warning, never a block — the part still gets bought, the
   lead just finds out now instead of at the spreadsheet reckoning. */
function buyGoalWarning(b) {
  if (isOffBudget(b)) return null;   // not our money, not our goal
  const cat = budgetCats().find(c => String(c.name).toLowerCase() === String(b.purpose || "").toLowerCase());
  if (!cat || !num(cat.goal)) return null;
  const spent = catSpend(cat.name);
  if (spent <= num(cat.goal)) return null;
  return `${cat.name} is $${(spent - num(cat.goal)).toFixed(0)} over its $${num(cat.goal).toFixed(0)} goal, counting this purchase.`;
}

/* ---------- the goals editor (lead only; config rules enforce it) ---------- */
let bgDraft = null;
function openBudgetGoals() {
  bgDraft = {
    categories: budgetCats().map(c => ({ name: c.name, goal: num(c.goal) || "" })),
    total: budgetTotal(),
  };
  if (!bgDraft.categories.length) bgDraft.categories = [{ name: "", goal: "" }];
  bgModal();
}
function bgModal() {
  openModal(`<h3>Budget goals</h3>
    <p class="muted tny">Categories become the Purpose choices on new purchases. The season total is separate on purpose — it may carry slack beyond the category goals.</p>
    ${bgDraft.categories.map((c, i) => `<div class="row" style="gap:8px;margin-bottom:6px">
      <input class="bg-name" placeholder="Category" value="${esc(c.name)}">
      <input class="bg-goal" placeholder="Goal $" value="${esc(c.goal)}">
      <button class="sm" onclick="bgRmRow(${i})" title="Remove this category">✕</button>
    </div>`).join("")}
    <div class="no-print" style="margin-bottom:10px"><button class="sm" onclick="bgAddRow()">+ Add category</button></div>
    <div class="row" style="gap:8px">
      <div class="f" style="flex:1"><label>Season base ($)</label><input id="bg-base" value="${esc(bgDraft.total.base || "")}"></div>
      <div class="f" style="flex:1"><label>Contingency ($)</label><input id="bg-cont" value="${esc(bgDraft.total.contingency || "")}"></div>
    </div>
    <div class="foot"><button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="saveBudgetGoals()">Save</button></div>`);
}
function bgReadDom() {
  const names = [...document.querySelectorAll(".bg-name")];
  const goals = [...document.querySelectorAll(".bg-goal")];
  bgDraft.categories = names.map((n, i) => ({ name: n.value.trim(), goal: goals[i] ? goals[i].value : "" }));
  const base = document.getElementById("bg-base"), cont = document.getElementById("bg-cont");
  bgDraft.total = { base: base ? base.value : "", contingency: cont ? cont.value : "" };
}
function bgAddRow() { bgReadDom(); bgDraft.categories.push({ name: "", goal: "" }); bgModal(); }
function bgRmRow(i) { bgReadDom(); bgDraft.categories.splice(i, 1); if (!bgDraft.categories.length) bgDraft.categories = [{ name: "", goal: "" }]; bgModal(); }
async function saveBudgetGoals() {
  bgReadDom();
  const cfg = {
    categories: bgDraft.categories.filter(c => c.name).map(c => ({ name: c.name, goal: num(c.goal) })),
    total: { base: num(bgDraft.total.base), contingency: num(bgDraft.total.contingency) },
  };
  try {
    await fb.setConfig("budget", cfg);
    window.BUDGET_CFG = cfg;
    closeModal(); render(); toast("Budget goals saved.");
  } catch (e) { toast("Couldn't save goals: " + e.message, "error"); }
}

async function newBuy() {
  const id = await allocId("budget");
  if (!id) return;
  const b = {
    id, item: "", purchaser: signerName(), purchaserEmail: myEmail().toLowerCase(), purpose: (budgetCats()[0] || {}).name || "Manufacturing",
    status: "Submitted", reimb: "Submitted", chargedTo: "",
    cost: "", dateOrdered: today(), source: "", notes: "", retro: false, createdBy: myEmail(),
    receiptUrl: "", receiptPath: "",
  };
  DB.budget.push(b); saveBuy(b);
  view = { ...view, mode: "detail", id, edit: true }; render();
}
function delBuy(id) { buysBulkDelete([id]); }
/* The detail page's Delete and the list's Select… share this. Receipts go
   with their purchases; a lot bought on one keeps the purchase id as text. */
function buysBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can delete purchases.", "error"); return; }
  const set = new Set(ids || []);
  const buys = (DB.budget || []).filter(b => set.has(b.id));
  if (!buys.length) { toast("Nothing selected.", "info"); return; }
  const what = buys.length === 1 ? (buys[0].item || buys[0].id) : plural(buys.length, "purchase");
  const receipts = buys.filter(b => b.receiptPath).length;
  bulkDeleteRecords({
    message: `Delete ${what} for everyone?${receipts ? ` ${plural(receipts, "receipt")} go${receipts === 1 ? "es" : ""} with ${buys.length === 1 ? "it" : "them"}.` : ""} Back up first if unsure.`,
    items: buys.map(b => ({ coll: "budget", id: b.id })),
    files: buys.map(b => b.receiptPath),
    done: `${what} deleted`,
    after: () => { const gone = new Set(buys.map(b => b.id)); DB.budget = (DB.budget || []).filter(b => !gone.has(b.id)); },
  });
}
function deletePickedBuys() { buysBulkDelete(pickedIds("budget")); }
// "Scan" on mobile is just this input opening the camera directly via the
// capture attribute — no OCR, no new JS for that part. Reuses fb.upload()
// (already downscales images client-side) exactly like ticket/document files.
function attachReceipt(id) {
  const b = buyById(id);
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("capture", "environment");
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`budget/${b.id}/${Date.now()}-${f.name}`, f);
      b.receiptUrl = rec.url; b.receiptPath = rec.path;
      saveBuy(b, "receiptUrl"); saveBuy(b, "receiptPath");
      render();
    } catch (e) { toast("Receipt upload failed: " + e.message, "error"); }
  };
  inp.click();
}

/* ---------- line items ----------
 *
 * A purchase can carry what was actually in it: one line per thing, with the
 * TOTAL and the COUNT typed (that's what a receipt says) and the unit price
 * derived live — $20 × 4 shows $5.00 ea while you type. Lines never write
 * `cost` by themselves: a line edit silently flipping the $50 approval gate
 * is a correctness bug (the integrity critic's veto), so the sum is offered
 * through an explicit "= set cost" button plus a visible mismatch chip.
 * Legacy purchases with no lines behave exactly as before. lineId keys every
 * mutation; chunk 5's receiving stamps lotRefs/receivedOn onto a line. */

function buyLines(b) { return b && Array.isArray(b.lines) ? b.lines : []; }

function buyLineEach(l) {
  const t = parseLooseMoney(l.total);
  const q = parseLooseMoney(l.qty);
  const n = q == null ? 1 : q;                 // no count typed = one of it
  if (t == null || !(n > 0)) return null;
  return Math.round(t / n * 100) / 100;
}

function buyLineSum(b) {
  let sum = 0, priced = 0;
  for (const l of buyLines(b)) {
    const t = parseLooseMoney(l.total);
    if (t != null) { sum += t; priced++; }
  }
  return { sum: Math.round(sum * 100) / 100, priced, count: buyLines(b).length };
}

function buyLineAdd() {
  const b = buyById(view.id);
  if (!b) return;
  const line = { lineId: bomLineId(), desc: "", qty: "1", total: "", lotRefs: [], receivedOn: "" };
  (b.lines = b.lines || []).push(line);
  saveField("budget", b, "lines", arr => [...(arr || []), line]);
  render();
  // The pen lands on the new row's first cell; from there it's Tab, Tab, Tab.
  const el = document.getElementById("bds-" + line.lineId);
  if (el && el.focus) el.focus();
}
function buyLineUpd(lid, k, v) {
  const b = buyById(view.id);
  const l = b && buyLines(b).find(x => x.lineId === lid);
  if (!l) return;
  l[k] = v;
  saveField("budget", b, "lines", arr => (arr || []).map(x => x.lineId === lid ? { ...x, [k]: v } : x));
  /* NO render() here, on purpose: onchange fires while Tab is moving focus
     to the next field, and a whole-page repaint destroys that field mid-hop
     — the grid became untabbable. The three things a line edit can change
     (its "each" cell, the sum, the match chip) update in place instead. */
  buyLinesRefresh(lid);
}
function buyLinesRefresh(lid) {
  const b = buyById(view.id);
  if (!b) return;
  if (lid) {
    const l = buyLines(b).find(x => x.lineId === lid);
    const ea = document.getElementById("ea-" + lid);
    if (l && ea) { const each = buyLineEach(l); ea.textContent = each == null ? "" : fmtMoney(each) + " ea"; }
  }
  const s = buyLineSum(b);
  const sumEl = document.getElementById("bl-sum");
  if (sumEl) sumEl.textContent = buyLineSumText(s);
  const chipEl = document.getElementById("bl-chip");
  if (chipEl) chipEl.innerHTML = buyLineSumChip(b);
}
function buyLineSumText(s) {
  return s.count ? `· sum ${fmtMoney(s.sum)}${s.priced < s.count ? ` (${s.count - s.priced} unpriced)` : ""}` : "";
}
function buyLineDel(lid) {
  const b = buyById(view.id);
  if (!b) return;
  b.lines = buyLines(b).filter(x => x.lineId !== lid);
  saveField("budget", b, "lines", arr => (arr || []).filter(x => x.lineId !== lid));
  render();
}
/* The live half: while total or count is being typed, only the "each" cell
   moves — no render, no save, just the aha of the unit price materializing. */
function buyLineLive(lid) {
  const ea = document.getElementById("ea-" + lid);
  if (!ea) return;
  const each = buyLineEach({
    total: (document.getElementById("bt-" + lid) || {}).value,
    qty: (document.getElementById("bq-" + lid) || {}).value,
  });
  ea.textContent = each == null ? "" : fmtMoney(each) + " ea";
}

function setCostFromLines(id) {
  const b = buyById(id);
  const s = buyLineSum(b);
  if (!s.count) return;
  b.cost = s.sum.toFixed(2);
  saveBuy(b, "cost");
  toast(`Cost set to ${fmtMoney(s.sum)} from ${s.count} line${s.count === 1 ? "" : "s"}.`);
  render();
}

/* "⚖ matches cost" or "⚠ cost says $18.00" beside the sum. Disagreement is
   shown, never silently fixed. */
function buyLineSumChip(b) {
  const s = buyLineSum(b);
  if (!s.count) return "";
  const cost = num(b.cost);
  const agree = Math.abs(cost - s.sum) < 0.005;
  return agree
    ? `<span class="tny muted nocaps">⚖ matches cost</span>`
    : `<span class="tny nocaps">⚠ cost field says ${fmtMoney(Math.round(cost * 100) / 100) || "$0.00"}</span>
       <button class="sm no-print" onclick="setCostFromLines('${esc(b.id)}')">= set cost from lines</button>`;
}

function buyLinesHtml(b, E) {
  const lines = buyLines(b);
  if (!lines.length && !E) return "";
  const s = buyLineSum(b);
  const rows = lines.map(l => {
    const lid = esc(l.lineId || "");
    const each = buyLineEach(l);
    if (!E) {
      return `<tr><td>${esc(l.desc)}${(l.lotRefs || []).length ? ` ${l.lotRefs.map(id => shopRefChip(String(id))).join("")}` : ""}</td>
        <td>${esc(l.total)}</td><td>${esc(l.qty) || "1"}</td>
        <td>${each == null ? '<span class="muted">—</span>' : esc(fmtMoney(each)) + " ea"}</td></tr>`;
    }
    /* The money cells wear the list's own .buy-cost dress ($-prefixed,
       right-aligned, fixed width) so the grid reads like the rest of the
       tab; the derived "each" cell is output, muted, never an input. The
       trash button sits outside the Tab order — Tab is for filling cells,
       and the next stop after a row's count is the next row's item. */
    return `<tr>
      <td><input id="bds-${lid}" value="${esc(l.desc)}" placeholder="what it is" aria-label="Line item" onchange="buyLineUpd('${lid}','desc',this.value)"></td>
      <td class="buy-cost">$<input id="bt-${lid}" value="${esc(l.total)}" inputmode="decimal" aria-label="Line total in dollars" oninput="buyLineLive('${lid}')" onchange="buyLineUpd('${lid}','total',this.value)"></td>
      <td class="buy-cost">×<input id="bq-${lid}" class="bl-n" value="${esc(l.qty)}" inputmode="numeric" aria-label="How many" oninput="buyLineLive('${lid}')" onchange="buyLineUpd('${lid}','qty',this.value)"></td>
      <td class="muted"><span id="ea-${lid}">${each == null ? "" : esc(fmtMoney(each)) + " ea"}</span></td>
      <td><button class="danger ib sm" tabindex="-1" title="Remove line" onclick="buyLineDel('${lid}')">${icon("trash", 13)}</button></td>
    </tr>`;
  }).join("");
  return `
    <h3>Line items <span id="bl-sum" class="muted nocaps">${esc(buyLineSumText(s))}</span> <span id="bl-chip">${s.count ? buyLineSumChip(b) : ""}</span></h3>
    ${lines.length ? `<table class="sub"><thead><tr><th>Item</th><th>Total $</th><th>Count</th><th>Each</th>${E ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="muted">What was actually in the order — one line per thing, total and count, the unit price works itself out.</p>`}
    ${E ? `<button onclick="buyLineAdd()">+ Line</button>
    ${b.receiptPath ? `<button class="no-print" onclick="fillLinesFromReceipt('${esc(b.id)}')" title="Read the receipt photo into editable line items">✨ Fill from receipt</button>` : ""}` : ""}`;
}

/* ---------- receipt -> proposed lines ----------
 * The ✨ button calls the parseReceipt Cloud Function and drops the answer
 * into the SAME editable grid — parsing is a prefill, never a separate mode,
 * so a wrong read is fixed by typing in a normal cell and a dead function
 * degrades to the manual editor. Existing lines are never touched without a
 * confirm. */
let RECEIPT_PARSING = false;
async function fillLinesFromReceipt(id) {
  const b = buyById(id);
  if (!b || RECEIPT_PARSING) return;
  if (!b.receiptPath) { toast("Add a receipt photo first — the ✨ reads that.", "error"); return; }
  if (buyLines(b).length) {
    const go = await confirmAsync("This purchase already has line items. Add what the receipt says underneath them?", { ok: "Add lines", danger: false });
    if (!go) return;
  }
  RECEIPT_PARSING = true;
  toast("Reading the receipt…");
  try {
    const out = await fb.call("parseReceipt", { path: b.receiptPath });
    const lines = (out && out.lines || []).map(l => ({
      lineId: bomLineId(), desc: l.desc || "", qty: l.qty || "1", total: l.total || "", lotRefs: [], receivedOn: "",
    }));
    if (!lines.length) { toast("Couldn't find line items on that photo — type them in, it's five cells.", "error"); return; }
    b.lines = [...buyLines(b), ...lines];
    saveField("budget", b, "lines", arr => [...(arr || []), ...lines]);
    if (out.vendor && !String(b.source || "").trim()) { b.source = out.vendor; saveBuy(b, "source"); }
    toast(`${lines.length} line${lines.length === 1 ? "" : "s"} read from the receipt — every cell is editable.`);
    view.edit = true;
    render();
  } catch (e) {
    toast("Receipt parsing isn't available (" + (e && e.message || "no function") + ") — the manual grid still works.", "error");
  } finally {
    RECEIPT_PARSING = false;
  }
}

function renderBudget() {
  return view.mode === "detail" ? renderBuyDetail() : renderBuyList();
}

function renderBuyList() {
  const D = DB.budget;
  const rows = D
    .filter(b => (!view.fStatus || buyStatus(b) === view.fStatus))
    .filter(b => (!view.fReimb || reimbStatus(b) === view.fReimb))
    .filter(b => !view.fBudget || (view.fBudget === "other" ? isOffBudget(b) : !isOffBudget(b)))
    .filter(b => { const q = view.q.toLowerCase(); return !q || (b.item || "").toLowerCase().includes(q) || (personName(b, "purchaser") || b.purchaser || "").toLowerCase().includes(q) || (b.chargedTo || "").toLowerCase().includes(q); })
    .sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));
  /* Season total is COMPOSITES money only — that is the number the goal bars
     are drawn against, and putting a chassis order inside it is the exact bug
     chargedTo exists to stop. What the team spent through us anyway gets its
     own tile, and only when there is something to put in it. */
  const total = compositesBuys().reduce((s, b) => s + num(b.cost), 0);
  const off = offBudgetBuys();
  const offSum = off.reduce((s, b) => s + num(b.cost), 0);
  const inFlight = D.filter(b => !buyArrived(b));
  const owed = D.filter(b => !buyReimbursed(b) && num(b.cost));
  const owedSum = owed.reduce((s, b) => s + num(b.cost), 0);
  const unapproved = D.filter(needsApproval).length;
  fetchBudgetCfg();
  return `
  <div class="stat-row">
    <div class="stat-tile"><div class="bignum">$${total.toFixed(0)}</div><div class="stat-label">Season total (composites)</div></div>
    ${off.length ? `<div class="stat-tile"><div class="bignum">$${offSum.toFixed(0)}</div><div class="stat-label">Other budgets (${off.length})</div></div>` : ""}
    <div class="stat-tile"><div class="bignum">${inFlight.length}</div><div class="stat-label">Not arrived yet</div></div>
    <div class="stat-tile"><div class="bignum">$${owedSum.toFixed(0)}</div><div class="stat-label">Awaiting reimbursement (${owed.length})</div></div>
    <div class="stat-tile"><div class="bignum">${unapproved}</div><div class="stat-label">Over $50, unapproved</div></div>
  </div>
  ${budgetBoardsHtml(total)}
  <div class="toolbar no-print">${pickOn("budget") ? "" : `<button class="primary"${gx("Sign in to log a purchase — it is recorded against you.")} onclick="newBuy()">+ New Purchase</button>`}
    ${isLead() ? pickBar("budget", { all: rows.map(b => b.id), onDelete: "deletePickedBuys()", hint: "Select several purchases to delete them, receipts included" }) : ""}</div>
  <div class="filters no-print">
    <select title="Where the goods are" onchange="view.fStatus=this.value;render()">
      <option value="">Any order status</option>
      ${BUY_STATUS.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <select title="Where the money is" onchange="view.fReimb=this.value;render()">
      <option value="">Any reimbursement</option>
      ${REIMB_STATUS.map(s => `<option ${view.fReimb === s ? "selected" : ""}>${s}</option>`).join("")}
    </select>
    <select title="Whose budget it lands on" onchange="view.fBudget=this.value;render()">
      <option value="">Every budget</option>
      <option value="composites" ${view.fBudget === "composites" ? "selected" : ""}>Composites only</option>
      <option value="other" ${view.fBudget === "other" ? "selected" : ""}>Other budgets only</option>
    </select>
    <input id="searchbox" placeholder="search item / purchaser…" value="${esc(view.q)}" oninput="searchInput(this)">
  </div>
  ${D.length === 0 ? `<div class="card">No purchases logged yet. <b>New Purchase</b> to start.</div>` : ""}
  <table class="list">
    <tr>${pickOn("budget") ? "<th></th>" : ""}<th>Item</th><th>Purchaser</th><th>Purpose</th><th>Order</th><th>Reimb.</th><th>Cost</th><th>Ordered</th></tr>
    ${/* Status and cost are edited HERE, in the row (Simon, 2026-08-13): the
          week's real workflow is walking the list marking things arrived or
          reimbursed and fixing a price off the receipt, and that took a
          click into the detail and Edit for each one. Both tracks get their
          own dropdown for the same reason: the treasurer walks the list down
          the Reimb. column while the buyer walks it down Order, and neither
          should have to touch the other's cell. The row still opens the
          detail; every live cell stopPropagation so editing never
          navigates. */""}
    ${rows.map(b => {
      /* The category (purpose) is editable here too — tagging a purchase to a
         section is what makes the goal bars true, and a purchase that landed
         uncategorized should be one click to fix. A purpose that matches no
         category stays as its own selected option, so opening the dropdown
         never silently recategorizes. */
      const cats = budgetCats().length ? budgetCats().map(c => c.name) : PURPOSE;
      const opts = (cats.some(c => c.toLowerCase() === String(b.purpose || "").toLowerCase()) || !b.purpose ? cats : [b.purpose, ...cats]);
      return `<tr data-open="${b.id}" class="${pickIs("budget", b.id) ? "picked" : ""}" onclick="${pickClick("budget", b.id, `view={...view,mode:'detail',id:'${b.id}',edit:false};render()`)}">
      ${pickOn("budget") ? `<td class="pickcell">${pickBox("budget", b.id)}</td>` : ""}
      <td><b>${esc(b.item || b.id)}</b>${b.retro ? ' <span class="pill retro">retro</span>' : ""}${isOffBudget(b) ? ` <span class="pill offbudget" title="Charged to ${esc(chargedToLabel(b))} — cost tracked, not counted against the composites budget">${esc(chargedToLabel(b))}</span>` : ""}${needsApproval(b) ? ' <span class="pill OnHold" title="Over $50 — needs #purchasing sign-off before ordering">needs approval</span>' : ""}</td>
      <td>${personChip(personRef(b, "purchaser"), { empty: "—" })}</td>
      <td onclick="event.stopPropagation()"><select class="buy-cat" onchange="setBuyField('${b.id}','purpose',this.value)" aria-label="Category of ${esc(b.item || b.id)}">
        ${opts.map(o => `<option ${String(b.purpose || "") === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></td>
      <td onclick="event.stopPropagation()"><div class="statusdrop ${buyStatusClass(buyStatus(b))}">
        <select onchange="setBuyField('${b.id}','status',this.value)" aria-label="Order status of ${esc(b.item || b.id)}">${BUY_STATUS.map(s => `<option ${buyStatus(b) === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></td>
      <td onclick="event.stopPropagation()"><div class="statusdrop ${buyStatusClass(reimbStatus(b))}">
        <select onchange="setBuyField('${b.id}','reimb',this.value)" aria-label="Reimbursement status of ${esc(b.item || b.id)}">${REIMB_STATUS.map(s => `<option ${reimbStatus(b) === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></td>
      <td class="buy-cost" onclick="event.stopPropagation()">$<input value="${num(b.cost).toFixed(2)}"
        onchange="setBuyField('${b.id}','cost',this.value)" aria-label="Cost of ${esc(b.item || b.id)}"></td>
      <td>${esc(b.dateOrdered || "")}</td>
    </tr>`; }).join("")}
  </table>`;
}

/* Row-level edit from the list. Same write path as updBuy but keyed by id
   rather than view.id, because nothing is "open". Rerender always: status and
   cost both feed the stat tiles and the needs-approval pill. */
function setBuyField(id, key, val) {
  const b = buyById(id);
  if (!b) return;
  b[key] = val;
  saveBuy(b, key);
  render();
}

function buyFld(b, label, key, opts, x) {
  x = x || {};
  const v = b[key] ?? "";
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${x.roHtml != null ? x.roHtml : (esc(x.ro != null ? x.ro : v) || "—")}</div></div>`;
  // Stable ids so budgetRenderSoon() can hand focus back after a repaint.
  if (opts) return `<div class="f"><label>${label}</label><select id="bf-${key}" onchange="updBuy('${key}',this.value)">${opts.map(o => `<option ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  return `<div class="f"><label>${label}</label><input id="bf-${key}" value="${esc(v)}"${x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : ""} onchange="updBuy('${key}',this.value)">${x.hint ? `<span class="tny muted nocaps">${esc(x.hint)}</span>` : ""}</div>`;
}

/* Same field, but the SELECTED option is what the record means rather than
   the string it happens to hold — a legacy "Ordered" shows as Purchased and
   only becomes one when somebody picks it. */
function buyFldSel(b, label, key, opts, cur) {
  if (!view.edit) return `<div class="f"><label>${label}</label><div class="ro">${esc(cur) || "—"}</div></div>`;
  return `<div class="f"><label>${label}</label><select id="bf-${key}" onchange="updBuy('${key}',this.value)">${opts.map(o => `<option ${cur === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
}


function renderBuyDetail() {
  const b = buyById(view.id);
  if (!b) { view.mode = "list"; return renderBuyList(); }
  const E = view.edit;
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="view={...view,mode:'list'};render()">${icon("chevronLeft",16)} All purchases</button>
    <button class="primary" onclick="view.edit=!view.edit;render()">${E ? "Done editing" : "Edit"}</button>
    ${E && isLead() ? `<button class="danger" onclick="delBuy('${b.id}')">Delete</button>` : ""}
  </div>
  <div class="card" data-lbgroup="budget:${esc(b.id)}">
    <h2>${esc(b.item || "(unnamed purchase)")}</h2>
    <div class="muted">${esc(b.id)} · <span class="pill ${buyStatusClass(buyStatus(b))}" title="Where the goods are">${esc(buyStatus(b))}</span>
      <span class="pill ${buyStatusClass(reimbStatus(b))}" title="Where the money is">${esc(reimbStatus(b))}</span>
      ${isOffBudget(b) ? `<span class="pill offbudget" title="Cost tracked here, counted against ${esc(chargedToLabel(b))} rather than composites">${esc(chargedToLabel(b))}</span>` : ""}${b.updatedAt ? " · saved " + fmtWhen(b.updatedAt) + " by " + esc(b.updatedBy || "?") : ""}</div>
    ${needsApproval(b) ? `<p class="warn">Over $50 — needs #purchasing sign-off before it's ordered.</p>` : ""}
    ${isOffBudget(b) ? `<p class="muted tny">Charged to ${esc(chargedToLabel(b))}. The cost is tracked and ${esc(personName(b, "purchaser") || "whoever paid")} still gets reimbursed; it does not count against the composites season total or any goal.</p>` : ""}
    ${(() => { const gw = buyGoalWarning(b); return gw ? `<p class="warn">${esc(gw)}</p>` : ""; })()}
    <h3>Details</h3>
    <div class="grid">
      ${buyFld(b, "Item", "item")}${buyFld(b, "Purchaser", "purchaser", null, { roHtml: personChip(personRef(b, "purchaser"), { empty: "—" }) })}${buyFld(b, "Purpose", "purpose", budgetCats().length ? budgetCats().map(c => c.name) : PURPOSE)}
      ${buyFldSel(b, "Order status", "status", BUY_STATUS, buyStatus(b))}${buyFldSel(b, "Reimbursement", "reimb", REIMB_STATUS, reimbStatus(b))}
      ${buyFld(b, "Cost ($)", "cost")}${buyFld(b, "Date ordered", "dateOrdered")}
      ${buyFld(b, "Source / vendor", "source")}
      ${buyFld(b, "Charged to", "chargedTo", null, { placeholder: "Composites", ro: chargedToLabel(b),
        hint: "Blank is ours. Name another team's budget and the cost is still tracked and still reimbursed, just not counted against composites." })}
    </div>
    ${buyLinesHtml(b, E)}
    <h3>Receipt</h3>
    ${/* Through the shared tile, so a receipt opens in the viewer like every
          other photo instead of being a thumbnail you can only download. A
          receipt is always an image — attachReceipt() only accepts one, and
          storage.rules allows nothing else under budget/. */""}
    ${b.receiptUrl
      ? `<div class="filegrid">${fileItem({ url: b.receiptUrl, name: `receipt-${b.id}.jpg`, type: "image/jpeg" })}</div>`
      : '<span class="muted">No receipt yet.</span>'}
    <div class="no-print" style="margin-top:8px"><button onclick="attachReceipt('${b.id}')">${b.receiptUrl ? "Replace" : "+ Add / scan"} receipt</button></div>
    <h3>Notes</h3>
    ${richField("budget", b.id, "notes", {
      plain: true, label: "Notes",
      empty: "Why this was bought, or what went wrong with the order.",
      upload: name => `budget/${b.id}/${Date.now()}-${name}`,
    })}
  </div>`;
}

/* The purchaser picker's writer: an email, "" with a typed name for Other…,
   or both empty to clear. One write for the name and the email. */
function buyPerson(key, email, name) {
  const b = buyById(view.id);
  if (!b || guestBlocked()) return;
  savePatch("budget", b, personPatch(key, email, name));
  renderSoonKeepFocus();
}
function updBuy(key, val) {
  const b = buyById(view.id); b[key] = val; saveBuy(b, key);
  if (["status", "reimb", "cost", "purpose", "chargedTo"].includes(key)) renderSoonKeepFocus();
}
