"use strict";
/* core.js — shell for the FEB composites app.
   Holds everything shared across tabs: the in-memory store synced from fb.js,
   the tab router, auth/roster screens, and small helpers every tab reuses.
   Each tab lives in its own classic script (workorders.js, parts.js, …) and
   defines one renderX() that returns HTML for #main. All scripts share global
   scope so inline on* handlers resolve — that's why this isn't a module. */

/* ---------- shared store ---------- */
// One array per Firestore collection, kept in sync by fb.js → onFbData().
// `users` is the live roster (email, name, role, avatar) for pickers/avatars.
let DB = { workOrders: [], parts: [], projects: [], schedule: [], budget: [], documents: [], stock: [], stackplans: [], notifications: [], users: [] };
let view = {
  tab: "dashboard", mode: "list", id: null, edit: false,
  q: "", fStatus: "", fSub: "", fReimb: "", fBudget: "", authMode: "in", sortKey: null, sortDir: null,
};
let pendingRender = false;

/* ---------- the shipped version ----------
   Bumped by tools/release.mjs and by nothing else. There is no build step and
   no ?v= cache busting here, and none is needed: firebase.json serves html/js
   with no-cache, so a reload always fetches the real thing. The version's job
   is to be a name — for a bug report, for a Slack note, for a lead six months
   from now working out when the app changed under them.

   `var`, not `const`: tools/test_app.mjs concatenates these files and reaches
   file-scope declarations through globalThis, which a lexical binding never
   joins. Same reason as WO_NOTES_NEW. */
var APP_VERSION = "6.1.0";
/* What this version changed, in the words a team member would use. Rewritten
   every release. ONE SHORT LINE PER ITEM, five items at most: this renders as
   a modal in front of someone who wants to get to work, and a paragraph per
   bullet is how nobody reads any of it (Simon, 2026-08-29). */
var WHATS_NEW = [
  "Purchaser, engineers, sealed by and laid up by are now picked from the team list instead of typed. Tap the name, choose the person. Someone not on the app? Type their name and pick \"Use\".",
  "Every name is a link. Tap one to see that person's page: what they're engineering, their open issues, their buy-offs, and what they're still owed.",
  "Waiting on reimbursement adds up per person now. \"Nico\" and \"Nico R.\" used to be two people splitting one person's money.",
  "\"My parts\" and \"my runs\" go by who you are, not by your first name, so two Nicks no longer get each other's work.",
  "Leads: People has an Unlinked view for old typed names. One press links the obvious ones; the rest take a pick each.",
];



/* ---------- config/release ----------
   { version, notes[], publishedAt }, written by a lead from the ⋯ menu after a
   deploy. The app is a long-lived SPA: an installed PWA left open on a bench
   tablet keeps running the JS it loaded this morning, so a fix pushed at noon
   reaches nobody until somebody happens to reload. This is how they find out.

   Watched, not fetched: loadSeason can read once at boot because the season
   does not change while you are looking at it. A release does. */
window.RELEASE = null;
let releaseWatched = false;
function loadRelease() {
  if (releaseWatched || !window.fb || fb.state !== "ready" || !fb.watchConfig) return;
  releaseWatched = true;
  fb.watchConfig("release", d => { window.RELEASE = d; render(); });
}
/* Numeric, field by field. A plain string compare says "4.10.0" < "4.9.0",
   and a plain !== raised the banner on a build NEWER than the last announce:
   v4.2.0 went live before anyone pressed Announce, so config/release still
   said 4.1.1 and every screen was told to reload into a version it had
   already left behind (Simon, 2026-09-02). Only an announce that is ahead
   of the running code is news. */
function versionNewer(a, b) {
  const pa = String(a || "").split(".").map(Number), pb = String(b || "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
function newerVersionOut() {
  const r = window.RELEASE;
  return !!(r && r.version && versionNewer(r.version, APP_VERSION) && !view.relDismissed);
}
function releaseBanner() {
  if (!newerVersionOut()) return "";
  return `<div class="gate no-print"><span class="gi">↻</span><div><b>v${esc(window.RELEASE.version)} is out</b> — you are running v${esc(APP_VERSION)}.
    <button class="link" onclick="location.reload()">Reload to get it</button>
    <button class="link" onclick="view.relDismissed=true;render()">Not now</button></div></div>`;
}
/* Lead-only, from the ⋯ menu, and deliberately a separate act from deploying.
   tools/release.mjs ships the code; a lead standing in the new version says so
   to everyone else. That keeps the release script free of any credential. */
async function publishRelease() {
  if (!isLead() || !window.fb || !fb.setConfig) return;
  try {
    await fb.setConfig("release", { version: APP_VERSION, notes: WHATS_NEW, publishedAt: new Date().toISOString() });
    toast(`v${APP_VERSION} announced — everyone still on an older build now sees a reload prompt.`);
  } catch (e) { toast("Couldn't publish the release: " + ((e && e.message) || e), "error"); }
}

/* ---------- what's new ----------
   Opens itself once per version per browser, then lives in the ⋯ menu. The
   localStorage stamp is per-browser on purpose: "have YOU seen this" is a
   property of the screen in front of someone, not of their account. */
let WHATS_NEW_SHOWN = false;
function openWhatsNew() {
  openModal(`
    <h2>What's new in v${esc(APP_VERSION)}</h2>
    <ul class="tny" style="margin:0 0 4px;padding-left:18px;line-height:1.7">
      ${WHATS_NEW.map(n => `<li>${esc(n)}</li>`).join("")}
    </ul>
    <div class="foot"><button class="primary" onclick="closeModal()">Got it</button></div>`);
}
function maybeShowWhatsNew() {
  if (WHATS_NEW_SHOWN) return;
  /* Never over a scanned link. A QR redeemed at the same moment would open its
     record BEHIND this modal, which reads as the scan having failed. */
  if (PENDING_LINK) return;
  WHATS_NEW_SHOWN = true;
  try {
    const seen = localStorage.getItem("feb-app-version");
    localStorage.setItem("feb-app-version", APP_VERSION);
    // No stamp at all means a browser that has never run this app. A first-run
    // user does not need to be told what changed since a version they never saw.
    if (!seen || seen === APP_VERSION) return;
  } catch (e) { return; }   // private mode, or a stub without localStorage
  openWhatsNew();
}

/* ---------- season config ----------
   config/season = { compName, compDate, seasonStart, milestones: [{label,
   date}] }, the dashboard's countdown source. Lives in the lead-writable
   config collection (same trust shape as the Slack webhook) because no
   competition date exists anywhere in the record data. Fetched once per
   session after auth reaches ready; a missing doc never clobbers a value a
   test fixture planted, which is also why this reads and writes
   window.SEASON rather than a lexical binding. */
window.SEASON = null;
let seasonFetched = false;
function loadSeason() {
  if (seasonFetched || !window.fb || fb.state !== "ready" || !fb.getConfig) return;
  seasonFetched = true;
  fb.getConfig("season").then(d => { if (d) { window.SEASON = d; render(); } }).catch(() => {});
}

/* ---------- sync hooks (called by fb.js) ---------- */
window.onFbChange = function () {
  splashAuth();
  loadSeason();
  loadRelease();
  if (typeof loadResinOverrides === "function") loadResinOverrides();
  if (typeof loadRestockRules === "function") loadRestockRules();
  if (typeof loadLabelMedia === "function") loadLabelMedia();
  if (typeof loadTrainingCatalog === "function") loadTrainingCatalog();
  if (typeof loadTechniqueCatalog === "function") loadTechniqueCatalog();
  render();
  // The Fusion palette holds a mesh until the app is signed in; tell it.
  if (typeof fusionStateChanged === "function") fusionStateChanged();
};

/* The collections the landing page actually reads. Waiting on these — rather
   than on all eleven — is what stops the dashboard painting empty and then
   filling in a second later, which is the thing the splash was covering for and
   never actually fixed.

   Not all eleven, because the tail of them (stackplans, documents, lots) has
   nothing to do with what you see first, and a gate is only as fast as its
   slowest member. */
const SPLASH_CORE = ["parts", "workOrders", "schedule"];

/* fb.state has settled. THREE milestones close here, and which ones depends on
   where the boot is going.

   The signed-out and pending paths are the important half. startSync() never
   runs for them (fb.js), so no snapshot will ever arrive — the destination is
   the sign-in card or the "ask a lead" card, and both are legitimate places to
   land. Marking `data` as NOT NEEDED is what lets the gate arm for them. Without
   it the splash would hang forever in front of exactly the people who most need
   to see the sign-in screen, which is the single worst thing this rewrite could
   do. */
function splashAuth() {
  if (!window.fb || fb.state === "loading") return;
  splashStep("auth", 1);
  /* A roster read that failed for a reason other than "you are not on it" is a
     genuine failure and says so. `pending` itself is not a failure: it is a
     definite answer about your access, and the app has a card for it. */
  if (fb.rosterCheckFailed) splashStep("access", -1, "Could not check the roster — the shop wifi at RFS drops sometimes.");
  else splashStep("access", 1);
  if (fb.state !== "ready") splashStep("data", 2);
}

window.onFbData = function (coll, arr) {
  if (SPLASH_CORE.includes(coll)) {
    if (!SPLASH_SEEN) SPLASH_SEEN = {};
    SPLASH_SEEN[coll] = true;
    /* A collection a guest is denied still reports here, as an empty array
       (fb.js drops that one listener and publishes []). So a denied read closes
       this milestone rather than stalling it, which is correct: the answer
       arrived, and the answer was "nothing you can see". */
    if (SPLASH_CORE.every(c => SPLASH_SEEN[c])) splashStep("data", 1);
  }
  /* ---------- the one place a tombstone is filtered ----------
     All twelve collections are unfiltered whole-collection listeners, and
     roughly forty sites read DB[coll] to list, filter and count. Splitting HERE
     means none of them change and none of them can be missed. The failure mode
     of a missed site would be a deleted mold still counted on the dashboard,
     still printed on a report, and still resolving from a QR label; the failure
     mode of this split is that the Trash view needs its own source, which is
     one place and is DB.trash.

     Nothing else in the app should ever test `.deleted`. If you find yourself
     adding `&& !r.deleted` somewhere, this is why you do not have to. */
  const live = [], dead = [];
  for (const r of arr) (r && r.deleted ? dead : live).push(r);
  DB[coll] = live;
  (DB.trash = DB.trash || {})[coll] = dead;
  // A mesh from Fusion waits for the rack as well as for the sign-in.
  if (coll === "stock" && typeof fusionStateChanged === "function") fusionStateChanged("stock");
  // Don't yank the DOM out from under someone mid-edit: another member's (or
  // our own echoed) update re-renders once focus leaves the field.
  const ae = document.activeElement;
  if (ae && ["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) && ae.closest("#main")) {
    pendingRender = true;
  } else {
    render();
  }
};
document.addEventListener("focusout", function () {
  setTimeout(function () {
    if (!pendingRender) return;
    const ae = document.activeElement;
    if (ae && ["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) && ae.closest("#main")) return;
    pendingRender = false; render();
  }, 0);
});

/* ---------- generic data helpers ---------- */
// Pass the field you changed and only that field is written, so concurrent or
// stale-cache edits to other fields of the same record can't clobber it.
/* SHOWN, DISABLED, WITH A REASON — and NOT with the disabled attribute.

   Chrome dispatches no click and shows no title tooltip on a disabled control,
   so the reason would be unreachable on exactly the device this gets demoed
   from. This app has written that down twice already, independently: the part
   stage steps in parts.js keep themselves live because "the click is how you
   find out what is missing", and the buy-off button in workorders.js says a
   dead grey button with a tooltip nobody on a phone can hover is the version of
   this that fails.

   So: aria-disabled for the screen reader, title for the mouse, and a click
   that explains itself for the finger. gx() emits the whole set, and returns
   nothing at all when the person can edit — so a call site reads the same in
   both states:

     <button ${gx("Sign in to sign off on a step.")} onclick="buyoff(3)">buy off</button>

   gx() adds no handler of its own. The element keeps whatever onclick it always
   had, and the capture-phase listener below is what stops it running — which is
   why the order of the attributes on the tag does not matter, and why a control
   wired up from JS rather than from markup is caught too. The listener is the
   mechanism; the attributes are the label and the reason. */
function gx(why) {
  if (canEdit()) return "";
  const w = esc(why || "Guest view — sign in to change anything.");
  /* NO class attribute, and that is not a style preference. Half these controls
     already carry one — class="primary" on the buy-off button, class="ib" on
     every toolbar action — and an element with two class attributes keeps the
     FIRST and silently drops the second, so a class here would be applied to
     exactly the plain buttons and to none of the ones that matter.

     The attribute pair is the hook instead: [aria-disabled][data-why] is what
     the stylesheet targets and what the listener matches, it cannot collide
     with anything, and it works on any element.

     The leading space belongs to gx() so a call site can write `<button${gx()}`
     and emit no stray whitespace when the person can edit — which keeps the
     markup identical to what it was for everybody who is not a guest. */
  return ` aria-disabled="true" title="${w}" data-why="${w}"`;
}
/* One delegated listener, on DOCUMENT and in the CAPTURE phase.

   Document, not #app: #modal and #toasts are siblings of it, and every submit
   button in this app lives in a modal. Capture, so it runs before the element's
   own inline handler and can stop it. */
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest && e.target.closest('[aria-disabled="true"][data-why]');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof toast === "function") toast(t.getAttribute("data-why"), "info");
  }, true);
}

/* LAYER 1 OF THREE. fb.js refuses a guest's write outright and the rules refuse
   it again on the server; this exists so that a path nobody thought to disable
   produces a sentence a person can act on instead of a raw exception toast. */
function guestBlocked(what) {
  if (canEdit()) return false;
  if (window.fb && fb.guest) toast(what || "Guest view — sign in to change anything.", "info");
  return true;
}
function save(coll, obj, field) {
  if (guestBlocked()) return;
  if (obj) fb.save(coll, obj, field).catch(e => toast("Save failed: " + e.message,"error"));
}
/* Several fields of one record in ONE write. A person field is a name and an
   email, and two field saves meant a moment where the name was new and the
   email still said who it used to be — with a snapshot landing in between,
   that is what the screen showed. `fields` are applied to obj first so the
   page is right before the write returns. */
function savePatch(coll, obj, fields) {
  if (guestBlocked()) return;
  if (!obj || !fields) return;
  Object.assign(obj, fields);
  fb.patch(coll, obj, Object.keys(fields)).catch(e => toast("Save failed: " + e.message,"error"));
}
// Concurrency-safe edit of one array/object field: apply `mutator` to the
// fresh server value inside a transaction so simultaneous edits to *other*
// items in the same field don't clobber each other. `obj` already carries the
// optimistic local change, so if the transaction can't run (offline) we fall
// back to a plain field write. Use this for buy-offs and any in-place array
// item edit; use fb.appendTo for pure append (project updates).
function saveField(coll, obj, field, mutator) {
  if (guestBlocked()) return;
  if (!obj) return;
  fb.mutateField(coll, obj.id, field, mutator).catch(() => fb.save(coll, obj, field).catch(e => toast("Save failed: " + e.message,"error")));
}
function del(coll, id) {
  if (guestBlocked()) return Promise.resolve();
  return fb.del(coll, id).catch(e => toast("Delete failed: " + e.message,"error"));
}
// Every caller reads its whole form BEFORE awaiting this, because the offline
// fallback below opens a modal, and openModal() replaces whatever modal was on
// screen — including the create form the caller is still reading fields from.
async function allocId(coll, cls) {
  if (guestBlocked()) return null;
  try { return await fb.allocId(coll, cls); }
  catch (e) {
    const ok = await confirmAsync("Couldn't reach the shared ID counter (offline?). Assign a local ID now — it could collide with one made on another laptop. Continue?",
      { ok: "Use a local ID", danger: false });
    if (!ok) return null;
    return localId(coll, cls);
  }
}
/* N ids at once. One transaction instead of N, which is the difference between
   a 200-row stock-take that commits and one that dies half written on shop
   wifi. Read your whole form before awaiting this, for the same reason as
   allocId: the fallback opens a modal.

   Falls back to the one-at-a-time path on ANY failure, which covers the window
   where the client has shipped but the rules deploy has not — an old ruleset
   refuses every block write, and a delivery that cannot be received is a far
   worse outcome than a slow one. */
async function allocIds(coll, cls, n) {
  if (guestBlocked()) return [];
  if (!(n > 0)) return [];
  if (n === 1) { const id = await allocId(coll, cls); return id ? [id] : []; }
  try {
    /* The rules cap one counter write at +50, so a stock-take asking for 180
       consumables is four writes, not one refusal. Still nothing like the 180
       round trips it replaces, and a block that fails partway leaves the ids
       it already took unused — a gap, which costs nothing. */
    const out = [];
    while (out.length < n) {
      const want = Math.min(50, n - out.length);
      const got = await fb.allocIdBlock(coll, cls, want);
      out.push(...got);
      // A block that comes back short is a refusal, not a reason to ask again:
      // looping would spin forever, and the caller reports the shortfall.
      if (got.length < want) break;
    }
    return out;
  }
  catch (e) {
    const ok = await confirmAsync(`Couldn't reserve ${n} IDs in one go (offline, or the shared counter is on an older ruleset). Fall back to one at a time? It is slower, and if it stops partway you will be told exactly where.`,
      { ok: "Go one at a time", danger: false });
    if (!ok) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      let id = null;
      try { id = await fb.allocId(coll, cls); } catch (e2) { id = null; }
      if (!id) break;               // caller reports the short count; never silently truncate
      out.push(id);
    }
    return out;
  }
}

/* Offline fallback only; the normal path is the shared counter in fb.allocId().
 *
 * `cls` and the prefix-scoped scan below are NOT optional detail. This used to
 * take the highest `-SN6-(\d+)` in the WHOLE collection, which was fine when
 * every collection held one kind of record. `items` and `lots` hold several
 * (PNL/JIG/BIN, FAB/RSN/CON), so an unscoped scan would hand out PNL-SN6-014
 * because a JIG happened to reach 13 — colliding with a real PNL the moment the
 * counters resynced, and silently, because the ids look perfectly well formed.
 *
 * It would only ever happen on the offline path, which is the RFS wifi-dropout
 * case nobody tests under. Hence: filter by prefix, not by collection.
 */
/* SCANS DB[coll] WHOLE, and must keep doing so. Filtering this list — to season
   parts, to non-retro, to anything — mints an id that already exists on a
   record the filter hid, and CS-013 §4.1 rule 2 says ids are never reused. The
   collision is offline-only, silent, and produces well-formed ids, which is the
   worst combination there is. */function localId(coll, cls) {
  const prefix = cls || ID_PREFIX_LOCAL[coll] || coll.toUpperCase();
  const code = typeof seasonCode === "function" ? seasonCode() : "SN6";
  const re = new RegExp("^" + prefix + "-" + code + "-(\\d+)$");
  let max = 0;
  (DB[coll] || []).forEach(o => { const m = String(o.id).match(re); if (m) max = Math.max(max, +m[1]); });
  return `${prefix}-${code}-${String(max + 1).padStart(3, "0")}`;
}
// Mirrors ID_PREFIX in fb.js, which is module-scoped and invisible here.
// Multi-class collections are absent on purpose: they must be given a class.
const ID_PREFIX_LOCAL = {
  workOrders: "WO", parts: "P", projects: "PROJ", budget: "BUY",
  documents: "DOC", stock: "BRD", stackplans: "STK", molds: "MOLD",
};
function recById(coll, id) { return (DB[coll] || []).find(o => o.id === id); }

