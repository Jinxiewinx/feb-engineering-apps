"use strict";
/* shop.js — the physical world: molds, items, material lots.
 *
 * WHY THESE EXIST
 * A mold used to exist only as free text inside one work order
 * (`wo.mold.moldId = "MOLD-UT-INLET"`). Two work orders using the same mold
 * held two copies of the truth, and `mold.location` — the field whose own label
 * says "update on every move" — was wrong on one of them the moment anybody
 * moved it. A mold outlives the work orders that use it, gets reused across
 * parts and across seasons, and is the most-moved object in the shop. PP-10 is
 * literally about molds nobody could identify blocking shared storage for
 * weeks. It is the textbook case for an entity.
 *
 * Material lots exist so "which fabric roll and which resin batch went into
 * this panel" has an answer. Today resin is identified by packaging colour
 * ("big tank, blue label") and cloth by gsm alone.
 *
 * Test panels exist so a tensile coupon can name its parent. The SN5 data is
 * seventeen CSVs whose only identity is a trailing integer in the filename.
 *
 * THREE COLLECTIONS, NOT NINE
 * `items` (PNL/JIG/BIN) and `lots` (FAB/RSN/CON) are multi-class: one
 * collection each, discriminated by `cls`. Their fields are near-identical and
 * nine onSnapshot listeners at boot buys nothing.
 *
 * ONE ENGINE, THREE TABS
 * Everything below is driven by the SHOP schema. Three near-identical tabs
 * hand-written three times would drift, and the mobile behaviour would drift
 * with them — which is the failure this file is shaped to avoid. Add a field to
 * the schema and it appears in the list, the detail page, the search and the
 * label with no further code.
 */

/* ---------- the schema ---------- */

/* "Tooling cut" is the blanks off the ShopSabre and not yet glued into a
   stack, which is where a mold actually sits for most of a weekend. It was
   added in September 2026 on Simon's ask; before it, a half-cut mold was
   either still "Designed", which put it back in the cut list, or already
   "Board glued", which it was not.

   Note the two senses of "cut" that now live next to each other: TOOLING cut
   is the boards coming off the saw, MACHINED is the mold surface coming off
   the CNC. They were not renamed, because the string is the persisted field
   value on every mold record. */
const MOLD_STAGE = ["Designed", "Tooling cut", "Board glued", "Machined", "Sealed", "Ready for layup", "Retired"];
/* The stages ON the track. "Retired" is how a mold leaves the progression, not
   a step along it, so it is last in MOLD_STAGE and absent from here: the
   stepper draws it dashed and off to the side, the stagebreak bar omits it,
   and moldStagePct measures against MOLD_TRACK.length - 1.

   It exists because that "minus one" used to be spelled `MOLD_STAGE.length - 2`
   in three places, which is the same number only as long as exactly one stage
   is off the track. Adding a stage in the middle is now a one-line edit above
   and nothing else. */
const MOLD_TRACK = MOLD_STAGE.slice(0, -1);
const PNL_STAGE = ["Planned", "Laid up", "Cured", "Cut", "Tested"];
const LOT_STATE = ["Sealed", "Open", "Empty", "Expired"];

/* `f` fields: [key, label, type, opts]
   type: text | date | num | dens | select | rec:<coll> | sug | money | textarea
   `list` names the columns the table shows, in order. `key` is the one field
   that is bold in the list and largest on the label. */
/* CS-011 §7.3's site vocabulary, in one place. It used to exist twice — here
   inside the SHOP table and again as INV_SITES in inventory.js, which orders
   the storage map — so adding a site meant editing two files and finding out
   you had missed one when a whole site quietly grouped as "Unassigned". */
const SITES = ["", "RFS container", "Jacobs basement", "Flammables cabinet", "Dry sealed bin", "General Box", "Other"];

