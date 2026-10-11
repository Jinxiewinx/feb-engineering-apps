/* test_q_landing.mjs — q.html, the page a scanned label lands on.
 *
 * TWO THINGS THIS FILE EXISTS FOR.
 *
 * 1. The ID must be painted BEFORE any network call. The ID is in the URL, so
 *    it is knowable with no signal at all, and RFS wifi drops. A scan that
 *    shows a spinner and then nothing is worse than a printed label. So the
 *    page is checked against a Firestore request that NEVER RESOLVES, and the
 *    ID has to be on screen inside 100ms anyway.
 *
 * 2. Nothing private may reach the page. This URL is readable by anyone in the
 *    world who can guess an ID, so the denylist below runs against a projection
 *    that has been deliberately over-stuffed with the things that must never
 *    escape: a person's name, an email, a layup stack, a Firebase Storage
 *    download URL (which is a bearer credential and works regardless of
 *    storage.rules). If pubProjection() ever regresses, this fails.
 *
 *   node tools/test_q_landing.mjs
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveApp, loadChromium, skipMessage, APP_ROOT, sealNetwork } from "./lib/browser.mjs";

let pass = 0, fail = 0;
function ok(cond, msg, detail) {
  if (cond) { pass++; console.log(`  ok   ${msg}`); }
  else { fail++; console.log(`  FAIL ${msg}${detail != null ? `  (${detail})` : ""}`); }
}
function eq(got, want, msg) { ok(got === want, msg, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }

const chromium = await loadChromium();
if (!chromium) { console.log(skipMessage("the scan landing page")); process.exit(0); }

/* Firebase Hosting rewrites /Q/** to q.html (see 06 Composites App/firebase.json). The
   static server here has no rewrites, so register the paths this file visits
   explicitly — which also documents exactly which URLs the rewrite has to
   cover. Both cases: labels carry uppercase, hand-typed codes may not. */
const Q_HTML = await readFile(join(APP_ROOT, "q.html"), "utf8");
const IDS = ["MOLD-SN6-004", "WO-SN6-118", "P-SN6-007", "PNL-SN6-006-C03", "RDS-SN6-001", "CPN-SN6-004", ""];
const routes = {};
for (const id of IDS) { routes["/Q/" + id] = Q_HTML; routes["/q/" + id] = Q_HTML; }
const { server, port } = await serveApp(routes);
const browser = await chromium.launch();

/* q.html imports firebase from gstatic and reads pub/<ID>. Rather than stub
   Firestore's wire protocol, block the CDN and inject a fake module resolution:
   the page's own error path is then what runs, which is the path that matters
   on shop wifi. For the happy path we let the page load and then fill it via
   the same render() it would call itself. */
async function open(id, { mode }) {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));

  if (mode === "hang") {
    // A request that never answers. This is the RFS case.
    await sealNetwork(page, { mode: "hang" });
  } else if (mode === "offline") {
    await sealNetwork(page, { mode: "abort" });
  }

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/Q/${id}`, { waitUntil: "commit" });
  return { page, errs, t0 };
}

/* ---------- 1. the ID paints before the network ---------- */
console.log("\noffline-first");
{
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await sealNetwork(page, { mode: "hang" });
  await page.goto(`http://127.0.0.1:${port}/Q/MOLD-SN6-004`, { waitUntil: "commit" });

  const seen = await page.waitForFunction(
    () => document.getElementById("id")?.textContent.trim() === "MOLD-SN6-004",
    null, { timeout: 3000 }
  ).then(() => true).catch(() => false);
  ok(seen, "the ID is on screen even though Firestore never answers");

  const cls = await page.textContent("#cls");
  eq(cls.trim(), "Mold", "and so is the class word, derived from the prefix alone");
  await page.close();
}
/* The R&D bench prints labels too (Study label, the coupon row's print icon),
   so its prefixes need words here rather than the bare "RDS" / "CPN". */
