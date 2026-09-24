"use strict";
/* inventory.js — the Inventory tab: the storage map.
 *
 * WHY A MAP. Storage locations were BIN-class rows inside the Items tab: a
 * name, a stage, and no way to answer the question a shop actually asks,
 * which is "what is on this shelf". This tab opens on the physical shop —
 * one card per location, grouped by site, each showing a live summary of its
 * contents and its problems — and a tap (or a scanned shelf label) opens the
 * location's contents page, where records are created already located, moved
 * in by scanning, and confirmed for CS-011 §7.1's monthly stock walk.
 *
 * WHAT LIVES HERE. The old Items (test panels, jigs, storage locations) and
 * Materials (fabric, resin, consumables) tabs, whose flat lists survive
 * behind the Items/Materials view toggles; their tab ids live on as hidden
 * aliases the way stock's does. Collections, prefixes, labels, scanning and
 * rules are untouched.
 *
 * THE JOIN. invIndex() makes one pass over every physical collection and
 * buckets records by their location field (boards included, since they
 * gained one; parts join through moldLocation, which setLocation writes
 * BIN- ids into — the free-text values it also holds are counted honestly
 * as "legacy" rather than pretended away). The moldUses() idiom, one level
 * up. */

// Map order. The blank is a schema affordance for "not set yet", not a site.
const INV_SITES = SITES.filter(Boolean);
const INV_WALK_STALE_DAYS = 30;

function invBins() { return (DB.items || []).filter(o => o.cls === "BIN"); }
function invActiveBins() { return invBins().filter(b => b.stage !== "Retired"); }

/* ---------- restock rules: what we keep on the shelf, and how little is too
 * little ----------
 *
 * WHY THIS IS NOT A FIELD ON A LOT. lowFlag lives on a container. A container
 * empties, invIndex() drops it from every bucket, invSummaryChips() filters
 * Empty out before it counts anything, and the flag goes with it: being nearly
 * out is a chip, being completely out is silence. That is PP-02 — the SN5
 * sheet where MEKP sat flagged REORDER all season — reproduced exactly. The
 * thing you reorder is a MATERIAL, so the threshold belongs on the material.
 *
 * The seed is CS-011 §5's table, verbatim, including the standard's own
 * reasoning in `why`. §5 calls these "starting values; tune with usage data",
 * which is the whole argument for a lead-editable override rather than a
 * regression over forty data points we will not have until March.
 *
 * unit is the noun the count picker says out loud ("How many boxes"), because
 * "1" meaning one box and "100" meaning a hundred gloves is the ambiguity that
 * makes a count untrustworthy. leadDays is CS-012 §7.4's supplier lead time,
 * and it is what turns "you are low" into "order now to have it by the 4th". */
