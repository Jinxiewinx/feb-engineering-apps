"use strict";
/* print.js — builds the printed work-order traveler.

   The printed sheet is its own document, not the screen view with the chrome
   hidden. It renders into #printroot (outside #app); index.html's @media print
   swaps which of the two is visible. Styles live in print.css and apply on
   screen too, so the preview here is exactly what comes out of the printer.

   Two ideas drive the layout:
   1. Every field is a BOX, whether or not the app has data for it. A work order
      printed from a half-filled record and a blank form off the shelf are the
      same document, one just arrives with more of it already inked.
   2. Every list ends in blank ruled rows. Layups grow steps, plies and BOM lines
      at the bench that nobody predicted at the desk, and if there's no room to
      write them they end up on the back of someone's hand.

   The sheet is capped at TWO PAGES. Writing space is not fixed: the fit loop
   below renders the sheet, measures it, and walks down a ladder of progressively
   tighter layouts until it fits. A short work order gets a lot of room to write,
   a long one gets less, and neither spills onto a third page that walks away
   from the first two. */

const MAX_PAGES = 2;
const PX_PER_IN = 96;        // CSS definition, so it holds for print layout too
const PAGE_IN = 10.1;        // Letter (11in) less the 0.45in @page margins
/* Real pagination breaks earlier than a naive height/page division, because
   break-inside:avoid pushes whole rows and sections onto the next sheet. This
   discount buys room for that so the measured fit isn't optimistic. */
const FIT_SAFETY = 0.93;

/* Layout ladder, most generous first. The fit loop takes the first one that
   comes in at or under MAX_PAGES, so a sparse work order keeps the big writing
   areas and only a dense one gets squeezed. The last entry is the floor. */
const LAYOUTS = [
  { rows: { steps: 10, stack: 10, bom: 8, quality: 5, events: 10 }, notes: "h8" },
  { rows: { steps: 8, stack: 8, bom: 6, quality: 4, events: 8 }, notes: "h6" },
  { rows: { steps: 6, stack: 6, bom: 5, quality: 3, events: 6 }, notes: "h6" },
  { rows: { steps: 5, stack: 4, bom: 4, quality: 3, events: 5 }, notes: "h4" },
  { rows: { steps: 4, stack: 3, bom: 3, quality: 2, events: 4 }, notes: "h4" },
  { rows: { steps: 3, stack: 3, bom: 2, quality: 2, events: 3 }, notes: "h3" },
  { rows: { steps: 2, stack: 2, bom: 2, quality: 1, events: 2 }, notes: "h3" },
  { rows: { steps: 2, stack: 1, bom: 1, quality: 1, events: 1 }, notes: "h2" },
  { rows: { steps: 1, stack: 1, bom: 1, quality: 1, events: 1 }, notes: "h2", compact: true },
];

/* Retro records carry the literal string "not recorded (retro)" in most fields.
   Printing that into a box is noise and, worse, it looks like data. Treat it as
   empty so the box stays writable. */
function pv(v) {
  const s = String(v ?? "").trim();
  return (!s || /not recorded/i.test(s)) ? "" : s;
}
function pcell(v, extra) {
  const s = pv(v);
  return `<div class="val ${s ? "filled" : ""} ${extra || ""}">${esc(s)}</div>`;
}
function pfield(label, v, cls, extra) {
  return `<div class="ws-f ${cls || ""}"><div class="lab">${esc(label)}</div>${pcell(v, extra)}</div>`;
}
/* "MoldWetLay" is a database value, not something to hand a person at a bench.
   Reads the catalog since September 2026, so a technique a lead renamed prints
   under the name the shop actually calls it. Falls back to un-camel-casing the
   id, which is what this did for everything before the catalog existed. */
function humanProcess(p) {
  const name = typeof techniqueById === "function" && p ? techniqueById(p).name : "";
  return (name || pv(p).replace(/([a-z])([A-Z])/g, "$1 $2")).toUpperCase();
}
function blankRows(n, cells) {
  let out = "";
  for (let i = 0; i < n; i++) out += `<tr class="blank">${cells}</tr>`;
  return out;
}

/* Steps for a blank form come from the standard list for the process, so a
   printed blank is a real procedure rather than empty ruling. */
