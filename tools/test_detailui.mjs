/* test_detailui.mjs — the detail pages, POPULATED, measured on a phone.
 *
 * WHY THIS EXISTS
 * tools/test_appui.mjs audits eleven tabs at four widths and passes clean. It
 * also never opens a record, and every fixture it renders has `comments: []`,
 * no `docs` and no `files`. So the thing Simon actually reported — open a work
 * order that has comments and linked documents on a phone, and the page runs
 * off the side of the screen, the browser zooms out to fit it, and text clips —
 * was invisible to the suite by construction. An empty thread cannot overflow.
 *
 * This is the missing half: lib/fixtures-content.mjs fills those fields with
 * the shapes that actually break a narrow layout (a bare 120-character Drive
 * URL, an underscore-joined CAD filename, a 600-character single-paragraph
 * update, a pasted six-column table, a code block), then every detail page is
 * opened and measured.
 *
 *   node tools/test_detailui.mjs
 *   node tools/test_detailui.mjs --view wo-detail
 *   node tools/test_detailui.mjs --width 393
 *   node tools/test_detailui.mjs --shots /tmp/shots     also write PNGs
 *
 * WHAT IT ASSERTS, and why each one is its own check
 *   page h-overflow   the document scrolling sideways IS the zoom-out. Mobile
 *                     Safari fits the layout viewport to the widest content, so
 *                     one 120-character URL shrinks the whole page.
 *   spills            an element past the right edge, named, so the fix has an
 *                     address. Excludes anything inside a deliberate scroller.
 *   clipping          overflow:hidden with content wider than the box AND no
 *                     text-overflow:ellipsis. Ellipsis is a designed truncation
 *                     and passes; a hard cut with no affordance does not.
 *   runaway height    one comment taller than three phone screens means the
 *                     text is wrapping one or two words per line, which is the
 *                     "long messages split over many lines" half of the report.
 *   tap targets       same 40px floor test_appui.mjs uses, applied to the
 *                     controls that only exist once a record has content: the
 *                     per-comment edit and delete buttons, Open on a doc row.
 *
 * Needs Playwright, same as the other browser tests, and skips loudly without
 * it. Nothing here touches Firebase.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage, splashGone } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";
import { APPLY_CONTENT, PHOTO_URL } from "./lib/fixtures-content.mjs";
import { readFile } from "node:fs/promises";

function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; return; }
  fail++;
  failures.push(`${name}${detail ? " — " + detail : ""}`);
  console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
};

/* Three narrow widths and one wide control. 320 is the smallest phone still in
   use (iPhone SE 1st gen, and the width Chrome's device toolbar defaults to for
   "Galaxy Fold" folded); 393 is an iPhone 15; 430 is a 15 Pro Max. The wide one
   is here so a failure can be read as "narrow only" or "everywhere", which is
   the difference between a media query bug and a missing wrap rule. */
const WIDTHS = [
  { w: 320, h: 780, id: "320", coarse: true },
  { w: 393, h: 852, id: "393", coarse: true },
  { w: 430, h: 932, id: "430", coarse: true },
  { w: 1440, h: 1000, id: "1440", coarse: false },
];

/* Each view names the tab, how to get into it, and what it is for. `open` runs
   in the page after the tab is set. `needs` is a string that MUST appear in
   main — per view rather than one global rule, because "populated" means a
   different thing on each: a thread on a work order, a linked document on the
   weekly plan, a pinned one on the shelf. A single shared token would either
   miss a view or exempt one, and an exempted view is one that passes every
   check below while rendering nothing. Kept declarative so adding a populated
   surface is one row. */
