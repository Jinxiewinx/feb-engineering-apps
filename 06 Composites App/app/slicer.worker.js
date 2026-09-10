"use strict";
/* slicer.worker.js — runs slicer.js off the main thread.
   A mold STL is commonly 10^5-10^6 triangles; parse + slice + stitch is seconds
   of work. render() in core.js is fully synchronous, so doing this inline
   freezes the whole tab with no spinner — the app has no spinner infrastructure
   to borrow because nothing else in it ever blocks.

   This file is deliberately thin. All the geometry lives in slicer.js, which is
   pure and therefore testable under node; a Worker is not.

   Protocol
     in : { cmd:"slice", buffer, unit, thicknesses, boards, supply, densityMin, densityMax, opts }
     out: { type:"progress", value 0..1 }
          { type:"done", result, meshStl? }
          { type:"error", message, region? }

   `meshStl` is the mold itself, decimated and written back out as a binary STL
   so the 3D viewer can show the mold inside the blocks after a reload. Built
   HERE rather than on the page because the triangles are already in hand — the
   alternative is re-parsing a multi-megabyte mesh on the main thread purely to
   throw most of it away. Transferred, not cloned.

   Note importScripts needs a CLASSIC worker (no { type:"module" }), which
   matches how the rest of the app loads. */

importScripts("slicer.js", "packer.js", "stlio.js");

/* Kept between messages so picking a body doesn't re-parse a 9MB mesh. */
let cached = null;   // { key, bodies }

function bodiesFor(msg) {
  const key = msg.cacheKey;
  if (cached && cached.key === key) return cached.bodies;
  const parsed = parseSTL(msg.buffer);
  const tris = scaleTris(parsed.tris, msg.unit);
  const bodies = splitBodies(tris);
  cached = { key, bodies, triangleCount: parsed.tris.length };
  return bodies;
}

self.onmessage = function (e) {
  const msg = e.data || {};
  try {
    /* Step one for any STL: how many separate bodies is this? A real Fusion
       export is often an assembly — the SN5 undertray is 31 bodies over 8.7m of
       assembly space — and slicing the whole file's bounding box would plan a
       nine-metre void. */
    if (msg.cmd === "bodies") {
      const bodies = bodiesFor(msg);
      self.postMessage({
        type: "bodies",
        triangleCount: cached.triangleCount,
        bodies: bodies.map((b, i) => ({
          index: i, triangles: b.tris.length,
          w: b.bounds.x1 - b.bounds.x0, d: b.bounds.y1 - b.bounds.y0, h: b.bounds.z1 - b.bounds.z0,
        })),
      });
      return;
    }
    if (msg.cmd !== "slice") return;
    // Either a box typed in by hand, or one body of an uploaded STL.
    let tris, triangleCount, displayTris;
    if (msg.box) {
      tris = boxTris(msg.box.len, msg.box.wid, msg.box.hgt);
      triangleCount = tris.length;
      // boxTris is 4 open walls — enough to slice against Z planes, but it
      // renders as a tube with no lid. The viewer gets a closed solid instead.
      displayTris = blankTris({ x0: 0, y0: 0, x1: msg.box.len, y1: msg.box.wid }, 0, msg.box.hgt);
    } else {
      const bodies = bodiesFor(msg);
      const body = bodies[msg.bodyIndex || 0];
      if (!body) throw new Error("That body is not in this file any more — re-pick it.");
      tris = body.tris;
      triangleCount = body.tris.length;
      displayTris = body.tris;
    }
    /* How a candidate stack is judged. packer.js's moldCost scores by actually
       packing the blanks onto the rack; slicer.js takes it as an injection so
       it keeps no dependencies of its own. No boards recorded yet means no
       score is injected and planMold falls back to its volume heuristic. */
    const opts = { ...(msg.opts || {}), onProgress: v => self.postMessage({ type: "progress", value: v }) };
    if (msg.supply) opts.supply = msg.supply;
    if (msg.boards && msg.boards.length) {
      opts.score = layers => moldCost(layers, msg.boards,
        { densityMin: msg.densityMin, densityMax: msg.densityMax }).cost;
    }
    // thicknesses null => choose them from what the rack actually holds.
    const result = msg.thicknesses && msg.thicknesses.length
      ? sliceMold(tris, msg.thicknesses, opts)
      : planMold(tris, msg.available, opts);
    // Best-effort: a mesh we couldn't shrink or write must never cost anyone
    // their cut list, which is the part that actually gets cut.
    let meshStl = null;
    try { meshStl = meshStlForStorage(displayTris); } catch (e) { meshStl = null; }
    self.postMessage({
      type: "done",
      meshStl,
      result: {
        layers: result.layers,
        sections: (result.sections || []).map(s => ({ index: s.index, height: s.height, count: s.layers.length })),
        bounds: result.bounds,
        warnings: result.warnings,
        composition: result.composition || msg.thicknesses,
        considered: result.considered || 0,
        alternatives: result.alternatives || [],
        cost: result.cost || 0,
        usedRack: !!(msg.boards && msg.boards.length),
        monolithic: !!result.monolithic,
        triangleCount,
      },
    }, meshStl ? [meshStl] : []);
  } catch (err) {
    // Structured-clone can't carry an Error, so flatten it. The region is what
    // lets the UI say WHERE an overhang is instead of just refusing the file.
    self.postMessage({ type: "error", message: err.message || String(err), region: err.region || null });
  }
};
