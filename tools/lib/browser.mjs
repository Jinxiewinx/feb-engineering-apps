/* Shared plumbing for the two tests that need a real browser
   (tools/test_drawings.mjs, tools/test_print_mobile.mjs).

   Both need the same three things: the app served over http, a Chromium that
   may or may not be installed, and — for anything that boots the whole app — a
   Firebase that isn't there. Written once here rather than twice badly. */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

export const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "06 Composites App", "app");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".pdf": "application/pdf",
  ".json": "application/json", ".stl": "model/stl", ".woff2": "font/woff2",
  /* WebAssembly.compileStreaming REFUSES anything but application/wasm — it is
     the one type here the browser checks rather than sniffs. Without this entry
     the vendored zxing reader fell to the octet-stream default, the streaming
     compile threw, scan-fallback.js quietly recovered via ArrayBuffer, and the
     console error it logged on the way failed every scan-modal page in
     test_detailui. Firebase Hosting serves .wasm correctly, so this was only
     ever wrong in the harness. */
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

/* Static server over the app directory. `routes` maps a path to a string body,
   which is how a test injects a harness page without leaving a file behind in
   the app directory for someone to find and wonder about. */
export function serveApp(routes) {
  return serveDir(APP_ROOT, routes);
}

/* Same server over an arbitrary directory, for the team website in
   "09 Website/site". A bare directory path serves its index.html so "/" works
   the way it will on Firebase Hosting. */
export function serveDir(root, routes) {
  return new Promise(resolve => {
    const s = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (routes && routes[path] != null) {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(routes[path]);
      }
      const rel = path.replace(/^\/+/, "");
      for (const cand of [rel, join(rel, "index.html")]) {
        try {
          const buf = await readFile(join(root, cand));
          res.writeHead(200, { "content-type": MIME[extname(cand)] || "application/octet-stream" });
          return res.end(buf);
        } catch { /* try the next candidate */ }
      }
      res.writeHead(404); res.end("no");
    });
    s.listen(0, "127.0.0.1", () => resolve({ server: s, port: s.address().port }));
  });
}

/* Playwright is a dependency of these tests, not of the repo. Look where it
   plausibly is; the caller decides what to do when it is nowhere. */
export async function loadChromium() {
  const require_ = createRequire(import.meta.url);
  const tries = [];
  try { tries.push(require_.resolve("playwright")); } catch { /* not local */ }
  try {
    const g = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    tries.push(join(g, "playwright", "index.mjs"));
  } catch { /* no npm */ }
  /* The design-sync toolchain vendors its own playwright, and it is the only
     copy in this repo. Node resolves node_modules by walking ANCESTORS, and
     .ds-sync is a sibling of tools/, so require.resolve above never sees it and
     every browser test skips with a green exit code — which is exactly what was
     happening before this line existed. Named explicitly rather than globbed:
     if .ds-sync goes away the skip message is right again.
     Keep .ds-sync/package.json's playwright version matched to the chromium
     build cached in ~/Library/Caches/ms-playwright (1.58.0 <-> 1208 today), or
     playwright launches and immediately reports a missing executable. */
  tries.push(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".ds-sync",
    "node_modules", "playwright", "index.js"));
  for (const p of tries) {
    try {
      /* pathToFileURL, not a "file://" + p concatenation: on Windows an
         absolute path is C:\Users\..., which does not start with "/", so
         the old code handed it to import() bare and Node rejected it as an
         unknown "c:" URL scheme. That throw landed in the catch below, which
         means "not installed" — so every browser suite here reported SKIPPED
         and exited 0 on a machine with Playwright installed. */
      const m = await import(pathToFileURL(p).href);
      /* A global install resolves to index.mjs and exposes `chromium` as a
         named export. A local one resolves to the CJS index.js, where the
         named export is absent and everything hangs off `default` — reading
         only `.chromium` there yields undefined and looks exactly like "not
         installed". Check both before giving up on this candidate. */
      const chromium = m.chromium ?? m.default?.chromium;
      if (chromium) return process.env.AUDIT_NET ? auditNet(chromium) : chromium;
    } catch { /* next */ }
  }
  return null;
}

