#!/usr/bin/env node
/* Cut-list tests for 06 Composites App/app/packer.js.

   The property that matters here is GUILLOTINE FEASIBILITY: every cut must span
   the whole piece being held, because Simon confirmed "you can only cut all the
   way across". A plan that packs tightly but cannot be sawn is worthless, so
   the headline test replays the cut sequence and checks that no cut ever passes
   through a placed blank.

   Run from SN6 Resources/:  node tools/test_packer.mjs */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "06 Composites App", "app");
const src = readFileSync(join(root, "packer.js"), "utf8").replace(/"use strict";\n/, "");
globalThis.__P = {};
(0, eval)(src + "\n;Object.assign(globalThis.__P,{packBoard,packAll,cutSequence,utilisation,fitIn,boardCost,blanksFromLayers,moldCost,packFill,blankDensityRange,densityRollup,KERF_MM,MIN_REMNANT_MM,SHEET_REF_MM3,DIG_WORTH_BLANK});");
const P = globalThis.__P;

const IN = 25.4;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
const sheet = (w, h, extra) => ({ id: "B", len: w, wid: h, thk: IN, density: 30, qty: 1, ...extra });
const blank = (id, w, h) => ({ id, w, h, thickness: IN, density: 30 });

console.log("placement:");
t("blanks land inside the board and never overlap each other", () => {
  const parts = [];
  for (let i = 0; i < 12; i++) parts.push(blank("p" + i, 200 + (i % 4) * 60, 150 + (i % 3) * 70));
  const r = P.packBoard({ w: 8 * 12 * IN, h: 4 * 12 * IN }, parts, {});
  assert(r.placed.length > 0, "should place something");
  for (const a of r.placed) {
    assert(a.x >= -1e-6 && a.y >= -1e-6 && a.x + a.w <= 8 * 12 * IN + 1e-6 && a.y + a.h <= 4 * 12 * IN + 1e-6,
      `${a.part.id} falls off the board`);
  }
  for (let i = 0; i < r.placed.length; i++) {
    for (let j = i + 1; j < r.placed.length; j++) {
      const a = r.placed[i], b = r.placed[j];
      const sep = a.x + a.w <= b.x + 1e-6 || b.x + b.w <= a.x + 1e-6 || a.y + a.h <= b.y + 1e-6 || b.y + b.h <= a.y + 1e-6;
      assert(sep, `${a.part.id} and ${b.part.id} overlap`);
    }
  }
});
t("kerf is real — two blanks are never closer than the blade", () => {
  const r = P.packBoard({ w: 1000, h: 1000 }, [blank("a", 400, 400), blank("b", 400, 400)], {});
  assert(r.placed.length === 2, "both should fit");
  const [a, b] = r.placed;
  const gapX = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const gapY = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  assert(Math.max(gapX, gapY) >= P.KERF_MM - 1e-6, "the blade eats material and the plan must allow for it");
});
t("a blank larger than the board is reported, not silently dropped", () => {
  const r = P.packBoard({ w: 500, h: 500 }, [blank("huge", 900, 300)], {});
  assert(r.placed.length === 0 && r.unplaced.length === 1, "it cannot fit and we must say so");
});
t("a blank is turned 90 degrees when that is what fits (board has no grain)", () => {
  const r = P.packBoard({ w: 1000, h: 300 }, [blank("wide", 250, 900)], {});
  assert(r.placed.length === 1 && r.placed[0].rotated, "should rotate to fit");
});

