/* test_labels.mjs — the printed label sheet, measured in a real browser.
 *
 * WHY PIXELS AND NOT THE DOM
 * SESSION-STATE records the lesson the hard way: layout is not paint, and
 * `getBoundingClientRect().height > 0` is not "is it visible" —
 * `checkVisibility()` is. This file needs one step further again. A QR is an
 * <svg> holding a <path>; it can pass checkVisibility(), report a perfect box,
 * and still be a blank white square if the `d` attribute is malformed. Nothing
 * in the DOM can tell you. So the QR check here screenshots the element and
 * counts dark pixels: a real QR is about 45% dark, a blank SVG is 0%, a black
 * box is 100%.
 *
 * The other thing this catches is overflow. A 4 x 1 inch label is by a wide
 * margin the narrowest container in the app, so it will clip or burst before
 * anything else does, and the fixtures below are deliberately hostile: a
 * 60-character mold name, a name with a slash in it, an empty name.
 *
 *   node tools/test_labels.mjs
 *   node tools/test_labels.mjs --shots /tmp/labels     also write screenshots
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage } from "./lib/browser.mjs";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const SHOTS = arg("shots", null);

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

/* Records covering every label shape, with the nasty ones first. These are not
   realistic; they are the inputs that break a 100mm-wide box. */
const RECS = [
  { coll: "molds", o: {
      id: "MOLD-SN6-004", name: "UT INLET L/H", rev: "A", uses: 3, density: 30,
      layers: "2 x 3in", sealingType: "XCR + PVA + 4 WAX", board: "BRD-SN6-002",
      location: "RFS CONTAINER", sealedDate: "2026-09-14", sealedBy: "RJB" } },
  { coll: "molds", o: {
      id: "MOLD-SN6-005",
      name: "UNDERTRAY LEFT SIDE POD OUTBOARD SKIN LOWER SECTION TWO",  // 55 chars
      density: 60, location: "RFS", sealedDate: "2026-09-20" } },   // a key row worth keeping
  { coll: "molds", o: { id: "MOLD-SN6-006", name: "" } },   // nothing but an id
  // A footer long enough to overflow. This is the case that clipped the FEB tag
  // mid-glyph, which every overflow check passed because the clip happened
  // inside the row's own box. Keep it: without a footer that actually overflows
  // the febClip assertion below has nothing to catch.
  { coll: "molds", o: {
      id: "MOLD-SN6-007", name: "NOSECONE",
      board: "BRD-SN6-014", location: "JACOBS BASEMENT SHELF B3 BEHIND THE ETCH LOCKER" } },
  /* R&D, under the worst conditions the label can actually be asked for: a
     55-character name (so nameTier merges the mid row away) AND a footer long
     enough to overflow. The R&D tag rides the ID row precisely because that row
     is the only one whose content is length-capped, so this is the case that
     proves it — if the tag ever starts costing vertical space or eating the
     ellipsis, it fails here and not in the shop. */
  { coll: "parts", o: {
      id: "P-SN6-950", partName: "VORTEX GENERATOR TRIAL PANEL LOWER SURFACE SET TWO OF SIX",
      layupSchedule: "4X 195 TWILL + .125 NOMEX", layupType: "MOLD INFUSION", rnd: true,
      workOrderId: "WO-SN6-118", moldLocation: "JACOBS BASEMENT SHELF B3 BEHIND THE ETCH LOCKER",
      layupProgress: "Not Started", by: "RJB" } },
  { coll: "parts", o: {
      id: "P-SN6-007", partName: "UT INLET L/H", layupSchedule: "6X 195 TWILL + .125 NOMEX",
      layupType: "MOLD INFUSION", workOrderId: "WO-SN6-031", moldLocation: "RFS",
      layupProgress: "Layup Complete", laidOn: "2026-09-22", by: "RJB",
      weightG: 412, subteam: "AERO" } },
  { coll: "parts", o: {
      id: "P-SN6-008", partName: "FW E1 TOP / BOTTOM",       // slash in the name
      layupSchedule: "195 88 .125 NOMEX 195 88 + FOAM CORE AND MORE", layupType: "WET LAY" } },
  { coll: "lots", o: {
      id: "RSN-SN6-011", cls: "RSN", name: "IN2 INFUSION RESIN", role: "resin",
      ratio: "100 : 30 BY WEIGHT", vendorLot: "24C-0918", openedOn: "2026-09-02",
      receivedOn: "2026-08-28", expiresOn: "2027-08-28", location: "CHEMICAL BARREL" } },
  { coll: "stock", o: {
      // The REAL shape: stock.js stores each dimension as {value, unit}. The
      // old flat numbers here are why the "[object Object]" label shipped —
      // the fixture couldn't fail the way production data did.
      id: "BRD-SN6-002", label: "RACK A TOP SHELF", kind: "sheet", density: 30,
      len: { value: 96, unit: "in" }, wid: { value: 48, unit: "in" },
      thk: { value: 2, unit: "in" }, qty: 1 } },
  { coll: "workOrders", o: {
      id: "WO-SN6-031", partName: "UT INLET", revision: "A", status: "In Progress",
      processType: "infusion", subteam: "AERO", createdDate: "2026-09-10",
      mold: { moldId: "MOLD-SN6-004" }, stackNote: "6X 195 TWILL + .125 NOMEX" } },
  // Over the QR character budget: must render text-only, not a denser code.
  { coll: "items", o: { id: "PNL-SN6-006-C03", cls: "PNL", partName: "COUPON 3" } },
  // The complaint that flipped the layout name-first (2026-08-13): 18 chars,
  // one character over the OLD shared-line budget, printed "FLAMMABLES CA…".
  { coll: "items", o: { id: "BIN-SN6-002", cls: "BIN", name: "Flammables cabinet",
      site: "RFS CONTAINER", locKind: "CABINET", flam: "Yes" } },
];