const RESTOCK_SEED = [
  { matKey: "IN2", label: "IN2 infusion resin", minCount: 2, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "resin",
    why: "Every infusion. §5 triggers at the opened kit plus one unopened — one unopened kit is about one peak week, so it is the alarm, not the buffer." },
  { matKey: "AT30", label: "AT30 slow hardener", minCount: 2, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "hardener",
    why: "Pairs with IN2; same 6-week Easy Composites lead." },
  { matKey: "WEST-105", label: "West 105 resin", minCount: 1, unit: "tank", supplier: "West System", leadDays: 14,
    hazard: "flammable", role: "resin", why: "Every wet layup. CS-011 §5 wants half a tank plus a can." },
  { matKey: "WEST-206", label: "West 206 hardener", minCount: 1, unit: "can", supplier: "West System", leadDays: 14,
    hazard: "flammable", role: "hardener", why: "Every wet layup." },
  { matKey: "XCR", label: "XCR mold coating", minCount: 2, unit: "kit", supplier: "Easy Composites", leadDays: 42,
    hazard: "flammable", role: "resin",
    why: "Every mold. One kit seals two or three sections and molds queue two a week in peak." },
  { matKey: "VB160", label: "VB160 bagging film", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything bagged." },
  { matKey: "PEEL-PLY", label: "Peel ply", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything bagged." },
  { matKey: "FLOW-MESH", label: "Flow mesh", minCount: 1, unit: "roll", supplier: "Easy Composites", leadDays: 42,
    why: "Everything infused." },
  { matKey: "TACKY-TAPE", label: "Tacky tape", minCount: 6, unit: "roll", supplier: "Easy Composites", leadDays: 7,
    why: "Everything bagged, and the team burns it fast: about three rolls a week in peak, one-week lead." },
  { matKey: "GLOVES-NITRILE", label: "Nitrile gloves", minCount: 2, unit: "box per size", supplier: "McMaster", leadDays: 7,
    why: "Everything." },
  { matKey: "MIXING-CUPS", label: "Mixing cups", minCount: 50, unit: "cup", supplier: "McMaster", leadDays: 7, why: "Everything." },
  { matKey: "MIXING-STICKS", label: "Mixing sticks", minCount: 50, unit: "stick", supplier: "McMaster", leadDays: 7, why: "Everything." },
  { matKey: "CARTRIDGE-A-P100", label: "Respirator cartridges (A + P100)", minCount: 2, unit: "set", supplier: "McMaster", leadDays: 7,
    why: "Safety-blocking: no cartridges, no layup." },
  { matKey: "195-TWILL", label: "195 twill cloth", minCount: 1, unit: "roll", supplier: "Sigmatex (sponsor)", leadDays: 30,
    why: "Most stacks. §5 states this in yards (10 yd); we can count rolls honestly and yards we cannot, so it is one roll here." },
];

/* Lead overrides, config/restock. Same trust shape as config/resins: roster
   reads, lead writes, no rules change needed. A row keyed by an unknown
   matKey is an ADDITION, not an error — the shop buys things CS-011 never
   listed. Fetched once per session; a missing doc never clobbers a seed. */
window.RESTOCK_OVERRIDES = null;
let restockFetched = false;
function loadRestockRules() {
  if (restockFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  restockFetched = true;
  fb.getConfig("restock").then(d => { if (d) { window.RESTOCK_OVERRIDES = d; render(); } }).catch(() => {});
}

/* The one choke point. Overrides merge per matKey so a lead can move a single
   threshold without restating the table, and minCount is validated at READ
   time — a doc hand-edited in the Firestore console cannot set a negative or
   non-numeric minimum and silently switch a rule off. Same defensive read as
   resinById(). */
function restockRules() {
  const over = window.RESTOCK_OVERRIDES;
  const rows = Array.isArray(over && over.rules) ? over.rules : [];
  const byKey = new Map(RESTOCK_SEED.map(r => [r.matKey, r]));
  for (const o of rows) {
    if (!o || !o.matKey) continue;
    const base = byKey.get(o.matKey) || { matKey: o.matKey, label: o.matKey };
    const n = Number(o.minCount);
    const clean = { ...base, ...o };
    if (!Number.isFinite(n) || n < 0) clean.minCount = base.minCount;
    else clean.minCount = n;
    byKey.set(o.matKey, clean);
  }
  return [...byKey.values()];
}
function restockRuleFor(matKey) {
  if (!matKey) return null;
  return restockRules().find(r => r.matKey === matKey) || null;
}

/* ---------- what is low, and what to do about it ----------
 *
 * PP-02, in the team's own words: the SN5 inventory sheet was a season-start
 * snapshot with a "Running Low" flag nobody actioned, and MEKP sat flagged
 * REORDER all season. The app reproduced it exactly, for a reason nobody had
 * noticed: lowFlag lives on a CONTAINER. A container empties, invIndex drops
 * Empty lots from every bucket, invSummaryChips filters Empty out before it
 * counts anything — and the flag goes with it. Being nearly out was a chip.
 * Being completely out was silence.
 *
 * So on-hand is counted per MATERIAL, and Empty containers are counted as the
 * zero they are. */

const LOT_LEVELS = ["Full", "Half", "Low", "Empty"];

/* Is this one container low? Coarse states plus the human override. Empty
   counts, which is the whole point. */
function lotIsLow(o) {
  if (!o) return false;
  if (o.lowFlag) return true;                       // someone looked and knows better
  if (o.stage === "Empty") return true;
  const q = String(o.qty || "");
  return q === "Low" || q === "Empty";
}

/* On-hand for one restock rule.

   FAB and RSN count CONTAINERS — rolls and kits — because that is the unit
   CS-011 §5 states most of its thresholds in and the only unit the app can
   count honestly. An opened container counts: it has material in it. Counting
   only sealed ones read "none left" while an open roll sat on the rack, which
   is a false alarm, and false alarms are the entire failure mode this feature
   exists to end. §5's "opened kit + 1 unopened" is expressed as a minimum of
   two containers instead, which says the same thing in the unit we have.

   CON sums count, because boxes really are countable. Empty counts for nothing
   in either case — an empty jug on a shelf is not stock. */
function restockOnHand(matKey) {
  const rule = restockRuleFor(matKey);
  let n = 0, empty = 0, records = 0;
  for (const o of DB.lots || []) {
    if (String(o.matKey || "") !== String(matKey)) continue;
    records++;
    if (o.stage === "Empty" || String(o.qty) === "Empty") { empty++; continue; }
    if (o.cls === "CON") n += Number.isFinite(Number(o.count)) ? Number(o.count) : 1;
    else n += 1;                                     // a container with material in it
  }
  return { n, empty, records, rule };
}

/* Is any of this material already in the mail? Derived from the same Incoming
   query the strip uses, so there is no second copy of "on order" anywhere.

   This suppression is the single most important detail here. A rule that is
   low but has an order in flight must say "on order", not "reorder" — without
   it the card nags for the whole six-week Easy Composites lead time, and a nag
   that is known-stale is precisely how "Running Low" became wallpaper. */
function restockOnOrder(matKey) {
  const out = [];
  for (const x of invIncoming()) {
    const l = x.line;
    if (String(l.matKey || "") === String(matKey)) out.push(x);
  }
  return out;
}

/* Order by this date to have it before you need it. Not "you are low" but
   "order now to have it by the 4th" — the lead-time-aware half of PP-02's root
   cause, and one line of arithmetic. */
function restockOrderBy(rule) {
  const d = Number(rule && rule.leadDays);
  if (!Number.isFinite(d) || d <= 0) return null;
  const t = new Date();
  t.setDate(t.getDate() + d);
  return t.toISOString().slice(0, 10);
}

/* Every rule that has tripped.

   A rule matching NO record is skipped, not reported as "none left". The seed
   is CS-011 §5's whole list and a shop does not stock all of it, so on day one
   every rule would match nothing and the card would open with fourteen false
   alarms — which is precisely the wallpaper this feature exists to stop being.
   The app cannot tell "we have never bought this" from "the matKey is spelled
   differently on the records", and guessing wrong in either direction is worse
   than the thing that actually prevents the typo: matKey is a "sug" field, so
   entry offers the values already in use rather than inviting a fresh spelling.

   The trigger is <= min, matching §5's own wording for the material that
   matters most ("trigger at opened kit + 1 unopened"): you order AT the
   minimum, not after breaking it. The shortfall is therefore min - n + 1, so
   that ordering what the card asks for actually clears the card — asking for
   exactly the minimum would leave it tripped forever, which is how a reorder
   list becomes something people stop reading. */
function restockLow() {
  const out = [];
  for (const rule of restockRules()) {
    const min = Number(rule.minCount);
    if (!Number.isFinite(min) || min <= 0) continue;
    const { n, records } = restockOnHand(rule.matKey);
    if (!records) continue;                 // nothing of it has ever been on a shelf
    if (n > min) continue;
    const onOrder = restockOnOrder(rule.matKey);
    out.push({
      rule, onHand: n, min, records,
      unmatched: records === 0,
      onOrder,
      short: Math.max(1, min - n + 1),
      orderBy: restockOrderBy(rule),
    });
  }
  return out.sort((a, b) => (a.onHand - a.min) - (b.onHand - b.min));
}

/* The card. Same editorial rule invIncomingHtml states for itself: it earns
   its place only when something is actually low. Empty states shrink the page,
   they do not pad it. */
function invRestockHtml() {
  const low = restockLow();
  if (!low.length) return "";
  const need = low.filter(x => !x.onOrder.length);
  return `<div class="card">
    <h3>Running out <span class="muted nocaps tny">below the minimum in CS-011 §5 · ${low.length}</span>
      ${need.length ? `<button class="sm no-print" onclick="openRestockPurchase()">Add ${need.length} to a purchase</button>` : ""}</h3>
    ${low.map(x => {
      const r = x.rule;
      const unit = r.unit ? " " + esc(r.unit) + (x.onHand === 1 ? "" : "s") : "";
      return `<div class="pmini invrow">
        <span class="pm-name">${esc(r.label || r.matKey)}</span>
        <span class="tny ${x.onHand === 0 ? "" : "muted"}">${x.onHand === 0 ? "none left" : x.onHand + unit + " left"} · want ${x.min}</span>
        ${x.onOrder.length
          ? `<span class="tny muted">on order · ${x.onOrder.map(o => esc(o.buy.id)).join(", ")}${x.onOrder[0].age != null ? ` · ${x.onOrder[0].age}d ago` : ""}</span>`
          : `<span class="tny">${r.supplier ? esc(r.supplier) + " · " : ""}${x.orderBy ? `order by ${esc(x.orderBy)}` : "reorder"}</span>`}
        ${r.why ? `<span class="tny muted" title="${esc(r.why)}">why?</span>` : ""}
      </div>`;
    }).join("")}
    
  </div>`;
}

/* Reorder to purchase, and the loop closes itself.
 *
 * The line carries matKey, so when the delivery is received the lot is born
 * with that matKey, on-hand goes back up, and the row disappears on its own.
 * Nothing to mark fulfilled and nothing to forget — the same reason Incoming
 * is a query rather than a flag.
 *
 * The app proposes; a human confirms. A purchase is a financial act with
 * somebody's card behind it, so nothing here creates one without a click. */
function openRestockPurchase() {
  const need = restockLow().filter(x => !x.onOrder.length);
  if (!need.length) { toast("Nothing needs ordering that is not already on its way.", "info"); return; }
  // Anything whose goods are still coming can take another line.
  const open = (DB.budget || []).filter(b => typeof buyArrived === "function" ? !buyArrived(b) : b.status === "Submitted");
  openModal(`<h2>Add ${need.length} thing${need.length === 1 ? "" : "s"} to a purchase</h2>
    <p class="muted tny">One line per material, at the shortfall. Prices are not guessed —
      whoever orders fills them in.</p>
    <div class="lblist">
      ${need.map((x, i) => `<label class="cutrow">
        <input type="checkbox" id="rs-${i}" checked>
        <span><b>${esc(x.rule.label || x.rule.matKey)}</b> ×${x.short}
          <span class="tny muted">${x.onHand === 0 ? "none left" : x.onHand + " left"} · want ${x.min}${x.rule.supplier ? " · " + esc(x.rule.supplier) : ""}</span></span>
      </label>`).join("")}
    </div>
    <div class="field"><label>Add to</label>
      <select id="rs-buy">
        <option value="">A new purchase</option>
        ${open.map(b => `<option value="${esc(b.id)}">${esc(b.id)} · ${esc(b.item || "")}${b.source ? " · " + esc(b.source) : ""}</option>`).join("")}
      </select></div>
    <p class="muted tny">Over $50 still needs #purchasing sign-off before anyone orders it (CS-012 §7.1).</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitRestockPurchase()">Add to purchase</button>
    </div>`);
}

async function submitRestockPurchase() {
  const need = restockLow().filter(x => !x.onOrder.length);
  // Read the whole form before any await: the offline allocId path opens its
  // own modal over this one.
  const take = need.filter((x, i) => {
    const el = document.getElementById("rs-" + i);
    return el ? !!el.checked : true;
  });
  const into = (document.getElementById("rs-buy") || {}).value || "";
  if (!take.length) { toast("Nothing ticked.", "info"); return; }

  const lines = take.map(x => ({
    lineId: bomLineId(),
    desc: x.rule.label || x.rule.matKey,
    matKey: x.rule.matKey,
    qty: String(x.short),
    total: "",
    lotRefs: [], receivedOn: "",
  }));

  let b = into ? recById("budget", into) : null;
  if (b) {
    b.lines = [...(b.lines || []), ...lines];
    saveField("budget", b, "lines", arr => [...(arr || []), ...lines]);
  } else {
    const id = await allocId("budget");
    if (!id) return;
    const suppliers = take.map(x => x.rule.supplier).filter(Boolean);
    const common = suppliers.length && suppliers.every(s => s === suppliers[0]) ? suppliers[0] : "";
    b = {
      id, item: `Restock — ${take.length} item${take.length === 1 ? "" : "s"}`,
      purpose: "Restock", status: "Submitted", reimb: "Submitted", chargedTo: "", source: common,
      purchaser: signerName(), purchaserEmail: myEmail().toLowerCase(), cost: "", dateOrdered: "", lines,
    };
    (DB.budget = DB.budget || []).push(b);
    save("budget", b);
  }
  closeModal();
  toast(`${lines.length} line${lines.length === 1 ? "" : "s"} added to ${b.id}. Fill in the prices and get it ordered.`);
  openRecord("budget", b.id);
}

/* ---------- the index: location id -> contents ---------- */
function invEmptyBucket() {
  return { molds: [], boards: [], panels: [], jigs: [], fabric: [], resin: [], consumables: [], parts: [] };
}
function invIndex() {
  const by = new Map();
  const un = invEmptyBucket();          // unhoused: no location at all
  const legacyParts = [];               // parts whose moldLocation is free text
  const put = (locId, kind, rec) => {
    if (!locId) { un[kind].push(rec); return; }
    if (!by.has(locId)) by.set(locId, invEmptyBucket());
    by.get(locId)[kind].push(rec);
  };
  (DB.molds || []).forEach(m => { if (m.stage !== "Retired") put(m.location, "molds", m); });
  (DB.stock || []).forEach(b => put(b.location, "boards", b));
  (DB.items || []).forEach(o => {
    if (o.cls === "PNL") put(o.location, "panels", o);
    if (o.cls === "JIG") put(o.location, "jigs", o);
  });
  (DB.lots || []).forEach(o => {
    if (o.stage === "Empty") return;    // an empty jug isn't ON a shelf in any useful sense
    if (o.cls === "FAB") put(o.location, "fabric", o);
    if (o.cls === "RSN") put(o.location, "resin", o);
    if (o.cls === "CON") put(o.location, "consumables", o);
  });
  (DB.parts || []).forEach(p => {
    const loc = String(p.moldLocation || "");
    if (!loc) return;                   // parts default to nothing useful; don't count as unhoused
    if (loc.startsWith("BIN-")) put(loc, "parts", p);
    else legacyParts.push(p);
  });
  return { by, un, legacyParts };
}
function invBucketCount(b) { return Object.values(b).reduce((n, arr) => n + arr.length, 0); }

/* ---------- warnings (CS-011 §6, plus freshness) ---------- */
function lotExpired(o) {
  return !!(o.expiresOn && o.expiresOn < new Date().toISOString().slice(0, 10) && o.stage !== "Empty");
}
function invDaysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000);
  return Number.isFinite(d) ? d : null;
}
function invLocWarnings(bin, bucket) {
  const out = [];
  const lots = [...bucket.resin, ...bucket.fabric, ...bucket.consumables];
  const expired = lots.filter(lotExpired).length;
  if (expired) out.push({ text: `${expired} expired`, cls: "bad" });
  /* There is deliberately NO resin+hardener co-location warning here any more.
     The team stores them together (lead decision, Simon, 2026-08-28) — the
     imported EH&S inventory has both in the one flammables cabinet, which is
     where campus EH&S itself filed them. CS-011 §6 still says "separate
     shelves" pending Simon's Rev D; the app follows the shop's actual
     practice, and the standard gets fixed through its own revision process,
     not from here. Do not reintroduce the check without both changing. */
  /* §6: flammables live in the rated cabinet. */
  const flams = lots.filter(o => o.hazard === "flammable").length;
  if (flams && bin.flam !== "Yes") out.push({ text: `${flams} flammable — not a rated location`, cls: "bad" });
  const low = lots.filter(lotIsLow).length;
  if (low) out.push({ text: `${low} running low`, cls: "warn" });
  return out;
}

/* ---------- selection ---------- */
function invSelected() {
  if (view.mode !== "detail") return null;
  const id = String(view.id || "");
  /* Boards first, and before BIN-, so a BRD- can never fall through to the
     generic item branch below and be looked up in DB.items. SZ: is a synthetic
     size key minted by groupBoards, not a stored record — boardGroupByKey
     re-derives it, which is why it resolves at all. */
  if (id.startsWith("SZ:")) return { kind: "size", rec: boardGroupByKey(id.slice(3)) };
  if (id.startsWith("BRD-")) return { kind: "board", rec: boardById(id) };
  if (id.startsWith("BIN-")) return { kind: "bin", rec: shopById("items", id) };
  if (/^(PNL|JIG)-/.test(id)) return { kind: "item", rec: shopById("items", id) };
  if (/^(FAB|RSN|CON)-/.test(id)) return { kind: "lot", rec: shopById("lots", id) };
  return null;
}
function selectInvRec(id) { view = { ...view, mode: "detail", id, edit: false }; render(); }
function clearInvSelection() { view = { ...view, mode: "list", id: null, edit: false }; render(); }

/* ---------- the map ---------- */
/* Does this shelf match what was typed? Its own name and kind, OR the name,
   vendor lot or material type of anything on it — so "195 twill" leaves the
   shelves that actually have some, which is the question the map is for. */
function invBinMatches(bin, bucket, q) {
  if (!q) return true;
  const hay = [bin.name, bin.id, bin.site, bin.locKind];
  for (const arr of Object.values(bucket)) {
    for (const o of arr) hay.push(o.name, o.partName, o.label, o.vendorLot, o.matKey, o.id);
  }
  return hay.filter(Boolean).join(" ").toLowerCase().includes(q);
}

/* Chips that actually do something.
   `low / expired` set view.invFlag and lit up while invCard never read it, so
   the map did not change and the active state was a lie. `chemical warnings`
   was onclick="void 0" — a button that is not one. And the walk chip was a
   <span> dressed like its neighbours. All three now filter, and the fourth
   tells the truth about being a count rather than a control. */
function invSummaryChips(idx) {
  const allLots = (DB.lots || []).filter(o => o.stage !== "Empty");
  const lowExpired = allLots.filter(o => lotIsLow(o) || lotExpired(o)).length;
  const unhoused = invBucketCount(idx.un);
  let chem = 0;
  invActiveBins().forEach(b => { chem += invLocWarnings(b, idx.by.get(b.id) || invEmptyBucket()).filter(w => w.cls === "bad").length; });
  const stale = invActiveBins().filter(b => { const d = invDaysSince(b.walkedAt); return d == null || d > INV_WALK_STALE_DAYS; }).length;
  const flip = f => `view.invFlag = view.invFlag === '${f}' ? '' : '${f}'; render()`;
  const chip = (n, label, cls, on, js) =>
    `<button class="psum-chip ${cls || ""} ${on ? "on" : ""}" onclick="${js}"><b>${n}</b> ${esc(label)}</button>`;
  return `<div class="psum no-print">
    ${chip(lowExpired, "low / expired", lowExpired ? "bad" : "", view.invFlag === "reorder", flip("reorder"))}
    ${chip(unhoused, "unhoused", unhoused ? "bad" : "", false, "selectInvRec('NOWHERE')")}
    ${chip(chem, "chemical warnings", chem ? "bad" : "", view.invFlag === "chem", flip("chem"))}
    ${chip(stale, "need a walk", stale ? "warn" : "", view.invFlag === "walk", flip("walk"))}
  </div>`;
}

/* Does this shelf survive the active chip? */
function invBinFlagged(bin, bucket, flag) {
  if (!flag) return true;
  if (flag === "reorder") return [...bucket.resin, ...bucket.fabric, ...bucket.consumables].some(o => lotIsLow(o) || lotExpired(o));
  if (flag === "chem") return invLocWarnings(bin, bucket).some(w => w.cls === "bad");
  if (flag === "walk") { const d = invDaysSince(bin.walkedAt); return d == null || d > INV_WALK_STALE_DAYS; }
  return true;
}

function invCard(bin, bucket) {
  const warns = invLocWarnings(bin, bucket);
  const n = invBucketCount(bucket);
  const parts = [
    [bucket.molds.length, "molds"], [bucket.boards.length, "boards"],
    [bucket.panels.length, "panels"], [bucket.jigs.length, "jigs"],
    [bucket.fabric.length, "fabric"], [bucket.resin.length, "resin"],
    [bucket.consumables.length, "consumables"], [bucket.parts.length, "parts"],
  ].filter(([c]) => c);
  const age = invDaysSince(bin.walkedAt);
  const alert = warns.some(w => w.cls === "bad");
  /* A <button> containing <div>s is not a content model any browser is obliged
     to honour, and it structurally forbids a second control on the card — which
     is exactly what the monthly walk needs. So: one real button on the name,
     stretched over the whole card by its ::after, and Confirm as a SIBLING
     sitting above it on the z-axis. Two real buttons, both tab-reachable, both
     announced.
     The container ALSO carries the open handler, as a pointer-only backstop:
     the ::after stretch depends on stacking-context subtleties that have
     already failed for Simon on at least one engine, and a chip gaining
     position/z-index later would silently punch a dead zone in it. Keyboard
     access stays on the real buttons; Confirm stops propagation so it never
     also opens the shelf. Firing both the button and the backstop is harmless
     — selectInvRec is idempotent. */
  return `<div class="loccard ${alert ? "alert" : ""} ${n ? "" : "isempty"}" title="${esc(bin.id)}" onclick="selectInvRec('${esc(bin.id)}')">
    ${warns.map(w => `<div class="lc-warn ${w.cls}">${icon("warning", 12)} ${esc(w.text)}</div>`).join("")}
    <div class="lc-hd">
      <button class="lc-open lc-name" onclick="event.stopPropagation();selectInvRec('${esc(bin.id)}')">${esc(bin.name || bin.id)}</button>
      ${bin.locKind ? `<span class="kind">${esc(bin.locKind)}</span>` : ""}
      ${bin.flam === "Yes" ? `<span class="kind lc-flam" title="Rated for flammables">◆ flam</span>` : ""}</div>
    <div class="lc-body">${n ? parts.map(([c, l]) => `<span>${c} ${l}</span>`).join(" · ") : '<span class="muted">nothing on it</span>'}</div>
    ${age != null && age <= INV_WALK_STALE_DAYS ? "" :
      `<div class="lc-foot tny muted">${age == null ? "contents never confirmed" : `walked ${age}d ago ⚠`}</div>`}
    <button class="sm lc-act no-print" onclick="event.stopPropagation();invConfirmContents('${esc(bin.id)}')">${icon("check", 13)} Confirm</button>
  </div>`;
}

function renderInvMap() {
  const idx = invIndex();
  const q = String(view.q || "").toLowerCase().trim();
  const flag = view.invFlag || "";
  const all = invActiveBins();
  const bins = all.filter(b => {
    const bucket = idx.by.get(b.id) || invEmptyBucket();
    return invBinMatches(b, bucket, q) && invBinFlagged(b, bucket, flag);
  });
  const bySite = new Map();
  bins.forEach(b => {
    const s = b.site || "Unassigned";
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s).push(b);
  });
  const siteOrder = [...INV_SITES.filter(s => bySite.has(s)), ...[...bySite.keys()].filter(s => !INV_SITES.includes(s))];
  /* Alerts first, then never-walked, then stale, then by name. Fixed, not
     configurable: the map's job is to put what is wrong in front of you, and
     Firestore arrival order — which is what it used before — is not an order. */
  const rank = (b) => {
    const bucket = idx.by.get(b.id) || invEmptyBucket();
    if (invLocWarnings(b, bucket).some(w => w.cls === "bad")) return 0;
    const d = invDaysSince(b.walkedAt);
    if (d == null) return 1;
    if (d > INV_WALK_STALE_DAYS) return 2;
    return 3;
  };
  /* Within one rank, a shelf with something on it comes first. Emptiness is
     not an attention state — an unwalked empty shelf still needs walking — so
     it breaks ties rather than overriding the rank, which keeps every shelf on
     the map without letting a row of empties push the substantive ones down. */
  const isEmpty = (b) => invBucketCount(idx.by.get(b.id) || invEmptyBucket()) === 0;
  for (const arr of bySite.values()) {
    arr.sort((a, b) => rank(a) - rank(b)
      || (isEmpty(a) ? 1 : 0) - (isEmpty(b) ? 1 : 0)
      || String(a.name || a.id).localeCompare(String(b.name || b.id)));
  }
  /* Empty shelves used to collapse into a one-line text strip, on the argument
     that an empty recently-walked shelf is a fact rather than a card. It cost
     more than it saved. The map is the picture of the shop, and a shelf you
     cannot see on it is a shelf you forget you own — which is the opposite of
     what a storage map is for. The strip was also the one place on this page
     where clicking the row did nothing: only the name itself was a target, so
     "click a shelf to see what is on it" stopped being true halfway down.
     Every location is a card. An empty one is quieter, not hidden. */
  const emptyCount = (s) => bySite.get(s).filter(isEmpty).length;

  const filtering = !!(q || flag);
  return `
  ${invToolbar("map")}
  ${invSummaryChips(idx)}
  <div class="filters no-print">
    <input id="searchbox" placeholder="shelf, site, or what is on it…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    ${filtering ? `<button class="sm" onclick="view.q='';view.invFlag='';render()">Clear</button>` : ""}
  </div>
  ${invNowhereBar(idx)}
  ${invRestockHtml()}
  ${invIncomingHtml()}
  ${!all.length
    ? `<div class="card">No storage locations yet. <b>+ Location</b> for each shelf, rack and bin (CS-011 §7.3 names them),
       print its label from the record, and stick it on the front edge. Then everything else in the shop can say where it lives.</div>`
    : !bins.length
    ? `<div class="card">Nothing matches${q ? ` “${esc(view.q)}”` : ""}${flag ? " and that filter" : ""}. <b>${all.length}</b> locations in total.</div>`
    : siteOrder.map(s => {
        const rows = bySite.get(s);
        const nEmpty = emptyCount(s);
        return `<div class="inv-site">
          <div class="pgrouphd"><span class="pg-name">${esc(s)}</span>
            <span class="pg-n">${rows.length} location${rows.length === 1 ? "" : "s"}</span>
            ${nEmpty ? `<span class="pg-n">${nEmpty} empty</span>` : ""}</div>
          <div class="locgrid">${rows.map(b => invCard(b, idx.by.get(b.id) || invEmptyBucket())).join("")}</div>
        </div>`;
      }).join("")}`;
}

