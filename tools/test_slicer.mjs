#!/usr/bin/env node
/* Geometry tests for 06 Composites App/app/slicer.js.
   Standalone, like test_wo_rules.mjs — NOT part of test_app.mjs, whose DOM stub
   has no File/FileReader and whose FILES list is UI logic. The slicer is pure,
   so it runs here with nothing stubbed at all.

   Run from SN6 Resources/:  node tools/test_slicer.mjs

   The headline test is CONTAINMENT: clip every triangle of a real-shaped mold
   to each layer's slab and prove the surviving polygon lies inside one of that
   layer's blanks. If that passes, the blanks hold the mold. Everything else
   here is a guard on a specific way we got it wrong during review. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "06 Composites App", "app");
const src = readFileSync(join(root, "slicer.js"), "utf8").replace(/"use strict";\n/, "");
// Indirect eval runs in global scope, so the slicer's top-level `const`s are
// invisible to this module. Hand them out through globalThis, the same trick
// test_app.mjs uses for core.js's lexical bindings.
globalThis.__S = {};
(0, eval)(src + "\n;Object.assign(globalThis.__S,{parseSTL,scaleTris,meshBounds,sliceAt,stitchContours,outerContours,polyArea,pointInPoly,bboxOf,inflateBox,boxesOverlap,boxContains,mergeToFixedPoint,applyMargin,quantizeUp,BLANK_QUANTUM_MM,checkMonotone,simplify,clipTriangleToSlab,sliceMold,stitchRelaxed,MARGIN_MIN_MM,MARGIN_MAX_MM,WELD_TOL_MM,MAX_WELD_TOL_MM,DEDUPE_TOL_MM,MAX_CUT_DEPTH_MM,splitBodies,boxTris,slabBoxes,planMold,compositionCandidates});");
const S = globalThis.__S;

/* ---------- mesh builders ----------
   Side walls only. Slicing cares about triangles that CROSS the plane, and a
   cap never does, so walls are sufficient and let us model a blind cavity
   without hand-building a watertight solid. */
function rect(x0, y0, x1, y1) {
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}
function walls(polyBottom, polyTop, z0, z1) {
  const tris = [];
  const n = polyBottom.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const b0 = polyBottom[i], b1 = polyBottom[j], t0 = polyTop[i], t1 = polyTop[j];
    tris.push({ ax: b0.x, ay: b0.y, az: z0, bx: b1.x, by: b1.y, bz: z0, cx: t1.x, cy: t1.y, cz: z1 });
    tris.push({ ax: b0.x, ay: b0.y, az: z0, bx: t1.x, by: t1.y, bz: z1, cx: t0.x, cy: t0.y, cz: z1 });
  }
  return tris;
}
function prism(poly, z0, z1) { return walls(poly, poly, z0, z1); }
/* A tapered plug: wide at the bottom, narrower at the top. This is what CS-003
   §7.1.4 positive draft looks like, and the shape the fast slice path relies on. */
function frustum(halfBottom, halfTop, z0, z1, cx = 0, cy = 0) {
  const b = rect(cx - halfBottom, cy - halfBottom, cx + halfBottom, cy + halfBottom);
  const t = rect(cx - halfTop, cy - halfTop, cx + halfTop, cy + halfTop);
  return walls(b, t, z0, z1);
}
function writeBinarySTL(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    o += 12;
    const v = [t.ax, t.ay, t.az, t.bx, t.by, t.bz, t.cx, t.cy, t.cz];
    for (const f of v) { dv.setFloat32(o, f, true); o += 4; }
    o += 2;
  }
  return buf;
}
function asciiSTL(tris) {
  return "solid t\n" + tris.map(t =>
    `facet normal 0 0 0\n outer loop\n  vertex ${t.ax} ${t.ay} ${t.az}\n  vertex ${t.bx} ${t.by} ${t.bz}\n  vertex ${t.cx} ${t.cy} ${t.cz}\n endloop\nendfacet`
  ).join("\n") + "\nendsolid t\n";
}