/* ---------- SVG icon system ----------
   Lucide-style stroke icons as inline SVG, so nothing depends on an icon font
   or emoji. icon(name, size) returns a self-contained <svg>. Unknown names fall
   back to a dot so a typo is visible, not blank. */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  workorders: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h6"/>',
  parts: '<path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  // A mold: a block with a part-shaped cavity. Shares no strokes with `parts`
  // (the cube), which it collided with in the sidebar until 2026-08-04.
  molds: '<path d="M3 4v13a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V4"/><path d="M7 4v5a5 5 0 0 0 10 0V4"/>',
  // An open storage bin, for the Inventory tab.
  inventory: '<path d="M2 5h20v4H2z"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  projects: '<rect x="3" y="4" width="5" height="16" rx="1.2"/><rect x="9.5" y="4" width="5" height="10" rx="1.2"/><rect x="16" y="4" width="5" height="13" rx="1.2"/>',
  timeline: '<path d="M3 5h11M3 12h18M3 19h8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  budget: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  reports: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  // Viewfinder brackets around a code, which is what the action looks like.
  scan: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="7" y="7" width="4" height="4" rx=".5"/><rect x="13" y="13" width="4" height="4" rx=".5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  paperclip: '<path d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.48-8.49"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
  roster: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-4.5-4.5L5 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  // Added for Google Docs/Slides links. There was no chain, no arrow-out-of-box
  // and no slide glyph, which is why the rich-text editor's Link button still
  // falls back to a raw emoji.
  link: '<path d="M9.5 14.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1 1"/><path d="M14.5 9.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1-1"/>',
  externalLink: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
  presentation: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8.5 21l3.5-2 3.5 2"/>',
  /* A flask. Not the cube, the layer stack, the bin, the bar chart or the
     calendar grid — checked against every glyph above so the rail reads at a
     glance rather than by squinting. */
  rnd: '<path d="M9 3h6"/><path d="M10 3v5.5L4.6 17A2 2 0 0 0 6.3 20h11.4a2 2 0 0 0 1.7-3L14 8.5V3"/><path d="M7.5 14h9"/>',
  season: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 9v11"/>',
  _fallback: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
};
function icon(name, size) {
  size = size || 18;
  const p = ICONS[name] || ICONS._fallback;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
// The FEB "speed slash" mark (two offset parallelograms), reproduced as SVG so
// it stays crisp anywhere. Blue upper, gold lower. Used in the sidebar brand,
// the drawer, and (rasterised) the PWA icons.
function febMark(size) {
  size = size || 26;
  return `<svg class="feb-mark" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M40 18 H86 L60 52 H14 Z" fill="#2f6be4"/>
    <path d="M40 50 H86 L60 84 H14 Z" fill="#fdb515"/>
  </svg>`;
}

/* ---------- small helpers ---------- */
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
/* One number for a board grade.
   Density is typed by hand in three places and read by a dozen, two of which
   compare it with === and one of which builds the SZ: grouping key out of it.
   "60", 60 and "60 " must therefore collapse to one value everywhere, or one
   rack splits into two rows and the packer reports a shortfall while standing
   in front of a full shelf.
   Strict Number, not parseFloat: quietly accepting "60 lb" is exactly the
   coercion this exists to stop. One decimal, because 45.5lb board exists and
   45.50001 does not. Blank or unparseable -> null, so every caller states its
   own default rather than inheriting 30 by accident.
   NOT reachable from packer.js, which is importScripts()'d into
   slicer.worker.js without core.js. The packer needs no helper: blanksFromPlans
   and boardsForPacking both canonicalise before it ever runs. */
function canonDensity(v) {
  const n = Number(String(v ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}
/* Compare two record ids the way a person reads them.
   Ids are PREFIX-SNx-NNN and allocId pads the number to three digits, so the
   padding STOPS at 999 — plain string order therefore puts FAB-SN6-1000 before
   FAB-SN6-999, and a label sheet prints out of sequence. That was always a
   latent bug at a thousand records; reserving id blocks makes it reachable much
   sooner, because a cancelled batch burns its numbers. Compare the head as
   text and the trailing digits as a number, and fall back to plain string
   order for anything that is not shaped like an id. */
function cmpId(a, b) {
  const A = String(a ?? ""), B = String(b ?? "");
  // Split a trailing run of digits off the end, without a regex, so this
  // stays readable and has no escaping to get wrong.
  const tail = (t) => {
    let i = t.length;
    while (i > 0 && t.charCodeAt(i - 1) >= 48 && t.charCodeAt(i - 1) <= 57) i--;
    return i === t.length ? null : [t.slice(0, i), Number(t.slice(i))];
  };
  const pa = tail(A), pb = tail(B);
  if (pa && pb && pa[0] === pb[0]) return pa[1] - pb[1];
  return A.localeCompare(B);
}

function today() { return new Date().toISOString().slice(0, 10); }
/* MAY THIS PERSON CHANGE ANYTHING AT ALL.

   Guest mode is a second point on the permission axis this app already had,
   rather than a new one beside it, and almost all of its reach comes from that
   one decision. isLead() gains a canEdit() clause, so every one of its
   forty-nine call sites — the Roster and Restore buttons, role selects,
   training grants, resetSteps, the tracker feed setup, every lead-only delete —
   stops offering itself to a guest with no edit anywhere else in the app. That
   is the correct render, not a trick: a guest is not a lead.

   The second cascade is in render(), which forces view.edit off. Every detail
   page's field() helper already returns a read-only <div class="ro"> when that
   flag is down, so roughly a hundred and thirty of the app's inputs go quiet on
   one line.

   What is left after those two is the bench buttons — buy off, delete, upload,
   comment — and those are treated by hand with gx(). */
function canEdit() {
  return !!(window.fb && fb.state === "ready" && !fb.guest && fb.roster);
}
function isLead() { return canEdit() && fb.roster.role === "lead"; }
/* A lead who would rather not be read as one. `showAs: "member"` on the
   roster doc changes what the role PILL says wherever a role is shown to the
   team (People, the account menu); isLead() and firestore.rules never look at
   it, so permissions are untouched. Simon, 2026-09-03: "I don't want members
   thinking I am lead." The Roster admin page, which only a lead opens, still
   prints the real role so leads can see who actually holds it. */
function displayRole(u) {
  if (!u) return "member";
  return u.role === "lead" && u.showAs === "member" ? "member" : (u.role || "member");
}
function showsAsLead() { return isLead() && displayRole(fb.roster) === "lead"; }
async function setMyShowAs(asMember) {
  if (!isLead()) return;
  try {
    await fb.rosterPatch(myEmail(), { showAs: asMember ? "member" : "" });
    toast(asMember ? "You now appear as a member. Your lead access is unchanged." : "You appear as a lead again.");
  } catch (e) { toast("Couldn't change that: " + e.message, "error"); }
}
function signerName() {
  if (!window.fb) return "?";
  return (fb.roster && fb.roster.name) || (fb.user && fb.user.name) || "?";
}
function myEmail() { return (window.fb && fb.user && fb.user.email) || ""; }

/* ---------- season vs R&D ----------

   `rnd` says which PROGRAMME a part belongs to inside a season:
     false  a deliverable — a thing that has to be on the car
     true   a real part, real carbon, a real cost and a real deadline, that is
            not on the car: a coupon, a test panel, a layup trial, a mold
            shakedown

   This is NOT a scratch flag and it is NOT a second `retro`. They are different
   axes and both can be true of the same record:
     retro = which SEASON     (the SN5 archive vs this one)
     rnd   = which PROGRAMME  (deliverable vs R&D) inside a season

   THE DIFFERENCE THAT MATTERS. `retro` means two things at once — "not this
   season's plan" AND "do not enforce, this is a document and not a job". R&D
   wants the first and the exact OPPOSITE of the second. A mold shakedown that
   skips the stack-freeze blocker is how you get a bad shakedown, and an R&D
   cure hold is a real cure hold with real resin and a real clock. So every
   `if (x.retro) return null` gate in this app stays exactly as written and
   never gains an `rnd` test. Adding one there would silently turn this into
   `retro` with a different word, which is the likeliest way to break this
   feature.

   Read-time normalisation, no backfill — the technique projStatus()
   (projects.js) already uses. Every record written before this field existed
   reads as a season part, which is what all 33 SN5 parts, all 26 SN5 work
   orders and everything made in SN6 up to now actually are. It is also why
   fb.js's snapshots did NOT grow a where(): Firestore's == does not match a
   document where the field is absent, so a server-side filter would have made
   a backfill mandatory. */
function isRnd(rec) { return !!(rec && rec.rnd); }

/* THE ONE PREDICATE every "is this on this season's board" site calls.

   Fused on purpose. `retro` is honoured in about twenty-five places and
   forgotten in nine, and the reason is that each site has to remember a flag
   test. A second flag on a second axis would double that failure. Nothing
   should ever spell out `!p.retro && !isRnd(p)` by hand. */
function inSeason(rec) { return !!rec && !rec.retro && !isRnd(rec) && !rec.archived && thisSeason(rec); }

/* ---------- seasons and archiving (v4.3.0) ----------
   A record's season is READ OFF ITS ID: P-SN5-001 is SN5, WO-SN6-010 is SN6.
   Every id this app has ever minted carries the code (CS-013 §4.1), so nothing
   needs a backfill and nothing can disagree with its own id. An explicit
   `season` field wins when present, for the day a record has to be re-homed.
   The CURRENT season is config/season.code, set in Season settings; "SN6" is
   the fallback so a missing config doc changes nothing on the live data.

   Rolling a season over is therefore one edit in Season settings: new ids
   mint with the new code and their own counters (fb.allocId), the rails
   default to the new season, and last season's records are one chip away
   rather than deleted. Nothing is ever deleted to make room (Simon,
   2026-09-03: "in the future we won't want to have deleted anything").

   `archived` is the other axis: a record we are done with inside a season.
   Off the board (inSeason is false), off the rails by default, still there,
   still openable, restorable. NOT retro: an archived run still enforces its
   gates if somebody reopens and works it. */
function seasonCode() { return (window.SEASON && window.SEASON.code) || "SN6"; }
function recSeason(rec) {
  if (!rec) return "";
  if (rec.season) return rec.season;
  const m = String(rec.id || "").match(/-(SN\d+)-/);
  return m ? m[1] : seasonCode();
}
function thisSeason(rec) { return recSeason(rec) === seasonCode(); }
function isArchived(rec) { return !!(rec && rec.archived); }
/* What a rail's summary tiles and overview count: this season, not archived.
   R&D and retro are left in, because the tiles already know about those. */
function railLive(list) { return (list || []).filter(r => thisSeason(r) && !isArchived(r)); }
/* The counts a rail chip needs: how many of this collection are archived, and
   how many belong to some other season. Counted over what EXISTS, not what is
   on screen, because while the chip is off that number is what is held back. */
function railHeldBack(list) {
  const arch = (list || []).filter(isArchived).length;
  const other = (list || []).filter(r => !thisSeason(r)).length;
  const codes = [...new Set((list || []).filter(r => !thisSeason(r)).map(recSeason))].sort();
  return { arch, other, otherLabel: codes.length === 1 ? codes[0] : "other seasons" };
}
/* Archive or restore a list of records in one collection. Any roster member,
   because the rules allow the update and archiving is a visibility change,
   not a destruction: the record keeps every field and can be restored. */
function setArchived(coll, ids, on) {
  if (guestBlocked("Sign in to archive.")) return 0;
  const set = new Set(ids || []);
  const recs = (DB[coll] || []).filter(r => set.has(r.id) && !!r.archived !== !!on);
  recs.forEach(r => {
    r.archived = !!on;
    r.archivedAt = on ? today() : "";
    r.archivedBy = on ? myEmail() : "";
    save(coll, r, "archived"); save(coll, r, "archivedAt"); save(coll, r, "archivedBy");
  });
  return recs.length;
}
/* ---------- recently deleted ----------
   `archived` is visibility and `deleted` is deletion; they are separate axes
   and must not be conflated (DESIGN-NOTES.md says so about archived, and it is
   still true). An archived record is on the rail behind a chip; a deleted one
   is gone from every rail, every count and every mirror, and comes back whole.

   The tombstone. `purgeAfter` is STORED rather than computed from deletedAt at
   read time, so changing the policy later cannot retro-purge things already in
   the bin. `deletedFiles` is frozen at trash time because Storage LISTING is
   denied by rule — that list is the only record of what to remove, and losing
   it strands the blobs forever. `backrefs` is what a cascade CLEARED on other
   records, so a restore can put the links back; clearing them without recording
   them is what makes a delete irreversible even when the document survives.
   `trashBatch` is shared by everything taken in one gesture, so a work order
   and the issues that went with it come back together. */
const TRASH_DAYS = 30;
const TRASH_KEYS = ["deleted", "deletedAt", "deletedBy", "purgeAfter", "trashBatch", "deletedFiles", "backrefs"];
function isTrashed(rec) { return !!(rec && rec.deleted); }
function trashedIn(coll) { return (DB.trash && DB.trash[coll]) || []; }
/* Everything in the bin, newest first, as {coll, rec}. The Trash view's only
   source, because DB[coll] deliberately cannot see these. */
function allTrashed() {
  const out = [];
  Object.keys(DB.trash || {}).forEach(coll => trashedIn(coll).forEach(rec => out.push({ coll, rec })));
  return out.sort((a, b) => String(b.rec.deletedAt || "").localeCompare(String(a.rec.deletedAt || "")));
}
function daysSince(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0;
}
function plusDays(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
function newTrashBatch() { return "T" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* Send records to the bin. `items` is [{coll, id, files, backrefs}] — files and
   backrefs are per record, because a cascade collects different ones for each.

   Any roster member may trash, which is a deliberate widening: update is
   already open to every member on every collection, and a delete that is
   reversible for thirty days and names who did it is a smaller thing to hand
   out than one that is not. PURGE stays lead-only, in the rules and in the UI.

   Returns the trashBatch, so a caller can offer an undo or restore the set. */
async function trashRecords(items, opts) {
  if (guestBlocked("Sign in to delete.")) return null;
  const list = (items || []).filter(x => x && x.coll && x.id);
  if (!list.length) return null;
  const batch = (opts && opts.batch) || newTrashBatch();
  const patchFor = (it) => ({
    deleted: true, deletedAt: new Date().toISOString(), deletedBy: myEmail(),
    purgeAfter: plusDays(TRASH_DAYS), trashBatch: batch,
    deletedFiles: it.files || [], backrefs: it.backrefs || [],
  });
  const payload = list.map(it => ({ coll: it.coll, id: it.id, patch: patchFor(it) }));
  /* Optimistic: move it out of the live array now. The snapshot will do the
     same thing a moment later through onFbData; doing it here is what makes the
     rail update at the speed of the tap rather than the speed of the network. */
  payload.forEach(p => {
    const rec = (DB[p.coll] || []).find(r => r.id === p.id);
    if (!rec) return;
    Object.assign(rec, p.patch);
    DB[p.coll] = (DB[p.coll] || []).filter(r => r.id !== p.id);
    ((DB.trash = DB.trash || {})[p.coll] = trashedIn(p.coll).concat([rec]));
  });
  try { await fb.trashMany(payload); } catch (e) { toast("Delete failed: " + e.message, "error"); }
  return batch;
}

/* Bring them back, and put back whatever the cascade cleared on records that
   were never deleted themselves. */
async function untrashRecords(items) {
  if (guestBlocked("Sign in to restore.")) return 0;
  const list = (items || []).filter(x => x && x.coll && x.id);
  if (!list.length) return 0;
  const clear = { deleted: false, deletedAt: "", deletedBy: "", purgeAfter: "", trashBatch: "", deletedFiles: [], backrefs: [] };
  const payload = [];
  for (const it of list) {
    const rec = trashedIn(it.coll).find(r => r.id === it.id);
    if (!rec) continue;
    /* The back-links first, and only where the other record still exists. A
       pointer restored onto something that has since gone is a dangling id, and
       this feature exists to stop exactly that class of damage. */
    for (const b of (rec.backrefs || [])) {
      const target = (DB[b.coll] || []).find(r => r.id === b.id);
      if (!target) continue;
      /* A container scrubbed off a purchase's received line. Not a plain field:
         a line can name several containers and only some of them went, so this
         puts back the ids it took and leaves the rest alone. */
      if (b.lotRefs) {
        const merge = l => l.lineId === b.lotRefs.lineId
          ? { ...l, lotRefs: [...new Set((l.lotRefs || []).concat(b.lotRefs.ids))] } : l;
        target.lines = (target.lines || []).map(merge);
        saveField(b.coll, target, "lines", arr => (arr || []).map(merge));
        continue;
      }
      if (!target[b.field]) { target[b.field] = b.value; save(b.coll, target, b.field); }
    }
    Object.assign(rec, clear);
    DB.trash[it.coll] = trashedIn(it.coll).filter(r => r.id !== it.id);
    DB[it.coll] = (DB[it.coll] || []).concat([rec]);
    payload.push({ coll: it.coll, id: it.id, patch: clear, obj: rec });
  }
  if (!payload.length) return 0;
  try { await fb.untrashMany(payload); } catch (e) { toast("Restore failed: " + e.message, "error"); }
  return payload.length;
}

function archivedPill(rec, tny) {
  return isArchived(rec) ? ` <span class="pill archived${tny ? " tny" : ""}" title="Archived${rec.archivedAt ? " " + esc(rec.archivedAt) : ""}${rec.archivedBy ? " by " + esc(userName(rec.archivedBy)) : ""}">archived</span>` : "";
}

/* A run's programme is its PART's, asked fresh every time.

   DERIVED, never stored. If a run kept its own copy, promoting a part would be
   N non-atomic writes (fb.save is one document, and there is no batched
   per-field primitive) and a guaranteed half-promoted state on shop wifi.
   Derived, promotion is ONE field write on ONE document, and a relink is free.

   partOf() resolves by partId, then the legacy pointer, then a UNIQUE
   partName — and refuses an ambiguous name. Inheriting through the name match
   is deliberate: 0 of 33 SN5 parts carry an id link, so the name is the only
   edge the archive has, and a wrong match there mislabels a pill. It can never
   hide a record, because nothing in this app hides runs.

   A standalone run — no part to ask — falls back to its own field. One quirk
   follows and is worth knowing: a standalone run marked R&D and LATER linked
   to a season part reads as season, because the part wins, while keeping a
   dormant rnd:true on disk. Unlink it and it reverts. That is arguably right
   (it was born an R&D run) and is not worth a delete-on-link write. */
function woIsRnd(wo) {
  if (!wo) return false;
  const r = typeof partOf === "function" ? partOf(wo) : null;
  return r ? isRnd(r.part) : !!wo.rnd;
}

/* The badge, in one place so the ampersand is entity-escaped ONCE. It is a
   literal in an innerHTML template at eight call sites, and a bare & there is
   a bug waiting for the one browser that cares.

   .tpill and not .pill: the capsule is the design system's documented shape for
   "a credential, not a status", and R&D is a category rather than a position in
   any lifecycle. See the CSS in index.html for why it is hueless.

   ALWAYS rendered — deliberately NOT the mixedRetro idiom (parts.js). Retro can
   hide itself in an all-retro list because the archive is signposted elsewhere.
   R&D cannot: an all-R&D filtered rail with no badges is pixel-identical to a
   screenshot of the season, which is the one thing this feature exists to make
   impossible. */
/* The collection-generic form, for the places that are handed a (coll, record)
   pair and cannot know which accessor applies: the label, the public nameplate
   and the label-sheet builder. A work order's programme is DERIVED from its
   part, so asking isRnd() on one reads a field that is only ever the standalone
   fallback and is dormant on every linked run. Molds, boards, items and lots do
   not carry the flag at all and correctly answer false. */
function recIsRnd(coll, o) { return coll === "workOrders" ? woIsRnd(o) : isRnd(o); }

function rndBadge(on) {
  return on ? ' <span class="tpill rnd" title="R&amp;D — a real part, but not a season deliverable">R&amp;D</span>' : "";
}

/* ---------- users & avatars ---------- */
function usersSorted() { return (DB.users || []).slice().sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)); }
function userByEmail(email) { return (DB.users || []).find(u => u.email === email); }
function userName(email) { const u = userByEmail(email); return (u && u.name) || email || "?"; }
/* ---------- trainings ----------
   Grants live on roster docs (trainings.<id> = {by, at}, lead-written), so
   they're already in DB.users and these are synchronous pure lookups. The
   catalog itself (TRAININGS) is a const in workorders.js, next to the step
   templates that reference its ids. */
function hasTraining(email, id) {
  const u = userByEmail(String(email || "").toLowerCase());
  return !!(u && u.trainings && u.trainings[id]);
}
function qualifiedFor(id) { return usersSorted().filter(u => u.trainings && u.trainings[id]); }
function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "?"; }
// Stable color from a string, so a person's initials-avatar is always the same hue.
function hueOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
// Avatar as an HTML string: photo if the roster entry has one, else initials on color.
function avatar(emailOrUser, size) {
  size = size || 26;
  const u = typeof emailOrUser === "string" ? (userByEmail(emailOrUser) || { email: emailOrUser, name: emailOrUser }) : emailOrUser;
  const title = esc(u.name || u.email || "");
  const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (u.avatar) return `<span class="avatar" style="${st}" title="${title}"><img src="${esc(u.avatar)}" alt="${title}"></span>`;
  return `<span class="avatar init" style="${st};background:hsl(${hueOf(u.email || u.name || "?")} 55% 45%)" title="${title}">${esc(initials(u.name || u.email))}</span>`;
}
/* ---------- person references ----------
   Every "who" field used to be typed text, so "Nico" and "Nico R." were two
   people and the reimbursement board owed money to both. A person field is now
   TWO keys: <key> is the name as it read when it was set (the CSV, the Sheets
   feed, print and labels all read it, and tracker.js promises the sheet never
   carries an email), and <key>Email says who that is:
     "<email>"  linked to a roster account
     "ext"      deliberately somebody not on the app (picked through Other…)
     "" / unset not resolved yet; People › Unlinked is where a lead fixes it
   Display goes through personRef, which prefers the LIVE roster name, so a
   rename reaches every screen and export without touching the records.
   PERSON_FIELDS is the one list of where these live; the review, the backfill,
   the person page and the tests all read it rather than keeping their own. */
const PERSON_FIELDS = [
  { coll: "budget", key: "purchaser", label: "Purchaser", fam: "purchaser" },
  { coll: "parts", key: "moldEngineer", label: "Mold engineer", fam: "eng" },
  { coll: "parts", key: "manufacturingEngineer", label: "Manufacturing engineer", fam: "eng" },
  { coll: "workOrders", key: "moldEngineer", label: "Mold engineer", fam: "eng" },
  { coll: "workOrders", key: "manufacturingEngineer", label: "Manufacturing engineer", fam: "eng" },
  { coll: "molds", key: "sealedBy", label: "Sealed by", fam: "sealedBy" },
  { coll: "items", key: "walkedBy", label: "Bin confirmed by", fam: "walkedBy" },
  { coll: "rnd", key: "by", path: "defaults", label: "Laid up by", fam: "by" },
];
const PERSON_EXT = "ext";
/* Values that sit in a person field without naming a person. The SN5 import
   left "N/A (Flat)" in engineer cells and "not recorded (retro)" on retro
   buy-offs; none of those should read as, or match, somebody. */
function notAPerson(v) { return !v || /^(n\/?a\b|not recorded|cross-team|tbd\b|pending\b|\?+$|—$|-$)/i.test(String(v).trim()); }
/* Text → roster account, only when nobody could argue: an exact email, an
   exact full name exactly one account has, or a bare first name exactly one
   account has. Anything else is null, or {ambiguous} so a caller can say who
   it might be. `strict` drops the first-name rule (retro SN5 records: last
   season's "Nick" is not necessarily this season's). Cached per roster array,
   because this runs per row per render and onFbData swaps in a new array on
   every roster change. */
let _rmCache = { users: null, n: 0, map: new Map() };
function rosterMatch(text, strict) {
  const t = String(text || "").trim().toLowerCase();
  if (!t || notAPerson(t)) return null;
  const users = DB.users || [];
  if (_rmCache.users !== users || _rmCache.n !== users.length) _rmCache = { users, n: users.length, map: new Map() };
  const ck = (strict ? "s:" : "l:") + t;
  if (_rmCache.map.has(ck)) return _rmCache.map.get(ck);
  let out = null;
  const byMail = users.find(u => String(u.email || "").toLowerCase() === t);
  if (byMail) out = { email: byMail.email.toLowerCase() };
  else {
    const full = users.filter(u => String(u.name || "").trim().toLowerCase() === t);
    if (full.length === 1) out = { email: full[0].email.toLowerCase() };
    else if (full.length > 1) out = { ambiguous: full.map(u => u.email) };
    else if (!/\s/.test(t) && !strict) {
      const first = users.filter(u => String(u.name || "").trim().toLowerCase().split(/\s+/)[0] === t);
      if (first.length === 1) out = { email: first[0].email.toLowerCase() };
      else if (first.length > 1) out = { ambiguous: first.map(u => u.email) };
    }
  }
  _rmCache.map.set(ck, out);
  return out;
}
/* The one reader of a person field. kind:
     none     empty, or a sentinel like "N/A (Flat)"
     linked   stored email the roster knows; name is the live roster name
     gone     stored email the roster no longer has; name is the snapshot
     ext      deliberately not on the app
     inferred nothing stored, but rosterMatch finds exactly one person — the
              screen is right before any backfill runs, as it always was
     unlinked a name nobody can resolve
   `src` lets a caller read the pair off another object (R&D defaults). */
function personRef(rec, key, src) {
  const o = src || rec || {};
  const name = String(o[key] ?? "").trim();
  const stored = String(o[key + "Email"] ?? "").trim().toLowerCase();
  if (stored === PERSON_EXT) return name ? { email: "", name, kind: "ext" } : { email: "", name: "", kind: "none" };
  if (stored) {
    const u = userByEmail(stored);
    if (u) return { email: stored, name: u.name || name || stored, kind: "linked" };
    return { email: stored, name: name || stored, kind: "gone" };
  }
  if (!name || notAPerson(name)) return { email: "", name, kind: "none" };
  const m = rosterMatch(name, !!(rec && rec.retro));
  if (m && m.email) { const u = userByEmail(m.email); return { email: m.email, name: (u && u.name) || name, kind: "inferred" }; }
  return { email: "", name, kind: "unlinked" };
}
function personName(rec, key, src) { const r = personRef(rec, key, src); return r.kind === "none" ? "" : r.name; }
/* For exports and paper: the person's current name, or the cell exactly as it
   was when it names nobody ("N/A (Flat)" stays on the CSV rather than
   vanishing, because a blank reads as "never filled in"). */
function personText(rec, key, src) {
  const n = personName(rec, key, src);
  if (n) return n;
  const o = src || rec || {};
  return String(o[key] ?? "");
}
// What to GROUP by: the person when there is one, else the text itself.
function personKey(rec, key, src) {
  const r = personRef(rec, key, src);
  return r.email ? r.email : (r.kind === "none" ? "" : "name:" + r.name.toLowerCase());
}
/* "Is this record mine?" for person fields: by email, through personRef. The
   text match it replaces (isMine) let every Nick claim every "Nick" part.
   isMine stays for ticket assignees, which already store emails. With me not on the loaded roster (it has not arrived yet)
   there is nothing to resolve against, so the old text match is the honest
   fallback. */
function isMineRef(rec, keys) {
  if (!rec) return false;
  const me = myEmail().toLowerCase();
  if (!me || !userByEmail(me)) return isMine(keys.map(k => rec[k]));
  return !!me && keys.some(k => personRef(rec, k).email === me);
}
/* The names on a record's person fields, one per person: "Justin / justin"
   and a name beside the same person's email both read as one. */
function personNames(rec, keys) {
  const seen = new Set(), out = [];
  for (const k of keys) {
    const key = personKey(rec, k); if (!key || seen.has(key)) continue;
    seen.add(key); out.push(personName(rec, k));
  }
  return out;
}
const ENG_KEYS = ["moldEngineer", "manufacturingEngineer"];
function meRef() { return { name: signerName(), email: myEmail() }; }
/* A person as the page shows them. Somebody with an email is a button onto
   their person page (data-open makes ctrl/cmd/middle-click a new tab, through
   the same delegated listener every record chip uses). Somebody without one,
   an Other… name or an old typed name nobody has resolved, is a hollow chip:
   it reads as a name and deliberately not as a member. The email rides in a
   data attribute, never inside onclick, because esc() leaves apostrophes. */
function personChip(ref, opts) {
  opts = opts || {};
  if (!ref || ref.kind === "none" || !(ref.name || ref.email)) return opts.empty != null ? opts.empty : "";
  const size = opts.size || 18;
  const role = opts.role ? ` <span class="pchip-role">${esc(opts.role)}</span>` : "";
  if (ref.email) {
    const tip = ref.kind === "gone" ? `${ref.name}, no longer on the roster` : `Open ${ref.name}'s page`;
    return `<button type="button" class="pchip${ref.kind === "gone" ? " gone" : ""}" data-email="${esc(ref.email)}"
      data-open="person/${esc(encodeURIComponent(ref.email))}" title="${esc(tip)}"
      onclick="event.stopPropagation();openPerson(this.dataset.email)">${avatar(ref.email, size)}<span>${esc(ref.name)}</span>${role}</button>`;
  }
  const tip = ref.kind === "ext" ? "Not on the app" : (isLead() ? "Not linked to anyone yet. People › Unlinked" : "Not linked to anyone on the roster");
  return `<span class="pchip ext" title="${esc(tip)}"><span>${esc(ref.name)}</span>${role}</span>`;
}
// A roster email → its chip, for fields that have always stored an email.
function personChipFor(email, opts) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return (opts && opts.empty) || "";
  const u = userByEmail(email);
  return personChip({ email, name: (u && u.name) || email, kind: u ? "linked" : "gone" }, opts);
}
function openPerson(email) {
  email = String(email || "").trim().toLowerCase();
  if (!email) return;
  openRecord("people", email);
}
/* The two keys of a person field as one patch. email "" with a name means
   Other… (stored as ext); both empty clears the field. */
function personPatch(key, email, name) {
  email = String(email || "").trim().toLowerCase();
  name = String(name || "").trim();
  if (email && email !== PERSON_EXT) { const u = userByEmail(email); name = (u && u.name) || name || email; }
  else email = name ? PERSON_EXT : "";
  return { [key]: name, [key + "Email"]: email };
}

// Let the signed-in user set their own photo (rules allow avatar/name self-edit).
function setMyAvatar() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const rec = await fb.upload(`avatars/${fb.user.uid}`, f, { maxDim: 256 });
      await fb.rosterUpdateSelf({ avatar: rec.url });
      render();
    } catch (e) { toast("Avatar upload failed: " + e.message,"error"); }
  };
  inp.click();
}
// Match a record's person field to the signed-in user. Engineer/assignee
// fields are free text, so the only unambiguous matches are exact email or
// exact full name; we also count a field that is *exactly* your first name
// (SN5 fields use bare first names like "Nico"/"Nick"). We deliberately do NOT
// match two full names that merely share a first name — that over-matched
// everyone named "Nick" onto each other's deadlines. Residual ambiguity: if
// two teammates share a first name and a field uses just that name, both match;
// type full names to disambiguate.
function isMine(nameOrList) {
  const me = signerName().toLowerCase().trim();
  const mail = myEmail().toLowerCase().trim();
  const myFirst = me.split(" ")[0];
  const vals = Array.isArray(nameOrList) ? nameOrList : [nameOrList];
  return vals.some(v => {
    v = String(v || "").toLowerCase().trim();
    if (!v) return false;
    return v === mail || v === me || v === myFirst;
  });
}
function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso + (iso.length <= 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return null;
  return Math.round((d - new Date(today() + "T00:00:00")) / 86400000);
}
function fmtWhen(iso) { return iso ? esc(String(iso).slice(0, 16).replace("T", " ")) : ""; }

/* The app's one money formatter. Takes a NUMBER (unitCost and friends are
   stored numeric, unlike budget's legacy free-text cost) and returns "" for
   anything that isn't one, so a missing cost renders as absent rather than
   as $0.00 — a zero that was never entered is not a price. */
function fmtMoney(n) {
  return typeof n === "number" && Number.isFinite(n) ? "$" + n.toFixed(2) : "";
}

/* Repaint without eating the keyboard. An onchange fires exactly while Tab
   is carrying focus to the next field; a synchronous render() replaces that
   field before focus arrives, so the user falls out of the form after every
   edit. This waits a tick for focus to settle, repaints, then hands focus
   (and the caret) back to whichever field holds it — which is why editable
   fields in the tabbed grids carry stable ids. */
function renderSoonKeepFocus() {
  setTimeout(() => {
    const ae = document.activeElement;
    const id = ae && ae.id;
    let s0 = null, s1 = null;
    try { s0 = ae.selectionStart; s1 = ae.selectionEnd; } catch (e) { /* selects have no caret */ }
    render();
    if (!id) return;
    const el = document.getElementById(id);
    if (el && el.focus) {
      el.focus();
      try { if (s0 != null) el.setSelectionRange(s0, s1); } catch (e) { /* not a text input */ }
    }
  }, 0);
}

/* ---------- BOM line costing ----------
   Shared by the part's Materials (plan) section and the work order's as-built
   BOM. A line prices itself one of two ways: a `ref` to an inventory record
   whose numeric unitCost × the line qty, or a hand-typed estCost. Anything
   unparseable is UNPRICED — counted and said out loud, never $0. That rule is
   what keeps a rollup honest over free-text history. */

function parseLooseMoney(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!t) return null;
  const n = Number(t);          // "1O0" is NaN here, not 100 — that's the point
  return Number.isFinite(n) ? n : null;
}

/* The inventory record a BOM line points at, whatever collection it lives in. */
function bomRefRec(id) {
  if (!id) return null;
  for (const coll of ["lots", "stock", "items", "molds"]) {
    const r = (DB[coll] || []).find(o => o.id === id);
    if (r) return r;
  }
  return null;
}

function bomLineCost(l) {
  if (!l) return null;
  const rec = bomRefRec(l.ref);
  if (rec && typeof rec.unitCost === "number") {
    const q = parseLooseMoney(l.qty);
    return q == null ? null : Math.round(rec.unitCost * q * 100) / 100;
  }
  return parseLooseMoney(l.estCost);
}

function bomRollup(lines) {
  let total = 0, priced = 0;
  for (const l of lines || []) {
    const c = bomLineCost(l);
    if (c == null) continue;
    total += c; priced++;
  }
  const count = (lines || []).length;
  return { total: Math.round(total * 100) / 100, priced, unpriced: count - priced, count };
}

/* "≈ $214.50 · 1 unpriced" — the coverage rides with the number so a partial
   sum can't be mistaken for a complete one. */
function bomRollupText(lines) {
  const r = bomRollup(lines);
  if (!r.count) return "";
  if (!r.priced) return `${r.count} line${r.count === 1 ? "" : "s"}, none priced yet`;
  return `≈ ${fmtMoney(r.total)}${r.unpriced ? ` · ${r.unpriced} unpriced` : ""}`;
}

/* ---------- sub-day time ----------
   daysUntil() rounds to whole days and midnight-anchors, so it answers 0 for a
   six-hour cure and 1 for a cure that finishes at 00:30 tonight. A cure hold
   needs the actual remaining time, which is what these two do. They are the
   app's only sub-day arithmetic; everything else here is a date-only due date.

   msLeft is signed: negative means the wait is over, which is what callers
   test. Returns null rather than 0 for a missing or unparseable start, so
   "never started" and "finished" can't be confused. */
function msLeft(startIso, hours) {
  if (!startIso || !(hours > 0)) return null;
  const t = new Date(startIso).getTime();
  if (isNaN(t)) return null;
  return t + hours * 3600000 - Date.now();
}
/* Reads at the bench, so: hours down to the last hour, then minutes, and no
   decimal anything. Matches the register the rest of the app uses for deltas
   ("2d late", "3 days out") without inventing a fourth phrasing. */
function fmtLeft(ms) {
  if (ms == null) return "";
  if (ms <= 0) return "ready";
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return mins + " min left";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 10 || m === 0) return Math.round(mins / 60) + " h left";
  return h + " h " + m + " min left";
}
// Same clock, written as a wall time someone can plan around: "Mon 3 Aug, 14:20".
function fmtReadyAt(startIso, hours) {
  if (!startIso || !(hours > 0)) return "";
  const d = new Date(new Date(startIso).getTime() + hours * 3600000);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
// Clickable chip that jumps to another tab's detail view (light cross-links).
/* A reference to another record, and the way you get there.
   It was a <span onclick> at 12px with 1px of vertical padding — about 22px
   tall, which is half a fingertip, and on the Dashboard it was the ONLY route
   into a part, a work order or a ticket. Three things hid that:
     - the pointer:coarse floor in index.html names button/.icon-btn/.hamburger
       and the form controls; it never named .chip;
     - test_appui's tap-target check selects button, a[href], select, input, so
       a <span onclick> is not merely failing, it is invisible to the assertion;
     - components.css publishes .chip as "accent-tinted, clickable" with no
       min-height at all, so the app was faithfully reproducing a defect in the
       design system rather than drifting from it.
   A <button> instead: it inherits the 40px coarse floor, it enters the
   tap-target selector so the size is measured from now on, and it gets keyboard
   focus and :focus-visible for free. */
function chip(coll, id, label) {
  if (!id) return "";
  const tab = { workOrders: "workorders", parts: "parts", projects: "projects", budget: "budget" }[coll] || coll;
  const known = recById(coll, id);
  // data-open: the ctrl/cmd/middle-click hook (see the delegated listeners by
  // the routing block) — a modified click opens #/<ID> in a new tab instead
  // of navigating this one.
  /* A ticket chip never lands on the retired Tickets tab (Simon, 2026-09-03:
     "it goes to a 'ticket' tab which shouldn't be there"). An issue lives in
     the Issues section of its work order, so that is where the chip goes. */
  const go = coll === "projects" ? `openIssue('${esc(id)}')` : `openRecord('${tab}','${esc(id)}')`;
  return `<button type="button" class="chip" data-open="${esc(id)}" onclick="event.stopPropagation();${go}">${esc(label || id)}${known ? "" : " ?"}</button>`;
}
/* Where a ticket id goes now that the tracker is shelved: the work order the
   issue is on, scrolled to its Issues section. A ticket with no run behind it
   is history from the retired tracker, and says so rather than opening a tab
   that is no longer in the sidebar. */
function openIssue(id) {
  const p = recById("projects", id);
  const woId = p && p.workOrderId;
  if (woId && recById("workOrders", woId)) {
    /* Already on that run, looking at its Issues section? Then "open the issue"
       used to navigate to the page you were on and scroll to the section you
       were in — a press that did nothing at all. Point at the row instead. The
       chip still never lands on the retired Tickets tab. */
    if (view.tab === "workorders" && view.mode === "detail" && view.id === woId) { flashIssueRow(id); return; }
    openRecord("workorders", woId);
    if (typeof woJump === "function") woJump("wo-issues");
    return;
  }
  toast(p ? `${id} is a ticket from the retired tracker and has no work order to open.` : `${id} is not here.`, "info");
}
/* Bring an issue's own row into view and mark it for a moment. The row carries
   everything about the issue now, so there is nowhere else to go. */
function flashIssueRow(id) {
  const el = document.getElementById("wi-row-" + id);
  if (!el) { toast(`${id} is not on this run.`, "info"); return; }
  if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
  if (el.classList) {
    el.classList.remove("cohit");
    void el.offsetWidth;                       // restart the animation on a repeat press
    el.classList.add("cohit");
    setTimeout(() => { if (el.classList) el.classList.remove("cohit"); }, 1400);
  }
}

/* ---------- lineage: where a record sits in the chain ----------
   Part > Run > Mold > Plan > Drawings, drawn identically on every record that
   sits somewhere in it. Before this, a work order named its part in a muted
   sentence and the Parts tab could not reach a mold or a drawing at ALL — the
   chain existed in the data and nowhere on screen.

   Nodes that don't exist yet are drawn as dashed ghosts rather than omitted,
   because "this part has no mold linked" is exactly the thing worth seeing.
   `cur` marks the record you are looking at. */
function lineageBar(coll, id) {
  const rec = recById(coll, id);
  if (!rec) return "";
  if (coll === "projects") return ticketLineage(rec);
  let part = null, wo = null, viaPart = null;
  if (coll === "parts") { part = rec; wo = currentRun(rec); }
  else if (coll === "workOrders") { wo = rec; const r = partOf(rec); if (r) { part = r.part; viaPart = r.via; } }
  const pm = part ? partMold(part) : null;
  const mold = pm ? pm.mold : (wo ? recById("molds", wo.moldRef || (wo.mold && wo.mold.moldId)) : null);
  const plan = part ? partPlan(part) : currentPlanFor(mold);
  const nRuns = part ? partRuns(part).length : 0;

  const node = lnNode, sep = LN_SEP;
  const out = [];
  out.push(part
    ? node("Part", part.partName || part.id, `openRecord('parts','${esc(part.id)}')`,
        { cur: coll === "parts", note: viaPart === "name" ? "by name" : "" })
    : node("Part", "not linked", "", { ghost: true }));
  out.push(wo
    ? node(nRuns > 1 ? `Run 1 of ${nRuns}` : "Run", wo.id, `openRecord('workorders','${esc(wo.id)}')`,
        { cur: coll === "workOrders" })
    : node("Run", nRuns > 1 ? `${nRuns} runs` : "none yet", "", { ghost: true }));
  out.push(mold
    ? node("Mold", mold.name || mold.id, `openRecord('molds','${esc(mold.id)}')`,
        { note: pm && pm.via === "wo" ? "via " + (pm.through ? pm.through.id : "a run") : "" })
    : node("Mold", "not linked", "", { ghost: true }));
  out.push(plan
    // "Mold file", not "Plan": the part page already uses "the plan" for the
    // LAYUP plan, and two unrelated things called plan on one screen is what
    // this node used to be. The record keeps its own name (Stack plan) on the
    // Molds tab, where it is shown as a record rather than a step in a chain.
    ? node("Mold file", plan.id, `openRecord('molds','${esc(plan.id)}')`)
    : node("Mold file", "none", "", { ghost: true }));
  if (plan) out.push(node("Drawings", "open", `openDrawings('${esc(plan.id)}')`));
  return `<nav class="lineage no-print" aria-label="Where this sits">${out.join(sep)}</nav>`;
}

// One node emitter for every lineage chain, so the build chain above and the
// ticket chain below cannot drift apart in markup or CSS contract.
function lnNode(kind, label, onclick, opts) {
  opts = opts || {};
  const cls = "ln-node" + (opts.cur ? " ln-cur" : "") + (opts.ghost ? " ln-ghost" : "");
  const inner = `<span class="ln-kind">${esc(kind)}</span><span class="ln-id">${esc(label)}</span>${
    opts.note ? `<span class="ln-note">${esc(opts.note)}</span>` : ""}`;
  return onclick && !opts.cur
    ? `<button type="button" class="${cls}" onclick="${onclick}">${inner}</button>`
    : `<span class="${cls}"${opts.cur ? ' aria-current="true"' : ""}>${inner}</span>`;
}
const LN_SEP = '<span class="ln-sep" aria-hidden="true">›</span>';

/* Scroll to a section anchor, rather than an <a href="#…">. The app keeps its
   deep link in the URL hash (syncUrl writes #/WO-SN6-004), and an anchor would
   overwrite it — the address bar would stop naming the record and a copied
   link would land on a section instead of the run. Shared by the Work Orders
   and Tickets jump bars; scroll-margin-top on #main [id^=…] (index.html)
   keeps the heading clear of the topbar and the sticky bar. */
function secJump(anchor) {
  const el = document.getElementById(anchor);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "start", behavior: "smooth" });
}