/* Unhoused things used to render as a dashed card appended to whichever site
   group happened to sort LAST, so "nothing has a home" was positioned by an
   accident of site ordering. It is not a shelf and does not belong in a grid of
   shelves; it is a bar, above them, where the counts are. */
function invNowhereBar(idx) {
  const n = invBucketCount(idx.un);
  const legacy = idx.legacyParts.length;
  if (!n && !legacy) return "";
  const bits = Object.entries(idx.un).filter(([, arr]) => arr.length).map(([k, arr]) => `${arr.length} ${k}`);
  return `<div class="inv-nowhere-bar no-print">
    <span>${icon("warning", 14)} <b>No location</b> — ${esc(bits.join(" · ") || "nothing")}${legacy ? ` · ${legacy} part${legacy === 1 ? "" : "s"} with free-text locations` : ""}</span>
    <button class="sm" onclick="selectInvRec('NOWHERE')">Put them away ▸</button>
  </div>`;
}

/* Each view's primary action is the thing that view is ABOUT. + Location used
   to sit on all four, which put "make a new shelf" on the items list — a page
   about what is stored, not about where — and left the map, which is the
   picture of the shelves, without it. Simon: "it makes more sense to have
   adding locations being on the storage map page." */
function invToolbar(active) {
  const seg = (id, label) => `<button class="ib ${active === id ? "primary" : ""}" ${active === id ? "" : `onclick="view.invView='${id}';view.mode='list';view.id=null;render()"`}>${label}</button>`;
  const primary = active === "boards" ? `<button class="primary ib" onclick="newBoard()">+ Board</button>`
    : active === "map" ? `<button class="primary ib" onclick="newShopRec('items','BIN')">+ Location</button>`
    : "";
  return `<div class="toolbar no-print">
    ${seg("map", "Storage map")}${seg("items", "Items list")}${seg("lots", "Materials list")}${seg("boards", "Boards")}
    <span style="flex:1"></span>
    ${primary}
    <button class="ib" onclick="invReceive('')">${icon("plus", 15)} Receive a delivery</button>
    ${rxResumeChip()}
    <button class="ib" onclick="openLabelBuilder('items')">${icon("print", 15)} Labels</button>
    ${customLabelBtn()}
    <button class="ib" onclick="invExportModal()">${icon("download", 15)} Export</button>
    ${/* Bulk-links the containers campus EH&S already tagged, from the RSS
          export. Lead-only, like the mold import — it mints records. */""}
    ${isLead() && typeof openEhsImport === "function" ? `<button class="ib" onclick="openEhsImport()">${icon("upload", 15)} EH&S import</button>` : ""}
  </div>`;
}