console.log("guillotine feasibility — the property that matters:");
t("CRITICAL replaying the cut sequence never saws through a placed blank", () => {
  // Every cut must span the piece in hand. Simulate: start with the whole
  // board as one piece; apply each cut to the piece that contains it; a cut is
  // only legal if it spans that piece edge to edge and misses every blank.
  const parts = [];
  for (let i = 0; i < 14; i++) parts.push(blank("p" + i, 150 + (i * 37) % 300, 120 + (i * 53) % 260));
  const board = { w: 8 * 12 * IN, h: 4 * 12 * IN };
  const r = P.packBoard(board, parts, {});
  let pieces = [{ x: 0, y: 0, w: board.w, h: board.h }];
  for (const c of r.cuts) {
    const hit = pieces.findIndex(p =>
      c.axis === "x"
        ? (c.at > p.x + 1e-6 && c.at < p.x + p.w - 1e-6 && c.from >= p.y - 1e-6 && c.to <= p.y + p.h + 1e-6)
        : (c.at > p.y + 1e-6 && c.at < p.y + p.h - 1e-6 && c.from >= p.x - 1e-6 && c.to <= p.x + p.w + 1e-6));
    assert(hit >= 0, `cut ${c.axis}@${c.at.toFixed(1)} does not lie on any piece in hand`);
    const p = pieces[hit];
    // The cut must run edge to edge across that piece — no notching.
    if (c.axis === "x") assert(c.from <= p.y + 1e-6 && c.to >= p.y + p.h - 1e-6, "a rip must cross the whole piece");
    else assert(c.from <= p.x + 1e-6 && c.to >= p.x + p.w - 1e-6, "a crosscut must cross the whole piece");
    // And it must not pass through a blank.
    for (const a of r.placed) {
      if (c.axis === "x") {
        const through = c.at > a.x + 1e-6 && c.at < a.x + a.w - 1e-6 && !(c.to <= a.y + 1e-6 || c.from >= a.y + a.h - 1e-6);
        assert(!through, `cut x@${c.at.toFixed(1)} saws through ${a.part.id}`);
      } else {
        const through = c.at > a.y + 1e-6 && c.at < a.y + a.h - 1e-6 && !(c.to <= a.x + 1e-6 || c.from >= a.x + a.w - 1e-6);
        assert(!through, `cut y@${c.at.toFixed(1)} saws through ${a.part.id}`);
      }
    }
    // The blade destroys KERF_MM of material, so the two pieces that come off
    // the saw are separated by the kerf, not adjacent. Modelling them as
    // touching makes every downstream piece boundary drift and the spans stop
    // matching — the simulation has to cut like a saw, not like scissors.
    pieces.splice(hit, 1);
    const K = P.KERF_MM;
    if (c.axis === "x") {
      pieces.push({ x: p.x, y: p.y, w: c.at - p.x, h: p.h });
      pieces.push({ x: c.at + K, y: p.y, w: p.x + p.w - c.at - K, h: p.h });
    } else {
      pieces.push({ x: p.x, y: p.y, w: p.w, h: c.at - p.y });
      pieces.push({ x: p.x, y: c.at + K, w: p.w, h: p.y + p.h - c.at - K });
    }
  }
  assert(r.cuts.length > 0, "a real pack should require cuts");
});

console.log("cuts:");
t("no blank ever costs more than two cuts", () => {
  // Structural: a placement makes at most one cut per axis. Asserted anyway,
  // because a rewrite that starts re-cutting a rectangle would still pass every
  // feasibility test above while quietly doubling the work at the saw.
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push(blank("p" + i, 180 + (i % 5) * 90, 140 + (i % 4) * 60));
  const r = P.packBoard({ w: 8 * 12 * IN, h: 4 * 12 * IN }, parts, {});
  assert(r.cuts.length <= 2 * r.placed.length,
    `${r.cuts.length} cuts for ${r.placed.length} blanks`);
});
t("every cut lands on an eighth-inch mark when the blanks are half-inch multiples", () => {
  /* The payoff from quantising blanks in slicer.js. KERF_MM is exactly 1/8in
     and BLANK_QUANTUM_MM is 1/2in, so positions — which are sums of blank
     widths and kerfs measured from the edge of the piece in hand — can only
     ever be eighth-inch multiples. Every number on the printed sheet is
     findable on a tape. Break either constant and this test says so. */
  const half = 12.7;
  const parts = [[24, 12], [16, 10], [20, 14], [8, 8], [30, 6]]
    .map(([w, h], i) => blank("h" + i, w * half, h * half));
  const r = P.packBoard({ w: 96 * IN, h: 48 * IN }, parts, {});
  assert(r.placed.length === parts.length, "all should fit on a 4x8");
  for (const c of r.cuts) {
    assert(Math.abs(c.at / P.KERF_MM - Math.round(c.at / P.KERF_MM)) < 1e-6,
      `cut at ${c.at.toFixed(4)}mm is not an eighth-inch multiple`);
  }
});
t("the split order is chosen, not fixed", () => {
  /* Four blanks that tile a 1220 square two-by-two. The old rule always split
     to keep the bigger single offcut, which here costs a cut it does not need;
     trying both orders finds the tiling. Same blanks placed either way — the
     whole difference is at the saw. */
  const parts = [0, 1, 2, 3].map(i => blank("q" + i, 600, 400));
  const r = P.packBoard({ w: 1220, h: 1220 }, parts, {});
  assert(r.placed.length === 4, "all four should fit");
  assert(r.cuts.length <= 6, "a tiling board should not need 8 cuts, got " + r.cuts.length);
});
t("the same board and the same blanks give the same plan twice", () => {
  const parts = [0, 1, 2, 3, 4].map(i => blank("d" + i, 300 + i * 40, 200 + (i % 3) * 55));
  const key = r => JSON.stringify([r.placed.map(p => [p.part.id, p.x, p.y, p.rotated]), r.cuts]);
  assert(key(P.packBoard({ w: 1500, h: 1000 }, parts, {})) === key(P.packBoard({ w: 1500, h: 1000 }, parts, {})),
    "ties must resolve the same way every run, or a printed cut list stops matching the screen");
});