/* ---- section cards, shared ----
   Work Orders grew the section-descriptor table (WO_SECTIONS) and Parts now
   uses the same machinery (PART_SECTIONS). A descriptor is
   { id, label, anchor, badge(rec), warn(rec), warnWord(rec), foldWhen(rec,E),
     fresh(rec), subAnchors: [], body(rec,E) } and the jump bar and the cards
   render from the SAME array, so they cannot disagree.

   Folding is a class, not a <details>: a closed details skips painting its
   content, so folded sections would vanish from a browser print (Parts has no
   print.js traveler — it prints through the @media print fallback, which
   force-opens .wosec-body). The body always renders; .folded only hides it.

   Fold state is sticky per session, the tickets-rail pattern: view.secFold is
   { id: <record id>, m: { <section id>: true=closed / false=open } },
   consulted only while its id matches the open record — switching records
   falls back to each section's default with no plumbing anywhere else. */
function secFolded(s, rec, E) {
  if (E) return false; // editing is when every input needs to be on screen
  const st = view.secFold;
  if (st && st.id === rec.id && s.id in st.m) return !!st.m[s.id];
  if (s.warn && s.warn(rec)) return false; // a warned section never hides
  return !!(s.foldWhen && s.foldWhen(rec, E));
}
function toggleSecFold(recId, secId, fold) {
  const cur = view.secFold && view.secFold.id === recId ? { ...view.secFold.m } : {};
  cur[secId] = !!fold;
  view = { ...view, secFold: { id: recId, m: cur } };
  render();
}
/* TWO TIERS, because the eight sections are not peers and the table already
   knew it: the ones marked tier:"ref" are the ones that default folded. Work
   panels stay cards; reference sections drop the card for a ruled row. That
   makes the difference MEAN something rather than decorating all eight the
   same way, which was Simon's complaint ("all of the sections blend together").

   State beats kind, the same rule secFolded already applies to folds: a warned
   section is always a work panel, so an undisposed issue can never be a quiet
   appendix row. `fresh` deliberately does NOT promote — it lives on exactly one
   section (Notes) and a page that rearranges itself when somebody comments is
   worse than a page that is flat.

   The data- attributes go BEFORE the class attribute on purpose. test_app.mjs
   pins this markup with regexes that expect the class list to be the LAST
   attribute, flush against the closing angle bracket. Anything placed before it
   is free; reordering the attributes, or adding a ninth class name, is not.
   (Written without an example: test_designsystem's phantom-class scanner reads
   any literal class attribute it finds in a .js file, comments included.) */
/* Work sections first, reference sections after, each keeping its own relative
   order. Without this the two tiers INTERLEAVE — on a work order the order is
   steps, issues, DETAILS, stack, PHOTOS, quality, files, notes — and a ruled row
   stranded between two white cards reads as a gap in a card stack rather than
   the start of a second kind of thing. The page never gets its moment of
   changing character, which is the whole idea.

   A stable sort, and the SAME list feeds the jump bar and the body, so the two
   cannot disagree about order — an invariant the sections table already
   documents. In edit mode nothing is ref, so this is a no-op and the section
   the editor leads with stays where it was put. */
function secOrder(list, E) {
  if (E) return list;
  return list.filter(s => s.tier !== "ref").concat(list.filter(s => s.tier === "ref"));
}

function secTier(s, rec, E) {
  if (E) return "work";                          // editing: everything is a panel you type into
  if (s.warn && s.warn(rec)) return "work";
  return s.tier === "ref" ? "ref" : "work";
}
function sectionCard(s, rec, E) {
  const n = s.badge ? s.badge(rec) : "";
  const warn = !!(s.warn && s.warn(rec));
  const word = warn ? (s.warnWord ? s.warnWord(rec) : "attention") : "";
  const fresh = !warn && !!(s.fresh && s.fresh(rec));
  const folded = secFolded(s, rec, E);
  const tier = secTier(s, rec, E);
  /* A warn is not always a fault. A run sitting in the autoclave on schedule is
     a CLOCK, and painting its card the same red as an undisposed nonconformance
     both lies about the run and costs the tint its meaning — the point of the
     tint is that the one card wearing it is the one that needs you. `hold` says
     which kind, and only sections that can be merely waiting define it. */
  const hold = warn && !!(s.hold && s.hold(rec));
  return `<div data-sec="${esc(s.id)}" data-tier="${tier}"${warn ? ` data-warn="${hold ? "hold" : "bad"}"` : ""} class="card wosec${folded ? " folded" : ""}">
    <button type="button" class="wosec-hd${warn ? " warn" : ""}" id="${esc(s.anchor)}"
      aria-expanded="${folded ? "false" : "true"}"
      onclick="toggleSecFold('${esc(rec.id)}','${esc(s.id)}',${folded ? 0 : 1})">
      <span>${esc(s.label)}</span>
      ${n ? `<span class="wosec-n">${esc(n)}</span>` : ""}
      ${warn ? `<span class="secnav-dot" aria-hidden="true"></span><span class="wosec-w">${esc(word)}</span>` : ""}
      ${fresh ? `<span class="secnav-dot gold" aria-hidden="true"></span><span class="wosec-new">new</span>` : ""}
      ${folded && s.foldHint ? s.foldHint(rec) : ""}
    </button>
    <div class="wosec-body">${s.body(rec, E)}</div>
  </div>`;
}
function secNav(prefix, sections, rec, jumpFn, label) {
  return `<nav class="secnav no-print" aria-label="${esc(label || "Jump to a section")}">
    ${sections.map((s, i) => {
      const n = s.badge ? s.badge(rec) : "";
      const warn = s.warn && s.warn(rec);
      return `<button type="button" class="secnav-btn ${n ? "" : "empty"} ${warn ? "warn" : ""}"
        id="${esc(prefix)}-${esc(s.id)}" title="${esc(s.label)} (${i + 1})"
        onclick="${jumpFn}('${esc(s.anchor)}')">${esc(s.label)}${n ? `<span class="secnav-n">${esc(n)}</span>` : ""}${warn ? '<span class="secnav-dot" aria-hidden="true"></span>' : ""}</button>`;
    }).join("")}
  </nav>`;
}
/* A jump into a folded section means "show me": resolve the anchor to its
   section (the anchor itself, or a subAnchor like wo-bom that lives inside
   one), open the fold — toggleSecFold renders synchronously, so the scroll
   target is visible — then open any inner <details> and scroll. */
function secJumpOpen(sections, rec, anchor) {
  const s = sections.find(x => x.anchor === anchor || (x.subAnchors || []).includes(anchor));
  if (s && secFolded(s, rec, view.edit)) toggleSecFold(rec.id, s.id, 0);
  const el = document.getElementById && document.getElementById(anchor);
  if (el && el.closest) { const d = el.closest("details"); if (d && !d.open) d.open = true; }
  secJump(anchor);
}

/* The ticket chain. A sub-ticket's genealogy is Ticket › Sub-ticket, with the
   parent node as the button to the top ticket — the detail page used to have
   NO route to the parent at all; the back button only worked if you had
   arrived from it this session. An issue's chain walks into the build lineage
   (Issue › Run › Part), because a nonconformance belongs to the hardware it
   was found on. A plain top-level project returns nothing: its downward view
   is the Sub-tickets table, and an all-ghost bar is noise. */
function ticketLineage(rec) {
  const out = [];
  if (rec.parentId) {
    const parent = recById("projects", rec.parentId);
    out.push(parent
      ? lnNode("Ticket", parent.title || parent.id, `openRecord('projects','${esc(parent.id)}')`)
      : lnNode("Ticket", "parent missing", "", { ghost: true }));
    out.push(lnNode("Sub-ticket", rec.title || rec.id, "", { cur: true }));
  } else if (rec.kind === "issue") {
    out.push(lnNode("Issue", rec.title || rec.id, "", { cur: true }));
    const wo = rec.workOrderId ? recById("workOrders", rec.workOrderId) : null;
    out.push(wo
      ? lnNode("Run", wo.id, `openRecord('workorders','${esc(wo.id)}')`)
      : lnNode("Run", rec.workOrderId || "none set", "", { ghost: true }));
    const r = wo ? partOf(wo) : null;
    out.push(r
      ? lnNode("Part", r.part.partName || r.part.id, `openRecord('parts','${esc(r.part.id)}')`,
          { note: r.via === "name" ? "by name" : "" })
      : lnNode("Part", "not linked", "", { ghost: true }));
  } else {
    return "";
  }
  return `<nav class="lineage no-print" aria-label="Where this sits">${out.join(LN_SEP)}</nav>`;
}

/* ---------- where you came from ----------
   Records cross-link constantly: a ticket names its parts, a part names its
   work orders and tickets, a comment names another ticket. Following one of
   those used to be a one-way trip, because the only way back was a button that
   always meant "the list" — so reading ticket A, tapping through to ticket B
   and pressing Back dumped you at the board, and finding A again was on you.

   A small stack fixes it, and it is a stack rather than the browser's history
   because this is a single page with no URL per record; wiring popstate would
   mean inventing a URL scheme for every tab first.

   Capped: a long afternoon of chip-following should not grow without bound, and
   nobody has ever wanted the 40th step back. */
let NAV_STACK = [];
const NAV_MAX = 25;
function navHere() { return { tab: view.tab, mode: view.mode, id: view.id }; }
function navSame(a, b) { return !!a && !!b && a.tab === b.tab && a.mode === b.mode && a.id === b.id; }
function navPush(entry) {
  if (!entry || !entry.tab) return;
  if (navSame(NAV_STACK[NAV_STACK.length - 1], entry)) return;   // no repeats
  NAV_STACK.push(entry);
  if (NAV_STACK.length > NAV_MAX) NAV_STACK.shift();
}
function navClear() { NAV_STACK = []; }
// What Back would return to, or null. Callers use it to label the button, so
// "Back" can say WHICH thing it is going back to.
function navPeek() { return NAV_STACK.length ? NAV_STACK[NAV_STACK.length - 1] : null; }
/* Pop one. `fallback` is where to land with an empty stack — the tab's own
   list, which is what the button used to do unconditionally. */
function navBack(fallback) {
  const prev = NAV_STACK.pop();
  const to = prev || fallback || { tab: view.tab, mode: "list", id: null };
  view = { ...view, ...to, edit: false };
  render(); syncUrl();
}
/* ---------- R&D records live on the R&D tab, and only there ----------
   Simon, 2026-09-18: an R&D part or run is viewable and editable from the R&D
   tab alone. The Parts and Work Orders rails no longer list them at all.

   That leaves ~20 arrival routes — a chip, the lineage bar, the dashboard, ⌘K,
   Reports, a mold's Used-by list, a ticket's related-parts — every one of which
   could hand an R&D record to a tab that will not show it. Rather than teach
   twenty callers, this sits at the one choke point they all pass through.

   It deliberately does NOT live in tabForId(). That function is pure, takes only
   an id, and answers from the prefix — `P-` cannot tell a trial from a season
   deliverable, and test_route.mjs holds it in step with fb.js's ID_PREFIX. Every
   place that needs this answer has the RECORD in hand; that is where the
   question gets asked. */
function rdHome(tab, id) {
  if (tab === "parts" && typeof isRnd === "function") {
    const p = recById("parts", id);
    if (p && isRnd(p)) return "rnd";
  }
  if (tab === "workorders" && typeof woIsRnd === "function") {
    const w = recById("workOrders", id);
    if (w && woIsRnd(w)) return "rnd";
  }
  return tab;
}

function openRecord(tab, id) {
  // Opening the same record you are already on is not a move, so it must not
  // put a step on the stack that Back would then spend doing nothing.
  tab = rdHome(tab, id);
  const here = navHere();
  if (!(here.tab === tab && here.mode === "detail" && here.id === id)) navPush(here);
  /* rdPane is derived from view.id by rdNormalize on the next render, so this
     does not have to say which pane — only which tab. */
  view = { ...view, tab, mode: "detail", id, edit: false };
  closeDrawer(); render(); syncUrl();
}

/* ---------- URL routing ----------

   The app had no routing at all until printed labels needed somewhere to land:
   no location.hash, no pushState, no URLSearchParams anywhere. Navigation was
   purely the in-memory `view` above. A scanned QR goes to /Q/<ID>, q.html shows
   the public nameplate, and its "Open in the app" link is /#/<ID> — which only
   means anything if this exists.

   replaceState, NEVER pushState. NAV_STACK above is a REFERRER TRAIL ("back to
   the thing that sent me here") with its own rules: setTab() clears it,
   openRecord() suppresses self-pushes, navBack() has a fallback. Browser
   history is a CHRONOLOGICAL stack. They are different ideas, and making the
   browser Back button drive one of them would either make Back lie or break
   navBack. With replaceState the URL always describes where you are — so it is
   shareable, refreshable and scannable — and the Back button leaves the app,
   which is exactly what it did before this landed. Nothing regresses.
   replaceState also fires neither popstate nor hashchange, so there is no
   self-trigger guard to get subtly wrong. */

// Prefix -> collection. Mirrors ID_PREFIX in fb.js, which this file cannot see
// (fb.js is the app's only ES module and keeps its constants module-scoped).
// tools/test_route.mjs checks the two stay in step.
const ID_TO_COLL = {
  WO: "workOrders", P: "parts", PROJ: "projects", BUY: "budget",
  DOC: "documents", BRD: "stock", STK: "stock",
  MOLD: "molds",
  // Multi-class collections: several prefixes, one collection, one tab each.
  PNL: "items", JIG: "items", BIN: "items",
  FAB: "lots", RSN: "lots", CON: "lots",
  // The R&D bench: a study is a folder of coupons, a coupon is one test piece.
  RDS: "rnd", CPN: "rnd",
};
/* One collection, two homes. `stock` holds tooling boards (BRD-) and the
   stack plans cut from them (STK-), and since boards moved to Inventory those
   two want different tabs: a board is a thing on a shelf, a stack plan is a
   mold's file. ID_TO_COLL still maps both to `stock` so recById finds either —
   changing it would break consumePendingLink, invMoveHere's coll lookup and
   test_route's ID_PREFIX check. The split happens here instead, on the id,
   once, before anything paints. #/stock with no id is still Molds. */
function moldsOrBoardsFor(id) {
  const s = String(id || "");
  if (s.startsWith("BRD-") || s.startsWith("SZ:")) { view.invView = "boards"; return "inventory"; }
  return "molds";
}
function tabForId(id) {
  const pfx = (String(id || "").toUpperCase().match(/^([A-Z]+)-/) || [])[1];
  const coll = ID_TO_COLL[pfx];
  if (!coll) return null;
  const t = TABS.find(t => t.coll === coll);
  return t ? t.id : null;
}

/* ---------- EH&S barcodes ----------
   Every chemical container at RFS carries a UC EH&S tag (the RSS Chemicals
   system — campus mandate), and the team does not want a second sticker on the
   same carton. So a container's EH&S code is a second identity for a lot
   record, stored in `ehsBarcode`, and RSS sublocation tags are the same thing
   for BIN records. Resolution is a scan over DB rather than a prefix route: an
   EH&S code carries no prefix tabForId could use.

   WHAT A TAG ACTUALLY LOOKS LIKE. Until now this section said the code was
   OPAQUE and refused to know anything about its shape. A photograph of a real
   RFS tag (2026-08-29) settled three things worth encoding:

       ┌──────────────────────────────┐
       │ ▚▞▚  Data Matrix      RSS   ⌐│  <- 0
       │ ▞▚▞                         0│     0
       │  CA00 0000 0000 0000 0024 3EF0│     2
       │                             4│     …
       └──────────────────────────────┘

   1. The symbology is DATA MATRIX, not a linear barcode and not a QR. scan.js
      already asks for data_matrix, so nothing changes there — but the guess is
      now a fact and the format list can stop being a shotgun.
   2. The code is 24 characters of uppercase letters and digits, printed as six
      space-separated groups of four. NO DASHES. A dash in a stored code is a
      person's invention, never the tag's, which is why ehsKey drops them and
      why the app renders the printed grouping rather than echoing punctuation.
   3. THE LAST TWELVE CHARACTERS ARE REPRINTED, ROTATED, DOWN THE RIGHT EDGE.
      That is the part still readable once the label is wrapped round a bottle
      neck or the face is scuffed with resin, and it is therefore what a person
      standing at the shelf can actually read out. So twelve characters have to
      be enough to find a container (ehsResolveTyped), and twelve characters
      are what the app shows on a row, so screen and sticker say the same thing.

   AND 627 REAL TAGS AGREE WITH IT. Simon's RSS export of 2026-08-28 holds every
   container in the university's system for this building: 627 barcodes, 627
   distinct, EVERY ONE of them 24 characters. Positions 0-18 are identical in
   all of them; only the last five vary at all, and across FEB's own 50
   containers only the last three do. So the grammar is not one photograph's
   worth of guess, and a four-character tail would already be unique.

   It stays ADVISORY anyway: ehsShape warns and nothing blocks. Two reasons that
   the export does not touch. The pre-2024 hand-entered codes in our own DB are
   shorter and real, and they have to keep working. And refusing a code somebody
   is holding in their hand is how a person decides the field is broken and
   leaves it blank, which costs more than a wrong code somebody can see and fix.
   The export tells us what a tag looks like; it does not tell us what every
   sticker on every shelf looks like. */

/* The printed grammar, from the tag above. Kept as named constants because
   three files reason about these two numbers. */
var EHS_LEN = 24;    // characters in a full code
var EHS_GROUP = 4;   // characters per printed group
var EHS_TAIL = 12;   // characters reprinted down the label's edge

/* One normal form, applied on save and on lookup, so a code scanned off a tag
   and a code retyped off a scuffed one meet in the middle. Uppercase, and
   strip everything but letters, digits and dashes — the same character set
   idFromScan already trusts. */
function ehsNorm(raw) {
  return String(raw || "").trim().toUpperCase().replace(/[^0-9A-Z-]/g, "");
}

/* The COMPARISON form drops the dashes ehsNorm keeps: a real tag has none, but
   the stored code holds whatever punctuation a typist supplied, and "did not
   match because of a hyphen" is a bug report waiting to be filed. Same courtesy
   idFromScan documents. */
function ehsKey(raw) { return ehsNorm(raw).replace(/-/g, ""); }

/* The code as the LABEL prints it: groups of four, separated by spaces. Used
   everywhere a person is expected to compare what is on screen against what is
   on the sticker in their hand, which is every place the code is shown. */
function ehsPrinted(raw) {
  const k = ehsKey(raw);
  return k ? (k.match(new RegExp(".{1," + EHS_GROUP + "}", "g")) || []).join(" ") : "";
}

/* The edge print: the last twelve characters, grouped. This is the string a
   person reads off a jug whose label is wrapped or scuffed, so it is what rows
   show and what ehsResolveTyped accepts. Short codes (the pre-2024 hand-entered
   ones) have no tail worth taking and are returned whole. */
function ehsTailText(raw) {
  const k = ehsKey(raw);
  if (!k) return "";
  return k.length > EHS_TAIL ? ehsPrinted(k.slice(-EHS_TAIL)) : ehsPrinted(k);
}

/* Does this look like a tag off the wall? Advisory only — see the header. The
   reason is phrased for a person holding the container, not for a log. */
function ehsShape(raw) {
  const k = ehsKey(raw);
  if (!k) return { ok: true, why: "" };
  if (!/^[0-9A-Z]+$/.test(k)) return { ok: false, why: "has characters a UC tag does not use" };
  if (k.length === EHS_LEN) return { ok: true, why: "" };
  return { ok: false, why: `is ${k.length} characters; a UC tag is ${EHS_LEN}` };
}

/* The record wearing this EH&S tag, or null. Lots first (containers are the
   common scan), then BIN locations (RSS sublocation tags). Returns
   {coll, id, o} so a caller can route without a second lookup. */
function ehsResolve(raw) {
  const code = ehsKey(raw);
  if (!code) return null;
  for (const coll of ["lots", "items"]) {
    const o = (DB[coll] || []).find(r => r.ehsBarcode && ehsKey(r.ehsBarcode) === code);
    if (o) return { coll, id: o.id, o };
  }
  return null;
}

/* What somebody TYPED, resolved. Exact first, then the edge print: a code of
   at least EHS_TAIL characters that is the tail of exactly one stored tag finds
   that record, because reading the wrapped-round part of the label is the
   normal way to identify a jug you are holding.

   TWO GUARDS, both load-bearing:
   - Never below EHS_TAIL characters. Twelve is long enough that a collision is
     not a real risk; six would match half the shelf, and the pre-2024 codes in
     the DB are nine characters, which must keep meaning themselves and not a
     fragment of something longer.
   - AMBIGUITY IS NOT A GUESS. Two tails matching returns {ambiguous:[...]} and
     the caller says so. Opening the wrong jug's record is worse than typing
     four more characters.
   The extra field `via` is "code" or "tail", so a caller can tell the person
   which of the two things on the label it matched. */
function ehsResolveTyped(raw) {
  const hit = ehsResolve(raw);
  if (hit) return { ...hit, via: "code" };
  const code = ehsKey(raw);
  if (code.length < EHS_TAIL) return null;
  const found = [];
  for (const coll of ["lots", "items"]) {
    for (const o of DB[coll] || []) {
      const k = ehsKey(o.ehsBarcode);
      if (k.length > code.length && k.endsWith(code)) found.push({ coll, id: o.id, o, via: "tail" });
    }
  }
  if (found.length === 1) return found[0];
  return found.length ? { ambiguous: found } : null;
}

/* An EH&S tag identifies ONE physical container. Two records claiming the same
   code means one of them is wrong, and the polite moment to say so is while
   the person who can fix it is still holding the jug. Goes through the typed
   resolver so entering an edge print onto a second record is caught too —
   that is the exact mistake the shorter, more readable half of the label
   invites. An ambiguous tail is a conflict with the first of them: whatever
   else is true, this code does not uniquely belong to the record being edited. */
function ehsConflict(raw, excludeId) {
  const hit = ehsResolveTyped(raw);
  if (!hit) return null;
  if (hit.ambiguous) return hit.ambiguous.find(h => h.id !== excludeId) || null;
  return hit.id !== excludeId ? hit : null;
}

/* The link a hash names, normalised: a record id uppercased, or
   "person/<email>" for a person page. The person branch is matched FIRST and
   kept lowercase: the record regex would read #/person/a@b.edu as "PERSON",
   find no such prefix, and throw the link away. */
function hashLink(hash) {
  hash = String(hash || "");
  const p = hash.match(/^#\/person\/([^/?#]+)/i);
  if (p) {
    let e = p[1];
    try { e = decodeURIComponent(e); } catch { /* a malformed escape stays as typed */ }
    e = e.trim().toLowerCase();
    return e ? "person/" + e : "";
  }
  const m = hash.match(/^#\/([A-Za-z0-9-]+)/);
  return m ? m[1].toUpperCase() : "";
}
/* Does anything in the app know this person? The roster, or any record that
   names them: a person removed from the roster still has a page. */
function personKnown(email) {
  if (userByEmail(email)) return true;
  return typeof personRecords === "function" && personRecords(email).any;
}

/* Read at file-scope load, which is early enough: index.html's
   `<script>render()</script>` runs after this file, so nothing there needs to
   change. Mirrored into sessionStorage so the link also survives a reload or a
   password-reset detour, neither of which keeps the hash. */
let PENDING_LINK = (() => {
  // Guarded because this file also runs headless in tools/test_app.mjs, whose
  // DOM stub has no location and no sessionStorage. Reading either at file
  // scope without a guard throws before a single test runs.
  if (typeof location === "undefined") return "";
  const v = hashLink(location.hash);
  try {
    if (v) sessionStorage.setItem("feb-pending-link", v);
    return v || sessionStorage.getItem("feb-pending-link") || "";
  } catch { return v; }        // Safari private mode, or no storage at all
})();

/* Redeemed from render(), and it has to WAIT FOR DATA rather than fire once.
   `fb.state` reaching "ready" only means auth and the roster check are done:
   the collection snapshots arrive afterwards, on their own schedule, each one
   triggering another render. So the first ready render has an empty DB, and a
   version of this that consumed the link there would find no record every time
   and dump every scan into the search box. That is exactly what the first run
   of tools/test_route.mjs caught.

   So: keep the link until the record turns up, or until the grace window below
   expires. One shot once it does resolve — cleared before the view changes — or
   a re-render mid-edit would yank the user back here. */
const PENDING_GRACE_MS = 6000;
let PENDING_SINCE = 0;
let PENDING_TIMER = null;

function consumePendingLink() {
  if (!PENDING_LINK) return false;
  const id = PENDING_LINK;
  if (id.startsWith("person/")) return consumePendingPerson(id.slice(7));
  const tab = tabForId(id);

  // An unknown prefix can never resolve, so there is nothing to wait for.
  if (!tab) { clearPendingLink(); return false; }

  const rec = recById(TABS.find(t => t.id === tab).coll, id);
  if (rec) {
    clearPendingLink();
    navClear();               // an arrival is not a step in a trail
    /* The whole point of the grace window above is that the record has arrived
       by now, so this can ask what it is rather than guess from the prefix. */
    view = { ...view, tab: rdHome(tab, id), mode: "detail", id, edit: false };
    return true;
  }

  // Not here yet. Wait — the snapshot for this collection may still be in
  // flight — but not forever, and schedule one wake-up so the giving-up path
  // runs even if no further snapshot ever arrives.
  if (!PENDING_SINCE) {
    PENDING_SINCE = Date.now();
    if (typeof setTimeout === "function" && !PENDING_TIMER) {
      PENDING_TIMER = setTimeout(() => { PENDING_TIMER = null; if (PENDING_LINK) render(); }, PENDING_GRACE_MS + 50);
    }
    return false;
  }
  if (Date.now() - PENDING_SINCE < PENDING_GRACE_MS) return false;

  /* Gave up. A well-formed ID for a record that is not here: another season, a
     roster that cannot see it, or a label printed before the record was saved.
     Land on the right tab with the code already in the search box, which is a
     better answer than a blank detail page for a record that does not exist. */
  clearPendingLink();
  view = { ...view, tab, mode: "list", id: null, q: id };
  if (typeof toast === "function") toast(trashedNote(id) || `No record ${id} here — searching for it.`, "error");
  return true;
}

/* The same wait-for-data contract as a record link, for #/person/<email>:
   the roster arrives on its own snapshot, so the first ready render has an
   empty DB.users. Give up the same way, onto the People list with the
   address already in the search box. */
function consumePendingPerson(email) {
  if (personKnown(email)) {
    clearPendingLink();
    navClear();
    view = { ...view, tab: "people", mode: "detail", id: email, edit: false };
    return true;
  }
  if (!PENDING_SINCE) {
    PENDING_SINCE = Date.now();
    if (typeof setTimeout === "function" && !PENDING_TIMER) {
      PENDING_TIMER = setTimeout(() => { PENDING_TIMER = null; if (PENDING_LINK) render(); }, PENDING_GRACE_MS + 50);
    }
    return false;
  }
  if (Date.now() - PENDING_SINCE < PENDING_GRACE_MS) return false;
  clearPendingLink();
  view = { ...view, tab: "people", mode: "list", id: null, q: email };
  if (typeof toast === "function") toast(`Nobody here goes by ${email}. Searching for it.`, "error");
  return true;
}

/* THE ONE THING THE CENTRAL TOMBSTONE FILTER COSTS. recById reads DB[coll],
   which no longer contains deleted records, so a scanned label or a pasted deep
   link for something in the bin would otherwise say "no record here" — which is
   both wrong and unhelpful, because the record is thirty days from gone and one
   button from back. Returns the sentence to say, or "" when it really is
   missing. */
function trashedNote(id) {
  for (const coll of Object.keys(DB.trash || {})) {
    const rec = (DB.trash[coll] || []).find(r => r.id === id);
    if (rec) {
      const who = userName(rec.deletedBy) || rec.deletedBy || "somebody";
      return `${id} was deleted by ${who} ${daysSince(rec.deletedAt) === 0 ? "today" : daysSince(rec.deletedAt) + " days ago"}. Restore it under Reports, Recently deleted.`;
    }
  }
  return "";
}

function clearPendingLink() {
  PENDING_LINK = "";
  PENDING_SINCE = 0;
  if (PENDING_TIMER) { clearTimeout(PENDING_TIMER); PENDING_TIMER = null; }
  try { sessionStorage.removeItem("feb-pending-link"); } catch { /* private mode */ }
}

/* Mirror `view` into the URL. Detail pages get /#/<ID> so the address bar
   always holds something scannable and shareable; a list gets /#/<tab>. */
function syncUrl() {
  if (typeof history === "undefined" || !history.replaceState || typeof location === "undefined") return;
  /* Only a REAL record id goes in the address bar. The board rack selects by a
     synthetic "SZ:<w>x<h>x<t>|<density>" key, which PENDING_LINK's
     /^#/([A-Za-z0-9-]+)/ would truncate to "SZ" and stash as junk for the
     next load to redeem. Nothing calls syncUrl with one today; this is what
     keeps that true when someone wires up the rail. */
  const real = /^[A-Z]+-/.test(String(view.id || ""));
  const person = view.tab === "people" && view.mode === "detail" && view.id;
  const frag = person ? "#/person/" + encodeURIComponent(view.id)
    : view.mode === "detail" && view.id && real ? "#/" + view.id : "#/" + view.tab;
  if (location.hash !== frag) history.replaceState(null, "", frag);
}

/* ---------- open in a new tab ----------
   The URL already describes every record (#/<ID>, above), and a fresh tab
   signs itself in off Firebase's persisted session and redeems the hash via
   the pending-link machinery — so multi-window "just works" once there is a
   browser-native way to ask for it. Chips and rail rows are buttons, not
   anchors (they carry app semantics a bare href cannot), so the modifier
   click is delegated: ctrl/cmd-click or middle-click on anything carrying
   data-open, or on a rail row (.pitem, whose DOM id is pi-<record id>),
   opens that record's deep link in a new tab. Capture phase + stopPropagation
   so the element's own onclick never also navigates this tab. */
function newTabIdFrom(target) {
  if (!target || typeof target.closest !== "function") return null;
  const t = target.closest("[data-open]") || target.closest('.pitem[id^="pi-"]');
  if (!t) return null;
  return (t.dataset && t.dataset.open) || String(t.id || "").slice(3) || null;
}
function openIdInNewTab(id) { if (typeof window !== "undefined" && window.open) window.open("#/" + id, "_blank"); }
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const id = newTabIdFrom(e.target);
    if (!id) return;
    e.preventDefault(); e.stopPropagation();
    openIdInNewTab(id);
  }, true);
  // Middle click arrives as auxclick, button 1.
  document.addEventListener("auxclick", e => {
    if (e.button !== 1) return;
    const id = newTabIdFrom(e.target);
    if (!id) return;
    e.preventDefault(); e.stopPropagation();
    openIdInNewTab(id);
  }, true);
}

