"use strict";
/* packer.js — turn a pile of blanks into a cut list for the saw. PURE, like
   slicer.js: no DOM, no Firebase, so it runs in the Worker and under node.

   ============================================================================
   THE CONSTRAINT: you can only cut all the way across
   ============================================================================
   Simon, confirming it as a hard rule and not a preference: "You can only cut
   all the way across." That is the guillotine constraint. Every cut splits the
   piece you are holding, edge to edge, into two smaller pieces. You can never
   cut a notch.

   So a board is a BINARY TREE of cuts, and that is exactly how it is modelled
   here — not as a list of (x, y) placements with the cuts reverse-engineered
   afterwards, which is how you end up printing a plan the saw cannot make.

       +-------------------------+          cut 1 (rip, full width)
       |            |            |          -> two pieces
       |     A      |            |
       |            |     cut 2  |          cut 2 crosscuts the RIGHT piece
       |------------|------------|             only — it spans that piece,
       |     B      |     C      |             not the original board
       +-------------------------+

   A pre-order walk of the tree is the order to make the cuts, and every cut in
   it spans whatever is in your hands at that moment. That property is
   structural, not checked afterwards.

   ============================================================================
   POLICY: open the board that costs least, counting what it costs you later
   ============================================================================
   There is no sheet-vs-offcut category here. Simon: "offcuts and large boards
   are essentially the same to us, just at different sizes, larger boards just
   tend to be more valuable as we can cut the large things first." So every
   board is just a size, and the reason to reach for the small one is OPTION
   VALUE — a big board is the only thing that can hold a big blank. See
   boardCost() below for the whole rule; it needs no tuning constants.

   Pieces are kept down to about 4 x 10 inches (MIN_REMNANT_MM), so a leftover
   above that is credited back rather than counted as loss. Anything under it
   comes back on `scrap` instead of `leftover`: worth nothing to the packer's
   arithmetic, worth showing to the person at the saw. */

const KERF_MM = 3.175;          // 1/8in saw blade
const MIN_REMNANT_MM = 101.6;   // 4in — Simon: "we have had small like 4 x 10 inch pieces"
/* How deep to try BOTH ways of splitting a rectangle instead of guessing.
   Depth climbs by 2 per level, so 4 means the top three levels branch: at most
   8 subtree evaluations, on a routine that is O(n^2) to begin with. Near the
   root the rectangles are big and the choice actually matters; deeper down it
   is a small subtree and the guess is fine. */
const SPLIT_TRIAL_DEPTH = 4;

/* One blank to cut. { id, w, h, thickness, density, label } — w/h already
   include the glue margin, straight from the slicer. */
function partArea(p) { return p.w * p.h; }

/* Can `part` sit in a free rect of w x h, and if so at what orientation?
   PU tooling board has no grain, so a blank may be turned 90 degrees. */
function fitIn(part, w, h, allowRotate) {
  if (part.w <= w + 1e-9 && part.h <= h + 1e-9) return { w: part.w, h: part.h, rotated: false };
  if (allowRotate !== false && part.h <= w + 1e-9 && part.w <= h + 1e-9) return { w: part.h, h: part.w, rotated: true };
  return null;
}

/* Fill one free rectangle, guillotine-only.

   Recursive: take the largest part that fits, put it in the corner, then make
   ONE cut that separates it from the rest and recurse into both children.
   Because every cut is taken across the current rectangle, the result is
   guillotine-feasible by construction.

   PURE. Nothing here mutates a caller's array — `remaining` goes in, a smaller
   `remaining` comes out, and placements and cuts come back as fresh arrays.
   That is what lets a caller evaluate two different splits of the same
   rectangle and keep the better one; against shared closure state the first
   trial would poison the second. */