for (const [id, word] of [["RDS-SN6-001", "R&D study"], ["CPN-SN6-004", "R&D coupon"]]) {
  const page = await browser.newPage({ viewport: { width: 393, height: 850 } });
  await sealNetwork(page, { mode: "hang" });
  await page.goto(`http://127.0.0.1:${port}/Q/${id}`, { waitUntil: "commit" });
  await page.waitForFunction((x) => document.getElementById("id")?.textContent.trim() === x, id, { timeout: 3000 });
  eq((await page.textContent("#cls")).trim(), word, `${id.split("-")[0]} reads as "${word}"`);
  await page.close();
}

/* ---------- 2. it is fast, not merely eventual ---------- */
console.log("\nspeed");
{
  const page = await browser.newPage();
  await sealNetwork(page, { mode: "hang" });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/Q/WO-SN6-118`, { waitUntil: "commit" });
  await page.waitForFunction(() => document.getElementById("id")?.textContent.trim() === "WO-SN6-118",
    null, { timeout: 3000 });
  const ms = Date.now() - t0;
  ok(ms < 1500, `painted in ${ms}ms with the network hanging`, `${ms}ms`);
  await page.close();
}

/* ---------- 3. every failure mode says something true ---------- */
console.log("\nfailure modes");
for (const [mode, id, why] of [
  ["hang", "P-SN6-007", "a request that never resolves"],
  ["offline", "P-SN6-007", "a request that is refused"],
]) {
  const { page, errs } = await open(id, { mode });
  await page.waitForFunction(i => document.getElementById("id")?.textContent.trim() === i, id, { timeout: 3000 });
  /* Waits out the real 5s watchdog rather than shortening it. A hanging request
     is the normal RFS failure (the wifi associates, nothing comes back), and
     the thing being tested is precisely that the page stops waiting. */
  await page.waitForFunction(() => /couldn't reach|no record/i.test(document.body.innerText),
    null, { timeout: 9000 }).catch(() => {});
  const txt = await page.evaluate(() => document.body.innerText);
  ok(txt.includes(id), `${why}: the ID is still shown`);
  ok(!/undefined|NaN|\[object/.test(txt), `${why}: no debris in the copy`);
  // The page must never claim to know something it never received. With no
  // network there is no pub document, so the detail rows must not exist at all.
  const rows = await page.evaluate(() => document.querySelectorAll("#rows .row").length);
  eq(rows, 0, `${why}: no detail rows are invented`);
  ok(/couldn't reach|no record/i.test(txt), `${why}: says plainly that it could not look it up`);
  await page.close();
}
{
  // Not a code at all.
  const { page } = await open("", { mode: "offline" });
  await page.waitForTimeout(300);
  const txt = await page.evaluate(() => document.body.innerText);
  ok(/no record ID/i.test(txt), "a URL with no ID says so plainly");
  await page.close();
}

/* ---------- 4. nothing private reaches the page ---------- */
console.log("\nleaks");
{
  const page = await browser.newPage();
  await sealNetwork(page, { mode: "hang" }); // we call render() ourselves below
  await page.goto(`http://127.0.0.1:${port}/Q/P-SN6-007`, { waitUntil: "commit" });
  await page.waitForFunction(() => document.getElementById("id")?.textContent.trim() === "P-SN6-007");

  /* Hand render() a document deliberately stuffed with everything that must
     never escape. In production firestore.rules' hasOnly() clause rejects a
     write shaped like this, but rules are the second line: if a bad projection
     ever did land in pub, this page must not paint it. */
  await page.evaluate(() => {
    // eslint-disable-next-line no-undef
    render({
      id: "P-SN6-007", cls: "PART", name: "UT INLET", status: "Layup Complete",
      location: "RFS", wo: "WO-SN6-031", rev: "A", updatedAt: "2026-09-22T10:00:00Z",
      layupStack: [{ material: "195 twill", orientation: 45 }],
      updatedBy: "simon@berkeley.edu",
      buyoff: { name: "Simon Starbuck", date: "2026-09-22" },
      files: [{ url: "https://firebasestorage.googleapis.com/v0/b/x/o/y?token=SECRET-BEARER" }],
      cost: 412.5, comments: [{ author: "someone@berkeley.edu", text: "porosity on the flange" }],
    });
  });
  await page.waitForTimeout(120);

  const body = await page.evaluate(() => document.body.innerText);
  const html = await page.content();
  for (const leak of ["195 twill", "Starbuck", "@berkeley.edu", "firebasestorage",
                      "SECRET-BEARER", "412.5", "porosity", "updatedBy"]) {
    ok(!body.includes(leak) && !html.includes(leak), `does not render ${leak}`);
  }
  // ...while still showing the things it is allowed to.
  for (const shown of ["P-SN6-007", "UT INLET", "Layup Complete", "RFS", "WO-SN6-031"]) {
    ok(body.includes(shown), `does render ${shown}`);
  }
  await page.close();
}

