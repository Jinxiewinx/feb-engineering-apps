#!/usr/bin/env node
/* Browser smoke test for the app, with no Firebase.

   The risky part of hosting pdf.js is that it starts a MODULE worker, which
   depends entirely on page origin and MIME types; the rest of the viewer is
   node-tested through the indexer. So this boots the real app in Chromium
   over a static server, with library.js swapped for an in-memory stand-in
   (route interception, so nothing is left in app/), and checks the shell,
   the Dashboard, the viewer and the URL round trip:

     - the Dashboard is the landing page: stat tiles, two trend charts with a
       point per report, a saved view, a card per report with its thumbnail;
     - a card's Open lands in the viewer with that report open;
     - ?open=A,B&tab=overlay&mode=diff restores two library reports, the tab
       and the overlay mode from the URL;
     - the worker starts and DP_22.pdf indexes to 39 pages / 59 panels;
     - the Panels rows come from matchPanels (59 of them);
     - the difference view on the same file twice reads exactly 0.00%;
     - Save view hands the current query to the library;
     - the app is always dark and the sidebar is always the icon rail;
     - a local file picked through the input is opened AND handed to the
       library upload with the indexer's counts and numbers, and a thumbnail.

   Run:  npm run test:smoke   (from "08 CFD Sims Dashboard/")
   Skips, exit 0, when Playwright is not installed. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDir, loadChromium, skipMessage } from "../../tools/lib/browser.mjs";
import { LIB_STUB } from "./lib_stub.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");                 // served, so /app/ and /test/fixtures/ are both reachable
const FIXTURE = join(HERE, "fixtures", "DP_22.pdf");


let pass = 0, fail = 0;
function t(name, ok, detail) {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok || detail == null ? "" : "  — " + detail}`);
}

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the CFD app")); process.exit(0); }

const { server, port } = await serveDir(ROOT);
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", e => { errors.push(String(e)); if (process.env.DEBUG) console.log("PAGEERROR", e); });
  page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); if (process.env.DEBUG) console.log("CONSOLE", m.text()); } });
  page.on("dialog", d => d.type() === "prompt" ? d.accept(d.defaultValue() || "x") : d.accept());
  await page.route("**/library.js", r => r.fulfill({ contentType: "text/javascript", body: LIB_STUB }));
  // library.js is stubbed, so the Firebase SDK that index.html preloads is never used; do not reach for it.
  await page.route("https://www.gstatic.com/**", r => r.fulfill({ contentType: "text/javascript", body: "" }));

  /* ---- the Dashboard ---- */
  await page.goto(`http://127.0.0.1:${port}/app/`);
  await page.waitForFunction(() => window.CFD && window.CFD.S.library && window.CFD.S.library.length === 2 && document.querySelector(".rcard"), null, { timeout: 15000 });
  t("Dashboard is the landing page", await page.evaluate(() => window.CFD.S.page) === "dashboard");
  await page.waitForFunction(() => document.querySelector("#splash.ready") && getComputedStyle(document.getElementById("sp-go")).display !== "none", null, { timeout: 5000 });
  t("splash lit its lamps and offers Continue", await page.evaluate(() => document.querySelectorAll("#sp-lights .sp-lamp.on").length === 3 && document.getElementById("sp-go").textContent === "Continue"));
  await page.click("#sp-go");
  await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 5000 });
  t("Continue takes the splash down", true);
  t("sidebar is the icon rail: mark and two icons, no labels, no toggle", await page.evaluate(() => !!document.querySelector(".sb-brand .feb-mark") && document.querySelectorAll(".sb-item").length === 2 && !document.querySelector(".sb-label") && !document.querySelector(".sb-toggle") && document.querySelector("#app > .sidebar").getBoundingClientRect().width === 56));
  t("always dark, no theme toggle", await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark" && !document.querySelector(".topbar .icon-btn[title*='theme']")));
  t("four stat tiles, latest DP first", await page.evaluate(() => document.querySelectorAll(".dstats .stat-tile").length === 4 && document.querySelector(".dstats .stat-label").textContent.includes("DP 23")));
  t("downforce tile shows positive newtons", (await page.evaluate(() => document.querySelector(".dstats .bignum").textContent)).trim() === "501 N");
  t("two trend charts with a point per report", await page.evaluate(() => document.querySelectorAll("svg.trend").length === 2 && document.querySelectorAll("svg.trend .dot").length === 4));
  t("saved view listed", await page.evaluate(() => document.querySelectorAll(".vrow").length === 1 && document.querySelector(".vrow b").textContent === "22 vs 23 swipe"));
  t("a card per report with thumbnail, DP pill and numbers", await page.evaluate(() => document.querySelectorAll(".rcard").length === 2 && document.querySelectorAll(".rcard img.rthumb").length === 2 && document.querySelector(".rcard .pill").textContent === "DP 23"));
  if (process.env.SHOTS) { await page.screenshot({ path: process.env.SHOTS + "/dashboard.png" }); }
  t("note on the card, prompt link where there is none", await page.evaluate(() => [...document.querySelectorAll(".rcard .rnote")].map(n => n.textContent.trim())).then(a => a.includes("baseline") && a.some(x => x.startsWith("Add a note"))));

  // Thumbnail opens the lightbox.
  await page.click(".rcard img.rthumb");
  t("thumbnail opens the lightbox", await page.evaluate(() => document.querySelector("#lightbox.open") && document.getElementById("lb-name").textContent.includes("stat-car-0")));
  await page.keyboard.press("Escape");
  t("Escape closes it", await page.evaluate(() => !document.querySelector("#lightbox.open")));


  // A card's Open lands in the viewer with that report open.
  await page.click(".rcard .primary");
  await page.waitForFunction(() => window.CFD.S.page === "viewer" && window.CFD.S.docs.length === 1 && !window.CFD.S.docs[0].loading && window.CFD.S.docs[0].index, null, { timeout: 60000 });
  t("card Open lands in the viewer with the report open", await page.evaluate(() => window.CFD.S.docs[0].reportId === "RPT-BBBBBBBB"));
  t("viewer canvas is dark", await page.evaluate(() => getComputedStyle(document.querySelector(".viewer")).backgroundColor) === "rgb(11, 15, 22)");
  t("URL names the page and the report", (await page.url()).includes("p=viewer") && (await page.url()).includes("open=RPT-BBBBBBBB"), await page.url());

  /* ---- the viewer from a URL ---- */
  await page.goto(`http://127.0.0.1:${port}/app/?open=RPT-AAAAAAAA,RPT-BBBBBBBB&tab=overlay&mode=diff`);
  await page.waitForFunction(() => window.CFD && window.CFD.S.library && window.CFD.S.library.length === 2, null, { timeout: 15000 });
  await page.waitForSelector("#splash.ready", { timeout: 5000 }); await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 5000 });
  t("Enter takes the splash down too", true);
  await page.waitForFunction(() => {
    const S = window.CFD.S; return S.docs.length === 2 && S.docs.every(d => !d.loading && d.index);
  }, null, { timeout: 60000 });
  const shape = await page.evaluate(() => window.CFD.S.docs.map(d => [d.reportId, d.index.numPages, d.index.panels.length]));
  t("both URL reports opened from the library", shape[0][0] === "RPT-AAAAAAAA" && shape[1][0] === "RPT-BBBBBBBB", JSON.stringify(shape));
  t("module worker started: 39 pages / 59 panels per report", shape.every(s => s[1] === 39 && s[2] === 59), JSON.stringify(shape));
  t("tab and overlay mode restored from the URL", await page.evaluate(() => window.CFD.S.tab === "overlay" && window.CFD.S.overlay.mode === "diff"));
  t("panel rows come from matchPanels (59)", await page.evaluate(() => window.CFD.panelRows().length) === 59);
  await page.waitForFunction(() => window.__lastDiff && typeof window.__lastDiff.pct === "number", null, { timeout: 30000 });
  const diff = await page.evaluate(() => window.__lastDiff);
  t("difference of the same report against itself is exactly 0.00%", diff.pct === 0 && diff.changed === 0, JSON.stringify(diff));
  // A carries numbers and meta, so nothing is written for it; B has an empty
  // meta, so opening it extracts and writes what differs from the stub.
  const patched = await page.evaluate(() => window.__stub.patches.map(p => p.id));
  t("backfill touches only the record that was missing something", !patched.includes("RPT-AAAAAAAA") && patched.includes("RPT-BBBBBBBB"), JSON.stringify(patched));

  // Save view hands the current query to the library.
  await page.click("#saveview");
  await page.waitForFunction(() => window.__stub.savedViews.length === 1, null, { timeout: 5000 });
  const sv = await page.evaluate(() => window.__stub.savedViews[0]);
  t("Save view stores the query and the report ids", sv.query.includes("open=RPT-AAAAAAAA%2CRPT-BBBBBBBB") && sv.query.includes("tab=overlay") && sv.query.includes("mode=diff") && sv.reports.length === 2, JSON.stringify(sv));

  // Panels view renders one column per report for the selected row.
  await page.evaluate(() => { window.CFD.S.tab = "panels"; window.CFD.render(); window.CFD.renderChrome(); });
  await page.waitForFunction(() => document.querySelectorAll("#vmain canvas").length >= 2, null, { timeout: 30000 });
  t("panels view drew a canvas per report", true);
  if (process.env.SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: process.env.SHOTS + "/viewer-panels.png" }); }

  // A local file through the picker: opened, then handed to the library with its numbers and a thumbnail.
  await page.setInputFiles("#filepick", FIXTURE);
  await page.waitForFunction(() => window.__stub.uploads.length === 1 && window.__stub.thumbs.length === 1 && window.CFD.S.docs.length === 3 && window.CFD.S.docs[2].reportId, null, { timeout: 90000 });
  const up = await page.evaluate(() => window.__stub.uploads[0]);
  t("picked file was uploaded with the indexer's counts and the report's numbers", up.meta.pages === 39 && up.meta.panels === 59 && up.meta.dp === 22 && up.meta.results.total.lift === -486.6432 && up.meta.meta.analyst === "beldon", JSON.stringify(up.meta));
  const th = await page.evaluate(() => window.__stub.thumbs[0]);
  t("a stat-car-0 thumbnail was rendered and uploaded", th.panel === "stat-car-0" && th.size > 5000, JSON.stringify(th));
  t("the new doc carries the library id", await page.evaluate(() => window.CFD.S.docs[2].reportId) === "RPT-CCCCCCCC");
  t("library list shows all three records", await page.evaluate(() => document.querySelectorAll("#liblist .doc.lib").length) === 3);

  // Back to the Dashboard: the new card is there, three points per chart.
  await page.click(".sb-item:not(.active)");
  await page.waitForFunction(() => window.CFD.S.page === "dashboard" && document.querySelectorAll(".rcard").length === 3, null, { timeout: 5000 });
  t("Dashboard shows the new report with three points per chart", await page.evaluate(() => document.querySelectorAll("svg.trend .dot").length === 6));
  // Opening a saved view replaces what is open with the view's reports and settings.
  await page.click(".vrow .vopen");
  await page.waitForFunction(() => window.CFD.S.page === "viewer" && window.CFD.S.docs.length === 2 && window.CFD.S.docs.every(d => d.index) && window.CFD.S.tab === "overlay", null, { timeout: 60000 });
  t("opening a saved view lands in the viewer with its two reports and tab", await page.evaluate(() => window.CFD.S.docs.map(d => d.reportId).join(",")) === "RPT-AAAAAAAA,RPT-BBBBBBBB");
  await page.click(".sb-item:not(.active)");
  await page.waitForFunction(() => window.CFD.S.page === "dashboard", null, { timeout: 5000 });
  await page.click(".sb-item:not(.active)");
  await page.waitForFunction(() => window.CFD.S.page === "viewer" && window.CFD.S.docs.length === 2, null, { timeout: 5000 });
  t("returning to the viewer keeps its open reports", true);

  /* ---- mobile: one report at a time ---- */
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mob.on("pageerror", e => errors.push("mobile: " + e));
  mob.on("dialog", d => d.accept(d.defaultValue() || "x"));
  await mob.route("**/library.js", r => r.fulfill({ contentType: "text/javascript", body: LIB_STUB }));
  await mob.route("https://www.gstatic.com/**", r => r.fulfill({ contentType: "text/javascript", body: "" }));
  await mob.goto(`http://127.0.0.1:${port}/app/`);
  await mob.waitForFunction(() => window.CFD && window.CFD.S.library && document.querySelector(".rcard") && document.querySelector("#splash.ready"), null, { timeout: 15000 });
  await mob.tap("#splash");
  await mob.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 5000 });
  t("mobile: a tap anywhere on the ready splash takes it down", true);
  t("mobile: the rail is a bottom bar the width of the screen", await mob.evaluate(() => { const r = document.querySelector("#app > .sidebar").getBoundingClientRect(); return r.width === 390 && r.bottom === 844 && window.CFD.isMobile(); }));
  t("mobile: stat tiles in two columns, cards in one", await mob.evaluate(() => getComputedStyle(document.querySelector(".dstats")).gridTemplateColumns.split(" ").length === 2 && getComputedStyle(document.querySelector(".rgrid")).gridTemplateColumns.split(" ").length === 1));
  if (process.env.SHOTS) { await mob.screenshot({ path: process.env.SHOTS + "/mobile-dashboard.png" }); }
  await mob.click(".rcard .primary");
  await mob.waitForFunction(() => window.CFD.S.page === "viewer" && window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].index, null, { timeout: 60000 });
  t("mobile: a card opens one report in the viewer", await mob.evaluate(() => window.CFD.S.docs[0].reportId === "RPT-BBBBBBBB"));
  t("mobile: no side panel, no Save view, only Pages and Panels", await mob.evaluate(() => getComputedStyle(document.querySelector(".vside")).display === "none" && getComputedStyle(document.querySelector("#saveview")).display === "none" && [...document.querySelectorAll("#tabs button")].filter(b => getComputedStyle(b).display !== "none").length === 2));
  t("mobile: the toolbar select lists the library with the open one selected", await mob.evaluate(() => { const s = document.querySelector("#mobilepick"); return getComputedStyle(s).display !== "none" && s.value === "RPT-BBBBBBBB" && s.querySelectorAll("option").length === 4; }));
  await mob.selectOption("#mobilepick", "RPT-AAAAAAAA");
  await mob.waitForFunction(() => window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].reportId === "RPT-AAAAAAAA" && window.CFD.S.docs[0].index, null, { timeout: 60000 });
  t("mobile: picking another report replaces the open one", true);
  if (process.env.SHOTS) { await mob.waitForTimeout(800); await mob.screenshot({ path: process.env.SHOTS + "/mobile-viewer.png" }); }
  await mob.goto(`http://127.0.0.1:${port}/app/?open=RPT-AAAAAAAA,RPT-BBBBBBBB&tab=overlay`);
  await mob.waitForSelector("#splash.ready", { timeout: 15000 }); await mob.tap("#sp-go");
  await mob.waitForFunction(() => window.CFD && window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].index && !document.getElementById("splash"), null, { timeout: 60000 });
  t("mobile: a two-report link opens only the first, on Pages", await mob.evaluate(() => window.CFD.S.docs[0].reportId === "RPT-AAAAAAAA" && window.CFD.S.tab === "pages"));
  await mob.close();

  t("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