export function skipMessage(what) {
  return [
    `SKIPPED — Playwright is not installed, so ${what} was not rendered.`,
    "  npm i -g playwright && npx playwright install chromium",
    "  Nothing else in this repo can catch this class of bug; run it before shipping.",
  ].join("\n");
}

/* A stand-in for fb.js, injected by route interception so the real app boots
   with no Firebase, no network and no auth. It drives the app through the two
   hooks core.js exposes (onFbData / onFbChange), which is exactly how the real
   fb.js drives it — so this stubs the boundary rather than reaching past it. */
export const FB_STUB = `
window.fb = {
  guest: false,
  async signInGuest() { fb.guest = true; },
  state: "ready",
  user: { uid: "u1", email: "simon@example.com", name: "Simon" },
  roster: { role: "lead", name: "Simon", email: "simon@example.com" },
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
/* Seed from the retro archive that ships with the app. Retried and then
   REPORTED, never swallowed: a silently empty DB looks exactly like a broken
   feature — the app renders "not found", no sheet mounts, and the test times out
   pointing at the wrong thing. Cost an hour of chasing a phantom once. */
window.__seedError = null;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const res = await fetch("sn5-work-orders.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const wos = await res.json();
    const arr = Array.isArray(wos) ? wos : (wos.workOrders || []);
    if (!arr.length) throw new Error("archive parsed but held no work orders");
    window.onFbData("workOrders", arr);
    window.__seedError = null;
    break;
  } catch (e) {
    window.__seedError = String((e && e.message) || e);
    window.onFbData("workOrders", []);
    await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
  }
}
window.onFbChange("ready");
`;

/* Wait for the boot splash to actually leave the screen.

   fb.state going "ready" is what USED to take the splash down, so waiting on it
   alone was sufficient for exactly as long as hideSplash() always fired.

   THE SPLASH IS A GATE NOW. It does not leave on its own at all — it waits for
   somebody to press Continue, however long that takes. So this is no longer an
   optimisation that skips a floor; it is the harness standing in for the person
   who would press the button. Without it, every screenshot this module feeds to
   shoot_ui, make_mockups, shoot_release and the UI suites would be a photograph
   of a navy panel with a fun fact on it, forever.

   Waiting on the ELEMENT rather than on a duration is what keeps this honest:
   hideSplash() removes the node from the DOM rather than leaving it at
   opacity 0 (see its note in core.js), so absence is an unambiguous signal. */
export async function splashGone(page) {
  /* Press the button on the harness's behalf, then prove the sheet leaves.

     hideSplash(true) is the same teardown a real press runs — splashGo calls it
     with force once the gate is armed — so this takes the app's own path rather
     than inventing a test-only one. `force` is what lets it fire before the gate
     arms, which matters because a stubbed fb never walks the whole boot.

     It is deliberately NOT the whole check: the wait below still has to pass, so
     a splash that fails to tear itself down fails the suite exactly as it would
     have. That the gate itself never opens unbidden is asserted properly, and
     cheaply, in test_app.mjs. */
  await page.evaluate(() => { if (typeof hideSplash === "function") hideSplash(true); }).catch(() => {});
  await page.waitForFunction("!document.getElementById('splash')", null, { timeout: 20000 });
}