function packFill(x, y, w, h, depth, remaining, kerf, rotate) {
  const nothing = { placed: [], cuts: [], leftover: [{ x, y, w, h }], remaining };
  if (w <= 0 || h <= 0 || !remaining.length) return nothing;
  // Largest part that fits here.
  let idx = -1, fit = null;
  for (let i = 0; i < remaining.length; i++) {
    const f = fitIn(remaining[i], w, h, rotate);
    if (f) { idx = i; fit = f; break; }
  }
  if (idx < 0) return nothing;
  const part = remaining[idx];
  const rest = remaining.slice(0, idx).concat(remaining.slice(idx + 1));
  const here = { part, x, y, w: fit.w, h: fit.h, rotated: fit.rotated };

  const restW = w - fit.w - kerf;
  const restH = h - fit.h - kerf;
  /* Two ways to split what is left. The old rule always kept the bigger single
     offcut whole, which is a decent guess and only ever a guess — it is made
     before knowing what still has to be placed. Near the root, where the
     rectangles are big and the decision is worth the most, try both and keep
     the better result. Deeper down the guess stands, because the subtree is
     small and the branching is not free. */
  const wideFirst = Math.max(restW * h, w * restH) === restW * h;
  let sub = packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, wideFirst);
  if (depth <= SPLIT_TRIAL_DEPTH) {
    const alt = packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, !wideFirst);
    if (betterSplit(alt, sub)) sub = alt;
  }
  return {
    placed: [here].concat(sub.placed),
    cuts: sub.cuts,
    leftover: sub.leftover,
    remaining: sub.remaining,
  };
}

/* Split the rectangle one specific way and fill both children.
   `horizontalFirst` is the choice; everything else follows from it. */
function packSplit(x, y, w, h, depth, rest, kerf, rotate, fit, horizontalFirst) {
  /* Record the cuts. The span of the SECOND cut depends on whether the first
     one actually happened: if the leftover was thinner than the blade there
     is nothing to separate, no cut is made, and the piece still in hand is
     the full rectangle — so the second cut has to cross all of it, not just
     the part. Getting this wrong prints a cut that stops halfway, which is
     a notch, which a saw cannot do. */
  const restW = w - fit.w - kerf;
  const restH = h - fit.h - kerf;
  const cuts = [];
  let a, b;
  if (horizontalFirst) {
    const cutA = restW > 0;
    if (cutA) cuts.push({ axis: "x", at: x + fit.w, from: y, to: y + h, depth });
    a = { x: x + fit.w + kerf, y, w: restW, h };
    // Whatever is still in hand after cut A: fit.w wide if it happened, else w.
    const heldW = cutA ? fit.w : w;
    if (restH > 0) cuts.push({ axis: "y", at: y + fit.h, from: x, to: x + heldW, depth: depth + 1 });
    b = { x, y: y + fit.h + kerf, w: heldW, h: restH };
  } else {
    const cutA = restH > 0;
    if (cutA) cuts.push({ axis: "y", at: y + fit.h, from: x, to: x + w, depth });
    a = { x, y: y + fit.h + kerf, w, h: restH };
    const heldH = cutA ? fit.h : h;
    if (restW > 0) cuts.push({ axis: "x", at: x + fit.w, from: y, to: y + heldH, depth: depth + 1 });
    b = { x: x + fit.w + kerf, y, w: restW, h: heldH };
  }
  /* Order matters and is load-bearing: this node's cuts, then A's subtree,
     then B's. A pre-order walk of the tree is the order to make the cuts, and
     B is filled from what A left, not from the original pile. */
  const ra = packFill(a.x, a.y, a.w, a.h, depth + 2, rest, kerf, rotate);
  const rb = packFill(b.x, b.y, b.w, b.h, depth + 2, ra.remaining, kerf, rotate);
  return {
    placed: ra.placed.concat(rb.placed),
    cuts: cuts.concat(ra.cuts, rb.cuts),
    leftover: ra.leftover.concat(rb.leftover),
    remaining: rb.remaining,
  };
}