/* ---------- one location's contents ---------- */
function invRow(coll, o, pill, opts) {
  const tab = tabForId(o.id) || "inventory";
  const pick = !!(opts && opts.pick);
  const ticked = pick && !!(view.shopPick || {})[o.id];
  return `<div class="pmini invrow ${ticked ? "picked" : ""}" ${pick ? `aria-selected="${ticked}"` : ""}
      onclick="${pick ? `toggleShopPick('${esc(o.id)}')` : `openRecord('${esc(tab)}','${esc(o.id)}')`}">
    ${pick ? `<input type="checkbox" ${ticked ? "checked" : ""} aria-label="Select ${esc(o.id)}"
      onclick="event.stopPropagation();toggleShopPick('${esc(o.id)}')">` : ""}
    <span class="pm-name">${esc(o.name || o.partName || o.label || o.id)}</span>
    <span class="tny muted">${esc(o.id)}</span>
    ${/* Prices ride along on the shelf view so browsing the map teaches what
          things cost — the anti-tribal-knowledge surface Simon picked. */""}
    ${typeof o.unitCost === "number" ? `<span class="tny muted">${esc(shopMoneyText(o, "unitCost"))}</span>` : ""}
    ${coll === "lots" ? invLotFacts(o) : ""}
    ${pill || ""}
    <button class="sm no-print" onclick="event.stopPropagation();quickMove('${esc(coll)}','${esc(o.id)}')">Move</button>
  </div>`;
}
function invLotPill(o) {
  if (lotExpired(o)) return `<span class="pill OnHold">expired</span>`;
  if (lotIsLow(o)) return `<span class="pill OnHold">low</span>`;
  return `<span class="pill ${o.stage === "Open" ? "InWork" : "Draft"}">${esc(o.stage || "—")}</span>`;
}

