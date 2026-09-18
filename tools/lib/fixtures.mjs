/* fixtures.mjs — demo records for the collections that have no SN5 archive.
 *
 * WHY THIS EXISTS
 * loadArchive() in core.js seeds four collections: workOrders, parts, schedule
 * and stock. That leaves Tickets, Budget, Weekly Plan and People rendering
 * their empty states, so a screenshot sweep photographed five of eleven tabs
 * saying "nothing here yet" and called it an audit. An empty tab hides exactly
 * the problems a layout audit is looking for: density, wrapping, overflow, how
 * a status colour reads next to the one below it.
 *
 * These are fixtures, not seeds. Nothing here is written to Firestore and
 * nothing ships in the app. They exist so tools/shoot_ui.mjs and
 * tools/test_appui.mjs can drive a full-looking app, and they are deliberately
 * FEB-shaped (real subteams, real stations, real part names) so a reviewer
 * reads the layout instead of tripping over lorem ipsum.
 *
 * Dates are computed from today rather than hardcoded. A fixture with a frozen
 * due date drifts into "179 days late" over a season and every screenshot grows
 * a red badge that isn't a real finding.
 */

const DAY = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const stamp = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();

/* The roster. Five people is the number that makes an avatar stack overlap,
   a People table scroll on a phone, and a "who is on this" row wrap. */
export const USERS = [
  { email: "starbuck@berkeley.edu", name: "Simon Starbuck", role: "lead" },
  { email: "njepsen@berkeley.edu", name: "Nick Jepsen", role: "lead" },
  { email: "arivera@berkeley.edu", name: "Ana Rivera", role: "member" },
  { email: "dchen@berkeley.edu", name: "Dana Chen", role: "member" },
  { email: "mokafor@berkeley.edu", name: "Miles Okafor", role: "member" },
];

/* Tickets. One per status so the kanban board renders all six columns with
   cards in them — an empty column and a full one are different layout
   problems and the board has to survive both. Titles are long enough to wrap
   in a 176px column, which is where the board actually breaks. */
