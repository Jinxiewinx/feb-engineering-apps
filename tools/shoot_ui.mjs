/* shoot_ui.mjs — render a tab of the app and write PNGs of it.
 *
 * WHY THIS EXISTS
 * The two other browser tools in here (test_drawings, test_print_mobile) assert
 * on measurements: is this text crossed by a line, does this sheet fit in this
 * viewport. That catches everything you can write down as a number, and nothing
 * you can't. "Cluttered" is not a number. Neither is "the interface kinda
 * sucks", which is how the Parts revamp got asked for.
 *
 * So this is the other half of the loop: it renders the real app — the real
 * parts.js, the real stylesheet, real SN5 data — and writes images a reviewer
 * can look at. It asserts nothing. It is a camera, not a test.
 *
 * It resolves the app relative to ITSELF, not the cwd, which is the point:
 * run it from inside a git worktree and it shoots that worktree's app. That is
 * how four competing variants get photographed under identical conditions.
 *
 *   node tools/shoot_ui.mjs --out .ui-shots
 *   node tools/shoot_ui.mjs --out /tmp/shots --label B --tab parts
 *   node tools/shoot_ui.mjs --out .ui-shots --tab all --label before
 *
 * Options
 *   --out <dir>    where the PNGs go            (default .ui-shots)
 *   --label <s>    filename prefix, e.g. the variant id   (default "ui")
 *   --tab <id>     which tab to shoot, or "all" for every tab, list state only
 *                                              (default parts)
 *   --id <recId>   which record for the detail states     (default first row)
 *   --rail 1       shoot with the sidebar collapsed to its icon rail
 *   --width <n>    shoot one width instead of all three
 *   --theme <t>    light | dark, instead of both
 *
 * Needs Playwright, same as the other two, and skips loudly without it.
 */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage, APP_ROOT, splashGone } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";

/* ---------- args ---------- */
function arg(name, dflt) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const OUT = arg("out", ".ui-shots");
const LABEL = arg("label", "ui");
const TAB = arg("tab", "parts");
const REC = arg("id", "");

/* Four widths, each one a real decision boundary in the stylesheet rather than
   a round number: 1920 is the common desktop monitor and the width at which
   main's max-width leaves visible gutter, 1440 is the design target, 900 is
   where the sidebar becomes a drawer and list tables card-stack, 393 is an
   iPhone 15. A layout that works at all four has no untested middle. */
const WIDTHS = [
  { w: 1920, h: 1080, id: "1920", mobile: false },
  { w: 1440, h: 1000, id: "1440", mobile: false },
  { w: 900, h: 1100, id: "900", mobile: false },
  { w: 393, h: 852, id: "393", mobile: true },
];
const THEMES = ["light", "dark"];

const oneW = arg("width", ""), oneT = arg("theme", "");
const widths = oneW ? WIDTHS.filter(v => v.id === oneW) : WIDTHS;
const themes = oneT ? THEMES.filter(t => t === oneT) : THEMES;

/* --inset draws the shots as though the device had a notch. env() is always 0
   in headless Chromium, but the app reads --sa-* rather than env() directly
   (see the :root block in index.html), so overriding those four is enough to
   photograph what an iPhone actually shows. Real iPhone 15 Pro values.
   tools/test_safearea.mjs measures the same thing; this is for looking at it. */
const INSETS = {
  none: { t: 0, r: 0, b: 0, l: 0 },
  portrait: { t: 59, r: 0, b: 34, l: 0 },
  landscape: { t: 0, r: 59, b: 21, l: 59 },
};
const INSET = INSETS[arg("inset", "none")] || INSETS.none;

/* ---------- the states worth a photograph ----------
   A tab is not one picture. The list with the default filter is what you see
   99% of the time; the list with everything shown is where density actually
   bites (33 records, not 12); read and edit are two different designs wearing
   the same name. Each entry is a string of app JS run in the page — the same
   technique test_print_mobile uses to mount a document, and for the same
   reason: it drives the app through its own entry points instead of
   reaching in and rearranging its state. */