console.log("stock policy:");
/* There is no sheet-vs-offcut category any more. Simon: "offcuts and large
   boards are essentially the same to us, just at different sizes, larger boards
   just tend to be more valuable as we can cut the large things first." So these
   are all size arguments. */
t("a small blank does not open a big sheet while a board that fits it well is on the rack", () => {
  const boards = [sheet(8 * 12 * IN, 4 * 12 * IN, { id: "SHEET" }), sheet(600, 400, { id: "SMALL" })];
  const r = P.packAll([blank("small", 300, 200)], boards, {});
  assert(r.plans.length === 1, "one board should do it");
  assert(r.plans[0].board.src.id === "SMALL", "burning a big board on a small blank destroys the only thing that can hold a big one");
});
t("but the only board big enough is opened, however big it is", () => {
  // Option value must never turn into a refusal to cut.
  const boards = [sheet(600, 400, { id: "SMALL" }), sheet(2438, 1219, { id: "SHEET" })];
  const r = P.packAll([blank("long", 1500, 900)], boards, {});
  assert(r.shortfall.length === 0, "it fits somewhere, so it must be planned");
  assert(r.plans[0].board.src.id === "SHEET", "only the sheet can hold it");
});
t("a second board is not opened when one board holds everything", () => {
  /* The old smallest-first rule opened the snug board for one blank, then
     reached for the roomy one anyway for the other two — two boards and an
     extra cut, and the snug board gone off the rack for nothing. */
  const boards = [sheet(1100, 300, { id: "SNUG" }), sheet(1000, 1000, { id: "ROOMY" })];
  const r = P.packAll([0, 1, 2].map(i => blank("s" + i, 900, 250)), boards, {});
  assert(r.shortfall.length === 0, "all three fit");
  assert(r.plans.length === 1 && r.plans[0].board.src.id === "ROOMY",
    "one board should do all three, got " + r.plans.map(p => p.board.src.id).join("+"));
});
t("a board that places nothing costs infinity", () => {
  // So it can never be chosen, and the caller falls through to shortfall
  // rather than opening a board and getting nothing off it.
  const bd = { w: 1100, h: 300 };
  assert(P.boardCost(bd, P.packBoard(bd, [blank("x", 5000, 5000)], {})) === Infinity,
    "nothing placed means no cost per blank to speak of");
  assert(Number.isFinite(P.boardCost(bd, P.packBoard(bd, [blank("a", 900, 250)], {}))),
    "and a real pack has a real cost");
});
t("leftovers say which board they came off", () => {
  // One line, so whatever eventually writes offcuts back into inventory knows
  // the parent board. Nothing consumes it yet.
  const r = P.packAll([blank("a", 300, 200)], [sheet(1000, 800, { id: "PARENT" })], {});
  assert(r.plans[0].leftover.length > 0, "a 1000x800 board minus a 300x200 blank leaves usable board");
  assert(r.plans[0].leftover.every(o => o.boardId === "PARENT"), "every leftover names its parent");
});
t("a blank declaring one grade is never given another", () => {
  /* CS-004 now attaches to the RANGE a mold declares, not to a hard-wired
     bucket. A blank that names one grade has declared min == max, so this is
     still the old rule and still the default. */
  const boards = [
    { id: "thin", len: 2000, wid: 1000, thk: IN, density: 30, qty: 1 },
    { id: "thick", len: 2000, wid: 1000, thk: 2 * IN, density: 30, qty: 1 },
    { id: "dense", len: 2000, wid: 1000, thk: 2 * IN, density: 60, qty: 1 },
  ];
  const want = [{ id: "a", w: 300, h: 200, thickness: 2 * IN, density: 60 }];
  const r = P.packAll(want, boards, {});
  assert(r.plans.length === 1 && r.plans[0].board.src.id === "dense",
    "60lb board is not interchangeable with 30lb unless somebody said so");
});
t("running short produces a purchase list, not a crash", () => {
  const boards = [sheet(600, 400)];
  const want = [blank("a", 500, 300), blank("b", 500, 300), blank("c", 500, 300)];
  const r = P.packAll(want, boards, {});
  assert(r.shortfall.length >= 1, "what did not fit must be reported");
  assert(r.plans.length === 1, "and what did fit should still be planned");
});
t("leftovers below the minimum useful remnant are scrap, not ledger entries", () => {
  const r = P.packBoard({ w: 1000, h: 1000 }, [blank("a", 960, 960)], {});
  assert(r.leftover.every(o => o.w >= P.MIN_REMNANT_MM && o.h >= P.MIN_REMNANT_MM),
    "a 20mm sliver is not an offcut anybody will retrieve");
});