/* The one case replaceState cannot cover: the hash changing from OUTSIDE the
   app, which is a scan link tapped while the app is already open, or a pasted
   URL. Our own replaceState never fires this event, so there is no loop. */
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("hashchange", () => {
    const id = hashLink(location.hash);
    if (!id) return;
    if (id.startsWith("person/")) { if (personKnown(id.slice(7))) openPerson(id.slice(7)); return; }
    const tab = tabForId(id);
    if (tab && recById(TABS.find(t => t.id === tab).coll, id)) openRecord(tab, id);
  });
}

/* ---------- shared layup-stack viz + editor (parts + work orders) ---------- */
function plyClass(m) {
  m = (m || "").toLowerCase();
  if (m.includes("spread")) return "spread";
  if (m.includes("mesh") || m.includes("copper")) return "mesh";
  if (m.includes("core") || m.includes("nomex") || m.includes("foam") || m.includes("rohacell") || m.includes("honeycomb")) return "core";
  if (m.includes("twill") || m.includes("carbon") || m.includes("cf") || /\b\d{2,3}\b/.test(m)) return "cf";
  return "other";
}
/* The short text tag beside the swatch. print.css has always said hue alone
   must not carry meaning on paper; the screen bar ignored that until now. */
const PLY_TAGS = { cf: "CF", spread: "Spread", core: "Core", mesh: "Mesh", other: "—" };
/* Every ply needs a stable identity before it can be edited, reordered or
   deleted safely — see stackMutate(). Records written before this have none,
   so anything that reads a uid must tolerate its absence. */
function plyUid() { return "y" + Math.random().toString(36).slice(2, 9); }
function stackViz(stack) { return plyTable(null, { layupStack: stack }, { edit: false }); }
/* The stack as a table.sub — the same grammar as the BOM directly below it on
   a work order, which is what "fit the style of the app" means here. `coll` is
   null for a read-only render with no record behind it (print previews, tests). */
function plyTable(coll, o, opts) {
  opts = opts || {};
  const stack = (o && o.layupStack) || [];
  const E = !!opts.edit && !!coll;
  const drift = opts.drift || {};
  if (!stack.length) {
    return `<div class="stack"><span class="muted">no plies recorded</span>${
      E ? `<div class="stack-foot no-print"><button onclick="addPly('${esc(coll)}','${esc(o.id)}')">+ ply</button></div>` : ""}</div>`;
  }
  const cell = (p, i, key, ph) => E
    ? `<td><input value="${esc(p[key] || "")}" placeholder="${esc(ph || "")}" onchange="plyEdit('${esc(coll)}','${esc(o.id)}',${i},'${key}',this.value)"></td>`
    : `<td>${esc(p[key] || "") || '<span class="muted">—</span>'}</td>`;
  return `<div class="stack">
    <div class="stack-cap tny muted">P1 is the mold surface. Plies run outward.</div>
    <table class="sub stk">
      <thead><tr><th class="sw" aria-hidden="true"></th><th class="plyno">Ply</th><th>Material</th>
        <th>Orientation</th><th>Coverage</th><th>Notes</th>${E ? '<th class="rowact no-print"></th>' : ""}</tr></thead>
      <tbody>${stack.map((p, i) => {
        const cls = plyClass(p.material);
        return `<tr class="${cls}${drift[i] ? " drift" : ""}">
          <td class="sw" aria-hidden="true"></td>
          <td class="plyno">P${i + 1}</td>
          ${E ? cell(p, i, "material", "e.g. 195 twill")
              : `<td class="mat"><span class="plytag">${PLY_TAGS[cls]}</span>${esc(p.material || "")}</td>`}
          ${cell(p, i, "orientation", "0/90")}${cell(p, i, "coverage", "full")}${cell(p, i, "notes", "")}
          ${E ? `<td class="rowact no-print">
            <button title="Move this ply toward the mold surface" ${i === 0 ? "disabled" : ""} onclick="plyMove('${esc(coll)}','${esc(o.id)}',${i},-1)">↑</button>
            <button title="Move this ply outward" ${i === stack.length - 1 ? "disabled" : ""} onclick="plyMove('${esc(coll)}','${esc(o.id)}',${i},1)">↓</button>
            <button title="Insert a ply above this one" onclick="addPly('${esc(coll)}','${esc(o.id)}',${i})">+</button>
            <button title="Duplicate this ply" onclick="plyDup('${esc(coll)}','${esc(o.id)}',${i})">⧉</button>
            <button class="danger" title="Remove this ply" onclick="plyDel('${esc(coll)}','${esc(o.id)}',${i})">✕</button></td>` : ""}
        </tr>`;
      }).join("")}</tbody>
    </table>
    ${E ? `<div class="stack-foot no-print"><button onclick="addPly('${esc(coll)}','${esc(o.id)}')">+ ply</button>
      <span class="tny muted">${stack.length} ${stack.length === 1 ? "ply" : "plies"}</span></div>`
        : `<div class="tny muted" style="margin-top:4px">${stack.length} ${stack.length === 1 ? "ply" : "plies"}</div>`}
  </div>`;
}
// Kept for the callers that render their own heading and just want the buttons.
// The table carries its own controls now, so this is only the empty-state add.
function stackEditor(coll, id) {
  return `<button onclick="addPly('${coll}','${id}')">+ ply</button>`;
}
// A real form, not two chained prompt() dialogs. The old version also took
// `prompt(...) || ""`, so cancelling out of it still appended a blank ply — and
// then mirrored that blank ply onto the linked work order.
function addPly(coll, id, at) {
  const o = recById(coll, id); if (!o) return;
  const where = typeof at === "number"
    ? `<div class="tny muted" style="margin-bottom:6px">Inserting above P${at + 1} — everything from there moves outward.</div>` : "";
  openModal(`
    <h2>${typeof at === "number" ? "Insert ply" : "Add ply"}</h2>${where}
    <div class="field"><label>Material <span class="req">*required</span></label>
      <input id="ply-material" autofocus placeholder="e.g. 195 twill, Cu mesh, Rohacell 31 3mm"></div>
    <div class="row2">
      <div class="field"><label>Orientation</label><input id="ply-orientation" placeholder="0/90, ±45, n/a"></div>
      <div class="field"><label>Coverage</label><input id="ply-coverage" value="full"></div>
    </div>
    <div class="field"><label>Notes</label><input id="ply-notes" placeholder="optional"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="submitPly('${esc(coll)}','${esc(id)}'${typeof at === "number" ? "," + at : ""})">${
        typeof at === "number" ? "Insert ply" : "Add ply"}</button></div>`);
}
function submitPly(coll, id, at) {
  const o = recById(coll, id);
  if (!o) { toast("That record is gone — someone else deleted it.", "error"); closeModal(); render(); return; }
  const val = k => ((document.getElementById(k) || {}).value || "").trim();
  const material = val("ply-material");
  if (!material) { toast("A ply needs a material.", "error"); return; }
  const ply = { uid: plyUid(), material, orientation: val("ply-orientation"), coverage: val("ply-coverage") || "full", notes: val("ply-notes") };
  closeModal();
  stackMutate(coll, id, typeof at === "number" ? "insert" : "add", { ply, at });
}
function popPly(coll, id) { stackMutate(coll, id, "pop"); }
function plyEdit(coll, id, i, key, value) { stackMutate(coll, id, "edit", { at: i, key, value }); }
function plyDel(coll, id, i) { stackMutate(coll, id, "del", { at: i }); }
function plyDup(coll, id, i) { stackMutate(coll, id, "dup", { at: i }); }
function plyMove(coll, id, i, dir) { stackMutate(coll, id, "move", { at: i, dir }); }

/* One funnel for every stack edit.
 *
 * The hard part is that saveField re-applies the mutator against whatever the
 * server currently holds, so two people editing at once merge instead of
 * clobbering. Append and pop were index-free and merged for nothing. Edit,
 * delete, duplicate and reorder are all positional, and a raw index re-applied
 * to a changed array edits the WRONG PLY. So each mutator locates its target by
 * `uid` and only falls back to the index when the ply predates uids — and every
 * ply it touches gets a uid on the way past, so the stack heals as it is used.
 *
 * `move` is the one operation that genuinely cannot merge: two people reordering
 * the same stack have no correct answer. It is last-writer-wins by design, which
 * is acceptable because reordering is rare and deliberate and somebody is
 * looking at the screen while they do it.
 */
function stackMutate(coll, id, kind, arg) {
  const o = recById(coll, id); if (!o) return;
  arg = arg || {};
  const cur = o.layupStack || [];
  const at = arg.at;
  // Identify the target from the array we're LOOKING at, then find it again by
  // identity in whatever the server hands the mutator.
  const target = typeof at === "number" ? cur[at] : null;
  if (target && !target.uid) target.uid = plyUid();
  const uid = target && target.uid;
  const find = s => {
    if (uid) { const i = s.findIndex(p => p && p.uid === uid); if (i >= 0) return i; }
    return typeof at === "number" && at < s.length ? at : -1;
  };
  const mutator = s => {
    s = (s || []).slice();
    if (kind === "add") { s.push(arg.ply); return s; }
    if (kind === "pop") { s.pop(); return s; }
    const i = find(s);
    if (kind === "insert") { s.splice(i < 0 ? s.length : i, 0, arg.ply); return s; }
    if (i < 0) return s;                       // somebody else already removed it
    if (kind === "edit") { s[i] = { ...s[i], uid: s[i].uid || uid, [arg.key]: arg.value }; return s; }
    if (kind === "del") { s.splice(i, 1); return s; }
    if (kind === "dup") { s.splice(i + 1, 0, { ...s[i], uid: plyUid() }); return s; }
    if (kind === "move") {
      const j = i + arg.dir;
      if (j < 0 || j >= s.length) return s;
      const [row] = s.splice(i, 1); s.splice(j, 0, row); return s;
    }
    return s;
  };
  o.layupStack = mutator(cur);                 // optimistic
  stackEdit(coll, o, mutator);
}

/* Apply a stack edit transaction-safely, then propagate it under the spec /
   as-built rule.
 *
 * The part's stack is the SPEC — what we intend to lay. A run's stack is the
 * AS-BUILT — what that run actually laid. They used to be one array blindly
 * deep-copied both ways, which meant signing off an as-built correction at the
 * bench silently rewrote the design intent, and a remake had nowhere to record
 * that it differed. `wo.stackSource` tells them apart: absent or "spec" means
 * this run is still a faithful copy of the plan, "asbuilt" means it has
 * deliberately diverged and must never be overwritten again.
 *
 *   part edited -> pushed to every run still on "spec" whose stack isn't frozen
 *   run edited  -> marks that run "asbuilt", and does NOT write back to the part
 *
 * Adopting a run's stack as the new spec is a deliberate button, not a side
 * effect. Records with no stackSource behave exactly as they did before, so
 * there is nothing to migrate. */
function stackEdit(coll, o, mutator) {
  saveField(coll, o, "layupStack", mutator);
  if (coll === "parts") {
    partRuns(o).forEach(r => {
      const w = r.wo;
      if (w.stackSource === "asbuilt" || stackFrozen(w)) return;
      w.layupStack = JSON.parse(JSON.stringify(o.layupStack)); // optimistic mirror
      saveField("workOrders", w, "layupStack", mutator);
    });
  } else if (coll === "workOrders" && o.stackSource !== "asbuilt") {
    const parent = partOf(o);
    // Only a run that HAS a parent spec can diverge from one. A standalone WO
    // stays plain, so nothing about the old single-record flow changes.
    if (parent && (parent.part.layupStack || []).length) {
      o.stackSource = "asbuilt";
      save("workOrders", o, "stackSource");
    }
  }
  render();
}
/* A run whose "Stack frozen" blocker is signed is a committed plan: the bench
   is working to that piece of paper, so an edit on the part must not move it. */
function stackFrozen(wo) {
  return (wo.steps || []).some(s => /stack frozen/i.test(s.title || "") && s.status === "done");
}
/* Does this run still match the part it came from? Returns the ply indexes that
   differ, so the table can tint exactly those rows. */
function stackDrift(part, wo) {
  const a = (part && part.layupStack) || [], b = (wo && wo.layupStack) || [];
  const out = {}; let n = 0;
  const same = (x, y) => x && y && ["material", "orientation", "coverage", "notes"]
    .every(k => String(x[k] || "") === String(y[k] || ""));
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (!same(a[i], b[i])) { out[i] = true; n++; }
  return { rows: out, n };
}
function adoptStackAsSpec(woId) {
  const wo = recById("workOrders", woId); if (!wo) return;
  const parent = partOf(wo); if (!parent) return;
  const p = parent.part;
  const copy = JSON.parse(JSON.stringify(wo.layupStack || []));
  p.layupStack = copy;
  saveField("parts", p, "layupStack", () => copy);
  wo.stackSource = "spec";
  save("workOrders", wo, "stackSource");
  toast(`${p.partName || p.id} now specifies what ${wo.id} actually laid.`);
  render();
}
function openStackCompare(woId) {
  const wo = recById("workOrders", woId); if (!wo) return;
  const parent = partOf(wo); if (!parent) return;
  const d = stackDrift(parent.part, wo);
  openModal(`
    <h2>What this run changed</h2>
    <div class="tny muted" style="margin-bottom:10px">${d.n} ${d.n === 1 ? "ply differs" : "plies differ"} from the part's plan. Highlighted rows are the ones that moved.</div>
    <div class="stkcmp">
      <div><h4>${esc(parent.part.partName || parent.part.id)} — plan</h4>${plyTable(null, parent.part, { edit: false, drift: d.rows })}</div>
      <div><h4>${esc(wo.id)} — as built</h4>${plyTable(null, wo, { edit: false, drift: d.rows })}</div>
    </div>
    <div class="foot"><button onclick="closeModal()">Close</button>
      <button class="primary" onclick="closeModal();adoptStackAsSpec('${esc(woId)}')">Adopt as the part's plan</button></div>`);
}
/* ---------- part <-> work order: the parent/child edge ----------
   A part is the durable thing the car needs. A work order is ONE RUN at making
   it, so a part has many runs and a run has exactly one part. A remake after a
   failed infusion is a second run, not a rewritten first one.

   The canonical edge is `wo.partId` — the child names its parent, which is the
   only direction that can't go ambiguous. `part.workOrderId` survives but is
   demoted: it no longer means "the link", it means "the current run". The name
   has to survive because labels.js reads it, pfld(...,"wo") writes it, the SN5
   seeds carry it and test_app asserts on it. Redefining is free; renaming is a
   migration.

   Three ways a run resolves, and which one it was matters to the UI:
     "id"      w.partId === p.id            a real edge somebody committed to
     "pointer" p.workOrderId === w.id       the legacy single-link field
     "name"    partName matches, no partId  the SN5 fallback (0 of 33 SN5 parts
                                            carry an id link — see shop.js)
   `via` is what lets the UI say "matched by name" and offer a one-click
   Confirm that writes the id. That converts the guess into an edge one part at
   a time, instead of one lead-only bulk backfill nobody runs. */
function partRuns(p) {
  if (!p) return [];
  let name = (p.partName || "").toUpperCase();
  // Duplicate PART names are the real FEB pattern, and they are the one case a
  // name match can't survive: if two parts are both called STRUT there is no
  // way to know whose run an id-less STRUT work order was. Fall back to the
  // committed edges only. (partOf() and the backfill refuse the same case.)
  if (name && (DB.parts || []).filter(q => (q.partName || "").toUpperCase() === name).length > 1) name = "";
  const out = [];
  (DB.workOrders || []).forEach(w => {
    let via = null;
    if (w.partId === p.id) via = "id";
    else if (w.partId) return;                       // committed to another part
    else if (p.workOrderId && w.id === p.workOrderId) via = "pointer";
    else if (name && (w.partName || "").toUpperCase() === name) via = "name";
    if (via) out.push({ wo: w, via });
  });
  // Current run first, then newest. `workOrderId` is the pointer, so whatever
  // it names is what the part considers live.
  return out.sort((a, b) =>
    (b.wo.id === p.workOrderId) - (a.wo.id === p.workOrderId) ||
    String(b.wo.createdDate || "").localeCompare(String(a.wo.createdDate || "")) ||
    cmpId(b.wo.id, a.wo.id));
}
/* The parent of a run. Many-to-one has no ambiguity to guard against, so an
   explicit partId always resolves — unlike the old symmetric lookup, which
   refused whenever the part pointed at a different WO. Name fallback stays for
   the SN5 records that have no ids at all. */
function partOf(wo) {
  if (!wo) return null;
  if (wo.partId) { const p = recById("parts", wo.partId); return p ? { part: p, via: "id" } : null; }
  const name = (wo.partName || "").toUpperCase();
  if (!name) return null;
  const byPointer = (DB.parts || []).filter(p => p.workOrderId === wo.id);
  if (byPointer.length === 1) return { part: byPointer[0], via: "pointer" };
  const matches = (DB.parts || []).filter(p => (p.partName || "").toUpperCase() === name);
  // Duplicate PART names are the real FEB pattern, so this one still refuses.
  return matches.length === 1 ? { part: matches[0], via: "name" } : null;
}
/* The run a part is currently on: what workOrderId points at, else the only
   run there is. Two runs and no pointer is genuinely ambiguous — say so by
   returning null rather than guessing. */
function currentRun(p) {
  const runs = partRuns(p);
  if (!runs.length) return null;
  if (p.workOrderId) { const hit = runs.find(r => r.wo.id === p.workOrderId); if (hit) return hit.wo; }
  return runs.length === 1 ? runs[0].wo : null;
}
/* linkedCounterpart keeps its name and its three call sites (stackEdit,
   renderPartDetail, PART_EVIDENCE.cad) but is no longer symmetric — it can't
   be, now that one side is a collection. Part -> its current run; run -> its
   part. Both existing mirror tests still describe exactly this behaviour. */
function linkedCounterpart(coll, o) {
  if (!o) return null;
  if (coll === "parts") return currentRun(o);
  const r = partOf(o);
  return r ? r.part : null;
}
/* The mold a part is made on. `p.mold` is the committed edge; when it's blank
   the mold is derived through the part's runs, which is how every SN5 record
   will resolve until somebody confirms it. moldUses() (shop.js) and the QR
   label (labels.js) have always READ p.mold — nothing ever wrote it, so both
   start working the moment the picker lands. */
/* EVERY mold a part is made on, in order. A split mold is two tool halves
   making one part, so the edge is a list — `p.molds`. `p.mold` is the old
   single field and is read here for records written before the list existed;
   nothing writes it any more, so the two cannot drift apart. There is no mirror
   and no primary copy: keeping the same fact in two fields, with the invariant
   maintained by convention across separate writers, is the shape woIsRnd()
   derives specifically to avoid. */
function partMolds(p) {
  if (!p) return [];
  const ids = (p.molds || []).slice();
  if (!ids.length && p.mold) ids.push(p.mold);          // pre-list records
  const seen = new Set();
  return ids.filter(id => id && !seen.has(id) && seen.add(id))
    .map(id => recById("molds", id)).filter(Boolean);
}
/* THE mold, for the places that can only draw one: the lineage bar's linear
   chain, the QR label's one 7pt line, the stage-agreement warn, the drawings
   sheet. The first is the answer, which is why the list keeps its order. */
function partMold(p) {
  if (!p) return null;
  const own = partMolds(p);
  if (own.length) return { mold: own[0], via: "id", more: own.length - 1 };
  const runs = partRuns(p);
  for (const r of runs) {
    const id = r.wo.moldRef || (r.wo.mold && r.wo.mold.moldId);
    if (id) { const m = recById("molds", id); if (m) return { mold: m, via: "wo", through: r.wo }; }
  }
  // molds carry their own `wo` field (SHOP.molds), so the edge may only exist
  // on the mold side.
  const runIds = runs.map(r => r.wo.id);
  const back = (DB.molds || []).filter(m => m.wo && runIds.includes(m.wo));
  if (back.length === 1) {
    const through = runs.find(r => r.wo.id === back[0].wo);
    return { mold: back[0], via: "wo", through: through && through.wo };
  }
  return null;
}
/* A mold's CURRENT plan — the "mold file" in Simon's words.

   The mold owns its plan: `currentPlanId` says which one, and planHistory keeps
   the ones it superseded. Before that, three places (lineageBar here,
   partPlan below, moldPlanSection in molds.js) each re-derived "newest by ts"
   independently, which is three chances to disagree about which plan is live.

   The ts fallback stays for every mold planned before the pointer existed, and
   for a plan adopted by an older record. Do not delete it: it is what makes
   this work on the SN5 data without a migration. */
function currentPlanFor(mold) {
  if (!mold) return null;
  const all = DB.stackplans || [];
  if (mold.currentPlanId) {
    const p = all.find(s => s.id === mold.currentPlanId);
    if (p) return p;
    // Pointer to a deleted plan: fall through rather than showing nothing.
  }
  const plans = all.filter(s => s.moldId === mold.id)
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  return plans.length ? plans[0] : null;
}
/* Every plan a mold has ever had, current first. */
function plansForMold(mold) {
  if (!mold) return [];
  const cur = currentPlanFor(mold);
  const rest = (DB.stackplans || [])
    .filter(s => s.moldId === mold.id && (!cur || s.id !== cur.id))
    .sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  return cur ? [cur].concat(rest) : rest;
}
function partPlan(p) {
  const pm = partMold(p);
  return pm ? currentPlanFor(pm.mold) : null;
}

// Preserve the search caret across the full re-render each keystroke triggers.
function searchInput(inp) {
  view.q = inp.value; render();
  const s = document.getElementById("searchbox");
  if (s) { s.focus(); const n = s.value.length; s.setSelectionRange(n, n); }
}

/* Trigger a download of an in-memory blob. One place, because three callers
   (backup JSON, report CSVs, stock STLs) were otherwise each going to build
   their own anchor-and-revoke dance. */
