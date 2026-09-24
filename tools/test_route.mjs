/* test_route.mjs — deep links from a scanned label into the app.
 *
 * THE ASSERTION THAT ACTUALLY TESTS SOMETHING is the one that holds fb.state at
 * "loading" for half a second before flipping it to "ready". On first paint the
 * app has no data, so a pending link cannot be redeemed yet; it has to survive
 * until the snapshot lands. The naive version of this test — stub fb as "ready"
 * at t=0 and check the record opens — passes against a completely broken
 * implementation that reads the hash once at boot and throws it away. So the
 * delayed-ready case is the point, and the instant case is the control.
 *
 * The other load-bearing check is that history.length does not grow. The app's
 * NAV_STACK is a referrer trail with its own semantics (setTab clears it,
 * openRecord suppresses self-pushes, navBack has a fallback); browser history
 * is chronological. Mixing them means either the Back button lies or navBack
 * breaks, so routing uses replaceState only, and this proves it.
 *
 *   node tools/test_route.mjs
 */

import { serveApp, loadChromium, skipMessage, FB_STUB } from "./lib/browser.mjs";
import { APPLY_FIXTURES } from "./lib/fixtures.mjs";

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("deep-link routing")); process.exit(0); }

const { server, port } = await serveApp();
const browser = await chromium.launch();

/* The stub is FB_STUB from lib/browser.mjs, not a hand-rolled second copy —
   an earlier version of this file rolled its own and silently seeded nothing,
   which made every deep-link assertion fail for a reason that had nothing to do
   with routing.

   Two changes on top of it:

   1. `parts` as well as `workOrders`, because the shared stub only seeds work
      orders and a scan link has to work for a part too.
   2. Optionally, `onFbChange("ready")` is DELAYED past the data. FB_STUB fires
      it last, so data lands before ready; the real fb.js is the other way round
      — `ready` means auth and the roster check are done, and the collection
      snapshots arrive afterwards. Both orders have to work, and the second one
      is the order that broke the first implementation of this feature. */
function stub({ delayMs }) {
  let s = FB_STUB;
  s = s.replace('const res = await fetch("sn5-work-orders.json");',
    'const res = await fetch("sn5-work-orders.json");\n    fetch("sn5-parts.json").then(r => r.json()).then(p => window.onFbData("parts", Array.isArray(p) ? p : (p.parts || []))).catch(() => {});');
  if (!delayMs) return s + "\nwindow.__fbReleased = true;\n";
  // The state must start as "loading" in the literal. Setting it later does not
  // work: FB_STUB awaits the archive fetch before its final onFbChange, and
  // index.html's render() runs during those awaits — so a stub that is "ready"
  // in the literal has already opened the record before the delay begins.
  s = s.replace('state: "ready"', 'state: "loading"');
  return s.replace(
    'window.onFbChange("ready");',
    `window.__fbReleased = false;
     setTimeout(() => { fb.state = "ready"; window.__fbReleased = true; window.onFbChange("ready"); }, ${delayMs});`
  );
}

async function boot({ hash, delayMs }) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  await page.route("**/fb.js", r => r.fulfill({ contentType: "text/javascript", body: stub({ delayMs }) }));
  await page.goto(`http://127.0.0.1:${port}/index.html${hash || ""}`, { waitUntil: "load" });
  // Fixtures arrive the way real data does: through the onFbData hook, after
  // the first paint. Nothing here reaches past that boundary.
  await page.evaluate(APPLY_FIXTURES);
  return { page, errs };
}

/* ---------- 1. the delayed-ready case, which is the whole point ---------- */
console.log("\ndeep link arriving before the data does");
{
  const { page, errs } = await boot({ hash: "#/WO-SN5-001", delayMs: 500 });

  // Before release: the app is still on the connecting screen and MUST NOT have
  // thrown the link away.
  const early = await page.evaluate(() => ({ released: window.__fbReleased, mode: view.mode }));
  eq(early.released, false, "fb is still loading at this point (the race is real)");
  ok(early.mode !== "detail", "nothing is open yet, because there is no data yet");

  await page.waitForFunction(() => window.__fbReleased === true);
  await page.waitForFunction(() => view.mode === "detail", null, { timeout: 8000 }).catch(() => {});

  const after = await page.evaluate(() => ({ tab: view.tab, mode: view.mode, id: view.id, nav: NAV_STACK.length }));
  eq(after.mode, "detail", "the record opens once data lands");
  eq(after.id, "WO-SN5-001", "and it is the right record");
  eq(after.tab, "workorders", "on the tab the prefix maps to");
  // An arrival is not a step in a trail: Back should go to the list, not out.
  eq(after.nav, 0, "the referrer trail is empty after an arrival");
  eq(errs.length, 0, "no page errors", errs.join(" | "));
  await page.close();
}