t("scrap is handed over rather than dropped, and leftover means exactly what it did", () => {
  /* The review pane lets a human promote a sliver by hand, so the pieces have
     to survive the packer. They must NOT join `leftover`: that is what
     betterSplit and boardCost score recovered value against, and moving the
     line would change which boards get opened for every mold in the batch. */
  const board = { w: 1000, h: 1000 };
  const parts = [blank("a", 960, 960)];
  const r = P.packBoard(board, parts, {});
  assert(Array.isArray(r.scrap) && r.scrap.length, "the slivers came back: " + JSON.stringify(r.scrap));
  assert(r.scrap.every(o => o.w < P.MIN_REMNANT_MM || o.h < P.MIN_REMNANT_MM),
    "and every one of them is genuinely under the bar");

  /* Partition, not two filters: nothing is in both lists and nothing was lost
     between them. packFill is the unfiltered truth. */
  const raw = P.packFill(0, 0, board.w, board.h, 0, parts.slice(), P.KERF_MM, true).leftover;
  const key = o => `${o.x},${o.y},${o.w},${o.h}`;
  const got = r.leftover.concat(r.scrap).map(key).sort();
  assert(got.join("|") === raw.map(key).sort().join("|"),
    "every remnant is in exactly one list: " + got.join("|") + " vs " + raw.map(key).sort().join("|"));
});

console.log("density ranges:");
/* A rack holding the same size in three grades. Nothing here varies but density,
   so any difference in what gets opened is the range doing its job. */
const graded = () => [
  { id: "d30", len: 700, wid: 400, thk: IN, density: 30, qty: 1 },
  { id: "d45", len: 700, wid: 400, thk: IN, density: 45, qty: 1 },
  { id: "d60", len: 700, wid: 400, thk: IN, density: 60, qty: 1 },
];
const ranged = (id, lo, hi) => ({ id, w: 650, h: 350, thickness: IN, density: lo, densityMin: lo, densityMax: hi });
/* Everything that decides whether two plans are the same plan. Board identity,
   placements, cuts, leftovers and the order they came in — not object identity,
   which would always differ, and not cost alone, which can collide. */
const shape = (r) => JSON.stringify({
  plans: r.plans.map(p => ({ id: p.board.src.id, thk: p.thickness, d: p.density,
    placed: p.placed.map(x => [x.part.id, x.x, x.y, x.w, x.h, x.rotated]),
    cuts: p.cuts, leftover: p.leftover })),
  shortfall: r.shortfall.map(s => s.id), used: r.boardsUsed, degraded: r.degraded,
});

t("CRITICAL scrap never buys a better nest", () => {
  /* If scrap reached the scoring, a board that shatters into slivers would
     start looking as good as one that leaves a usable remnant, and the rack
     would quietly be spent worst-first. shape() is what decides two plans are
     the same plan, and it reads `leftover` — so this asserts the packer's
     answer does not move when the slivers become visible. */
  const boards = [
    { id: "clean", len: 700, wid: 400, thk: IN, density: 30, qty: 1 },
    { id: "shatters", len: 760, wid: 460, thk: IN, density: 30, qty: 1 },
  ];
  const parts = [blank("p", 600, 300)];
  const r = P.packAll(parts, boards, {});
  assert(r.plans.length === 1, "one board opened: " + r.plans.length);
  const pl = r.plans[0];
  assert(pl.leftover.every(o => o.w >= P.MIN_REMNANT_MM && o.h >= P.MIN_REMNANT_MM),
    "the scored remnants are still only the useful ones");
  assert((pl.scrap || []).every(o => o.boardId === pl.board.src.id),
    "and scrap carries its board, same as leftover, so the pane can say where it came from");
  assert(!JSON.stringify(shape(r)).includes("scrap"),
    "scrap is not part of what makes two plans the same plan");
});