/* Boot the real index.html with the stub in place of fb.js. */
export async function openApp(ctx, port, path) {
  await ctx.route("**/fb.js", r => r.fulfill({ body: FB_STUB, contentType: "text/javascript" }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${path || "index.html"}`, { waitUntil: "load" });
  await page.waitForFunction("window.fb && fb.state === 'ready'", null, { timeout: 20000 });
  await splashGone(page);
  const seedError = await page.evaluate("window.__seedError || null");
  if (seedError) throw new Error(`app booted with an empty database: ${seedError}`);
  return { page, errors };
}

/* Seal a page off the internet.

   Written after tools/test_q_landing.mjs was found to have never once tested
   the thing it is named for. It routed on a glob of the form star-star-slash
   gstatic.com-slash-star-star, and that matches nothing: the URL is
   https://WWW.gstatic.com/..., and the leading star-star-slash wants a slash
   where "www." actually sits. All six routes in that file matched zero
   requests, so every "with no network" assertion in it ran with a perfectly
   good network — loading the real Firebase SDK, opening a channel to
   PRODUCTION Firestore, and rendering four rows of real data. The offline path
   the suite exists to defend had never executed, and the assertions raced real
   network latency, which is the documented flake.

   So: seal by origin rather than by naming hosts. A new CDN dependency cannot
   quietly re-open the hole, and the returned array is evidence — assert on it
   when a test needs to prove it stayed off-box.

   mode "abort" — the request is refused (wifi off, captive portal).
   mode "hang"  — the request never answers. This is the RFS case: the wifi
                  associates and nothing ever comes back. */
export async function sealNetwork(page, { mode = "abort", allow } = {}) {
  const blocked = [];
  await page.route(/^https?:\/\//, route => {
    const url = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) return route.continue();
    if (allow && allow.test(url)) return route.continue();
    blocked.push(url);
    if (mode === "hang") return;            // deliberately never settled
    route.abort();
  });
  return blocked;
}

/* AUDIT_NET=1 wraps every page this process opens and reports, at exit, which
   origins the NETWORK actually answered from.

   It exists because test_q_landing.mjs spent its whole life believing it was
   offline while talking to production Firestore: a route glob matched nothing,
   and there was no way to see that. A test that claims to run with no network
   should be able to prove it. Run any browser suite with AUDIT_NET=1 and read
   the NET-AUDIT lines.

   Picking the signal took three tries, and the two obvious events both cry
   wolf. "request" fires even for a request sealNetwork aborts, so it flags a
   correctly-sealed suite. "requestfinished" fires for route-FULFILLED requests
   too, so it flags a correctly-stubbed one — that false positive briefly had
   me reporting test_detailui as reaching production Storage when its route was
   working exactly as intended.

   response.serverAddr() is the honest discriminator: a real remote address when
   the bytes came off the wire, null when a route supplied them. Verified both
   directions against the same URL.

   Declared below its use in loadChromium on purpose — function declarations
   hoist, and this belongs with the diagnostics rather than above the thing
   everyone actually reads. */
function auditNet(chromium) {
  const offbox = new Map();
  const pending = new Set();
  const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/;
  const note = res => {
    const u = res.url();
    if (!/^https?:/.test(u) || LOCAL.test(u)) return;
    const pr = res.serverAddr()
      .then(addr => {
        if (!addr) return;                  // a route answered, not the network
        const origin = (u.match(/^https?:\/\/[^/]+/) || [u])[0];
        offbox.set(origin, (offbox.get(origin) || 0) + 1);
      })
      .catch(() => {})
      .finally(() => pending.delete(pr));
    pending.add(pr);
  };
  process.on("exit", () => {
    const rows = [...offbox.entries()].sort((a, b) => b[1] - a[1]);
    console.log(rows.length ? "NET-AUDIT REACHED-THE-INTERNET" : "NET-AUDIT clean");
    for (const [o, n] of rows) console.log("NET-AUDIT   " + n + "\t" + o);
  });
  return new Proxy(chromium, {
    get(t, k) {
      const v = Reflect.get(t, k);
      if (k !== "launch") return typeof v === "function" ? v.bind(t) : v;
      return async (...a) => {
        const b = await t.launch(...a);
        const oc = b.newContext.bind(b), op = b.newPage.bind(b);
        b.newContext = async (...x) => { const c = await oc(...x); c.on("response", note); return c; };
        b.newPage = async (...x) => { const p = await op(...x); p.on("response", note); return p; };
        return b;
      };
    },
  });
}