function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- backup / restore (lead-only import) ---------- */
function exportAll() {
  const blob = new Blob([JSON.stringify(DB, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "feb-composites-" + today() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
}
function importJSON(input) {
  const file = input.files[0]; if (!file) return;
  file.text().then(async t => {
    try {
      const data = JSON.parse(t);
      // Accept either a full backup {coll:[…]} or a flat array into the active tab.
      const byColl = Array.isArray(data) ? { [activeColl()]: data } : data;
      let total = 0;
      for (const coll of Object.keys(byColl)) {
        if (!DB[coll] || !Array.isArray(byColl[coll])) continue;
        total += byColl[coll].length;
      }
      input.value = "";
      confirmModal("Import " + total + " records into the team database (overwrites matching ids for everyone)?", async () => {
        try {
          for (const coll of Object.keys(byColl)) {
            if (DB[coll] && Array.isArray(byColl[coll]) && byColl[coll].length) await fb.importMany(coll, byColl[coll]);
          }
          toast("Imported " + total + " records.");
        } catch (e) { toast("Import failed: " + e.message, "error"); }
      }, { ok: "Import", danger: false });
    } catch (e) { toast("Import failed: " + e.message, "error"); input.value = ""; }
  });
}

// Lead-only: seed all SN5 retro archives (work orders, parts, timeline, and the
// board rack SN5 left behind — the stack planner can't pick thicknesses from an
// empty rack, so a fresh project has nothing to plan against until this runs).
/* NO UI ENTRY POINT since v1.0.0, on purpose — and deliberately not deleted.

   This seeded four collections from the sn5-*.json snapshots back when the app
   held no real data and an empty tab read as a broken one. It is a one-click
   bulk import, which is the wrong thing to leave in a lead's topbar now that
   the app holds the season the team is actually running: the archive is loaded,
   and the only thing a second run can do is surprise somebody.

   Kept because the seeds it reads are still load-bearing outside the app —
   tools/make_mockups.mjs, tools/serve_populated.mjs and tools/lib/browser.mjs
   all seed from those same files — and because re-seeding a fresh Firebase
   project is a real need for whoever inherits this. Call it from the console. */
async function loadArchive() {
  const sources = [
    ["workOrders", "sn5-work-orders.json"],
    ["parts", "sn5-parts.json"],
    ["schedule", "sn5-schedule.json"],
    ["stock", "sn5-stock.json"],
  ];
  let report = [];
  for (const [coll, fname] of sources) {
    let seed;
    try { seed = await (await fetch(fname)).json(); }
    catch (e) { report.push(fname + ": not found"); continue; }
    if (!Array.isArray(seed)) { report.push(fname + ": not an array"); continue; }
    const missing = seed.filter(o => !recById(coll, o.id));
    if (missing.length) {
      try { await fb.importMany(coll, missing); report.push(coll + ": +" + missing.length); }
      catch (e) { report.push(coll + ": FAILED " + e.message); }
    } else { report.push(coll + ": already loaded"); }
  }
  toast("SN5 archive — " + report.join(" · "), "info");
}

/* ---------- accounts (v4.4.0) ----------
   Simon, 2026-09-03: anyone creates an account with a name, a username and a
   password, starts as a member, and can change their display name. Leads keep
   who is a lead and who is removed.

   Firebase Auth only knows email+password, so a username is stored as the
   synthetic address <username>@USER_DOMAIN. Everything keyed on email (roster
   doc ids, buy-off stamps, updatedBy) keeps working unchanged, and every
   account from before, made with a real email, still signs in with it: the
   sign-in box takes either, and anything with an @ in it is used as typed.
   userHandle() is what the screen shows, so nobody reads the synthetic
   domain. The trade: an account with no real email has no password reset
   (see doReset). */
const USER_DOMAIN = "members.feb-composites.app";
function validUsername(u) { return /^[a-z0-9][a-z0-9._-]{2,23}$/.test(String(u || "")); }
function loginEmailFor(id) {
  id = String(id || "").trim().toLowerCase();
  return id.includes("@") ? id : `${id}@${USER_DOMAIN}`;
}
function userHandle(email) {
  email = String(email || "");
  return email.endsWith("@" + USER_DOMAIN) ? email.slice(0, -(USER_DOMAIN.length + 1)) : email;
}
async function doSignIn() {
  const id = document.getElementById("li-email").value, pass = document.getElementById("li-pass").value;
  if (!id.trim()) { toast("Type your username or email.", "error"); return; }
  try { await fb.signIn(loginEmailFor(id), pass); } catch (e) { toast("Sign-in failed: " + e.message,"error"); }
}
async function doSignUp() {
  const name = document.getElementById("li-name").value.trim();
  const user = document.getElementById("li-user").value.trim().toLowerCase();
  const pass = document.getElementById("li-pass").value;
  if (!name) { toast("Enter your name — it goes on your buy-offs and assignments.","error"); return; }
  if (!validUsername(user)) { toast("Username: 3 to 24 characters, letters, numbers, dots, dashes or underscores, starting with a letter or number.","error"); return; }
  if ((pass || "").length < 6) { toast("Password: at least 6 characters.","error"); return; }
  try { await fb.signUp(name, loginEmailFor(user), pass); }
  catch (e) {
    const taken = /email-already-in-use/.test(String(e && e.code));
    toast(taken ? `The username ${user} is taken — pick another, or sign in if it is yours.` : "Sign-up failed: " + e.message, "error");
  }
}
/* Display name. Written to the roster doc, which is what every name on screen
   reads (userName), and to the Auth profile so a fresh sign-in agrees. Old
   buy-offs keep the name they were signed with: a signature is a record of
   who signed, as they were called then. */
function openChangeName() {
  const cur = (fb.roster && fb.roster.name) || (fb.user && fb.user.name) || "";
  openModal(`
    <h2>Your display name</h2>
    <p class="muted tny">Goes on your buy-offs, assignments and comments from now on. Past signatures keep the name they were made with.</p>
    <div class="field"><label for="nm-name">Name</label><input id="nm-name" value="${esc(cur)}" autocomplete="name" onkeydown="if(event.key==='Enter')submitChangeName()"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitChangeName()">Save</button></div>
  `);
  const el = document.getElementById("nm-name"); if (el && el.focus) el.focus();
}
async function submitChangeName() {
  const name = (document.getElementById("nm-name").value || "").trim();
  if (name.length < 2) { toast("A name needs at least two characters.", "error"); return; }
  try {
    await fb.setMyName(name);
    closeModal(); render(); toast(`You are now ${name}.`);
  } catch (e) { toast("Couldn't change your name: " + e.message, "error"); }
}
/* The pending screen's door. Before v4.4.0 only a lead could put an address
   on the roster; now an account joins itself as a member, and the rules
   allow exactly that write (own email, role member, nothing else). */
async function joinRoster() {
  try { await fb.joinRoster(); }
  catch (e) { toast("Couldn't join: " + e.message, "error"); }
}
async function doGuest() {
  try {
    await fb.signInGuest();
  } catch (e) {
    /* ADMIN_ONLY_OPERATION is what the Identity Toolkit answers when the
       anonymous provider is switched off in the console, and it is the one
       failure a person cannot do anything about — so it says who can, rather
       than printing an API constant at somebody who came to look at a car. */
    /* Three spellings for one condition, and they are not interchangeable: the
       REST API answers ADMIN_ONLY_OPERATION, the JS SDK wraps that as
       auth/admin-restricted-operation, and a provider disabled a different way
       gives auth/operation-not-allowed. The first version of this matched only
       the first two, so production printed the raw SDK string at people. */
    const admin = /ADMIN_ONLY_OPERATION|admin-restricted-operation|operation-not-allowed/i
      .test(String((e && (e.code || e.message)) || ""));
    toast(admin
      ? "Guest access is not switched on for this project yet — ask a composites lead."
      : "Couldn't start a guest session: " + (e && e.message ? e.message : e), "error");
  }
}
async function doReset() {
  const email = document.getElementById("li-email").value.trim();
  if (!email) { toast("Type your email first, then hit Forgot password.","error"); return; }
  /* A username account has no mailbox behind it. The way back in is a lead
     deleting the Auth user in the Firebase console and the person signing up
     again with the same username: the roster doc is keyed by the synthetic
     address, so the name, role, trainings and every old signature reattach. */
  if (!email.includes("@")) { toast("Usernames have no email to reset with. Ask a composites lead to reset your account; signing up again with the same username brings your record back.", "info"); return; }
  try { await fb.resetPassword(email); toast("Reset email sent to " + email + "."); }
  catch (e) { toast("Reset failed: " + e.message,"error"); }
}
async function recheckRoster() {
  await fb.refreshRoster();
  if (fb.state === "pending") toast("Still not on the roster — ping the composites lead.","info");
}
function renderLogin() {
  const up = view.authMode === "up";
  return `<div class="card login">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:6px">${febMark(34)}<h2 style="margin:0">FEB <span style="color:var(--gold)">Composites</span></h2></div>
    <p class="muted">Team database. ${up ? "Pick a username and a password. You start as a member and can work right away; a lead makes leads." : "Sign in with your team account."}</p>
    ${up ? `<div class="f"><label>Name (goes on your buy-offs)</label><input id="li-name" autocomplete="name"></div>
    <div class="f"><label>Username</label><input id="li-user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. nico"></div>`
      : `<div class="f"><label>Username or email</label><input id="li-email" autocomplete="username" autocapitalize="none" spellcheck="false"></div>`}
    <div class="f"><label>Password</label><input id="li-pass" type="password" autocomplete="${up ? "new-password" : "current-password"}" onkeydown="if(event.key==='Enter')${up ? "doSignUp()" : "doSignIn()"}"></div>
    <div class="row">
      <button class="primary" onclick="${up ? "doSignUp()" : "doSignIn()"}">${up ? "Create account" : "Sign in"}</button>
      <button onclick="view.authMode='${up ? "in" : "up"}';render()">${up ? "Have an account? Sign in" : "New here? Create account"}</button>
      ${up ? "" : `<button onclick="doReset()">Forgot password</button>`}
    </div>
    ${/* Under a rule, not beside Sign in: it is a different act, and the
          sentence is the same reason the name field above gives for existing. */""}
    <div class="row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:12px">
      <button onclick="doGuest()">View as guest</button>
      <span class="muted tny">See the whole app. You won't be able to change anything —
        every buy-off carries a name.</span>
    </div>
  </div>`;
}
function renderPending() {
  return `<div class="card login">
    <h2>Almost in</h2>
    ${fb.rosterCheckFailed ? `<p><b>Couldn't reach the database</b> — this looks like a network problem, not a roster problem. Get on better wifi and hit Check again.</p>` : ""}
    <p>Signed in as <b>${esc(userHandle(fb.user.email))}</b>, but this account is not on the roster, so the database won't talk to you yet. Join as a member to start working${fb.user.email && fb.user.email.includes("@" + USER_DOMAIN) ? "" : ", or ask a composites lead if you were removed"}.</p>
    <div class="row">
      <button class="primary" onclick="joinRoster()">Join as a member</button>
      <button onclick="recheckRoster()">Check again</button>
      <button onclick="fb.signOut()">Sign out</button>
    </div>
  </div>`;
}

/* ---------- roster ----------
   The Roster page is gone (v4.4.1, Simon: "I don't think it serves any needs
   now"). Accounts join the roster themselves, roles change on People, and
   removal lives there too. This is the one function People still needs. */
function rosterDel(email) {
  const self = fb.user && email === fb.user.email;
  confirmModal(self
    ? "That's YOU. Removing yourself takes away your own access until you join again as a member. Really remove?"
    : "Remove " + userHandle(email) + " from the roster? They keep their account and can rejoin as a member; to keep them out, disable the account in the Firebase console too.", async () => {
    try { await fb.rosterDelete(email); render(); }
    catch (e) { toast("Remove failed: " + e.message, "error"); }
  });
}

/* Several people at once, from People's Select…. Roster rows are keyed by
   email and have no /pub mirror, so this loops fb.rosterDelete rather than
   using delMany. You are never in the set: removing yourself is its own
   confirm on your own row, not something to do by accident among ten. */
function rosterBulkDelete(emails) {
  if (!isLead()) { toast("Only a lead can change the roster.", "error"); return; }
  const me = myEmail();
  const list = [...new Set((emails || []).filter(e => e && e !== me))];
  if (!list.length) { toast("Nothing selected.", "info"); return; }
  const who = list.length === 1 ? userHandle(list[0]) : plural(list.length, "person", "people");
  confirmModal(`Remove ${who} from the roster? They keep their accounts and can rejoin as members; to keep someone out, disable the account in the Firebase console too.`, async () => {
    const failed = [];
    for (const e of list) {
      try { await fb.rosterDelete(e); } catch (err) { failed.push(e); }
    }
    const gone = new Set(list.filter(e => !failed.includes(e)));
    DB.users = (DB.users || []).filter(u => !gone.has(u.email));
    view = { ...view, pick: null };
    if (failed.length) toast(`${plural(failed.length, "person", "people")} could not be removed: ${failed.map(userHandle).join(", ")}`, "error");
    else toast(`${who} removed from the roster.`);
    render();
  }, { ok: "Remove", danger: true });
}
function deletePickedPeople() { rosterBulkDelete(pickedIds("people")); }

/* ---------- modal system ---------- */
/* `opts.wide` for a modal that SHOWS something rather than asking something —
   a drawing to read, a table to correct. 640px is right for a form and wrong
   for a PDF. Everything else about the modal is unchanged, so a wide one still
   closes on Escape, on the backdrop and through the same closeModal. */
function openModal(html, opts) {
  const m = document.getElementById("modal");
  const cls = "modal" + (opts && opts.wide ? " wide" : "");
  m.innerHTML = `<div class="backdrop" onclick="if(event.target===this)closeModal()"><div class="${cls}" role="dialog">${html}</div></div>`;
  m.classList.add("open");
  document.addEventListener("keydown", escClose);
  // Prefer an explicit [autofocus] over "first field in the DOM". The new-ticket
  // form leads with the Kind <select>, so the plain first-field rule parked the
  // caret there and you had to click into Title before you could type.
  const first = m.querySelector("[autofocus]") || m.querySelector("input,select,textarea,[contenteditable]");
  if (first && first.focus) first.focus();
}
function closeModal() {
  const m = document.getElementById("modal");
  m.innerHTML = ""; m.classList.remove("open");
  document.removeEventListener("keydown", escClose);
  // Escape, the backdrop and Cancel all land here, so this is the one place that
  // can tell confirmAsync() "the user walked away" — without it the promise
  // would hang and its caller would never continue.
  const d = window.__confirmDismissCb; window.__confirmDismissCb = null;
  if (d) d();
  // A mesh handed in by the Fusion add-in must not outlive the modal it opened.
  if (typeof fusionModalClosed === "function") fusionModalClosed();
}
/* ---------- drafts ----------
   Nothing typed into this app was ever saved until you posted it. Escape, a
   refresh, a dead battery, or a Firestore snapshot arriving mid-sentence and
   triggering a re-render all threw the lot away. That was an annoyance when a
   comment was a line; it is the difference between using this app and not using
   it once a comment is a report with photos in it.

   Per-browser, like the watched-tickets "seen" map: a draft is a private,
   half-finished thought and has no business syncing to the team database before
   its author decides it is done. Keyed by surface so two half-written comments
   on two tickets never overwrite each other. */
const DRAFT_NS = "feb-draft";
function draftKey(kind, id) { return `${DRAFT_NS}:${kind}:${id}`; }
function saveDraft(kind, id, html) {
  try {
    if (String(html || "").replace(/<[^>]*>/g, "").trim()) localStorage.setItem(draftKey(kind, id), html);
    else localStorage.removeItem(draftKey(kind, id)); // emptied on purpose: stop offering it back
  } catch (e) { /* private mode / quota: a draft is a nicety, never a blocker */ }
}
function loadDraft(kind, id) {
  try { return localStorage.getItem(draftKey(kind, id)) || ""; } catch (e) { return ""; }
}
function clearDraft(kind, id) {
  try { localStorage.removeItem(draftKey(kind, id)); } catch (e) {}
}
/* Debounced so a fast typist doesn't hit localStorage on every keystroke.
   Module-level timer keyed to one editor at a time, which is all there ever
   is — you cannot type in two boxes at once. */
let DRAFT_T = null;
function draftInput(kind, id, el) {
  if (DRAFT_T) clearTimeout(DRAFT_T);
  DRAFT_T = setTimeout(() => saveDraft(kind, id, el && el.innerHTML), 400);
}
/* Only ever fires for text the author has not posted. The browser shows its own
   generic wording; the point is that the tab does not close silently. */
function draftsPending() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (String(localStorage.key(i) || "").startsWith(DRAFT_NS + ":")) return true;
    }
  } catch (e) {}
  return false;
}

/* Escape closes the modal — unless you are typing in it. Without the guard,
   pressing Escape while writing a ticket description threw the modal away and
   took everything typed with it, and nothing was ever saved anywhere. That was
   survivable when a description was a sentence. It is not survivable now that
   these boxes are meant to hold documents.

   Same test partsKeydown() already uses (parts.js), including
   `isContentEditable` so it covers the rich-text editors and not just inputs. */
function typingIn(el) {
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable === true || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
function escClose(e) {
  if (e.key !== "Escape") return;
  if (typingIn(e.target)) { e.target.blur(); return; }
  closeModal();
}

/* ---------- toasts + styled confirm ---------- */
function toast(msg, type) {
  let host = document.getElementById("toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "toast " + (type === "error" ? "err" : type === "info" ? "info" : "ok");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 300); }, type === "error" ? 4200 : 2600);
}
// Styled replacement for window.confirm — calls onConfirm() if the user
// proceeds, opts.onCancel if they dismiss it any way at all (Cancel, Escape,
// backdrop click). The Confirm button clears BOTH callbacks before closing, so
// closeModal()'s dismiss path can't fire on the way to a confirmation.
function confirmModal(msg, onConfirm, opts) {
  opts = opts || {};
  window.__confirmCb = onConfirm;
  window.__confirmDismissCb = opts.onCancel || null;
  openModal(`
    <h2>${esc(opts.title || "Please confirm")}</h2>
    <p style="margin:0 0 4px">${esc(msg)}</p>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="${opts.danger === false ? "primary" : "danger"}" onclick="var cb=window.__confirmCb;window.__confirmCb=null;window.__confirmDismissCb=null;closeModal();if(cb)cb()">${esc(opts.ok || "Confirm")}</button>
    </div>`);
}
/* ---------- Select…: one picker for every list ----------
   Parts, Work Orders and Inventory each grew their own copy of the same state
   machine (view.partPick, view.woPick, view.shopPick). Simon, 2026-09-16:
   "pretty much every tab should have a select for a mass delete feature",
   with ease of use as the first principle. So the remaining lists share ONE
   picker rather than growing a fourth through tenth copy, and every tab reads
   the same way: a quiet Select… button where the tab's actions are; in pick
   mode the toolbar becomes All N / None / N selected / Delete N / ✕, a box
   appears on every row, and the whole row toggles, because a checkbox is a
   small target on a tablet. Delete is one confirm that names what goes
   (records AND what hangs off them: stack plans and meshes, receipts, files).

   view.pick is null (not picking) or { key, ids }, one key at a time, and
   setTab() clears it so a half-finished Select… never waits on another tab.
   `key` names the list, not the collection: Season picks parts but deletes
   through partBulkDelete, Molds picks molds and orphan plans together. */
let PICK_ALL = {};   // key -> the ids on screen at last render, for "All N"
function pickOn(key) { return !!(view.pick && view.pick.key === key); }
function startPick(key) { view = { ...view, pick: { key, ids: {} } }; render(); }
function cancelPick() { view = { ...view, pick: null }; render(); }
function togglePick(key, id) {
  if (!pickOn(key)) return;
  const ids = view.pick.ids;
  if (ids[id]) delete ids[id]; else ids[id] = true;
  render();
}
function pickSet(key, list) {
  const ids = {};
  (list || []).forEach(id => { ids[id] = true; });
  view = { ...view, pick: { key, ids } };
  render();
}
/* Only what is on screen: All under a filter must not select what it hides. */
function pickAll(key) { pickSet(key, PICK_ALL[key] || []); }
function pickIs(key, id) { return pickOn(key) && !!view.pick.ids[id]; }
function pickedIds(key) { return pickOn(key) ? Object.keys(view.pick.ids) : []; }
/* The box on a row. Empty when not picking, so a row template can always
   include it. stopPropagation so the row's own toggle does not undo it. */
function pickBox(key, id) {
  if (!pickOn(key)) return "";
  return `<input type="checkbox" class="wopick" ${pickIs(key, id) ? "checked" : ""} aria-label="Select ${esc(id)}"
    onclick="event.stopPropagation();togglePick('${esc(key)}','${esc(id)}')">`;
}
/* A row's onclick: toggle while picking, otherwise whatever it did before. */
function pickClick(key, id, otherwise) {
  return pickOn(key) ? `togglePick('${esc(key)}','${esc(id)}')` : otherwise;
}
/* The toolbar. Not picking: the Select… button (or nothing when there is
   nothing to select). Picking: the bar. `all` is the ids on screen; `onDelete`
   the call for the danger button. */
function pickBar(key, opts) {
  opts = opts || {};
  const all = opts.all || [];
  if (!pickOn(key)) {
    if (opts.offer === false || !all.length) return "";
    return `<button class="sm" onclick="startPick('${esc(key)}')" title="${esc(opts.hint || "Select several rows to delete them together")}">Select…</button>`;
  }
  PICK_ALL[key] = all.slice();
  const n = pickedIds(key).length;
  return `<button class="sm" onclick="pickAll('${esc(key)}')">All ${all.length}</button>
    <button class="sm" onclick="pickSet('${esc(key)}',[])">None</button>
    <span class="muted tny">${n} selected</span>
    ${opts.extra || ""}
    <button class="danger sm" style="margin-left:auto" ${n ? "" : "disabled"} onclick="${opts.onDelete}">${esc(opts.deleteLabel || "Delete")} ${n || ""}</button>
    <button class="sm ib" title="Stop selecting" onclick="cancelPick()">${icon("x", 14)}</button>`;
}
/* One confirm, one batch, one toast. `items` are {coll,id}; `files` are
   Storage paths that go with them (a mesh, a receipt, an upload); `after`
   prunes the local copy. Files are removed AFTER the records commit, and a
   file that will not go is reported rather than hidden: the record is what
   the team sees, the file is what costs money to keep. */
/* THE ONE DELETE IN THE APP, and since September 2026 it does not delete.

   It sends records to the bin: the documents keep every field, the public
   nameplates go, and the Storage objects stay exactly where they are until a
   lead empties it. `files` is no longer a list to remove now — it is the list
   to remember, frozen onto each tombstone, because Storage listing is denied
   by rule and this is the only record of what those uploads were.

   `backrefs` is new and optional: what a cascade cleared on records that were
   NOT deleted, so restore can put the links back.

   The confirm stays, and still reads as a delete, because from where the person
   is standing it is one — the record leaves every rail. It just says where it
   went. */
function bulkDeleteRecords(opts) {
  const items = (opts.items || []).filter(x => x && x.coll && x.id);
  if (!items.length) { toast("Nothing selected.", "info"); return; }
  const files = (opts.files || []).filter(Boolean);
  const backrefs = opts.backrefs || [];
  /* Per record, because a cascade collects different uploads and different
     cleared links for each. A caller that passes one flat list of files (most
     of them) is saying "these belong to this set", so they ride on the first
     record — which is the one whose restore puts the set back. */
  const payload = items.map((it, i) => ({ ...it, files: i ? [] : files, backrefs: i ? [] : backrefs }));
  confirmModal(opts.message, async () => {
    const batch = await trashRecords(payload);
    if (!batch) return;
    if (opts.after) opts.after();
    view = { ...view, pick: null, mode: "list", id: null };
    toast(`${opts.done}. Recover it from Recently deleted for ${TRASH_DAYS} days.`);
    render();
  }, { ok: opts.ok || "Delete", danger: true });
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + "s")}`; }

// Awaitable confirmModal, for the two places that still used the native blocking
// confirm() — which on an iPad at the bench is a jarring system sheet, and looks
// nothing like the rest of the app.
function confirmAsync(msg, opts) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    confirmModal(msg, () => finish(true), { ...(opts || {}), onCancel: () => finish(false) });
  });
}

/* ---------- HTML sanitizer (comment rich text) ----------
   DOMPurify (pinned + SRI in index.html) is the sanitizer. It is a shared,
   persistent surface — every teammate renders whatever anyone else stored — so
   it FAILS CLOSED: if DOMPurify is missing, we escape to plain text rather than
   fall back to a weaker scrubber.

   TWO BUGS FIXED HERE THAT NOTHING COULD SEE, because tools/test_app.mjs stubbed
   DOMPurify with a regex that ignored the allowlist entirely. Both were found
   the moment tools/test_sanitize.mjs started running the real library:

   1. `data:` URLs were NOT blocked. The old comment above this function claimed
      they were. DOMPurify permits data: on img/audio/video/source regardless of
      ALLOWED_URI_REGEXP, so a pasted screenshot was not "stripped" — it was
      quietly stored as a base64 blob inside the ticket document, against a
      1 MiB Firestore limit shared with every other comment on that ticket. One
      paste could brick a ticket for everyone. Blocked below with a hook.

   2. `download` was silently dropped. Setting ALLOWED_URI_REGEXP to https-only
      makes DOMPurify apply that test to `download` too, and "photo.png" is not
      an https URL, so it failed. Every attachment link has been losing its
      download behaviour. Re-permitted below with a hook.

   `style` is deliberately NOT allowed. Google Docs expresses all formatting as
   inline styles (bold is `<span style="font-weight:700">`), so allowing it let
   pasted content carry its own fonts, sizes and a hardcoded `color:#000000`
   into every comment — overriding the app's typography permanently and going
   invisible in dark mode. Formatting is carried by tags and styled by .prose;
   the paste normaliser recovers the semantics before the styles are dropped.

   `class` and `id` are not allowed either: `class` would let pasted markup
   adopt app chrome (a convincing fake status badge), and `id` would collide
   with our own anchors. */
const SANITIZE_CFG = {
  /* Headings are plural because the brief asks for documents, and because a
     disallowed tag is UNWRAPPED with its text kept — so a pasted Google Doc
     used to flatten every heading to an indistinguishable paragraph. blockquote
     / pre / hr are the same argument. All are inert: no script vector, no
     URL-bearing attribute. */
  ALLOWED_TAGS: [
    "b", "i", "u", "strong", "em", "span", "br", "p", "div",
    "h1", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre", "code", "hr",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td", "caption",
  ],
  /* width/height reserve space so a thread of photos does not reflow as it
     loads; they are clamped to integers by the hook below. `loading` only ever
     takes the value "lazy" here. */
  ALLOWED_ATTR: ["href", "src", "alt", "download", "width", "height", "loading"],
  ALLOWED_URI_REGEXP: /^https?:/i,
  /* The subtlety that cost two silent bugs. Restricting ALLOWED_URI_REGEXP to
     https makes DOMPurify apply that test to every attribute it does not already
     consider URI-safe — and its built-in safe list covers `alt` and `title` but
     not `download`, `width`, `height` or `loading`. So `download="photo.png"`
     and `width="800"` were being judged as URLs, failing, and being dropped.
     These four carry no URL and never did. */
  ADD_URI_SAFE_ATTR: ["download", "width", "height", "loading"],
};

// Registered once, guarded because core.js is a classic script that must not
// double-register if it is ever evaluated twice (the test harness does).
let SANITIZE_HOOKED = false;
function installSanitizeHooks() {
  if (SANITIZE_HOOKED || !window.DOMPurify || !window.DOMPurify.addHook) return;
  SANITIZE_HOOKED = true;

  window.DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    // (1) data: on any element, not just the ones DOMPurify exempts.
    if ((data.attrName === "src" || data.attrName === "href")
        && /^\s*data:/i.test(String(data.attrValue || ""))) {
      data.keepAttr = false;
      return;
    }
  });

  window.DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      /* Set by us, never by stored content, which is why `target`/`rel` are not
         in ALLOWED_ATTR. Before this, rteLink() set them on the live node and
         the sanitizer stripped them straight back off, so every link in every
         stored comment navigated the SPA away in the same tab. */
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (node.tagName === "IMG") {
      ["width", "height"].forEach(a => {
        if (!node.hasAttribute(a)) return;
        const n = parseInt(node.getAttribute(a), 10);
        if (!Number.isFinite(n) || n <= 0 || n > 10000) node.removeAttribute(a);
        else node.setAttribute(a, String(n));
      });
      if (node.getAttribute("loading") !== "lazy") node.removeAttribute("loading");
    }
  });
}

function sanitizeHtml(html) {
  if (window.DOMPurify && window.DOMPurify.sanitize) {
    installSanitizeHooks();
    return window.DOMPurify.sanitize(String(html || ""), SANITIZE_CFG);
  }
  return esc(html); // fail closed: no real sanitizer -> no HTML, just text
}

/* ---------- prose ----------
   Sanitize, then decorate. The decoration runs on output DOMPurify has already
   cleared, and the classes it adds come from this file rather than from user
   content — so it adds no sanitizer surface at all. It exists because the two
   things long comments most need are things the allowlist deliberately forbids
   the author from expressing: `class` is not allowed (so pasted markup can
   never impersonate app chrome), which means a table cannot ask to be
   scrollable and a run of photos cannot ask to be a gallery. We decide instead.

   Same technique labelListTables() already uses to put data-label on cells for
   the responsive card collapse: trusted code decorating rendered output.

   Falls back to the bare sanitized string wherever DOMParser is unavailable,
   which is the test harness's DOM stub. */
function proseHtml(html) {
  const clean = sanitizeHtml(html);
  if (!clean || typeof DOMParser !== "function") return clean;
  let doc;
  try { doc = new DOMParser().parseFromString(`<body>${clean}</body>`, "text/html"); }
  catch (e) { return clean; }
  const body = doc && doc.body;
  if (!body) return clean;

  // A wide table scrolls inside its own box rather than pushing the page
  // sideways. tools/test_appui.mjs fails a horizontal overflow on <main>, and
  // exempts anything inside a scroller — this is what puts it inside one.
  body.querySelectorAll("table").forEach(t => {
    if (t.parentElement && t.parentElement.classList.contains("tblwrap")) return;
    const wrap = doc.createElement("div");
    wrap.className = "tblwrap";
    t.replaceWith(wrap);
    wrap.appendChild(t);
  });

  /* Consecutive images become a grid. "Consecutive" ignores whitespace and the
     <a download> wrapper imgAttachHtml() puts around every attachment, because
     that wrapper is exactly what a run of pasted photos looks like. */
  const unit = n => (n.tagName === "IMG" ? n : (n.tagName === "A" && n.children.length === 1 && n.firstElementChild.tagName === "IMG" ? n : null));
  const blank = n => n.nodeType === 3 && !n.textContent.trim();
  Array.from(body.children).forEach(node => {
    if (!unit(node) || (node.parentElement && node.parentElement.classList.contains("cgal"))) return;
    const run = [node];
    let next = node.nextSibling;
    while (next) {
      if (blank(next)) { next = next.nextSibling; continue; }
      if (next.nodeType !== 1 || !unit(next)) break;
      run.push(next); next = next.nextSibling;
    }
    if (run.length < 2) return;
    const gal = doc.createElement("div");
    gal.className = "cgal";
    run[0].replaceWith(gal);
    run.forEach(n => gal.appendChild(n));
  });

  return body.innerHTML;
}
function richTextAvailable() { return !!(window.DOMPurify && window.DOMPurify.sanitize); }

/* ---------- multi-select picker (assignees / parts) ----------
   State lives per picker id so search doesn't lose selection; only the picker
   subtree re-renders on keystroke/toggle so focus stays put. */
const PICKERS = {};
function pickerInit(id, items, selected) { PICKERS[id] = { items: items || [], sel: (selected || []).slice(), q: "", open: false }; }
function pickerValues(id) { return (PICKERS[id] ? PICKERS[id].sel : []).slice(); }
function pickerBody(id) {
  const p = PICKERS[id]; if (!p) return "";
  const q = p.q.toLowerCase();
  const opts = p.items.filter(it => !q || (it.label + " " + (it.sublabel || "")).toLowerCase().includes(q));
  const tok = p.sel.map(v => {
    const it = p.items.find(x => x.value === v) || { value: v, label: v };
    return `<span class="tok">${it.avatarEmail ? avatar(it.avatarEmail, 18) : ""}${esc(it.label)}<button onclick="event.stopPropagation();pickerToggle('${id}','${esc(v)}')">×</button></span>`;
  }).join("") || `<span class="muted" style="padding:2px 4px">click to add…</span>`;
  // Collapsed by default: the chosen area is a button that opens the list.
  return `<div class="chosen" onclick="pickerToggleOpen('${id}')">${tok}<span class="pk-caret ${p.open ? "open" : ""}">${icon("chevronDown", 15)}</span></div>
    ${p.open ? `<input class="psearch" placeholder="search…" value="${esc(p.q)}" oninput="pickerSearch('${id}',this.value)" onkeydown="if(event.key==='Escape')pickerClose('${id}')">
    <div class="opts" id="pk-opts-${id}">${pickerOpts(id, opts)}</div>` : ""}`;
}
function pickerOpen(id) { const p = PICKERS[id]; if (!p) return; p.open = true; const el = document.getElementById("pk-" + id); if (el) { el.innerHTML = pickerBody(id); const s = el.querySelector(".psearch"); if (s) s.focus(); } }
function pickerClose(id) { const p = PICKERS[id]; if (!p) return; p.open = false; p.q = ""; const el = document.getElementById("pk-" + id); if (el) el.innerHTML = pickerBody(id); }
// Clicking the chosen row toggled it open every time, even when already open,
// so a second click never closed it — this is the actual click target; open()
// and close() stay as explicit setters (Escape, the search input's blur path).
function pickerToggleOpen(id) { const p = PICKERS[id]; if (!p) return; if (p.open) pickerClose(id); else pickerOpen(id); }
function pickerOpts(id, opts) {
  const p = PICKERS[id];
  return opts.map(it => `<div class="opt ${p.sel.includes(it.value) ? "sel" : ""}" onclick="pickerToggle('${id}','${esc(it.value)}')">
    ${it.avatarEmail ? avatar(it.avatarEmail, 22) : ""}<span>${esc(it.label)}${it.sublabel ? ` <span class="muted">${esc(it.sublabel)}</span>` : ""}</span>
    ${p.sel.includes(it.value) ? '<span style="margin-left:auto;color:var(--ok)">✓</span>' : ""}
  </div>`).join("") || `<div class="opt muted">no matches</div>`;
}
function pickerToggle(id, v) {
  const p = PICKERS[id]; if (!p) return;
  const i = p.sel.indexOf(v);
  if (i >= 0) p.sel.splice(i, 1); else p.sel.push(v);
  const el = document.getElementById("pk-" + id); if (el) el.innerHTML = pickerBody(id);
}
function pickerSearch(id, q) {
  const p = PICKERS[id]; if (!p) return;
  p.q = q;
  const box = document.getElementById("pk-opts-" + id);
  const qq = q.toLowerCase();
  if (box) box.innerHTML = pickerOpts(id, p.items.filter(it => !qq || (it.label + " " + (it.sublabel || "")).toLowerCase().includes(qq)));
}
function pickerField(id) { return `<div class="picker" id="pk-${id}">${pickerBody(id)}</div>`; }