/* ---------- runner ---------- */
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
function throws(fn, re, m) {
  try { fn(); } catch (e) { if (!re || re.test(e.message)) return e; throw new Error((m || "wrong error") + ": " + e.message); }
  throw new Error(m || "expected a throw");
}

console.log("STL parsing:");
t("reads a binary STL", () => {
  const tris = prism(rect(0, 0, 100, 100), 0, 50);
  const got = S.parseSTL(writeBinarySTL(tris));
  assert(got.tris.length === tris.length, "triangle count should survive");
  assert(Math.abs(got.tris[0].ax - tris[0].ax) < 1e-3, "coordinates should survive");
});
t("reads an ASCII STL", () => {
  const tris = prism(rect(0, 0, 100, 100), 0, 50);
  const got = S.parseSTL(new TextEncoder().encode(asciiSTL(tris)).buffer);
  assert(got.tris.length === tris.length, "ASCII should parse to the same count");
});
t("a binary STL whose header says 'solid' is still read as binary", () => {
  const tris = prism(rect(0, 0, 10, 10), 0, 5);
  const buf = writeBinarySTL(tris);
  new Uint8Array(buf).set(new TextEncoder().encode("solid exported-by-something"), 0);
  assert(S.parseSTL(buf).tris.length === tris.length, "length, not prefix, decides the format");
});
t("an empty file and a truncated file both fail with a sentence, not a crash", () => {
  throws(() => S.parseSTL(new ArrayBuffer(0)), /empty/i, "empty file");
  throws(() => S.parseSTL(new Uint8Array([1, 2, 3, 4, 5]).buffer), /does not look like/i, "garbage");
});
t("zero triangles is an error, not an empty success", () => {
  const buf = new ArrayBuffer(84);
  new DataView(buf).setUint32(80, 0, true);
  throws(() => S.parseSTL(buf), /no triangles/i);
});
t("units are applied, because an STL carries none", () => {
  const tris = prism(rect(0, 0, 1, 1), 0, 1);
  assert(S.scaleTris(tris, "in")[0].ax === tris[0].ax * 25.4, "inches scale by 25.4");
  assert(S.scaleTris(tris, "mm")[0].ax === tris[0].ax, "mm pass through untouched");
});