const HARNESS = `<!doctype html><meta charset="utf-8">
<title>label harness</title>
<link rel="stylesheet" href="/print.css">
<style>body{margin:0;background:#ddd}</style>
<div id="printroot"></div>
<script src="/vendor/qrcode.min.js"></script>
<script>
  // labels.js needs these from core.js/print.js. Stubbing the boundary
  // rather than booting the whole app keeps this test about labels.
  function esc(s){ return String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  function canonDensity(v){ const n = Number(String(v ?? "").trim()); return !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 10) / 10; }
  function today(){ return "2026-08-03"; }
  function icon(){ return ""; }
  function toast(){}
  function recById(){ return null; }
  // The R&D lookup lives in core.js. Stubbed like the rest of the boundary, so
  // the R&D record below actually renders its tag and the geometry checks have
  // something to measure. Without this, lblIsRnd() correctly answers false and
  // every R&D assertion here would pass against a label with no tag on it.
  function recIsRnd(coll, o){ return !!(o && o.rnd); }
  function mountSheet(html){ document.getElementById("printroot").innerHTML = html; }
</script>
<script src="/labels.js"></script>
<script>
  window.RENDER = (recs, opts) => {
    document.getElementById("printroot").innerHTML = labelSheetHtml(recs, opts);
  };
  window.RENDER_ROLL = (recs, opts) => {
    document.getElementById("printroot").innerHTML = labelRollHtml(recs, opts);
  };
</script>`;

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the label sheet")); process.exit(0); }