t("CRITICAL min == max plans exactly what a bare density planned before ranges existed", () => {
  /* The no-regression guarantee, asserted rather than asserted about. If this
     fails, every record written before ranges existed just changed meaning. */
  const boards = graded();
  const bare = [{ id: "a", w: 650, h: 350, thickness: IN, density: 45 },
                { id: "b", w: 300, h: 200, thickness: IN, density: 45 }];
  const spelt = bare.map(b => ({ ...b, densityMin: 45, densityMax: 45 }));
  assert(shape(P.packAll(bare, boards, {})) === shape(P.packAll(spelt, graded(), {})),
    "spelling out min == max must change nothing at all");
});
t("a blank declaring a range takes any grade inside it", () => {
  const r = P.packAll([ranged("w1", 30, 45), ranged("w2", 30, 45)], graded(), {});
  assert(r.shortfall.length === 0, "two boards inside the range can hold two blanks");
  const opened = r.plans.map(p => p.density).sort((a, b) => a - b);
  assert(opened.join() === "30,45", "opened " + opened.join() + ", expected the 30 and the 45");
});
t("a blank declaring a range still refuses a grade outside it", () => {
  const r = P.packAll([ranged("x", 30, 45)], [graded()[2]], {});
  assert(r.boardsUsed === 0 && r.shortfall.length === 1,
    "a 60lb rack cannot supply a 30–45 mold — that is a purchase, not a substitution");
});
t("one layer may be glued from two grades inside the range", () => {
  /* Simon asked for this explicitly: inside a declared range, boards mix freely,
     including two blanks of the same layer coming off different grades. Stated
     as a test, because otherwise the feature is only the absence of a check. */
  const r = P.packAll([ranged("L1a", 30, 60), ranged("L1b", 30, 60)], graded(), {});
  assert(r.plans.length === 2, "two blanks that do not share a board");
  assert(r.plans[0].density !== r.plans[1].density, "and they came off different grades");
});
t("the pack says which grades it opened, and which is the highest", () => {
  // The highest is the one that matters: it sets the CNC feed for the whole stack.
  const r = P.packAll([ranged("a", 30, 60), ranged("b", 30, 60), ranged("c", 30, 60)], graded(), {});
  assert(r.densitiesUsed.join() === "30,45,60", "got " + r.densitiesUsed.join());
  assert(r.maxDensity === 60, "the densest board opened sets the feed rate");
  const roll = P.densityRollup(r.plans, p => p.id === "a" ? "MOLD" : null);
  assert(roll.by.MOLD && roll.by.MOLD.max === roll.by.MOLD.used[roll.by.MOLD.used.length - 1],
    "the per-mold breakdown reports its own max");
});
t("a mixed-grade range is deterministic, whatever order the rack arrives in", () => {
  const want = () => [ranged("a", 30, 60), ranged("b", 30, 60), ranged("c", 30, 60)];
  const once = shape(P.packAll(want(), graded(), {}));
  assert(once === shape(P.packAll(want(), graded(), {})), "two runs of the same pack must agree");
  assert(once === shape(P.packAll(want(), graded().reverse(), {})),
    "the pool sort carries determinism, not the caller's array order");
});
t("a blank with no density at all still means 30", () => {
  const [lo, hi] = P.blankDensityRange({});
  assert(lo === 30 && hi === 30, "the documented default, unchanged");
  const [a, b] = P.blankDensityRange({ densityMin: 45, densityMax: 30 });
  assert(a === 30 && b === 45, "a backwards range is read the only way it can mean anything");
});

console.log("the board on top of the pile:");
/* `index` is a board's rank within its own storage location — 0 is the top.
   boardsForPacking() in stock.js computes it; the packer only spends it. */
const twin = (id, index) => ({ id, len: 700, wid: 400, thk: IN, density: 30, qty: 1, index });

