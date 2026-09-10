"use strict";
/* slicer.js — mold geometry. PURE: no DOM, no Firebase, no globals beyond the
   functions it defines. That's not tidiness, it's the point: purity is what
   lets slicer.worker.js run it off the main thread AND lets tools/test_slicer.mjs
   run it under node with no browser.

   Everything here exists to answer one question: what rectangles of tooling
   board do we saw so that, glued into a stack, the mold fits inside?

   ============================================================================
   LAYER FOOTPRINT — a union over the slab, never a section at one height
   ============================================================================

     z1 ────────────┐            Slicing at the TOP of a layer undersizes the
                    │  <- slab    blank by  thickness x tan(wall angle)  per
     z0 ──────────────┐           side. On a 50mm layer against a 45deg wall
                      │           that is 50mm per side — twice the entire
                                  margin band. The blank would not contain
                                  the mold.

     F(z) := cross-section at z, with each island's INNER contours discarded

   CS-003 §7.1.4 forbids overhangs and requires >=2 deg positive draft, so the
   solid grows monotonically DOWNWARD. Therefore:

        union over [z0,z1]  ==  F(z0)   exactly

   One slice per layer. No polygon boolean library, no sampling error. The
   standard the shop already follows is what makes the fast path correct.

   We assert that monotonicity rather than trusting it — but on 2D OUTER
   contours only. A bounding box cannot see an interior hole, so blind bottom
   dowel holes (which CS-003 §7.1.6 REQUIRES on split sections), enclosed voids
   and underside pockets cannot change any blank and must not be rejected.
   Note a "vertical ray crosses the boundary exactly twice" test is NOT
   equivalent — that is vertical convexity, strictly weaker, and it passes a
   blind hole where monotonicity genuinely fails.

   ============================================================================
   ISLANDS AND MERGING — iterate on GROUP boxes, never island boxes
   ============================================================================

     groups := one per island
     repeat to fixed point:
         if inflate(bbox(Gi)) intersects inflate(bbox(Gj)) : merge Gi, Gj

   WHY GROUP-LEVEL. Take a layer that is a U of three rails plus a central boss:

        +--------------------------+        rails merge (20mm apart) into one
        | ####################### |         group whose bbox is the WHOLE
        | ##                   ## |         envelope. The boss is 270mm from
        | ##       [boss]      ## |         every rail so it never merges — and
        | ##                   ## |         blank(boss) ends up ENTIRELY INSIDE
        | ##                   ## |         blank(rails). Two solid blocks in
        +--------------------------+        the same place. Impossible to build.

   Testing island boxes cannot see this; the collision is between GROUP boxes,
   which only exist after merging. Testing group boxes catches it on pass two.
   A frame with a central plug, a two-cavity mold with a divider, and a ribbed
   wing mold are all this shape. It is an ordinary layer, not a contrived one.

   Inflating by margin_max makes merging DECISION-INDEPENDENT: any margin later
   chosen is a subset of what was tested, so a set disjoint at margin_max stays
   disjoint. Merging therefore runs once, outside any optimizer loop.

   One rectangle per island. Never tile one island with butted rectangles — an
   L-shaped island stays one oversized rectangle, because a butted seam inside
   an island puts a glue line directly under the tool path, and that is where
   tooling board chips. */

/* All internal geometry is in MILLIMETRES. */
const MARGIN_MIN_MM = 25.4;   // 1in  — Simon: enough slop that a shifted glue-up still machines
const MARGIN_MAX_MM = 50.8;   // 2in  — top of the band; also the merge inflation
/* Blanks are sawn to a whole increment, not to the geometry. Simon: "for ease
   of cutting, remember that humans are making this. Try to make the stock boxes
   in incriments of 1/2 inch or something reasonably large so it's easier to
   cut." Nobody at RFS is cutting 486.3 x 311.8; the margin is slop anyway, so
   exactness that cannot be executed is worse than a slightly bigger blank.

   Half an inch is the starting point — 1in if it still reads as fussy at the
   saw. The number is not arbitrary in one respect: KERF_MM is exactly 1/8in,
   a quarter of this, so with every blank a multiple of 1/2in every cut position
   in the cut list lands on an eighth-inch mark measured from the edge of the
   piece in hand. Every number on the printed sheet is findable on a tape. */
const BLANK_QUANTUM_MM = 12.7;   // 1/2in
/* Contour stitching tolerance — how far apart two segment ends can be and still
   count as the same corner.

   This is a floor, not a fixed value: sliceMold scales it with the model and
   RELAXES it on failure (see stitchRelaxed). Adjacent triangles in a real export
   do not share endpoints exactly. Fusion tessellates per-surface, T-junctions
   from mesh repair leave microns of slop, and 12um gaps on a 900mm mold are
   ordinary. A hard 0.01mm rejected a perfectly good mold in production.

   How loose can it safely get? The tolerance is only ever used to decide whether
   two points are the same corner. Contours here feed three things: a bounding
   box, the monotonicity check, and a drawn outline. Blanks carry a 25.4mm
   margin, and CS-003 §7.1.5 says no machined section under 15mm survives at all.
   So welding at up to a millimetre cannot change a blank or merge two real
   features — it is 15x below the smallest thing that may exist. Past the cap,
   the mesh is genuinely broken and we say so. */
const WELD_TOL_MM = 0.05;
const MAX_WELD_TOL_MM = 1.0;
/* Deliberately NOT the weld tolerance. This one only collapses the doubled hit
   you get when a vertex lies exactly on the slice plane and both its edges
   report it — two values that are identical to within float noise. Tying it to
   the weld tolerance would mean a relaxed weld starts eating whole segments on a
   finely tessellated mesh, dropping real geometry to fix a joining problem. */