// Goes through the same template-to-step helper the app uses, so a blank form
// carries the step rules (and therefore prints its hold lines) rather than
// quietly being a different shape from a real work order.
function blankSteps(process) {
  return techniqueSteps(process).map(stepFromTemplate);
}

function woSheetHtml(wo, opts) {
  opts = opts || {};
  const blank = !!opts.blank;
  const L = opts.layout || LAYOUTS[4];
  const R = L.rows;
  const steps = wo.steps && wo.steps.length ? wo.steps : blankSteps(wo.processType);
  const mold = wo.mold || {};
  const stack = wo.layupStack || [];
  const bom = wo.bom || [];
  const qc = wo.qualityChecks || [];
  const ev = wo.timeline || [];
  const strip = typeof stripCS === "function" ? stripCS : (t => t);

  /* TWO AXES, TWO STAMPS.

     "Blank form" / "Retro record" / "Draft" describe THE SHEET, and are
     mutually exclusive by construction — a sheet is exactly one of them.
     "R&D" describes THE PART: real carbon, real cost, not a season deliverable.
     That is true of a Draft R&D work order and of a Complete one alike.

     Folding R&D into that ternary would make an R&D Draft print as one word or
     the other, and whichever arm lost would be wrong on somebody's bench. Two
     independent elements cost one flex child in a masthead that already centres
     its stamp in empty space, and they can never contradict each other.

     R&D prints FIRST, immediately right of the brand, because it qualifies what
     the sheet is about; the kind word qualifies the sheet itself. A blank form
     gets no R&D stamp — it has no work order to ask. */
  const stampTxt = blank ? "Blank form" : (wo.retro ? "Retro record" : (wo.status === "Draft" ? "Draft" : ""));
  const rndTxt = (!blank && woIsRnd(wo)) ? "R&D — not a season deliverable" : "";

  /* One printed line for a step that waits on a cure. On a blank form the
     length isn't known yet (it depends on what gets mixed), so the form asks
     for the resin too and every value prints as a rule. */
  const RULE = "  __________  ";
  function holdSheetLine(s, prev, isBlank) {
    const rule = typeof stepRule === "function" ? stepRule(s) : (s && s.rule);
    if (!rule || rule.kind !== "hold") return "";
    const cure = !isBlank && prev && prev.cure;
    const r = cure && typeof resinById === "function" ? resinById(cure.resin) : null;
    if (!r) return `Hold before this step — resin${RULE}· hold${RULE}h · started${RULE}· ready${RULE}`;
    const started = cure.startedAt ? String(cure.startedAt).slice(0, 16).replace("T", " ") : RULE;
    const ready = typeof fmtReadyAt === "function" ? fmtReadyAt(cure.startedAt, r.febHoldH) : "";
    return `Hold ${r.febHoldH} h after ${esc(strip(prev.title || "the previous step")).toLowerCase()} · ${esc(r.label)} · started ${esc(started)} · ready ${esc(ready || RULE)}`;
  }

  /* The lots that went in, printed under the hold line.
   *
   * A traveler that records the resin SYSTEM but not the resin LOT answers "what
   * did we use" and not "which batch", and the second is the question a bad
   * panel raises in March. Blank forms get rules to write on, because the whole
   * point of the printed traveler is that it works when the phone does not.
   *
   * `lotSource` prints too, and unflatteringly: an inferred lot that looks
   * exactly like a verified one is worse than no lot at all. */
  function lotSheetLine(s, prev, isBlank) {
    const rule = typeof stepRule === "function" ? stepRule(s) : (s && s.rule);
    if (!rule || rule.kind !== "hold") return "";
    const cure = !isBlank && prev && prev.cure;
    const name = id => {
      if (!id || id === "unknown") return "not recorded";
      const l = (typeof DB !== "undefined" && (DB.lots || []).find(x => x.id === id));
      return l ? `${l.name || id}${l.vendorLot ? " (lot " + l.vendorLot + ")" : ""}` : id;
    };
    if (!cure || !(cure.lotFabric || cure.lotResin || cure.lotHardener || cure.lotSource)) {
      return `Lots in — fabric${RULE}· resin${RULE}· hardener${RULE}`;
    }
    const src = cure.lotSource && cure.lotSource !== "recalled" ? ` · ${esc(cure.lotSource)}` : "";
    return `Lots in — fabric ${esc(name(cure.lotFabric))} · resin ${esc(name(cure.lotResin))} · hardener ${esc(name(cure.lotHardener))}${src}`;
  }

  /* ---- steps: the centerpiece ---- */
  const stepRows = steps.map((s, si) => {
    const isBlk = typeof isBlocker === "function" && isBlocker(s, wo);
    const signed = !blank && typeof isSigned === "function" && isSigned(s);
    const nm = signed ? pv(s.buyoff && s.buyoff.name) : "";
    const dt = signed ? pv(s.buyoff && s.buyoff.date) : "";
    const note = blank ? "" : strip(pv(s.notes));
    /* A hold has to print as something writable. The screen can count down; a
       sheet on the bench can only carry the rule and two blanks for whoever is
       standing there to fill in. Rules rather than prose so a pen has somewhere
       to go, and the resin prints too — the hold length means nothing without
       knowing what it was for. */
    const holdLine = holdSheetLine(s, steps[si - 1], blank);
    const lotLine = lotSheetLine(s, steps[si - 1], blank);
    return `<tr class="${isBlk ? "blk" : ""}">
      <td class="num seq">${esc(s.seq || "")}</td>
      <td>
        <div class="stitle"><span class="ws-cb"></span>${esc(strip(s.title))}</div>
        ${isBlk ? `<div class="blkflag">Blocker: no sign-off, no moving on</div>` : ""}
        ${holdLine ? `<div class="holdflag">${holdLine}</div>` : ""}
        ${lotLine ? `<div class="holdflag">${lotLine}</div>` : ""}
        ${note ? `<div class="cs">${esc(note)}</div>` : ""}
      </td>
      <td class="initial">${nm ? `<span class="signed"><span class="nm">${esc(nm)}</span></span>` : ""}</td>
      <td class="datec ${dt ? "" : "empty"}">${esc(dt)}</td>
    </tr>`;
  }).join("");

  /* ---- ply stack: a table, because the screen's colour bars mean nothing in B&W ---- */
  const stackRows = (blank ? [] : stack).map((p, i) => `<tr class="${typeof plyClass === "function" ? plyClass(p.material) : "other"}">
      <td class="sw"></td>
      <td class="num">${i + 1}</td>
      <td class="mat">${esc(pv(p.material))}</td>
      <td>${esc(pv(p.orientation))}</td>
      <td>${esc(pv(p.coverage))}</td>
      <td>${esc(strip(pv(p.notes)))}</td>
    </tr>`).join("");

  const bomRows = (blank ? [] : bom).map(b => `<tr>
      <td>${esc(strip(pv(b.item)))}</td><td class="num">${esc(pv(b.qty))}</td><td>${esc(pv(b.unit))}</td>
      <td>${esc(strip(pv(b.source)))}</td><td>${
        // Ref-priced lines (copied from the part's plan) print their computed
        // cost; hand-typed estCost prints verbatim. Money on the paper at the
        // bench is a cost-visibility surface Simon picked on purpose.
        esc(pv(b.estCost)) || (typeof bomLineCost === "function" && bomLineCost(b) != null ? esc(fmtMoney(bomLineCost(b))) : "")}</td></tr>`).join("");
  const bomTotalHint = (() => {
    if (blank || typeof bomRollupText !== "function") return "";
    const t = bomRollupText(bom);
    return t ? `Materials in this part: ${t}` : "";
  })();

  const qcRows = (blank ? [] : qc).map(q => `<tr>
      <td>${esc(strip(pv(q.criterion)))}</td><td>${esc(strip(pv(q.target)))}</td><td>${esc(strip(pv(q.actual)))}</td>
      <td class="num">${q.pass === true ? "PASS" : q.pass === false ? "FAIL" : ""}</td></tr>`).join("");

  const evRows = (blank ? [] : ev).map(t => `<tr>
      <td class="datec ${pv(t.date) ? "" : "empty"}">${esc(pv(t.date))}</td><td>${esc(strip(pv(t.note)))}</td></tr>`).join("");

  /* table.pgflow: the traveler is ONE element flowing across two physical
     pages, and with @page margin 0 (no band for the browser's URL/date
     chrome) a flowing element has no top margin on its continuation page.
     A table's header and footer groups repeat on every page the table spans,
     so 0.45in spacer rows in thead/tfoot ARE the vertical page margins, on
     page 2 as well as page 1. Print-only; on screen they are zero-height and
     the .ws-page padding draws the preview margins as before. */
  return `<div class="wsheet ${L.compact ? "compact" : ""}"><div class="ws-page"><table class="pgflow"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="ws-head">
    <div class="brand">FEB COMPOSITES <span class="sub">SN6</span></div>
    ${rndTxt ? `<div class="ws-stamp rnd">${esc(rndTxt)}</div>` : ""}
    ${stampTxt ? `<div class="ws-stamp">${esc(stampTxt)}</div>` : ""}
    <div class="idblock">
      <div class="idcell"><div class="lab">Work order</div><div class="val">${esc(blank ? "" : pv(wo.id))}</div></div>
      <div class="idcell"><div class="lab">Rev</div><div class="val">${esc(blank ? "" : pv(wo.revision))}</div></div>
      <div class="idcell wide"><div class="lab">Process</div><div class="val">${esc(humanProcess(wo.processType))}</div></div>
    </div>
  </div>
  <div class="ws-rule"></div>
  <div class="ws-sheetkind">
    <span>Manufacturing traveler. Fill it in at the bench, then transcribe it into the app.</span>
    <span>Printed ${esc(today())}</span>
  </div>

  <div class="ws-h">Part and assignment</div>
  <div class="ws-grid">
    ${pfield("Part name", blank ? "" : wo.partName, "span2")}
    ${pfield("Subteam", blank ? "" : wo.subteam)}
    ${pfield("Status", blank ? "" : wo.status)}
    ${/* The masthead is what gets cut off in a photocopier or cropped out of a
          phone photo, so the fact is on the page a second time. CONDITIONAL on
          purpose: a season traveler renders byte-identical markup to before, so
          the nine-rung fit ladder sees no change at all for 100% of existing
          records, and only an R&D sheet can be pushed a rung — into `compact`,
          which is a designed floor rather than a failure. */""}
    ${rndTxt ? pfield("Build type", rndTxt, "span2") : ""}
    ${pfield("Mold engineer", blank ? "" : personText(wo, "moldEngineer"))}
    ${pfield("Manufacturing engineer", blank ? "" : personText(wo, "manufacturingEngineer"))}
    ${pfield("Created", blank ? "" : wo.createdDate, "", "date")}
    ${pfield("Due", blank ? "" : wo.dueDate, "", "date")}
    ${pfield("Mass target (g)", blank ? "" : wo.weightTargetG)}
    ${pfield("Mass actual (g)", blank ? "" : wo.weightActualG)}
    ${pfield("Mold ID", blank ? "" : mold.moldId)}
    ${pfield("Mold location", blank ? "" : mold.location)}
  </div>

  <div class="ws-h">Mold</div>
  <div class="ws-grid c3">
    ${pfield("Tooling board layers", blank ? "" : mold.layers)}
    ${pfield("Density (lb/ft³)", blank ? "" : mold.density)}
    ${pfield("Sealing system", blank ? "" : strip(pv(mold.sealingType)))}
  </div>

  <div class="ws-h">Layup stack${!blank && pv(wo.stackNote) ? ` <span class="hint">${esc(strip(pv(wo.stackNote)))}</span>` : ""}</div>
  <table class="ws-t stack rows">
    <thead><tr><th class="sw"></th><th class="num">Ply</th><th>Material</th><th>Orientation</th><th>Coverage</th><th>Notes</th></tr></thead>
    <tbody>${stackRows}${blankRows(R.stack, '<td class="sw"></td><td class="num"></td><td></td><td></td><td></td><td></td>')}</tbody>
  </table>

  <div class="ws-h">Steps and buy-offs <span class="hint">initial and date each step as it is completed</span></div>
  <table class="ws-t steps">
    <thead><tr><th class="num">#</th><th>Operation</th><th class="initial">Initial</th><th class="datec">Date</th></tr></thead>
    <tbody>${stepRows}${blankRows(R.steps, '<td class="num seq"></td><td></td><td class="initial"></td><td class="datec empty"></td>')}</tbody>
  </table>

  <div class="ws-h">Bill of materials${bomTotalHint ? ` <span class="hint">${esc(bomTotalHint)}</span>` : ""}</div>
  <table class="ws-t rows">
    <thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th>Source</th><th>Est. cost</th></tr></thead>
    <tbody>${bomRows}${blankRows(R.bom, "<td></td><td></td><td></td><td></td><td></td>")}</tbody>
  </table>

  <div class="ws-h">Quality checks <span class="hint">set the target before the work starts</span></div>
  <table class="ws-t rows">
    <thead><tr><th>Criterion</th><th>Target</th><th>Actual</th><th class="num">Pass</th></tr></thead>
    <tbody>${qcRows}${blankRows(R.quality, "<td></td><td></td><td></td><td></td>")}</tbody>
  </table>

  <div class="ws-h">Event log <span class="hint">what actually happened, including what went wrong</span></div>
  <table class="ws-t rows">
    <thead><tr><th class="datec">Date</th><th>Event</th></tr></thead>
    <tbody>${evRows}${blankRows(R.events, '<td class="datec empty"></td><td></td>')}</tbody>
  </table>

  <div class="ws-h">Notes</div>
  <div class="ws-lines ${L.notes}">${!blank && pv(wo.notes) ? `<div class="prefill">${esc(strip(pv(wo.notes)))}</div>` : ""}</div>

  <div class="ws-sign">
    <div class="ws-h">Release sign-off</div>
    <div class="ws-signgrid">
      <div class="ws-sigbox">
        <div class="role">Manufacturing engineer</div>
        <div class="who">${esc(blank ? "" : pv(personText(wo, "manufacturingEngineer")))}&nbsp;</div>
        <div class="ws-sigrow"><div class="sigline"></div><div class="dateline"></div></div>
        <div class="ws-caps"><div class="c1 cap">Signature</div><div class="c2 cap">Date</div></div>
      </div>
      <div class="ws-sigbox">
        <div class="role">Composites lead or requesting subteam lead</div>
        <div class="who">&nbsp;</div>
        <div class="ws-sigrow"><div class="sigline"></div><div class="dateline"></div></div>
        <div class="ws-caps"><div class="c1 cap">Signature</div><div class="c2 cap">Date</div></div>
      </div>
    </div>
  </div>

  </td></tr></tbody></table>
  <div class="ws-foot">
    <span>${esc(blank ? "Blank traveler" : pv(wo.id))}${!blank && pv(wo.revision) ? " · Rev " + esc(pv(wo.revision)) : ""}</span>
    <span>${esc(pv(wo.partName))}</span>
    <span class="sp">Page <span class="pg"></span> of <span class="pg"></span></span>
  </div>
</div></div>`;
}