/* ---------- 2. the instant case, as a control ---------- */
console.log("\ndeep link when the data is already there");
{
  const { page } = await boot({ hash: "#/P-SN5-002", delayMs: 0 });
  await page.waitForFunction(() => view.mode === "detail", null, { timeout: 8000 }).catch(() => {});
  const v = await page.evaluate(() => ({ tab: view.tab, mode: view.mode, id: view.id }));
  eq(v.mode, "detail", "opens");
  eq(v.id, "P-SN5-002", "the right part");
  eq(v.tab, "parts", "on Parts");
  await page.close();
}

/* ---------- 3. one shot only ---------- */
console.log("\nthe link is redeemed once, not on every render");
{
  const { page } = await boot({ hash: "#/WO-SN5-001", delayMs: 0 });
  await page.waitForFunction(() => view.mode === "detail");
  const v = await page.evaluate(() => {
    // Navigate away, then force the re-renders a normal session produces. A
    // pending link that is not cleared would yank the user back here — and
    // would do it mid-edit, which is the version that loses work.
    setTab("budget");
    render(); render(); render();
    return { tab: view.tab, mode: view.mode, pending: PENDING_LINK };
  });
  eq(v.pending, "", "PENDING_LINK is cleared after use");
  eq(v.tab, "budget", "and re-rendering does not drag you back to the scanned record");
  await page.close();
}