const DEDUPE_TOL_MM = 1e-4;
const MONO_TOL_MM = 0.05;     // monotonicity slack; float noise on a drafted wall is ~1e-3
/* Slice a hair ABOVE the layer floor. At z0 exactly, a flat mold base is a
   sheet of coplanar triangles that produce no crossing segments at all, so the
   bottom layer would come back empty. The induced undersize is
   SLICE_EPS x tan(wall angle) — one nanometre at 45deg — against a 25.4mm
   margin. Correctness is unaffected; emptiness would not be. */
const SLICE_EPS_MM = 1e-3;

/* ---------------- rigid frames ----------------

   The Fusion add-in can lay a mold flat on a picked bottom face before it
   exports the mesh (10 Fusion Add-in/FEBPlanStock/febframe.py). The matrix it
   used, model -> planning, rides on the plan record so anything that has to
   land back on the CAD model, the stock STL export above all, can undo it.
   Same conventions as febframe.py: 16 numbers, row-major, translation in the
   last column, column vectors, millimetres. */
function isRigidMatrix(m) {
  return Array.isArray(m) && m.length === 16 && m.every(v => typeof v === "number" && Number.isFinite(v));
}
function applyMatrix(m, x, y, z) {
  return {
    x: m[0] * x + m[1] * y + m[2] * z + m[3],
    y: m[4] * x + m[5] * y + m[6] * z + m[7],
    z: m[8] * x + m[9] * y + m[10] * z + m[11],
  };
}
function transformTris(tris, m) {
  if (!isRigidMatrix(m)) return tris;
  return tris.map(t => {
    const a = applyMatrix(m, t.ax, t.ay, t.az), b = applyMatrix(m, t.bx, t.by, t.bz), c = applyMatrix(m, t.cx, t.cy, t.cz);
    return { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, cx: c.x, cy: c.y, cz: c.z };
  });
}
/* Inverse of rotation + translation: transpose the rotation, rotate and negate
   the translation. A frame matrix is never anything else. */
function invertRigid(m) {
  const R = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  const t = [m[3], m[7], m[11]];
  const Rt = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  const ti = Rt.map(r => -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]));
  return [
    Rt[0][0], Rt[0][1], Rt[0][2], ti[0],
    Rt[1][0], Rt[1][1], Rt[1][2], ti[1],
    Rt[2][0], Rt[2][1], Rt[2][2], ti[2],
    0, 0, 0, 1,
  ];
}

/* ---------------- STL parsing ---------------- */

/* Returns { tris: [{ax,ay,az,bx,by,bz,cx,cy,cz}, ...] }.
   Binary detection is by LENGTH, not by the "solid" prefix — plenty of binary
   exporters write "solid" into the 80-byte header and trip a prefix check. */
function parseSTL(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
  if (bytes.length === 0) throw new Error("That file is empty.");
  if (bytes.length >= 84) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = dv.getUint32(80, true);
    if (bytes.length === 84 + n * 50) return { tris: parseBinarySTL(dv, n) };
  }
  const text = new TextDecoder().decode(bytes);
  if (/^\s*solid/i.test(text) && /facet/i.test(text)) return { tris: parseAsciiSTL(text) };
  throw new Error("This does not look like an STL file.");
}
function parseBinarySTL(dv, n) {
  if (n === 0) throw new Error("That STL has no triangles in it.");
  const tris = new Array(n);
  let o = 84;
  for (let i = 0; i < n; i++) {
    o += 12; // skip the stored normal — we recompute what we need
    tris[i] = {
      ax: dv.getFloat32(o, true), ay: dv.getFloat32(o + 4, true), az: dv.getFloat32(o + 8, true),
      bx: dv.getFloat32(o + 12, true), by: dv.getFloat32(o + 16, true), bz: dv.getFloat32(o + 20, true),
      cx: dv.getFloat32(o + 24, true), cy: dv.getFloat32(o + 28, true), cz: dv.getFloat32(o + 32, true),
    };
    o += 36 + 2;
  }
  return tris;
}
function parseAsciiSTL(text) {
  const tris = [];
  const re = /vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g;
  const v = [];
  let m;
  while ((m = re.exec(text))) {
    v.push(+m[1], +m[2], +m[3]);
    if (v.length === 9) {
      tris.push({ ax: v[0], ay: v[1], az: v[2], bx: v[3], by: v[4], bz: v[5], cx: v[6], cy: v[7], cz: v[8] });
      v.length = 0;
    }
  }
  if (!tris.length) throw new Error("That STL has no triangles in it.");
  return tris;
}

/* Scale every triangle into millimetres. STL carries no units, so the caller
   must say which it is — guessing is how a mold comes out 25.4x wrong. */
function scaleTris(tris, unit) {
  const k = unit === "mm" ? 1 : 25.4;
  if (k === 1) return tris;
  return tris.map(t => ({
    ax: t.ax * k, ay: t.ay * k, az: t.az * k,
    bx: t.bx * k, by: t.by * k, bz: t.bz * k,
    cx: t.cx * k, cy: t.cy * k, cz: t.cz * k,
  }));
}
function meshBounds(tris) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const t of tris) {
    x0 = Math.min(x0, t.ax, t.bx, t.cx); x1 = Math.max(x1, t.ax, t.bx, t.cx);
    y0 = Math.min(y0, t.ay, t.by, t.cy); y1 = Math.max(y1, t.ay, t.by, t.cy);
    z0 = Math.min(z0, t.az, t.bz, t.cz); z1 = Math.max(z1, t.az, t.bz, t.cz);
  }
  return { x0, y0, z0, x1, y1, z1 };
}

/* ShopSabre max cut depth, CS-005 §5. A stack taller than this cannot be
   machined in one go and must be split into sections with alignment features
   (CS-003 §7.1.6). Real molds exceed it routinely — four of the eight largest
   bodies in the SN5 undertray export are 8-10.6in tall. */
const MAX_CUT_DEPTH_MM = 152.4;   // 6in

/* ---------------- bodies ----------------

   A real Fusion STL export is often an ASSEMBLY, not one solid. The SN5
   undertray file is 31 separate bodies scattered over 8.7m of assembly space:
   taking the whole file's bounding box would slice a nine-metre void and
   produce nonsense. Split first, then let the user plan one body at a time. */