const { server, port } = await serveApp({ "/harness.html": HARNESS });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/harness.html`, { waitUntil: "load" });

if (SHOTS) await mkdir(SHOTS, { recursive: true });

/* ---------- render ---------- */
console.log("\nrender");

const err = await page.evaluate(recs => {
  try { window.RENDER(recs, { calibrate: true }); return null; }
  catch (e) { return String(e && e.message || e); }
}, RECS);
ok(err === null, "the sheet renders without throwing", err);

const counts = await page.evaluate(() => ({
  sheets: document.querySelectorAll(".label-sheet").length,
  cells: document.querySelectorAll(".label-cell").length,
  labels: document.querySelectorAll(".lbl").length,
  qrs: document.querySelectorAll(".lbl-qr").length,
}));
// 9 records + 1 calibration cell = 10, all on one 20-up sheet.
eq(counts.sheets, 1, "10 cells fit on one Avery 5161 sheet");
eq(counts.labels, RECS.length + 1, "one cell per record plus the calibration cell");
// Every record gets a QR except the calibration cell and the over-budget coupon.
eq(counts.qrs, RECS.length - 1, "every label carries a QR except the over-budget coupon");

/* ---------- visibility, the honest way ---------- */
console.log("\nvisibility");

const invisible = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll(".lbl, .lbl-id, .lbl-name, .lbl-r2, .lbl-qr")) {
    const r = el.getBoundingClientRect();
    // Layout is not paint. checkVisibility() is the question; a non-zero box is
    // not. See the regression written up in SESSION-STATE.
    if (r.width > 0 && r.height > 0 && !el.checkVisibility()) {
      bad.push(el.className + " " + (el.textContent || "").slice(0, 30));
    }
  }
  return bad;
});
ok(invisible.length === 0, "nothing has a box but no paint", invisible.join(" | "));

/* ---------- the pixel check ---------- */
console.log("\nthe QR is actually a QR");

/* This is the check nothing else in the repo can do. A malformed `d` gives an
   <svg> that is present, sized, visible, and blank. */
/* Measured in the page with a canvas rather than by decoding a screenshot:
   there is no PNG decoder to get wrong, and drawing the SVG proves the browser
   can actually rasterise it, which is the thing under test. The canvas is not
   tainted because the SVG has no external references — asserted below. */
const darkness = await page.evaluate(async () => {
  const out = [];
  for (const svg of [...document.querySelectorAll(".lbl-qr")].slice(0, 4)) {
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.outerHTML);
    const img = new Image();
    img.width = 160; img.height = 160;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("svg would not rasterise")); img.src = src; });
    const c = document.createElement("canvas");
    c.width = 160; c.height = 160;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 160, 160);
    g.drawImage(img, 0, 0, 160, 160);
    const d = g.getImageData(0, 0, 160, 160).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 128) dark++;
    out.push({ id: svg.closest(".lbl").dataset.id, frac: dark / (160 * 160) });
  }
  return out;
});

for (const { id, frac } of darkness) {
  ok(frac > 0.30 && frac < 0.60,
    `${id}: QR is ${(frac * 100).toFixed(1)}% dark (a real code is ~45%, blank is 0%, a black box is 100%)`,
    `fraction ${frac.toFixed(3)}`);
}
ok(darkness.length >= 4, "measured several codes, not just the first");

/* ---------- physical size ---------- */
console.log("\nphysical size");

const sizes = await page.evaluate(() => {
  const q = document.querySelector(".lbl-qr");
  const cell = document.querySelector(".label-cell");
  const sheet = document.querySelector(".label-sheet");
  const r = q.getBoundingClientRect(), c = cell.getBoundingClientRect(), s = sheet.getBoundingClientRect();
  return { qr: r.width, cellW: c.width, cellH: c.height, sheetW: s.width, sheetH: s.height,
           viewBox: q.getAttribute("viewBox") };
});
// 21.4mm at 96dpi = 80.9px. Below ~0.4mm per module a phone stops reading it
// reliably, and 29 modules in 21.4mm is 0.58mm — comfortably clear.
ok(sizes.qr >= 80 && sizes.qr <= 83, "the QR is 21.4mm (80.9px at 96dpi)", `${sizes.qr.toFixed(1)}px`);
eq(sizes.viewBox, "0 0 37 37", "viewBox carries the 4-module quiet zone on each side");
ok(Math.abs(sizes.cellW - 384) < 1, "a cell is 4in wide (384px)", `${sizes.cellW.toFixed(1)}px`);
ok(Math.abs(sizes.cellH - 96) < 1, "a cell is 1in tall (96px)", `${sizes.cellH.toFixed(1)}px`);
ok(Math.abs(sizes.sheetW - 816) < 1, "the sheet is 8.5in wide", `${sizes.sheetW.toFixed(1)}px`);
ok(Math.abs(sizes.sheetH - 1056) < 1, "the sheet is 11in tall", `${sizes.sheetH.toFixed(1)}px`);

/* ---------- overflow ---------- */
console.log("\noverflow");

/* The 55-character mold name is the whole point of this block. Without
   min-width:0 on .lbl-txt a flex track sizes from min-content and the name
   shoves the QR off the label; the label still "renders" and the code is gone.
   Nothing may spill its cell, and every QR must still sit inside one. */
const spills = await page.evaluate(() => {
  const bad = [];
  for (const cell of document.querySelectorAll(".label-cell")) {
    const c = cell.getBoundingClientRect();
    for (const el of cell.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > c.right + 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5) {
        bad.push(`${el.className || el.tagName} in ${cell.querySelector(".lbl")?.dataset.id || "?"} r=${r.right.toFixed(1)}/${c.right.toFixed(1)} b=${r.bottom.toFixed(1)}/${c.bottom.toFixed(1)}`);
      }
    }
  }
  return bad;
});
ok(spills.length === 0, "nothing overflows its 4x1in cell", spills.slice(0, 4).join(" | "));

const qrInside = await page.evaluate(() => {
  let worst = 0;
  for (const q of document.querySelectorAll(".lbl-qr")) {
    const cell = q.closest(".label-cell").getBoundingClientRect();
    const r = q.getBoundingClientRect();
    worst = Math.max(worst, cell.right - r.right < 0 ? 1 : 0, r.width < 80 ? 1 : 0);
  }
  return worst;
});
eq(qrInside, 0, "every QR is full size and inside its cell, even next to a 55-character name");

/* The name must be READ in full — that is the label's primary use (Simon,
   2026-08-13; the QR is secondary). nameTier picks a size where the whole
   name fits in at most two clamped lines, and the mid row merges into the
   footer to pay for the second line. So: the 55-char monster renders complete
   (nothing scroll-clipped in either axis), within two lines, and its key row
   is still on the label. */
const lines = await page.evaluate(() => {
  const el = [...document.querySelectorAll(".lbl")].find(l => l.dataset.id === "MOLD-SN6-005");
  const name = el.querySelector(".lbl-name");
  return {
    h: name.getBoundingClientRect().height,
    clippedY: name.scrollHeight > name.clientHeight + 1,
    clippedX: name.scrollWidth > name.clientWidth + 1,
    // With content: labelMarkup leaves an empty key row out of the markup, so
    // bare existence would not say the row survived the two-line name.
    hasKey: /SEALED/.test((el.querySelector(".lbl-r2") || {}).textContent || ""),
    hasId: (el.querySelector(".lbl-rid") || {}).textContent === "MOLD-SN6-005",
  };
});
ok(!lines.clippedY && !lines.clippedX, "a 55-character name is fully readable (wrapped, not ellipsized)",
  `clippedY=${lines.clippedY} clippedX=${lines.clippedX}`);
ok(lines.h < 30, "and takes at most two lines", `${lines.h.toFixed(1)}px tall`);
ok(lines.hasKey && lines.hasId, "the key row and the ID row survive the two-line name");

// The complaint itself: FLAMMABLES CABINET printed as "FLAMMABLES CA…" when
// the 16pt ID shared its line. Name-first, it is one full 14pt line.
const flam = await page.evaluate(() => {
  const el = [...document.querySelectorAll(".lbl")].find(l => l.dataset.id === "BIN-SN6-002");
  const name = el.querySelector(".lbl-name");
  // One 14pt line at 96dpi is ~20.5px (14pt = 18.7px, line-height 1.1);
  // two would be ~41. 24 splits them with margin.
  return { text: name.textContent, oneLine: name.getBoundingClientRect().height < 24,
           clipped: name.scrollWidth > name.clientWidth + 1, tier: name.className };
});
eq(flam.text, "FLAMMABLES CABINET", "the cabinet label carries the whole name");
ok(flam.oneLine && !flam.clipped, "on one uncut 14pt line", `tier=${flam.tier} clipped=${flam.clipped}`);

/* Caught by looking at a screenshot, not by any assertion above: with
   overflow:hidden on the flex ROW, a long footer clipped the FEB tag mid-glyph
   rather than truncating the text before it. Every "does it overflow" check
   passed, because the clip was inside the row's own box. So: measure the tag
   itself against the width it wants. */
const febClip = await page.evaluate(() => {
  const bad = [];
  for (const feb of document.querySelectorAll(".lbl-feb")) {
    const r = feb.getBoundingClientRect();
    const cell = feb.closest(".label-cell").getBoundingClientRect();
    // scrollWidth > clientWidth means the browser is cutting glyphs off.
    if (feb.scrollWidth > feb.clientWidth + 0.5 || r.right > cell.right + 0.5 || r.width < 14) {
      bad.push(`${feb.closest(".lbl").dataset.id} w=${r.width.toFixed(1)} scroll=${feb.scrollWidth}/${feb.clientWidth}`);
    }
  }
  return bad;
});
ok(febClip.length === 0, "the FEB tag is never clipped, however long the footer", febClip.join(" | "));

/* The R&D tag. It rides the ID row rather than a row of its own because the
   vertical budget is spent (18.8mm of 21.4mm one-line, 20.6mm two-line) — so
   the assertion that matters is that it costs NOTHING, measured rather than
   argued. Same technique as the FEB check above: measure the tag itself. */
console.log("\nR&D mark");
const rnd = await page.evaluate(() => {
  const el = [...document.querySelectorAll(".lbl")].find(l => l.dataset.id === "P-SN6-950");
  const plain = [...document.querySelectorAll(".lbl")].find(l => l.dataset.id === "P-SN6-007");
  const tag = el && el.querySelector(".lbl-rnd");
  if (!el || !tag) return { missing: true, hasEl: !!el };
  const t = tag.getBoundingClientRect();
  const row = el.querySelector(".lbl-rid").getBoundingClientRect();
  const cell = el.closest(".label-cell").getBoundingClientRect();
  const idSpan = el.querySelector(".lbl-rid > span");
  return {
    text: tag.textContent,
    // Cut glyphs off? The whole reason it sits on the capped row.
    clipped: tag.scrollWidth > tag.clientWidth + 0.5,
    insideCell: t.right <= cell.right + 0.5 && t.bottom <= cell.bottom + 0.5,
    tagH: t.height, rowH: row.height,
    // The plain part's ID row, for the "costs nothing" comparison.
    plainRowH: plain.querySelector(".lbl-rid").getBoundingClientRect().height,
    idReadable: idSpan.scrollWidth <= idSpan.clientWidth + 1,
    keyRow: !!el.querySelector(".lbl-r2") && el.querySelector(".lbl-r2").textContent.trim().length > 0,
    febW: el.querySelector(".lbl-feb").getBoundingClientRect().width,
  };
});
ok(!rnd.missing, "the R&D part's label carries the mark", JSON.stringify(rnd));
if (!rnd.missing) {
  eq(rnd.text, "R&D", "and it says R&D");
  ok(!rnd.clipped, "never cut off — it sits on the one row whose content is length-capped", `scroll=${rnd.clipped}`);
  ok(rnd.insideCell, "inside the 4x1in cell");
  ok(rnd.tagH < rnd.rowH + 0.5, "shorter than the row it rides, so a flex row cannot grow around it",
    `tag=${rnd.tagH.toFixed(1)}px row=${rnd.rowH.toFixed(1)}px`);
  ok(Math.abs(rnd.rowH - rnd.plainRowH) < 0.5,
    "and the ID row is the SAME HEIGHT as a label with no mark — this is the 18.8/20.6mm budget, measured",
    `rnd=${rnd.rowH.toFixed(1)}px plain=${rnd.plainRowH.toFixed(1)}px`);
  ok(rnd.idReadable, "the id itself is still fully readable beside it");
  ok(rnd.keyRow, "and the layup stack — the line this whole system exists for — is untouched");
  ok(rnd.febW >= 14, "the FEB tag survives too, on a label carrying both", `${rnd.febW.toFixed(1)}px`);
}
const rndOnPlain = await page.evaluate(() =>
  [...document.querySelectorAll(".lbl")].filter(l => l.querySelector(".lbl-rnd")).map(l => l.dataset.id));
ok(rndOnPlain.length === 1 && rndOnPlain[0] === "P-SN6-950",
  "and exactly one label on the sheet is marked — a season part's label is unchanged", rndOnPlain.join(" | "));


// Same failure one level up: the truncation must land on the text, not on the
// row, so a footer that is too long ends in an ellipsis rather than a hard cut.
const footTruncates = await page.evaluate(() => {
  const el = [...document.querySelectorAll(".lbl")].find(l => l.dataset.id === "MOLD-SN6-004");
  const span = el.querySelector(".lbl-r4 > span");
  return { over: span.scrollWidth > span.clientWidth, ellipsis: getComputedStyle(span).textOverflow };
});
eq(footTruncates.ellipsis, "ellipsis", "the footer text span truncates with an ellipsis");

/* ---------- self-contained ---------- */
console.log("\nself-contained");

const external = await page.evaluate(() => {
  const root = document.getElementById("printroot");
  const html = root.innerHTML;
  return {
    scripts: root.querySelectorAll("script").length,
    images: root.querySelectorAll("img, image").length,
    xlink: /xlink:href/.test(html),
    // The only two http strings in a label sheet are the payload encoded into
    // each QR's aria-label and the SVG namespace, neither of which is fetched.
    // Anything else would need the network to render on paper.
    httpOutsideAria: html
      .replace(/aria-label="[^"]*"/g, "")
      .replace(/xmlns="[^"]*"/g, "")
      .match(/https?:\/\//g) || [],
  };
});
eq(external.scripts, 0, "no <script> in the sheet (a saved file must not execute anything)");
eq(external.images, 0, "no <img> or <image>");
eq(external.xlink, false, "no xlink:href");
ok(external.httpOutsideAria.length === 0, "nothing fetches over the network", external.httpOutsideAria.join(" "));

/* ---------- calibration ---------- */
console.log("\ncalibration");

const cal = await page.evaluate(() => {
  const bar = document.querySelector(".lbl-calbar");
  return { w: bar.getBoundingClientRect().width, ticks: bar.querySelectorAll(".lbl-caltick").length };
});
// 100mm at 96dpi = 377.95px. This is the bar someone puts a steel rule against
// to catch the browser's silent "Fit to page" scaling.
ok(Math.abs(cal.w - 377.95) < 1.5, "the calibration bar is exactly 100mm", `${cal.w.toFixed(1)}px`);
eq(cal.ticks, 10, "ten 10mm ticks");

/* ---------- paging ---------- */
console.log("\npaging");

const paging = await page.evaluate(() => {
  const many = [];
  for (let i = 1; i <= 45; i++) many.push({ coll: "parts", o: { id: `P-SN6-${String(i).padStart(3, "0")}`, partName: `PART ${i}`, layupSchedule: "6X 195" } });
  window.RENDER(many, { calibrate: false });
  const sheets = [...document.querySelectorAll(".label-sheet")];
  return {
    n: sheets.length,
    tall: sheets.filter(s => s.getBoundingClientRect().height > 1057).length,
    perFirst: sheets[0].querySelectorAll(".label-cell").length,
  };
});
eq(paging.n, 3, "45 labels take 3 sheets of 20");
eq(paging.perFirst, 20, "20 cells on a full sheet");
eq(paging.tall, 0, "no sheet exceeds 11in");

/* ---------- start position ---------- */
console.log("\nstart position");

/* Partial sheets are the real cost driver on the Avery path: a 3-label batch
   otherwise wastes 7 labels. Skipping cells lets a part-used sheet be reused. */
const skipped = await page.evaluate(() => {
  window.RENDER([{ coll: "parts", o: { id: "P-SN6-099", partName: "X", layupSchedule: "6X 195" } }],
                { skip: 7, calibrate: false });
  const cells = [...document.querySelectorAll(".label-cell")];
  return { total: cells.length, empty: cells.filter(c => !c.querySelector(".lbl")).length };
});
eq(skipped.total, 8, "skipping 7 puts the label in cell 8");
eq(skipped.empty, 7, "the first 7 cells are left blank for the labels already peeled off");

/* ---------- the roll ---------- */
console.log("\non a roll");

/* tools/test_label_roll.mjs already proves the JS and the CSS agree about
   millimetres by parsing both files. What it cannot do is check that a browser
   AGREES WITH THEM — that the rule actually applies, that nothing in
   index.html's cascade overrides it, that the label inside is not overflowing
   its page. Layout is not arithmetic, so that part happens here.

   The number to care about is 101.6mm: cut a 29mm continuous roll at 101.6 and
   you have the Avery 5161 cell, which is the entire reason the roll needed no
   new label design. */
const roll = await page.evaluate(() => {
  window.RENDER_ROLL([
    { coll: "molds", o: { id: "MOLD-SN6-004", name: "UT INLET L/H", density: 30, location: "RFS" } },
    { markup: labelMarkup({ name: "SOLVENT CABINET", key: "FLAMMABLES ONLY" }) }
  ], { media: "dk2210" });
  const mm = px => Math.round((px / 96) * 25.4 * 10) / 10;
  const pages = [...document.querySelectorAll(".roll-page")];
  const first = pages[0].getBoundingClientRect();
  const lbl = pages[0].querySelector(".lbl").getBoundingClientRect();
  const custom = pages[1];
  return {
    n: pages.length,
    w: mm(first.width), h: mm(first.height),
    // The label must fill the page: a .lbl smaller than its page prints a white
    // margin onto tape that has no margin to give.
    fills: Math.abs(lbl.width - first.width) < 1 && Math.abs(lbl.height - first.height) < 1,
    // and must not burst it, which is what would eat the FEB tag or the QR.
    bursts: pages.some(p => {
      const b = p.getBoundingClientRect(), l = p.querySelector(".lbl").getBoundingClientRect();
      return l.right > b.right + 0.5 || l.bottom > b.bottom + 0.5;
    }),
    qr: !!pages[0].querySelector(".lbl-qr"),
    customHasNoIdRow: !custom.querySelector(".lbl-rid"),
    customVisible: custom.querySelector(".lbl-name").checkVisibility(),
    wsPage: document.querySelectorAll(".roll-page.ws-page").length
  };
});
eq(roll.n, 2, "two labels, two pages");
eq(roll.w, 101.6, "a DK-2210 page is 101.6mm long");
eq(roll.h, 25.4, "and 25.4mm tall — the 5161 cell");
ok(roll.fills, "the label fills its page edge to edge");
ok(!roll.bursts, "and does not overflow it");
ok(roll.qr, "the record label still carries its QR");
ok(roll.customHasNoIdRow, "a custom label with no id emits no ID row");
ok(roll.customVisible, "and actually paints");
eq(roll.wsPage, 0, "no roll page is .ws-page (sheetFileHtml pads those 0.45in)");

// The die-cut hedge, which is the only media whose geometry differs.
const diecut = await page.evaluate(() => {
  window.RENDER_ROLL([{ markup: labelMarkup({ name: "SHELF B3", key: "STORAGE" }, { narrow: true }) }],
                     { media: "dk1201" });
  const mm = px => Math.round((px / 96) * 25.4 * 10) / 10;
  const p = document.querySelector(".roll-page").getBoundingClientRect();
  return { w: mm(p.width), h: mm(p.height) };
});
eq(diecut.w, 86.6, "a DK-1201 page is 86.6mm long");
eq(diecut.h, 26.4, "and 26.4mm tall");

if (SHOTS) {
  await page.evaluate(recs => window.RENDER(recs, { calibrate: true }), RECS);
  await page.locator(".label-sheet").screenshot({ path: join(SHOTS, "sheet.png") });
  await page.evaluate(recs => window.RENDER_ROLL(recs.slice(0, 4), { media: "dk2210" }), RECS);
  await page.locator(".wsheet.rolls").screenshot({ path: join(SHOTS, "roll.png") });
  console.log(`\nscreenshots in ${SHOTS}`);
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