t("among equally good nests, the board on top of the pile wins", () => {
  const r = P.packAll([blank("t", 650, 350)], [twin("DEEP", 3), twin("TOP", 0)], {});
  assert(r.plans[0].board.src.id === "TOP", "opened " + r.plans[0].board.src.id);
  assert(r.plans[0].digCost === 0, "and the board on top is charged nothing to lift");
});
t("two identical sizes at different grades are both scored, and the top one wins", () => {
  /* The case the density range creates: same size, same cost, different grade.
     Before this, the size dedupe would have kept whichever arrived first. */
  const rack = [{ id: "d60deep", len: 700, wid: 400, thk: IN, density: 60, qty: 1, index: 4 },
                { id: "d30top", len: 700, wid: 400, thk: IN, density: 30, qty: 1, index: 0 }];
  const r = P.packAll([ranged("a", 30, 60)], rack, {});
  assert(r.plans[0].board.src.id === "d30top", "opened " + r.plans[0].board.src.id);
});
t("the size dedupe keeps the lowest-index board, not the first one seen", () => {
  const rack = [twin("z", 2), twin("y", 0), twin("x", 1)];
  const r = P.packAll([blank("t", 650, 350)], rack, {});
  assert(r.plans[0].board.src.id === "y", "opened " + r.plans[0].board.src.id + ", expected the index-0 board");
  assert(shape(r) === shape(P.packAll([blank("t", 650, 350)], [twin("z", 2), twin("y", 0), twin("x", 1)], {})),
    "and it agrees with itself on a second run");
});
t("CRITICAL the lift charge never buys a worse nest", () => {
  /* Calibration, pinned. On the real rack the gap between two genuine board
     choices for one 300x200 blank is 0.648 cost units, and DIG_WORTH_BLANK is
     0.05 — so the good nest has to be about thirteen boards down before the
     preference can override it. No stack in the RFS container is that deep.
     If somebody changes the constant without meaning to, this says so. */
  const pair = (i) => [{ id: "SMALL", len: 22 * IN, wid: 14 * IN, thk: IN, density: 30, qty: 1, index: i },
                       { id: "BIG", len: 33 * IN, wid: 19 * IN, thk: IN, density: 30, qty: 1, index: 0 }];
  const opens = (i) => P.packAll([blank("b", 300, 200)], pair(i), {}).plans[0].board.src.id;
  assert(opens(0) === "SMALL", "the tight nest wins when nothing is stacked on it");
  assert(opens(10) === "SMALL", "and still wins ten boards down — nesting first");
  assert(opens(20) === "BIG", "but a twenty-deep dig is genuinely not worth it");
  assert(P.DIG_WORTH_BLANK === 0.05, "the calibration above is written for 0.05");
});
t("a rack with no locations recorded prices no lifts at all", () => {
  /* Every board on an unfiled rack is index 0 by definition — you cannot be
     buried in a pile nobody has written down. This is what keeps the SN5
     regression below pinned exactly where it was. */
  const rack = [sheet(1000, 800, { id: "A" }), { id: "B", len: 600, wid: 400, thk: IN, density: 30, qty: 1 }];
  const want = [blank("a", 300, 200)];
  assert(shape(P.packAll(want, rack, {})) === shape(P.packAll(want, rack, { digWorthBlank: 0 })),
    "with no index anywhere, the lift term is not merely small — it is absent");
});

console.log("the real rack:");
t("a batch across the SN5 rack does not regress", () => {
  /* Two molds' worth of blanks against sn5-stock.json. The numbers are what the
     smallest-first packer produced on 2026-08-05, measured and pinned here so a
     later rewrite has to beat them rather than quietly give some of it back.
     Cut count is the number to watch; utilisation is NOT, because a big board's
     remainder comes back to the rack as smaller boards and utilisation counts
     that as loss. */
  const stock = JSON.parse(readFileSync(join(root, "sn5-stock.json"), "utf8"));
  const mm = d => d.unit === "mm" ? d.value : d.value * IN;
  const boards = stock.map(b => ({
    id: b.id, len: mm(b.len), wid: mm(b.wid), thk: mm(b.thk),
    density: b.density, qty: b.qty,
  }));
  const spec = [["NOSE L1", 560, 340, 2], ["NOSE L2", 520, 320, 2], ["NOSE L3", 470, 300, 2],
    ["DIFF L1", 900, 420, 1.5], ["DIFF L2", 860, 400, 1.5], ["DIFF L3", 800, 380, 1.5],
    ["DIFF L4", 700, 340, 1.5], ["SIDE L1", 300, 200, 2], ["SIDE L2", 280, 180, 2]];
  const r = P.packAll(spec.map(([id, w, h, t]) => ({ id, w, h, thickness: t * IN, density: 30 })), boards, {});
  const cuts = r.plans.reduce((n, p) => n + p.cuts.length, 0);
  assert(r.shortfall.length === 0, "this rack holds all of it; a shortfall means something broke");
  assert(r.boardsUsed <= 4, "opened " + r.boardsUsed + " boards, the old packer opened 4");
  assert(cuts <= 18, cuts + " cuts, the old packer needed 18");
  assert(!r.degraded, "a nine-blank batch is nowhere near the trial budget");
});