/* ---------- two-page auto-fit ---------- */

function printRoot() { return document.getElementById("printroot"); }

/* Height of the rendered sheet in pages. Measured off the live DOM rather than
   estimated from row counts, because ply notes and long part names wrap. */
function measurePages(host) {
  const page = host.querySelector(".ws-page");
  if (!page) return 1;
  const content = page.scrollHeight - 2 * 0.45 * PX_PER_IN;
  return content / (PAGE_IN * PX_PER_IN * FIT_SAFETY);
}

/* Render at the most generous layout that still fits MAX_PAGES. Falls back to
   the tightest layout if even that overflows, which needs a work order with far
   more steps and plies than anything SN5 produced. */
function fitSheetHtml(wo, opts) {
  const host = printRoot();
  if (!host || !host.getBoundingClientRect) return woSheetHtml(wo, { ...opts, layout: LAYOUTS[4] });
  const prevHtml = host.innerHTML, prevClass = host.className;
  host.className = "measuring";
  let chosen = LAYOUTS[LAYOUTS.length - 1];
  for (const layout of LAYOUTS) {
    host.innerHTML = woSheetHtml(wo, { ...opts, layout });
    if (measurePages(host) <= MAX_PAGES) { chosen = layout; break; }
  }
  host.innerHTML = prevHtml; host.className = prevClass;
  return woSheetHtml(wo, { ...opts, layout: chosen });
}