/* Union-find over triangles sharing a welded vertex. Returns bodies sorted
   largest-first by triangle count, each { tris, bounds }. */
function splitBodies(tris, tol) {
  const t = tol || WELD_TOL_MM;
  const parent = new Int32Array(tris.length);
  for (let i = 0; i < tris.length; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const seen = new Map();
  const key = (x, y, z) => `${Math.round(x / t)},${Math.round(y / t)},${Math.round(z / t)}`;
  tris.forEach((tri, i) => {
    for (const [x, y, z] of [[tri.ax, tri.ay, tri.az], [tri.bx, tri.by, tri.bz], [tri.cx, tri.cy, tri.cz]]) {
      const k = key(x, y, z);
      if (seen.has(k)) union(seen.get(k), i); else seen.set(k, i);
    }
  });
  const groups = new Map();
  tris.forEach((tri, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(tri);
  });
  return [...groups.values()]
    .map(g => ({ tris: g, bounds: meshBounds(g) }))
    .sort((a, b) => b.tris.length - a.tris.length);
}

/* A plain rectangular prism, so "I just want a 12 x 8 x 4 block" goes through
   the IDENTICAL pipeline as a sliced STL — same layers, same blanks, same cut
   list, same stack view. A separate box code path would be a second thing to
   keep correct, and this is four lines. Walls only: a cap never crosses a slice
   plane, so it cannot contribute a contour. */
function boxTris(lenMm, widMm, hgtMm) {
  const p = [{ x: 0, y: 0 }, { x: lenMm, y: 0 }, { x: lenMm, y: widMm }, { x: 0, y: widMm }];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, a = p[i], b = p[j];
    out.push({ ax: a.x, ay: a.y, az: 0, bx: b.x, by: b.y, bz: 0, cx: b.x, cy: b.y, cz: hgtMm });
    out.push({ ax: a.x, ay: a.y, az: 0, bx: b.x, by: b.y, bz: hgtMm, cx: a.x, cy: a.y, cz: hgtMm });
  }
  return out;
}

/* ---------------- slicing ---------------- */

/* Intersect every triangle with the plane z, returning boundary segments.
   Triangles wholly above, wholly below, or coplanar contribute nothing — a
   coplanar face has no crossing, and its boundary is carried by the
   neighbouring faces that do cross. */
function sliceAt(tris, z) {
  const segs = [];
  for (const t of tris) {
    const p = [
      { x: t.ax, y: t.ay, z: t.az },
      { x: t.bx, y: t.by, z: t.bz },
      { x: t.cx, y: t.cy, z: t.cz },
    ];
    let above = 0, below = 0;
    for (const q of p) { if (q.z > z) above++; else if (q.z < z) below++; }
    if (above === 3 || below === 3) continue;
    if (above === 0 && below === 0) continue; // coplanar
    const hits = [];
    for (let i = 0; i < 3; i++) {
      const a = p[i], b = p[(i + 1) % 3];
      if ((a.z > z && b.z > z) || (a.z < z && b.z < z)) continue;
      if (a.z === b.z) continue;
      const s = (z - a.z) / (b.z - a.z);
      if (s < 0 || s > 1) continue;
      hits.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });
    }
    // Dedupe a vertex that sits exactly on the plane and so is found twice.
    const uniq = [];
    for (const h of hits) {
      if (!uniq.some(u => Math.abs(u.x - h.x) < DEDUPE_TOL_MM && Math.abs(u.y - h.y) < DEDUPE_TOL_MM)) uniq.push(h);
    }
    if (uniq.length === 2) segs.push([uniq[0], uniq[1]]);
  }
  return segs;
}

/* Walk segments into closed loops. A tessellated mesh never has bit-identical
   shared vertices — the same corner reached from two triangles differs by float
   noise — so endpoints are welded within a tolerance.

   Endpoints are BUCKETED on a grid for speed, but matching ALWAYS searches the
   3x3 neighbourhood and confirms by real distance. Requiring an exact cell match
   is a trap that looks correct and is not: two points a millionth of a
   millimetre apart land in different cells whenever they straddle a cell
   boundary, and a perfectly good mesh then reports a gap. Real molds hit this
   constantly because designers put corners on round numbers, and round numbers
   are exactly where grid boundaries sit. */
function stitchContours(segs, tol) {
  tol = tol || WELD_TOL_MM;
  const cell = p => [Math.floor(p.x / tol), Math.floor(p.y / tol)];
  const buckets = new Map();
  const put = (p, rec) => {
    const [i, j] = cell(p);
    const k = i + "," + j;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(rec);
  };
  segs.forEach((s, i) => {
    put(s[0], { i, from: s[0], to: s[1] });
    put(s[1], { i, from: s[1], to: s[0] });
  });
  const used = new Array(segs.length).fill(false);
  /* Nearest unused endpoint within tol. Returns { rec, dist } so the caller can
     report HOW FAR the nearest edge was — the difference between "your
     tolerance is too tight" and "this mesh genuinely has a hole in it". */
  const nearest = (p) => {
    const [ci, cj] = cell(p);
    let best = null, bestD = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const rec of buckets.get((ci + di) + "," + (cj + dj)) || []) {
          if (used[rec.i]) continue;
          const d = Math.hypot(rec.from.x - p.x, rec.from.y - p.y);
          if (d < bestD) { bestD = d; best = rec; }
        }
      }
    }
    return { rec: best, dist: bestD };
  };
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const start = segs[i][0];
    const pts = [start, segs[i][1]];
    let cur = segs[i][1];
    let guard = segs.length + 2;
    while (guard-- > 0) {
      if (Math.hypot(cur.x - start.x, cur.y - start.y) <= tol) break;
      const { rec, dist } = nearest(cur);
      if (!rec || dist > tol) {
        // Error path only: the bucket search reaches ~3 cells, so a genuinely
        // large hole finds nothing nearby and we'd have no distance to report.
        // The distance is the whole diagnostic — 0.0001mm means the tolerance is
        // too tight, 5mm means the mesh is broken — so pay for a full scan here.
        let far = Infinity;
        for (let k = 0; k < segs.length; k++) {
          if (used[k]) continue;
          for (const p of segs[k]) far = Math.min(far, Math.hypot(p.x - cur.x, p.y - cur.y));
        }
        const how = Number.isFinite(far)
          ? ` The nearest loose edge is ${far < 0.01 ? far.toExponential(1) : far.toFixed(3)}mm away, past the ${tol}mm join tolerance.`
          : " No edge continues from there at all.";
        throw new Error(`This mesh has a hole near X ${cur.x.toFixed(2)}, Y ${cur.y.toFixed(2)} — the outline does not close.${how} Re-export the STL from Fusion, or run a mesh repair on it.`);
      }
      used[rec.i] = true;
      cur = rec.to;
      pts.push(cur);
    }
    if (pts.length >= 4) loops.push(pts);
  }
  return loops;
}