/* The facts a person otherwise clicks into a record for, said on the row:
   the EH&S tag (the code on the physical container — until now the shelf view
   never showed it, so ten identical jugs were told apart by an id that is on
   no sticker), the expiry, and a flammable marker.

   THE ROW SHOWS THE EDGE PRINT, WITH THE LAST GROUP CARRYING THE WEIGHT.
   A UC tag reprints its last twelve characters rotated down the right edge, and
   that strip is what survives a label wrapped round a bottle neck or wiped with
   acetone, so it is what somebody comparing this row against the jug in their
   hand is actually reading. But it is not what tells two jugs apart.

   Simon's RSS export of 2026-08-28 settles that with 627 real tags rather than
   an argument: positions 0-18 are IDENTICAL in every one of them, only the last
   five characters vary at all, and across FEB's own 50 containers only the last
   THREE do. So a twelve-character strip at one weight is nine glyphs of shared
   prefix in front of the three that matter, and a column of ten of them is
   unreadable — which is what shipping it in v4.1.0 proved when the four
   candidates were photographed side by side against that real data.

   Hence: the whole strip, in the label's four-character groups, with the last
   group at full weight and the rest dimmed. The comparison against the sticker
   still works because every printed character is present. The scan down a
   column works because the eye has a fixed target. Emphasising the last GROUP
   rather than the last three characters keeps it a property of the label's
   grammar instead of a property of this export, so a future batch that varies
   further left needs no change here.

   (The alternative, and it was a real one: show only the last six, as v4.0.0
   did. It is compact and it cannot collide. It was dropped because "…243EF0"
   is a string printed nowhere on the tag, so the eye has to translate before it
   can compare, and comparing is the whole reason the row carries a code.)

   A tag that does not fit the printed grammar is marked rather than hidden:
   almost always a typo, and the shelf view is where somebody notices. */
function invEhsShort(o) {
  const c = String(o.ehsBarcode || "");
  if (!c) return "";
  const shape = ehsShape(c);
  const t = ehsTailText(c);
  const cut = t.lastIndexOf(" ");
  const body = cut < 0
    ? `<b>${esc(t)}</b>`
    : `<span class="ehs-dim">${esc(t.slice(0, cut + 1))}</span><b>${esc(t.slice(cut + 1))}</b>`;
  const title = `EH&S tag ${ehsPrinted(c)}` + (shape.ok ? "" : ` — this ${shape.why}`);
  return `<span class="ehs-code${shape.ok ? "" : " ehs-odd"}" title="${esc(title)}">${body}${shape.ok ? "" : " ?"}</span>`;
}
function invLotFacts(o) {
  return [
    o.hazard === "flammable" ? `<span class="kind lc-flam" title="Flammable">◆</span>` : "",
    o.expiresOn ? `<span class="tny ${lotExpired(o) ? "bad" : "muted"}">exp ${esc(o.expiresOn)}</span>` : "",
    invEhsShort(o),
  ].filter(Boolean).join("");
}

/* ---------- identical containers fold into one line ----------
 *
 * The EH&S import created ten AT30 jugs as ten records, which is correct —
 * one tag, one container — and unreadable as ten identical rows. So lot rows
 * group by material: matKey when set, else the name. One line per material
 * carrying the count and the aggregate facts; opening it lists the containers
 * with their EH&S codes, which is the only way to tell jug six from jug seven
 * while holding one of them.
 *
 * The fold is a CLASS, not a <details>: this page prints as the stock walk,
 * and a closed details element skips painting (the ban at index.html's mobile
 * rail comment). A print rule forces the member lists visible on paper. */
function lotGroupKey(o) {
  const k = String(o.matKey || "").trim().toLowerCase();
  return k ? "m:" + k : "n:" + String(o.name || o.id).trim().toLowerCase();
}
function groupLots(arr) {
  const m = new Map();
  for (const o of arr || []) {
    const key = lotGroupKey(o);
    if (!m.has(key)) m.set(key, { key, name: o.name || o.id, members: [] });
    m.get(key).members.push(o);
  }
  return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function invLotOpenState(key) { return !!(view.invLotOpen || {})[key]; }
function toggleLotGroup(key) {
  view.invLotOpen = { ...(view.invLotOpen || {}) };
  view.invLotOpen[key] = !view.invLotOpen[key];
  render();
}

/* The group line: everything worth knowing without opening it. States,
   soonest expiry, flammability, price — and the count in bold, because "how
   many do we have" is the question the line exists to answer. */
function invGroupRow(g, opts) {
  const o = opts || {};
  const open = invLotOpenState(g.key) || !!o.pick;   // picking auto-opens: you tick what you can see
  const n = g.members.length;
  const pickedAll = o.pick && g.members.every(m => (view.shopPick || {})[m.id]);
  const pickedSome = o.pick && !pickedAll && g.members.some(m => (view.shopPick || {})[m.id]);
  const groupBox = o.pick ? `<input type="checkbox" ${pickedAll ? "checked" : ""}
      aria-label="Select all ${n} ${esc(g.name)}" ${pickedSome ? 'data-mixed="1"' : ""}
      onclick="event.stopPropagation();shopPickGroup('${esc(g.key)}')">` : "";
  const byStage = new Map();
  for (const m of g.members) byStage.set(m.stage || "—", (byStage.get(m.stage || "—") || 0) + 1);
  const states = [...byStage.entries()].map(([s, c]) => `${c} ${String(s).toLowerCase()}`).join(" · ");
  const expDates = g.members.map(m => m.expiresOn).filter(Boolean).sort();
  const anyExpired = g.members.some(lotExpired);
  const anyLow = g.members.some(lotIsLow);
  const flam = g.members.some(m => m.hazard === "flammable");
  const cost = g.members.find(m => typeof m.unitCost === "number");
  const pill = anyExpired ? `<span class="pill OnHold">expired</span>`
    : anyLow ? `<span class="pill OnHold">low</span>` : "";
  return `<div class="pmini invrow invgrp" role="button" tabindex="0" aria-expanded="${open}"
      onclick="toggleLotGroup('${esc(g.key)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLotGroup('${esc(g.key)}')}">
    ${groupBox}
    <span class="grp-caret">${open ? "▾" : "▸"}</span>
    <span class="pm-name">${esc(g.name)} <b class="grp-n">×${n}</b></span>
    ${flam ? `<span class="kind lc-flam" title="Flammable">◆</span>` : ""}
    ${expDates.length ? `<span class="tny ${anyExpired ? "bad" : "muted"}">${anyExpired ? "expired" : "first exp " + esc(expDates[0])}</span>` : ""}
    ${cost ? `<span class="tny muted">${esc(shopMoneyText(cost, "unitCost"))}</span>` : ""}
    ${typeof matForLot === "function" ? matInfoHtml(matForLot(g.members[0]), { lite: true }) : ""}
    <span class="tny muted grp-states">${esc(states)}</span>
    ${pill}
  </div>
  <div class="invgrp-body ${open ? "" : "folded"}">
    ${g.members.map(m => invMemberRow(m, o)).join("")}
  </div>`;
}

/* One container inside an opened group. The EH&S code IS the row's identity —
   it is the sticker on the jug in your hand — with the FEB id as the quieter
   second fact. */
function invMemberRow(o, opts) {
  const loc = opts && opts.showLoc;
  const pick = !!(opts && opts.pick);
  const ticked = pick && !!(view.shopPick || {})[o.id];
  const where = loc ? shopById("items", o.location || "") : null;
  return `<div class="pmini invrow invmem ${ticked ? "picked" : ""}" ${pick ? `aria-selected="${ticked}"` : ""}
      onclick="${pick ? `toggleShopPick('${esc(o.id)}')` : `openRecord('lots','${esc(o.id)}')`}">
    ${pick ? `<input type="checkbox" ${ticked ? "checked" : ""} aria-label="Select ${esc(o.id)}"
      onclick="event.stopPropagation();toggleShopPick('${esc(o.id)}')">` : ""}
    <span class="pm-name tny">${esc(o.id)}</span>
    ${loc ? `<span class="tny muted">${where ? esc(where.name || where.id) : "(no location)"}</span>` : ""}
    ${o.openedOn ? `<span class="tny muted">opened ${esc(o.openedOn)}</span>` : ""}
    ${o.expiresOn ? `<span class="tny ${lotExpired(o) ? "bad" : "muted"}">exp ${esc(o.expiresOn)}</span>` : ""}
    ${invEhsShort(o) || `<span class="tny muted">no EH&S tag</span>`}
    ${invLotPill(o)}
    <button class="sm no-print" onclick="event.stopPropagation();quickMove('lots','${esc(o.id)}')">Move</button>
  </div>`;
}

/* Group rows and singleton rows out of one list. A group of one renders as a
   plain row — nothing changes for the mold release that exists once. */
function invLotList(arr, opts) {
  return groupLots(arr).map(g => g.members.length === 1
    ? invRow("lots", g.members[0], invLotPill(g.members[0]), opts)
    : invGroupRow(g, opts)).join("");
}

/* A section of the location page: its own CARD, the way the Boards tab gives
   every group its own — one blob per kind (Simon, 2026-08-28: sections need
   more visual distinction than a header strip inside one long card). The
   kind's accent runs down the card's left spine, and the count is in the
   header because "19 resin" should not require counting rows by eye. */
function invGroup(title, rows, meta, secCls) {
  if (!rows) return "";
  return `<div class="card invsec ${secCls || ""}">
    <div class="pgrouphd"><span class="pg-name">${esc(title)}</span>${meta ? `<span class="pg-n">${esc(meta)}</span>` : ""}</div>
    ${rows}
  </div>`;
}

/* "14 containers · 4 materials", or just the count when they are the same. */
function invLotMeta(arr) {
  if (!arr.length) return "";
  const mats = groupLots(arr).length;
  return mats === arr.length ? String(arr.length) : `${arr.length} containers · ${mats} materials`;
}

function renderInvContents(bin) {
  /* view.edit flips to the plain record editor for the location itself; the
     shop detail's own Done button flips back here. */
  if (view.edit) return `<section class="mddetail">${renderShopDetail("items", { embedded: true, back: "clearInvSelection", move: null, backLabel: "Storage map" })}</section>`;
  const idx = invIndex();
  const nowhere = bin === "NOWHERE";
  const b = nowhere ? { id: "NOWHERE", name: "No location", stage: "" } : bin;
  const bucket = nowhere ? idx.un : (idx.by.get(b.id) || invEmptyBucket());
  const warns = nowhere ? [] : invLocWarnings(b, bucket);
  const age = nowhere ? null : invDaysSince(b.walkedAt);
  const addBtn = (cls, label) => `<button class="sm" onclick="newShopRec('${cls === "PNL" || cls === "JIG" ? "items" : "lots"}','${cls}',{location:'${esc(b.id)}'})">+ ${label}</button>`;
  const flag = view.invFlag === "reorder";
  const lotVisible = arr => arr.filter(o => !flag || lotIsLow(o) || lotExpired(o));
  const lotRows = arr => invLotList(lotVisible(arr));

  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="clearInvSelection()">${icon("chevronLeft", 16)} Storage map</button>
    ${nowhere ? "" : `<button class="primary ib" onclick="view.edit=true;render()">${icon("edit", 15)} Edit location</button>`}
    ${nowhere ? "" : labelBtn("items", b.id)}
    ${customLabelBtn()}
    ${nowhere ? "" : `<button class="ib" onclick="invMoveHere('${esc(b.id)}')">${icon("search", 15)} Move here (scan)</button>`}
    ${nowhere ? "" : `<button class="ib" onclick="invReceive('${esc(b.id)}')">${icon("plus", 15)} Receive delivery</button>`}
    ${nowhere ? "" : `<button class="ib" onclick="invConfirmContents('${esc(b.id)}')">${icon("check", 15)} Confirm contents</button>`}
  </div>
  <div class="card">
    <h2>${esc(b.name || b.id)}</h2>
    <div class="muted">${nowhere ? "Everything that has no recorded location. House these." : `${esc(b.id)}${b.site ? " · " + esc(b.site) : ""}${b.locKind ? " · " + esc(b.locKind) : ""}${b.flam === "Yes" ? " · rated for flammables" : ""}${age != null ? ` · contents confirmed ${age}d ago${b.walkedBy ? " by " + esc(b.walkedBy) : ""}` : " · contents never confirmed"}`}</div>
    ${warns.map(w => `<div class="warn">${icon("warning", 14)} ${esc(w.text)}</div>`).join("")}
    ${invBucketCount(bucket) === 0 ? `<p class="muted">Nothing recorded here yet.</p>` : ""}
  </div>
  ${/* Each kind is its own card, sibling to the header — the Boards idiom.
        One blob per section, accent down the spine. */""}
  ${invGroup("Molds", bucket.molds.map(o => invRow("molds", o, `<span class="pill ${shopStageClass(shopSpec("molds"), o)}">${esc(o.stage || "—")}</span>`)).join(""), String(bucket.molds.length || ""), "sec-molds")}
  ${invGroup("Tooling boards", bucket.boards.map(o => invRow("stock", o, `<span class="tny muted">${fmtDim(o.len)} × ${fmtDim(o.wid)} × ${fmtDim(o.thk)}</span>`)).join(""), String(bucket.boards.length || ""), "sec-boards")}
  ${invGroup("Test panels", bucket.panels.map(o => invRow("items", o, `<span class="pill">${esc(o.stage || "—")}</span>`)).join(""), String(bucket.panels.length || ""), "sec-panels")}
  ${invGroup("Jigs", bucket.jigs.map(o => invRow("items", o, `<span class="pill">${esc(o.stage || "—")}</span>`)).join(""), String(bucket.jigs.length || ""), "sec-jigs")}
  ${invGroup("Resin / hardener", lotRows(bucket.resin), invLotMeta(lotVisible(bucket.resin)), "sec-resin")}
  ${invGroup("Fabric", lotRows(bucket.fabric), invLotMeta(lotVisible(bucket.fabric)), "sec-fabric")}
  ${invGroup("Consumables", lotRows(bucket.consumables), invLotMeta(lotVisible(bucket.consumables)), "sec-consumables")}
  ${invGroup("Parts stored here", bucket.parts.map(o => invRow("parts", o, "")).join(""), String(bucket.parts.length || ""), "sec-parts")}
  ${nowhere && idx.legacyParts.length ? invGroup("Parts with free-text locations (legacy)",
    idx.legacyParts.map(p => `<div class="pmini" onclick="openRecord('parts','${esc(p.id)}')">
      <span class="pm-name">${esc(p.partName || p.id)}</span><span class="tny muted">"${esc(p.moldLocation)}"</span></div>`).join(""), String(idx.legacyParts.length), "sec-parts") : ""}
  ${nowhere ? "" : `<div class="card no-print"><div class="lg-label tny">Add here</div>
    ${addBtn("PNL", "Test panel")}${addBtn("JIG", "Jig")}${addBtn("FAB", "Fabric")}${addBtn("RSN", "Resin / hardener")}${addBtn("CON", "Consumable")}</div>`}`;
}

/* Standing at the shelf with a pile of things: scan each thing, it moves HERE.
   The inverse of quickMove, for restocking. */
function invMoveHere(binId) {
  openScan({
    title: "Move things here",
    hint: "Scan the label on each thing you are putting on this shelf — ours, or the UC EH&S tag on a chemical. The camera stays open.",
    sticky: true,
    accept: id => /^(MOLD|PNL|JIG|FAB|RSN|CON|BRD|P)-/.test(String(id)),
    onCode: id => {
      const tab = tabForId(id);
      const coll = tab ? (TABS.find(t => t.id === tab) || {}).coll : null;
      if (!coll || !recById(coll, id)) { toast(`Don't recognise ${id}.`, "error"); return; }
      setLocation(coll, id, binId);
    },
  });
}