export const PROJECTS = [
  {
    id: "TKT-0031", kind: "project", title: "Redesign the undertray mold for a flatter draft angle",
    status: "In Progress", priority: "High", dueDate: iso(9), subteam: "AERO",
    description: "The SN5 mold fought the bag at the diffuser lip. Open the draft and re-cut.",
    assignees: ["arivera@berkeley.edu", "dchen@berkeley.edu"],
    watchers: ["starbuck@berkeley.edu", "arivera@berkeley.edu"],
    relatedParts: ["P-SN5-005"], relatedTickets: [], relatedWorkOrders: [],
    files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0032", kind: "issue", title: "Clamshell mating surface sits 2mm proud",
    status: "Collecting Data", priority: "High", dueDate: iso(3), subteam: "AERO",
    description: "Measured on three parts. Need the CMM trace before we cut anything.",
    assignees: ["mokafor@berkeley.edu"], watchers: ["starbuck@berkeley.edu"],
    relatedParts: [], relatedTickets: ["TKT-0031"], relatedWorkOrders: [],
    workOrderId: "WO-SN6-002", resolutionMethod: "",
    stepRef: { seq: 1, index: 0, title: "Infuse" },
    files: [], comments: [], whatHappened: "Found at trial fit on 2 of 3 clamshells.", retro: false,
  },
  {
    id: "TKT-0033", kind: "project", title: "Write the mold-sealing SOP for CS-004",
    status: "To Do", priority: "Medium", dueDate: iso(16), subteam: "BERGO",
    description: "Duratec is out, XCR is in. The standard still names the old product.",
    assignees: ["njepsen@berkeley.edu"], watchers: ["njepsen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0034", kind: "project", title: "Source a second infusion pump before the undertray week",
    status: "On Hold", priority: "Low", dueDate: iso(-4), subteam: "BERGO",
    description: "Blocked on the purchasing freeze. Revisit after the sponsor cheque clears.",
    assignees: ["dchen@berkeley.edu"], watchers: ["starbuck@berkeley.edu", "dchen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0035", kind: "project", title: "Ground the catch can and verify under 5 ohms",
    status: "Done", priority: "Medium", dueDate: iso(-11), subteam: "AUTO-MECH",
    description: "Copper mesh over the aluminium, same method the diffuser passed with.",
    assignees: ["arivera@berkeley.edu"], watchers: ["arivera@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0036", kind: "issue", title: "Etch locker double-booked with the Jacobs basement move",
    status: "Cancelled", priority: "Low", dueDate: iso(-20), subteam: "AERO",
    description: "Resolved itself when the basement shelf opened up. Closing.",
    assignees: [], watchers: ["starbuck@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [],
    workOrderId: "WO-SN6-002", resolutionMethod: "UAI (Use As Is)",
    whatHappened: "The locker booking clashed with the basement move, so the panels sat out overnight.",
    dispositionNote: "Bagged and moved to RFS rack 4 the next morning; no moisture pickup measured.",
    status: "Done",
    files: [], comments: [], retro: false,
  },
  /* Sub-tickets, both under TKT-0031 (which is DB.projects[0], the record the
     populated-content suites open). One open and one done-but-late, so the
     children table renders its done/total count AND a late warn in the same
     fixture. The browser suites had zero parentId coverage before these. */
  {
    id: "TKT-0037", kind: "project", parentId: "TKT-0031",
    title: "Machine the plug from the new surface model",
    status: "To Do", priority: "High", dueDate: iso(5), subteam: "AERO",
    description: "Blocked until the draft-angle cut lands in CAD.",
    assignees: ["mokafor@berkeley.edu"], watchers: ["arivera@berkeley.edu", "mokafor@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
  {
    id: "TKT-0038", kind: "project", parentId: "TKT-0031",
    title: "Compare draft angles against the SN5 bag failure photos",
    status: "Done", priority: "Medium", dueDate: iso(-2), subteam: "AERO",
    description: "Annotated photo set is in the parent's files.",
    assignees: ["dchen@berkeley.edu"], watchers: ["dchen@berkeley.edu"],
    relatedParts: [], relatedTickets: [], relatedWorkOrders: [], files: [], comments: [], retro: false,
  },
];

/* Budget. Spans all three statuses, and TKT-shaped costs: one over $50 and
   still Submitted, so the "needs approval" pill renders somewhere. */
export const BUDGET = [
  {
    id: "BUY-0012", item: "Airtech Wrightlon 4600 release film, 100 yd", purchaser: "Ana Rivera",
    purpose: "Manufacturing", status: "Submitted", cost: "184.50", dateOrdered: iso(-1),
    source: "Composite Envisions", notes: "", retro: false, createdBy: "arivera@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0013", item: "Infusion spiral tubing, 50 ft", purchaser: "Dana Chen",
    purpose: "Manufacturing", status: "Ordered", cost: "42.10", dateOrdered: iso(-6),
    source: "Fibre Glast", notes: "Shipped, tracking in #purchasing.", retro: false,
    createdBy: "dchen@berkeley.edu", receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0014", item: "Renshape 5169 tooling board, 2 sheets", purchaser: "Nick Jepsen",
    purpose: "Tooling", status: "Ordered", cost: "1290.00", dateOrdered: iso(-13),
    source: "Freeman Supply", notes: "Long lead. Confirm before the mold week.", retro: false,
    createdBy: "njepsen@berkeley.edu", receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0015", item: "Nitrile gloves, box of 100", purchaser: "Miles Okafor",
    purpose: "Restock", status: "Reimbursed", cost: "18.99", dateOrdered: iso(-24),
    source: "McMaster-Carr", notes: "", retro: false, createdBy: "mokafor@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
  {
    id: "BUY-0016", item: "Vacuum bag sealant tape, 6 rolls", purchaser: "Simon Starbuck",
    purpose: "Manufacturing", status: "Reimbursed", cost: "96.00", dateOrdered: iso(-31),
    source: "Airtech", notes: "", retro: false, createdBy: "starbuck@berkeley.edu",
    receiptUrl: "", receiptPath: "",
  },
];

/* Notifications drive the topbar bell's unread count, which is a positioned
   badge over an icon button and therefore its own little layout risk. */
export const NOTIFICATIONS = [
  { id: "N1", to: "starbuck@berkeley.edu", text: "Ana Rivera mentioned you on TKT-0031", link: "projects:TKT-0031", read: false, ts: stamp(-0.05) },
  { id: "N2", to: "starbuck@berkeley.edu", text: "TKT-0032 moved to Collecting Data", link: "projects:TKT-0032", read: false, ts: stamp(-0.3) },
  { id: "N3", to: "starbuck@berkeley.edu", text: "Dana Chen assigned you TKT-0034", link: "projects:TKT-0034", read: true, ts: stamp(-2) },
];

/* Weekly Plan writes goals / doneTickets / cars onto the SAME schedule docs
   Timeline uses, so these are patched onto the archive rather than replacing
   it. Applied to whichever week is current, or the first week if the archive
   is undated (which the SN5 seed entirely is).
   Returned as a function because the caller supplies the week id. */
export const weekPlanPatch = (weekId) => ({
  goals: [
    { id: "G1", person: "arivera@berkeley.edu", text: "Finish CAM for the undertray mold", done: true, due: iso(2) },
    { id: "G2", person: "arivera@berkeley.edu", text: "Order the missing tooling board", done: false, due: iso(1) },
    { id: "G3", person: "njepsen@berkeley.edu", text: "Write the mold-sealing SOP for CS-004", done: false, due: iso(3) },
    { id: "G4", person: "dchen@berkeley.edu", text: "Bag-and-leak-check the clamshell tool", done: false, due: iso(-1) },
    { id: "G5", person: "mokafor@berkeley.edu", text: "Trim and grind the catch can", done: true, due: iso(-2) },
  ],
  doneTickets: [],
  cars: [
    {
      id: "CAR1", driver: "arivera@berkeley.edu", day: "Sat", time: "9:00 AM", capacity: 4,
      passengers: ["dchen@berkeley.edu", "mokafor@berkeley.edu", "njepsen@berkeley.edu"],
    },
    { id: "CAR2", driver: "njepsen@berkeley.edu", day: "Sun", time: "10:00 AM", capacity: 3, passengers: [] },
  ],
  weekId,
});

/* The JS a page runs to install all of the above, given an already-booted app.
   Kept as a string because both consumers inject it with page.evaluate(), and
   because it must run AFTER the archive fetch so the schedule patch has a week
   to attach to. */
/* Molds, items and lots (2026-08-03). Three tabs photograph as empty states
   without these, and an empty tab is the one state a density audit learns
   nothing from. Content is deliberately hostile where it can be: a mold name
   long enough to clip, a stack string at full CS-002 length, an item with
   nothing but an id. */
export const MOLDS = [
  /* The one mold with datum cut plans on it: three parts have come off it, so
     it is the only one in the fixture that would plausibly have any. Every
     other mold photographs the empty state, which is the common case. */
  { id: "MOLD-SN6-001", name: "UT INLET L/H", stage: "Ready for layup", location: "BIN-SN6-001",
    board: "BRD-SN5-002", density: "30", layers: "2 x 3in", sealingType: "XCR",
    sealedDate: "2026-09-14", sealedBy: "RJB", uses: 3, rev: "A",
    files: [{ id: "F-DATUM-1", name: "UT INLET datum cuts rev B.pdf", type: "application/pdf",
      url: "https://fixture.invalid/datum.pdf", by: "rjb@berkeley.edu", ts: "2026-09-15T18:04:00.000Z",
      path: "molds/MOLD-SN6-001/datum.pdf" }] },
  { id: "MOLD-SN6-002", name: "UNDERTRAY LEFT SIDE POD OUTBOARD SKIN LOWER SECTION TWO",
    stage: "Machined", density: "60", uses: 0, rev: "A" },
  { id: "MOLD-SN6-003", name: "NOSECONE", stage: "Board glued", uses: 0 },
  /* The only mold the cut list will offer: it is at "Designed" and it owns
     STK-SN6-001 below. Everything past Designed is deliberately held back, so
     without this pair the cut list and the mark-cut confirm photograph as
     empty states. It is otherwise the bare-minimum mold record on purpose. */
  { id: "MOLD-SN6-004", stage: "Designed", currentPlanId: "STK-SN6-001" },
];
export const ITEMS = [
  { id: "PNL-SN6-001", cls: "PNL", name: "CORE COMPARISON PANEL", stage: "Cured",
    stack: "6X 195 TWILL + .125 NOMEX + 88 SPREAD-TOW", laidOn: "2026-09-22",
    coupons: "C01-C12", thicknessMm: 1.9, resinLot: "RSN-SN6-001", lotSource: "scanned" },
  { id: "PNL-SN6-002", cls: "PNL", name: "GLASS INFUSION TRIAL", stage: "Planned" },
  { id: "BIN-SN6-001", cls: "BIN", name: "RFS CONTAINER SHELF A", stage: "Active" },
  { id: "BIN-SN6-002", cls: "BIN", name: "JACOBS BASEMENT SHELF B3", stage: "Active" },
  { id: "JIG-SN6-001", cls: "JIG", name: "NOSECONE TRIM JIG", stage: "Stored", location: "BIN-SN6-002" },
];
/* THIS SEASON'S PARTS — the blueprint the Season tab is for.

   All 33 records in sn5-parts.json carry retro: true, because they are a
   finished season. Both the Season tab and tracker.js's feed exclude retro on
   purpose, so without these the blueprint photographs EMPTY in every screenshot
   and the browser suites never render a single one of its cells. Same gap the
   two live work orders below were added to close, one collection over.

   Deliberately uneven, because that is what a blueprint looks like in
   September: one part fully specified, one half-filled, one with a name and
   nothing else, and one with no name at all — somebody knows a fourth panel is
   coming and has not decided what it is. Between them they exercise every cell
   type the table renders: all three stage colours including N/A, an engineer on
   the roster, an engineer who is NOT (the SN5 tracker is full of bare first
   names, and the select has to keep a value it does not recognise), a set
   deadline and a missing one. */
export const SEASON_PARTS = [
  {
    id: "P-SN6-001", partName: "NOSECONE OUTER", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "2x 200 2x2 TWILL", moldLocation: "RFS rack 2",
    moldEngineer: "Dana Chen", manufacturingEngineer: "Miles Okafor",
    cadProgress: "Mold CAD/CAM Done", moldProgress: "Machining", layupProgress: "Not Started",
    weightG: "420", weightActualG: "", layupDeadline: iso(47),
    comments: "Draft angle opened 2° from the SN5 mold.",
    commentLog: [], workOrderId: "", layupStack: [], retro: false, rnd: false, createdBy: "starbuck@berkeley.edu",
  },
  {
    id: "P-SN6-002", partName: "UT DIFFUSER", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "", moldLocation: "RFS",
    moldEngineer: "Ana Rivera", manufacturingEngineer: "",
    cadProgress: "Part CAD Done", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: iso(61), comments: "",
    commentLog: [], workOrderId: "", layupStack: [], retro: false, rnd: false, createdBy: "starbuck@berkeley.edu",
  },
  {
    id: "P-SN6-003", partName: "FIREWALL", subteam: "BERGO", layupType: "GLASS INFUSION",
    layupSchedule: "", moldLocation: "",
    // Not on the roster: the select must offer this value rather than blanking
    // the cell the first time anybody touches the row.
    moldEngineer: "Justin", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "N/A (Flat)", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "",
    commentLog: [], workOrderId: "", layupStack: [], retro: false, rnd: false, createdBy: "starbuck@berkeley.edu",
  },
  {
    id: "P-SN6-004", partName: "", subteam: "AUTO-MECH", layupType: "MOLD WET LAY",
    layupSchedule: "", moldLocation: "", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "",
    commentLog: [], workOrderId: "", layupStack: [], retro: false, rnd: false, createdBy: "starbuck@berkeley.edu",
  },
];

/* R&D parts: the OTHER SIDE of the Season tab's filter.

   SEASON_PARTS exists because all 33 SN5 parts are retro and the Season tab
   excludes retro, so the blueprint photographed empty for a whole release and
   nothing failed — every assertion was on a count that was always zero. R&D is
   a second filter on the same tab and would have repeated it exactly: with only
   season parts in the fixtures, "R&D is excluded" passes against no R&D parts
   at all.

   So these are deliberately awkward:
     P-SN6-101  linked to a run, dated, engineered — the ordinary case, and the
                one that proves a run INHERITS its part's programme
     P-SN6-102  sparse and undated — an R&D part is a real part, and a real part
                is allowed to be half-filled-in
     P-SN6-103  retro AND rnd at once. This is the one that matters: it is the
                only fixture that fails a seasonRows() written with && instead
                of ||, and it is legal (R&D work from a finished season). */
/* ---- the R&D bench (the `rnd` collection, NOT the flag above) ----

   These photograph the coupon grid, which is the whole reason they exist: with
   an empty collection every visual suite measures the tab's EMPTY STATE and the
   width sweep proves nothing about the thing most likely to overflow.

   Shaped to exercise the awkward cases rather than the happy one:
     RDS-SN6-001  a project with two batches under it, three columns (one input,
                  two results) inherited by both — the nesting and the column
                  inheritance in one fixture
     RDS-SN6-002  a batch whose coupons are all measured, so Compare renders
     RDS-SN6-003  a batch half-measured, with a Scrapped coupon and blanks, so
                  the coverage line and the scrapped filter have something to do
     RDS-SN6-004  a plain named folder: no columns, no parent, no question. The
                  "declare nothing and it is a folder" case, which is the one a
                  wizard-shaped design would have made impossible. */
const rdCoupon = (n, study, label, status, vals, notes) => ({
  id: "CPN-SN6-" + String(n).padStart(3, "0"), cls: "CPN", study, label, status,
  vals: vals || {}, notes: notes || "", notesHtml: "", photos: [],
  createdBy: "starbuck@berkeley.edu",
});
export const RND = [
  { id: "RDS-SN6-001", cls: "RDS", name: "Nosecone infusion trials", status: "Active", parent: "",
    question: "Does a 20 °C hotter post-cure move the tensile knee?",
    labelPrefix: "C", labelNext: 1,
    cols: [
      { cid: "Kcure", name: "Cure temp", role: "input", type: "num", unit: "°C", hidden: false },
      { cid: "Kthk", name: "Thickness", role: "result", type: "num", unit: "mm", hidden: false },
      { cid: "Kload", name: "Peak load", role: "result", type: "num", unit: "N", hidden: false },
    ],
    defaults: { stack: "6X 195 TWILL", resinLot: "RSN-SN6-001", lotSource: "scanned", by: "starbuck@berkeley.edu" },
    notes: "", notesHtml: "", createdBy: "starbuck@berkeley.edu", createdOn: iso(-20),
  },
  { id: "RDS-SN6-002", cls: "RDS", name: "Batch A — 120 °C", status: "Done", parent: "RDS-SN6-001",
    question: "", labelPrefix: "A", labelNext: 7, cols: [], defaults: {},
    notes: "", notesHtml: "", createdBy: "starbuck@berkeley.edu", createdOn: iso(-20) },
  { id: "RDS-SN6-003", cls: "RDS", name: "Batch B — 140 °C", status: "Active", parent: "RDS-SN6-001",
    question: "", labelPrefix: "B", labelNext: 7, cols: [], defaults: { resinLot: "RSN-SN6-002" },
    notes: "", notesHtml: "", createdBy: "ana@berkeley.edu", createdOn: iso(-9) },
  { id: "RDS-SN6-004", cls: "RDS", name: "Offcut library", status: "Parked", parent: "",
    question: "", labelPrefix: "L", labelNext: 4, cols: [], defaults: {},
    notes: "", notesHtml: "", createdBy: "ana@berkeley.edu", createdOn: iso(-31) },

  rdCoupon(1, "RDS-SN6-002", "A01", "Tested", { Kcure: 120, Kthk: 2.09, Kload: 588 }),
  rdCoupon(2, "RDS-SN6-002", "A02", "Tested", { Kcure: 120, Kthk: 1.98, Kload: 561 }, "dry corner, trimmed back"),
  rdCoupon(3, "RDS-SN6-002", "A03", "Tested", { Kcure: 120, Kthk: 2.17, Kload: 604 }),
  rdCoupon(4, "RDS-SN6-002", "A04", "Tested", { Kcure: 120, Kthk: 2.11, Kload: 597 }),
  rdCoupon(5, "RDS-SN6-002", "A05", "Tested", { Kcure: 140, Kthk: 2.14, Kload: 612 }),
  rdCoupon(6, "RDS-SN6-002", "A06", "Tested", { Kcure: 140, Kthk: 2.05, Kload: 590 }),

  rdCoupon(7, "RDS-SN6-003", "B01", "Tested", { Kcure: 140, Kthk: 2.22, Kload: 641 }),
  rdCoupon(8, "RDS-SN6-003", "B02", "Tested", { Kcure: 140, Kthk: 2.19, Kload: 633 }),
  rdCoupon(9, "RDS-SN6-003", "B03", "Scrapped", { Kcure: 140, Kthk: 1.62 }, "bag leaked overnight — not a data point"),
  rdCoupon(10, "RDS-SN6-003", "B04", "Made", { Kcure: 160 }),
  rdCoupon(11, "RDS-SN6-003", "B05", "Made", { Kcure: 160 }),
  rdCoupon(12, "RDS-SN6-003", "B06", "Planned", {}),

  rdCoupon(13, "RDS-SN6-004", "L01", "Made", {}, "half a metre of 195 twill, RFS shelf 2"),
  rdCoupon(14, "RDS-SN6-004", "L02", "Made", {}, "core offcuts, assorted"),
  rdCoupon(15, "RDS-SN6-004", "L03", "Made", {}),
];

export const RND_PARTS = [
  {
    id: "P-SN6-101", partName: "VG TRIAL PANEL", subteam: "AERO", layupType: "MOLD INFUSION",
    layupSchedule: "4x 195 TWILL", moldLocation: "RFS rack 4",
    moldEngineer: "Ana Rivera", manufacturingEngineer: "Miles Okafor",
    cadProgress: "Part CAD Done", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "85", weightActualG: "", layupDeadline: iso(24),
    comments: "Vortex generator draft study — feeds the SN7 decision, not the SN6 car.",
    commentLog: [], workOrderId: "WO-SN6-003", layupStack: [], retro: false, rnd: true,
    createdBy: "starbuck@berkeley.edu",
  },
  {
    id: "P-SN6-102", partName: "CORE BONDING COUPON SET", subteam: "BERGO", layupType: "MOLD WET LAY",
    layupSchedule: "", moldLocation: "", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "Not Started", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "",
    commentLog: [], workOrderId: "", layupStack: [], retro: false, rnd: true,
    createdBy: "starbuck@berkeley.edu",
  },
  {
    id: "P-SN6-103", partName: "SN5 SHAKEDOWN PANEL", subteam: "AERO", layupType: "GLASS INFUSION",
    layupSchedule: "", moldLocation: "", moldEngineer: "", manufacturingEngineer: "",
    cadProgress: "Not Started", moldProgress: "N/A (Flat)", layupProgress: "Not Started",
    weightG: "", weightActualG: "", layupDeadline: "", comments: "",
    commentLog: [], workOrderId: "", layupStack: [], retro: true, rnd: true,
    createdBy: "starbuck@berkeley.edu",
  },
];

export const LOTS = [
  { id: "RSN-SN6-001", cls: "RSN", name: "IN2 INFUSION RESIN", role: "resin", stage: "Open",
    ratio: "100 : 30 BY WEIGHT", vendorLot: "24C-0918", supplier: "Easy Composites",
    receivedOn: "2026-08-28", openedOn: "2026-09-02", expiresOn: "2027-08-28",
    location: "BIN-SN6-001", qty: "2.1 kg" },
  { id: "RSN-SN6-002", cls: "RSN", name: "AT30 SLOW HARDENER", role: "hardener", stage: "Open",
    vendorLot: "24C-0919", supplier: "Easy Composites", location: "BIN-SN6-001" },
  { id: "FAB-SN6-001", cls: "FAB", name: "195 TWILL SIGMATEX", stage: "Open", qty: "12 m",
    supplier: "Sigmatex", location: "BIN-SN6-001" },
  { id: "FAB-SN6-002", cls: "FAB", name: "195 TWILL OFFCUT", stage: "Open",
    parentId: "FAB-SN6-001", qty: "0.8 m" },
  { id: "CON-SN6-001", cls: "CON", name: "TACKY TAPE", stage: "Sealed", supplier: "Easy Composites" },
];

export const APPLY_FIXTURES = `
(() => {
  const U = ${JSON.stringify(USERS)};
  window.onFbData("users", U);
  /* Recent updatedAt/updatedBy stamps on a handful of tickets so the
     dashboard's activity feed photographs alive; hours-ago, so they read as
     today whatever day the suites run. */
  const PR = ${JSON.stringify(PROJECTS)};
  PR.slice(0, 5).forEach((p, i) => {
    p.updatedAt = new Date(Date.now() - (i + 1) * 5400000).toISOString();
    p.updatedBy = U[(i + 1) % U.length].email;
  });
  window.onFbData("projects", PR);
  window.onFbData("budget", ${JSON.stringify(BUDGET)});
  window.onFbData("notifications", ${JSON.stringify(NOTIFICATIONS)});
  window.onFbData("molds", ${JSON.stringify(MOLDS)});
  window.onFbData("items", ${JSON.stringify(ITEMS)});
  window.onFbData("lots", ${JSON.stringify(LOTS)});
  window.onFbData("rnd", ${JSON.stringify(RND)});
  /* Concatenated onto the SN5 archive, not replacing it. Parts and the
     dashboard want both seasons; only the Season tab and the tracker feed
     filter retro out, which is the whole point of these four. */
  window.onFbData("parts", (DB.parts || []).concat(${JSON.stringify(SEASON_PARTS)}, ${JSON.stringify(RND_PARTS)}));
  /* Season config for the dashboard countdown. Relative dates, so the module
     photographs alive on any day the suites run; the loader in core.js never
     overwrites a planted value with a missing doc. */
  const dd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  window.SEASON = { compName: "FSAE Michigan", compDate: dd(124), seasonStart: dd(-45),
    milestones: [{ label: "All molds cut", date: dd(38) }, { label: "Rolling chassis", date: dd(80) }] };
  /* Two LIVE work orders. The SN5 archive is all retro, so without these the
     dashboard's Blocked and Curing alerts and the Shop status rows are zero
     on every screenshot, and the "nothing empty above the fold" rule from
     the round-two design history has nothing to stand on. One is stopped at
     an unsigned blocker gate; one is mid-cure, started two hours ago. */
  window.onFbData("workOrders", (DB.workOrders || []).concat([
    { id: "WO-SN6-001", partName: "NOSECONE OUTER", subteam: "Aero", status: "InWork",
      moldEngineer: "Dana Chen", manufacturingEngineer: "Miles Okafor", dueDate: dd(6),
      steps: [
        { seq: 1, title: "Mold sealed and release verified", status: "open", buyoff: { name: "", date: "" }, rule: { kind: "blocker" } },
        { seq: 2, title: "Layup per stack plan", status: "open", buyoff: { name: "", date: "" } },
      ] },
    { id: "WO-SN6-002", partName: "UT DIFFUSER REBUILD", subteam: "Aero", status: "InWork",
      moldEngineer: "Priya Patel", manufacturingEngineer: "Dana Chen", dueDate: dd(4),
      steps: [
        { seq: 1, title: "Infuse", status: "done", buyoff: { name: "Dana Chen", date: dd(0) },
          rule: { kind: "startsHold" },
          cure: { resin: (typeof RESINS !== "undefined" && RESINS[0]) ? RESINS[0].id : "", startedAt: new Date(Date.now() - 2 * 3600000).toISOString() },
          /* Step photos, so the Photos section, the per-step thumb strip and
             the done-row fold all photograph populated. Inline SVGs — the
             suite runs offline. */
          photoRefs: [
            { id: "PFIX1", name: "bag-before-pull.jpg", filename: "bag-before-pull.jpg", by: "dana@feb.test", ts: new Date().toISOString(), caption: "bag before pull",
              url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23335'/%3E%3C/svg%3E" },
            { id: "PFIX2", name: "flow-front.jpg", filename: "flow-front.jpg", by: "dana@feb.test", ts: new Date().toISOString(), caption: "",
              url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23533'/%3E%3C/svg%3E" },
          ] },
        { seq: 2, title: "Cure and demould", status: "open", buyoff: { name: "", date: "" }, rule: { kind: "hold", from: "resin" } },
      ],
      files: [{ id: "FFIX1", name: "trimmed-part.jpg", type: "image/jpeg", by: "dana@feb.test", ts: new Date().toISOString(),
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='120'%3E%3Crect width='160' height='120' fill='%23353'/%3E%3C/svg%3E" }] },
    /* Two R&D runs, and they are different on purpose.

       WO-SN6-003 carries partId and NO rnd field of its own. That is the point:
       it must read as R&D anyway, because woIsRnd() asks its part. A fixture
       that set rnd:true here would pass whether inheritance worked or not.

       WO-SN6-004 has no part at all — a bar cut on the bench for a shrinkage
       test — so it carries its own flag. That is the standalone fallback, and
       it is the only path that exercises it.

       Both are ordinary live runs with real dates and real steps, because an
       R&D run ENFORCES: unlike a retro record it has real blockers and a real
       cure clock, and a fixture full of exempt records would quietly stop
       testing that. */
    { id: "WO-SN6-003", partName: "VG TRIAL PANEL", partId: "P-SN6-101", subteam: "AERO", status: "InWork",
      moldEngineer: "Ana Rivera", manufacturingEngineer: "Miles Okafor", dueDate: dd(9),
      steps: [
        { seq: 1, title: "Mold sealed and release verified", status: "open", buyoff: { name: "", date: "" }, rule: { kind: "blocker" } },
        { seq: 2, title: "Layup per stack plan", status: "open", buyoff: { name: "", date: "" } },
      ] },
    { id: "WO-SN6-004", partName: "RESIN SHRINKAGE TEST BAR", subteam: "BERGO", status: "Draft",
      moldEngineer: "Priya Patel", manufacturingEngineer: "", dueDate: dd(11), rnd: true,
      steps: [
        { seq: 1, title: "Cast bar", status: "open", buyoff: { name: "", date: "" } },
      ] },
  ]));
  /* One stack plan and a board that fits it, so the cut list and the
     mark-cut confirm photograph as transactions instead of empty states
     (no fixture carried a stackplan before). It hangs off MOLD-SN6-004
     because a plan with no mold is an ORPHAN, and an orphan has no stage to
     be "Designed" at, so the cut list holds it back. */
  window.onFbData("stackplans", (DB.stackplans || []).concat([
    { id: "STK-SN6-001", name: "NOSECONE PLUG", moldId: "MOLD-SN6-004", density: 30,
      layers: [
        { thickness: 50.8, blanks: [{ x0: 0, x1: 610, y0: 0, y1: 406 }] },
        { thickness: 50.8, blanks: [{ x0: 0, x1: 508, y0: 0, y1: 305 }] },
      ] },
  ]));
  window.onFbData("stock", (DB.stock || []).concat([
    { id: "BRD-SN6-901", label: "2IN 30LB SHEET", density: 30, qty: 2,
      len: { value: 48, unit: "in" }, wid: { value: 24, unit: "in" }, thk: { value: 2, unit: "in" },
      origin: "Fixture rack", location: "BIN-SN6-001" },
  ]));
  /* Pinned team shelf links, for the launchpad and the Documents shelf. */
  window.onFbData("documents", (DB.documents || []).concat([
    { id: "DOC-SN6-001", title: "SN6 master tracker", kind: "sheet", url: "https://docs.google.com/spreadsheets/d/fixture", pinned: true },
    { id: "DOC-SN6-002", title: "Monday meeting deck", kind: "slides", url: "https://docs.google.com/presentation/d/fixture", pinned: true },
  ]));
  /* Date the archive weeks. The SN5 seed ships every week with weekOf:"" —
     honest for retro data, useless for a screenshot, because an undated week
     can never be "this week" and half the tab's states never render. Walk them
     backwards from the Monday of the current week so one week IS current. */
  const sched = (DB.schedule || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  if (sched.length) {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // Monday of this week
    const cur = Math.min(sched.length - 1, Math.max(0, sched.length - 3));
    sched.forEach((w, i) => {
      const wd = new Date(d);
      wd.setDate(wd.getDate() + (i - cur) * 7);
      w.weekOf = wd.toISOString().slice(0, 10);
    });
    Object.assign(sched[cur], ${JSON.stringify(weekPlanPatch(""))}, { weekId: sched[cur].id });
    window.onFbData("schedule", sched);
  }
})();
`;