/* Stitch, and if the mesh is slightly noisier than expected, loosen and retry
   rather than refusing the job. Doubling from the floor to the cap is four
   attempts, all cheap, and the cap is what keeps this honest: a mesh that still
   won't close at 1mm has a real hole, not float noise.

   Returns { loops, tol } so the caller can tell the user their export needed
   loosening — a mold that welds at 0.8mm is machinable but its STL is rough,
   and that is worth knowing before it happens again. */
function stitchRelaxed(segs, baseTol) {
  let tol = baseTol || WELD_TOL_MM;
  let last = null;
  let triedCap = false;
  while (true) {
    try { return { loops: stitchContours(segs, tol), tol }; }
    catch (e) { last = e; }
    if (triedCap) throw last;
    tol *= 2;
    // Doubling overshoots the cap (0.05 -> ... -> 0.8 -> 1.6), which would make
    // the real limit 0.8mm while the constant claims 1mm. Clamp the last attempt
    // so the documented cap is the actual cap.
    if (tol >= MAX_WELD_TOL_MM) { tol = MAX_WELD_TOL_MM; triedCap = true; }
  }
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/* Keep only loops nested inside nothing: those are the islands. Holes and any
   island-inside-a-hole are dropped, which is exactly right because a bounding
   box cannot see them anyway. */
function outerContours(loops) {
  return loops.filter((l, i) =>
    !loops.some((o, j) => j !== i && Math.abs(polyArea(o)) > Math.abs(polyArea(l)) && pointInPoly(l[0], o)));
}

/* ---------------- boxes ---------------- */

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}
function unionBox(a, b) {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}
function inflateBox(b, m) { return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m }; }
function boxesOverlap(a, b) { return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1; }
function boxContains(outer, inner, tol) {
  tol = tol || 0;
  return inner.x0 >= outer.x0 - tol && inner.y0 >= outer.y0 - tol
      && inner.x1 <= outer.x1 + tol && inner.y1 <= outer.y1 + tol;
}
function boxW(b) { return b.x1 - b.x0; }
function boxH(b) { return b.y1 - b.y0; }

/* Merge islands whose INFLATED GROUP boxes touch. See the header diagram for
   why this iterates on groups rather than islands — testing island boxes lets
   a blank end up inside another blank. */