/* ---------- single-person field (purchaser, engineers) ----------
   In edit mode the field is the same chip read mode shows, inside one
   full-width button with a caret. Pressing it opens a popover under it: a
   search box, then people with faces. Reading and editing look nearly alike,
   and the whole field is one target, which is what a gloved thumb at the
   layup table can actually hit.

   State lives outside the DOM because render() repaints <main> on every
   Firestore snapshot. PF_SPECS[id] is what the field is (re-recorded each
   render, stamped with PF_GEN so pfRestore can tell a field that left the
   page from one still on it); PF_STATE[id] is what the user is doing with it
   (open, query, highlighted row, whether the untrained people are showing).
   Handlers carry only the field id and an option index, never a name or an
   email: esc() leaves apostrophes alone and O'Neil is on the team.

   Training filter: qualified people first, then one "Show everyone (N not
   trained)" row. The common pick is one of three or four trained people, and
   a short list is one you can scan and hit with a glove on. The rest are one
   tap away and tagged "not X-trained" when shown, because assignment is
   planning and the buy-off is what enforces training. Typing searches
   everyone regardless: if you typed a name you meant that person, and "no
   matches" for someone standing next to you would be a lie.

   Somebody not on the app: once the query names nobody exactly, a
   `Use "typed"` row appears at the bottom of the list. No separate mode or
   second text box, since the name is already typed. It is never highlighted
   on its own, so a typo plus Enter does nothing rather than writing a
   stranger into the record; you have to arrow to it or tap it. */
const PF_SPECS = {};
const PF_STATE = {};
let PF_GEN = 0;
function pfId(s) { return String(s || "").replace(/[^\w-]/g, "_"); }
function personField(o) {
  const id = pfId(o.id);
  PF_SPECS[id] = {
    id, label: o.label || "", value: o.value || { email: "", name: "", kind: "none" },
    save: o.save, args: (o.args || []).slice(), training: o.training || null,
    allowNone: o.allowNone !== false, compact: !!o.compact, gen: PF_GEN,
  };
  if (!PF_STATE[id]) PF_STATE[id] = { open: false, q: "", hi: -1, showAll: false };
  return `<div class="f" id="pf-f-${id}"><label for="pf-btn-${id}">${esc(o.label)}</label><div class="pfield${o.compact ? " compact" : ""}" id="pf-${id}">${pfBody(id)}</div>${o.after || ""}</div>`;
}
// The value as read mode would show it, so switching into edit changes the frame and not the face.
function pfFace(v) {
  if (!v || v.kind === "none" || !(v.name || v.email)) return `<span class="pf-empty">Choose someone</span>`;
  // Said on the field, not only in a tooltip: nobody hovers with gloves on.
  const kind = { ext: "not on the app", unlinked: "not linked", gone: "left the roster" }[v.kind];
  const tail = kind ? `<span class="pf-kind">${kind}</span>` : "";
  if (v.email) return `<span class="pchip${v.kind === "gone" ? " gone" : ""}">${avatar(v.email, 22)}<span>${esc(v.name)}</span></span>${tail}`;
  return `<span class="pchip ext"><span>${esc(v.name)}</span></span>${tail}`;
}
/* How well a roster entry answers a query, or -1. Name start beats a later
   word, which beats initials ("nj"), which beats a match inside the name or
   the email. */
function pfRank(u, q) {
  const name = String(u.name || "").toLowerCase(), mail = String(u.email || "").toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some(w => w.startsWith(q))) return 1;
  if (!/\s/.test(q) && q.length <= 3 && initials(u.name || u.email).toLowerCase().startsWith(q)) return 2;
  if (name.includes(q)) return 3;
  if (mail.includes(q)) return 4;
  return -1;
}
/* The rows, in order. Index into this is what every handler passes, and it is
   a pure function of spec + state + roster, so the index a click carries
   names the same row the user saw. */
function pfOptions(id) {
  const s = PF_SPECS[id], st = PF_STATE[id];
  if (!s || !st) return [];
  const q = st.q.trim().toLowerCase();
  let hits = usersSorted().filter(u => u.email);
  if (q) hits = hits.map(u => [u, pfRank(u, q)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const out = [];
  if (s.training) {
    const yes = hits.filter(u => hasTraining(u.email, s.training));
    const no = hits.filter(u => !hasTraining(u.email, s.training));
    yes.forEach(u => out.push({ t: "person", u }));
    if (q || st.showAll || !yes.length) no.forEach(u => out.push({ t: "person", u, untrained: true }));
    else if (no.length) out.push({ t: "more", n: no.length });
  } else hits.forEach(u => out.push({ t: "person", u }));
  const exact = q && (DB.users || []).some(u => String(u.name || "").trim().toLowerCase() === q || String(u.email || "").toLowerCase() === q);
  // "N/A" or "TBD" is not somebody, so it is never offered as one.
  if (q && !exact && !notAPerson(q)) out.push({ t: "ext", name: st.q.trim() });
  if (s.allowNone && s.value && s.value.kind !== "none") out.push({ t: "clear" });
  return out;
}
function pfFirstPerson(id) { return pfOptions(id).findIndex(o => o.t === "person"); }
function pfListHtml(id) {
  const s = PF_SPECS[id], st = PF_STATE[id], opts = pfOptions(id);
  const q = st.q.trim();
  const tr = s.training ? trainingById(s.training).name : "";
  const cur = (s.value && s.value.email) || "";
  let html = "";
  const anyTrained = opts.some(o => o.t === "person" && !o.untrained);
  /* With nobody trained at all, tagging every row says the same thing five
     times and dims the whole list. One heading says it once. */
  const noneTrained = !!s.training && !qualifiedFor(s.training).length;
  if (noneTrained) html += `<div class="pf-grp" role="presentation">Nobody is ${esc(tr)}-trained yet</div>`;
  else if (s.training && !q) html += `<div class="pf-grp" role="presentation">${esc(tr)}-trained</div>`;
  if (q && !opts.some(o => o.t === "person")) html += `<div class="pf-note" role="presentation">Nobody on the app matches</div>`;
  let sepDone = !anyTrained;
  opts.forEach((o, i) => {
    const hi = i === st.hi;
    const a = `id="pf-opt-${id}-${i}" role="option" aria-selected="${hi}" onclick="pfPick('${id}',${i})"`;
    if (o.t === "person") {
      const un = o.untrained && !noneTrained;
      const sep = un && !sepDone ? (sepDone = true, " pf-sep") : "";
      const mine = o.u.email === cur;
      html += `<div class="opt pf-opt${hi ? " hi" : ""}${mine ? " cur" : ""}${un ? " untrained" : ""}${sep}" ${a}>${avatar(o.u, 28)}
        <span class="pf-nm"><span>${esc(o.u.name || o.u.email)}</span><span class="pf-sub">${un ? `<span class="pf-tag">not ${esc(tr)}-trained</span> · ` : ""}${esc(o.u.email)}</span></span>
        ${mine ? `<span class="pf-cur" aria-label="current">${icon("check", 16)}</span>` : ""}</div>`;
    } else if (o.t === "more") {
      html += `<div class="opt pf-opt pf-more${hi ? " hi" : ""}" ${a}><span class="pf-ico">${icon("chevronDown", 16)}</span><span class="pf-nm"><span>Show everyone</span><span class="pf-sub">${o.n} not ${esc(tr)}-trained</span></span></div>`;
    } else if (o.t === "ext") {
      html += `<div class="opt pf-opt pf-ext${hi ? " hi" : ""}" ${a}><span class="pf-ico">${icon("plus", 16)}</span><span class="pf-nm"><span>Use “${esc(o.name)}”</span><span class="pf-sub">not on the app</span></span></div>`;
    } else {
      html += `<div class="opt pf-opt pf-clear${hi ? " hi" : ""}" ${a}><span class="pf-ico">${icon("x", 16)}</span><span class="pf-nm"><span>Clear, nobody</span></span></div>`;
    }
  });
  return html;
}
// Below the list rather than in it, so it never scrolls away or reads as a row.
function pfFootHtml(id) { return PF_STATE[id].q.trim() ? "" : "Not on the app? Type their name."; }
function pfBody(id) {
  const s = PF_SPECS[id], st = PF_STATE[id];
  const open = !!st.open;
  const btn = `<button type="button" class="pf-btn" id="pf-btn-${id}" aria-haspopup="listbox" aria-expanded="${open}"${open ? ` aria-controls="pf-list-${id}"` : ""}
    onclick="pfToggle('${id}')" onkeydown="pfBtnKey(event,'${id}')">${pfFace(s.value)}<span class="pf-caret">${icon("chevronDown", 16)}</span></button>`;
  if (!open) return btn;
  const ad = st.hi >= 0 ? ` aria-activedescendant="pf-opt-${id}-${st.hi}"` : "";
  return btn + `<div class="pf-pop" id="pf-pop-${id}">
    <div class="pf-search">${icon("search", 15)}<input class="pf-q" id="pf-q-${id}" type="text" role="combobox" aria-expanded="true" aria-controls="pf-list-${id}"
      aria-autocomplete="list"${ad} aria-label="Search people for ${esc(s.label)}" autocomplete="off" autocapitalize="words" spellcheck="false"
      placeholder="Search name or email" value="${esc(st.q)}" onfocus="pfFocused('${id}')" oninput="pfInput('${id}',this)" onkeydown="pfKey(event,'${id}')"></div>
    <div class="pf-list" id="pf-list-${id}" role="listbox" aria-label="${esc(s.label)}" onmousedown="event.preventDefault()">${pfListHtml(id)}</div>
    <div class="pf-foot" id="pf-foot-${id}">${pfFootHtml(id)}</div>
  </div>`;
}
function pfPaint(id) { const el = document.getElementById("pf-" + id); if (el) el.innerHTML = pfBody(id); }
function pfPaintList(id) {
  const st = PF_STATE[id];
  const box = document.getElementById("pf-list-" + id);
  if (box) box.innerHTML = pfListHtml(id);
  const foot = document.getElementById("pf-foot-" + id);
  if (foot) foot.innerHTML = pfFootHtml(id);
  const q = document.getElementById("pf-q-" + id);
  // Absent, not empty, when nothing is highlighted: an empty idref is invalid.
  if (q && st.hi >= 0 && q.setAttribute) q.setAttribute("aria-activedescendant", `pf-opt-${id}-${st.hi}`);
  else if (q && q.removeAttribute) q.removeAttribute("aria-activedescendant");
  // Keep the highlighted row visible by scrolling the list only. scrollIntoView
  // would scroll the page too and drag the chip out from under the popover.
  const row = st.hi >= 0 && document.getElementById("pf-opt-" + id + "-" + st.hi);
  if (box && row && row.offsetHeight) {
    const top = row.offsetTop - box.offsetTop, bot = top + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bot > box.scrollTop + box.clientHeight) box.scrollTop = bot - box.clientHeight;
  }
}
function pfFocus(elId) { const el = document.getElementById(elId); if (el && el.focus) el.focus(); return el; }
function pfCoarse() { return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
/* `q` opens with a query already typed (a printable key pressed on the chip).
   On a touch screen the search box is NOT focused on a plain open: the phone
   keyboard would come up over the very list the member is trying to tap, and
   the list is usually short enough to need no search. It is one tap away. */
function pfOpen(id, q) {
  const s = PF_SPECS[id], st = PF_STATE[id];
  if (!s || !st) return;
  for (const k in PF_STATE) if (k !== id && PF_STATE[k].open) pfClose(k);
  q = q || "";
  Object.assign(st, { open: true, q, showAll: false, caret: q.length, caretEnd: q.length });
  // Nothing preselected unless it is the current value: Enter on a freshly
  // opened list should not quietly assign whoever sorts first.
  st.hi = q ? pfFirstPerson(id) : pfOptions(id).findIndex(o => o.t === "person" && o.u.email === (s.value && s.value.email));
  pfPaint(id);
  pfPaintList(id);
  st.focus = q || !pfCoarse() ? "q" : "btn";
  const inp = pfFocus(st.focus === "q" ? "pf-q-" + id : "pf-btn-" + id);
  if (q && inp && inp.setSelectionRange) try { inp.setSelectionRange(q.length, q.length); } catch (e) { /* no caret */ }
  pfPlace(id);
}
function pfClose(id, focusBtn) {
  const st = PF_STATE[id];
  if (!st) return;
  Object.assign(st, { open: false, q: "", hi: -1, showAll: false });
  pfPaint(id);
  if (focusBtn) pfFocus("pf-btn-" + id);
}
function pfToggle(id) { const st = PF_STATE[id]; if (!st) return; if (st.open) pfClose(id, true); else pfOpen(id); }
function pfOpenFirst() {
  const first = document.querySelector && document.querySelector(".pfield");
  const id = first && first.id ? first.id.slice(3) : Object.keys(PF_SPECS).find(k => PF_SPECS[k].gen === PF_GEN);
  if (id) pfOpen(id);
}
function pfFocused(id) { if (PF_STATE[id]) PF_STATE[id].focus = "q"; }
function pfInput(id, inp) {
  const st = PF_STATE[id];
  if (!st) return;
  st.q = inp.value;
  try { st.caret = inp.selectionStart; st.caretEnd = inp.selectionEnd; } catch (e) { /* no caret */ }
  st.hi = st.q.trim() ? pfFirstPerson(id) : -1;
  pfPaintList(id);
}
function pfBtnKey(e, id) {
  const st = PF_STATE[id];
  if (!st) return;
  if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !st.open) { e.preventDefault(); pfOpen(id); }
  else if (e.key === "Escape" && st.open) { e.preventDefault(); e.stopPropagation(); pfClose(id, true); }
  // Start typing on the chip and you are searching: the key becomes the query.
  // Space stays the button's own press.
  else if (e.key && e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (!st.open) pfOpen(id, e.key);
    else { const inp = pfFocus("pf-q-" + id); if (inp) { inp.value = st.q + e.key; pfInput(id, inp); } }
  }
}
function pfKey(e, id) {
  const st = PF_STATE[id];
  if (!st) return;
  const n = pfOptions(id).length;
  if (e.key === "ArrowDown") { e.preventDefault(); st.hi = n ? (st.hi + 1) % n : -1; pfPaintList(id); }
  else if (e.key === "ArrowUp") { e.preventDefault(); st.hi = n ? (st.hi <= 0 ? n - 1 : st.hi - 1) : -1; pfPaintList(id); }
  else if (e.key === "Enter") { e.preventDefault(); if (st.hi >= 0) pfPick(id, st.hi); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); pfClose(id, true); }
  // Tab: close and park focus on the chip, then let the browser's own Tab
  // carry on from there to the next field.
  else if (e.key === "Tab") pfClose(id, true);
}
function pfPick(id, i) {
  const s = PF_SPECS[id], st = PF_STATE[id];
  if (!s || !st) return;
  const o = pfOptions(id)[i];
  if (!o) return;
  if (o.t === "more") {
    // The "more" row's slot is taken by the first untrained person, so the
    // highlight lands on what was just revealed.
    st.showAll = true; st.hi = i;
    pfPaintList(id); pfFocus("pf-q-" + id);
    return;
  }
  let email = "", name = "";
  if (o.t === "person") { email = o.u.email; name = o.u.name || o.u.email; }
  else if (o.t === "ext") name = o.name;
  st.refocus = true;
  pfClose(id, true);
  const fn = window[s.save];
  if (typeof fn === "function") fn(...s.args, email, name);
}
/* Where the popover sits. Under the chip by default; against the right edge
   when it would run off the screen (a field in the right-hand column); above
   only when there is no room below even after scrolling. A clipping ancestor
   would cut it off, so in that case it goes position:fixed at the chip's
   screen coordinates instead. */
function pfPlace(id) {
  const pop = document.getElementById("pf-pop-" + id), wrap = document.getElementById("pf-" + id);
  if (!pop || !wrap || !wrap.getBoundingClientRect || !pop.getBoundingClientRect || !window.innerHeight) return;
  pop.classList.remove("right", "up");
  pop.style.position = pop.style.top = pop.style.left = pop.style.width = "";
  let clipped = false;
  for (let a = wrap.parentElement; a && a !== document.body; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (/hidden|clip/.test(cs.overflowX + " " + cs.overflowY)) { clipped = true; break; }
  }
  // The visual viewport, where there is one: on a phone it is what is left
  // above the keyboard, and innerHeight can be the larger layout viewport.
  const vv = window.visualViewport;
  const vw = document.documentElement.clientWidth || window.innerWidth, vh = (vv && vv.height) || window.innerHeight;
  const tb = document.getElementById("topbar");
  const topH = tb && tb.getBoundingClientRect ? Math.max(0, tb.getBoundingClientRect().bottom) : 0;
  /* Cap the list to what can be seen with the chip parked just under the
     topbar, so the popover always fits once scrolled, even above a phone
     keyboard. 132px keeps at least two and a half rows. */
  const list = document.getElementById("pf-list-" + id);
  if (list && list.style && list.getBoundingClientRect) {
    list.style.maxHeight = "";
    const chrome = pop.getBoundingClientRect().height - list.getBoundingClientRect().height;
    const room = vh - topH - 8 - wrap.getBoundingClientRect().height - 4 - chrome - 8;
    list.style.maxHeight = Math.max(132, Math.min(300, Math.floor(room))) + "px";
  }
  let r = wrap.getBoundingClientRect(), p = pop.getBoundingClientRect();
  if (p.right > vw - 8) pop.classList.add("right");
  // Scroll the page just enough to show the whole list, but never so far the
  // chip itself goes under the sticky topbar.
  if (p.bottom > vh - 7 && window.scrollBy) {
    const need = Math.min(p.bottom - (vh - 8), r.top - topH - 8);
    if (need > 0) { window.scrollBy(0, need); r = wrap.getBoundingClientRect(); p = pop.getBoundingClientRect(); }
  }
  if (p.bottom > vh - 7 && r.top - p.height - 8 > topH) pop.classList.add("up");
  if (clipped) {
    p = pop.getBoundingClientRect();
    Object.assign(pop.style, { position: "fixed", top: Math.round(p.top) + "px", left: Math.round(p.left) + "px", width: Math.round(p.width) + "px" });
    pop.classList.remove("right", "up");
  }
}
/* Around render(): remember the caret before <main> is thrown away, and
   afterwards put the open field back exactly as it was. A snapshot landing
   mid-word must not close the list or eat the next keystroke. A field that is
   no longer on the page (another record, edit mode off) is closed. */
function pfSnapshot() {
  const ae = document.activeElement;
  const aid = ae && typeof ae.id === "string" ? ae.id : "";
  for (const id in PF_STATE) {
    const st = PF_STATE[id];
    if (!st.open) continue;
    // Where focus was is where it goes back: the search box, the chip (an
    // open list on a phone, keyboard down), or nowhere of ours.
    st.focus = aid === "pf-q-" + id ? "q" : aid === "pf-btn-" + id ? "btn" : null;
    if (st.focus !== "q") continue;
    st.q = ae.value != null ? ae.value : st.q;
    try { st.caret = ae.selectionStart; st.caretEnd = ae.selectionEnd; } catch (e) { /* no caret */ }
  }
}
function pfRestore() {
  for (const id in PF_STATE) {
    const st = PF_STATE[id], s = PF_SPECS[id];
    if (!s || s.gen !== PF_GEN) { Object.assign(st, { open: false, q: "", hi: -1, showAll: false, refocus: false }); continue; }
    if (st.open) {
      if (st.focus === "q") {
        const q = pfFocus("pf-q-" + id);
        const at = st.caret != null ? st.caret : st.q.length;
        try { if (q && q.setSelectionRange) q.setSelectionRange(at, st.caretEnd != null ? st.caretEnd : at); } catch (e) { /* not a text input */ }
      } else if (st.focus === "btn") pfFocus("pf-btn-" + id);
      pfPlace(id);
    } else if (st.refocus) { st.refocus = false; pfFocus("pf-btn-" + id); }
  }
}
if (typeof document !== "undefined" && document.addEventListener) {
  // Pressing anywhere outside the open field closes it without a change.
  document.addEventListener("pointerdown", (e) => {
    for (const id in PF_STATE) {
      if (!PF_STATE[id].open) continue;
      const f = document.getElementById("pf-f-" + id);
      if (f && f.contains && e.target && f.contains(e.target)) continue;
      pfClose(id);
    }
  }, true);
  if (typeof window !== "undefined" && window.addEventListener) {
    const re = () => { for (const id in PF_STATE) if (PF_STATE[id].open) pfPlace(id); };
    window.addEventListener("resize", re);
    // The phone keyboard coming up or going away resizes only the visual viewport.
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener("resize", re);
      window.visualViewport.addEventListener("scroll", re);
    }
  }
}

/* ---------- tabs + top-level render ---------- */
/* Order = sidebar order. render() is resolved at click time, after every tab
   script has loaded. Add a tab by adding a row here + its renderX().

   Grouped by who is asking, in frequency order (2026-08-04 redesign):
     today       Tickets (what am I working on), Dashboard (what's happening)
     BUILD       Parts -> Work Orders -> Molds -> Inventory
                 Parent first, because that is the order the data runs in and
                 the order the work happens in: you create the part, then the
                 run that makes it. A part is the thing the car needs; a work
                 order is one run at making it; a mold is what it gets pulled
                 off; inventory is what it is made from and where that lives.
                 (Parts led this group from 2026-08-05. Work Orders was first
                 while the WO was the only real record; now the part owns the
                 spec and its runs hang off it, so the sidebar reads the way
                 the records point.)
     PLANNING    Schedule -> Budget      (Monday meetings and the lead)
     TEAM        Documents -> Reports -> People   (reference and admin)
   `grp` keys into GROUPS below; the header renders whenever a group has a
   label. `tip` is the tooltip a first-year hovers, and the whole first-run
   orientation budget. Hidden rows are routing aliases whose ids live on in
   old links and stored notifications; render() normalises them. */
const GROUPS = [
  { id: "today", label: "" },
  { id: "build", label: "Build" },
  { id: "planning", label: "Planning" },
  { id: "team", label: "Team" },
];
const TABS = [
  { id: "dashboard", label: "Dashboard", ic: "dashboard", coll: null, grp: "today", tip: "Dashboard — the team-wide picture", render: () => renderDashboard() },
  /* The blueprint: every part the team means to make, as a wide editable table.
     It replaces the Composites Master Tracker sheet the season used to be run
     from, and its rows ARE parts — sparse ones, until somebody fills them in.

     coll STAYS null. tabForId() does TABS.find(t => t.coll === coll) and takes
     the first match, so a row here carrying coll:"parts" would sit above the
     Parts row and hijack every P- chip, deep link and scanned label in the app
     into this table instead of the part's own page. */
  { id: "season", label: "Season", ic: "season", coll: null, grp: "today", tip: "Season — the blueprint: every part we mean to make", render: () => renderSeason() },
  /* SHELVED 2026-08-25 — paused, NOT deleted. See SHELVED.md.

     The team stopped running projects out of the app; what it kept is the
     Issue, which now lives as a section on the work order it holds up. The
     project-tracking half is off the nav and out of the dashboard, search and
     reports, and the Firestore `projects` collection is untouched: every
     PROJ-SN6-### record is exactly where it was. Deleting this row is what
     brings it back.

     CAREFUL — this hidden row is NOT one of the aliases below it. stock,
     items, lots and weekplan are hidden AND normalised away in render(), so
     their own render never runs. This one still renders itself, because the
     issue detail page lives here and is reached by chip and by #/PROJ- deep
     link. Do not "tidy up" by adding a normalisation line for it: that would
     silently kill every link to every issue. */
  { id: "projects", label: "Tickets", ic: "projects", coll: "projects", grp: "today", hidden: true, render: () => renderProjects() },
  { id: "parts", label: "Parts", ic: "parts", coll: "parts", grp: "build", tip: "Parts — every part, its mold, its stack and its runs", render: () => renderParts() },
  { id: "workorders", label: "Work Orders", ic: "workorders", coll: "workOrders", grp: "build", tip: "Work Orders — one run at making a part", render: () => renderWorkOrders() },
  /* `stock` survives as a hidden alias of the merged Molds tab: #/stock links,
     stored notification links, scanned BRD-/STK- codes and the test literals
     all resolve through this row's id and coll. render() normalises the tab id
     before painting, so the row's own render never actually runs. */
  /* Reached for real, not just by #/stock: consumePendingLink redeems a deep
     link AFTER render() has normalised the tab, so a #/BRD- link arrives here
     still saying "stock". Same dispatch as the normalisation, for that reason. */
  { id: "stock", label: "Stock", ic: "layers", coll: "stock", grp: "build", hidden: true,
    render: () => { view.tab = moldsOrBoardsFor(view.id); return view.tab === "inventory" ? renderInventory() : renderMoldsTab(); } },
  { id: "molds", label: "Molds", ic: "molds", coll: "molds", grp: "build", tip: "Molds — molds, stack plans and tooling board", render: () => renderMoldsTab() },
  /* Inventory replaces the Items and Materials tabs (2026-08-04): the storage
     map. Its coll is "items" and it sits BEFORE the hidden items alias, so
     tabForId resolves PNL-/JIG-/BIN- ids here. FAB-/RSN-/CON- resolve through
     the hidden lots alias, which render() normalises to this tab. */
  { id: "inventory", label: "Inventory", ic: "inventory", coll: "items", grp: "build", tip: "Inventory — what we have and where it lives", render: () => renderInventory() },
  { id: "items", label: "Items", ic: "layers", coll: "items", grp: "build", hidden: true, render: () => { view.tab = "inventory"; return renderInventory(); } },
  { id: "lots", label: "Materials", ic: "layers", coll: "lots", grp: "build", hidden: true, render: () => { view.tab = "inventory"; return renderInventory(); } },
  /* The R&D bench. Studies (RDS-) and coupons (CPN-) in one multi-class
     collection, and the only row in this array carrying coll:"rnd", so both
     prefixes resolve here through tabForId and nothing else is hijacked.

     LAST IN `build` ON PURPOSE. It consumes from Inventory and produces test
     pieces, so it is the end of the chain — and a first-year's first question
     is never R&D.

     NOT the same thing as `rnd:true` on a part. That flag means a real part
     with a full traveler that is not a season deliverable; nothing in this
     collection has a traveler, a blocker or a buy-off. See DESIGN-NOTES. */
  { id: "rnd", label: "R&D", ic: "rnd", coll: "rnd", grp: "build", tip: "R&D — coupon studies, test pieces and trials", render: () => renderRnd() },
  { id: "timeline", label: "Schedule", ic: "timeline", coll: "schedule", grp: "planning", tip: "Schedule — the season by station, or the week by person", render: () => renderSchedule() },
  /* Hidden alias: Weekly Plan merged into Schedule as its week view. Old
     #/weekplan links and stored notifications land there. */
  { id: "weekplan", label: "Weekly Plan", ic: "calendar", coll: "schedule", grp: "planning", hidden: true, render: () => { view.tab = "timeline"; view.schedView = "week"; return renderSchedule(); } },
  { id: "budget", label: "Budget", ic: "budget", coll: "budget", grp: "planning", tip: "Budget — purchases, arrivals and reimbursement", render: () => renderBudget() },
  { id: "documents", label: "Documents", ic: "documents", coll: null, grp: "team", tip: "Documents — datasheets, standards, printables", render: () => renderDocuments() },
  { id: "reports", label: "Reports", ic: "reports", coll: null, grp: "team", tip: "Reports — exports, print boards, labels", render: () => renderReports() },
  { id: "people", label: "People", ic: "people", coll: null, grp: "team", tip: "People — the roster and who carries what", render: () => renderPeople() },
];
function activeColl() { const t = TABS.find(t => t.id === view.tab); return t ? t.coll : null; }
function setTab(id) {
  // Picking a tab from the sidebar is "take me somewhere else", not a step in a
  // trail — so the trail ends here rather than letting Back walk you into a tab
  // you deliberately left.
  navClear();
  // The work-order rail keeps its filter flags in woLate/woMine/woDone rather
  // than reusing the Parts ones, precisely so this line can clear them: fLate
  // and friends are NOT reset here, and a "late only" toggle left on in Parts
  // would otherwise silently filter a different tab's rail.
  view = { ...view, tab: id, mode: "list", id: null, edit: false, q: "", fStatus: "", fSub: "", fReimb: "", fBudget: "", sortKey: null, sortDir: null, tlArchive: false, tlPast: false,
    woOpen: false, woLate: false, woMine: false, woDone: false,
    // A half-finished Select… on one rail must not be waiting when you come back.
    // showArch is per-visit too; allSeasons is NOT reset, so a lead reading the
    // SN5 archive can walk Parts → Work Orders without re-toggling.
    woPick: null, partPick: null, shopPick: null, pick: null, showArch: false };
  closeDrawer();
  render(); syncUrl();
}
function tabLabel() { const t = TABS.find(t => t.id === view.tab); return t ? t.label : ""; }
function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  const rail = railOn();
  el.innerHTML = `
    <div class="sb-brand" onclick="setTab('dashboard')" title="Home">${febMark(26)}<span class="sb-brand-txt">FEB <span>Composites</span></span></div>
    <div class="sb-nav">
      ${GROUPS.map(g => {
        const rows = TABS.filter(t => !t.hidden && t.grp === g.id);
        if (!rows.length) return "";
        return `${g.label ? `<div class="sb-hd" aria-hidden="true"><span>${esc(g.label)}</span></div>` : ""}${
          rows.map(t => `<button class="sb-item ${view.tab === t.id ? "active" : ""}" title="${esc(t.tip || t.label)}" onclick="setTab('${t.id}')">
        <span class="ic">${icon(t.ic, 19)}</span><span class="sb-label">${t.label}</span>
      </button>`).join("")}`;
      }).join("")}
    </div>
    <button class="sb-toggle no-print" title="${rail ? "Expand the sidebar" : "Collapse the sidebar to icons"}"
      aria-label="${rail ? "Expand the sidebar" : "Collapse the sidebar to icons"}" aria-pressed="${rail}" onclick="toggleRail()">
      <span class="ic">${icon(rail ? "chevronRight" : "chevronLeft", 18)}</span><span class="sb-label">Collapse</span>
    </button>`;
}
/* The version line's actions, in ONE place, because for four releases they
   existed in exactly one: the footer of the ⋯ sheet. That sheet is the
   small-screen overflow menu — `.icon-btn.tb-morebtn` is `display: none` until
   either the ≤900px breakpoint or syncChromeMetrics measures the bar
   overflowing — so on a maximised desktop window the button that TELLS THE
   WHOLE TEAM A RELEASE EXISTS was not in the DOM at all. A lead had to narrow
   their window to announce a release, which nobody would ever guess.

   `compact` shortens the label for the topbar, where the row is measured and a
   long one costs Backup/Restore/Roster their inline home at more widths.
   closeModal() is safe from the topbar: nothing is open, and it no-ops. */