const VIEWS = [
  /* The work-order RAIL, populated and with nothing selected. test_appui walks
     this tab but never seeds it and never goes below 393; the rail is where a
     long part name, a progress bar and a status pill compete for 320px, so it
     is the surface most likely to spill. Grouped by part, which is the default
     and the densest arrangement. */
  { id: "wo-list", tab: "workorders", what: "the work order index grouped by part, nothing selected",
    open: `setTab("workorders")`, needs: "work orders" },
  { id: "wo-detail", tab: "workorders", what: "a work order with notes, documents and files",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id)`, needs: "inHg" },
  { id: "wo-detail-edit", tab: "workorders", what: "the same work order in edit mode",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id); view.edit = true; render()`, needs: "inHg" },
  { id: "part-detail", tab: "parts", what: "a part with a comment thread, documents and files",
    open: `openRecord("parts", (DB.parts[0] || {}).id)`, needs: "inHg" },
  { id: "ticket-detail", tab: "projects", what: "a ticket with a comment thread, documents and files",
    open: `openRecord("projects", (DB.projects[0] || {}).id)`, needs: "inHg" },
  { id: "budget-detail", tab: "budget", what: "a purchase with a long note",
    open: `openRecord("budget", (DB.budget[0] || {}).id)`, needs: "inHg" },
  /* The three physical-world tabs. A mold detail carries the longest name in
     the fixtures (55 characters) and a full reference chain; a panel carries a
     CS-002 stack string and four lot references. Both are read AND edit,
     because the edit view is a wall of inputs and is the one that overflows. */
  { id: "mold-detail", tab: "molds", what: "a mold with a very long name and reference chips",
    open: `openRecord("molds", (DB.molds[1] || {}).id)` },
  { id: "mold-detail-edit", tab: "molds", what: "the same mold in edit mode",
    open: `openRecord("molds", (DB.molds[1] || {}).id); view.edit = true; render()` },
  { id: "panel-detail", tab: "items", what: "a test panel with its stack and lot references",
    open: `openRecord("items", (DB.items[0] || {}).id)` },
  { id: "panel-detail-edit", tab: "items", what: "the same panel in edit mode",
    open: `openRecord("items", (DB.items[0] || {}).id); view.edit = true; render()` },
  { id: "lot-detail", tab: "lots", what: "a resin lot with dates and a mix ratio",
    open: `openRecord("lots", (DB.lots[0] || {}).id)` },
  { id: "lot-detail-edit", tab: "lots", what: "the same lot in edit mode",
    open: `openRecord("lots", (DB.lots[0] || {}).id); view.edit = true; render()` },
  { id: "weekplan", tab: "weekplan", what: "the weekly plan with documents linked",
    needs: "CAM notes" },
  { id: "documents", tab: "documents", what: "the documents shelf, with pinned links",
    needs: "CAM notes" },
  { id: "dashboard", tab: "dashboard", what: "the dashboard, with populated records behind it",
    needs: "" },
  /* Both cut states depend on MOLD-SN6-004 owning STK-SN6-001 in the fixture:
     the cut list only offers molds still at "Designed", and only their current
     plan, so an orphan plan photographs as an empty state. */
  { id: "cutlist", tab: "molds", what: "the cut list in cuts mode, with its mark-cut toolbar",
    open: `view = { ...view, mode: "cuts", cutSel: "" }; render()`,
    needs: "" },
  { id: "cutcommit-modal", tab: "molds", what: "the mark-these-boards-cut confirm, checkboxes and all",
    open: `view = { ...view, mode: "cuts", cutSel: "" }; render(); if (typeof openCommitCutsModal === "function") openCommitCutsModal();`,
    needs: "" },

  /* ---- the states that only exist while you are doing something ----
     Everything above is a page you can photograph. These are not: each is an
     overlay mounted outside #main, opened over populated content, and every one
     of them is where that content gets WRITTEN rather than read. A doc-link
     form on a phone, a step note being typed at the bench, a photo opened out
     of a comment — none of them had ever been measured at any width, because
     nothing in the suite opened them. `needs` is empty here: the audit measures
     the overlay, so a token from the page behind it is not what to look for. */
  { id: "lightbox", tab: "workorders", what: "a comment photo opened in the lightbox",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id);
           const im = document.querySelector("#main .comment .prose img"); if (im) openLightbox(im);`,
    needs: "" },
  { id: "doclink-modal", tab: "workorders", what: "the link-a-document form",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id);
           openDocLinkModal({ coll: "workOrders", id: DB.workOrders[0].id });`,
    needs: "" },
  { id: "stepnote-modal", tab: "workorders", what: "the full step-note composer, on a step that already has a long note",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id); openStepNote(DB.workOrders[0].id, 0);`,
    needs: "" },
  /* The three modals added with scanning. All get opened on a phone because
     that is the only device any of them will ever be used on: nobody scans a
     mold from a laptop, and the cure modal is filled in standing at the part. */
  { id: "scan-modal", tab: "molds", what: "the scanner, with the typed-code fallback",
    open: `scanToOpen();`, needs: "" },
  { id: "move-modal", tab: "molds", what: "moving something to a shelf",
    open: `openRecord("molds", (DB.molds[0] || {}).id); quickMove("molds", DB.molds[0].id);`, needs: "" },
  { id: "cure-lots-modal", tab: "workorders", what: "the cure buy-off with the lot fields filled in",
    open: `const w = { id: "WO-SN6-901", partName: "TEST", processType: "MoldInfusion", status: "InWork",
                       revision: "A", retro: false, timeline: [], layupStack: [{ material: "195 twill" }],
                       steps: blankSteps("MoldInfusion").map((s, i) => ({ ...s, seq: i + 1 })) };
           DB.workOrders.push(w);
           openRecord("workorders", w.id);
           openCureModal(w.steps.findIndex(s => startsHold(s)));`,
    needs: "" },
  { id: "addgoal-modal", tab: "weekplan", what: "the add-a-goal form",
    open: `const w = (DB.schedule || []).find(x => x.goals) || DB.schedule[0];
           openAddGoalModal(w.id, "arivera@berkeley.edu");`,
    needs: "" },
  { id: "composer-open", tab: "workorders", what: "the note composer expanded with a long draft in it",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id);
           openComposer("wo-note");
           const ed = document.getElementById("wo-note");
           /* The LONGEST comment, not the first. The first is the bare-URL one
              and it is 130 characters, so seeding from it measured an editor
              with almost nothing in it and called that a pass. */
           const src = [...document.querySelectorAll("#main .comment .prose")]
             .sort((a, b) => b.textContent.length - a.textContent.length)[0];
           if (ed && src) { ed.innerHTML = src.innerHTML; }`,
    needs: "" },
  { id: "drawer-open", tab: "workorders", what: "the navigation drawer over a populated record",
    open: `openRecord("workorders", (DB.workOrders[0] || {}).id); toggleDrawer();`,
    needs: "" },
];

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the populated detail pages")); process.exit(0); }