/* The stock walk, one tap per shelf: "I looked, this list is true". CS-011
   §7.1 wants a monthly walk and §8 scores it; walkedAt is the record. */
function invConfirmContents(binId) {
  const b = shopById("items", binId);
  if (!b) return;
  // One write, and the email with the name, so the walk is linked to the
  // person who did it from the moment it is recorded.
  if (guestBlocked()) return;
  savePatch("items", b, { walkedAt: new Date().toISOString().slice(0, 10), ...personPatch("walkedBy", myEmail(), signerName()) });
  toast(`${b.name || b.id} confirmed — thanks for walking it.`);
  render();
}

/* An unfinished sheet is invisible once you navigate away from it, and
   twenty minutes of typing that nothing on screen mentions is twenty
   minutes people assume they lost. */
function rxResumeChip() {
  if (typeof rxDraftLoad !== "function") return "";
  const d = (typeof RX !== "undefined" && RX) ? RX : rxDraftLoad();
  const n = d && d.rows ? d.rows.filter(r => String(r.name || "").trim()).length : 0;
  if (!n) return "";
  return `<button class="ib" onclick="invReceive('')">${icon("edit", 15)} Finish ${n} line${n === 1 ? "" : "s"}</button>`;
}

/* ---------- the way out ----------
 *
 * The escape hatch, and it is deliberately a good one. A team that suspects it
 * cannot get its data back out keeps a shadow spreadsheet, and a shadow
 * spreadsheet is the thing this whole tab exists to replace.
 *
 * Two sheets, both built from the invIndex() join rather than dumped per
 * collection. Blank cells in a spreadsheet are free; a cross-sheet formula is
 * not, and four raw dumps would make "what is this worth" and "what expires
 * next" into lookups. Location ids resolve to shelf NAMES — a sheet full of
 * BIN-SN6-001 is useless to a human — and every row carries a URL back, so the
 * hatch is not a one-way door.
 *
 * Both come out of ONE row builder, so the CSV and the clipboard can never
 * disagree about what an export is. */