function mergeToFixedPoint(islands, inflate) {
  const infl = inflate == null ? MARGIN_MAX_MM : inflate;
  let groups = islands.map((is, i) => ({ members: [i], box: is.box }));
  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (boxesOverlap(inflateBox(groups[i].box, infl), inflateBox(groups[j].box, infl))) {
          groups[i] = { members: groups[i].members.concat(groups[j].members), box: unionBox(groups[i].box, groups[j].box) };
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

/* Phase 1 uses a single fixed margin. The elastic band (any value in
   [MARGIN_MIN, MARGIN_MAX], chosen per blank so pieces share saw strips) is the
   optimizer's job in phase 2; its nesting and datum rules live in the design
   doc. Minimum applies on all four sides — a shifted glue-up needs slop
   everywhere, not on one edge. */
function applyMargin(box, margin, quantum, anchor) {
  const m = margin == null ? MARGIN_MIN_MM : margin;
  const q = quantum == null ? BLANK_QUANTUM_MM : quantum;
  const b = inflateBox(box, m);
  /* WITH AN ANCHOR: every edge snaps OUTWARD onto one lattice of saw
     increments shared by the whole plan, anchored on the bottom blank's
     corner. This is what makes the layers of a stack line up. Without it each
     layer was rounded on its own and centred on its own slab box, so a
     drafted wall that shrinks the box by a couple of millimetres per layer
     shifted every layer's edges by a fraction of an increment: not flush, not
     a real step, and a corner that visibly did not overlay (Simon,
     2026-09-09, on a two-layer plan drawn in Fusion). On the lattice,
     equal-size layers coincide exactly and a step is a whole half-inch. Width
     is still a multiple of q, since it is a difference of two lattice
     values, and outward snapping only ever adds margin. */
  if (anchor && q > 0) {
    const snapDown = (v, a) => a + Math.floor((v - a) / q + 1e-6) * q;
    const snapUp = (v, a) => a + Math.ceil((v - a) / q - 1e-6) * q;
    return { x0: snapDown(b.x0, anchor.x), y0: snapDown(b.y0, anchor.y), x1: snapUp(b.x1, anchor.x), y1: snapUp(b.y1, anchor.y) };
  }
  /* No anchor (the bottom blank, which DEFINES the lattice): grown
     symmetrically, so the mold stays centred in its blank and the margin
     added by rounding is shared between opposite edges rather than dumped on
     one. Only the blank's SIZE is quantised; its datum offset is a machining
     number, not something anybody measures with a tape. */
  const gw = (quantizeUp(boxW(b), q) - boxW(b)) / 2;
  const gh = (quantizeUp(boxH(b), q) - boxH(b)) / 2;
  return { x0: b.x0 - gw, y0: b.y0 - gh, x1: b.x1 + gw, y1: b.y1 + gh };
}
/* Round UP to the next increment. Up, never down — this only ever adds margin,
   so a quantised blank can never stop containing the mold. The epsilon absorbs
   the float noise in a value that is already an exact multiple. */
function quantizeUp(v, q) {
  return q > 0 ? Math.ceil(v / q - 1e-6) * q : v;
}

/* ---------------- monotonicity ---------------- */

/* Assert F(lower) contains F(upper). Vertex-sampled: every vertex of every
   upper island must lie inside some lower island. Honest limitation — an edge
   could in principle bulge out between two vertices without either vertex
   escaping; on a tessellated mesh vertices are dense enough that this does not
   happen in practice, and the containment test in tools/test_slicer.mjs is the
   real guard. Returns null when fine, or { region } naming where it broke. */
function checkMonotone(lowerIslands, upperIslands, tol) {
  const t = tol == null ? MONO_TOL_MM : tol;
  for (const up of upperIslands) {
    for (const p of up.contour) {
      const ok = lowerIslands.some(lo =>
        pointInPoly(p, lo.contour) || nearBoundary(p, lo.contour, t));
      if (!ok) return { region: { x: p.x, y: p.y } };
    }
  }
  return null;
}
function nearBoundary(pt, poly, tol) {
  for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
    if (distToSeg(pt, poly[j], poly[i]) <= tol) return true;
  }
  return false;
}
function distToSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  if (L === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L;
  s = Math.max(0, Math.min(1, s));
  return Math.hypot(p.x - (a.x + s * dx), p.y - (a.y + s * dy));
}

/* ---------------- simplification ---------------- */

/* Douglas-Peucker. Saved plans go into a Firestore document with a hard 1 MB
   ceiling, and a raw tessellated outline across eight layers will approach it.
   A silent write failure is the worst outcome available, so contours are
   simplified before they are ever stored. */
function simplify(pts, eps) {
  if (pts.length <= 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let far = -1, fd = eps;
    for (let i = s + 1; i < e; i++) {
      const d = distToSeg(pts[i], pts[s], pts[e]);
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = true; stack.push([s, far], [far, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* ---------------- containment (test helper, and worth having at runtime) ----

   Clip a triangle to the slab z in [z0,z1] and return the XY polygon of what
   survives. The containment test checks THAT POLYGON — not its bounding box,
   which false-fails whenever a polygon sits inside one blank while its box
   spans the gap between two disjoint blanks.

   The two naive alternatives are both wrong and both tempting:
     - "is every vertex with z in the slab inside a blank" is UNSOUND: a
       triangle can cross the slab with no vertex inside it at all.
     - "check all three vertices of any triangle overlapping the slab" is
       conservative but FALSE-FAILS on drafted walls, which is the geometry
       molds are actually made of: a tall wall triangle spanning three layers
       gets tested against the top layer's small blanks using its wide bottom
       vertex. */
function clipTriangleToSlab(tri, z0, z1) {
  let poly = [
    { x: tri.ax, y: tri.ay, z: tri.az },
    { x: tri.bx, y: tri.by, z: tri.bz },
    { x: tri.cx, y: tri.cy, z: tri.cz },
  ];
  poly = clipHalf(poly, p => p.z >= z0, z0);
  poly = clipHalf(poly, p => p.z <= z1, z1);
  return poly.map(p => ({ x: p.x, y: p.y }));
}
function clipHalf(poly, inside, zPlane) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const cur = poly[i], prev = poly[(i + n - 1) % n];
    const ci = inside(cur), pi = inside(prev);
    if (ci !== pi) {
      const s = (zPlane - prev.z) / (cur.z - prev.z);
      out.push({ x: prev.x + (cur.x - prev.x) * s, y: prev.y + (cur.y - prev.y) * s, z: zPlane });
    }
    if (ci) out.push(cur);
  }
  return out;
}

/* ---------------- exact slab boxes (the robust path) ----------------

   The monotone fast path (union over a slab == section at its bottom) is an
   OPTIMISATION, not a requirement. It buys a pretty contour cheaply. But real
   molds break it: in the SN5 undertray export, body #1 flares 85mm outward
   above its base and body #3 flares 680mm. Those bodies are still perfectly
   real objects that need blanks — refusing them was the wrong call.

   A blank only has to CONTAIN the mold. That can be computed EXACTLY, with no
   assumption about draft at all, because we only ever need boxes:

       for every triangle: clip it to the slab, take the XY box of what survives
       merge overlapping boxes -> islands

   No sampling (so no missed geometry between planes), no polygon booleans, and
   it is the same clip the containment test uses to verify the answer.

   Merging 40k triangle boxes pairwise would be O(n^2), so occupancy is
   rasterised onto a grid of cell size = the merge inflation and connected cells
   are grouped. A grid is slightly MORE eager to merge than the exact rule,
   which is the safe direction: fewer, larger blanks, never a collision. */
function slabBoxes(tris, z0, z1, inflate) {
  const infl = inflate == null ? MARGIN_MAX_MM : inflate;
  const cell = Math.max(infl, 1);
  const cells = new Map();      // "i,j" -> box of everything touching that cell
  const grow = (b, p) => {
    b.x0 = Math.min(b.x0, p.x); b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x); b.y1 = Math.max(b.y1, p.y);
  };
  for (const t of tris) {
    const poly = clipTriangleToSlab(t, z0, z1);
    if (!poly.length) continue;
    const b = bboxOf(poly);
    const i0 = Math.floor(b.x0 / cell), i1 = Math.floor(b.x1 / cell);
    const j0 = Math.floor(b.y0 / cell), j1 = Math.floor(b.y1 / cell);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = i + "," + j;
        let c = cells.get(k);
        if (!c) { c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, i, j }; cells.set(k, c); }
        grow(c, { x: b.x0, y: b.y0 }); grow(c, { x: b.x1, y: b.y1 });
      }
    }
  }
  if (!cells.size) return [];
  // Connected components of occupied cells, 8-connected.
  const keys = [...cells.keys()];
  const seen = new Set();
  const groups = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const stack = [k];
    seen.add(k);
    let box = null;
    while (stack.length) {
      const cur = cells.get(stack.pop());
      box = box ? unionBox(box, cur) : { x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: cur.y1 };
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const nk = (cur.i + di) + "," + (cur.j + dj);
          if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
    }
    groups.push({ box, members: [groups.length] });
  }
  // Enforce the exact merge rule on the handful of groups that survive.
  return mergeToFixedPoint(groups.map(g => ({ box: g.box })), infl);
}

