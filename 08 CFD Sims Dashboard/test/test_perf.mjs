#!/usr/bin/env node
/* Performance numbers for the viewer, with the library stubbed as in the smoke
   test. Not a pass/fail suite for speed (a CI box and a laptop differ by 3x);
   it prints the numbers, and fails only on the correctness checks that ride
   along: every visible page ends sharp after a pinch, and nothing errors.

   What it measures, at devicePixelRatio 2 like a retina laptop:
     open1     ?open=A: navigation to the first page painted
     open2     ?open=A,B: navigation to a page painted in both columns
     reopen    reload the same link: the second open, where caches can help
     pinch     30 ctrl-wheel events at 60 Hz over two synced columns:
               frames delivered, long-task time, worst long task, and how long
               until every visible page is sharp at the final zoom
     slider    30 moves of the Difference amplify slider: long-task time

   The fixture fetch is delayed by LATENCY ms (default 800, about 8.5 MB at
   85 Mbit/s) so that "downloaded again" costs what it costs on a real network.

   Run:  node test/test_perf.mjs          (from "08 CFD Sims Dashboard/")
         RUNS=3 node test/test_perf.mjs   median of three
   Skips, exit 0, when Playwright is not installed. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveDir, loadChromium, skipMessage } from "../../tools/lib/browser.mjs";
import { LIB_STUB } from "./lib_stub.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const LATENCY = +(process.env.LATENCY ?? 800);
const RUNS = +(process.env.RUNS ?? 1);

let fail = 0;
const check = (name, ok, detail) => { if (!ok) fail++; console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok || detail == null ? "" : "  — " + detail}`); };

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the CFD perf numbers")); process.exit(0); }

/* Long tasks and first-canvas times, recorded from before the app boots. */
const INIT = () => {
  window.__lt = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); } catch {}
  window.__paint = {};
  new MutationObserver(() => {
    const cols = [...document.querySelectorAll(".vcol")];
    cols.forEach((c, i) => { if (window.__paint[i] == null && c.querySelector(".pagewrap canvas")) window.__paint[i] = performance.now(); });
  }).observe(document, { subtree: true, childList: true });
};

const { server, port } = await serveDir(ROOT);
const browser = await chromium.launch();
const errors = [];
const results = [];
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function goThroughSplash(page) {
  await page.waitForFunction(() => document.querySelector("#splash.ready, #splash.slow") || !document.getElementById("splash"), null, { timeout: 30000 });
  if (await page.$("#splash")) await page.click("#sp-go");
}

/* Every page box inside a column's viewport has a canvas drawn at >= 95% of
   its on-screen device pixels. Returns [sharp, visible]. */
const SHARPNESS = () => {
  const dpr = Math.min(devicePixelRatio, 2);
  let sharp = 0, vis = 0;
  for (const sc of document.querySelectorAll(".vcol .scroller")) {
    const r = sc.getBoundingClientRect();
    for (const box of sc.querySelectorAll(".pagewrap")) {
      const b = box.getBoundingClientRect();
      if (b.bottom < r.top || b.top > r.bottom) continue;
      vis++;
      const cv = box.querySelector("canvas");
      if (cv && cv.width >= b.width * dpr * 0.95) sharp++;
    }
  }
  return [sharp, vis];
};