function invExportRows(opts) {
  const o = opts || {};
  const names = invLocNames();
  const bins = new Map((DB.items || []).filter(b => b.cls === "BIN").map(b => [b.id, b]));
  const rows = [];
  const push = (kind, rec, extra) => {
    const bin = bins.get(String(rec.location || rec.moldLocation || "")) || null;
    const where = invWhere(rec, names);
    rows.push({
      id: rec.id, kind,
      name: rec.name || rec.partName || rec.label || "",
      state: rec.stage || "",
      site: bin ? (bin.site || "") : "",
      location: where ? where.name : "(no location)",
      locationId: bin ? bin.id : "",
      locKind: bin ? (bin.locKind || "") : "",
      matKey: rec.matKey || "",
      vendorLot: rec.vendorLot || "", supplier: rec.supplier || "",
      howFull: rec.qty || "", count: rec.count == null ? "" : rec.count,
      receivedOn: rec.receivedOn || "", openedOn: rec.openedOn || "", expiresOn: rec.expiresOn || "",
      role: rec.role || "", hazard: rec.hazard || "",
      unitCost: typeof rec.unitCost === "number" ? rec.unitCost : "",
      costUnit: rec.costUnit || "",
      dims: extra && extra.dims ? extra.dims : "",
      warnings: [
        lotExpired(rec) ? "expired" : "",
        lotIsLow(rec) ? "running low" : "",
        (rec.hazard === "flammable" && bin && bin.flam !== "Yes") ? "flammable, not a rated location" : "",
      ].filter(Boolean).join("; "),
      shelfWalkedAt: bin ? (bin.walkedAt || "") : "",
      shelfWalkedBy: bin ? (bin.walkedBy || "") : "",
      url: SCAN_HOST + SCAN_PATH + rec.id,
    });
  };

  /* The map's own filters are display decisions and have no business in a
     physical count: invIndex skips Empty lots and Retired molds, and an empty
     jug you still own is a row. They are marked in `state`, not dropped. */
  for (const m of DB.molds || []) if (o.includeRetired !== false || m.stage !== "Retired") push("Mold", m);
  for (const b of DB.stock || []) push("Board", b, { dims: [b.len, b.wid, b.thk].every(x => x) ? `${fmtDim(b.len)} x ${fmtDim(b.wid)} x ${fmtDim(b.thk)}` : "" });
  for (const it of DB.items || []) {
    if (it.cls === "PNL") push("Test panel", it);
    if (it.cls === "JIG") push("Jig", it);
  }
  for (const l of DB.lots || []) {
    if (o.includeEmpty === false && l.stage === "Empty") continue;
    push(l.cls === "FAB" ? "Fabric" : l.cls === "RSN" ? "Resin" : "Consumable", l);
  }
  for (const p of DB.parts || []) if (p.moldLocation) push("Part", p);
  return rows.sort((a, b) => String(a.location).localeCompare(String(b.location)) || cmpId(a.id, b.id));
}

function invExportLocations() {
  const idx = invIndex();
  return invBins().map(b => {
    const k = idx.by.get(b.id) || invEmptyBucket();
    const warns = invLocWarnings(b, k);
    return {
      id: b.id, name: b.name || b.id, site: b.site || "", locKind: b.locKind || "",
      flam: b.flam || "", stage: b.stage || "",
      molds: k.molds.length, boards: k.boards.length, panels: k.panels.length, jigs: k.jigs.length,
      fabric: k.fabric.length, resin: k.resin.length, consumables: k.consumables.length, parts: k.parts.length,
      total: invBucketCount(k),
      walkedAt: b.walkedAt || "", walkedBy: b.walkedBy || "",
      warnings: warns.map(w => w.text).join("; "),
      url: SCAN_HOST + SCAN_PATH + b.id,
    };
  }).sort((a, b) => String(a.site).localeCompare(String(b.site)) || String(a.name).localeCompare(String(b.name)));
}

/* The reconciliation sheet: our chemical containers against the campus RSS
   inventory, one row per RSN/CON lot plus one per shelf wearing an RSS
   sublocation tag. Sorted so the rows with something to fix come first — a
   container with no EH&S tag is exactly what an EH&S walk will flag, and an
   emptied one is what RSS still thinks exists. Compare on the `ehsBarcode`
   column; ours and theirs agree on it by construction.

   TWO COLUMNS FOR ONE CODE, and they do different jobs. `ehsBarcode` is the
   comparison form — no spaces, no punctuation — so a VLOOKUP against the RSS
   export lands. `printed` is the same code in the tag's own four-character
   groups, for the half of this job that is done on foot with the sheet on a
   clipboard: it is what the sticker says, character for character. Deleting
   `printed` would not break the compare, and would make the walk hard. */
function invExportEhs() {
  const names = invLocNames();
  const rows = [];
  for (const l of DB.lots || []) {
    if (l.cls !== "RSN" && l.cls !== "CON") continue;
    const where = invWhere(l, names);
    const shape = ehsShape(l.ehsBarcode);
    rows.push({
      ehsBarcode: ehsKey(l.ehsBarcode),
      printed: ehsPrinted(l.ehsBarcode),
      id: l.id, kind: l.cls === "RSN" ? "Resin / hardener" : "Consumable",
      name: l.name || "", state: l.stage || "", howFull: l.qty || "",
      location: where ? where.name : "(no location)",
      receivedOn: l.receivedOn || "", openedOn: l.openedOn || "",
      emptiedOn: l.emptiedOn || "", expiresOn: l.expiresOn || "",
      hazard: l.hazard || "",
      note: [
        !l.ehsBarcode ? "no EH&S tag on record" : "",
        /* A tag that is not 24 characters will not match anything in the RSS
           export, so the walk would report it as "we have a jug they do not"
           when the truth is a mistyped code. Say which it is. */
        !shape.ok ? `check the tag: it ${shape.why}` : "",
        l.stage === "Empty" && l.ehsBarcode ? "emptied — retire it in RSS too" : "",
      ].filter(Boolean).join("; "),
      url: SCAN_HOST + SCAN_PATH + l.id,
    });
  }
  for (const b of (DB.items || []).filter(b => b.cls === "BIN" && b.ehsBarcode)) {
    const shape = ehsShape(b.ehsBarcode);
    rows.push({
      ehsBarcode: ehsKey(b.ehsBarcode),
      printed: ehsPrinted(b.ehsBarcode),
      id: b.id, kind: "Storage location",
      name: b.name || "", state: b.stage || "", howFull: "",
      location: b.site || "", receivedOn: "", openedOn: "", emptiedOn: "", expiresOn: "",
      hazard: "",
      note: ["RSS sublocation tag", shape.ok ? "" : `check the tag: it ${shape.why}`].filter(Boolean).join("; "),
      url: SCAN_HOST + SCAN_PATH + b.id,
    });
  }
  return rows.sort((a, b) => (a.note ? 0 : 1) - (b.note ? 0 : 1) || cmpId(a.id, b.id));
}

const INV_EXPORTS = {
  flat: { file: "inventory", label: "Everything on every shelf",
          blurb: "One row per physical thing, with the shelf it is on.",
          rows: (o) => invExportRows(o) },
  locations: { file: "inventory-locations", label: "Locations",
               blurb: "One row per shelf, rack and bin, with counts and the last stock walk.",
               rows: () => invExportLocations() },
  ehs: { file: "ehs-reconciliation", label: "EH&S reconciliation",
         blurb: "Chemical containers with their EH&S barcodes, for checking against the campus RSS inventory. Rows needing attention sort first.",
         rows: () => invExportEhs() },
};
function invExportCols(which, rows) {
  const seen = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.includes(k)) seen.push(k);
  return seen.map(k => ({ label: k, get: (r) => r[k] }));
}
function invExportOpts() {
  const el = document.getElementById("x-all");
  const all = el ? !!el.checked : true;
  return { includeEmpty: all, includeRetired: all };
}

/* TSV is STRIPPED, not quoted. Quoted TSV is the classic bug here: Sheets does
   not reliably unquote on paste, so a quoted shelf name arrives wearing its
   quotes. A tab or newline inside a value becomes a space. */
function toTSV(rows, cols) {
  const cell = v => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ");
  return [cols.map(c => cell(c.label)).join("\t")]
    .concat(rows.map(r => cols.map(c => cell(c.get(r))).join("\t"))).join("\n");
}

/* Three tiers, and the third is the one that matters.
   Tier 1 needs a secure context AND a live user gesture. It is feature-detected
   SYNCHRONOUSLY so that when it is absent we reach tier 2 inside the same
   gesture turn — awaiting first would burn the gesture and make execCommand
   fail too. Tier 3 exists because downloadBlob revokes its object URL on the
   line after click() with the anchor never attached, which iOS Safari
   frequently turns into nothing at all: the person most likely to need this is
   standing in a shop with a phone. */
async function copyText(text, what) {
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      toast(what + " copied — paste into a blank Google Sheet.");
      return true;
    } catch (e) { /* denied, or the document was not focused */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    if (ta.setSelectionRange) ta.setSelectionRange(0, text.length);   // iOS ignores select() on readonly
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) { toast(what + " copied — paste into a blank Google Sheet."); return true; }
  } catch (e) { /* fall through to showing it */ }
  openModal(`<h2>Copy this</h2>
    <p class="muted tny">Your browser would not let the app reach the clipboard. Tap the box,
      select all, copy, and paste it into a blank Google Sheet.</p>
    <textarea class="copyout" readonly onclick="this.select()">${esc(text)}</textarea>
    <div class="foot"><button class="primary" onclick="closeModal()">Done</button></div>`);
  return false;
}

function invExportCSV(which) {
  const s = INV_EXPORTS[which]; if (!s) return;
  const rows = s.rows(invExportOpts());
  downloadCSV(`feb-${s.file}-${today()}.csv`, toCSV(rows, invExportCols(which, rows)));
  toast(`${rows.length} row${rows.length === 1 ? "" : "s"} downloaded.`);
}
function invExportCopy(which) {
  const s = INV_EXPORTS[which]; if (!s) return;
  const rows = s.rows(invExportOpts());
  copyText(toTSV(rows, invExportCols(which, rows)), `${rows.length} row${rows.length === 1 ? "" : "s"}`);
}