/* ---------- 4. replaceState, not pushState ---------- */
console.log("\nhistory");
{
  const { page } = await boot({ delayMs: 0 });
  await page.waitForFunction(() => (DB.workOrders || []).length > 4);
  const before = await page.evaluate(() => history.length);
  const after = await page.evaluate(() => {
    const ids = DB.workOrders.slice(0, 5).map(w => w.id);
    for (const id of ids) { openRecord("workorders", id); navBack(); }
    setTab("parts"); setTab("budget"); setTab("workorders");
    return { len: history.length, hash: location.hash };
  });
  eq(after.len, before, "ten navigations add nothing to browser history (replaceState, not pushState)");
  ok(/^#\/\w/.test(after.hash), "the URL still describes where you are", after.hash);
  await page.close();
}

/* ---------- 5. the URL follows the view ---------- */
console.log("\nthe URL mirrors the view");
{
  const { page } = await boot({ delayMs: 0 });
  await page.waitForFunction(() => (DB.parts || []).length > 0);
  const r = await page.evaluate(() => {
    const out = {};
    setTab("parts"); out.list = location.hash;
    const id = DB.parts[0].id;
    openRecord("parts", id); out.detail = location.hash; out.id = id;
    navBack(); out.back = location.hash;
    return out;
  });
  eq(r.list, "#/parts", "a list is /#/<tab>");
  eq(r.detail, "#/" + r.id, "a record is /#/<ID>, which is what q.html links to");
  eq(r.back, "#/parts", "Back updates it too");
  await page.close();
}

/* ---------- 6. an external hash change ---------- */
console.log("\ntapping a scan link while the app is already open");
{
  const { page } = await boot({ delayMs: 0 });
  await page.waitForFunction(() => (DB.workOrders || []).length > 2);
  const id = await page.evaluate(() => DB.workOrders[2].id);
  // A user tapping /#/<ID> from q.html in another tab, or pasting a URL. Our
  // own replaceState never fires hashchange, so this cannot self-trigger.
  await page.evaluate(i => { location.hash = "#/" + i; }, id);
  await page.waitForTimeout(200);
  const v = await page.evaluate(() => ({ mode: view.mode, id: view.id }));
  eq(v.mode, "detail", "the app follows an externally set hash");
  eq(v.id, id, "to the right record");
  await page.close();
}

/* ---------- 7. junk in the URL ---------- */
console.log("\nbad links degrade, they do not break");
{
  for (const [hash, why] of [
    ["#/NOPE-SN6-001", "an unknown prefix"],
    ["#/WO-SN6-999", "a well-formed id for a record that is not here"],
    ["#/", "an empty fragment"],
    ["#garbage", "not a route at all"],
  ]) {
    const { page, errs } = await boot({ hash, delayMs: 0 });
    await page.waitForTimeout(200);
    const v = await page.evaluate(() => ({ mode: view.mode, q: view.q, blank: !document.getElementById("main").innerHTML.trim() }));
    ok(!v.blank && errs.length === 0, `${why}: the app still renders`, errs.join(" | "));
    ok(v.mode !== "detail", `${why}: does not open a phantom record`);
    await page.close();
  }
  // The near-miss case is the useful one: a real ID this roster cannot see, or
  // one from another season, should land on the right tab with the code in the
  // search box rather than on a blank detail page.
  /* Deliberately waits out the real PENDING_GRACE_MS rather than shortening it
     for the test. The whole point of the grace window is that a link is NOT
     given up on early — a test that shrinks it to 50ms would pass against an
     implementation that gives up immediately, which is the bug this replaced. */
  const { page } = await boot({ hash: "#/WO-SN6-999", delayMs: 0 });
  await page.waitForFunction(() => view.q === "WO-SN6-999", null, { timeout: 12000 }).catch(() => {});
  const v = await page.evaluate(() => ({ tab: view.tab, q: view.q }));
  eq(v.tab, "workorders", "a missing work order lands on Work Orders");
  eq(v.q, "WO-SN6-999", "with the code already in the search box");
  await page.close();
}

/* ---------- 7b. a person link ----------
   #/person/<email> goes through the same wait-for-data door as a record. The
   roster is its own snapshot, so the delayed case is the one that matters, and
   the record regex would read this as "PERSON" and drop it if the person
   branch did not run first. */
console.log("\na person link, arriving before the roster does");
{
  const { page, errs } = await boot({ hash: "#/person/arivera%40berkeley.edu", delayMs: 500 });
  const before = await page.evaluate(() => history.length);
  await page.waitForFunction(() => window.__fbReleased === true);
  await page.waitForFunction(() => view.tab === "people" && view.mode === "detail", null, { timeout: 8000 }).catch(() => {});
  const v = await page.evaluate(() => ({ tab: view.tab, mode: view.mode, id: view.id, hash: location.hash,
    len: history.length, name: !!document.querySelector(".phead h2") && document.querySelector(".phead h2").textContent }));
  eq(v.tab, "people", "lands on People");
  eq(v.mode, "detail", "on the person page");
  eq(v.id, "arivera@berkeley.edu", "for the right person, lowercased and decoded");
  ok(/Ana Rivera/.test(v.name || ""), "and it shows their name", v.name);
  eq(v.hash, "#/person/arivera%40berkeley.edu", "the address bar keeps the person link");
  eq(v.len, before, "without growing browser history");
  eq(errs.length, 0, "no page errors", errs.join(" | "));
  // A chip click goes to the same page and rewrites the URL the same way.
  const w = await page.evaluate(() => { setTab("budget"); openPerson("dchen@berkeley.edu"); return { id: view.id, hash: location.hash }; });
  eq(w.hash, "#/person/dchen%40berkeley.edu", "openPerson writes the person link");
  await page.close();
}
console.log("\na person link for somebody the app has never heard of");
{
  const { page } = await boot({ hash: "#/person/nobody%40nowhere.edu", delayMs: 0 });
  await page.waitForFunction(() => view.q === "nobody@nowhere.edu", null, { timeout: 12000 }).catch(() => {});
  const v = await page.evaluate(() => ({ tab: view.tab, mode: view.mode, q: view.q }));
  eq(v.tab, "people", "lands on People");
  eq(v.mode, "list", "on the list, not an empty page");
  eq(v.q, "nobody@nowhere.edu", "with the address in the search box");
  await page.close();
}

/* ---------- 8. the prefix map matches fb.js ---------- */
console.log("\nID_TO_COLL stays in step with fb.js");
{
  const { page } = await boot({ delayMs: 0 });
  const fbSrc = await (await fetch(`http://127.0.0.1:${port}/fb.js`)).text();
  const m = fbSrc.match(/const ID_PREFIX = \{([^}]*)\}/);
  ok(!!m, "found ID_PREFIX in fb.js");
  if (m) {
    const fbMap = {};
    for (const pair of m[1].split(",")) {
      const kv = pair.split(":").map(s => s.trim().replace(/["']/g, ""));
      if (kv[0] && kv[1]) fbMap[kv[1]] = kv[0];      // prefix -> collection
    }
    const core = await page.evaluate(() => ID_TO_COLL);
    /* stackplans has no tab of its own — a stack plan renders inside Stock —
       so STK routes to the stock collection on purpose. Every other prefix must
       match fb.js exactly. */
    const EXPECTED_DIFF = { STK: "stock" };
    for (const [pfx, coll] of Object.entries(fbMap)) {
      const want = EXPECTED_DIFF[pfx] || coll;
      eq(core[pfx], want, `${pfx} routes to ${want}` + (EXPECTED_DIFF[pfx] ? ` (fb.js says ${coll}; no tab of its own)` : ""));
    }
  }
  await page.close();
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
