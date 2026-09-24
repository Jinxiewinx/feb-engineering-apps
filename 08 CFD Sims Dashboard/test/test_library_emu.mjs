#!/usr/bin/env node
/* The real library.js against the Firebase emulators, end to end.

   test_viewer_smoke.mjs stubs library.js out; this one does not. It boots the
   app on localhost (so library.js talks to the emulators on this app's ports),
   picks the fixture through the file input, and checks the record, the file,
   the numbers and the thumbnail all landed; reloads with ?open=<id> and checks
   the report comes back out of the emulator bucket through getDownloadURL +
   fetch (the path the bucket's CORS policy exists for in production); strips
   a record back to the pre-dashboard shape and checks opening it backfills
   the numbers and the thumbnail; and round-trips a saved view.

   Run:  npm run test:library   (from "08 CFD Sims Dashboard/"; starts the
   emulators itself through emulators:exec). Skips when Playwright is absent. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { serveDir, loadChromium, skipMessage } from "../../tools/lib/browser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "DP_22.pdf");
let pass = 0, fail = 0;
const t = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok || detail == null ? "" : "  — " + detail}`); };

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the CFD library round-trip")); process.exit(0); }

const { server, port } = await serveDir(join(HERE, "..", "app"));
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  /* Where gstatic.com is out of reach (a sandbox with a network allowlist),
     FIREBASE_SDK_DIR=<unpacked firebase npm package> serves the same CDN
     builds from disk. The npm package ships them byte for byte. */
  if (process.env.FIREBASE_SDK_DIR) {
    await page.route("https://www.gstatic.com/firebasejs/**", async route => {
      const file = new URL(route.request().url()).pathname.split("/").pop();
      try { await route.fulfill({ contentType: "text/javascript", body: await readFile(join(process.env.FIREBASE_SDK_DIR, file)) }); }
      catch { await route.abort(); }
    });
  }
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => d.type() === "prompt" ? d.accept("first run of the season") : d.accept());
  const go = async () => { await page.waitForSelector("#splash.ready", { timeout: 20000 }); await page.click("#sp-go"); };
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.CFD && Array.isArray(window.CFD.S.library), null, { timeout: 20000 });
  await go();
  t("library listener connected to the Firestore emulator", true);

  // Record how each new record looked the first time the listener delivered it.
  await page.evaluate(() => { window.__first = {}; setInterval(() => { for (const r of window.CFD.S.library || []) if (!(r.id in window.__first)) window.__first[r.id] = !!r.thumb; }, 5); });
  await page.setInputFiles("#filepick", FIXTURE);
  // The note is asked on the report's row once the record exists; nothing waits for it.
  await page.waitForSelector(".notefield input", { timeout: 120000 });
  await page.fill(".notefield input", "first run of the season");
  await page.press(".notefield input", "Enter");
  await page.waitForFunction(() => window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].reportId
    && window.CFD.S.library.some(r => r.id === window.CFD.S.docs[0].reportId && r.thumb && r.note), null, { timeout: 120000 });
  const rec = await page.evaluate(() => window.CFD.S.library.find(r => r.id === window.CFD.S.docs[0].reportId));
  t("record written with the indexer's counts", rec && rec.pages === 39 && rec.panels === 59 && rec.size > 8_000_000, JSON.stringify(rec).slice(0, 200));
  t("record has a 64-char sha256", rec && /^[0-9a-f]{64}$/.test(rec.sha256));
  t("record carries dp, results and meta from the report", rec.dp === 22 && rec.results.total.lift === -486.6432 && rec.meta.analyst === "beldon", JSON.stringify([rec.dp, rec.results && rec.results.total, rec.meta]));
  t("record carries the thumbnail with a download URL", rec.thumb && rec.thumb.path === `reports/${rec.id}/thumb.png` && /^http/.test(rec.thumb.url) && rec.thumb.panel === "stat-car-0", JSON.stringify(rec.thumb));
  t("the note typed at upload was saved", rec.note === "first run of the season", rec.note);
  t("the record arrived with its thumbnail: one write, not a write and a patch", await page.evaluate(id => window.__first[id] === true, rec.id));
  const meta = async (path) => (await fetch(`http://127.0.0.1:9198/v0/b/feb-cfd.firebasestorage.app/o/${encodeURIComponent(path)}`)).json();
  const [mPdf, mThumb] = [await meta(rec.path), await meta(rec.thumb.path)];
  t("report.pdf and thumb.png are stored immutable-cacheable", /immutable/.test(mPdf.cacheControl || "") && /immutable/.test(mThumb.cacheControl || ""), JSON.stringify([mPdf.cacheControl, mThumb.cacheControl]));
  const thumbOk = await page.evaluate(async url => { const r = await fetch(url); return r.ok && (r.headers.get("content-type") || "").includes("png"); }, rec.thumb.url);
  t("thumb.png is fetchable from the emulator bucket", thumbOk);

  // Same file again: no second upload, the existing record is reused.
  await page.setInputFiles("#filepick", FIXTURE);
  await page.waitForFunction(() => window.CFD.S.docs.length === 2 && window.CFD.S.docs[1].reportId, null, { timeout: 90000 });
  const n = await page.evaluate(() => window.CFD.S.library.length);
  const same = await page.evaluate(() => window.CFD.S.docs[0].reportId === window.CFD.S.docs[1].reportId);
  t("re-uploading the same bytes dedups to one record", n === 1 && same, `records=${n} same=${same}`);

  // Save a view, and see it on the Dashboard.
  await page.click("#saveview");
  await page.waitForSelector(".popask input");   // named in a popover, not a prompt()
  await page.press(".popask input", "Enter");
  await page.waitForFunction(() => window.CFD.S.views.length === 1, null, { timeout: 20000 });
  const v = await page.evaluate(() => window.CFD.S.views[0]);
  t("saved view round-trips with the query and report ids", v.query.includes("open=") && v.reports.length === 1 && v.name.length > 0, JSON.stringify(v));

  // Strip the record back to the pre-dashboard shape, then open it fresh: backfill.
  await page.evaluate(async id => {
    const lib = await import("/library.js");
    await lib.patch(id, { dp: null, results: {}, meta: {} });
  }, rec.id);
  await page.goto(`http://localhost:${port}/?open=${rec.id}&tab=panels`);
  await go();
  await page.waitForFunction(() => window.CFD && window.CFD.S.docs.length === 1 && !window.CFD.S.docs[0].loading && window.CFD.S.docs[0].index, null, { timeout: 90000 });
  const back = await page.evaluate(() => [window.CFD.S.docs[0].reportId, window.CFD.S.docs[0].index.numPages, window.CFD.S.tab, window.CFD.S.page]);
  t("report fetched from the emulator bucket and indexed, into the viewer", back[0] === rec.id && back[1] === 39 && back[2] === "panels" && back[3] === "viewer", JSON.stringify(back));
  await page.waitForFunction(id => { const r = window.CFD.S.library.find(r => r.id === id); return r && r.dp === 22 && r.results && r.results.total; }, rec.id, { timeout: 60000 });
  t("opening a stripped record backfilled dp and results", true);

  // Open the saved view from the Dashboard.
  await page.click(".sb-item:not(.active)");
  await page.waitForFunction(() => window.CFD.S.page === "dashboard" && document.querySelector(".vrow .vopen"), null, { timeout: 10000 });
  t("Dashboard card shows the thumbnail and the numbers", await page.evaluate(() => !!document.querySelector(".rcard img.rthumb") && document.querySelector(".rcard .numrow b").textContent.includes("487")));
  await page.click(".vrow .vopen");
  await page.waitForFunction(() => window.CFD.S.page === "viewer" && window.CFD.S.docs.length === 1 && window.CFD.S.docs[0].index, null, { timeout: 90000 });
  t("opening a saved view lands in the viewer with its report", true);

  // Delete through the library API; the listener empties the list.
  await page.evaluate(async (id) => {
    const lib = await import("/library.js");
    await lib.remove(window.CFD.S.library.find(r => r.id === id));
    for (const v of window.CFD.S.views) await lib.removeView(v.id);
  }, rec.id);
  await page.waitForFunction(() => window.CFD.S.library.length === 0 && window.CFD.S.views.length === 0, null, { timeout: 20000 });
  t("delete removed the record, its files and the view", true);

  t("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