/* ---------- mounting + preview ---------- */

/* Width of a Letter sheet in CSS px — 8.5in at the spec's 96px/in. The one
   number the fit is computed against. */
const SHEET_PX = 8.5 * PX_PER_IN;

/* Shrink the sheet until it fits the screen, and never enlarge it. Called on
   mount and on resize/orientation change; see the note in print.css for why this
   is a zoom rather than a reflow, and why it is a zoom rather than a transform.
   The 12px is breathing room either side so the sheet reads as paper on a
   background rather than as the page itself. */
function fitPreview() {
  const root = printRoot();
  if (!root || !root.classList || !root.classList.contains("preview")) return 1;
  const avail = Math.max(1, (document.documentElement || {}).clientWidth || SHEET_PX) - 12;
  const z = previewZoom(avail);
  root.style.setProperty("--pv-zoom", String(z));
  return z;
}
// Pure, so the fit is testable without a browser.
function previewZoom(availPx) {
  if (!(availPx > 0)) return 1;
  return Math.min(1, Math.round((availPx / SHEET_PX) * 1000) / 1000);
}

/* `caption` describes the document being previewed. The traveler is always two
   pages so it used to be hardcoded; the mold drawing set is 2 + one sheet per
   layer, and a preview bar that says "two pages" over a nine-sheet document is
   worse than no caption at all. `save` is the filename stem for the download —
   omitted, the Save button is left off.

   Save exists because on a phone the print dialog is the OS's, not ours, and
   what people actually wanted was the sheet ON THE DEVICE: to keep, to send, to
   open at the bench with no signal. It writes a self-contained HTML file rather
   than a PDF because a PDF needs a library, and this app ships no external
   scripts — see sheetFileHtml. Print still works, and on both iOS and Android
   its dialog offers Save as PDF, which is the shortest route to a real PDF. */