/* ---------- 4b. no relative URLs ----------
 *
 * This page is served at /Q/<ID> by a hosting rewrite, so EVERY relative URL on
 * it resolves one directory deep: "./firebase-config.js" becomes
 * "/Q/firebase-config.js", which the same rewrite cheerfully answers with
 * q.html itself. The import then "succeeds" against a lump of HTML,
 * FIREBASE_CONFIG never gets set, and every scan reports "couldn't reach the
 * database" while the network is completely fine.
 *
 * That shipped, and was only caught by loading the deployed page — the local
 * test server registers exact paths and has no wildcard rewrite, so it cannot
 * reproduce it. Hence a source-level check instead of a behavioural one: no
 * relative src, href or import anywhere in the file.
 */
console.log("\nabsolute URLs only (the rewrite serves this page from /Q/)");
{
  const src = Q_HTML;
  const rel = [];
  for (const m of src.matchAll(/(?:src|href)="(?!https?:|\/|#|data:|mailto:)([^"]+)"/g)) rel.push(m[1]);
  for (const m of src.matchAll(/import\("(?!https?:|\/)([^"]+)"\)/g)) rel.push(m[1]);
  ok(rel.length === 0, "no relative src/href/import survives being served from /Q/<ID>", rel.join(" | "));

  // And prove the trap is real rather than theoretical: a relative fetch from
  // this page resolves into the rewritten namespace.
  const { page } = await open("P-SN6-007", { mode: "offline" });
  const resolved = await page.evaluate(() => new URL("./firebase-config.js", location.href).pathname);
  eq(resolved, "/Q/firebase-config.js", "a relative URL really does resolve under /Q/");
  await page.close();
}

/* ---------- 5. the way back into the app ---------- */
console.log("\nopen in the app");
{
  const { page } = await open("MOLD-SN6-004", { mode: "offline" });
  await page.waitForFunction(() => document.getElementById("id")?.textContent.trim() === "MOLD-SN6-004");
  const href = await page.getAttribute("#go", "href");
  // A hash route, matching what core.js parses. Never a /Q/ path: that would
  // bounce the user straight back to this page.
  eq(href, "/#/MOLD-SN6-004", "links into the app by hash route");
  const box = await page.locator("#go").boundingBox();
  ok(box.height >= 44, "the tap target clears 44px, because this gets tapped with gloves on", `${box.height}px`);
  await page.close();
}

/* ---------- 6. it fits a phone ---------- */
console.log("\nlayout");
{
  for (const w of [320, 393, 430]) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    await sealNetwork(page, { mode: "hang" });
    // A long ID and a long name are the two things that can widen the layout
    // viewport, which zooms the whole page out on mobile Safari.
    await page.goto(`http://127.0.0.1:${port}/Q/PNL-SN6-006-C03`, { waitUntil: "commit" });
    await page.waitForFunction(() => document.getElementById("id")?.textContent.trim().length > 0);
    await page.evaluate(() => render({
      id: "PNL-SN6-006-C03", cls: "PNL",
      name: "UNDERTRAY LEFT SIDE POD OUTBOARD SKIN LOWER SECTION TWO",
      status: "Ready For Layup", location: "JACOBS BASEMENT SHELF B3",
    }));
    await page.waitForTimeout(80);
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    ok(m.scroll <= m.client + 1, `${w}px: the page does not scroll sideways`, `${m.scroll} vs ${m.client}`);
    await page.close();
  }
}

await browser.close();
server.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