const STUB = `
window.fb = {
  guest: false,
  async signInGuest() { fb.guest = true; },
  state: "ready",
  user: { uid: "u1", email: "starbuck@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "starbuck@berkeley.edu" },
  rosterCheckFailed: false,
  save: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
  // The bulk delete path. Present here because the app calls it: a shim missing
  // it turns "delete these work orders" into a TypeError in every local run.
  delMany: async () => {}, deleteFiles: async (p) => ({ ok: (p || []).length, failed: [] }),
  upload: async () => ({ url: "", path: "", name: "", size: 0, type: "" }), deleteFile: async () => {},
  allocId: async () => "X-1", importMany: async () => {},
  rosterAll: async () => [], rosterSet: async () => {}, rosterDelete: async () => {},
  notify: async () => {}, markNotifRead: async () => {},
  signOut: async () => {}, refreshRoster: async () => {},
  getConfig: async () => null, setConfig: async () => {},
};
window.__seedError = null;
async function seed(coll, file, pick) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(file);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const arr = pick ? pick(json) : json;
      if (!Array.isArray(arr) || !arr.length) throw new Error(file + " parsed but held no records");
      window.onFbData(coll, arr);
      return;
    } catch (e) {
      window.__seedError = String((e && e.message) || e);
      window.onFbData(coll, []);
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
    }
  }
}
await seed("parts", "sn5-parts.json");
await seed("workOrders", "sn5-work-orders.json", j => Array.isArray(j) ? j : (j.workOrders || []));
await seed("schedule", "sn5-schedule.json");
await seed("stock", "sn5-stock.json");
${APPLY_FIXTURES}
${APPLY_CONTENT}
window.onFbChange("ready");
/* fb.state is "ready" from the first line of this stub, because the app reads
   it during boot — so waiting on it proves nothing and the audit ran against a
   half-seeded database. That is not hypothetical: it is why the first run of
   this file reported "no populated content" on four views whose fixtures were
   fine. Wait on this instead. */
window.__fixturesReady = true;
`;

/* One pass in the page. Same shape as test_appui.mjs's AUDIT — plain data out,
   assertions in node — so a failure line carries the number it measured.
   One template literal: no backticks below this line. */