function versionLinks(compact) {
  return `v${esc(APP_VERSION)} · <button class="link" onclick="closeModal();openWhatsNew()">What's new</button>${
    isLead() ? ` · <button class="link" onclick="closeModal();publishRelease()">Announce${compact ? "" : " this release"}</button>` : ""}`;
}

function renderTopbar() {
  const el = document.getElementById("topbar");
  if (!el) return;
  const st = window.fb ? fb.state : "loading";
  if (st !== "ready") { el.innerHTML = ""; return; }
  const unread = (DB.notifications || []).filter(n => !n.read).length;
  const guest = !!(window.fb && fb.guest);
  el.innerHTML = `
    <button class="hamburger no-print" title="Menu" aria-label="Menu" onclick="toggleDrawer()">${icon("menu", 22)}</button>
    <h1>${esc(tabLabel())}</h1>
    <div class="actions">
      ${/* Next to search, because they answer the same question by different
            means: "find me this thing". On a phone this is the fastest path
            from a physical object to its record. */""}
      <button class="icon-btn" title="Scan a label" aria-label="Scan a label" onclick="scanToOpen()">${icon("scan", 19)}</button>
      <button class="icon-btn" title="Search (⌘K)" aria-label="Search" onclick="openSearch()">${icon("search", 19)}</button>
      ${/* No bell for a guest: notifications are per-person and a guest is
            nobody, so the query does not even run. */""}
      ${guest ? "" : `<button class="icon-btn" title="Notifications" aria-label="Notifications" onclick="openNotifs()">${icon("bell", 19)}${unread ? `<span class="badge">${unread}</span>` : ""}</button>`}
      ${themeToggleBtn()}
      <span class="tb-desktop">
        ${/* Same links as the ⋯ sheet's footer, from the same function. Outside
              the guest branch on purpose: What's new is for everybody, and
              isLead() is what withholds Announce — not the guest test. */""}
        <span class="muted tny tb-ver">${versionLinks(true)}</span>
        ${guest ? `<span class="muted">Guest · read-only</span>
        <button class="primary" onclick="leaveGuest()">Sign in</button>`
        : `${/* Backup is not a new capability given the read rules — but a
                one-click JSON of the whole database is a very different thing to
                hand a stranger than it is to offer a member, and hiding it costs
                a guest nothing they came for. Same for the avatar button, which
                is a write. */""}
        <button onclick="exportAll()">Backup</button>
        ${isLead() ? `<button onclick="document.getElementById('importfile').click()">Restore</button>` : ""}
        <button class="avatar-btn" title="Change your photo" onclick="setMyAvatar()">${avatar(myEmail(), 30)}</button>
        <span class="muted">${esc(signerName())}${showsAsLead() ? " · lead" : ""}</span>
        <button onclick="fb.signOut()">Sign out</button>`}
      </span>
      <button class="icon-btn tb-morebtn" title="More" aria-label="More" onclick="openMoreMenu()">${icon("more", 20)}</button>
    </div>`;
}
// Small-screen overflow for the account/admin actions that don't fit the topbar.
// Reuses the same global handlers the desktop buttons call.
function openMoreMenu() {
  const lead = isLead();
  const guest = !!(window.fb && fb.guest);
  openModal(`
    <div style="display:flex;align-items:center;gap:10px;margin:0 0 16px">
      ${guest ? "" : avatar(myEmail(), 40)}
      <div><div style="font-weight:600">${guest ? "Guest" : esc(signerName())}</div>
        <div class="muted tny">${guest ? "read-only" : esc(myEmail()) + (lead ? " · lead" : "")}</div></div>
    </div>
    <div class="menu-actions">
      <button onclick="toggleTheme();closeModal()">${icon(currentTheme() === "dark" ? "sun" : "moon", 18)}${currentTheme() === "dark" ? "Light theme" : "Dark theme"}</button>
      ${/* The same three swaps as the desktop topbar, for the same reasons:
            the photo is a write, and the backup is the whole database in one
            tap. Signing out is what lets a guest reach the login screen at all,
            so it becomes the primary action rather than the dangerous one. */""}
      ${guest ? `<button class="primary" onclick="closeModal();leaveGuest()">${icon("logout", 18)}Sign in</button>`
      : `<button onclick="closeModal();setMyAvatar()">${icon("edit", 18)}Change photo</button>
      <button onclick="closeModal();exportAll()">${icon("download", 18)}Backup database</button>
      ${lead ? `<button onclick="closeModal();document.getElementById('importfile').click()">${icon("upload", 18)}Restore from backup</button>` : ""}
      <button class="danger" onclick="closeModal();fb.signOut()">${icon("logout", 18)}Sign out</button>`}
    </div>
    <div class="muted tny" style="margin-top:14px;text-align:center">${versionLinks(false)}</div>`);
}
/* ---------- mobile drawer ---------- */
// Guard document.body: the DOM-stub test harness has no body element.
function toggleDrawer() { if (document.body) document.body.classList.toggle("drawer-open"); }
function closeDrawer() { if (document.body) document.body.classList.remove("drawer-open"); }

/* ---------- swipe from the left edge opens the drawer ----------
   The decision is a pure function so it's testable without a real TouchEvent
   (the DOM-stub harness has none, and document.addEventListener is a no-op
   there anyway — this glue only ever runs in a real browser). Discrete
   open-only trigger at gesture-end, not a live drag-follows-finger transform:
   the existing CSS transition already handles the slide, and a v1 doesn't
   need to re-architect that into a per-frame transform. */
function isNarrowViewport() { return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 900px)").matches; }
function shouldOpenDrawerFromSwipe(startX, startY, endX, endY, drawerOpen, narrowViewport) {
  if (drawerOpen || !narrowViewport) return false;
  if (startX > 24) return false; // a narrow edge zone (0-24px), not the whole screen
  const dx = endX - startX, dy = endY - startY;
  if (dx < 60) return false; // a real rightward swipe, not a tap or jitter
  if (Math.abs(dy) > Math.abs(dx)) return false; // vertical-dominant = scrolling, not this gesture
  return true;
}
/* The other half, which was simply never written: swiping right opened the
   drawer and swiping left did nothing, so the only way out was the X or a tap
   on the scrim. A gesture that works in one direction and not its opposite
   reads as broken rather than as unimplemented.

   NO EDGE ZONE here, unlike opening. Opening needs one because a rightward
   swipe in the middle of the screen is how you scroll a board sideways or page
   a photo, so it has to be claimed narrowly. Closing has no such competition:
   the drawer is over the content, nothing behind it is scrollable while it is
   open, and the finger that just pushed it out lands wherever it lands.

   Same 60px / |dy|<|dx| thresholds as opening, so the two directions feel like
   one gesture rather than two rules. */
function shouldCloseDrawerFromSwipe(startX, startY, endX, endY, drawerOpen, narrowViewport) {
  if (!drawerOpen || !narrowViewport) return false;
  const dx = endX - startX, dy = endY - startY;
  if (dx > -60) return false;                      // a real leftward swipe
  if (Math.abs(dy) > Math.abs(dx)) return false;   // vertical-dominant = scrolling
  return true;
}
let SWIPE_START = null;
document.addEventListener("touchstart", (e) => {
  const t = e.touches && e.touches[0]; if (!t) { SWIPE_START = null; return; }
  SWIPE_START = { x: t.clientX, y: t.clientY };
}, { passive: true });
document.addEventListener("touchend", (e) => {
  const start = SWIPE_START; SWIPE_START = null;
  if (!start) return;
  const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
  /* The lightbox owns the screen while it is open, and `inert` on #app does
     nothing to a document-level listener. Without this, swiping right from the
     left edge to go back a photo also opens the drawer BEHIND the lightbox
     (sidebar is z 40, the lightbox 55), and it is still open when you close it.
     Guarded at the listener rather than inside the pure function, which stays
     free of DOM reads so it remains testable without a TouchEvent. */
  if (typeof lightboxOpen === "function" && lightboxOpen()) { lbSwipeEnd(start, t); return; }
  const drawerOpen = !!(document.body && document.body.classList.contains("drawer-open"));
  const narrow = isNarrowViewport();
  if (shouldOpenDrawerFromSwipe(start.x, start.y, t.clientX, t.clientY, drawerOpen, narrow)) toggleDrawer();
  else if (shouldCloseDrawerFromSwipe(start.x, start.y, t.clientX, t.clientY, drawerOpen, narrow)) closeDrawer();
}, { passive: true });

/* ---------- theme (light / dark) ----------
   The no-FOUC <head> script set data-theme before paint; this just flips and
   persists it. Guards the DOM-stub test harness. */
function currentTheme() {
  const el = document.documentElement;
  return (el && el.getAttribute && el.getAttribute("data-theme") === "dark") ? "dark" : "light";
}
function applyTheme(t) {
  const el = document.documentElement;
  if (el && el.setAttribute) el.setAttribute("data-theme", t);
  try { localStorage.setItem("feb-theme", t); } catch (e) {}
}
function toggleTheme() {
  applyTheme(currentTheme() === "dark" ? "light" : "dark");
  renderTopbar();
  // A WebGL canvas isn't restyled by CSS variables — it has to repaint itself.
  if (typeof mvThemeChanged === "function") mvThemeChanged();
}
function themeToggleBtn() {
  const dark = currentTheme() === "dark";
  const label = dark ? "Switch to light theme" : "Switch to dark theme";
  return `<button class="icon-btn" title="${label}" aria-label="${label}" onclick="toggleTheme()">${icon(dark ? "sun" : "moon", 18)}</button>`;
}

/* ---------- sidebar rail ----------
   Collapse the 216px sidebar to a 56px icon rail and hand the 160px back to
   the content. Remembered the same way and in the same place as the theme,
   because it is the same kind of choice: a persistent preference about the
   chrome, not app state, so it does not belong in `view`.

   Applied to <body> rather than to the nav: main's width is what actually
   changes, and the two have no common ancestor below #app. Set before first
   paint by the same inline script in index.html that sets the theme, so the
   sidebar does not visibly snap shut a moment after load. */
function railOn() {
  try { return localStorage.getItem("feb-rail") === "1"; } catch (e) { return false; }
}
function toggleRail() {
  const on = !railOn();
  try { localStorage.setItem("feb-rail", on ? "1" : "0"); } catch (e) {}
  /* <html>, not <body>: the no-FOUC script in index.html runs inside <head>
     where <body> does not exist yet, and the sidebar snapping shut a beat
     after load is exactly what that script exists to prevent. Guarded because
     tools/test_app.mjs runs against a DOM stub with no documentElement. */
  const de = document.documentElement;
  if (de && de.classList) de.classList.toggle("rail", on);
  renderSidebar();
  /* The content pane just changed width without the window changing size, so
     anything that measured its own box is now wrong — the meshview canvas
     (which listens for exactly this event, meshview.js:532) and the topbar
     overflow check. Dispatching the real event rather than calling into each
     of them keeps this from needing a list of who cares. */
  if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("resize"));
}

/* ---------- global search (⌘K command palette) ---------- */
/* Shelf ids to shelf names, built once per call rather than a linear find per
   record. pubProjection resolves the same thing one record at a time, which is
   O(n·m) over the whole mirror rebuild. */
function invLocNames() {
  const m = new Map();
  for (const o of DB.items || []) if (o.cls === "BIN") m.set(o.id, o.name || o.id);
  return m;
}
/* Where a record physically is. Parts say it in a different field, and a
   free-text location from before BIN records existed is reported honestly
   rather than resolved into a lie. */
function invWhere(o, names) {
  const v = String((o && (o.location || o.moldLocation)) || "");
  if (!v) return null;
  if (!v.startsWith("BIN-")) return { id: "", name: v, legacy: true };
  return { id: v, name: (names || invLocNames()).get(v) || v };
}

/* Search, scored.
 *
 * Two things were wrong. Results were pushed in COLLECTION order and then
 * sliced at 40, so an exact name match on a lot could be shoved off the end by
 * forty id-substring matches from DB.workOrders — and typing "SN6" matched
 * every record in the database, silently truncated.
 *
 * And no result said WHERE the thing was, which is the one fact you are
 * standing in the shop to obtain. It was one function call away the whole time.
 */
const SEARCH_LIMIT = 40;
function searchScore(q, id, name, extra) {
  const n = String(name || "").toLowerCase();
  const i = String(id || "").toLowerCase();
  if (i === q) return 100;
  if (n === q) return 90;
  if (n.startsWith(q)) return 60;
  if (n.includes(q)) return 40;
  if (i.includes(q)) return 20;
  if (String(extra || "").toLowerCase().includes(q)) return 10;
  return 0;
}
function searchAll(q) {
  q = (q || "").toLowerCase().trim();
  if (!q) return [];
  const out = [];
  const names = invLocNames();
  /* `where` is resolved once here rather than at render time so the ranking and
     the row agree about what a result is. */
  const add = (tab, id, label, sub, extra, rec) => {
    const s = searchScore(q, id, label, extra);
    if (!s) return;
    out.push({ tab, id, label, sub, score: s, where: rec ? invWhere(rec, names) : null });
  };
  /* R&D rides the `sub` line, the same slot that already distinguishes a
     storage location from an item. ⌘K must FIND an R&D part — that is half the
     point of it having a real id — so this marks, it never filters. esc() at
     the render site handles the ampersand. */
  DB.workOrders.forEach(w => add("workorders", w.id, w.partName || w.id, (woIsRnd(w) ? "R&D work order " : "Work order ") + w.id));
  DB.parts.forEach(p => add("parts", p.id, p.partName || p.id, (isRnd(p) ? "R&D part " : "Part ") + p.id, "", p));
  // Issues only: a shelved project ticket surfacing in ⌘K is an invitation
  // into a paused feature. The records are still there, just not offered.
  DB.projects.filter(isIssue).forEach(p => add("projects", p.id, p.title || p.id, "Issue"));
  DB.budget.forEach(b => add("budget", b.id, b.item || b.id, "Purchase", b.source));
  (DB.molds || []).forEach(m => add("molds", m.id, m.name || m.id, "Mold " + m.id, "", m));
  (DB.stock || []).forEach(b => add("stock", b.id, b.label || b.id, "Tooling board " + b.id, b.origin, b));
  (DB.stackplans || []).forEach(p => add("stock", p.id, p.name || p.id, "Stack plan " + p.id));
  (DB.items || []).forEach(o => add("items", o.id, o.name || o.id,
    (o.cls === "BIN" ? "Storage location " : "Item ") + o.id,
    [o.site, o.locKind].filter(Boolean).join(" "), o.cls === "BIN" ? null : o));
  (DB.lots || []).forEach(o => add("lots", o.id, o.name || o.id, "Material lot " + o.id,
    [o.vendorLot, o.supplier, o.matKey].filter(Boolean).join(" "), o));
  DB.users.forEach(u => add("people", u.email, u.name || u.email, "Person", u.email));
  (typeof allDocs === "function" ? allDocs() : []).forEach(d => {
    const s = searchScore(q, "", d.title, d.category);
    if (s) out.push({ tab: "documents", docSrc: d.src, uploaded: d.uploaded, label: d.title,
                      sub: "Document · " + d.category, score: s, where: null });
  });
  out.sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)));
  const total = out.length;
  const res = out.slice(0, SEARCH_LIMIT);
  res.total = total;
  return res;
}

function renderSearchResults(q) {
  const box = document.getElementById("gsearch-results"); if (!box) return;
  const res = searchAll(q);
  box.innerHTML = !q.trim() ? `<div class="muted" style="padding:10px">Type to search across every tab.</div>`
    : res.length ? res.map((r, i) => `<div class="gsr">
        <button class="gsr-go" onclick="gotoResult(${i})">
          <span class="gsr-name">${esc(r.label)}</span>
          <span class="muted tny">${esc(r.sub)}</span>
        </button>
        ${r.where ? `<button class="chip gsr-where" title="What else is on it"
            onclick="${r.where.id ? `openRecord('inventory','${esc(r.where.id)}')` : "void 0"}"
          >${esc(r.where.name)}${r.where.legacy ? " (free text)" : ""}</button>` : ""}
      </div>`).join("")
      + (res.total > res.length ? `<div class="muted tny" style="padding:8px 10px">showing ${res.length} of ${res.total}</div>` : "")
      : `<div class="muted" style="padding:10px">No matches.</div>`;
  window.__searchRes = res;
}

function openSearch() {
  openModal(`
    <input id="gsearch" class="gsearch" placeholder="Search parts, work orders, projects, people, docs…" oninput="renderSearchResults(this.value)" onkeydown="if(event.key==='Escape')closeModal()">
    <div id="gsearch-results" class="gsearch-results"></div>`);
}
function gotoResult(i) {
  const r = (window.__searchRes || [])[i]; if (!r) return;
  closeModal();
  if (r.tab === "documents") { setTab("documents"); if (typeof openDocFromRow === "function" && r.docSrc) openDocFromRow(r.docSrc, r.uploaded ? "up" : ""); }
  else if (r.tab === "people") { openPerson(r.id); }
  else openRecord(r.tab, r.id);
}

/* ---------- notifications ---------- */
function openNotifs() {
  const ns = (DB.notifications || []).slice().sort((a, b) => String(b.ts || "").localeCompare(String(a.ts || "")));
  openModal(`
    <h2>Notifications</h2>
    ${ns.length ? ns.map(n => `<div class="notif ${n.read ? "" : "unread"}" onclick="gotoNotif('${n.id}')">
      <div>${esc(n.text)}</div>
      <div class="muted tny">${esc(n.type || "")} · ${fmtWhen(n.ts)}${n.from ? " · " + esc(userName(n.from)) : ""}</div>
    </div>`).join("") : '<p class="muted">No notifications.</p>'}
    ${ns.some(n => !n.read) ? `<div class="foot"><button onclick="markAllNotifsRead()">Mark all read</button></div>` : ""}`);
}
function gotoNotif(id) {
  const n = (DB.notifications || []).find(x => x.id === id);
  if (n && !n.read) fb.markNotifRead(id).catch(() => {});
  closeModal();
  if (n && n.link && n.link.tab) { if (n.link.id) openRecord(n.link.tab, n.link.id); else setTab(n.link.tab); }
}
function markAllNotifsRead() {
  (DB.notifications || []).filter(n => !n.read).forEach(n => fb.markNotifRead(n.id).catch(() => {}));
  closeModal();
}
// Overridden meaningfully in dashboard.js once watchers exist; safe default here.
/* ---------- the boot splash ----------
   IT IS A GATE. The app waits behind it until somebody presses Continue.

   It used to leave on a timer. The sheet came down the instant fb.state left
   "loading", so a floor was added to stop it beating the fact onto the screen —
   1600ms, or 2400ms on the first load of a day. Continue was an accelerator
   that waived the remainder, never a door, and the whole thing had a fault at
   its centre: .ready was only ever added inside the floor branch, so if auth
   resolved AFTER the floor expired — the shop-wifi case the button was written
   for — execution fell straight through to dismissal and the button never
   appeared at all. It was reachable only on fast boots, which is backwards.

   Both floors are gone, and so is the tax they were trading against. With a
   real gate there is nothing to budget: the fact is on screen until you press,
   whether that is one second or one minute. What is left is SPLASH_DWELL, which
   is not a reading window — it is just long enough for the plies to finish
   laying up, so the exit cannot interrupt the entrance.

   In their place, five real milestones and a start-light gantry that counts
   them. The gantry is honest or it is nothing: every lamp is a thing the boot
   genuinely waited on, and a step that fails says so in amber and in words
   rather than quietly completing. A boot that cannot finish arms the button
   anyway, with different wording — see splashFail. Nobody is locked out, and
   nobody is told the app loaded when it did not.

   The pieces: splashStep records a milestone, splashPaint draws the gantry,
   splashCheck arms the gate, splashGo is the only door, hideSplash is the
   teardown, splashFail is the honest give-up. */
/* Sized to sp-lay (0.7s), so the plies are never cut off mid-flight. That is
   the ONLY thing this number protects. It is not a reading window any more —
   the gate is, and it lasts as long as you want it to. */
const SPLASH_DWELL = 700;

/* The five milestones the gantry counts. Every one is a real thing the boot
   waits on; none of them is a timer. `say` is what the caption reads while that
   step is the one outstanding, in the words somebody at RFS would use.

   Order here is the order the captions are PREFERRED in, not the order the
   steps finish — they genuinely finish out of order. See splashPaint. */
const SPLASH_BOOT = [
  { key: "code",   say: "Loading the app…" },
  { key: "fonts",  say: "Loading type…" },
  { key: "auth",   say: "Checking who you are…" },
  { key: "access", say: "Looking you up on the roster…" },
  { key: "data",   say: "Loading parts, runs and stock…" },
];
/* 0 = still running · 1 = done · 2 = not needed on this path · -1 = failed.
   "Not needed" is a real state and not a fudge: signed out, there is no data to
   wait for, and pretending otherwise is how a gate hangs forever. */
let SPLASH = { code: 0, fonts: 0, auth: 0, access: 0, data: 0 };
let SPLASH_DONE = false, SPLASH_READY = false, SPLASH_ASKED = false, SPLASH_NOTE = "";
/* Which collections have reported their first snapshot. The `data` milestone is
   the only one that needs to remember anything across calls. */
let SPLASH_SEEN = null;

function splashEl() {
  return (typeof document !== "undefined" && document.getElementById)
    ? document.getElementById("splash") : null;
}
/* Stamped in the inline script at the top of the body, NOT here: core.js is the
   tenth of thirty-three scripts, so a timestamp taken at this line has already
   lost most of the parse it is meant to be measuring. */
function splashAge() { return Date.now() - (window.__splashT0 || Date.now()); }

function splashById(id) {
  return (typeof document !== "undefined" && document.getElementById) ? document.getElementById(id) : null;
}

/* How many of the five have settled, and whether any of them settled badly. */
function splashDoneCount() { return SPLASH_BOOT.filter(s => SPLASH[s.key] !== 0).length; }
function splashFailed() { return SPLASH_BOOT.some(s => SPLASH[s.key] === -1); }

/* Paint the gantry from SPLASH. Cheap and idempotent — called on every step, so
   it must never assume it is the first.

   THE LAMPS FILL BY COUNT, LEFT TO RIGHT, and are not one-per-milestone. Fonts
   routinely beat auth, and on a warm cache the first snapshot can land before
   the roster read returns; a gantry that lit its third lamp while its first was
   dark would read as broken rather than as honest. The count is the true
   number; the caption carries which step is actually outstanding. */
function splashPaint() {
  const el = splashEl();
  if (!el || SPLASH_DONE || !el.querySelectorAll) return;
  const done = splashDoneCount();
  const failed = SPLASH_BOOT.filter(s => SPLASH[s.key] === -1).length;
  const bad = failed > 0;
  const lamps = el.querySelectorAll(".sp-lamp");
  for (let i = 0; i < lamps.length; i++) {
    /* ONE AMBER LAMP PER FAILED STEP, at the end of the run. A give-up marks
       everything still outstanding as failed, so three stalled steps must show
       three amber lamps — lighting a single one would under-report a boot that
       went badly wrong, which is the one lie this whole feature exists to
       avoid. Gold first, then amber, then dark: the gantry reads left to right
       as "these worked, these did not, these never got asked". */
    lamps[i].className = "sp-lamp" +
      (i >= done ? "" : i < done - failed ? " on" : " bad");
  }
  /* getElementById, not querySelector, for everything that HAS an id: the node
     test harness ships a hand-rolled document whose querySelector always
     returns null, so a caption or a button addressed that way would be
     untestable outside a browser. The lamps are the one exception — they carry
     no ids, and in the harness the loop above simply iterates nothing. */
  const box = splashById("sp-lights");
  if (box && box.setAttribute) box.setAttribute("aria-valuenow", String(done));
  /* add/remove rather than toggle(name, force): the node test harness ships a
     minimal classList and does not implement the two-argument form, and this is
     not worth a DOM shim. */
  if (bad) el.classList.add("failed"); else el.classList.remove("failed");

  const step = splashById("sp-step");
  if (!step) return;
  if (SPLASH_NOTE) { step.textContent = SPLASH_NOTE; return; }
  const next = SPLASH_BOOT.find(s => SPLASH[s.key] === 0);
  step.textContent = next ? next.say : "Ready";
}

/* Record a milestone. `state` is 1 done, 2 not needed, -1 failed; `note` is the
   plain-words reason, and only a failure gets to set one — a successful step
   has nothing to say that the gantry is not already saying. */
function splashStep(key, state, note) {
  if (SPLASH_DONE || !(key in SPLASH)) return;
  if (SPLASH[key] !== 0) return;                 // first answer wins; no flapping
  SPLASH[key] = state;
  if (state === -1 && note) SPLASH_NOTE = note;
  splashPaint();
  splashCheck();
}

/* Arm the button, once everything has settled and the plies have landed.

   .ready is added HERE, on real completion, and no longer inside a floor
   branch. That is the fix for the fault where a slow boot — the shop-wifi case
   the button exists for — never showed the button at all, because the floor had
   already expired and the code fell straight through to dismissal. */
function splashCheck() {
  if (SPLASH_DONE || SPLASH_READY) return;
  if (splashDoneCount() < SPLASH_BOOT.length) return;
  const left = SPLASH_DWELL - splashAge();
  if (left > 0) { setTimeout(splashCheck, left); return; }
  SPLASH_READY = true;
  const el = splashEl();
  if (!el) return;
  if (splashFailed()) {
    const go = splashById("sp-go");
    /* Different words, because pressing it is now an informed choice rather
       than an invitation. A button that said "Continue" over a broken boot
       would be the silent timeout wearing a hat. */
    if (go) go.textContent = "Continue anyway";
  }
  el.classList.add("ready");
  splashPaint();
  /* Somebody already pressed while it was still loading. The press was
     remembered rather than swallowed, so honour it now. */
  if (SPLASH_ASKED) hideSplash(true);
}

/* Give up on whatever is still running and arm the gate with the bad news.
   Used by the twelve-second backstop and by any step that knows it has failed.
   It does NOT dismiss: dismissing on a timer is the behaviour being removed. */
function splashFail(note) {
  if (SPLASH_DONE) return;
  /* NOTHING OUTSTANDING MEANS NOTHING TO REPORT. The twelve-second backstop
     fires on a timer and cannot know whether it is needed, so it will land on
     plenty of perfectly healthy boots where somebody simply had not pressed
     Continue yet — which is now the normal state of this screen rather than an
     unusual one. Without this guard that boot gets told "Something is not
     responding" over five gold lamps, which is the exact species of lie the
     gantry exists to avoid. */
  if (SPLASH_BOOT.every(s => SPLASH[s.key] !== 0)) return;
  for (const s of SPLASH_BOOT) {
    if (SPLASH[s.key] !== 0) continue;
    SPLASH[s.key] = -1;
  }
  /* A reason already set by the step that actually failed beats the backstop's
     generic one — it is more specific and it was there first. */
  if (!SPLASH_NOTE) SPLASH_NOTE = note || "Something is not responding.";
  splashPaint();
  splashCheck();
}

/* The one control on the sheet that is not "go". A failed boot is usually a
   transient network one, and a reload is genuinely the fix. */
function splashRetry() {
  if (typeof location !== "undefined" && location.reload) location.reload();
}

/* Milestone: fonts. Both faces ship font-display: swap, so without this the
   wordmark and then the whole first screen re-set themselves a beat after you
   arrive — which is the one flash the gate is now in a position to absorb for
   free, since something else is always slower.

   "Not needed" rather than "failed" on every unhappy path: the node harness has
   no document.fonts, an older browser may not have it either, and the promise
   can reject. None of those is a broken boot, and a swapped face is not worth
   turning the gantry amber over. Kicked off at parse time so the wait overlaps
   auth instead of following it. */
(function () {
  try {
    if (typeof document === "undefined" || !document.fonts || !document.fonts.ready) { splashStep("fonts", 2); return; }
    document.fonts.ready.then(() => splashStep("fonts", 1), () => splashStep("fonts", 2));
  } catch (e) { splashStep("fonts", 2); }
})();