try {
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    page.on("dialog", d => d.accept());
    await page.addInitScript(INIT);
    await page.route("**/library.js", r => r.fulfill({ contentType: "text/javascript", body: LIB_STUB }));
    await page.route("**/fixtures/DP_22.pdf*", async r => { await new Promise(res => setTimeout(res, LATENCY)); await r.continue(); });
    const base = `http://127.0.0.1:${port}/app/`;
    const r = {};

    await page.goto(`${base}?p=viewer&open=RPT-AAAAAAAA`);
    await goThroughSplash(page);
    await page.waitForFunction(() => window.__paint[0] != null, null, { timeout: 60000 });
    r.open1 = await page.evaluate(() => window.__paint[0]);

    await page.goto(`${base}?p=viewer&open=RPT-AAAAAAAA,RPT-BBBBBBBB`);
    await goThroughSplash(page);
    await page.waitForFunction(() => window.__paint[0] != null && window.__paint[1] != null, null, { timeout: 90000 });
    r.open2 = await page.evaluate(() => Math.max(window.__paint[0], window.__paint[1]));

    await page.goto(`${base}?p=viewer&open=RPT-AAAAAAAA`);
    await goThroughSplash(page);
    await page.waitForFunction(() => window.__paint[0] != null, null, { timeout: 60000 });
    r.reopen = await page.evaluate(() => window.__paint[0]);

    /* Pinch over two synced columns, once everything near the top is drawn. */
    await page.goto(`${base}?p=viewer&open=RPT-AAAAAAAA,RPT-BBBBBBBB`);
    await goThroughSplash(page);
    await page.waitForFunction(() => window.CFD.S.docs.length === 2 && window.CFD.S.docs.every(d => d.index && !d.loading), null, { timeout: 90000 });
    await page.waitForFunction(() => document.querySelectorAll(".vcol .pagewrap canvas").length >= 2, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const sc = await page.$(".vcol .scroller");
    const box = await sc.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
    await page.evaluate(() => {
      window.__lt.length = 0; window.__frames = 0; window.__counting = true;
      const tick = () => { if (!window.__counting) return; window.__frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__g0 = performance.now();
    });
    await page.keyboard.down("Control");
    for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -4); await page.waitForTimeout(16); }
    await page.keyboard.up("Control");
    const g = await page.evaluate(() => { window.__counting = false; window.__g1 = performance.now(); return { ms: window.__g1 - window.__g0, frames: window.__frames }; });
    let sharpAt = null, last = [0, 0];
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      last = await page.evaluate(SHARPNESS);
      if (last[1] > 0 && last[0] === last[1]) { sharpAt = Date.now() - t0; break; }
      await page.waitForTimeout(50);
    }
    const lt = await page.evaluate(() => { const g0 = window.__g0, g1 = window.__g1 + 300; const inG = window.__lt.filter(([s]) => s >= g0 && s <= g1); return { total: inG.reduce((a, [, d]) => a + d, 0), max: Math.max(0, ...inG.map(([, d]) => d)) }; });
    r.pinchFps = g.frames / (g.ms / 1000);
    r.pinchLongTotal = lt.total; r.pinchLongMax = lt.max;
    r.pinchSharpMs = sharpAt;
    r.sharp = last;

    /* The Difference amplify slider. */
    await page.goto(`${base}?p=viewer&open=RPT-AAAAAAAA,RPT-BBBBBBBB&tab=overlay&mode=diff`);
    await goThroughSplash(page);
    await page.waitForFunction(() => document.querySelector(".ovstage canvas") && document.querySelector(".ovbar input[type=range]"), null, { timeout: 90000 }).catch(() => {});
    const hasSlider = await page.$(".ovbar input[type=range]");
    if (hasSlider) {
      await page.evaluate(() => { window.__lt.length = 0; window.__s0 = performance.now(); });
      for (let i = 0; i < 30; i++) {
        await page.evaluate(v => { const s = document.querySelector(".ovbar input[type=range]"); s.value = String(s.min * 1 + (s.max - s.min) * v); s.dispatchEvent(new Event("input", { bubbles: true })); }, (i % 10) / 10);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(300);
      r.sliderLong = await page.evaluate(() => window.__lt.filter(([s]) => s >= window.__s0).reduce((a, [, d]) => a + d, 0));
    }
    results.push(r);
    await ctx.close();
  }

  const keys = ["open1", "open2", "reopen", "pinchFps", "pinchLongTotal", "pinchLongMax", "pinchSharpMs", "sliderLong"];
  const unit = { pinchFps: "fps" };
  console.log(`\nperf (${RUNS} run${RUNS > 1 ? "s" : ""}, median; latency ${LATENCY} ms, dpr 2)`);
  for (const k of keys) {
    const v = results.map(r => r[k]).filter(x => x != null);
    console.log(`  ${k.padEnd(16)} ${v.length ? median(v).toFixed(0).padStart(6) + " " + (unit[k] || "ms") : "     —"}`);
  }
  const s = results[results.length - 1].sharp;
  check("every visible page is sharp at the final zoom after a pinch", s[1] > 0 && s[0] === s[1], `${s[0]}/${s[1]} sharp after 8 s`);
  check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 400));
} finally {
  await browser.close(); server.close();
}
process.exit(fail ? 1 : 0);