const SHOP = {
  molds: {
    tab: "molds", label: "Molds", icon: "layers", coll: "molds", cls: null, prefix: "MOLD",
    noun: "mold", nounPlural: "molds",
    stage: { key: "stage", vals: MOLD_STAGE },
    list: ["name", "stage", "location", "densityCutMax", "uses"],
    f: [
      ["name", "Name", "text"],
      ["stage", "Stage", "select", MOLD_STAGE],
      ["location", "Home location", "rec:BIN"],
      ["wo", "Work order", "rec:workOrders"],
      // A mold is planned against a RANGE now; `density` (== min) stays for every
      // reader that wants one number. densityCutMax is the as-cut answer, written
      // by submitCommitCuts, and it is the one that sets the CNC feed rate.
      ["densityMin", "Board density, min (lb/ft³)", "dens"],
      ["densityMax", "Board density, max (lb/ft³)", "dens"],
      ["densityCutMax", "Highest density cut (lb/ft³)", "dens"],
      ["layers", "Board layers", "text"],
      ["sealingType", "Sealing system", "select", ["XCR", "S120", "Resin", "Other"]],
      ["sealedDate", "Sealed on", "date"],
      ["sealedBy", "Sealed by", "person"],
      // The number nobody currently tracks, and the reason molds get run past
      // their release life. It is on the printed label for the same reason.
      ["uses", "Parts pulled", "num"],
      ["rev", "Revision", "text"],
      ["legacyNames", "Also known as", "text"],
    ],
  },
  items: {
    tab: "items", label: "Items", icon: "parts", coll: "items", prefix: null,
    noun: "item", nounPlural: "items",
    classes: [
      { cls: "PNL", label: "Test panel", stage: PNL_STAGE },
      { cls: "JIG", label: "Jig / fixture", stage: ["In use", "Stored", "Retired"] },
      /* newOn: a shelf is created from the storage map, which is the picture of
         the shelves, not from the list of what is stored on them. The class
         still exists here — BIN records live in `items`, they filter and list
         and open like any other — it is only the + button that moves. */
      { cls: "BIN", label: "Storage location", stage: ["Active", "Retired"], newOn: "inventory map" },
    ],
    stage: { key: "stage", vals: null },   // per class
    list: ["name", "cls", "stage", "location", "laidOn"],
    f: [
      ["name", "Name", "text"],
      ["stage", "Stage", "select", null],
      ["location", "Location", "rec:BIN"],
      /* BIN-only (see SHOP_FIELDS_BY_CLASS): the storage-map fields. `site`
         is CS-011 §7.3's vocabulary as a dropdown; `locKind` and `flam` feed
         the §6 chemical-storage warnings; walkedAt/By are stamped by the
         Confirm-contents button and editable here so a lead can correct one. */
      ["site", "Site", "select", SITES],
      ["locKind", "Type", "select", ["", "shelf", "rack", "cabinet", "bin", "box", "fridge"]],
      ["flam", "Rated for flammables", "select", ["", "Yes"]],
      /* BIN-only: the RSS sublocation tag, where EH&S has stuck one on the
         shelf or cabinet itself. Scanning it targets this bin, so one tag
         works in both their app and ours. */
      ["ehsBarcode", "EH&S barcode", "ehs"],
      ["walkedAt", "Contents last confirmed", "date"],
      ["walkedBy", "Confirmed by", "person"],
      ["stack", "Layup stack", "text"],           // PNL: the PP-09 answer
      ["session", "Laid in session", "text"],
      ["laidOn", "Laid up on", "date"],
      ["thicknessMm", "Thickness (mm)", "num"],
      ["coupons", "Coupon range", "text"],        // e.g. C01-C12
      // JIG-only: what the jig cost to buy or build, for the same reason lots
      // carry unitCost — cost knowledge should be readable off the record.
      ["unitCost", "Cost ($)", "money"],
      ["wo", "Work order", "rec:workOrders"],
      ["fabricLots", "Fabric lot(s)", "rec:FAB"],
      ["resinLot", "Resin lot", "rec:RSN"],
      ["hardenerLot", "Hardener lot", "rec:RSN"],
      // "partial" belongs here: workorders.js's readLotFields() has produced it
      // since lot capture shipped, but this select never offered it, so editing
      // a panel silently destroyed the honest half-scanned state.
      ["lotSource", "Lot record", "select", ["scanned", "inferred", "recalled", "partial", "unknown"]],
    ],
  },
  lots: {
    tab: "lots", label: "Materials", icon: "documents", coll: "lots", prefix: null,
    noun: "lot", nounPlural: "material lots",
    classes: [
      { cls: "FAB", label: "Fabric roll / offcut", stage: LOT_STATE },
      { cls: "RSN", label: "Resin / hardener", stage: LOT_STATE },
      { cls: "CON", label: "Consumable", stage: LOT_STATE },
    ],
    stage: { key: "stage", vals: null },
    list: ["name", "cls", "stage", "vendorLot", "unitCost", "location"],
    f: [
      ["name", "Material", "text"],
      /* What KIND of thing this is, across every lot of it — "IN2", "AT30-SLOW",
         "NITRILE-L". Not a reference and not an id: no counter is touched and
         no label is printed, so it costs nothing against the 14-character QR
         budget. It exists because the thing you reorder is a material, not a
         jug: lowFlag lives on a container, and when the last container empties
         invIndex drops it (inventory.js) and the reorder signal goes with it.
         That is PP-02 — "MEKP sat flagged REORDER all season" — at the data
         model level. Grouping by matKey is what makes "we are OUT of x"
         expressible at all. */
      ["matKey", "Material type", "sug"],
      ["stage", "State", "select", null],
      ["role", "Role", "select", ["", "resin", "hardener"]],
      ["ratio", "Mix ratio", "text"],
      ["vendorLot", "Vendor lot number", "text"],
      /* The UC EH&S tag on the container (RSS Chemicals). Chemicals HAVE to
         wear the university's barcode, and one sticker per carton means that
         barcode is also how our app identifies it — see ehsResolve in core.js.
         RSN and CON only: dry fabric is not in the campus chemical system. */
      ["ehsBarcode", "EH&S barcode", "ehs"],
      ["supplier", "Supplier", "text"],
      ["receivedOn", "Received", "date"],
      ["openedOn", "Opened", "date"],
      ["expiresOn", "Expires", "date"],
      ["location", "Home location", "rec:BIN"],
      ["parentId", "Cut from roll", "rec:FAB"],   // an offcut is a roll with a parent
      /* How full this container is. A coarse enum, NOT a number and NOT a
         fourth field: stage, lowFlag and qty already overlapped three ways to
         say the same thing, so this is the deletion rather than an addition.
         Words beat a percentage — "37%" is a decision, and a decision at 11pm
         with gloves on is a field left blank. Legacy free text ("about half",
         "2 yd left") still displays and stays selectable; nothing is parsed. */
      ["qty", "How full", "select", ["", "Full", "Half", "Low", "Empty"]],
      /* CON only: how many units this ONE record stands for. Distinct from qty
         on purpose — a box of 100 gloves is a count set once at receipt, and
         how full the shelf is is a different fact that changes weekly.
         Conflating them is what makes quantity fields rot. */
      ["count", "How many", "num"],
      ["countedAt", "Counted on", "date"],
      /* What one unit of this cost, stamped at receipt (or typed later).
         Stored as a NUMBER — this feeds BOM cost rollups, and free-text money
         parsed by regex is how "$1O0" silently becomes 1. `costUnit` is free
         text ("ea", "yd", "kg") because the shop's units are not a schema's
         business. Browsing the shelf teaching prices is the point. */
      ["unitCost", "Unit cost ($)", "money"],
      ["costUnit", "Cost unit", "text"],
      /* `hazard` drives the §6 chemical chips on the storage map; `lowFlag`
         is an honest manual "running low" toggle — qty is free text, so a
         numeric min-stock would be pretending precision we don't have. */
      /* Three states, not two. Blank previously read as "not flammable" to the
         CS-011 §6 check, so a material nobody had classified filed a silent
         false all-clear. Unknown has to render as unknown — this is a safety
         check for a team that once kept chemicals in a food fridge (PP-10). */
      ["hazard", "Hazard", "select", ["", "flammable", "not flammable"]],
      /* Where the expiry date came from. The vendor's printed date beats our
         shelf-life table and the person holding the jug is right, so the two
         are not interchangeable — and stamping the source is what stops a lead
         editing shelfLifeMonths from silently moving the expiry of every jug
         in the shop. Same discipline resins.js keeps between the datasheet
         hold and the team hold. */
      ["expirySource", "Expiry from", "select", ["", "vendor label", "shelf-life table"]],
      ["emptiedOn", "Emptied", "date"],
      /* Demoted to an override. The reorder decision is now derived from qty
         and the restock rules; this stays for the person who looks at a shelf
         and knows something the rule does not. */
      ["lowFlag", "Flag for reorder (override)", "select", ["", "Yes — reorder"]],
    ],
  },
};

function shopSpec(tab) { return Object.values(SHOP).find(s => s.tab === tab); }
function shopById(coll, id) { return (DB[coll] || []).find(o => o.id === id); }
/* The one-class case is expressed as a one-entry list so every call site below
   is uniform. `label` is the SINGULAR noun because it is what the "+ …" button
   reads; the tab keeps the plural. */