/* Take the boot splash down — or arrange to, once the floor is spent.
   Idempotent, and safe to call before the element exists (the node harness has
   no real div) or after it is already gone.

   `force` skips the floor: the 12s backstop uses it, and so does splashGo once
   there is genuinely something to leave to.

   Removed from the DOM after the animation rather than left transparent,
   because a full-bleed fixed sheet still answers hit tests until it is gone and
   the first thing under it is the sign-in field. */
function hideSplash(force) {
  if (SPLASH_DONE) return;
  const el = splashEl();
  if (!el) return;

  /* THE SHEET NEVER TAKES ITSELF DOWN. Without `force` this is a no-op unless
     the gate is armed, and even then only a press gets here — there is no
     timer left in this function that dismisses anything.

     `force` is the deliberate override, and it has exactly two callers: a press
     against an armed gate (splashGo), and the UI harness, which forces the
     sheet away so it can photograph the app behind it (tools/lib/browser.mjs).
     Both are somebody saying go; neither is the app deciding for itself. */
  if (!force && !SPLASH_READY) return;

  SPLASH_DONE = true;
  /* Disabled and hidden BEFORE the animation rather than after. .sp-go is
     focusable and sits ahead of everything in the document, so for the half
     second the sheet spends lifting off it would otherwise be a keyboard trap
     inside an element nobody can see. */
  const doc = typeof document !== "undefined" && document.getElementById ? document : null;
  const go = doc ? doc.getElementById("sp-go") : null;
  if (go) go.disabled = true;
  const retry = doc ? doc.getElementById("sp-retry") : null;
  if (retry) retry.disabled = true;
  if (el.setAttribute) el.setAttribute("aria-hidden", "true");
  el.classList.add("enter");
  /* The app rises as the sheet is wiped off it, rather than sitting there
     already arrived. Added on the way out and removed once it has played, so
     nothing in the app is left carrying a boot animation for the rest of the
     session — a re-render mid-animation would otherwise replay it. */
  const app = doc ? doc.getElementById("app") : null;
  if (app && app.classList) {
    app.classList.add("sp-arrive");
    setTimeout(() => app.classList.remove("sp-arrive"), 500);
  }
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 560);
}

/* Somebody said go — a tap anywhere on the sheet, Enter, Space or Escape.

   THIS IS THE ONLY WAY OUT. Nothing else takes the sheet down: no floor, no
   arrival timer, no backstop. The app waits behind the splash for as long as
   nobody presses, which is what makes the fact worth putting there — you read
   it for as long as you want to, not for the 1.6 seconds somebody budgeted.

   A press before the gate arms is REMEMBERED rather than swallowed, and
   splashCheck honours it the instant the boot finishes. That matters more now
   than it did: on shop wifi at RFS "not ready yet" is the common case, and a
   press that vanished would train people to jab at the screen.

   The press animation is the acknowledgement that the input was heard even
   though it could not be acted on yet. */
function splashGo() {
  const el = splashEl();
  if (!el || SPLASH_DONE) return;
  SPLASH_ASKED = true;
  if (SPLASH_READY) { hideSplash(true); return; }
  el.classList.remove("press");
  void el.offsetWidth;            // restart the animation rather than ignore a second press
  el.classList.add("press");
}

/* Says which mode you are in, once, at the top — rather than making somebody
   infer it from a page full of greyed controls. .gate is the app's existing
   amber notice strip (the reload banner and the bad-link hint both use it), so
   this needs no new CSS and no design-system entry. */
function guestBanner() {
  if (!(window.fb && fb.guest)) return "";
  return `<div class="gate no-print"><span class="gi">&#128065;</span><div>
    <b>Viewing as a guest.</b> Everything is visible and nothing is editable — every
    buy-off carries a name, so changing anything needs one.
    <button class="link" onclick="leaveGuest()">Sign in</button></div></div>`;
}
/* Firebase persists an anonymous session in IndexedDB, so a guest who taps once
   is auto-signed-in as that same anonymous user on every future visit and never
   sees the login screen again. Signing out is what makes the door work. */
async function leaveGuest() {
  try { await fb.signOut(); } catch (e) { /* already gone */ }
  view = { ...view, authMode: "in" };
}

/* Scroll positions of the rails inside <main>, keyed by aria-label. Split
   from render() so the test suite can call them against a stub element. */
function rememberRailScroll(root) {
  const kept = {};
  if (!root || typeof root.querySelectorAll !== "function") return kept;
  root.querySelectorAll(".plist").forEach((n, i) => {
    const k = (n.getAttribute && n.getAttribute("aria-label")) || String(i);
    if (n.scrollTop > 0) kept[k] = n.scrollTop;
  });
  return kept;
}
function restoreRailScroll(root, kept) {
  if (!root || typeof root.querySelectorAll !== "function" || !kept) return;
  root.querySelectorAll(".plist").forEach((n, i) => {
    const k = (n.getAttribute && n.getAttribute("aria-label")) || String(i);
    if (kept[k] != null) n.scrollTop = kept[k];
  });
}

function render() {
  /* Stock merged into Molds (2026-08): the `stock` tab id keeps resolving —
     old #/stock links, notification links and BRD-/STK- routing all pass
     through it — but what paints is the merged tab. Normalised before the
     sidebar so the Molds entry lights up, and mode/id survive so a routed
     BRD- lands selected in the rail. */
  /* Milestone 1. Reaching render() at all means every one of the thirty-three
     classic scripts parsed — which is the whole of "the app code is here", and
     is why this is measured from inside render rather than from a line in some
     particular file. The inline <script>render()</script> at the end of the
     body is the first caller. */
  splashStep("code", 1);
  if (view.tab === "stock") view.tab = moldsOrBoardsFor(view.id);
  if (view.tab === "weekplan") { view.tab = "timeline"; view.schedView = "week"; }
  if (view.tab === "items" || view.tab === "lots") view.tab = "inventory";
  renderSidebar();
  renderTopbar();
  const el = document.getElementById("main");
  const st = window.fb ? fb.state : "loading";
  if (st === "loading") { el.innerHTML = `<div class="card">Connecting…</div>`; return; }
  /* Past here there is a real screen behind the sheet — the app, the login form,
     or the "you're not on the roster yet" note.
     NOT a dismissal. It used to be, and that was the bug: the sheet left on its
     own the moment this line was reached. Now it only reports, and the sheet
     waits to be told to go. */
  splashCheck();
  if (st === "signedout") { el.innerHTML = renderLogin(); return; }
  /* THE SECOND CASCADE. Every detail page's field() helper renders a read-only
     <div class="ro"> when view.edit is down, so this one line turns roughly a
     hundred and thirty inputs across workorders, parts, budget, projects, shop
     and inventory into text — without any of those files knowing what a guest
     is. setTab() already clears the flag on every tab change; this covers the
     case where a guest arrives on a page somebody left in edit mode. */
  if (window.fb && fb.guest && view.edit) view = { ...view, edit: false };
  if (st === "pending") { el.innerHTML = renderPending(); return; }
  /* A scan link waiting since page load, redeemed the first time we get here
     with data. It has to be here and not at boot: on first paint fb.state is
     "loading" and DB is empty, so there is no record to open yet. It rewrites
     `view` in place, so it must run before the tab is picked below. */
  if (PENDING_LINK && consumePendingLink()) syncUrl();
  // Explicit dashboard fallback, kept even now Dashboard is TABS[0] again:
  // the landing behavior should never depend on array order.
  const tab = TABS.find(t => t.id === view.tab) || TABS.find(t => t.id === "dashboard") || TABS[0];
  /* innerHTML below throws away every scroller inside <main>, and with it how
     far each one was scrolled. The rails (.plist on Parts, Work orders, Molds,
     Tickets) are the ones that hurt: ticking the ninth box in Select mode, or
     clicking a row forty rows down, re-rendered the rail at the top and then
     scrollIntoView dragged the row back up to sit on the bottom edge. Keyed by
     the listbox's aria-label so a rail restores only its own position, and
     only positions that were non-zero, so a fresh tab still starts at the top. */
  const kept = rememberRailScroll(el);
  // Person fields re-record their spec as the tab renders; see pfRestore.
  pfSnapshot(); PF_GEN++;
  el.innerHTML = guestBanner() + releaseBanner() + tab.render();
  restoreRailScroll(el, kept);
  maybeShowWhatsNew();
  labelListTables();
  // Release a GL context whose canvas this paint removed. See mvSweep.
  if (typeof mvSweep === "function") mvSweep();
  /* Timeline scrolls sideways along the season, and innerHTML above just reset
     that to zero — so without this every edit throws you back to the first
     week. Optional-function guard because tools/test_app.mjs loads the tab
     files in whatever order its FILES list gives, and because this is the only
     tab that has anything to restore. */
  if (typeof syncTimelineScroll === "function") syncTimelineScroll();
  if (typeof syncHoldTick === "function") syncHoldTick();
  /* Arriving at a work order from a lineage bar, the Dashboard or a scanned
     label goes through openRecord(), which never calls selectWO() — so without
     this the rail renders with the selected row well below the fold. Same
     optional-function guard as the two above, for the same reason. */
  if (typeof syncWORailScroll === "function") syncWORailScroll();
  if (typeof syncRdStrip === "function") syncRdStrip();
  if (typeof syncTicketRailScroll === "function") syncTicketRailScroll();
  syncChromeMetrics();
  pfRestore();
}

/* Publish the topbar's real height as --topbar-h.

   Everything sticky below the topbar has to clear it, and its height is not a
   constant anyone can write down: it grows by env(safe-area-inset-top) on a
   notched phone, and its content wraps differently by width and by role. The
   old hardcoded `top: 52px` / `top: 62px` were right for a MacBook and wrong
   for an iPhone, where the jumpbar, the parts rail and the undo bar all pinned
   underneath the bar they were supposed to sit below.

   Measured rather than computed, because the only honest source for "how tall
   did that actually come out" is the box the browser laid out. Guarded at every
   step: tools/test_app.mjs runs the whole app against a DOM stub that has no
   documentElement and no getBoundingClientRect, and a missing guard here is the
   same omission that once broke 19 tests in toggleDrawer(). */
function syncChromeMetrics() {
  const root = document.documentElement;
  if (!root || !root.style) return;
  const tb = document.getElementById("topbar");
  const box = tb && tb.getBoundingClientRect ? tb.getBoundingClientRect() : null;
  // An empty topbar is display:none and measures 0; leaving the previous value
  // in place beats pinning things to the top of the window on the login screen.
  if (!box || !(box.height > 0)) return;
  root.style.setProperty("--topbar-h", Math.round(box.height) + "px");

  /* Fold the account row into the ⋯ menu when it genuinely doesn't fit, rather
     than at a width someone guessed.

     A lead's topbar carries Backup + Restore + Roster + avatar + name +
     Sign out. Whether that fits depends on the width, on the
     role, on the name's length AND on the safe-area inset — a landscape iPhone
     spends 59px of its right edge on the island, which is enough to push Sign
     out off the screen at 932px even though the breakpoint says "desktop".
     A media query can read the width but not the inset, so no threshold can be
     correct here; measuring can.

     Measured in the EXPANDED state and only then collapsed, so this settles in
     one pass instead of oscillating: with the class on, the bar always fits. */
  const body = document.body;
  if (!body || !body.classList || tb.scrollWidth == null) return;
  body.classList.remove("tb-overflow");
  if (tb.scrollWidth > tb.clientWidth + 1) body.classList.add("tb-overflow");
}

// Copy each `table.list` header cell's text onto every body cell's data-label.
// The stacked-card mobile layout (index.html, <=640px) reveals these as row
// labels via a ::before; on desktop they're inert. Keeps the responsive table
// generic so no tab renderer has to emit data-label itself. The list tables all
// share the shape: first <tr> is <th> headers, matching <td> cells follow.
function labelListTables() {
  const main = document.getElementById("main");
  if (!main || !main.querySelectorAll) return;
  main.querySelectorAll("table.list").forEach(tbl => {
    const rows = tbl.rows;
    if (!rows || rows.length < 2) return;
    const headers = [...rows[0].cells].map(c => (c.textContent || "").trim());
    for (let i = 1; i < rows.length; i++) {
      [...rows[i].cells].forEach((cell, ci) => {
        if (headers[ci]) cell.setAttribute("data-label", headers[ci]);
      });
    }
  });
}

// ⌘K / Ctrl-K opens global search (only once signed in).
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    if (window.fb && fb.state === "ready") { e.preventDefault(); openSearch(); }
  }
  // Escape closes the mobile drawer (modal Escape is handled separately while a
  // modal is open, so this only fires for the drawer).
  if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeDrawer();
});

/* Re-measure the chrome when its height can have changed. Rotating a phone is
   the case that matters: portrait and landscape have different safe-area insets
   (the island moves from the top edge to a side one), so the topbar's height
   changes without a single re-render. */
if (typeof window !== "undefined" && window.addEventListener) {
  /* An unposted draft is the one piece of state in this app that exists only in
     this browser, so closing the tab is the one way to lose it for good. */
  window.addEventListener("beforeunload", (e) => {
    if (!draftsPending()) return;
    e.preventDefault();
    e.returnValue = "";       // required by Chrome to show its own wording
  });
  if (typeof rteInit === "function") rteInit();
  if (typeof installLightbox === "function") {
    const lb = document.createElement("div");
    lb.innerHTML = lightboxHtml();
    document.body.appendChild(lb.firstElementChild);
    installLightbox();
  }
  /* One delegated listener for both floating shells, rather than one per
     editor: a render() rebuilds #main wholesale, so anything bound to the
     editor node itself would have to be re-bound on every paint. */
  document.addEventListener("selectionchange", () => { if (typeof rteSyncBubble === "function") rteSyncBubble(); });
  document.addEventListener("mousedown", (e) => {
    if (typeof rteCloseInsert !== "function") return;
    if (!e.target.closest || !e.target.closest("#rte-insert, .rte-more")) rteCloseInsert();
  });
  window.addEventListener("resize", syncChromeMetrics);
  window.addEventListener("orientationchange", syncChromeMetrics);
}

/* ---------- lightbox ----------
   Comments carry photos of molds and parts, and the gallery deliberately makes
   them small so a thread stays readable. This is how you actually look at one.
   There was no lightbox, no zoom and no full-screen image anywhere in the app
   before this — the only way to see a photo full size was the <a download>
   wrapper, which navigated you out of the SPA and took any unposted draft with
   it.

   Opened by delegation on `.prose img`. That needs no class on the image, which
   matters because the sanitizer strips class deliberately — the scope class is
   on the container WE render. */
let LB_LIST = [], LB_I = 0, LB_RETURN = null;
/* What the arrows walk. A photo is attached to a RECORD, not to the one comment
   it happens to sit in, so "next" should mean the next photo on this ticket —
   the grid tile after this one, then the photo in the comment below it. Each
   detail page wraps its attachments and its thread in one [data-lbgroup], and
   that is the first scope tried; .cgal and .prose remain for a thread rendered
   outside one (a modal, a print preview).

   Two kinds of source live in a group: real <img> elements in comments and
   descriptions, and [data-lb-src] buttons in the attachment grids, whose image
   is a CSS background and therefore invisible to querySelectorAll("img"). One
   selector collects both, in document order, so the sequence matches what you
   can see on the page.

   Three exclusions, two of which predate this: an <img> inside a .rte is
   something you are still typing, and a data: URL is the 1x1 upload
   placeholder. The third is new and only matters now that a group is wider than
   one .prose block — every comment header carries a 26px avatar, and a face is
   not a photo of a part. */
const LB_SEL = "img, [data-lb-src]";
function lbSrcOf(el) { return el ? (el.getAttribute("data-lb-src") || el.src || "") : ""; }
function lbNameOf(el) {
  if (!el) return "";
  const given = el.getAttribute("data-lb-name") || el.alt || "";
  if (given) return given;
  const raw = String(lbSrcOf(el)).split("/").pop().split("?")[0];
  // decodeURIComponent throws on a bare % — and it is called before lbShow()
  // assigns the src, so an unescapable name would leave the previous photo on
  // screen rather than the one that was clicked.
  try { return decodeURIComponent(raw).slice(0, 80); } catch (e) { return raw.slice(0, 80); }
}
function lbCollect(scope) {
  const seen = new Set();
  return Array.from((scope || document).querySelectorAll(LB_SEL))
    .filter(el => {
      const src = lbSrcOf(el);
      if (!src || src.startsWith("data:")) return false;
      if (el.closest) {
        // #lightbox is a child of <body>, so the `document` fallback scope would
        // otherwise collect the viewer's OWN <img> — whose src survives a close —
        // and every set would carry a ghost frame of the last photo looked at.
        if (el.closest(".rte") || el.closest(".avatar") || el.closest("#lightbox")) return false;
      }
      // A work order shows the same photo on its step row and in the Photos
      // grid; without this the arrows would visit it twice and the count would
      // lie. First occurrence wins; openLightbox() maps a click on a later
      // duplicate back onto it by src.
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    });
}
/* Controls live in a BOTTOM bar now (the sanctioned 2026-08-02 fix): the top
   55px is the hardest place for a one-handed thumb, so the top bar keeps only
   the name and the count, and everything you press sits in the thumb zone
   above the home indicator. Same element ids — the UI suites find the
   controls by id. */
function lightboxHtml() {
  return `<div id="lightbox" role="dialog" aria-modal="true" aria-label="Photo">
    <div class="lb-scrim" onclick="closeLightbox()"></div>
    <div class="lb-bar">
      <span class="lb-name" id="lb-name"></span>
      <span id="lb-count" class="tny"></span>
    </div>
    <div class="lb-stage" onclick="if(event.target===this)closeLightbox()"><img id="lb-img" alt=""></div>
    <div class="lb-actions">
      <button id="lb-prev" title="Previous" aria-label="Previous photo" onclick="lbStep(-1)">${icon("chevronLeft", 18)}</button>
      <button id="lb-next" title="Next" aria-label="Next photo" onclick="lbStep(1)">${icon("chevronRight", 18)}</button>
      <a id="lb-dl" download target="_blank" rel="noopener" title="Download" aria-label="Download this photo" onclick="lbDownload(event)">${icon("download", 18)}</a>
      <button id="lb-close" title="Close" aria-label="Close" onclick="closeLightbox()">${icon("x", 18)}</button>
    </div>
  </div>`;
}
function openLightbox(img) {
  const box = document.getElementById("lightbox");
  if (!box || !img) return;
  // The whole record first, then a .cgal run, then the one comment.
  const scope = (img.closest && (img.closest("[data-lbgroup]") || img.closest(".cgal") || img.closest(".prose"))) || document;
  LB_LIST = lbCollect(scope);
  let at = LB_LIST.indexOf(img);
  // A click on a deduped duplicate (same photo on the step row and in the
  // Photos grid) maps back onto the kept copy by src.
  if (at < 0) { const src = lbSrcOf(img); if (src) at = LB_LIST.findIndex(el => lbSrcOf(el) === src); }
  // Still not in the list means it was filtered out — a src-less <img> left
  // behind when the sanitizer dropped an upload placeholder, say. Opening
  // "photo 0" instead would show an unrelated photo from elsewhere on the
  // record, which is worse than doing nothing.
  if (at < 0) return;
  LB_I = at;
  LB_RETURN = img;
  box.classList.add("open");
  // inert on the rest is one attribute and does the whole focus-trap job. The
  // app's own modal has no trap at all, so this is strictly better than the
  // existing standard rather than a new burden.
  ["app", "modal"].forEach(id => { const n = document.getElementById(id); if (n) n.inert = true; });
  lbShow();
  const c = document.getElementById("lb-close"); if (c) c.focus();
}
function lbShow() {
  const im = document.getElementById("lb-img"), src = LB_LIST[LB_I];
  if (!im || !src) return;
  const url = lbSrcOf(src), label = lbNameOf(src);
  im.src = url; im.alt = label;
  const name = document.getElementById("lb-name");
  if (name) name.textContent = label;
  // The filename, not just the href: a Firebase Storage URL saved without this
  // lands in Downloads as a token with no extension.
  const dl = document.getElementById("lb-dl");
  if (dl) { dl.href = url; dl.setAttribute("download", label || "photo"); }
  const cnt = document.getElementById("lb-count");
  if (cnt) cnt.textContent = LB_LIST.length > 1 ? `${LB_I + 1} / ${LB_LIST.length}` : "";
  ["lb-prev", "lb-next"].forEach(id => { const b = document.getElementById(id); if (b) b.hidden = LB_LIST.length < 2; });
  // Every photo starts at fit. Arrows and keys come through here too, so
  // stepping while zoomed lands the next photo un-zoomed, never mid-pan.
  lbResetZoom();
}
function lbStep(d) { if (!LB_LIST.length) return; LB_I = (LB_I + d + LB_LIST.length) % LB_LIST.length; lbShow(); }

/* Actually download it. The `download` attribute is IGNORED on a cross-origin
   href, and every photo here is on firebasestorage.googleapis.com while the app
   is on feb-composites.web.app — so the plain anchor did not download at all.
   It navigated the tab to the raw file (Storage serves content-disposition:
   inline), which is the exact "left the app and took the unposted draft with
   it" failure the viewer exists to remove.

   Fetch to a blob and save that instead, which is also the only way the real
   filename survives. cors.json already allows GET from the app's origins for
   the Stock tab's mesh fetch, so nothing new is needed there. If the fetch
   fails anyway, fall through to the anchor's own target="_blank" — a new tab is
   a poor download but it is not a lost draft. */
async function lbDownload(e) {
  const src = LB_LIST[LB_I];
  if (!src) return;
  // Synchronously, before any await: a preventDefault after the fetch resolves
  // is too late, the navigation has already happened.
  if (e && e.preventDefault) e.preventDefault();
  const url = lbSrcOf(src), name = lbNameOf(src) || "photo";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    downloadBlob(name, await res.blob());
  } catch (err) {
    // A new tab is a poor download, but it is not a lost draft.
    if (typeof window !== "undefined" && window.open) window.open(url, "_blank", "noopener");
  }
}

/* Swipe is an ACCELERATOR, never the only way through. The arrows stay on
   screen whenever there is more than one photo, because this app's own rule —
   set where the selection bubble is hidden on touch, and again on .tl-del — is
   that a touch affordance is either visible or has an equally capable visible
   twin. An invisible gesture as the only path is the thing that rule forbids.

   Pure decision, same shape and the same 60px / |dy|<|dx| thresholds as
   shouldOpenDrawerFromSwipe, so gestures behave consistently across the app and
   this is testable without a TouchEvent. Returns -1, +1 or 0.

   `zoomed` comes from the viewer's own transform state (lbZoomed): once
   someone has zoomed in, dragging sideways means "pan this photo", not
   "next photo" — the pan itself is handled by the stage's touchmove. */
function lbSwipeStep(startX, startY, endX, endY, zoomed) {
  if (zoomed) return 0;
  const dx = endX - startX, dy = endY - startY;
  if (Math.abs(dx) < 60) return 0;
  if (Math.abs(dy) > Math.abs(dx)) return 0;
  return dx < 0 ? 1 : -1;                       // drag left = go forward
}
/* ---------- in-image zoom ----------
   The viewer owns the gesture now: pinch scales the photo, double-tap (or
   desktop double-click) toggles fit and 2x, and a one-finger drag pans while
   zoomed. State is one transform on #lb-img, so "zoomed" is a fact the code
   holds rather than a visualViewport heuristic. Pure helpers, so the math is
   testable in the node harness without a TouchEvent. */
let LB_Z = { scale: 1, tx: 0, ty: 0 };
let LB_PINCH = null;   // { d0, s0 } while two fingers are down
let LB_PAN = null;     // { x, y, tx, ty } while dragging zoomed
let LB_TAP = null;     // { t, x, y } last touchend, for the double-tap
function lbZoomNext(scale) { return scale > 1.01 ? 1 : 2; }
function lbPinchScale(d0, d1, s0) { return Math.min(4, Math.max(1, s0 * (d1 / Math.max(1, d0)))); }
/* The photo may move at most half its scaled overflow each way, so some of
   it is always on stage — a photo panned fully off screen with no way back
   is the failure this clamp exists for. */
function lbClampPan(scale, tx, ty, w, h) {
  const mx = Math.max(0, (scale - 1) * (w || 0) / 2), my = Math.max(0, (scale - 1) * (h || 0) / 2);
  return { tx: Math.min(mx, Math.max(-mx, tx)), ty: Math.min(my, Math.max(-my, ty)) };
}
function lbApplyZoom() {
  const im = document.getElementById("lb-img");
  if (im && im.style) im.style.transform = LB_Z.scale > 1.01 ? `translate(${LB_Z.tx}px, ${LB_Z.ty}px) scale(${LB_Z.scale})` : "";
}
function lbResetZoom() { LB_Z = { scale: 1, tx: 0, ty: 0 }; LB_PINCH = null; LB_PAN = null; lbApplyZoom(); }
function lbToggleZoom() { LB_Z = { scale: lbZoomNext(LB_Z.scale), tx: 0, ty: 0 }; lbApplyZoom(); }
function lbZoomed() { return LB_Z.scale > 1.01; }
function lbSwipeEnd(start, t) {
  if (LB_LIST.length < 2) return;
  const d = lbSwipeStep(start.x, start.y, t.clientX, t.clientY, lbZoomed());
  if (d) lbStep(d);
}
function closeLightbox() {
  const box = document.getElementById("lightbox");
  if (!box || !box.classList.contains("open")) return;
  box.classList.remove("open");
  // Drop the src as well as the class. The viewer's own <img> is a child of
  // <body>, so a scope that falls back to `document` would otherwise find it
  // and carry the last photo looked at into an unrelated set.
  const im = document.getElementById("lb-img"); if (im) { im.removeAttribute("src"); im.alt = ""; }
  ["app", "modal"].forEach(id => { const n = document.getElementById(id); if (n) n.inert = false; });
  if (LB_RETURN && LB_RETURN.focus) LB_RETURN.focus();
  LB_RETURN = null; LB_LIST = [];
  lbResetZoom();
}
function lightboxOpen() { const b = document.getElementById("lightbox"); return !!(b && b.classList.contains("open")); }
function installLightbox() {
  if (typeof document.addEventListener !== "function") return;
  document.addEventListener("click", (e) => {
    if (!e.target || !e.target.closest) return;
    // A photo in prose, or an attachment tile whose image is a CSS background.
    let img = e.target.closest(".prose img, [data-lb-src]");
    /* closest() walks ancestors, and imgAttachHtml wraps every photo in an
       <a href>. Activating that link from the KEYBOARD dispatches a click whose
       target is the anchor, which has no img above it — so Enter on a gallery
       photo used to miss this handler entirely and follow the raw Storage URL
       out of the app. Every .cgal photo is a tab stop, so that was every photo. */
    if (!img) {
      const link = e.target.closest(".prose a[href]");
      const inner = link && link.querySelector("img");
      if (inner) img = inner;
    }
    if (!img || img.closest(".rte")) return;      // not while you are editing
    if (img.closest(".avatar")) return;           // a face is not an attachment
    if (!lbSrcOf(img)) return;                    // a broken <img> is not a photo
    // Without this the click navigates away to a raw file URL.
    const a = img.closest("a[href]");
    if (a) e.preventDefault();
    openLightbox(img);
  });
  /* CAPTURE phase, so this beats escClose — otherwise Escape over a lightbox
     opened from a comment inside a modal closes both. */
  document.addEventListener("keydown", (e) => {
    if (!lightboxOpen()) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); closeLightbox(); }
    else if (e.key === "ArrowRight") lbStep(1);
    else if (e.key === "ArrowLeft") lbStep(-1);
  }, true);

  /* Zoom gestures, on the stage only. touchmove is non-passive because a
     pinch or a zoomed pan must preventDefault or the browser scrolls and
     page-zooms underneath the transform. The unzoomed swipe-to-navigate
     still rides the global touch router; while zoomed, lbZoomed() makes it
     stand down and the drag pans instead. */
  const stage = document.querySelector("#lightbox .lb-stage");
  if (stage && stage.addEventListener) {
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    stage.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) { LB_PINCH = { d0: dist(e.touches), s0: LB_Z.scale }; LB_PAN = null; }
      else if (e.touches.length === 1 && lbZoomed()) {
        LB_PAN = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: LB_Z.tx, ty: LB_Z.ty };
      }
    }, { passive: true });
    stage.addEventListener("touchmove", (e) => {
      const im = document.getElementById("lb-img");
      if (LB_PINCH && e.touches.length === 2) {
        e.preventDefault();
        LB_Z.scale = lbPinchScale(LB_PINCH.d0, dist(e.touches), LB_PINCH.s0);
        const c = lbClampPan(LB_Z.scale, LB_Z.tx, LB_Z.ty, im && im.clientWidth, im && im.clientHeight);
        LB_Z.tx = c.tx; LB_Z.ty = c.ty;
        lbApplyZoom();
      } else if (LB_PAN && e.touches.length === 1) {
        e.preventDefault();
        const c = lbClampPan(LB_Z.scale,
          LB_PAN.tx + e.touches[0].clientX - LB_PAN.x,
          LB_PAN.ty + e.touches[0].clientY - LB_PAN.y,
          im && im.clientWidth, im && im.clientHeight);
        LB_Z.tx = c.tx; LB_Z.ty = c.ty;
        lbApplyZoom();
      }
    }, { passive: false });
    stage.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) LB_PINCH = null;
      if (!e.touches.length) LB_PAN = null;
      // Double-tap: two touchends inside 300 ms and 30 px toggle fit / 2x.
      if (!e.touches.length && e.changedTouches && e.changedTouches.length === 1) {
        const t = e.changedTouches[0], now = Date.now();
        if (LB_TAP && now - LB_TAP.t < 300 && Math.hypot(t.clientX - LB_TAP.x, t.clientY - LB_TAP.y) < 30) {
          lbToggleZoom(); LB_TAP = null;
        } else LB_TAP = { t: now, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    stage.addEventListener("dblclick", (e) => {
      if (e.target && e.target.id === "lb-img") lbToggleZoom();
    });
  }
}