const STATES = [
  { id: "list", js: tab => `setTab(${JSON.stringify(tab)});` },
  { id: "list-all", js: tab => `setTab(${JSON.stringify(tab)}); view.fDone = true; render();` },
  { id: "detail", js: (tab, id) => `setTab(${JSON.stringify(tab)}); openRecord(${JSON.stringify(tab)}, ${JSON.stringify(id)});` },
  { id: "detail-edit", js: (tab, id) => `setTab(${JSON.stringify(tab)}); openRecord(${JSON.stringify(tab)}, ${JSON.stringify(id)}); view.edit = true; render();` },
  /* A person picker, open. pfOpenFirst() is the component's own entry point
     (core.js): it opens the first person field on the page the way a click
     would, so this photographs the list a member actually chooses from. */
  { id: "detail-edit-pick", js: (tab, id) => `setTab(${JSON.stringify(tab)}); openRecord(${JSON.stringify(tab)}, ${JSON.stringify(id)}); view.edit = true; render(); if (typeof pfOpenFirst === "function") pfOpenFirst();` },
];

/* --tab all sweeps the whole app instead of one tab. Every tab in core.js's
   TABS, list state only: the point of a sweep is "does any tab break at this
   width", and a per-tab detail state quadruples the frame count for a question
   the single-tab mode already answers better. Kept as a literal list rather
   than read out of the running page, so a tab silently disappearing from TABS
   shows up as a missing file instead of a shorter, quietly-passing run. */
/* "projects" is the SHELVED Tickets tab (v1.0.0). It stays on this list on
   purpose: the tab still renders and is still reachable by link, so shooting it
   is how we would notice the shelf having broken it. */
const ALL_TABS = ["dashboard", "season", "workorders", "parts", "stock", "molds", "lots",
  "items", "rnd", "projects", "timeline", "weekplan", "budget", "documents", "reports",
  "people"];
const SWEEP = TAB === "all";
/* The record id lookup below only knows two archives, so a sweep takes the
   list states and leaves detail to a targeted run. */
const states = SWEEP ? STATES.filter(s => s.id === "list") : STATES;

/* ---------- the stand-in for fb.js ----------
   Same boundary the shared FB_STUB stubs (onFbData / onFbChange), but seeded
   with parts AS WELL AS work orders. Parts need their own archive, and the
   linked-work-order chip on a part only resolves if both collections are
   present — shooting parts with an empty workOrders would photograph a missing
   feature and call it a design. */
const STUB = `
window.fb = {
  guest: false,
  async signInGuest() { fb.guest = true; },
  state: "ready",
  user: { uid: "u1", email: "simon@berkeley.edu", name: "Simon Starbuck" },
  roster: { role: "lead", name: "Simon Starbuck", email: "simon@berkeley.edu" },
  rosterCheckFailed: false,
  save: async () => {}, patch: async () => {}, del: async () => {}, mutateField: async () => {}, appendTo: async () => {},
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
/* Budget goals config, set directly (the stubbed getConfig returns null):
   without it the Budget tab photographs the "no goals yet" hint instead of
   the bars, and the screenshots stop representing the shipped feature. */
window.BUDGET_CFG = {
  categories: [
    { name: "Resin & hardener", goal: 1500 },
    { name: "Consumables", goal: 1000 },
    { name: "Transportation", goal: 500 },
    { name: "Tooling", goal: 1300 },
  ],
  total: { base: 7700, contingency: 300 },
};
/* Reported, never swallowed — an empty DB photographs as a working empty state
   and nobody notices the seed failed. Same lesson as tools/lib/browser.mjs. */
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
/* Tickets, Budget, People and the Weekly Plan have no archive to seed from —
   loadArchive() only knows the four collections above. Without these four the
   sweep photographs five of eleven tabs saying "nothing here yet", which is
   the one state a density audit learns nothing from. Runs last, because the
   schedule patch needs the archive weeks to already be in DB. */
${APPLY_FIXTURES}
window.onFbChange("ready");
`;

/* ---------- go ---------- */
const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the UI")); process.exit(0); }

await mkdir(OUT, { recursive: true });
const { server, port } = await serveApp({});
const browser = await chromium.launch();

/* Default record for the detail shots: the first id in the archive, unless one
   was named. Reading the file rather than hardcoding "P-SN5-001" keeps this
   working if the seed ever changes. */