function shopClasses(spec) {
  return spec.classes || [{ cls: spec.prefix, label: capFirst(spec.noun), stage: spec.stage.vals }];
}
function capFirst(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
function shopClassOf(spec, o) {
  const c = shopClasses(spec);
  return c.find(x => x.cls === (o.cls || spec.prefix)) || c[0];
}
function shopClassLabel(spec, cls) {
  const c = shopClasses(spec).find(x => x.cls === cls);
  return c ? c.label : cls;
}

/* ---------- create / delete ---------- */

async function newShopRec(tab, cls, preset) {
  const spec = shopSpec(tab);
  if (!spec) return;
  const use = cls || shopClasses(spec)[0].cls;
  // Multi-class collections need the class to allocate against the right
  // counter; single-class ones pass null and use ID_PREFIX.
  const id = await allocId(spec.coll, spec.classes ? use : null);
  if (!id) return;
  // `preset` is how "Add here" on the storage map births a record already
  // located: {location: "BIN-…"} spread in before the first save.
  const o = { id, name: "", stage: shopClasses(spec).find(c => c.cls === use).stage[0], createdBy: myEmail(), ...(preset || {}) };
  if (spec.classes) o.cls = use;
  DB[spec.coll].push(o);
  save(spec.coll, o);
  view = { ...view, tab, mode: "detail", id, edit: true };
  render(); syncUrl();
}

function delShopRec(tab, id) {
  const spec = shopSpec(tab);
  /* Inventory (items/lots) goes through the one bulk path so a single delete
     and a Select… delete share the same cascade and the same confirm wording.
     Molds do the same through moldsBulkDelete (molds.js), which also takes
     the mold's stack plans and meshes: a plan is part of its mold. */
  if (spec.coll === "items" || spec.coll === "lots") { shopBulkDelete(spec.coll, [id]); return; }
  if (spec.coll === "molds" && typeof moldsBulkDelete === "function") { moldsBulkDelete([id]); return; }
  confirmModal(`Delete ${id} for everyone? It goes to Recently deleted and can be restored for ${TRASH_DAYS} days.`, async () => {
    const rec = recById(spec.coll, id);
    await trashRecords([{ coll: spec.coll, id, files: rec && typeof recStoragePaths === "function" ? recStoragePaths(rec) : [] }]);
    view = { ...view, mode: "list", id: null };
    render(); syncUrl();
  });
}

/* ---------- Select…: many records, one confirm ----------
 *
 * The WO picker's shape (workorders.js startWOPick etc), on the Items and
 * Materials lists — the EH&S import made "delete thirty test rows" a real
 * task. view.shopPick is null (not picking) or an {id: true} map; the
 * distinction is deliberate, not inferred from the DOM. Open to EVERY roster
 * member, matching the 2026-08-28 rules change: inventory is shared property,
 * so cleanup is not a lead-only chore. */
function shopPickOn() { return !!view.shopPick; }
function startShopPick() { view = { ...view, shopPick: {} }; render(); }
function cancelShopPick() { view = { ...view, shopPick: null }; render(); }
function toggleShopPick(id) {
  const p = view.shopPick;
  if (!p) return;
  if (p[id]) delete p[id]; else p[id] = true;
  render();
}
/* Only what is on screen: ticking All while a filter is on must not quietly
   select the records the filter is hiding. */
function shopPickAll(tab, on) {
  const p = {};
  if (on) shopListRows(tab).forEach(o => { p[o.id] = true; });
  view = { ...view, shopPick: p };
  render();
}
/* A group line's checkbox is all of its containers. Mixed → ticking completes
   the set; a full set unticks whole. */
function shopPickGroup(key) {
  const p = view.shopPick;
  if (!p) return;
  const g = groupLots(shopListRows("lots")).find(x => x.key === key);
  if (!g) return;
  const all = g.members.every(m => p[m.id]);
  g.members.forEach(m => { if (all) delete p[m.id]; else p[m.id] = true; });
  render();
}
function shopPickedIds() { return Object.keys(view.shopPick || {}); }

/* What deleting these would actually touch. Nothing is edited to say it:
   - A storage location that still HOLDS things is left alone entirely —
     deleting the shelf out from under its contents would orphan them on the
     map. Empty it first (the confirm says which ones).
   - A lot a cure or a panel points at is deleted anyway, and the pointer
     keeps the id as text: that record is signed history, and rewriting it to
     hide a deletion would be worse than a dangling reference.
   - Budget lines drop the deleted ids from lotRefs, so a purchase's received
     count re-derives honestly (the line reopens under Incoming if its
     containers are gone). */
function shopDeletionSet(coll, ids) {
  const set = new Set(ids);
  const recs = ids.map(id => shopById(coll, id)).filter(Boolean);
  const keptBins = [];
  let take = recs;
  if (coll === "items") {
    const idx = invIndex();
    take = recs.filter(o => {
      if (o.cls !== "BIN") return true;
      const n = invBucketCount(idx.by.get(o.id) || invEmptyBucket());
      if (n) keptBins.push({ o, n });
      return !n;
    });
  }
  let referenced = 0;
  if (coll === "lots") {
    for (const w of DB.workOrders || []) {
      const c = w.cure || {};
      if (set.has(c.lotFabric) || set.has(c.lotResin) || set.has(c.lotHardener)) referenced++;
    }
    for (const it of DB.items || []) {
      if (it.cls === "PNL" && (set.has(it.fabricLots) || set.has(it.resinLot) || set.has(it.hardenerLot))) referenced++;
    }
  }
  const budgets = (DB.budget || []).filter(b => (b.lines || []).some(l => (l.lotRefs || []).some(id => set.has(id))));
  return { take, keptBins, referenced, budgets };
}

function shopDeletionSummary(d, coll) {
  const n = d.take.length;
  const noun = coll === "lots" ? "material record" : "item";
  const bits = [`Delete ${n} ${noun}${n === 1 ? "" : "s"} for everyone?`];
  if (d.keptBins.length) bits.push(`${d.keptBins.length} storage location${d.keptBins.length === 1 ? " is" : "s are"} left alone — ${d.keptBins.map(k => `${k.o.name || k.o.id} still holds ${k.n}`).join(", ")}. Empty a shelf before deleting it.`);
  if (d.referenced) bits.push(`${d.referenced} cure or panel record${d.referenced === 1 ? "" : "s"} reference what is being deleted; they keep the id as text, because a signed record does not get rewritten.`);
  if (d.budgets.length) bits.push(`${d.budgets.length} purchase${d.budgets.length === 1 ? "" : "s"} drop the deleted containers from their received lines.`);
  bits.push(`Everything here goes to Recently deleted and can be restored for ${TRASH_DAYS} days.`);
  return bits.join(" ");
}

async function shopBulkDelete(coll, ids) {
  const d = shopDeletionSet(coll, ids);
  if (!d.take.length) {
    toast(d.keptBins.length ? "Nothing deleted — every selected location still holds things." : "Nothing to delete.", "error");
    return;
  }
  confirmModal(shopDeletionSummary(d, coll), async () => {
    const set = new Set(d.take.map(o => o.id));
    /* The lotRefs scrub is recorded the way the work-order cascade records its
       back-pointers: it is a link cleared on a record that was NOT deleted, so
       without writing it down a restored container comes back detached from the
       purchase that received it. Per budget line, because a line can name
       several containers and only some of them are going. */
    const backrefs = [];
    for (const b of d.budgets) {
      for (const l of (b.lines || [])) {
        const hit = (l.lotRefs || []).filter(id => set.has(id));
        if (hit.length) backrefs.push({ coll: "budget", id: b.id, field: "lines", lotRefs: { lineId: l.lineId, ids: hit } });
      }
    }
    const batch = await trashRecords(d.take.map((o, i) => ({ coll, id: o.id, backrefs: i ? [] : backrefs })));
    const failed = !batch;
    if (!failed) {
      for (const b of d.budgets) {
        saveField("budget", b, "lines", arr => (arr || []).map(l =>
          (l.lotRefs || []).some(id => set.has(id)) ? { ...l, lotRefs: l.lotRefs.filter(id => !set.has(id)) } : l));
      }
    }
    view = { ...view, shopPick: null, mode: "list", id: null };
    toast(failed ? `Delete failed — nothing was removed: try again.` :
      `${d.take.length} record${d.take.length === 1 ? "" : "s"} deleted.` +
      (d.keptBins.length ? ` ${d.keptBins.length} occupied location${d.keptBins.length === 1 ? "" : "s"} kept.` : "") +
      ` Recover from Recently deleted.`,
      failed ? "error" : undefined);
    render(); syncUrl();
  });
}

function updShopPerson(tab, key, email, name) {
  const spec = shopSpec(tab);
  const o = shopById(spec.coll, view.id);
  if (!o || guestBlocked()) return;
  savePatch(spec.coll, o, personPatch(key, email, name));
  renderSoonKeepFocus();
}
function updShop(tab, key, val) {
  const spec = shopSpec(tab);
  const o = shopById(spec.coll, view.id);
  if (!o) return;
  /* A record's id carries its class prefix, and scanning trusts the prefix:
     quickMoveScan accepts only BIN-. A JIG turned into a BIN would keep its
     JIG- id and be a shelf no scan can target. Kind changes touching BIN are
     refused; recreate the record instead. Other class flips (PNL<->JIG,
     FAB<->CON) keep working — their stale prefix routes to the same tab. */
  if (key === "cls" && (val === "BIN" || o.cls === "BIN") && val !== o.cls) {
    toast("A storage location's id is what its scan label points at — make a new record instead of converting this one.", "error");
    render();
    return;
  }
  /* Money fields store a number or nothing. Coerced here rather than trusted
     from the input because type="number" still delivers a string, and because
     an unparseable value must become "absent", never NaN in Firestore. */
  const fType = (spec.f.find(f => f[0] === key) || [])[2];
  if (fType === "money") {
    const n = String(val).trim() === "" ? null : Number(val);
    if (n != null && (!Number.isFinite(n) || n < 0)) { toast("Cost needs to be a plain number of dollars.", "error"); render(); return; }
    val = n == null ? "" : Math.round(n * 100) / 100;
  }
  /* "num" gets the same treatment, for a sharper reason than money: a count is
     COMPARED. mold.uses is already mixed-type in live data — a string when
     typed here, a number when written by runMoldImport — and the moment a
     consumable count meets a restock threshold, "9" > "10" is true and the
     reorder silently never fires. Whole numbers or nothing; half a box of
     gloves is not a thing anyone counts. */
  if (fType === "num") {
    const n = String(val).trim() === "" ? null : Number(val);
    if (n != null && (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
      toast("That needs to be a whole number, or empty.", "error"); render(); return;
    }
    val = n == null ? "" : n;
  }
  /* "dens" is stored as a canonical numeric STRING: display-only on a mold
     (labels, the printed traveler), so the string writer below stays generic,
     but canonical so it groups and compares with the numeric density on the
     boards and plans. See canonDensity in core.js for why one form matters. */
  if (fType === "dens") {
    const s = String(val).trim();
    if (s === "") val = "";
    else {
      const d = canonDensity(s);
      if (d == null) { toast("Board density is a plain number in lb/ft³ — 30, 45, 60.", "error"); render(); return; }
      val = String(d);
    }
  }
  /* "ehs" — a UC EH&S tag code. Stored in the one normal form ehsNorm defines
     so lookup never has to guess, and refused outright if another record
     already wears it: an EH&S tag identifies ONE physical container, and two
     records claiming it means a scan would open the wrong jug forever after.
     The refusal now also catches the label's edge print landing on a second
     record — see ehsConflict.

     THE SHAPE IS A WARNING, NOT A GATE. A UC tag is 24 characters (core.js's
     EH&S header, from a photographed tag), and the commonest way to be off
     that is to have typed the twelve-character edge strip and stopped, or to
     have dropped a group. Storing it anyway is right: the grammar comes from
     one label, older hand-entered codes are shorter and real, and refusing a
     code somebody is holding in their hand is how a person decides the field
     is broken and leaves it blank. So it saves, and it says so. */
  if (fType === "ehs") {
    val = ehsNorm(val);
    const dupe = val ? ehsConflict(val, o.id) : null;
    if (dupe) {
      toast(`${ehsPrinted(val)} is already on ${dupe.o.name || dupe.id} (${dupe.id}) — one tag, one container.`, "error");
      render(); return;
    }
    const shape = val ? ehsShape(val) : { ok: true };
    if (!shape.ok) {
      o[key] = val;
      save(spec.coll, o, key);
      /* "error" for the styling and the longer dwell, not because the save
         failed — toast() has two kinds and green would read as "all good". */
      toast(`Saved ${ehsPrinted(val)}, but check it: it ${shape.why}. The whole code is on the face of the label.`, "error");
      return;
    }
  }
  o[key] = val;
  save(spec.coll, o, key);
  // Stage and class drive the pill and the available stages, so both need a
  // repaint; everything else is a plain field and does not.
  if (key === "stage" || key === "cls") render();
}

/* ---------- list ---------- */

function renderShop(tab) {
  return view.mode === "detail" ? renderShopDetail(tab) : renderShopList(tab);
}

function shopStageClass(spec, o) {
  const c = shopClassOf(spec, o);
  const i = (c.stage || []).indexOf(o.stage);
  if (o.stage === "Retired" || o.stage === "Empty" || o.stage === "Expired") return "Cancelled";
  if (i < 0) return "Draft";
  if (i === 0) return "Draft";
  if (i >= (c.stage || []).length - 1) return "Complete";
  return "InWork";
}

/* The rows the list currently shows — one definition, shared with the picker
   so All can never select what a filter is hiding. */
function shopListRows(tab) {
  const spec = shopSpec(tab);
  const q = (view.q || "").toLowerCase();
  return (DB[spec.coll] || [])
    .filter(o => !view.fSub || (o.cls || spec.prefix) === view.fSub)
    .filter(o => !view.fStatus || o.stage === view.fStatus)
    .filter(o => !q || shopHay(spec, o).includes(q))
    .sort((a, b) => cmpId(a.id, b.id));
}

function renderShopList(tab) {
  const spec = shopSpec(tab);
  const D = DB[spec.coll] || [];
  const q = (view.q || "").toLowerCase();
  const rows = shopListRows(tab);

  const classes = shopClasses(spec);
  const stages = [...new Set(classes.flatMap(c => c.stage || []))];

  /* Stat tiles answer the question the tab exists for. For molds that is "how
     many are ready to lay up on" and "how many are somewhere nobody wrote
     down", which is PP-10 restated as a number. */
  const tiles = tab === "molds"
    ? [
        [D.length, "Molds"],
        [D.filter(o => o.stage === "Ready for layup").length, "Ready for layup"],
        [D.filter(o => !o.location).length, "No home location"],
      ]
    : tab === "lots" && typeof groupLots === "function"
    ? [
        /* Containers vs materials is the pair the EH&S import made matter:
           ten AT30 jugs are ten containers and one material, and both numbers
           answer real questions ("how many jugs" vs "how many kinds"). */
        [D.length, "Containers"],
        [groupLots(D.filter(o => o.stage !== "Empty")).length, "Materials"],
        [D.filter(o => o.cls === "RSN").length, "Resin / hardener"],
        [D.filter(o => o.cls === "CON").length, "Consumables"],
      ]
    : [
        [D.length, spec.label],
        ...classes.map(c => [D.filter(o => (o.cls || spec.prefix) === c.cls).length, c.label]),
      ].slice(0, 4);

  /* The Materials list groups identical containers by default, exactly like
     the location page: ×N per material, expandable to per-container rows with
     their EH&S codes and locations. A search drops to the flat table — search
     results need per-record rows — and the Flat toggle is the standing escape
     for anyone who wants the spreadsheet view. */
  const grouped = tab === "lots" && !q && !view.lotsFlat && typeof invLotList === "function";
  const groupedBody = () => {
    const secs = [
      ["RSN", "Resin / hardener", "sec-resin"],
      ["CON", "Consumables", "sec-consumables"],
      ["FAB", "Fabric", "sec-fabric"],
    ];
    const out = secs.map(([cls, label, sec]) => {
      const arr = rows.filter(o => o.cls === cls);
      return arr.length ? invGroup(label, invLotList(arr, { showLoc: true, pick: shopPickOn() }), invLotMeta(arr), sec) : "";
    }).join("");
    return out || `<div class="card">Nothing matches that filter.</div>`;
  };

  return `
  <div class="stat-row">
    ${tiles.map(([n, lab]) => `<div class="stat-tile"><div class="bignum">${n}</div><div class="stat-label">${esc(lab)}</div></div>`).join("")}
  </div>
  <div class="toolbar no-print">
    ${shopPickOn() && (tab === "items" || tab === "lots") ? (() => {
      const n = shopPickedIds().length;
      return `<button class="sm" onclick="shopPickAll('${tab}',true)">All ${rows.length}</button>
        <button class="sm" onclick="shopPickAll('${tab}',false)">None</button>
        <span class="muted tny">${n} selected</span>
        <button class="danger sm" style="margin-left:auto" ${n ? "" : "disabled"} onclick="shopBulkDelete('${spec.coll}', shopPickedIds())">Delete ${n || ""}</button>
        <button class="sm ib" onclick="cancelShopPick()">${icon("close", 14)}</button>`;
    })() : (() => {
      /* A class whose records are created somewhere better than this list says
         so instead of offering a button that would strand the user on the wrong
         page afterwards. */
      const addable = classes.filter(c => !c.newOn);
      return addable.map((c, i) => `<button class="${i === 0 ? "primary" : ""}" onclick="newShopRec('${tab}','${c.cls}')">+ ${esc(c.label)}</button>`).join("")
        + classes.filter(c => c.newOn).map(c =>
          `<span class="muted tny">${esc(c.label)}s are added on the ${esc(c.newOn)}.</span>`).join("")
        + (D.length ? `<button class="ib" onclick="openLabelBuilder('${spec.coll}')">${icon("print", 15)} Labels</button>` : "")
        + (D.length && tab === "lots" && typeof openMatLink === "function"
          ? `<button class="ib" title="Fill blank material types from the materials table" onclick="openMatLink()">${icon("check", 15)} Link materials</button>` : "")
        + (D.length && (tab === "items" || tab === "lots") ? `<button class="sm" onclick="startShopPick()">Select…</button>` : "");
    })()}
  </div>
  <div class="filters no-print">
    ${spec.classes ? `<select onchange="view.fSub=this.value;render()">
      <option value="">All kinds</option>
      ${classes.map(c => `<option value="${c.cls}" ${view.fSub === c.cls ? "selected" : ""}>${esc(c.label)}</option>`).join("")}
    </select>` : ""}
    <select onchange="view.fStatus=this.value;render()">
      <option value="">All stages</option>
      ${stages.map(s => `<option ${view.fStatus === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search ${esc(spec.nounPlural)} / id…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    ${tab === "lots" && !q ? `<button class="ib ${view.lotsFlat ? "" : "primary"}" title="One line per material, expandable"
        onclick="view.lotsFlat=false;render()">Grouped</button>
      <button class="ib ${view.lotsFlat ? "primary" : ""}" title="One row per container"
        onclick="view.lotsFlat=true;render()">Flat</button>` : ""}
  </div>
  ${!D.length ? `<div class="card">No ${esc(spec.nounPlural)} yet. ${spec.coll === "molds"
      ? `Add one, or import the SN5 molds from their work orders with <b>Find molds in work orders</b> under Reports.`
      : `Use the buttons above to add one.`}</div>` : ""}
  ${(() => {
    const picking = shopPickOn() && (tab === "items" || tab === "lots");
    if (grouped && D.length) return groupedBody();   // sections are their own cards
    if (!rows.length) return D.length ? `<div class="card">Nothing matches that filter.</div>` : "";
    return `<table class="list">
    <tr>${picking ? "<th></th>" : ""}${spec.list.map(k => `<th>${esc(shopColLabel(spec, k))}</th>`).join("")}</tr>
    ${rows.map(o => {
      const ticked = picking && !!view.shopPick[o.id];
      return `<tr ${ticked ? 'class="picked"' : ""} aria-selected="${picking ? ticked : false}"
        onclick="${picking ? `toggleShopPick('${esc(o.id)}')` : `openRecord('${tab}','${esc(o.id)}')`}">
      ${picking ? `<td class="pickcell"><input type="checkbox" ${ticked ? "checked" : ""} aria-label="Select ${esc(o.id)}"
        onclick="event.stopPropagation();toggleShopPick('${esc(o.id)}')"></td>` : ""}
      ${spec.list.map((k, i) => `<td>${i === 0
        ? `<b>${esc(o.name || o.id)}</b><div class="muted tny">${esc(o.id)}</div>`
        : shopCell(spec, o, k)}</td>`).join("")}
    </tr>`;
    }).join("")}
  </table>`;
  })()}`;
}

function shopColLabel(spec, key) {
  if (key === "cls") return "Kind";
  const f = spec.f.find(f => f[0] === key);
  return f ? f[1] : key;
}
function shopCell(spec, o, key) {
  if (key === "cls") return `<span class="kind">${esc(shopClassLabel(spec, o.cls || spec.prefix))}</span>`;
  if (key === "stage") return `<span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>`;
  const v = o[key];
  if (v == null || v === "") return '<span class="muted">—</span>';
  if (Array.isArray(v)) return esc(v.join(", "));
  // A reference renders as a chip so it is followable, the way the rest of the
  // app cross-links.
  const f = spec.f.find(f => f[0] === key);
  if (f && String(f[2]).startsWith("rec:")) return shopRefChip(String(v));
  if (f && f[2] === "money") return esc(shopMoneyText(o, key));
  return esc(String(v));
}

/* "$18.00/yd" — a money field with its unit riding along. Read by the list
   cell, the detail field and the inventory rows, so a price reads the same
   everywhere someone might absorb it. */
function shopMoneyText(o, key) {
  const m = fmtMoney(o[key]);
  if (!m) return "";
  const u = key === "unitCost" ? String(o.costUnit || "").trim() : "";
  return u && u !== "ea" ? `${m}/${u}` : m;
}

/* A reference to another record. Uses the same tab-from-prefix map the scan
   router uses, so a chip and a scanned QR land in exactly the same place. */
function shopRefChip(id) {
  const tab = typeof tabForId === "function" ? tabForId(id) : null;
  if (!tab) return esc(id);
  const coll = (TABS.find(t => t.id === tab) || {}).coll;
  const rec = coll ? shopById(coll, id) : null;
  const label = rec ? (rec.name || rec.partName || rec.label || id) : id;
  return `<span class="chip" onclick="event.stopPropagation();openRecord('${tab}','${esc(id)}')">${esc(label)}</span>`;
}

/* ---------- detail ---------- */

/* `opts.embedded` renders the same card inside the merged Molds tab's right
   pane: the back button clears the selection instead of popping the nav trail,
   and prev/next walk the rail. The DEFAULT output is byte-identical to before
   the option existed — Materials and Items call this bare, have no test
   coverage, and must not move. */
/* `opts.embedded` renders inside a merged tab's pane. `back` and `move` name
   the host's selection callbacks (defaults are the Molds tab's, so existing
   calls are unchanged); `move: null` drops the prev/next arrows for hosts
   without a walkable rail, like the storage map. */
function renderShopDetail(tab, opts) {
  const spec = shopSpec(tab);
  const emb = !!(opts && opts.embedded);
  const back = (opts && opts.back) || "clearMoldsSelection";
  const move = opts && "move" in opts ? opts.move : "moveMoldsSelection";
  const backLabel = (opts && opts.backLabel) || navBackLabel(spec);
  const o = shopById(spec.coll, view.id);
  if (!o) { view.mode = "list"; return renderShopList(tab); }
  const E = view.edit;
  const c = shopClassOf(spec, o);

  return `
  <div class="toolbar no-print">
    ${emb
      ? `<button class="ib" onclick="${back}()">${icon("chevronLeft", 16)} ${esc(backLabel)}</button>`
      : `<button class="ib" onclick="navBack({tab:'${tab}',mode:'list',id:null})">${icon("chevronLeft", 16)} ${esc(navBackLabel(spec))}</button>`}
    <button class="primary ib" onclick="view.edit=!view.edit;render()">${icon(E ? "check" : "edit", 15)} ${E ? "Done" : "Edit"}</button>
    ${labelBtn(spec.coll, o.id)}
    ${/* Visible WITHOUT pressing Edit first. It used to hide behind edit
          mode, and the observable result was "you can retire an item but not
          delete it" — the button existed and nobody could find it. Items and
          lots deletes opened to every member on 2026-08-28 (the rules changed
          with the Select… mass-delete); molds stay lead-only server-side, so
          the button matches the rule rather than promising a 403. */""}
    ${isLead() || spec.coll === "items" || spec.coll === "lots"
      ? `<button class="danger" onclick="delShopRec('${tab}','${esc(o.id)}')">Delete</button>` : ""}
    ${emb && move ? `<span class="mdnav no-print">
      <button class="sm" title="Previous (↑)" onclick="${move}(-1)">${icon("chevronLeft", 14)}</button>
      <button class="sm" title="Next (↓)" onclick="${move}(1)">${icon("chevronRight", 14)}</button>
    </span>` : ""}
  </div>
  ${/* The two bench actions, above the fold and outside edit mode. Someone
        standing at a shelf with gloves on should not have to press Edit, find
        a field and open a dropdown to say "it moved" or "that's done". */""}
  <div class="toolbar no-print">
    <button class="ib" onclick="quickMove('${esc(spec.coll)}','${esc(o.id)}')">${icon("layers", 15)} Move</button>
    ${/* Molds set stage on the stepper in the card below — a second "advance"
          control for the same field is exactly the drift the stepper removed. */""}
    ${tab !== "molds" && shopNextStage(spec, o) ? `<button class="ib" onclick="quickAdvance('${esc(spec.coll)}','${esc(o.id)}')">${icon("check", 15)} ${esc(shopNextStage(spec, o))}</button>` : ""}
  </div>
  ${/* The embedded host (the Molds tab) already renders the undo bar above
        the split; a second copy here doubled every write's bar. */""}
  ${!emb && typeof shopUndoBar === "function" ? shopUndoBar() : ""}
  <div class="card" data-lbgroup="${esc(spec.coll)}:${esc(o.id)}">
    <h2>${esc(o.name || "(unnamed " + spec.noun + ")")}</h2>
    <div class="muted">${esc(o.id)}${
      /* For molds the stepper below IS the stage display; a pill here would be
         the same fact twice, one of them not tappable. */
      tab === "molds" ? "" : ` · <span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>`}${
      spec.classes ? " · " + esc(c.label) : ""}${
      o.updatedAt ? " · saved " + fmtWhen(o.updatedAt) + " by " + esc(o.updatedBy || "?") : ""}</div>
    ${tab === "molds" && typeof moldStageRow === "function" ? moldStageRow(o) : ""}
    ${tab === "molds" && typeof moldSplitPill === "function" ? moldSplitPill(o) : ""}
    ${/* Where this came from and what it cost, when receiving stamped it.
          buyRef is written by the receive flow, never hand-edited, so it is
          a read-only chip here rather than a schema field. */""}
    ${o.buyRef && o.buyRef.buyId ? `<div class="muted tny">From purchase
      <span class="chip" onclick="openRecord('budget','${esc(o.buyRef.buyId)}')">${esc(o.buyRef.buyId)}</span></div>` : ""}
    ${/* What the material IS, from the materials table: mix ratio, shelf
          life, reorder threshold, and the actual datasheets — the facts
          people used to walk to a laptop for. Read-only; the record's own
          matKey field stays the editable side. */""}
    ${spec.coll === "lots" && typeof matForLot === "function" && matForLot(o)
      ? `<div class="matstrip">${esc(matForLot(o).label)} ${matInfoHtml(matForLot(o))}</div>` : ""}
    ${E ? `<div class="editnote no-print">${icon("edit", 14)} Editing — every change saves as you make it.</div>` : ""}

    ${spec.classes && E ? `<h3>Kind</h3><div class="grid"><div class="f"><label>Kind</label>
      <select onchange="updShop('${tab}','cls',this.value)">
        ${shopClasses(spec).map(x => `<option value="${x.cls}" ${x.cls === c.cls ? "selected" : ""}>${esc(x.label)}</option>`).join("")}
      </select></div></div>` : ""}

    <h3>Details</h3>
    <div class="grid">${spec.f.map(f => shopFld(spec, tab, o, f, c)).join("")}</div>

    ${tab === "molds" && typeof moldPlanSection === "function" ? moldPlanSection(o) : ""}
    ${tab === "molds" && typeof moldFusionSection === "function" ? moldFusionSection(o) : ""}
    ${tab === "molds" ? moldUses(o) : ""}
    ${tab === "molds" && typeof moldFilesSection === "function" ? moldFilesSection(o) : ""}

    <h3>Notes</h3>
    ${richField(spec.coll, o.id, "notes", {
      plain: true, label: "Notes",
      empty: `Anything the next person needs to know about this ${esc(spec.noun)}.`,
      upload: name => `${spec.coll}/${o.id}/${Date.now()}-${name}`,
    })}
  </div>`;
}

function navBackLabel(spec) { return "All " + spec.nounPlural; }

// The next stage, or "" at the end. Named on the button rather than a generic
// "Advance", so the tap is a decision you can see before you make it.
function shopNextStage(spec, o) {
  const stages = shopClassOf(spec, o).stage || [];
  const i = stages.indexOf(o.stage);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : "";
}

/* What this mold has made. A read-only join rather than a stored list, so it
   cannot go stale: it is every work order and part pointing here. */
function moldUses(m) {
  const wos = (DB.workOrders || []).filter(w => w.moldRef === m.id || (w.mold && w.mold.moldId === m.id));
  /* Any position in the list, not just the first: a split mold's second half
     is used by the part exactly as much as its first, and this join going
     single-valued is how "Used by" would quietly start lying the day a part
     grew a second mold. */
  const parts = (DB.parts || []).filter(p => (p.molds || []).includes(m.id) || p.mold === m.id);
  if (!wos.length && !parts.length) return "";
  return `<h3>Used by</h3>
    <div class="stagerow">${[
      ...wos.map(w => `<span class="chip" onclick="openRecord('workorders','${esc(w.id)}')">${esc(w.id)} ${esc(w.partName || "")}</span>`),
      ...parts.map(p => `<span class="chip" onclick="openRecord('parts','${esc(p.id)}')">${esc(p.id)} ${esc(p.partName || "")}</span>`),
    ].join("")}</div>`;
}

function shopFld(spec, tab, o, f, c) {
  const [key, label, type, opts] = f;
  // Fields that only make sense for one class stay hidden for the others: a
  // storage bin has no layup stack, and a fabric roll has no mix ratio.
  if (!shopFieldApplies(spec, c.cls, key)) return "";
  // A mold's stage lives on the stepper at the top of the card; a <select>
  // for it here would be a second editor for the same field.
  if (key === "stage" && tab === "molds") return "";
  let v = o[key] ?? "";
  if (Array.isArray(v)) v = v.join(", ");

  if (!view.edit) {
    const shown = key === "stage" ? `<span class="pill ${shopStageClass(spec, o)}">${esc(o.stage || "—")}</span>`
      : type === "person" ? personChip(personRef(o, key), { empty: "—" })
      : String(type).startsWith("rec:") && v ? shopRefChip(String(v))
      : type === "money" ? (esc(shopMoneyText(o, key)) || "—")
      : esc(v) || "—";
    return `<div class="f"><label>${esc(label)}</label><div class="ro">${shown}</div></div>`;
  }

  /* "person" — a pick from the roster, stored as <key> + <key>Email (see
     personRef in core.js). The picker keeps its own state across repaints. */
  if (type === "person") {
    return personField({ id: `shop-${spec.coll}-${o.id}-${key}`, label, value: personRef(o, key),
      save: "updShopPerson", args: [tab, key] });
  }
  if (type === "select") {
    const list = key === "stage" ? (c.stage || []) : (opts || []);
    /* A stored value the list no longer offers stays selectable instead of
       silently reading as blank and being overwritten by the next edit — the
       courtesy partBomRefOptions already extends to a stale BOM ref. This is
       what lets qty carry its legacy free text ("about half", "2 yd left")
       after becoming an enum, with no migration and nothing parsed. */
    const shown = v !== "" && !list.some(x => String(x) === String(v)) ? [v, ...list] : list;
    return `<div class="f"><label>${esc(label)}</label>
      <select onchange="updShop('${tab}','${key}',this.value)">
        ${shown.map(x => `<option ${String(v) === String(x) ? "selected" : ""}>${esc(x)}</option>`).join("")}
      </select></div>`;
  }
  /* "sug" — type freely, with what everyone else already typed offered as
     suggestions. A native datalist, the idiom engFld already uses: no library,
     no PICKERS state (that is a multi-select and the wrong shape), and it
     survives a re-render because it holds none. It exists for matKey, where
     consistency is the whole value: "IN-2" typed once diverges from "IN2"
     forever and no machine can merge them back. */
  if (type === "sug") {
    const dl = `dl-${spec.coll}-${key}`;
    return `<div class="f"><label>${esc(label)}</label>
      <input list="${dl}" value="${esc(v)}" onchange="updShop('${tab}','${key}',this.value)">
      <datalist id="${dl}">${shopSuggest(spec.coll, key).map(x => `<option value="${esc(x)}"></option>`).join("")}</datalist></div>`;
  }
  /* "dens" — a "sug" whose suggestions are not what has been typed before but
     what the shop actually stocks, which is the useful list on a collection
     holding three values. Its own type rather than a key-name check in
     updShop, because a field key becoming load-bearing is how "density"
     appearing on a second schema quietly changes behaviour. */
  if (type === "dens") {
    return `<div class="f"><label>${esc(label)}</label>${densityInput(
      `sf-${spec.coll}-${key}`, v, `onchange="updShop('${tab}','${key}',this.value)"`)}</div>`;
  }
  if (String(type).startsWith("rec:")) {
    return `<div class="f"><label>${esc(label)}</label>
      <select onchange="updShop('${tab}','${key}',this.value)">
        <option value="">—</option>
        ${shopRefOptions(String(type).slice(4), String(v)).join("")}
      </select></div>`;
  }
  if (type === "money") {
    return `<div class="f"><label>${esc(label)}</label>
      <input type="number" inputmode="decimal" step="0.01" min="0" value="${esc(v)}" onchange="updShop('${tab}','${key}',this.value)"></div>`;
  }
  /* "ehs" — the UC tag serial, with a camera next to it: 24 characters of
     CA00… is a thing you scan, not a thing you retype. The layout is
     scanLotInto's (workorders.js); the write goes through updShop either
     way, so typed and scanned codes meet the same normalisation and the
     same one-tag-one-container refusal. */
  if (type === "ehs") {
    return `<div class="f"><label>${esc(label)}</label>
      <div style="display:flex;gap:8px">
        <input type="text" style="flex:1 1 auto;min-width:0" value="${esc(v)}"
          autocapitalize="characters" autocomplete="off" spellcheck="false"
          onchange="updShop('${tab}','${key}',this.value)">
        ${typeof scanSupported === "function" && scanSupported()
          ? `<button type="button" class="sm ib" title="Scan the EH&S tag" onclick="scanEhsInto('${tab}')">${icon("scan", 15)}</button>` : ""}
      </div></div>`;
  }
  const inputType = type === "date" ? "date" : type === "num" ? "number" : "text";
  return `<div class="f"><label>${esc(label)}</label>
    <input type="${inputType}" value="${esc(v)}" onchange="updShop('${tab}','${key}',this.value)"></div>`;
}

/* Every distinct value already stored under `key` in `coll`, for a "sug"
   field's datalist. Sorted, deduped, blanks dropped. Cheap enough to build per
   render: it is one pass over a collection the client already holds whole. */
function shopSuggest(coll, key) {
  const seen = new Set();
  for (const o of DB[coll] || []) {
    const v = String(o[key] ?? "").trim();
    if (v) seen.add(v);
  }
  if (key === "matKey" && typeof restockRules === "function") {
    for (const r of restockRules()) if (r.matKey) seen.add(String(r.matKey));
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/* Candidates for a reference field. `what` is either a collection name or a
   class prefix inside a multi-class collection. */
function shopRefOptions(what, cur) {
  let recs = [];
  if (DB[what]) recs = DB[what];
  else {
    for (const coll of ["items", "lots", "molds"]) {
      recs = recs.concat((DB[coll] || []).filter(o => o.cls === what));
    }
  }
  /* A retired shelf is not somewhere you can put something. Every hand-built
     bin list already filtered these out (invActiveBins, quickMove, the board
     modal) and this one did not, so the schema-driven Location dropdowns were
     the lone way to file a record onto a dead shelf — where it then rendered
     NOWHERE: renderInvMap only walks active bins, and invIndex buckets it
     under the retired id rather than into the unhoused pile, so it did not
     even show up in the "no location" count. Silently orphaned. The currently
     stored value stays listed so an existing record can still show its own
     location and be moved off it. */
  if (what === "BIN") recs = recs.filter(o => o.stage !== "Retired" || o.id === cur);
  return recs
    .slice().sort((a, b) => cmpId(a.id, b.id))
    .map(o => `<option value="${esc(o.id)}" ${o.id === cur ? "selected" : ""}>${esc(o.name || o.partName || o.label || o.id)} · ${esc(o.id)}</option>`);
}

/* The haystack a list search actually looks in: the values the schema declares,
   never the record's JSON. JSON.stringify matched KEY names too, so "open"
   found every lot with an openedOn field, "location" found everything, and "no"
   found every vendorLot — and it re-serialised the whole collection on every
   keystroke. Cached against updatedAt, which Firestore already stamps. */
function shopHay(spec, o) {
  if (o.__hay != null && o.__hayV === o.updatedAt) return o.__hay;
  const parts = [o.id];
  for (const f of spec.f) { const v = o[f[0]]; if (v != null && typeof v !== "object") parts.push(v); }
  o.__hayV = o.updatedAt;
  o.__hay = parts.join(" ").toLowerCase();
  return o.__hay;
}

/* Which fields belong to which class. Kept as one table rather than scattered
   conditionals so the answer to "why is this field missing" is in one place. */
const SHOP_FIELDS_BY_CLASS = {
  PNL: ["name", "stage", "location", "stack", "session", "laidOn", "thicknessMm", "coupons", "wo", "fabricLots", "resinLot", "hardenerLot", "lotSource"],
  JIG: ["name", "stage", "location", "unitCost", "wo"],
  BIN: ["name", "stage", "site", "locKind", "flam", "ehsBarcode", "walkedAt", "walkedBy"],
  /* FAB deliberately has no expiresOn and no hazard: dry cloth does not expire
     and is not a solvent, and a column of dashes teaches people the whole
     section is decorative. Add them the day prepreg arrives, not before.
     CON gains expiresOn because MEKP and adhesives genuinely do expire — and
     MEKP is the material PP-02 names by name. */
  FAB: ["name", "matKey", "stage", "vendorLot", "supplier", "receivedOn", "openedOn", "location", "parentId", "qty", "emptiedOn", "unitCost", "costUnit", "lowFlag"],
  RSN: ["name", "matKey", "stage", "role", "ratio", "vendorLot", "ehsBarcode", "supplier", "receivedOn", "openedOn", "expiresOn", "expirySource", "location", "qty", "emptiedOn", "unitCost", "costUnit", "hazard", "lowFlag"],
  CON: ["name", "matKey", "stage", "vendorLot", "ehsBarcode", "supplier", "receivedOn", "openedOn", "expiresOn", "expirySource", "location", "qty", "count", "countedAt", "emptiedOn", "unitCost", "costUnit", "hazard", "lowFlag"],
};
function shopFieldApplies(spec, cls, key) {
  const allowed = SHOP_FIELDS_BY_CLASS[cls];
  return allowed ? allowed.includes(key) : true;
}

/* ---------- migration: molds out of the work orders that mention them ----------
 *
 * `wo.mold.moldId` is free text, so "MOLD-UT-INLET" and "UT INLET MOLD" are the
 * same mold and no algorithm should be allowed to decide that. This proposes
 * and a human confirms; nothing is merged automatically. Lead-only because it
 * creates records.
 *
 * wo.mold is NOT deleted. print.js does `const mold = wo.mold || {}` and
 * travelers already in the RFS binder reference the embedded values; removing
 * it would rewrite printed history. A new `wo.moldRef` points at the record.
 */
function findMoldsInWorkOrders() {
  if (!isLead()) return;
  const seen = new Map();
  for (const w of DB.workOrders || []) {
    const raw = String((w.mold && w.mold.moldId) || "").trim();
    if (!raw) continue;
    const norm = raw.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
    if (!seen.has(norm)) seen.set(norm, { raw, norm, wos: [], mold: w.mold || {} });
    seen.get(norm).wos.push(w);
  }
  const found = [...seen.values()].filter(g => !(DB.molds || []).some(m => (m.legacyNames || []).includes(g.raw)));
  if (!found.length) { toast("No unimported mold names found in work orders."); return; }

  MOLD_IMPORT = found.map(g => ({ ...g, take: true }));
  openModal(moldImportHtml());
}

let MOLD_IMPORT = [];

function moldImportHtml() {
  const n = MOLD_IMPORT.filter(g => g.take).length;
  return `<h3>Molds found in work orders</h3>
  <p class="muted">These are the free-text mold names on existing work orders. Untick anything that is
  the same physical mold under a different name, then fix the duplicate by hand afterwards — no
  algorithm should decide that two spellings are one mold.</p>
  <div class="lblist">
    ${MOLD_IMPORT.map((g, i) => `<label class="chk">
      <input type="checkbox" ${g.take ? "checked" : ""} onchange="MOLD_IMPORT[${i}].take=this.checked;moldImportRefresh()">
      <b>${esc(g.raw)}</b> <span class="muted">${g.wos.length} work order${g.wos.length === 1 ? "" : "s"}</span>
    </label>`).join("")}
  </div>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${n ? "" : "disabled"} onclick="runMoldImport()">Create ${n} mold${n === 1 ? "" : "s"}</button>
  </div>`;
}
function moldImportRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = moldImportHtml();
}

async function runMoldImport() {
  const take = MOLD_IMPORT.filter(g => g.take);
  closeModal();
  let made = 0;
  for (const g of take) {
    const id = await allocId("molds");
    if (!id) break;
    const w = g.wos[0];
    const m = {
      id,
      name: g.raw.replace(/^MOLD[-\s]*/i, "").replace(/[-_]+/g, " ").trim() || g.raw,
      legacyNames: [g.raw],
      stage: g.mold.sealingType ? "Sealed" : "Machined",
      location: g.mold.location || "",
      density: String(canonDensity(g.mold.density) ?? ""),
      layers: g.mold.layers || "",
      sealingType: g.mold.sealingType || "",
      wo: w ? w.id : "",
      uses: g.wos.length,
      rev: "A",
      createdBy: myEmail(),
      retro: true,
    };
    DB.molds.push(m);
    save("molds", m);
    // Point every work order that named this mold at the new record. The
    // embedded wo.mold stays exactly as it was.
    for (const w2 of g.wos) { w2.moldRef = id; save("workOrders", w2, "moldRef"); }
    made++;
  }
  toast(`${made} mold${made === 1 ? "" : "s"} created from work orders.`);
  view = { ...view, tab: "molds", mode: "list", id: null };
  render(); syncUrl();
}

/* ---------- migration: the missing part <-> work order edge ----------
 *
 * sn5-parts.json has 0 of 33 rows carrying a workOrderId. The two lists are
 * joined only by partName string equality, and the strings do not even agree
 * between the original spreadsheet's own sheets. The traceability gap is not
 * missing ids, it is missing EDGES, and this is twenty lines that turn two
 * disconnected lists into a graph.
 *
 * The ambiguity that matters is DUPLICATE PART NAMES: two parts called STRUT
 * and one work order, and there is no way to know whose run it was. That case
 * is still refused — a wrong edge is worse than no edge, and duplicate part
 * names are a real FEB pattern (partOf() in core.js refuses it too).
 *
 * One part matching SEVERAL work orders is NOT ambiguous any more, and used to
 * be thrown away. Under a one-to-many model that is just a part with several
 * runs — a remake after a failed infusion is the ordinary case. All of them get
 * linked and the newest becomes the current run.
 */
async function backfillPartWorkOrderLinks() {
  if (!isLead()) return;
  const byName = {};
  for (const w of DB.workOrders || []) {
    const k = String(w.partName || "").trim().toUpperCase();
    if (!k) continue;
    (byName[k] = byName[k] || []).push(w);
  }
  // A name is only safe to match on if exactly one PART answers to it.
  const partsByName = {};
  for (const p of DB.parts || []) {
    const k = String(p.partName || "").trim().toUpperCase();
    if (!k) continue;
    (partsByName[k] = partsByName[k] || []).push(p);
  }
  const todo = [];
  let refused = 0, extraRuns = 0;
  for (const p of DB.parts || []) {
    const k = String(p.partName || "").trim().toUpperCase();
    const hits = (byName[k] || []).filter(w => !w.partId);
    if (!hits.length) continue;
    if ((partsByName[k] || []).length > 1) { refused += hits.length; continue; }
    // Newest first, so the pointer lands on the current run.
    hits.sort((a, b) => String(b.createdDate || "").localeCompare(String(a.createdDate || "")) ||
      cmpId(b.id, a.id));
    todo.push([p, hits]);
    if (hits.length > 1) extraRuns += hits.length - 1;
  }
  if (!todo.length) {
    toast(refused ? `Nothing safe to link — ${refused} work order${refused === 1 ? "" : "s"} match a duplicated part name.`
      : "Every part that can be matched already is.");
    return;
  }

  const nWo = todo.reduce((n, [, hits]) => n + hits.length, 0);
  const ok = await confirmAsync(
    `Link ${nWo} work order${nWo === 1 ? "" : "s"} to ${todo.length} part${todo.length === 1 ? "" : "s"} with the same name?\n\n` +
    (extraRuns ? `${extraRuns} of them are extra runs on a part that already has one — a remake is a second run, so they all get linked and the newest becomes current.\n\n` : "") +
    (refused ? `${refused} work order${refused === 1 ? " is" : "s are"} left alone because two or more parts share that name — a wrong link is worse than no link.\n\n` : "") +
    `Nothing is overwritten: work orders that already name a part are skipped.`,
    { ok: "Link them", danger: false });
  if (!ok) return;

  for (const [p, hits] of todo) {
    for (const w of hits) { w.partId = p.id; save("workOrders", w, "partId"); }
    if (!p.workOrderId) { p.workOrderId = hits[0].id; save("parts", p, "workOrderId"); }
  }
  toast(`${nWo} work order${nWo === 1 ? "" : "s"} linked across ${todo.length} part${todo.length === 1 ? "" : "s"}.`);
  render();
}