/* ---------------- choosing the boards ----------------

   Simon, on the first version: "I had to pick the thicknesses myself, so I
   don't really know what the purpose of the slicer was." Fair. Picking the
   stack by hand is most of the thinking, and it is exactly the part a machine
   should do — it can try every combination the rack actually holds and measure
   which one wastes least, which a person cannot do by eye. */

/* Multisets of available thicknesses that reach the mold height. Ordered
   thick-at-bottom and thin-at-bottom are BOTH emitted, because order changes
   where the slices land and therefore how well the steps follow the taper. */
function compositionCandidates(heightMm, thicknesses, opts) {
  opts = opts || {};
  const maxLayers = opts.maxLayers || 8;
  const avail = [...new Set(thicknesses)].filter(t => t > 0).sort((a, b) => b - a);
  if (!avail.length) return [];
  const maxOver = opts.maxOvershoot == null ? avail[0] : opts.maxOvershoot;
  /* How many boards of each thickness the rack actually holds. Without this,
     a rack with ONE 3in sheet is happily offered a 3+3 stack, and the problem
     only surfaces later as a shortfall on a different screen. Absent, supply is
     unlimited — which is the right answer when nobody has entered stock yet. */
  const supply = opts.supply || null;
  const cap = supply
    ? avail.map(t => Number(supply[Math.round(t * 10) / 10]) || 0)
    : avail.map(() => Infinity);
  const used = avail.map(() => 0);
  const found = [];
  const seen = new Set();
  (function walk(start, sum, picked) {
    if (found.length > 400) return;
    if (sum >= heightMm - 1e-6) {
      if (sum - heightMm <= maxOver) {
        const k = [...picked].sort((a, b) => a - b).join(",");
        if (!seen.has(k)) { seen.add(k); found.push([...picked]); }
      }
      return;
    }
    if (picked.length >= maxLayers) return;
    for (let i = start; i < avail.length; i++) {
      if (used[i] >= cap[i]) continue;
      picked.push(avail[i]); used[i]++;
      walk(i, sum + avail[i], picked);
      picked.pop(); used[i]--;
    }
  })(0, 0, []);
  // Least overshoot first, then fewest boards: both are real costs (wasted
  // board, and a 4h clamp cycle per glue joint).
  found.sort((a, b) => {
    const oa = a.reduce((s, v) => s + v, 0) - heightMm, ob = b.reduce((s, v) => s + v, 0) - heightMm;
    return (oa - ob) || (a.length - b.length);
  });
  const out = [];
  for (const m of found.slice(0, opts.maxCandidates || 8)) {
    const desc = [...m].sort((a, b) => b - a);
    const asc = [...m].sort((a, b) => a - b);
    out.push(desc);
    if (asc.join() !== desc.join()) out.push(asc);
  }
  return out;
}

/* Board VOLUME consumed by a sliced result — the honest material cost. Blank
   area alone would rank a thin wide layer as cheap as a thick narrow one. */
function boardVolume(layers) {
  let v = 0;
  for (const L of layers) for (const b of L.blanks) v += boxW(b) * boxH(b) * L.thickness;
  return v;
}

/* Thin boards ALWAYS win on volume alone: each layer's blank only has to cover
   the union over its own slab, so subdividing can never use more board. Left
   unchecked the planner would pick the thinnest stack every time and hand the
   shop eight glue joints — and CS-003 §7.3 is a 4h clamp minimum per glue-up.
   So an extra layer has to pay for itself in saved board.

   The constant is what one extra glue joint is "worth" in board volume: about
   2% of a 4x8ft x 1in sheet. It is a starting point, not physics — tune it once
   somebody has glued a few stacks and has an opinion. */
const LAYER_PENALTY_MM3 = 1.5e6;
function compositionScore(layers, layerPenalty) {
  const pen = layerPenalty == null ? LAYER_PENALTY_MM3 : layerPenalty;
  return boardVolume(layers) + layers.length * pen;
}

/* ---------------- sections (the 6in rule) ----------------

   A stack taller than the machine's cut depth is split into sections, and the
   split can only fall on a BOARD boundary — you cannot machine half a board
   off. Each section is machined separately, then stacked with dowels per
   CS-003 §7.1.6. */
function sectionize(layers, maxDepth) {
  const cap = maxDepth || MAX_CUT_DEPTH_MM;
  const sections = [];
  let cur = [];
  let h = 0;
  for (const L of layers) {
    if (cur.length && h + L.thickness > cap + 1e-6) { sections.push({ layers: cur, height: h }); cur = []; h = 0; }
    cur.push(L);
    h += L.thickness;
  }
  if (cur.length) sections.push({ layers: cur, height: h });
  sections.forEach((s, i) => { s.index = i; s.layers.forEach(L => { L.section = i; }); });
  return sections;
}

/* ---------------- top level ---------------- */

/* Slice a mold into layers.
     tris        — triangles already in mm (see scaleTris)
     thicknesses — ordered bottom-to-top, in mm; must cover the mold height
     opts        — { margin, inflate, simplifyEps, onProgress, monolithic }
   Returns { layers, bounds, warnings, monolithic }. Throws with a human sentence on a bad
   mesh; the message is shown to whoever picked the file. */