function mountSheet(html, previewMode, caption, save) {
  const root = printRoot();
  if (!root) return null;
  // body.sheet is what tells @media print to print the sheet instead of the app.
  // Without it every other tab (status board, documents) would print blank.
  document.body.classList.add("sheet");
  PRINT_SAVE_NAME = save || "";
  root.innerHTML = (previewMode ? `
    <div class="pv-bar no-print">
      <span class="t">Print preview</span>
      <span class="cap">${esc(caption || "US Letter · two pages · this is exactly what prints")}</span>
      <span class="sp"></span>
      <label><input type="checkbox" onchange="toggleGrayProof(this.checked)"> B&amp;W proof</label>
      <button onclick="closePrintPreview()">Close</button>
      ${save ? `<button onclick="downloadSheet()">Save</button>` : ""}
      <button class="primary" onclick="window.print()">Print</button>
    </div>` : "") + html;
  root.className = previewMode ? "preview" : "";
  fitPreview();
  return root;
}

/* ---------- saving the sheet to the device ---------- */

let PRINT_SAVE_NAME = "";

/* The mounted sheet as a standalone document: the same markup, with the same
   stylesheet inlined, so the file on the phone prints identically to the file in
   the app. The preview furniture is dropped — it is app chrome, not the sheet —
   and so is the zoom, which is a screen aid for a small display and would
   otherwise be baked into the saved copy.

   Pure, so the assembly is testable without a browser. */