console.log("slicing and contours:");
t("a plane through a prism yields one closed loop", () => {
  const tris = prism(rect(0, 0, 100, 60), 0, 50);
  const loops = S.stitchContours(S.sliceAt(tris, 25));
  assert(loops.length === 1, "one prism, one loop, got " + loops.length);
  const b = S.bboxOf(loops[0]);
  assert(Math.abs(b.x0) < 0.01 && Math.abs(b.x1 - 100) < 0.01, "loop should span the prism");
});
t("a coplanar face contributes nothing, so a flat base does not confuse the slice", () => {
  const cap = [{ ax: 0, ay: 0, az: 10, bx: 10, by: 0, bz: 10, cx: 10, cy: 10, cz: 10 }];
  assert(S.sliceAt(cap, 10).length === 0, "a face lying in the plane has no crossing");
});
t("a vertex exactly on the plane does not produce a doubled point", () => {
  const tris = [{ ax: 0, ay: 0, az: 0, bx: 10, by: 0, bz: 10, cx: 0, cy: 10, cz: 10 }];
  const segs = S.sliceAt(tris, 5);
  assert(segs.length <= 1, "one triangle gives at most one segment");
});
t("a mesh with a real hole reports where it broke instead of silently closing it", () => {
  const tris = prism(rect(0, 0, 100, 100), 0, 50).slice(0, 4); // drop two walls
  const e = throws(() => S.stitchContours(S.sliceAt(tris, 25)), /hole/i);
  assert(/re-export|mesh repair/i.test(e.message), "and should say what to do about it");
});
t("REGRESSION endpoints straddling a weld-grid boundary still join", () => {
  // Bucketing endpoints on a grid and requiring an EXACT cell match is a trap:
  // two points a millionth of a millimetre apart land in different cells when
  // they straddle a boundary, and a good mesh reports a gap. Real molds hit this
  // constantly, because designers put corners on round numbers and round numbers
  // are where the boundaries sit. 889.005mm = 35.00 inches, a real reported case.
  const X = 889.005, EPS = 1e-7;
  const segs = [
    [{ x: 0, y: 0 }, { x: X - EPS, y: 0 }],
    [{ x: X + EPS, y: 0 }, { x: X, y: 500 }],
    [{ x: X, y: 500 }, { x: 0, y: 500 }],
    [{ x: 0, y: 500 }, { x: 0, y: 0 }],
  ];
  const loops = S.stitchContours(segs);
  assert(loops.length === 1, "2e-7mm apart is the same corner, not a hole; got " + loops.length + " loops");
});
t("REGRESSION a 12um gap joins — ordinary tessellation noise, not a broken mesh", () => {
  // Reported from a real mold. A hard 0.01mm tolerance refused it. Adjacent
  // triangles in a real Fusion export do not share endpoints exactly.
  const segs = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 100.012, y: 0 }, { x: 100, y: 100 }],
    [{ x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 0, y: 100 }, { x: 0, y: 0 }],
  ];
  const r = S.stitchRelaxed(segs, S.WELD_TOL_MM);
  assert(r.loops.length === 1, "12um is noise, not a hole");
  assert(r.tol === S.WELD_TOL_MM, "and it should not even need relaxing, got " + r.tol);
});
t("the relaxation ladder loosens only as far as it must, and stops at the cap", () => {
  const box = g => [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 100 + g, y: 0 }, { x: 100, y: 100 }],
    [{ x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 0, y: 100 }, { x: 0, y: 0 }],
  ];
  assert(S.stitchRelaxed(box(0.3), S.WELD_TOL_MM).tol === 0.4, "0.3mm should need one or two doublings");
  // Doubling overshoots the cap; the last attempt must be clamped to it or the
  // documented 1mm limit is really 0.8mm.
  assert(S.stitchRelaxed(box(0.9), S.WELD_TOL_MM).tol === S.MAX_WELD_TOL_MM, "the documented cap must be the real cap");
  throws(() => S.stitchRelaxed(box(3), S.WELD_TOL_MM), /hole/i, "past the cap it is a real defect");
});
t("the dedupe tolerance is NOT the weld tolerance", () => {
  // Tying them together means a relaxed weld starts collapsing both ends of a
  // short segment into one point and dropping it — losing real geometry to fix
  // a joining problem. On a finely tessellated mold that is most of the outline.
  assert(S.DEDUPE_TOL_MM < S.WELD_TOL_MM / 100, "dedupe must stay far tighter than any weld");
});
t("a rough mesh warns instead of silently passing", () => {
  // A stack that only closed at a loosened tolerance is machinable, but the
  // export is rough and that is worth saying before it happens again.
  const tris = frustum(200, 80, 0, 100);
  const out = S.sliceMold(tris, [25, 25, 25, 25], {});
  assert(out.warnings.length === 0, "a clean mesh must not cry wolf: " + out.warnings.join("; "));
});
t("a genuine hole is still refused, and the message says how far the gap is", () => {
  // The fix must not become "join anything". A 5mm gap is a real defect.
  const segs = [
    [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    [{ x: 105, y: 0 }, { x: 100, y: 100 }],
    [{ x: 100, y: 100 }, { x: 0, y: 100 }],
    [{ x: 0, y: 100 }, { x: 0, y: 0 }],
  ];
  const e = throws(() => S.stitchContours(segs), /hole/i);
  assert(/mm away/.test(e.message), "should quantify the gap so a tolerance problem is distinguishable from a defect");
});
t("holes are discarded — a bounding box cannot see them anyway", () => {
  const tris = prism(rect(0, 0, 200, 200), 0, 50).concat(prism(rect(80, 80, 120, 120), 0, 50));
  const loops = S.stitchContours(S.sliceAt(tris, 25));
  assert(loops.length === 2, "outer plus inner");
  const outers = S.outerContours(loops);
  assert(outers.length === 1, "only the outer survives");
  const b = S.bboxOf(outers[0]);
  assert(Math.abs(b.x1 - 200) < 0.01, "and it is the outer one");
});

console.log("monotonicity (CS-003 §7.1.4 positive draft):");
t("a tapered plug passes", () => {
  const tris = frustum(100, 60, 0, 50);
  const lo = S.outerContours(S.stitchContours(S.sliceAt(tris, 1))).map(c => ({ contour: c }));
  const hi = S.outerContours(S.stitchContours(S.sliceAt(tris, 49))).map(c => ({ contour: c }));
  assert(S.checkMonotone(lo, hi, 0.05) === null, "narrowing upward is exactly what draft means");
});
t("CRITICAL a real overhang fails and names the region", () => {
  const tris = frustum(60, 100, 0, 50); // widens upward: negative draft
  const lo = S.outerContours(S.stitchContours(S.sliceAt(tris, 1))).map(c => ({ contour: c }));
  const hi = S.outerContours(S.stitchContours(S.sliceAt(tris, 49))).map(c => ({ contour: c }));
  const bad = S.checkMonotone(lo, hi, 0.05);
  assert(bad && bad.region, "an overhang must be caught");
  assert(Number.isFinite(bad.region.x) && Number.isFinite(bad.region.y), "and located");
});
t("CRITICAL a valid mold with a blind bottom dowel hole PASSES", () => {
  // Outer box full height; a square cavity opening at the bottom, ceiling at 20.
  // Monotonicity genuinely fails on the full boundary here (the hole disappears
  // going up) — which is why the check runs on OUTER contours only.
  const tris = prism(rect(0, 0, 300, 300), 0, 100).concat(prism(rect(140, 140, 160, 160), 0, 20));
  const lo = S.outerContours(S.stitchContours(S.sliceAt(tris, 5))).map(c => ({ contour: c }));
  const hi = S.outerContours(S.stitchContours(S.sliceAt(tris, 50))).map(c => ({ contour: c }));
  assert(lo.length === 1 && hi.length === 1, "the hole must not read as a second island");
  assert(S.checkMonotone(lo, hi, 0.05) === null, "CS-003 §7.1.6 requires these holes — never reject one");
});

console.log("island merging:");
t("two far-apart islands stay separate", () => {
  const islands = [{ box: { x0: 0, y0: 0, x1: 50, y1: 50 } }, { box: { x0: 400, y0: 0, x1: 450, y1: 50 } }];
  assert(S.mergeToFixedPoint(islands, S.MARGIN_MAX_MM).length === 2, "350mm apart should not merge");
});
t("two near islands merge, because their blanks would collide", () => {
  const islands = [{ box: { x0: 0, y0: 0, x1: 50, y1: 50 } }, { box: { x0: 70, y0: 0, x1: 120, y1: 50 } }];
  assert(S.mergeToFixedPoint(islands, S.MARGIN_MAX_MM).length === 1, "20mm apart with 50.8mm margin must merge");
});
t("CRITICAL U-of-rails plus a central boss produces no overlapping blanks", () => {
  // The regression from review round two. Island-level merging leaves the boss
  // as its own group whose blank sits ENTIRELY INSIDE the merged rails' blank.
  const islands = [
    { box: { x0: 0, y0: 0, x1: 80, y1: 600 } },      // left rail
    { box: { x0: 700, y0: 0, x1: 780, y1: 600 } },   // right rail
    { box: { x0: 0, y0: 620, x1: 780, y1: 700 } },   // top rail, 20mm from both
    { box: { x0: 350, y0: 200, x1: 430, y1: 280 } }, // boss, 270mm from everything
  ];
  const groups = S.mergeToFixedPoint(islands, S.MARGIN_MAX_MM);
  const blanks = groups.map(g => S.applyMargin(g.box, S.MARGIN_MIN_MM));
  for (let a = 0; a < blanks.length; a++) {
    for (let b = a + 1; b < blanks.length; b++) {
      assert(!S.boxesOverlap(blanks[a], blanks[b]), "two blanks cannot occupy the same place");
    }
  }
});
t("and the island-level rule this replaced really does produce the collision", () => {
  // Proof the regression was real, so nobody "simplifies" the merge back.
  const islands = [
    { box: { x0: 0, y0: 0, x1: 80, y1: 600 } },
    { box: { x0: 700, y0: 0, x1: 780, y1: 600 } },
    { box: { x0: 0, y0: 620, x1: 780, y1: 700 } },
    { box: { x0: 350, y0: 200, x1: 430, y1: 280 } },
  ];
  // Island-level: one pass, comparing original island boxes only.
  const used = new Array(4).fill(false);
  const naive = [];
  for (let i = 0; i < 4; i++) {
    if (used[i]) continue;
    let box = islands[i].box; used[i] = true;
    for (let j = i + 1; j < 4; j++) {
      if (!used[j] && S.boxesOverlap(S.inflateBox(islands[i].box, S.MARGIN_MAX_MM), S.inflateBox(islands[j].box, S.MARGIN_MAX_MM))) {
        box = { x0: Math.min(box.x0, islands[j].box.x0), y0: Math.min(box.y0, islands[j].box.y0), x1: Math.max(box.x1, islands[j].box.x1), y1: Math.max(box.y1, islands[j].box.y1) };
        used[j] = true;
      }
    }
    naive.push(box);
  }
  const nb = naive.map(b => S.applyMargin(b, S.MARGIN_MIN_MM));
  let collided = false;
  for (let a = 0; a < nb.length; a++) for (let b = a + 1; b < nb.length; b++) if (S.boxesOverlap(nb[a], nb[b])) collided = true;
  assert(collided, "if this stops colliding the counterexample has drifted and the guard above is vacuous");
});

console.log("margins and simplification:");
t("margin applies on all four sides — never less than asked, on any edge", () => {
  const b = S.applyMargin({ x0: 0, y0: 0, x1: 100, y1: 100 }, 25.4);
  assert(-b.x0 >= 25.4 - 1e-9 && -b.y0 >= 25.4 - 1e-9 && b.x1 - 100 >= 25.4 - 1e-9 && b.y1 - 100 >= 25.4 - 1e-9,
    "a shifted glue-up needs slop everywhere");
  // Rounding to the saw increment only ever ADDS, and adds evenly, so the mold
  // stays centred rather than drifting toward one edge.
  assert(Math.abs(-b.x0 - (b.x1 - 100)) < 1e-9 && Math.abs(-b.y0 - (b.y1 - 100)) < 1e-9,
    "the rounding margin is shared between opposite edges");
});
t("blanks come out in whole saw increments, because a person cuts them", () => {
  const q = S.BLANK_QUANTUM_MM;
  const mult = v => Math.abs(v / q - Math.round(v / q)) < 1e-6;
  for (const [w, h] of [[100, 100], [237.4, 61.9], [1, 1], [500, 300.05]]) {
    const raw = { x0: 0, y0: 0, x1: w, y1: h };
    const b = S.applyMargin(raw, 25.4);
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    assert(mult(bw) && mult(bh), `${w}x${h} gave ${bw.toFixed(3)}x${bh.toFixed(3)}, not a ${q}mm multiple`);
    // Up, never down: a quantised blank can never stop containing the mold.
    assert(bw >= w + 2 * 25.4 - 1e-9 && bh >= h + 2 * 25.4 - 1e-9, "rounding must not eat the margin");
    assert(bw < w + 2 * 25.4 + q && bh < h + 2 * 25.4 + q, "and must not add a whole increment more than needed");
  }
  assert(S.quantizeUp(q * 3, q) === q * 3, "a value already on the mark does not jump to the next one");
});
t("simplification drops collinear noise but keeps the shape", () => {
  const pts = [];
  for (let i = 0; i <= 100; i++) pts.push({ x: i, y: 0 });
  pts.push({ x: 100, y: 50 }, { x: 0, y: 50 });
  const s = S.simplify(pts, 0.2);
  assert(s.length < 8, "a straight run should collapse, got " + s.length);
  const a = S.bboxOf(pts), b = S.bboxOf(s);
  assert(Math.abs(a.x1 - b.x1) < 0.3 && Math.abs(a.y1 - b.y1) < 0.3, "but the extent must not move");
});

console.log("triangle clipping:");
t("a triangle fully inside, fully outside, and spanning the slab", () => {
  const inside = { ax: 0, ay: 0, az: 5, bx: 10, by: 0, bz: 5, cx: 0, cy: 10, cz: 6 };
  assert(S.clipTriangleToSlab(inside, 0, 10).length === 3, "fully inside keeps its 3 corners");
  const outside = { ax: 0, ay: 0, az: 50, bx: 10, by: 0, bz: 50, cx: 0, cy: 10, cz: 50 };
  assert(S.clipTriangleToSlab(outside, 0, 10).length === 0, "fully outside clips away");
  const spanning = { ax: 0, ay: 0, az: -10, bx: 10, by: 0, bz: -10, cx: 5, cy: 5, cz: 30 };
  assert(S.clipTriangleToSlab(spanning, 0, 10).length >= 3, "a spanning triangle leaves a polygon");
});
t("a triangle crossing the slab with NO vertex inside is still caught", () => {
  // This is the case that makes the naive vertex test unsound.
  const tri = { ax: 0, ay: 0, az: -5, bx: 10, by: 0, bz: -5, cx: 5, cy: 5, cz: 25 };
  const poly = S.clipTriangleToSlab(tri, 0, 10);
  assert(poly.length >= 3, "clipping sees it even though no vertex lies in the slab");
});

console.log("end to end:");
t("a tapered plug slices into a stepped stack", () => {
  const tris = frustum(200, 80, 0, 100);
  const out = S.sliceMold(tris, [25, 25, 25, 25], {});
  assert(out.layers.length === 4, "four boards, four layers");
  const w = out.layers.map(L => L.blanks[0].x1 - L.blanks[0].x0);
  for (let i = 1; i < w.length; i++) assert(w[i] <= w[i - 1] + 0.01, "a plug's blanks must shrink going up");
  assert(out.warnings.length === 0, "no nesting or overlap warnings: " + out.warnings.join("; "));
});
t("boards that do not add up to the mold height are refused", () => {
  const tris = frustum(200, 80, 0, 100);
  throws(() => S.sliceMold(tris, [25, 25], {}), /add up to/i);
});
t("CRITICAL an overhung mold still gets a blank that CONTAINS it, and a warning", () => {
  // Behaviour change, deliberate. Monotonicity was only ever an optimisation
  // that let us slice once per layer; a blank merely has to contain the mold.
  // Real molds break draft — SN5 undertray body #1 flares 85mm above its base,
  // body #3 flares 680mm — and refusing them was wrong. Draft is now a
  // design-review finding (CS-003 §7.1.4), not a hard stop.
  const tris = frustum(80, 200, 0, 100);   // widens upward: negative draft
  const out = S.sliceMold(tris, [25, 25, 25, 25], {});
  assert(out.layers.length === 4, "an overhung mold must still plan");
  assert(out.warnings.some(w => /draft|overhang/i.test(w)), "and must still say the draft is wrong: " + out.warnings.join("; "));
  // The guarantee that matters: every triangle, clipped to its slab, inside a blank.
  for (const L of out.layers) {
    for (const tri of tris) {
      const poly = S.clipTriangleToSlab(tri, L.z0 + 0.01, L.z1 - 0.01);
      if (poly.length < 3) continue;
      assert(L.blanks.some(b => poly.every(p =>
        p.x >= b.x0 - 0.01 && p.x <= b.x1 + 0.01 && p.y >= b.y0 - 0.01 && p.y <= b.y1 + 0.01)),
        `overhung layer ${L.index + 1} has mold material outside every blank`);
    }
  }
});
t("a mold taller than the 6in cut depth splits into sections at board boundaries", () => {
  const tris = frustum(200, 120, 0, 9 * 25.4);          // 9in tall
  const out = S.sliceMold(tris, new Array(9).fill(25.4), {});
  assert(out.sections.length === 2, "9in over a 6in cut depth is two sections, got " + out.sections.length);
  for (const s of out.sections) assert(s.height <= S.MAX_CUT_DEPTH_MM + 1e-6, "no section may exceed the cut depth");
  const total = out.sections.reduce((n, s) => n + s.layers.length, 0);
  assert(total === out.layers.length, "every layer belongs to exactly one section");
  assert(out.warnings.some(w => /cut depth|section/i.test(w)), "and the split must be called out for CS-003 §7.1.6 dowels");
});
t("a two-spike mold gives two blanks on the upper layers and one below", () => {
  const base = prism(rect(0, 0, 900, 300), 0, 25);
  const spikeA = prism(rect(50, 50, 200, 250), 0, 100);
  const spikeB = prism(rect(700, 50, 850, 250), 0, 100);
  const out = S.sliceMold(base.concat(spikeA, spikeB), [25, 25, 25, 25], {});
  assert(out.layers[0].blanks.length === 1, "the base layer is one block");
  assert(out.layers[3].blanks.length === 2, "separated spikes get their own blanks, got " + out.layers[3].blanks.length);
  assert(out.warnings.length === 0, "no warnings: " + out.warnings.join("; "));
});

console.log("choosing the boards:");
t("a stack is never proposed out of board the rack does not hold", () => {
  /* compositionCandidates used to enumerate DISTINCT thicknesses and ignore how
     many of each you own, so a rack with one 3in sheet was happily offered a
     3+3 stack. The problem then surfaced much later, on a different screen, as
     a shortfall. */
  const IN = 25.4;
  const loose = S.compositionCandidates(6 * IN, [3 * IN], {});
  assert(loose.some(c => c.length === 2), "with unlimited supply, 3+3 is on the table");
  const tight = S.compositionCandidates(6 * IN, [3 * IN], { supply: { 76.2: 1 } });
  assert(tight.every(c => c.filter(t => Math.abs(t - 3 * IN) < 0.05).length <= 1),
    "one 3in sheet cannot make a two-layer 3in stack");
});
t("no supply given means unlimited, because a new season starts with an empty rack", () => {
  const IN = 25.4;
  const c = S.compositionCandidates(4 * IN, [2 * IN], {});
  assert(c.length > 0 && c[0].length === 2, "2+2 should still be offered when stock is unknown");
});
t("how a stack is judged can be swapped out, and defaults to board volume", () => {
  /* slicer.js stays pure geometry; the app injects packer.js's moldCost so the
     choice is scored against the real rack. Asserted here so the seam does not
     rot: a scorer that says "fewest layers wins" must actually win. */
  const IN = 25.4;
  const tris = frustum(120, 60, 0, 4 * IN);
  const fewest = S.planMold(tris, [1 * IN, 2 * IN], { score: L => L.length });
  assert(fewest.layers.length === 2, "the injected scorer decides, got " + fewest.layers.length + " layers");
  const dflt = S.planMold(tris, [1 * IN, 2 * IN], {});
  assert(dflt.layers.length >= 2, "and the default still returns a real plan");
  assert(Number.isFinite(fewest.cost), "the winning score is reported so the UI can explain it");
});

t("monolithic: every layer gets the same blank, the whole mold's footprint plus margin", () => {
  /* Opt-in from the mold modal. The default steps each layer in to the mold;
     a monolithic stack is one brick around it, so the four blanks of a tapered
     plug must be one identical rectangle, and that rectangle must be the
     stepped BOTTOM blank — the widest slab already spans the mesh bounds. */
  const tris = frustum(200, 80, 0, 100);
  const stepped = S.sliceMold(tris, [25, 25, 25, 25], {});
  const mono = S.sliceMold(tris, [25, 25, 25, 25], { monolithic: true });
  assert(stepped.monolithic === false && mono.monolithic === true, "the result says which mode produced it");
  assert(mono.layers.length === 4, "a block still has one layer per board, got " + mono.layers.length);
  const key = b => [b.x0, b.y0, b.x1, b.y1].map(v => v.toFixed(4)).join(",");
  const b0 = mono.layers[0].blanks[0];
  for (const L of mono.layers) {
    assert(L.blanks.length === 1, `layer ${L.index + 1} should be one blank, got ${L.blanks.length}`);
    assert(key(L.blanks[0]) === key(b0), `layer ${L.index + 1} has a different footprint from layer 1`);
  }
  const m = S.MARGIN_MIN_MM - 1e-6, bb = mono.bounds;
  assert(b0.x0 <= bb.x0 - m && b0.x1 >= bb.x1 + m && b0.y0 <= bb.y0 - m && b0.y1 >= bb.y1 + m,
    "the block carries the full margin around the whole mold");
  const w = b0.x1 - b0.x0, q = S.BLANK_QUANTUM_MM;
  assert(Math.abs(w / q - Math.round(w / q)) < 1e-6, "the block is still sawn to the half-inch quantum");
  const top = stepped.layers[3].blanks[0];
  assert(top.x1 - top.x0 < w, "stepped: the top blank is smaller than the block, or steps would be pointless");
  assert(key(stepped.layers[0].blanks[0]) === key(b0), "stepped: the bottom blank IS the block");
  assert(!mono.warnings.some(x => /overhang/i.test(x)), "a block cannot overhang itself");
});
t("monolithic: islands collapse into the one block, and planMold carries the flag through", () => {
  const tris = prism(rect(0, 0, 900, 300), 0, 25)
    .concat(prism(rect(50, 50, 200, 250), 0, 100), prism(rect(700, 50, 850, 250), 0, 100));
  const stepped = S.sliceMold(tris, [25, 25, 25, 25], {});
  assert(stepped.layers[3].blanks.length === 2, "stepped: two spikes are two blanks up top, got " + stepped.layers[3].blanks.length);
  const mono = S.sliceMold(tris, [25, 25, 25, 25], { monolithic: true });
  assert(mono.layers.every(L => L.blanks.length === 1), "block: the spikes share one blank per layer");
  assert(mono.layers[3].islands.length === 2, "the cosmetic outlines still show both spikes inside the block");
  const IN = 25.4;
  const planned = S.planMold(frustum(120, 60, 0, 4 * IN), [1 * IN, 2 * IN], { monolithic: true });
  assert(planned.monolithic === true, "auto board choice keeps the mode");
  assert(planned.layers.every(L => L.blanks.length === 1), "and every planned layer is one blank");
  const auto = S.planMold(frustum(120, 60, 0, 4 * IN), [1 * IN, 2 * IN], {});
  assert(auto.monolithic === false, "and without the flag nothing changes");
});

console.log("CONTAINMENT — the property that matters:");
t("CRITICAL every triangle, clipped to its slab, lies inside one of that layer's blanks", () => {
  const molds = {
    "tapered plug": frustum(200, 80, 0, 100),
    "steep taper": frustum(250, 40, 0, 100),
    "two spikes on a base": prism(rect(0, 0, 900, 300), 0, 25)
      .concat(prism(rect(50, 50, 200, 250), 0, 100), prism(rect(700, 50, 850, 250), 0, 100)),
  };
  for (const [name0, tris] of Object.entries(molds)) for (const monolithic of [false, true]) {
    const name = name0 + (monolithic ? " (block)" : "");
    const out = S.sliceMold(tris, [25, 25, 25, 25], { monolithic });
    let checked = 0;
    for (const L of out.layers) {
      for (const tri of tris) {
        // Clip the OPEN slab. A layer owns (z0,z1); material lying exactly on a
        // boundary plane is the neighbouring layer's top or bottom surface and
        // is measure-zero here. Testing the closed slab would demand layer 2's
        // blank contain layer 1's top face, which is not a real requirement —
        // and a genuine violation is never 0.01mm thin, so nothing hides.
        const poly = S.clipTriangleToSlab(tri, L.z0 + 0.01, L.z1 - 0.01);
        if (poly.length < 3) continue;
        // The POLYGON must be inside a blank — not its bounding box, which
        // would false-fail when a polygon sits in one blank while its box
        // spans the gap to another.
        const ok = L.blanks.some(b => poly.every(p =>
          p.x >= b.x0 - 0.01 && p.x <= b.x1 + 0.01 && p.y >= b.y0 - 0.01 && p.y <= b.y1 + 0.01));
        assert(ok, `${name}: layer ${L.index + 1} has mold material outside every blank`);
        checked++;
      }
    }
    assert(checked > 0, name + ": nothing was actually checked");
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