const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  /* Not just #main. A modal, a lightbox and the drawer are the states a
     screenshot sweep of a tab can never reach, and they are where the
     populated content actually gets EDITED — the doc-link form, the step-note
     composer, a photo opened out of a comment. Each mounts outside #main, so
     an audit rooted there measured none of them. Whichever of these is on
     screen is the thing being measured; #main is the fallback. */
  const overlay = [...document.querySelectorAll("#modal .modal, #lightbox, nav.sidebar")]
    .filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none");
  const main = overlay.find(el => el.id === "lightbox" || el.classList.contains("modal"))
    || document.getElementById("main");
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const name = (el) => {
    const c = el.className && el.className.baseVal === undefined ? String(el.className) : "";
    return (el.tagName.toLowerCase() + (c ? "." + c.trim().split(/\\s+/).join(".") : "")).slice(0, 52);
  };
  /* Which of the three hostile fixture tokens is inside this element, if any.
     Turns "something spilled" into "the bare Drive URL spilled", which is the
     difference between a bug report and a fix. */
  const TOKENS = {
    url: "drive.google.com/file/d/1aBcDeFg",
    cad: "SN6_Undertray_Diffuser_MoldHalf_A",
    word: "polyoxymethylene-reinforced-toolingboard",
  };
  const blame = (el) => {
    const t = el.textContent || "";
    return Object.keys(TOKENS).filter(k => t.includes(TOKENS[k])).join("+") || "";
  };

  const isScroller = (el) => {
    const ox = getComputedStyle(el).overflowX;
    return (ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
      if (p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };

  const all = [...main.querySelectorAll("*")].filter(vis);

  /* Off the right edge, and not inside something that scrolls on purpose. */
  const spills = all
    .filter(el => !inScroller(el))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(o => o.r.right > vw + 1 || o.r.left < -1)
    .map(o => ({ cls: name(o.el), right: Math.round(o.r.right), left: Math.round(o.r.left), why: blame(o.el) }));

  /* Cut off with no affordance: the box hides its overflow, the content is
     wider than the box, and nothing tells the reader there is more. A designed
     ellipsis truncation is exempt — that is a decision, not a defect. A
     deliberate horizontal scroller is exempt for the same reason. */
  const clipped = all
    .filter(el => {
      /* A text input whose value is longer than the box is not clipped, it is
         a text input; you scroll it by typing in it. Same for a textarea and a
         select. And .vh is the screen-reader-only class, which is 1px by
         design and would report every label in the app. */
      if (/^(input|textarea|select)$/i.test(el.tagName)) return false;
      if (el.classList.contains("vh")) return false;
      const cs = getComputedStyle(el);
      if (cs.overflowX !== "hidden" && cs.overflowX !== "clip") return false;
      if (cs.textOverflow === "ellipsis") return false;
      return el.scrollWidth > el.clientWidth + 4;
    })
    .map(el => ({ cls: name(el), over: el.scrollWidth - el.clientWidth, why: blame(el),
      t: (el.textContent || "").trim().slice(0, 30) }));

  /* ---- content that is laid out but never painted, with no way to reveal it ----
     The generalised form of the bug that took the ticket page down on desktop.

     The vis() helper above — and every "is it visible" helper anyone writes —
     asks the DOM for boxes and computed styles. A closed <details> whose
     children carry an author display answers every one of those questions with
     "visible" and is still not drawn. The only API that knows is
     checkVisibility().

     Scoped deliberately to the case that is always a bug: unpainted content
     inside a closed <details> whose summary is ALSO not visible. If the summary
     is on screen the content is one tap away and that is a design decision, not
     a defect. If it is not, the content is unreachable and the user sees a hole
     where their data should be. Zero is the only acceptable number, and it
     costs nothing when it passes. */
  const orphaned = all.filter(el => {
    if (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.tagName === "DETAILS" && !p.open) {
        const s = p.querySelector(":scope > summary");
        return !(s && s.checkVisibility());
      }
    }
    return false;
  }).map(el => ({ cls: name(el), t: (el.textContent || "").trim().slice(0, 30) }));

  /* Anything that scrolls sideways, reported not asserted: a wide pasted table
     inside .tblwrap is the right answer, a .comment that scrolls is not. */
  const scrollers = all.filter(isScroller)
    .map(el => ({ cls: name(el), over: el.scrollWidth - el.clientWidth }));

  /* Runaway height. Measured on the containers that hold user text, because a
     tall PAGE is fine — a tall single comment is text wrapping two words to a
     line. Reported with its text length so the ratio is judgable: 600
     characters in 400px is prose, 600 characters in 2000px is a column one
     word wide. */
  const blocks = [...main.querySelectorAll(".comment, .doclink, .fileitem, .richfield, .prose, .step, .gitem, .docrow, .phtile")]
    .filter(vis)
    .map(el => ({ cls: name(el), h: Math.round(el.getBoundingClientRect().height),
      chars: (el.textContent || "").trim().length }))
    .filter(o => o.chars > 0)
    .sort((a, b) => b.h - a.h);

  /* Tap targets that only exist on a populated record.

     Leaf controls only. An <a> wrapping a <button> is the shape docLinkRow
     uses for Open, and the anchor's own box is one line-box tall while the
     40px button inside it is what a finger lands on — measuring the wrapper
     reported "Open 14px" on every doc row in the app and none of them were
     small. Text links inside .prose are exempt for the opposite reason: a link
     in the middle of a sentence cannot be 40px tall without breaking the
     sentence, and nobody expects it to be. */
  const targets = [...main.querySelectorAll(".comment button, .doclink button, .doclink a, .fileitem a, .fileitem button, .filegrid button, .docrow button, .photogrid img, .step-photos img, .step-photos button")]
    .filter(vis)
    .filter(el => el.children.length === 0)
    .filter(el => !el.closest(".prose"))
    .map(el => ({ t: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28),
      h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) }));

  /* Did the populated content actually land? Every check below is vacuous if
     the fixtures did not apply, and a page with nothing on it passes them all. */
  const txt = main.textContent || "";

  return {
    vw, vh,
    /* What the audit actually measured. Without this every overlay view passes
       by measuring the page behind an overlay that never opened, which is the
       same "an empty thread cannot overflow" trap this whole file exists to
       close — one level up. */
    root: main.id || main.className || main.tagName,
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    spills, clipped, scrollers, targets, orphaned,
    blocks: blocks.slice(0, 8),
    mainText: txt.trim().length,
  };
})()`;

const only = arg("view", "");
const views = only ? VIEWS.filter(v => v.id === only) : VIEWS;
const widths = arg("width", "") ? WIDTHS.filter(v => v.id === arg("width", "")) : WIDTHS;
const SHOTS = arg("shots", "");
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const { server, port } = await serveApp({});
const browser = await chromium.launch();
const report = [];

let PHOTO = null;
async function photo() {
  if (!PHOTO) PHOTO = await readFile(new URL("../06 Composites App/app/icon-192.png", import.meta.url));
  return PHOTO;
}

for (const vp of widths) {
  for (const v of views) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      isMobile: vp.coarse,
      hasTouch: vp.coarse,
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
    /* The comment photo. It has to be an https URL to survive the sanitizer, so
       it cannot be a relative path — served from disk here instead of letting
       the test depend on Firebase Storage being reachable. */
    await ctx.route(PHOTO_URL, async r => r.fulfill({ body: await photo(), contentType: "image/png" }));

    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction("window.__fixturesReady === true", null, { timeout: 20000 });
    await splashGone(page);
    const seedError = await page.evaluate("window.__seedError || null");
    if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

    await page.evaluate(`setTab(${JSON.stringify(v.tab)});`);
    if (v.open) await page.evaluate(v.open);
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(300);

    const a = await page.evaluate(AUDIT);
    const at = `${v.id}/${vp.id}`;
    report.push({ at, ...a });

    /* The lightbox is exempt because it is not a text surface: everything in it
       is one <img>, a caption and a "3 / 7" counter. "bagged diffuser tool" is
       20 characters, and whether this passed used to depend on whether the
       counter happened to render — i.e. on how many photos the record had. That
       is a text-length proxy measuring the wrong thing; `lightbox opened` on the
       next line is the real check, and the audit's spill/clip/off-screen
       measurements still run over the overlay either way. */
    ok(`${at} renders`, a.mainText > 20 || a.root === "lightbox", `only ${a.mainText} chars in main`);
    if (v.id === "lightbox") ok(`${at} lightbox opened`, a.root === "lightbox", `measured "${a.root}"`);
    else if (/-modal$/.test(v.id)) ok(`${at} modal opened`, /modal/.test(a.root), `measured "${a.root}"`);
    else if (v.id === "drawer-open") {
      const open = await page.evaluate(`document.body.classList.contains("drawer-open")`);
      ok(`${at} drawer opened`, open, "the drawer never opened");
    } else if (v.id === "composer-open") {
      const filled = await page.evaluate(
        `((document.getElementById("wo-note") || {}).textContent || "").length`);
      ok(`${at} composer opened with a draft`, filled > 200, `${filled} chars in the editor`);
    }
    if (v.needs) {
      const found = await page.evaluate(
        `(document.getElementById("main").textContent || "").includes(${JSON.stringify(v.needs)})`);
      ok(`${at} fixtures applied`, found, `"${v.needs}" is not on the page`);
    }
    ok(`${at} no errors`, errors.length === 0, [...new Set(errors)].slice(0, 2).join(" | "));

    /* The zoom-out. Everything else on this page is cosmetic next to it. */
    ok(`${at} no page h-overflow`, a.docScrollW <= a.docClientW + 1,
      `document is ${a.docScrollW}px wide in ${a.docClientW}px`);

    ok(`${at} nothing off-screen`, a.spills.length === 0,
      a.spills.slice(0, 3).map(s => `${s.cls} ${s.left}..${s.right}${s.why ? " [" + s.why + "]" : ""}`).join(", "));

    ok(`${at} nothing clipped`, a.clipped.length === 0,
      a.clipped.slice(0, 3).map(c => `${c.cls} +${c.over}px${c.why ? " [" + c.why + "]" : ""}`).join(", "));

    /* Laid out, never painted, no control to reveal it. This is the check the
       ticket-page regression needed and did not have. */
    ok(`${at} nothing unreachable`, a.orphaned.length === 0,
      a.orphaned.slice(0, 3).map(o => `${o.cls} "${o.t}"`).join(", "));

    /* Three screens. A comment that long on a phone is not a long comment, it
       is a broken wrap. */
    const tall = a.blocks.filter(b => b.h > vp.h * 3);
    ok(`${at} no runaway height`, tall.length === 0,
      tall.slice(0, 2).map(b => `${b.cls} ${b.h}px for ${b.chars} chars`).join(", "));

    if (vp.coarse) {
      const small = a.targets.filter(t => t.h < 40);
      ok(`${at} tap targets`, small.length === 0,
        small.slice(0, 3).map(t => `"${t.t}" ${t.h}px`).join(", "));
    }

    /* The ticket metadata, both widths. The details disclosure is GONE — the
       phone problem it fought over is solved structurally now: .tkmain comes
       first in the DOM, so below 901px (where .tksplit stacks by source order)
       the discussion leads and the metadata follows. On desktop the metadata
       is a horizontal BAND above the discussion (grid areas flip it, the DOM
       order stays), so wide screens only assert that it paints, not where it
       sits. Two behaviours to hold:
       the metadata must actually PAINT everywhere (the regression that took
       the desktop page down was metadata with real boxes the browser never
       drew — checkVisibility() is the one API that tells the truth about
       that, never rect height), and on a phone the main column must sit ABOVE
       the metadata, because burying the discussion is the bug this layout
       replaced. */
    if (v.id === "ticket-detail") {
      const rail = await page.evaluate(() => {
        const meta = document.querySelector("#main .tkmeta");
        const main = document.querySelector("#main .tkmain");
        if (!meta || !main) return "missing";
        if (document.querySelector("#main .tkmeta details")) return "details-came-back";
        const kid = [...meta.children].find(el => el.checkVisibility && el.textContent.trim());
        return [
          kid && kid.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            ? "painted" : "unpainted",
          main.getBoundingClientRect().top <= meta.getBoundingClientRect().top
            ? "main-first" : "meta-first",
        ].join("/");
      });
      ok(`${at} ticket metadata`,
        vp.w <= 900 ? rail === "painted/main-first" : rail.startsWith("painted"), rail);

      /* Table growth (desktop pass only, it needs no viewport): the composer's
         3x3 used to be a table's final size. Exercises the real DOM path —
         Tab in the last cell appends a row, the insert-menu commands add a
         column and a row — on a scratch contenteditable, and checks the
         header stays td-free (a row grown from the <th> row must land in
         tbody, not thead). */
      if (vp.w > 900) {
        const grown = await page.evaluate(() => {
          const host = document.createElement("div");
          host.id = "rte-scratch"; host.contentEditable = "true";
          host.innerHTML = tableHtml(3, 3);
          document.body.appendChild(host);
          try {
            const cells = host.querySelectorAll("th, td");
            const last = cells[cells.length - 1];
            const r = document.createRange(); r.selectNodeContents(last); r.collapse(true);
            const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            const rows0 = host.querySelectorAll("tr").length;
            rteTableTab("rte-scratch", last, false);
            const rowsTab = host.querySelectorAll("tr").length;
            rteTableAddCol("rte-scratch");
            const cols = host.querySelector("tr").cells.length;
            rteTableAddRow("rte-scratch");
            const rowsAdd = host.querySelectorAll("tr").length;
            return [rows0, rowsTab, cols, rowsAdd, host.querySelectorAll("thead td").length].join("/");
          } finally { host.remove(); }
        });
        ok(`${at} composer table growth`, grown === "3/4/4/5/0", grown);

        /* Backspace on an empty bullet leaves the list (Enter already does,
           natively; deleting your way out never worked). Same scratch-editor
           idiom: caret in the empty second item, fake Backspace through
           rteKeys, the <ul> must lose that item — and a caret in a NON-empty
           item must fall through to the browser (preventDefault not called). */
        const unlisted = await page.evaluate(() => {
          const host = document.createElement("div");
          host.id = "rte-scratch"; host.contentEditable = "true";
          host.innerHTML = "<ul><li>keep</li><li><br></li></ul>";
          document.body.appendChild(host);
          try {
            const put = li => { const r = document.createRange(); r.selectNodeContents(li); r.collapse(true);
              const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
            let prevented = 0;
            const ev = { key: "Backspace", preventDefault: () => { prevented++; } };
            put(host.querySelectorAll("li")[1]);
            rteKeys(ev, "rte-scratch");
            const emptyGone = host.querySelectorAll("li").length === 1 && prevented === 1;
            put(host.querySelector("li"));
            rteKeys(ev, "rte-scratch");
            const fullKept = host.querySelectorAll("li").length === 1 && prevented === 1;
            return [emptyGone ? "empty-exits" : "empty-stuck", fullKept ? "full-native" : "full-hijacked"].join("/");
          } finally { host.remove(); }
        });
        ok(`${at} backspace exits an empty bullet`, unlisted === "empty-exits/full-native", unlisted);

        /* "* " typed on a soft-wrapped line (a <br> inside the paragraph,
           i.e. Shift+Enter) must start a bullet on THAT line only — it used
           to hand the whole paragraph to insertUnorderedList and swallow the
           previous line into the first bullet. The caret sits after the "*"
           and the space keydown goes through rteKeys, same as typing. */
        const softline = await page.evaluate(() => {
          const host = document.createElement("div");
          host.id = "rte-scratch"; host.contentEditable = "true";
          host.innerHTML = "<p>prev line<br>*</p>";
          document.body.appendChild(host);
          try {
            // Focus FIRST, then place the caret — that is the state real
            // typing is in. Setting a range in an unfocused editor and then
            // letting rteExec's focus() run resets the caret to the start,
            // which is a test artifact, not a path a keystroke can reach.
            host.focus();
            const star = host.querySelector("p").lastChild;   // the "*" text node
            const r = document.createRange(); r.setStart(star, 1); r.collapse(true);
            const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            rteKeys({ key: " ", preventDefault: () => {} }, "rte-scratch");
            const ul = host.querySelector("ul");
            return [
              ul ? "list" : "no-list",
              ul && ul.textContent.includes("prev line") ? "swallowed" : "prev-free",
              host.textContent.includes("prev line") ? "prev-kept" : "prev-lost",
            ].join("/");
          } finally { host.remove(); }
        });
        ok(`${at} "* " on a soft-wrapped line bullets only that line`, softline === "list/prev-free/prev-kept", softline);
      }
    }

    if (SHOTS) {
      await page.screenshot({ path: join(SHOTS, `${v.id}-${vp.id}.png`), fullPage: true });
    }

    await ctx.close();
  }
}

await browser.close();
server.close();

if (SHOTS) {
  await writeFile(join(SHOTS, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nshots + report.json in ${SHOTS}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