function invExportModal() {
  const n = (which) => INV_EXPORTS[which].rows({ includeEmpty: true, includeRetired: true }).length;
  openModal(`<h2>Export inventory</h2>
    <p class="muted tny">For a Google Sheet, Copy beats a download — paste it straight into a blank
      sheet, and it works on a phone, where a browser download often silently does nothing.</p>
    ${Object.keys(INV_EXPORTS).map(k => `<div class="xgroup">
      <div class="xg-hd"><span class="xg-name">${esc(INV_EXPORTS[k].label)}</span>
        <span class="psum-chip"><b>${n(k)}</b> rows</span></div>
      <div class="muted tny">${esc(INV_EXPORTS[k].blurb)}</div>
      <div class="linkrow">
        <button class="primary" onclick="invExportCopy('${k}')">Copy for Sheets</button>
        <button onclick="invExportCSV('${k}')">Download .csv</button>
      </div>
    </div>`).join("")}
    <div class="field"><label><input type="checkbox" id="x-all" checked>
      include empty lots and retired molds</label>
      <span class="muted tny">The map hides them because they are not news. A physical count is
        not the map: something you still own is a row.</span></div>
    <div class="foot"><button class="primary" onclick="closeModal()">Done</button></div>`);
}

/* ---------- the tab ---------- */
function renderInventory() {
  /* The desk is a doing surface, not a view of anything, so it is checked
     before selection: you can be receiving without a record being open.
     But an open record wins — following a shelf chip out of the undo bar has
     to actually show you the shelf, not the sheet you just left. The sheet is
     still there when you come back, and the toolbar chip says so. */
  if (view.invView === "desk" && view.mode !== "detail") return renderInvDesk();
  const sel = invSelected();
  if (view.mode === "detail" && view.id === "NOWHERE") return renderInvContents("NOWHERE");
  if (sel && sel.kind === "bin" && sel.rec) return renderInvContents(sel.rec);
  /* Boards branch BEFORE the generic one below, which resolves anything that
     is not a lot to the items schema — a board handed to renderShopDetail
     ("items") is an id that is not in DB.items and paints an empty card. */
  if (sel && sel.kind === "size") { view.invView = "boards"; return invToolbar("boards") + boardSizePane(sel.rec); }
  if (sel && sel.kind === "board") { view.invView = "boards"; return invToolbar("boards") + boardPane(sel.rec); }
  if (sel && sel.rec) {
    const tab = sel.kind === "lot" ? "lots" : "items";
    return `<section class="mddetail">${renderShopDetail(tab, { embedded: true, back: "clearInvSelection", move: null, backLabel: "Storage map" })}</section>`;
  }
  if (sel && !sel.rec) { view.mode = "list"; view.id = null; }
  const v = ["items", "lots", "boards"].includes(view.invView) ? view.invView : "map";
  if (view.invView !== v) view.invView = v;
  if (v === "items") return invToolbar("items") + renderShopList("items");
  if (v === "lots") return invToolbar("lots") + renderShopList("lots");
  if (v === "boards") return invToolbar("boards") + renderBoardsList();
  return renderInvMap();
}

function invKeydown(e) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (typeof view === "undefined" || view.tab !== "inventory") return null;
  const t = e.target || {};
  const tag = String(t.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) {
    if (e.key === "Escape" && t.blur) { t.blur(); return "blur"; }
    return null;
  }
  if (e.key === "Escape" && view.mode === "detail") { clearInvSelection(); return "clear"; }
  if (e.key === "/") {
    if (e.preventDefault) e.preventDefault();
    const s = document.getElementById("searchbox");
    if (s && s.focus) s.focus();
    return "search";
  }
  return null;
}
document.addEventListener("keydown", invKeydown);

/* ---------- incoming: bought, not yet on a shelf ----------
 *
 * Simon's ruling: a purchase means BOUGHT, not received, and it says nothing
 * about where things went. The on-order record is the budget line itself, so
 * Incoming is a QUERY over DB.budget, never a second copy of the fact — and
 * the reconciliation runs from the created records' buyRef (the truth: the
 * lot exists), not from the line's best-effort lotRefs back-link, so a save
 * that half-landed self-heals at render instead of ghosting forever. */

const INV_STALE_ORDER_DAYS = 14;

/* How much of each ordered line has actually turned up.

   This used to be a Set of "buyId|lineId" — presence or absence — so a line
   was either fully received or fully outstanding. Six of ten arriving made the
   line vanish and the missing four leave the system permanently.

   `buyRef.n` is how many of the ordered line's units ONE record accounts for:
   1 for a roll, the count for a box of consumables. Received quantity is then
   a SUM over the records that exist, exactly as received-ness used to be the
   EXISTENCE of one. Same direction of trust, so Incoming stays a query and
   never a second copy of the fact — and undo needs nothing rolled back,
   because deleting the records re-derives the outstanding count.

   `legacy` is load-bearing. Every record written before buyRef.n existed says
   only "this line arrived", which is what it has always meant. Counting such a
   record as 1-of-10 would resurrect nine phantom units and put long-closed
   lines back on the strip for the whole of SN5's history. So an n-less record
   CLOSES its line, exactly as it does today: behaviour on all existing data is
   unchanged, and no migration runs. */
function invReceivedBy() {
  const m = new Map();
  for (const coll of ["lots", "stock", "items"]) {
    for (const r of DB[coll] || []) {
      const br = r.buyRef;
      if (!br || !br.buyId || !br.lineId) continue;
      const k = br.buyId + "|" + br.lineId;
      let e = m.get(k);
      if (!e) { e = { n: 0, legacy: false }; m.set(k, e); }
      const n = Number(br.n);
      if (!Number.isFinite(n) || n <= 0) e.legacy = true;
      else e.n += n;
    }
  }
  return m;
}

/* How many the line ORDERED. line.qty is free text, and parseLooseMoney
   returns null for "2 rolls" rather than guessing — so an uncountable line is
   one of it, the same assumption buyLineEach already makes. */
function invLineOrdered(line) {
  const q = parseLooseMoney(line.qty);
  return q != null && q > 0 ? q : 1;
}

function invIncoming() {
  const recd = invReceivedBy();
  const out = [];
  for (const b of DB.budget || []) {
    for (const l of b.lines || []) {
      if (!l.lineId || !String(l.desc || "").trim()) continue;
      if (l.closedShort) continue;             // short-shipped and written off
      const e = recd.get(b.id + "|" + l.lineId);
      const ordered = invLineOrdered(l);
      const got = e ? (e.legacy ? ordered : e.n) : 0;
      const left = ordered - got;
      if (left <= 0) continue;                 // settled, or over — off the strip
      const age = b.dateOrdered ? invDaysSince(b.dateOrdered) : null;
      out.push({ buy: b, line: l, ordered, got, left,
                 age, stale: age != null && age > INV_STALE_ORDER_DAYS });
    }
  }
  return out.sort((a, b2) => (b2.age || 0) - (a.age || 0));
}

/* The strip earns its place only when something is actually in the mail —
   empty states shrink the page, they don't pad it. */
function invIncomingHtml() {
  const inc = invIncoming();
  if (!inc.length) return "";
  return `<div class="card">
    <h3>Incoming <span class="muted nocaps tny">bought, not yet on a shelf · ${inc.length}</span></h3>
    ${inc.map(({ buy, line, age, stale, ordered, got, left }) => {
      const each = buyLineEach(line);
      return `<div class="pmini invrow">
        <span class="pm-name">${esc(line.desc)}${ordered !== 1 ? ` ×${esc(String(ordered))}` : ""}</span>
        ${got ? `<span class="tny">${got} of ${ordered} in · ${left} to come</span>` : ""}
        ${each != null ? `<span class="tny muted">${esc(fmtMoney(each))} ea</span>` : ""}
        <span class="chip" onclick="openRecord('budget','${esc(buy.id)}')">${esc(buy.id)}</span>
        ${buy.source ? `<span class="tny muted">${esc(buy.source)}</span>` : ""}
        <span class="tny muted">${age == null ? "" : `ordered ${age}d ago${stale ? " ⚠" : ""}`}</span>
        <button class="sm no-print" onclick="invReceiveLine('${esc(buy.id)}','${esc(line.lineId)}')">Arrived ▸</button>
      </div>`;
    }).join("")}
  </div>`;
}

/* "Arrived" opens the desk with the WHOLE order seeded, not one line. The old
   modal rendered exactly one row and hid its "+ another line" button in
   precisely the case that needed it most, so a twelve-line order was twelve
   separate trips through a dialog. */
function invReceiveLine(buyId, lineId) {
  openReceiving({ buyId });
}

/* Kept as the one entry point everything else calls. binId locks the sheet to
   a shelf, which is the framing you get from a shelf card or a scanned shelf
   label. */
function invReceive(binId) {
  openReceiving(binId ? { binId } : {});
}
