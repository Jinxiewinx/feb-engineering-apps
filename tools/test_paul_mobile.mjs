/* test_paul_mobile.mjs — Ask Paul on a phone, with the keyboard up.
 *
 * WHY THIS EXISTS
 * Simon, 2026-10-09: "paul seems to be a bit broken on mobile with the
 * keyboard that opens". On a phone Paul is a full-screen sheet with the text
 * box at the bottom, which is exactly where a keyboard lands.
 *
 * THE TWO KEYBOARDS, AND HOW EACH IS SIMULATED
 * - Android Chrome shrinks the LAYOUT viewport: innerHeight drops. That is
 *   real in headless Chromium, so the test just resizes the page.
 * - iOS Safari leaves the layout viewport alone and shrinks the VISUAL
 *   viewport (window.visualViewport.height), then pans it (offsetTop) to bring
 *   the focused field into view. Headless Chromium has no software keyboard
 *   and no WebKit here, so the test replaces window.visualViewport with the
 *   numbers Safari reports and fires its resize/scroll events, then measures in
 *   VISUAL-viewport coordinates, which is what a person can actually see.
 *
 * WHAT HAS TO HOLD, keyboard up, on both:
 *  1. Paul's header is on screen (you can close him and see who you're
 *     talking to).
 *  2. The text box and the send button are on screen, above the keyboard.
 *  3. The end of the conversation is on screen, right above the text box.
 *  4. The page behind the sheet has not scrolled.
 *  5. Typing doesn't get thrown away: sending keeps the text box (and so the
 *     keyboard) rather than rebuilding it.
 * Plus, keyboard down: the text box clears the home indicator, the text is
 * 16px (iOS zooms the page into any smaller field), and the send button is a
 * real thumb target.
 *
 *   node tools/test_paul_mobile.mjs
 *   node tools/test_paul_mobile.mjs --shots     # PNGs into .drawing-shots/
 */

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serveApp, loadChromium, skipMessage, openApp } from "./lib/browser.mjs";

const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".drawing-shots");
const PHONE = { w: 393, h: 852, t: 59, b: 34 };   // iPhone 15 Pro
const KB = 336;                                    // iOS keyboard + QuickType bar, portrait

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("Ask Paul on a phone")); process.exit(0); }

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "  — " + JSON.stringify(detail) : "")); }
};

const srv = await serveApp();
const browser = await chromium.launch();