console.log("what a whole stack costs:");
const layer = (thk, ...boxes) => ({ thickness: thk, blanks: boxes.map(([w, h]) => ({ x0: 0, y0: 0, x1: w, y1: h })) });
t("blanks come off a sliced stack with cut-list names", () => {
  const b = P.blanksFromLayers([layer(IN, [300, 200]), layer(IN, [300, 200], [100, 100])], 30);
  assert(b.length === 3, "three blanks over two layers");
  assert(b[0].id === "L1", "a lone blank on a layer needs no letter");
  assert(b[1].id === "L2a" && b[2].id === "L2b", "two on a layer are a and b, matching drawings.js");
  assert(b.every(x => x.density === 30 && x.thickness === IN), "thickness and density ride along");
});
t("an extra glue joint has to pay for itself", () => {
  // Thin boards always win on VOLUME alone — each layer's blank only has to
  // cover its own slab — so without a joint charge the planner hands the shop
  // eight glue-ups and a 4h clamp each (CS-003 §7.3).
  const boards = [{ id: "S", len: 8 * 12 * IN, wid: 4 * 12 * IN, thk: IN, density: 30, qty: 12 }];
  const thin = [1, 2, 3, 4].map(() => layer(IN, [400, 300]));
  const thick = [1, 2].map(() => layer(IN, [400, 300]));
  const a = P.moldCost(thin, boards, { density: 30 });
  const b = P.moldCost(thick, boards, { density: 30 });
  assert(a.joints === 3 && b.joints === 1, "joints are layers minus one");
  assert(b.cost < a.cost, "fewer, thicker layers should win once joints are priced");
});
t("CRITICAL a stack that cannot be cut is not free", () => {
  /* packAll opens zero boards when nothing fits, so without charging for the
     shortfall an unbuildable stack scores as costing nothing and wins every
     time. This is the assertion that stops the planner recommending board
     nobody owns. */
  const boards = [{ id: "S", len: 600, wid: 400, thk: IN, density: 30, qty: 1 }];
  const fits = P.moldCost([layer(IN, [300, 200])], boards, { density: 30 });
  const cannot = P.moldCost([layer(IN, [3000, 2000])], boards, { density: 30 });
  assert(cannot.mustBuySheets >= 1, "what did not fit has to be bought");
  assert(cannot.shortfall.length === 1, "and is named, so the warning can say what to order");
  assert(cannot.cost > fits.cost, "an unbuildable stack must never be the cheap option");
});
t("an empty rack still scores, and says it was guessing", () => {
  // Every season starts with no board entered. Planning must still work.
  const r = P.moldCost([layer(IN, [400, 300]), layer(IN, [400, 300])], [], { density: 30 });
  assert(r.usedRack === false, "it must admit the rack was not consulted");
  assert(r.cost > 0 && Number.isFinite(r.cost), "and still return a usable number");
});

console.log("output:");
t("the cut sequence reads as instructions in both units", () => {
  const r = P.packBoard({ w: 2000, h: 1000 }, [blank("a", 800, 400), blank("b", 600, 300)], {});
  const seq = P.cutSequence(r);
  assert(seq.length === r.cuts.length, "one line per cut");
  assert(/Rip|Crosscut/.test(seq[0].text), "should say what kind of cut");
  assert(/mm.*in/.test(seq[0].text), "shop reads inches, geometry is mm — show both");
});
t("utilisation is reported so the plan can be judged", () => {
  const r = P.packAll([blank("a", 900, 500)], [sheet(1000, 600)], {});
  const u = P.utilisation(r.plans);
  assert(u > 0.6 && u <= 1, "one big blank on a snug board should be well used, got " + u.toFixed(2));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
