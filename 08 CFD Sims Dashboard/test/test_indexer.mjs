/* Panel indexing, asserted against the real report.

   The app's whole comparison model rests on reading panels out of the PDF
   correctly, so this runs the actual indexer over DP_22.pdf rather than a
   fixture. If Fluent's export ever changes shape, this is what fails first.

   Run:  npm run test:indexer   (from "08 CFD Sims Dashboard/")
   Ported from 07 CFD PDF Viewer/test/test_indexer.mjs; the fixture is the
   same DP_22.pdf, copied under test/fixtures/. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { indexDocument, withContentSpace, matchPanels } from "../app/indexer.js";
import { resultsFrom, dpFrom, metaFrom, headline, reportDefs } from "../app/extract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = join(root, "test", "fixtures", "DP_22.pdf");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
/* A file URL, not a bare path: pdf.mjs import()s this string, and on Windows an
   absolute path is C:\Users\... , which Node rejects as an unknown "c:" scheme. */
const WORKER = join(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(WORKER).href;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

const data = new Uint8Array(readFileSync(SAMPLE));
const doc = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
const ix = await indexDocument(doc);
/* The same document read one page at a time, the way the indexer worked
   before it kept six pages' text requests in flight. Must be identical. */
const ixSerial = await indexDocument(doc, { concurrency: 1 });

console.log("document shape:");
t("39 pages, all A3", () => {
  assert(ix.numPages === 39, "expected 39 pages, got " + ix.numPages);
  assert(ix.pages.every(p => Math.abs(p.width - 841.92) < 1 && Math.abs(p.height - 1191.12) < 1),
    "every page should be A3 landscape-height");
});
t("strip coordinates stack the pages", () => {
  assert(ix.pages[0].absY === 0, "page 1 starts the strip");
  for (let i = 1; i < ix.pages.length; i++) {
    const want = ix.pages[i - 1].absY + ix.pages[i - 1].height;
    assert(Math.abs(ix.pages[i].absY - want) < 0.01, "page " + (i + 1) + " misplaced in the strip");
  }
  assert(Math.abs(ix.stripHeight - 39 * 1191.12) < 1, "strip height is the sum of the pages");
});

t("reading pages in parallel gives exactly the serial index", () => {
  assert(JSON.stringify(ix) === JSON.stringify(ixSerial), "parallel and serial indexes differ");
});
console.log("sections:");
t("the three comparable sections are found, in order", () => {
  assert(ix.sections.map(s => s.name).join(",") === "Plots,Contours,Vectors",
    "got: " + ix.sections.map(s => s.name).join(","));
  assert(ix.sections[0].page === 9, "Plots starts on page 9, got " + ix.sections[0].page);
  assert(ix.sections[1].page === 17, "Contours starts on page 17");
  assert(ix.sections[2].page === 36, "Vectors starts on page 36");
});
t("setup headings are indexed but not treated as panels", () => {
  const names = ix.setup.map(s => s.name);
  assert(names.some(n => n.startsWith("Geometry")), "expected a Geometry heading: " + names);
  assert(ix.panels.every(p => p.page >= 9), "no panel may come from the setup pages");
});

console.log("panels:");
t("59 named panels across the three sections", () => {
  assert(ix.panels.length === 59, "expected 59 panels, got " + ix.panels.length);
});
t("36 contours, 6 vectors, 17 plots", () => {
  const by = s => ix.panels.filter(p => p.section === s).length;
  assert(by("Contours") === 36, "contours: " + by("Contours"));
  assert(by("Vectors") === 6, "vectors: " + by("Vectors"));
  assert(by("Plots") === 17, "plots: " + by("Plots"));
});
t("the contour naming grid is complete", () => {
  const names = new Set(ix.panels.map(p => p.name));
  for (const field of ["velo", "stat", "tot"]) {
    for (const region of ["wing", "car"]) {
      for (let i = 0; i <= 5; i++) {
        assert(names.has(`${field}-${region}-${i}`), "missing contour " + `${field}-${region}-${i}`);
      }
    }
  }
  for (let i = 0; i <= 5; i++) assert(names.has("vector-" + i), "missing vector-" + i);
});
t("convergence plots are indexed by name", () => {
  const names = ix.panels.map(p => p.name);
  ["Residuals", "total-drag-rplot", "total-lift-rplot", "fwing-cd-rplot"].forEach(n =>
    assert(names.includes(n), "missing plot " + n));
});
t("panels run top to bottom without duplicate ids", () => {
  for (let i = 1; i < ix.panels.length; i++) {
    assert(ix.panels[i].absY > ix.panels[i - 1].absY, "panels out of order at " + i);
  }
  assert(new Set(ix.panels.map(p => p.id)).size === ix.panels.length, "panel ids must be unique");
});

console.log("geometry:");
t("pitch is measured from the document, near 502.5pt", () => {
  assert(Math.abs(ix.pitch - 502.5) < 5, "measured pitch " + ix.pitch);
});
t("panel height follows the real layout, not the median pitch", () => {
  /* A page break pushes the plot down, so those panels occupy more of the strip
     than the pitch suggests. Assuming the pitch cropped 28 of 58 panels, by up
     to 152pt, which cut the bottom off half the contours on screen. */
  const byName = n => ix.panels.find(p => p.name === n);
  const wide = ix.panels.filter(p => p.height > ix.pitch + 2);
  assert(wide.length >= 20, "expected many panels taller than the pitch, got " + wide.length);
  assert(Math.abs(byName("velo-wing-1").height - 654.1) < 2,
    "velo-wing-1 straddles a break and needs its full extent, got " + byName("velo-wing-1").height.toFixed(1));
  assert(Math.abs(byName("total-cd-rplot").height - 583.6) < 2,
    "total-cd-rplot needs 583.6, got " + byName("total-cd-rplot").height.toFixed(1));
});
t("no panel is shorter than the content the layout gives it", () => {
  for (const p of ix.panels) {
    const capped = p.extent > ix.pitch * 1.6;
    if (!capped) {
      assert(p.height >= Math.min(p.extent, ix.pitch) - 1,
        `${p.name} is cropped: height ${p.height.toFixed(1)} vs extent ${p.extent.toFixed(1)}`);
    }
  }
});
t("a panel at a section boundary is capped, not left mostly blank", () => {
  // ut-cl-rplot is the last plot before Contours, so its raw extent is over
  // 1000pt of which nearly all is trailing whitespace.
  const p = ix.panels.find(x => x.name === "ut-cl-rplot");
  assert(p.extent > 900, "expected a large raw extent, got " + p.extent.toFixed(1));
  assert(p.height <= ix.pitch * 1.6 + 1, "should be capped, got " + p.height.toFixed(1));
  assert(p.height >= ix.pitch, "but not below the normal panel height");
});
t("panels that straddle a page break are handled", () => {
  const straddlers = ix.panels.filter(p => {
    const page = ix.pages[p.page - 1];
    return p.pageY + p.height > page.height + 1;
  });
  assert(straddlers.length > 0, "the sample has panels crossing a page break; none detected");
  straddlers.forEach(p => assert(p.page < ix.numPages, "a straddling panel cannot start on the last page"));
});
t("no panel runs off the end of the strip", () => {
  ix.panels.forEach(p => assert(p.absY + p.height <= ix.stripHeight + 0.01, p.name + " overruns the strip"));
});

console.log("content space (page margins collapsed):");
// The browser measures real margins by rendering; node has no canvas, so feed
// synthetic ones. Every page gets a 40pt top and 60pt bottom margin, which is
// the shape of a real Chromium print export and enough to test the geometry.
const synthMargins = ix.pages.map(() => ({ top: 40, bottom: 60 }));
const cs = withContentSpace(ix, synthMargins);

t("every page loses its margins in content space", () => {
  cs.pages.forEach((p, i) => {
    assert(Math.abs(p.cHeight - (p.height - 100)) < 0.01, "page " + (i + 1) + " content height wrong");
    assert(p.cTop === 40 && Math.abs(p.cBottom - (p.height - 60)) < 0.01, "margins not applied");
  });
  assert(Math.abs(cs.contentHeight - (ix.stripHeight - 100 * ix.numPages)) < 0.5,
    "content height should be the strip minus every page's margins");
});
t("pages abut with no gap in content space", () => {
  for (let i = 1; i < cs.pages.length; i++) {
    const prevBottom = cs.pages[i - 1].cy + cs.pages[i - 1].cHeight;
    assert(Math.abs(cs.pages[i].cy - prevBottom) < 0.01, "gap between pages " + i + " and " + (i + 1));
  }
});
t("a seam-spanning panel has no internal margin band in content space", () => {
  // rwing-cl-rplot straddles a page break. In paper space its range crosses a
  // seam; in content space the two margins are gone, so the whole panel maps to
  // a continuous run whose covered pages abut.
  const p = cs.panels.find(x => x.name === "rwing-cl-rplot");
  assert(p, "panel present after remap");
  const covered = cs.pages.filter(pg => pg.cy < p.absY + p.height && pg.cy + pg.cHeight > p.absY);
  assert(covered.length >= 2, "this panel should still cross a page boundary");
  for (let i = 1; i < covered.length; i++) {
    assert(Math.abs(covered[i].cy - (covered[i - 1].cy + covered[i - 1].cHeight)) < 0.01,
      "covered pages must abut, leaving no white band inside the plot");
  }
});
t("panels keep their order and ids through the remap", () => {
  assert(cs.panels.length === ix.panels.length, "panel count unchanged");
  assert(cs.panels.every((p, i) => i === 0 || p.absY >= cs.panels[i - 1].absY), "still top to bottom");
  assert(new Set(cs.panels.map(p => p.id)).size === cs.panels.length, "ids still unique");
});
t("no measured margins means no trim (graceful fallback)", () => {
  const plain = withContentSpace(ix, []);
  assert(Math.abs(plain.contentHeight - ix.stripHeight) < 0.5, "without margins the layout is unchanged");
});

console.log("matching:");
t("a document matched against itself lines up one-to-one", () => {
  const rows = matchPanels([ix, ix]);
  assert(rows.length === 59, "expected 59 rows, got " + rows.length);
  assert(rows.every(r => r.cells[0] && r.cells[1]), "every panel should pair with itself");
  assert(rows.every(r => r.cells[0].id === r.cells[1].id), "pairs must share an id");
});
t("a panel missing from one document still gets a row", () => {
  const trimmed = { ...ix, panels: ix.panels.filter(p => p.name !== "vector-0") };
  const rows = matchPanels([ix, trimmed]);
  assert(rows.length === 59, "the row survives, got " + rows.length);
  const row = rows.find(r => r.name === "vector-0");
  assert(row && row.cells[0] && row.cells[1] === null, "the gap should be an explicit null");
});
t("a panel only in the second document is not dropped", () => {
  const extra = { ...ix, panels: [...ix.panels, { ...ix.panels[0], id: "Contours/new-plot", name: "new-plot", section: "Contours", order: 999 }] };
  const rows = matchPanels([ix, extra]);
  assert(rows.some(r => r.name === "new-plot"), "a new panel must appear in the comparison");
});

/* core.js now calls matchPanels() for the view rows (07 kept an inlined
   copy, panelRows(), that nobody tested). The views read exactly these
   fields of a row, so pin them here. */
t("matchPanels rows carry the fields the views read (id, name, section, cells[])", () => {
  const rows = matchPanels([ix, ix]);
  for (const r of rows) {
    assert(typeof r.id === "string" && typeof r.name === "string" && typeof r.section === "string", "row identity");
    assert(Array.isArray(r.cells) && r.cells.length === 2, "one cell per document");
    assert(r.cells.every(c => c === null || typeof c.absY === "number"), "a cell is a panel or null");
  }
  const orders = rows.map(r => (r.cells.find(Boolean) || {}).order);
  assert(orders.every((o, i) => i === 0 || o >= orders[i - 1]), "rows sorted by order");
});

/* ---- extract.js: the numbers the dashboard reads ---- */
console.log("extract:");
const fullText = ix.text.map(t => t.text).join("  ");
const R = resultsFrom(fullText);
t("total lift/drag/cl/cd read verbatim from Report Definitions", () => {
  assert(R.total, "total block");
  assert(R.total.lift === -486.6432, "lift " + R.total.lift);
  assert(R.total.drag === 179.6394, "drag " + R.total.drag);
  assert(R.total.cl === -1.986299, "cl " + R.total.cl);
  assert(R.total.cd === 0.733222, "cd " + R.total.cd);
});
t("element loads read too, keyed by name not column", () => {
  assert(R.fwing.cd === 0.08125819, "fwing cd");
  assert(R.rwing.drag === 62.7296, "rwing drag");
  assert(R.ut.lift === -192.502, "ut lift");
});
t("no -rplot axis numbers leak in as values", () => {
  assert(!Object.keys(R).some(k => /rplot/.test(k)), Object.keys(R).join(","));
  const fake = resultsFrom("Report Definitions total-lift -10 N Plots total-lift-rplot 50 100 150 200 total-cd-rplot 0.5 0.7");
  assert(fake.total.lift === -10 && fake.total.cd === undefined, JSON.stringify(fake));
});
t("headline flips lift to positive downforce and derives L/D", () => {
  const h = headline(R);
  assert(Math.abs(h.downforce - 486.6432) < 1e-9 && Math.abs(h.drag - 179.6394) < 1e-9, "N");
  assert(Math.abs(h.ld - 486.6432 / 179.6394) < 1e-9, "L/D");
  assert(headline({}).downforce === null && headline(null).ld === null, "missing stays null");
});
t("design point from the name, else from the PDF, else null", () => {
  assert(dpFrom("DP_22.pdf", "") === 22, "DP_22");
  assert(dpFrom("dp 7 baseline", "") === 7, "dp 7");
  assert(dpFrom("DP-104b", "") === 104, "DP-104b");
  assert(dpFrom("wing study", fullText) === 22, "from the PDF's first token");
  assert(dpFrom("wing study", "no dp here") === null, "null");
});
t("meta carries analyst, date, cells, iterations, inlet velocity", () => {
  const m = metaFrom(fullText);
  assert(m.analyst === "beldon", "analyst " + m.analyst);
  assert(m.date === "4/27/2026 11:29 AM", "date " + m.date);
  assert(m.cells === 5304451 && m.iterations === 200, "cells/iterations");
  assert(m.inletV === "20 m/s", "inletV " + m.inletV);
});
t("reportDefs still lists the names", () => {
  const d = reportDefs(fullText);
  assert(d.includes("total-lift") && d.includes("ut-cl"), d.join(","));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