let recId = REC;
if (!recId) {
  try {
    const seedFile = { parts: "sn5-parts.json", workorders: "sn5-work-orders.json" }[TAB];
    const json = JSON.parse(await readFile(join(APP_ROOT, seedFile), "utf8"));
    const arr = Array.isArray(json) ? json : (json.workOrders || []);
    recId = (arr[0] || {}).id || "";
  } catch { recId = ""; }
}

const written = [];
const problems = [];

for (const vp of widths) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });
    await ctx.route("**/fb.js", r => r.fulfill({ body: STUB, contentType: "text/javascript" }));
    /* The theme is read from localStorage by the no-FOUC script in index.html
       BEFORE first paint, so it has to be set before the document exists —
       hence addInitScript rather than an evaluate after load. Toggling it
       afterwards would work too, but it wouldn't photograph the first paint,
       which is the one a user sees. */
    await ctx.addInitScript(`try { localStorage.setItem("feb-theme", ${JSON.stringify(theme)}); } catch (e) {}`);
    /* The collapsed sidebar is a persisted preference, so it is set the same
       way the theme is — before the document exists, because the no-FOUC
       script in index.html reads it inside <head>. Without this the rail is
       the one piece of chrome no screenshot can show. */
    if (arg("rail", "") === "1") {
      await ctx.addInitScript(`try { localStorage.setItem("feb-rail", "1"); } catch (e) {}`);
    }
    if (arg("inset", "none") !== "none") {
      await ctx.addInitScript(`
        addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = ":root { --sa-t: ${INSET.t}px; --sa-r: ${INSET.r}px; --sa-b: ${INSET.b}px; --sa-l: ${INSET.l}px; }";
          document.head.appendChild(s);
          /* A faint overlay of the keep-out bands, so a screenshot shows WHERE
             the island is rather than leaving the reviewer to guess why there
             is extra padding. Chrome only — never shipped to the app. */
          const o = document.createElement("div");
          o.style.cssText = "position:fixed;inset:0;z-index:99999;pointer-events:none;"
            + "border-top:${INSET.t}px solid rgba(255,0,80,.22);border-right:${INSET.r}px solid rgba(255,0,80,.22);"
            + "border-bottom:${INSET.b}px solid rgba(255,0,80,.22);border-left:${INSET.l}px solid rgba(255,0,80,.22);";
          document.body.appendChild(o);
        });
      `);
    }

    const page = await ctx.newPage();
    page.on("pageerror", e => problems.push(`${vp.id}/${theme}: page error — ${String(e).slice(0, 200)}`));
    page.on("console", m => { if (m.type() === "error") problems.push(`${vp.id}/${theme}: console — ${m.text().slice(0, 200)}`); });

    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
    await splashGone(page);
    const seedError = await page.evaluate("window.__seedError || null");
    if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);

    for (const tab of (SWEEP ? ALL_TABS : [TAB])) {
      for (const st of states) {
        const needsRec = st.id.startsWith("detail");
        if (needsRec && !recId) continue;
        await page.evaluate(st.js(tab, recId));
        /* Let webfonts settle and any post-render pass (labelListTables) run.
           Screenshots taken mid-swap are the classic way to photograph a bug
           that isn't there. */
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        /* Documents fetches docs/manifest.json on first paint and renders
           "Loading documents…" until it lands, so a fixed dwell photographs the
           spinner. Wait for the tab to stop saying that, then fall through. */
        await page.waitForFunction(
          () => !/Loading documents/.test(document.getElementById("main").textContent),
          null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(350);
        const name = SWEEP
          ? `${LABEL}-${tab}-${vp.id}-${theme}.png`
          : `${LABEL}-${st.id}-${vp.id}-${theme}.png`;
        await page.screenshot({ path: join(OUT, name), fullPage: true });
        written.push(name);
      }
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

console.log(`${written.length} images in ${OUT}`);
console.log(`  ${SWEEP ? ALL_TABS.length + " tabs" : TAB}${recId && !SWEEP ? " · detail record " + recId : ""} · widths ${widths.map(v => v.id).join(", ")} · ${themes.join(", ")}`);
if (problems.length) {
  console.log(`\n${problems.length} console/page error${problems.length === 1 ? "" : "s"} while shooting:`);
  [...new Set(problems)].slice(0, 10).forEach(p => console.log("  " + p));
}