/* Slice with the boards chosen automatically from what the rack holds.
   Evaluates each candidate by actually slicing it and keeping the one that
   consumes least board volume, then sections it for the 6in cut depth.
   Returns the same shape as sliceMold plus { composition, considered }. */
function planMold(tris, availableThicknessesMm, opts) {
  opts = opts || {};
  const bounds = meshBounds(tris);
  const height = bounds.z1 - bounds.z0;
  const cands = compositionCandidates(height, availableThicknessesMm, opts);
  /* How a candidate is judged. The default is the volume heuristic below, which
     cannot see the rack; the app injects packer.js's moldCost instead, which
     scores by actually packing the blanks onto the boards we own. Injected
     rather than imported so slicer.js stays pure geometry with no dependencies
     — that is what lets test_slicer.mjs eval it standalone. */
  const score = typeof opts.score === "function"
    ? opts.score
    : (layers => compositionScore(layers, opts.layerPenalty));
  if (!cands.length) {
    throw new Error(`No combination of the board thicknesses you have on the rack reaches ${(height / 25.4).toFixed(2)}in. Add thicker stock, or add more of what you have.`);
  }
  let best = null, bestVol = Infinity, bestComp = null;
  const errors = [];
  const tried = [];
  for (const comp of cands) {
    try {
      const r = sliceMold(tris, comp, { ...opts, simplifyEps: opts.scoreEps == null ? 1 : opts.scoreEps });
      const v = score(r.layers);
      tried.push({ composition: comp, cost: v, joints: Math.max(0, r.layers.length - 1) });
      /* A challenger has to beat the incumbent by a real margin, not by float
         noise. Board opening is discrete, so the objective is steppy and a
         hairline win flips the answer when somebody adds one board to the rack.
         Candidates arrive least-overshoot-then-fewest-boards first, so a tie
         resolves toward the simpler stack and the same rack gives the same
         plan twice. */
      if (v < bestVol * (1 - 0.005)) { bestVol = v; best = r; bestComp = comp; }
      else if (best === null) { bestVol = v; best = r; bestComp = comp; }
    } catch (e) { errors.push(e); }
  }
  // Every candidate failing is a property of the MOLD (an overhang), not of the
  // board choice — surface the real reason rather than "nothing worked".
  if (!best) throw errors[0] || new Error("Could not slice this mold with any available board combination.");
  // Re-slice the winner at full fidelity; scoring ran coarse for speed.
  const final = sliceMold(tris, bestComp, opts);
  final.composition = bestComp;
  final.considered = cands.length;
  final.cost = bestVol;
  /* The three runners-up, so the plan page can say WHY these boards rather
     than asserting it. Without that the exchange rate between a glue joint and
     a sheet of board is unfalsifiable and will never get tuned. */
  final.alternatives = tried
    .filter(x => x.composition !== bestComp)
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 3)
    .map(x => ({ composition: x.composition, cost: x.cost, joints: x.joints }));
  final.boardVolumeMm3 = boardVolume(final.layers);
  return final;
}