async function phone(ios) {
  const ctx = await browser.newContext({ viewport: { width: PHONE.w, height: PHONE.h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  /* Safari's visualViewport, installed before the app loads, because a real
     phone keeps the same object for the life of the page and the app binds to
     it once. iosKeyboard() then moves its numbers the way Safari does. */
  if (ios) await ctx.addInitScript(([H, W]) => {
    const t = new EventTarget();
    Object.assign(t, { width: W, height: H, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
    window.__fakeVV = t;
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => t });
  }, [PHONE.h, PHONE.w]);
  const { page, errors } = await openApp(ctx, srv.port);
  await page.addStyleTag({ content: `:root { --sa-t: ${PHONE.t}px !important; --sa-b: ${PHONE.b}px !important; }` });
  /* A conversation long enough to scroll, and a Paul that answers. */
  await page.evaluate(() => {
    fb.call = async () => ({});
    fb.callStream = async (n, d, on) => {
      on({ type: "step", text: "Opening MOLD-SN6-001" });
      await new Promise(r => setTimeout(r, 50));
      return { answer: "It's ready for layup [[0]].", sources: [{ type: "record", ref: "MOLD-SN6-001", kind: "mold", title: "Diffuser mold" }] };
    };
    const long = "The diffuser mold is sealed and released. ".repeat(6);
    PAUL.turns = Array.from({ length: 4 }, (_, i) => ({ q: "question " + i, answer: long + "[[0]]",
      sources: [{ type: "record", ref: "MOLD-SN6-001", kind: "mold", title: "Diffuser mold" }] }));
    render();
    openPaul();
  });
  return { ctx, page, errors };
}

/* Everything measured in what the person can see: the visual viewport. */
const MEASURE = `(() => {
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0, h = vv ? vv.height : innerHeight;
  const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { top: Math.round(r.top - top), bottom: Math.round(r.bottom - top), h: Math.round(r.height), inView: r.top >= top - 1 && r.bottom <= top + h + 1 && r.height > 0 }; };
  const th = document.getElementById("paul-thread");
  const msgs = th ? th.querySelectorAll(".paul-msg") : [];
  const last = msgs[msgs.length - 1];
  const ta = document.getElementById("paul-q");
  return {
    view: { top: Math.round(top), h: Math.round(h) },
    head: vis(document.querySelector(".paul-head")),
    ta: vis(ta), send: vis(document.querySelector(".paul-send")),
    lastMsg: last ? (() => { const r = last.getBoundingClientRect(), t = th.getBoundingClientRect();
      return { bottomVisible: r.bottom <= t.bottom + 2 && r.bottom >= t.top, inView: r.bottom <= top + h + 1 }; })() : null,
    pageScrolled: Math.round((document.scrollingElement || document.documentElement).scrollTop),
    taFont: ta ? parseFloat(getComputedStyle(ta).fontSize) : 0,
    sendSize: (() => { const b = document.querySelector(".paul-send"); if (!b) return 0; const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })(),
    taFocused: document.activeElement === ta,
  };
})()`;

/* The iOS keyboard: visual viewport shrinks, then Safari pans it so the
   focused field is visible. The pan is computed from where the field sits
   when the keyboard arrives, as Safari does. */
async function iosKeyboard(page, up) {
  await page.evaluate(([H, KB, up]) => {
    const fake = window.__fakeVV;
    fake.height = up ? H - KB : H;
    fake.dispatchEvent(new Event("resize"));
    if (up) {
      const ta = document.getElementById("paul-q");
      const r = ta.getBoundingClientRect();
      const pan = Math.max(0, r.bottom + 8 - (fake.offsetTop + fake.height));
      fake.offsetTop = Math.min(pan, H - fake.height);
    } else fake.offsetTop = 0;
    fake.dispatchEvent(new Event("scroll"));
    fake.dispatchEvent(new Event("resize"));
  }, [PHONE.h, KB, up]);
  await page.waitForTimeout(120);
}

async function check(label, page, kbUp) {
  const m = await page.evaluate(MEASURE);
  ok(`${label}: Paul's header is on screen`, m.head && m.head.inView, { head: m.head, view: m.view });
  ok(`${label}: the text box is on screen`, m.ta && m.ta.inView, { ta: m.ta, view: m.view });
  ok(`${label}: the send button is on screen`, m.send && m.send.inView, { send: m.send, view: m.view });
  ok(`${label}: the end of the conversation is showing`, m.lastMsg && m.lastMsg.bottomVisible && m.lastMsg.inView, m.lastMsg);
  ok(`${label}: the page behind didn't scroll`, m.pageScrolled === 0, m.pageScrolled);
  if (!kbUp) ok(`${label}: the text box clears the home indicator`, m.ta && m.ta.bottom <= m.view.h - PHONE.b + 1, { ta: m.ta, view: m.view });
  return m;
}

async function shot(page, name) {
  if (!SHOTS) return;
  await mkdir(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOT_DIR, `paul-mobile-${name}.png`) });
}

/* ---------- iOS ---------- */
console.log("iOS (visual viewport shrinks, page pans):");
{
  const { ctx, page, errors } = await phone(true);
  let m = await check("iOS keyboard down", page, false);
  ok("iOS: text is 16px, so Safari doesn't zoom into the box", m.taFont >= 16, m.taFont);
  ok("iOS: the send button is a thumb-sized target", m.sendSize >= 40, m.sendSize);
  const citeH = await page.evaluate(() => { const c = document.querySelector(".paul-cite"); return c ? c.getBoundingClientRect().height : 0; });
  ok("iOS: inline source numbers stay text-sized", citeH > 0 && citeH <= 20, citeH);
  await page.tap("#paul-q");
  await iosKeyboard(page, true);
  await shot(page, "ios-kb-up");
  await check("iOS keyboard up", page, true);
  // Typing then sending keeps the box (and the keyboard) where it was.
  await page.fill("#paul-q", "is this ready?");
  const before = await page.evaluate(() => document.getElementById("paul-q"));
  await page.evaluate(() => { window.__ta = document.getElementById("paul-q"); });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const kept = await page.evaluate(() => document.getElementById("paul-q") === window.__ta && document.activeElement === window.__ta);
  ok("iOS: sending keeps the same text box focused, so the keyboard stays up", kept);
  await check("iOS keyboard up, after an answer", page, true);
  await shot(page, "ios-kb-after");
  await iosKeyboard(page, false);
  await check("iOS keyboard closed again", page, false);
  ok("iOS: no page errors", !errors.length, errors);
  await ctx.close();
}

/* ---------- Android ---------- */
console.log("Android (layout viewport shrinks):");
{
  const { ctx, page, errors } = await phone();
  await page.tap("#paul-q");
  await page.setViewportSize({ width: PHONE.w, height: PHONE.h - 300 });
  await page.waitForTimeout(150);
  await shot(page, "android-kb-up");
  await check("Android keyboard up", page, true);
  await page.setViewportSize({ width: PHONE.w, height: PHONE.h });
  await page.waitForTimeout(150);
  await check("Android keyboard closed again", page, false);
  ok("Android: no page errors", !errors.length, errors);
  await ctx.close();
}

await browser.close();
srv.server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