/* Is subtree `a` better than subtree `b`? LEXICOGRAPHIC, not a weighted sum:
   a weighted sum would need exchange rates between blank area, saw cuts and
   offcut size, and there is no honest way to set those at this level. A strict
   order needs none, and it says what the shop would say out loud:

     1. get more blanks out of the board
     2. then make fewer cuts
     3. then leave one big usable offcut rather than several awkward ones

   Strictly-better only, so a tie keeps the incumbent and two runs of the same
   pack give the same answer. */
function betterSplit(a, b) {
  const area = r => r.placed.reduce((n, p) => n + p.w * p.h, 0);
  const biggest = r => r.leftover.reduce((n, o) =>
    (o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM) ? Math.max(n, o.w * o.h) : n, 0);
  const aa = area(a), ab = area(b);
  if (aa !== ab) return aa > ab;
  if (a.cuts.length !== b.cuts.length) return a.cuts.length < b.cuts.length;
  return biggest(a) > biggest(b);
}

/* Pack as many parts as possible into one board. */
function packBoard(board, parts, opts) {
  opts = opts || {};
  const kerf = opts.kerf == null ? KERF_MM : opts.kerf;
  const rotate = opts.allowRotate !== false;
  const sorted = parts.slice().sort((a, b) => (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (partArea(b) - partArea(a)));

  const r = packFill(0, 0, board.w, board.h, 0, sorted, kerf, rotate);
  /* PARTITIONED, not filtered. `leftover` keeps its meaning exactly — the
     remnants big enough to be worth a ledger entry, which is what betterSplit
     and boardCost score against and what the commit writes back as stock. What
     changed is that the discards are handed over too instead of being dropped
     on the floor here.

     They are needed because a human now reviews the offcuts before they are
     written, and a pane that silently omits pieces lies about what comes off
     the board. Whether a 3 x 20in strip is worth keeping is a judgement for
     the person holding it; MIN_REMNANT_MM stays the PACKER's answer to a
     different question, which is what to count as recovered value when
     choosing a split. */
  const usable = [], scrap = [];
  for (const o of r.leftover) (o.w >= MIN_REMNANT_MM && o.h >= MIN_REMNANT_MM ? usable : scrap).push(o);
  return { placed: r.placed, cuts: r.cuts, leftover: usable, scrap, unplaced: r.remaining };
}

/* ============================================================================
   WHICH BOARD TO OPEN
   ============================================================================
   The old rule was "smallest first, take anything that fits", on the theory
   that offcuts should be spent before sheets. It half-filled the rack: it would
   open a 33x19 offcut for one blank, mark it used, and never come back.

   Simon, on why a big board is worth more: "offcuts and large boards are
   essentially the same to us, just at different sizes, larger boards just tend
   to be more valuable as we can cut the large things first." So there is no
   sheet/offcut category to reason about, only size — and the reason to prefer
   the small board is OPTION VALUE. A big board is the only thing that can hold
   a big blank; spending one on small blanks destroys that.

   That used to be the whole cost function, with no tuning constants at all, and
   that was a property worth having. It now has exactly one — DIG_WORTH_BLANK,
   below — and the rule for keeping it honest is the one JOINT_WORTH_SHEETS
   follows: a unit somebody can argue with over a table, and a calibration
   against the real rack rather than a feel.

     consumedArea = boardArea - (usable leftover)   material actually spent
     optionLoss   = boardArea - (biggest leftover)  largest blank it could
                                                    still have held, destroyed
     digCost      = DIG_WORTH_BLANK * board.index   what it costs to lift the
                                                    boards stacked on top of it
     cost         = (consumedArea + optionLoss) / placedArea + digCost

   Everything is mm², so cost reads as "millimetres of board burned per
   millimetre of blank delivered". A 300x200 blank costs 7.3 on a 4x8 sheet and
   3.05 on a 600x400 board, so the small board wins — the old policy's INTENT,
   in pure size terms. And when only the 4x8 can hold a 1500x900 blank it is
   the only candidate that places anything, so option value never turns into a
   refusal to cut.

   Consumed area alone, without the option term, says opening a 4x8 for one
   blank is nearly free — true on paper, because guillotine cuts do leave two
   big usable rectangles, and false on the rack, where those offcuts are
   awkward and multiply.

   ============================================================================
   PREFER THE BOARD ON TOP OF THE PILE
   ============================================================================
   Simon: "It is more important to have good nesting of the molds and have
   little offcuts, but if possible have lower index number." A board's `index`
   is its rank within its OWN storage location — see boardsForPacking() in
   stock.js, which is the only place that can see the rack. Lower index means
   nearer the top, which means fewer boards to lift to get at it.

     DIG_WORTH_BLANK = 0.05 — digging one board deeper into its stack is worth
     5% of the blank you get off it.

   The cost above is already denominated in "board burned per blank delivered",
   so the term reads directly in that unit and needs no exchange rate.

   THE CALIBRATION IS A CEILING, NOT A TARGET. The question is not "how much do
   we like short lifts", it is "how big can this get before it buys a worse
   nest". On the real rack (sn5-stock.json), one 300 x 200 blank scores:

     BRD-SN5-007  22x14   2.832
     BRD-SN5-006  33x19   3.480     <- gap between two real choices: 0.648
     BRD-SN5-005  46x30   4.907
     BRD-SN5-001  96x48   7.241

   At 0.05 a board would have to be THIRTEEN rungs down before the preference
   could pull the 33x19 ahead of the 22x14. No stack in the RFS container is
   thirteen boards deep, so this cannot buy a worse nest.

   It is still large enough to do something. Two boards that nest a stack
   equally well score within about 0.002 of each other — noise, settled today by
   whichever id sorts first — and one rung flips that. It is also the ONLY
   tiebreak available now that a density RANGE can put a 30lb and a 60lb sheet
   of identical size in the same bucket at identical cost; "the one on top" is a
   better answer there than "the one whose id sorts first".

   The index is a proxy: it is derived from id order, so it reads "added
   earlier" as "further down the pile". That is right for a stack only ever
   added to from the top, and wrong the first time somebody restacks a shelf.
   The magnitude is chosen partly because the proxy is soft — it must never be
   strong enough to be worth being wrong about.

   Move it if somebody has spent a season lifting boards and disagrees. */
const DIG_WORTH_BLANK = 0.05;

function boardCost(board, r, digWorth) {
  const placedArea = r.placed.reduce((n, p) => n + p.w * p.h, 0);
  if (placedArea <= 0) return Infinity;
  const boardArea = board.w * board.h;
  let leftoverArea = 0, biggest = 0;
  for (const o of r.leftover) {           // already filtered to >= MIN_REMNANT_MM
    const a = o.w * o.h;
    leftoverArea += a;
    if (a > biggest) biggest = a;
  }
  /* `board.index` is absent on a bare { w, h } board — every caller that does
     not care about the rack, and every test that packs a rectangle — so the
     term is zero and the cost is exactly what it was before this existed. */
  const dig = (digWorth == null ? DIG_WORTH_BLANK : digWorth) * (board.index || 0);
  return ((boardArea - leftoverArea) + (boardArea - biggest)) / placedArea + dig;
}

/* ============================================================================
   DENSITY IS A RANGE THE USER DECLARES, NOT A FIXED GRADE
   ============================================================================
   CS-004 says 60lb board is not interchangeable with 30lb and that you cannot
   swap it in silently. The operative word is SILENTLY. A blank now carries the
   interval its mold was planned against, and inside that interval — which
   somebody typed, on purpose, looking at the rack — any board will do,
   including two grades glued edge to edge in one layer.

   The consequence is that a mold no longer has "a density", it has a set and a
   maximum, and the maximum is the one that matters: the densest board in a
   stack sets the CNC feed rate for the whole thing. densityRollup() below is
   what every reporting surface reads, and it is why none of them print one
   number.

   A blank with no range declared is a blank at one grade — lo === hi — which is
   exactly the old behaviour, and is what every record written before this
   existed falls back to. */
const DENSITY_TOL = 0.05;   // half canonDensity's 0.1 rounding: a float guard, not a policy knob

function blankDensityRange(b) {
  const d = b.density == null ? 30 : b.density;
  const lo = b.densityMin == null ? d : b.densityMin;
  const hi = b.densityMax == null ? d : b.densityMax;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

/* Which grades a set of plans actually opened, and the highest of them.
   `keyOf` is optional and groups the per-blank breakdown by whatever the caller
   can see — pass `p => p.planId` for a per-mold answer. */
function densityRollup(plans, keyOf) {
  const all = new Set(), by = new Map();
  for (const pl of plans || []) {
    all.add(pl.density);
    if (!keyOf) continue;
    for (const p of pl.placed) {
      const k = keyOf(p.part);
      if (k == null) continue;
      if (!by.has(k)) by.set(k, new Set());
      by.get(k).add(pl.density);
    }
  }
  const asc = s => [...s].sort((a, b) => a - b);
  const out = { used: asc(all), max: all.size ? Math.max(...all) : null, by: {} };
  for (const [k, s] of by) out.by[k] = { used: asc(s), max: Math.max(...s) };
  return out;
}

/* Trial-packing every board against every blank is O(boards x blanks^2). Fine
   at shop scale (60 blanks, 20 rack rows is ~3e5 operations) and not fine if
   somebody batches a whole season. Past the budget, score only the smallest
   few boards that can still hold the largest thing left — a narrower search,
   never a silent one: `degraded` comes back on the result. */
const TRIAL_BUDGET = 2e6;
const TRIAL_FALLBACK = 4;

/* Pack every blank across the whole stock list.

   `blanks`  [{ id, w, h, thickness, density, label }]
   `boards`  [{ id, len, wid, thk, density, qty, label }]  (mm)
   Returns per-board plans, leftovers to write back, and any shortfall. */
function packAll(blanks, boards, opts) {
  opts = opts || {};
  const tol = opts.thicknessTol == null ? 0.5 : opts.thicknessTol;
  const rotate = opts.allowRotate !== false;
  const plans = [];
  const shortfall = [];
  let degraded = false;
  // Bucket by what can physically substitute for what. Thickness is still a
  // hard bucket — a blank can only come from a board of the same thickness.
  // Density is now the RANGE the blank declares: two blanks with the same range
  // share a pool, two blanks with different ranges are different jobs and stay
  // apart, which is also what keeps this deterministic.
  const buckets = new Map();
  for (const b of blanks) {
    // No coercion here on purpose: this file is importScripts()'d into the
    // worker without core.js, so canonDensity is out of reach. It does not
    // need to be — blanksFromPlans and boardsForPacking in stock.js both
    // canonicalise, so both sides of the key below are already one form.
    const [dlo, dhi] = blankDensityRange(b);
    const k = `${Math.round(b.thickness / tol)}|${dlo}|${dhi}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(b);
  }
  // Expand quantities into individual boards. Sorted smallest-first and by id
  // so the representative picked below is the same one on every run.
  const pool = [];
  for (const bd of boards) {
    for (let i = 0; i < (bd.qty || 1); i++) {
      pool.push({ src: bd, w: bd.len, h: bd.wid, thk: bd.thk, density: bd.density || 30,
        // Rank within this board's own storage location; 0 when the rack has no
        // locations recorded, which makes the whole preference a no-op there.
        index: bd.index || 0, unit: i });
    }
  }
  pool.sort((a, b) => (a.w * a.h - b.w * b.h)
    // NOT cmpId(): packer.js is importScripts()'d into slicer.worker.js
    // without core.js, so core's helpers do not exist here. This comparator is
    // a determinism tie-break inside cut scoring, never a displayed order, so
    // plain string order is fine and a ReferenceError would not be.
    || String(a.src.id).localeCompare(String(b.src.id)) || (a.unit - b.unit));

  for (const [k, wanted] of buckets) {
    let todo = wanted.slice();
    const [thkKey, loKey, hiKey] = k.split("|");
    const usable = () => pool.filter(bd => !bd.used
      && Math.round(bd.thk / tol) === +thkKey
      && bd.density >= +loKey - DENSITY_TOL && bd.density <= +hiKey + DENSITY_TOL);

    while (todo.length) {
      /* Identical units are interchangeable, so only one of each SIZE is worth
         trial-packing. This is Simon's "we only care about xyz and density"
         applied to the algorithm, and on a real rack it collapses the candidate
         set to a handful. */
      const reps = new Map();
      for (const bd of usable()) {
        /* Density is in the key now: inside a range a 30lb and a 60lb sheet of
           the same size are both allowed, and they are NOT interchangeable —
           they cost the same but they hand the shop different feed rates, so
           both have to be scored. */
        const key = `${Math.round(bd.w * 10)}x${Math.round(bd.h * 10)}|${bd.density}`;
        const cur = reps.get(key);
        /* Lowest index represents its size: identical boards are still
           interchangeable to the packer, but not to the person lifting them. A
           tie keeps the incumbent, and pool order (area, then id, then unit)
           settles that — so two runs pick the same representative. */
        if (!cur || (bd.index || 0) < (cur.index || 0)) reps.set(key, bd);
      }
      let cands = [...reps.values()];
      if (!cands.length) break;

      if (cands.length * todo.length * todo.length > TRIAL_BUDGET) {
        degraded = true;
        const big = todo.reduce((m, p) => Math.max(m, p.w, p.h), 0);
        const canHold = cands.filter(bd => Math.max(bd.w, bd.h) >= big);
        cands = (canHold.length ? canHold : cands).slice(0, TRIAL_FALLBACK);
      }

      /* `runnerUp` is telemetry, not policy: the best cost that did NOT win. It
         is what lets whyTheseBoards() say, per board, whether the lift charge
         actually decided anything — so a constant that never changes an outcome
         can be argued down with the evidence on screen. */
      let best = null, runnerUp = Infinity;
      const beaten = c => { if (c < runnerUp) runnerUp = c; };
      for (const bd of cands) {
        const r = packBoard(bd, todo, opts);
        if (!r.placed.length) continue;
        const cost = boardCost(bd, r, opts.digWorthBlank);
        // Strictly better only, then the tiebreaks, so two runs agree. `cands`
        // is already in smallest-then-id order, which settles the last one.
        if (!best) { best = { bd, r, cost }; continue; }
        const d = cost - best.cost;
        if (d < -1e-9) { beaten(best.cost); best = { bd, r, cost }; }
        else if (d <= 1e-9 && r.cuts.length < best.r.cuts.length) { beaten(best.cost); best = { bd, r, cost }; }
        else beaten(cost);
      }
      // Nothing on the rack fits what is left: this is a purchase, not a failure.
      if (!best) break;

      best.bd.used = true;
      todo = best.r.unplaced;
      plans.push({
        board: best.bd, placed: best.r.placed, cuts: best.r.cuts,
        // boardId on every leftover, so whatever eventually writes offcuts back
        // into inventory knows which board each came off.
        leftover: best.r.leftover.map(o => ({ ...o, boardId: best.bd.src.id })),
        // Below MIN_REMNANT_MM: never counted as recovered value, never written
        // back on its own, but shown to whoever is reviewing the cut so they
        // can promote one by hand.
        scrap: (best.r.scrap || []).map(o => ({ ...o, boardId: best.bd.src.id })),
        thickness: best.bd.thk, density: best.bd.density, cost: best.cost,
        index: best.bd.index || 0,
        digCost: (opts.digWorthBlank == null ? DIG_WORTH_BLANK : opts.digWorthBlank) * (best.bd.index || 0),
        // How much the winner beat the next-best board by. null when it was the
        // only candidate that placed anything.
        margin: Number.isFinite(runnerUp) ? runnerUp - best.cost : null,
      });
    }
    for (const p of todo) shortfall.push(p);
  }
  const roll = densityRollup(plans);
  return { plans, shortfall, boardsUsed: plans.length, degraded,
    densitiesUsed: roll.used, maxDensity: roll.max };
}

/* Human-readable cut sequence for one board. The saw operator reads this top to
   bottom; every line is a cut they can actually make on the piece in hand. */
function cutSequence(plan) {
  return plan.cuts.map((c, i) => ({
    n: i + 1,
    text: c.axis === "x"
      ? `Rip at ${(c.at).toFixed(1)}mm (${(c.at / 25.4).toFixed(2)}in) from the left edge`
      : `Crosscut at ${(c.at).toFixed(1)}mm (${(c.at / 25.4).toFixed(2)}in) from the bottom edge`,
    axis: c.axis, at: c.at, from: c.from, to: c.to,
  }));
}

/* How much of each board actually became blanks. The number that says whether
   any of this was worth doing. */
function utilisation(plans) {
  let used = 0, total = 0;
  for (const p of plans) {
    total += p.board.w * p.board.h;
    for (const pl of p.placed) used += pl.w * pl.h;
  }
  return total ? used / total : 0;
}

/* ============================================================================
   WHAT A WHOLE MOLD COSTS
   ============================================================================
   slicer.js picks the layer thicknesses, and until now it scored them by blank
   VOLUME plus a flat per-layer penalty — a proxy that cannot see the rack. Thin
   boards always win on volume alone, so the penalty was the only thing stopping
   it handing the shop eight glue joints, and its own comment admitted the
   constant was a guess.

   This is the honest version: score a candidate stack by actually packing its
   blanks onto the boards we own. It lives here, not in slicer.js, because
   slicer.js is pure geometry with no dependencies and that is what lets
   test_slicer.mjs eval it standalone. slicer.js takes this as an injected
   opts.score and never imports it.

   THE EXCHANGE RATE. Everything is in mm³ of board except one number, which is
   in a unit a person can argue with over a table:

     JOINT_WORTH_SHEETS = 0.25 — one glue joint is worth up to a quarter of a
     4x8 sheet of 1in board.

   A glue joint is a 4h clamp cycle under CS-003 §7.3, so it is genuinely
   expensive and the old penalty priced it too low. Calibration, so this can be
   retuned with a reason rather than by feel: on the undertray diffuser sample,
   choosing 3+3+3+1in (3 joints) over 1.5x5+2in (5 joints) costs 8.2e6 mm³ more
   board to save 2 joints, so anything above 0.054 sheets flips it. 0.25 clears
   that with room, and still refuses to waste a whole extra sheet to save fewer
   than four joints. Move it if somebody has glued a season's worth and
   disagrees.

   THE SHORTFALL CHARGE IS LOAD-BEARING. packAll opens zero boards when nothing
   fits, so without charging for what could not be cut, a stack that cannot be
   built at all scores as free and wins every time. */
const JOINT_WORTH_SHEETS = 0.25;
const SHEET_LEN_MM = 96 * 25.4;
const SHEET_WID_MM = 48 * 25.4;
const SHEET_AREA_MM2 = SHEET_LEN_MM * SHEET_WID_MM;
const SHEET_REF_MM3 = SHEET_AREA_MM2 * 25.4;   // a 4x8 sheet of 1in board

/* Flatten a sliced stack into the blanks a cut list would ask for. Same shape
   and the same L1a / L1b naming as stock.js's blanksFromPlans, which is what
   drawings.js's blankLabel matches. */
function blanksFromLayers(layers, dens, tag, planId) {
  /* `dens` is a number (one grade) or { min, max } (a declared range). `density`
     is still emitted, equal to min, so every caller that only ever wanted one
     number keeps working and no stored record needs migrating.

     `planId` is optional and is what tells a cut sheet WHOSE blank a rectangle
     is. The id cannot do that job: it is prefixed with the plan's NAME, and
     re-planning a mold leaves both plans in DB.stackplans under the same name —
     so two blanks in one pack can carry the same id. stock.js's blanksFromPlans
     has always emitted planId; this one did not, which is why a pure test could
     not build a pack the drawing code would read correctly. */
  const lo = (dens && dens.min != null) ? dens.min : (dens || 30);
  const hi = (dens && dens.max != null) ? dens.max : lo;
  const out = [];
  (layers || []).forEach((L, i) => (L.blanks || []).forEach((b, k) => {
    const o = {
      id: `${tag ? tag + " " : ""}L${i + 1}${(L.blanks.length > 1 ? String.fromCharCode(97 + k) : "")}`,
      w: b.x1 - b.x0, h: b.y1 - b.y0,
      thickness: L.thickness, density: lo, densityMin: lo, densityMax: hi,
    };
    if (planId) { o.planId = planId; o.layer = i; }
    out.push(o);
  }));
  return out;
}

/* What this stack would cost to actually cut, on the rack we actually have.
   `boards` empty (nobody has entered stock yet) falls back to the volume
   heuristic and says so through usedRack, so planning still works on an empty
   rack — which is the state every new season starts in. */
function moldCost(layers, boards, opts) {
  opts = opts || {};
  const dLo = opts.densityMin != null ? opts.densityMin : (opts.density || 30);
  const dHi = opts.densityMax != null ? opts.densityMax : dLo;
  const jointRate = opts.jointWorthSheets == null ? JOINT_WORTH_SHEETS : opts.jointWorthSheets;
  const joints = Math.max(0, (layers || []).length - 1);
  const jointCost = joints * jointRate * SHEET_REF_MM3;
  const blanks = blanksFromLayers(layers, { min: dLo, max: dHi });

  if (!boards || !boards.length) {
    let vol = 0;
    for (const b of blanks) vol += b.w * b.h * b.thickness;
    return { usedRack: false, boardsOpened: 0, joints, shortfall: [], mustBuySheets: 0, cost: vol + jointCost };
  }

  const r = packAll(blanks, boards, opts);
  let spent = 0;
  for (const p of r.plans) {
    const area = p.board.w * p.board.h;
    let back = 0;
    for (const o of p.leftover) back += o.w * o.h;
    spent += (area - back) * p.thickness;   // board consumed, crediting what returns to the rack
  }
  // Anything that did not fit has to be bought. At least a whole sheet each,
  // because that is how board is sold.
  let mustBuySheets = 0;
  for (const s of r.shortfall) {
    mustBuySheets += Math.max(1, Math.ceil((s.w * s.h) / SHEET_AREA_MM2));
    spent += Math.max(1, Math.ceil((s.w * s.h) / SHEET_AREA_MM2)) * SHEET_AREA_MM2 * s.thickness;
  }
  return {
    usedRack: true, boardsOpened: r.boardsUsed, joints,
    shortfall: r.shortfall, mustBuySheets, cost: spent + jointCost,
    densitiesUsed: r.densitiesUsed, maxDensity: r.maxDensity,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { packBoard, packAll, cutSequence, utilisation, fitIn, boardCost,
    blanksFromLayers, moldCost, blankDensityRange, densityRollup,
    KERF_MM, MIN_REMNANT_MM, JOINT_WORTH_SHEETS, SHEET_AREA_MM2, SHEET_REF_MM3,
    DIG_WORTH_BLANK, DENSITY_TOL };
}