function sliceMold(tris, thicknesses, opts) {
  opts = opts || {};
  const margin = opts.margin == null ? MARGIN_MIN_MM : opts.margin;
  const inflate = opts.inflate == null ? MARGIN_MAX_MM : opts.inflate;
  const eps = opts.simplifyEps == null ? 0.2 : opts.simplifyEps;
  const bounds = meshBounds(tris);
  /* MONOLITHIC — one footprint for every layer.

     The default steps each layer in to the mold: a layer's blank only covers
     the union over its own slab, so a tapered plug gets smaller boards up top
     and the glued stack is a staircase. That saves board, and it is what the
     planner scores. A monolithic stack instead gives every layer the SAME
     rectangle, the whole mold's XY bounds plus margin, so the glue-up is one
     rectangular brick around the mold: more board, but nothing to line up
     between layers, every slab is supported by the full one below it, and the
     stock body CAM sees is a plain box. Opt-in, from the mold modal.

     The block is a superset of every stepped blank (each slab box lies inside
     the mesh bounds), so containment holds by construction and the same
     containment test in tools/test_slicer.mjs covers both modes. Islands in a
     layer collapse into the one block too; that is the point, not a loss.
     Sections, kerf and the cut list are untouched: a monolithic layer is still
     one rectangle per board, packed onto sheets with the same straight-through
     cuts as any other blank. */
  const mono = !!opts.monolithic;
  const fullBox = { x0: bounds.x0, y0: bounds.y0, x1: bounds.x1, y1: bounds.y1 };
  /* The lattice every blank in this plan snaps to (see applyMargin): the
     corner of the mold's whole footprint, margined and rounded symmetrically.
     For a drafted mold that IS the bottom blank, unchanged from before; the
     upper layers now land on its grid instead of drifting. */
  const anchorBox = applyMargin(fullBox, margin);
  const anchor = { x: anchorBox.x0, y: anchorBox.y0 };
  const total = thicknesses.reduce((a, b) => a + b, 0);
  const height = bounds.z1 - bounds.z0;
  const warnings = [];
  if (total < height - 1e-6) throw new Error(`The chosen boards add up to ${total.toFixed(1)}mm but the mold is ${height.toFixed(1)}mm tall.`);

  const layers = [];
  let z = bounds.z0;
  let prevIslands = null;
  let usedTol = 0;          // highest weld tolerance any layer needed, 0 if none did
  let contourFailures = 0;  // layers whose cosmetic outline could not be stitched
  let draftWarning = null;  // first CS-003 §7.1.4 draft violation seen, if any
  for (let i = 0; i < thicknesses.length; i++) {
    const z0 = z, z1 = z + thicknesses[i];
    z = z1;
    if (z0 >= bounds.z1) break; // composition overshoots the mold; extra boards unused

    /* BLANKS come from the exact slab clip — no draft assumption, so an
       overhung mold still gets a correct blank instead of a refusal. */
    const groups = mono
      ? [{ box: fullBox, members: [0] }]
      : slabBoxes(tris, z0, Math.min(z1, bounds.z1), inflate);
    if (!groups.length) throw new Error(`Layer ${i + 1} came out empty — the mold may not sit flat on Z.`);
    const blanks = groups.map(g => applyMargin(g.box, margin, undefined, anchor));

    /* CONTOURS are cosmetic: they draw the mold outline inside the block so a
       reviewer can see the fit. Best-effort — a rough or overhung mesh that
       cannot be stitched must not cost anyone their cut list. */
    let islands = [];
    try {
      const st = stitchRelaxed(sliceAt(tris, z0 + SLICE_EPS_MM), WELD_TOL_MM);
      if (st.tol > WELD_TOL_MM) usedTol = Math.max(usedTol, st.tol);
      islands = outerContours(st.loops).map(c => {
        const contour = simplify(c, eps);
        return { contour, box: bboxOf(contour) };
      });
    } catch (e) { contourFailures++; }

    /* Draft is now a DESIGN-REVIEW finding, not a hard stop. CS-003 §7.1.4 says
       a mold needs positive draft to be machined in 3 axes, and that is worth
       telling the designer — but it is their call, and it does not change what
       board we saw. */
    if (prevIslands && prevIslands.length && islands.length && !draftWarning) {
      const bad = checkMonotone(prevIslands, islands, MONO_TOL_MM);
      if (bad) draftWarning = { ...bad.region, layer: i + 1 };
    }
    layers.push({
      index: i, z0, z1, thickness: thicknesses[i],
      islands, groups: groups.map(g => ({ box: g.box, count: g.members.length })), blanks,
    });
    prevIslands = islands;
    if (opts.onProgress) opts.onProgress((i + 1) / thicknesses.length);
  }

  // Support: every blank should sit on material below it. With a drafted mold
  // this is automatic; with an overhung one it genuinely is not, and the person
  // gluing needs to know which layer hangs over air.
  for (let i = 1; i < layers.length; i++) {
    for (const up of layers[i].blanks) {
      if (!layers[i - 1].blanks.some(lo => boxContains(lo, up, MONO_TOL_MM))) {
        warnings.push(`Layer ${i + 1} has a blank that overhangs the layer below it — support it during glue-up so it cannot sag or shift.`);
        break;
      }
    }
  }
  if (draftWarning) {
    warnings.push(`This mold has an overhang or negative draft near X ${draftWarning.x.toFixed(0)}, Y ${draftWarning.y.toFixed(0)} (layer ${draftWarning.layer}). CS-003 §7.1.4 wants positive draft for 3-axis machining — check it in CAD before booking the ShopSabre. The blanks below are still correct and contain the mold.`);
  }
  if (contourFailures) {
    warnings.push(`${contourFailures} layer${contourFailures > 1 ? "s" : ""} could not draw a mold outline (rough mesh), so the stack view shows blocks only. Blank sizes are computed from the mesh directly and are unaffected.`);
  }
  // No two blanks in a layer may occupy the same place.
  for (const L of layers) {
    for (let a = 0; a < L.blanks.length; a++) {
      for (let b = a + 1; b < L.blanks.length; b++) {
        if (boxesOverlap(L.blanks[a], L.blanks[b])) warnings.push(`Layer ${L.index + 1} produced two blanks that overlap.`);
      }
    }
  }
  if (usedTol > 0) {
    warnings.push(`This STL is rough: outlines only closed after loosening the join tolerance to ${usedTol}mm (normally ${WELD_TOL_MM}mm). The blanks are unaffected — the tolerance is far below anything CS-003 lets a mold contain — but a finer Fusion export would be cleaner.`);
  }

  // Split for the machine's cut depth. This is not advisory: a stack over 6in
  // cannot be machined in one setup, and CS-003 §7.1.6 wants the split designed
  // in rather than improvised at the bed.
  const maxDepth = opts.maxCutDepth == null ? MAX_CUT_DEPTH_MM : opts.maxCutDepth;
  const sections = sectionize(layers, maxDepth);
  if (sections.length > 1) {
    warnings.push(`This mold is ${((bounds.z1 - bounds.z0) / 25.4).toFixed(2)}in tall, past the ShopSabre's ${(maxDepth / 25.4).toFixed(0)}in cut depth, so it is split into ${sections.length} sections machined separately. Design dowel and datum features into the mating faces in CAD — do not improvise them at the machine.`);
  }
  const tooThick = layers.find(L => L.thickness > maxDepth + 1e-6);
  if (tooThick) warnings.push(`Layer ${tooThick.index + 1} is a single board ${(tooThick.thickness / 25.4).toFixed(2)}in thick, deeper than the machine can cut. Use thinner boards for that layer.`);

  return { layers, sections, bounds, warnings, monolithic: mono };
}

/* Node (tests) and the Worker both need these; the browser gets them as
   globals from the classic script tag. */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseSTL, scaleTris, meshBounds, sliceAt, stitchContours, outerContours,
    polyArea, pointInPoly, bboxOf, unionBox, inflateBox, boxesOverlap, boxContains,
    boxW, boxH, mergeToFixedPoint, applyMargin, checkMonotone, simplify,
    clipTriangleToSlab, sliceMold, quantizeUp, isRigidMatrix, applyMatrix, transformTris, invertRigid,
    stitchRelaxed, splitBodies, boxTris, slabBoxes, compositionCandidates, compositionScore, sectionize, planMold, boardVolume,
    MARGIN_MIN_MM, MARGIN_MAX_MM, BLANK_QUANTUM_MM, WELD_TOL_MM, MAX_WELD_TOL_MM, DEDUPE_TOL_MM, SLICE_EPS_MM, MAX_CUT_DEPTH_MM,
  };
}