function sheetFileHtml(bodyHtml, css, title) {
  const clean = String(bodyHtml || "").replace(/<div class="pv-bar no-print">[\s\S]*?<\/div>\s*(?=<div)/, "");
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || "FEB Composites")}</title>
<style>
@page { size: letter; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.ws-page, .dwg-page { margin: 0 auto 14px; }
/* With @page margin 0 (no band for the browser's URL/date chrome) the
   sheet's own padding is the page margin: side padding on the flowing
   traveler (its vertical margins repeat via table.pgflow's spacer rows),
   full padding on a drawing sheet, which is one element per page. */
@media print { .ws-page, .dwg-page { width: auto; min-height: 0; padding: 0 0.45in; margin: 0; box-shadow: none; } .dwg-page { padding: 0.45in; min-height: 10.92in; } }
${css || ""}
</style></head>
<body>${clean}</body></html>`;
}
function sheetFileName(stem) {
  const safe = String(stem || "sheet").replace(/[^\w.\- ]+/g, "-").replace(/\s+/g, " ").trim() || "sheet";
  return `${safe}.html`;
}

/* Fetch the stylesheet rather than reading document.styleSheets: a cross-origin
   or not-yet-loaded sheet throws on .cssRules, and print.css is served from the
   same origin as the app, so a plain fetch is both simpler and can't half-work. */
async function downloadSheet() {
  const root = printRoot();
  if (!root) return;
  let css = "";
  try { css = await (await fetch("print.css")).text(); }
  catch (e) { toast("Couldn't read the sheet styles, so the saved file may look plain.", "error"); }
  const name = PRINT_SAVE_NAME || "sheet";
  downloadBlob(sheetFileName(name), new Blob([sheetFileHtml(root.innerHTML, css, name)], { type: "text/html" }));
  toast(`Saved ${sheetFileName(name)} to your device.`);
}
function toggleGrayProof(on) {
  const root = printRoot(); if (!root) return;
  root.className = "preview" + (on ? " gray" : "");
}
function closePrintPreview() {
  const root = printRoot(); if (!root) return;
  root.innerHTML = ""; root.className = "";
  root.style.removeProperty("--pv-zoom");
  PRINT_SAVE_NAME = "";
  document.body.classList.remove("previewing", "sheet");
}

function woForPrint(id) {
  const wo = typeof woById === "function" ? woById(id) : recById("workOrders", id);
  if (!wo) { if (typeof toast === "function") toast("Work order " + id + " not found.", "error"); return null; }
  return wo;
}

/* Preview first rather than printing straight away: paper is the expensive step,
   and a bad pagination is only obvious once you can see the page. */
function openPrintPreview(id) {
  const wo = woForPrint(id); if (!wo) return;
  mountSheet(fitSheetHtml(wo, {}), true, null, `${pv(wo.id) || "work order"} traveler`);
  document.body.classList.add("previewing");
  window.scrollTo(0, 0);
}
function printWO(id) {
  const wo = woForPrint(id); if (!wo) return;
  mountSheet(fitSheetHtml(wo, {}), false);
  window.print();
}
/* A stack of blanks to take to the shop. */
function printBlankWO(process) {
  const p = process || "MoldInfusion";
  const empty = { processType: p, steps: [], layupStack: [], bom: [], qualityChecks: [], timeline: [] };
  mountSheet(fitSheetHtml(empty, { blank: true }), true, null, `blank ${humanProcess(p).toLowerCase()} traveler`);
  document.body.classList.add("previewing");
  window.scrollTo(0, 0);
}

/* ⌘P on a work order should produce the traveler, not a blank page or a
   screenshot of the app. If nothing is mounted and the user is looking at a WO,
   mount it for them; anything else prints the screen view as it always did. */
function autoMountForPrint() {
  if (document.body.classList.contains("sheet")) return;
  if (typeof view === "undefined") return;
  /* The R&D bench renders the real traveler, so ⌘P has to mount it there too.
     A traveler you cannot print is a screenshot. */
  const onRun = view.tab === "workorders" || (view.tab === "rnd" && view.rdPane === "run");
  if (!onRun || view.mode !== "detail" || !view.id) return;
  const wo = typeof woById === "function" ? woById(view.id) : null;
  if (wo) mountSheet(fitSheetHtml(wo, {}), false);
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("beforeprint", autoMountForPrint);
  /* Re-fit on rotate and on resize. A phone turned to landscape gains 400px of
     width, and a preview stuck at the portrait zoom wastes half the screen —
     which on the one device where the sheet is hardest to read is the wrong
     half. No-ops when nothing is mounted. */
  window.addEventListener("resize", fitPreview);
  window.addEventListener("orientationchange", fitPreview);
  // Tear the sheet down after a direct (non-preview) print so the app isn't
  // left with a hidden document mounted behind it.
  window.addEventListener("afterprint", () => {
    const root = printRoot();
    if (root && !document.body.classList.contains("previewing")) {
      root.innerHTML = ""; root.className = "";
      document.body.classList.remove("sheet");
    }
  });
}
