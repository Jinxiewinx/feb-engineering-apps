"use strict";
/* tracker.js — the Google Sheet mirror feed.

   The team runs its season off the Composites Master Tracker in Drive, and the
   app holds the same part data in a richer form. Until now the two had no
   connection, so adopting the app meant either abandoning the sheet everyone
   already watches or typing everything twice. This publishes the Parts tab as
   ONE public snapshot document that a bound Apps Script inside that
   spreadsheet pulls every 15 minutes and writes into the Part Tracker tab.

   WHY THE APP PUSHES A DOCUMENT INSTEAD OF WRITING THE SHEET DIRECTLY.
   There is no server here: hosting is static, there are no Cloud Functions, no
   service account and nowhere to run a timer. And gdocs.js records a standing
   decision that the app gains no Google OAuth, because the app's auth is
   email/password and a consent screen would sit in front of all ~15 members.
   So the periodic job has to live inside the spreadsheet, which means the
   spreadsheet pulls and this file publishes something it can pull with no
   credentials at all:

     GET https://firestore.googleapis.com/v1/projects/feb-composites/
         databases/(default)/documents/tracker/<token>

   Verified against the live project: an unauthenticated REST GET is evaluated
   as request.auth == null and run through firestore.rules, so `allow get: if
   true` answers it with no API key and no OAuth, while /parts answers 403.

   WHY NOT REUSE /pub. The pub mirror is the right shape and the wrong
   contents, and pubProjection() in labels.js says so out loud: "Never add: any
   human name or email ... or unbounded free text like comments." Three tracker
   columns are exactly that — Mold Engineer, Manufacturing Engineer and Extra
   Comments. /pub also denies `list` on purpose so nobody can dump it and learn
   the season's part list, and a full part list is precisely what this feature
   exists to publish. Bolting this onto /pub would break both the doctrine and
   the hasOnly() whitelist that enforces it.

   SO THE SECRET IS THE DOCUMENT ID, and that is what buys the extra columns.
   tracker/<token> allows public `get` and denies `list` to everyone, including
   signed-in members, so the URL is the whole capability — the same trust model
   this repo already applies to the Slack webhook in config/slack, and the
   reason the token lives in config/tracker rather than in this public source
   file. A guessable id would have forced dropping comments and shortening
   names to first-initial; a capability URL does not.

   It is still a weaker wall than the roster. Whoever holds the URL holds the
   season's part list, the engineers' names and the comment text. Treat it the
   way you would treat the webhook. */

/* Only what the Part Tracker tab actually shows. Adding a field here publishes
   it to a URL that needs no login, so this list is a security boundary and not
   a convenience: keep it to columns that exist in the sheet.

   Never add: commentLog, layupStack, any email, any firebasestorage.googleapis
   URL (a download URL is a bearer credential), anything from budget. */
const TRACKER_FIELDS = [
  "id", "partName", "subteam", "layupType", "layupSchedule", "moldLocation",
  "moldEngineer", "manufacturingEngineer", "cadProgress", "moldProgress",
  "layupProgress", "weightG", "layupDeadline", "comments",
];

/* Firestore's hard cap is 1 MiB per document, but that is NOT the binding
   limit and getting this wrong is how the feature breaks in March rather than
   today. The real ceilings are on indexing: 7.5 KiB per index entry and 20,000
   index entries per document. One giant concatenated payload string would blow
   the first; an array of 200 maps would create thousands of entries and be
   fragile as the season grows. An array of one compact JSON STRING per part
   clears both — a few hundred small entries, none close to 7.5 KiB — and as a
   bonus the Apps Script decodes it with a single JSON.parse instead of walking
   Firestore's value-typed {mapValue:{fields:{...:{stringValue}}}} envelope. */
const TRACKER_MAX_BYTES = 800 * 1024;

/* How long a burst of edits is allowed to settle before one write goes out.
   Every field edit in parts.js is its own updateDoc, so tabbing through a
   record fires a dozen saves; without this each one would republish the whole
   snapshot. */
const TRACKER_DEBOUNCE_MS = 4000;

/* One row, built field by field.

   Explicit loop, never a spread: a spread is how a whole record leaks onto a
   public URL. Same reasoning as pubProjection() in labels.js.

   Retro records are the SN5 archive. They are real parts of a finished season
   and they belong in the app, but the live tracker is this season's board and
   the workbook already keeps last season on its own reference tab. Publishing
   them would append 33 dead rows to Nick's sheet on the first run.

   R&D parts are excluded for the same reason and by the same predicate: the
   sheet mirrors the Season tab, and a coupon is not a deliverable. Note the one
   cost, which is real — Sync.gs matches rows on Part Name and tints anything it
   no longer recognises amber, so an R&D part that was already in the sheet
   becomes an orphan row and stays amber until somebody deletes it by hand. That
   was chosen over the alternative, which was widening TRACKER_FIELDS (a
   disclosure decision, see above) and hand-inserting a column in Nick's live
   workbook. */
function trackerRow(p) {
  if (!p || !p.id || !inSeason(p)) return null;
  const r = {};
  // Stringify everything: the sheet is text, and a null reaching the Apps
  // Script's JSON.parse would land in a cell as the literal "null".
  for (const f of TRACKER_FIELDS) r[f] = p[f] == null ? "" : String(p[f]);
  // The sheet has ONE "Weight (g)" column. The measured weight is the
  // interesting number once it exists; the target is what to show until then.
  r.weightG = String(p.weightActualG || p.weightG || "");
  // The person's current name, never an email: a linked engineer renamed on
  // the roster should read the new name in the sheet too.
  if (typeof personText === "function") for (const k of ENG_KEYS) r[k] = personText(p, k);
  return r;
}

function trackerRows() {
  return ((typeof DB === "object" && DB.parts) || [])
    .map(trackerRow).filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* The document, exactly as firestore.rules' hasOnly() expects it.

   updatedAt is a plain ISO string and deliberately NOT serverTimestamp(): the
   rule would still pass, but it would come back over REST as a timestampValue
   and the entire point is a string the Apps Script can print into the sheet's
   staleness cell without decoding anything. */
function trackerSnapshot() {
  const rows = trackerRows();
  return {
    rows: rows.map(r => JSON.stringify(r)),
    count: rows.length,
    updatedAt: new Date().toISOString(),
  };
}

/* The token, read once and cached. `undefined` means "not looked up yet";
   `null` means "looked up, not configured" — the normal state until a lead
   runs the setup, and it must not re-query on every keystroke. A failed lookup
   resets to undefined so a network blip retries rather than disabling the feed
   for the rest of the session. */
let trackerTokenCache;
async function trackerToken() {
  if (trackerTokenCache !== undefined) return trackerTokenCache;
  try {
    const c = await fb.getConfig("tracker");
    trackerTokenCache = (c && c.token) || null;
  } catch (e) {
    trackerTokenCache = undefined;
    return null;
  }
  return trackerTokenCache;
}

/* 32 hex chars from the CSPRNG. Long enough that the URL is not guessable,
   short enough to paste into a script header without wrapping. */
function trackerNewToken() {
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

/* Publish now. Returns the row count written, or -1 if it did nothing.

   A feed failure must never surface as a save failure — the record itself
   saved fine, and toasting "save failed" over a stale spreadsheet is worse
   than the stale spreadsheet. Same rule as pubWarn() in fb.js. */
async function trackerPublish() {
  const token = await trackerToken();
  if (!token) return -1;                       // not configured; nothing to do
  const snap = trackerSnapshot();
  const bytes = JSON.stringify(snap).length;
  if (bytes > TRACKER_MAX_BYTES) {
    console.warn(`tracker feed not published: ${bytes} bytes exceeds the ${TRACKER_MAX_BYTES} ceiling.`);
    return -1;
  }
  await fb.publishTracker(token, snap);
  return snap.count;
}

/* The full feed URL for a token — what gets pasted into the Apps Script. */
function trackerFeedUrl(token) {
  return "https://firestore.googleapis.com/v1/projects/feb-composites"
       + "/databases/(default)/documents/tracker/" + token;
}

/* Lead-only: mint the token on first run, publish the snapshot, and hand back
   the URL for the Apps Script.

   Safe to run again at any time. It re-uses the existing token rather than
   minting a new one, because rotating it silently would leave the installed
   trigger fetching a dead URL and the spreadsheet quietly frozen on last
   week's data. Rotation is a deliberate act: delete config/tracker first. */
async function setupTrackerFeed() {
  if (!isLead()) return;

  let token = await trackerToken();
  const fresh = !token;
  if (fresh) {
    const ok = await confirmAsync(
      "Publish the season's part list as a Google Sheet feed?\n\n" +
      "This creates one document that anyone holding its secret URL can read " +
      "without signing in — the part names, subteams, stages, engineers, " +
      "deadlines and comments shown on the tracker. The URL is the only thing " +
      "protecting it, so treat it like the Slack webhook: paste it into the " +
      "spreadsheet's Apps Script and nowhere else.",
      { ok: "Create feed", danger: false });
    if (!ok) return;
    token = trackerNewToken();
    await fb.setConfig("tracker", { token });
    trackerTokenCache = token;
  }

  try {
    const n = await trackerPublish();
    if (n < 0) { toast("Feed not published — see the console.", "error"); return; }
    const url = trackerFeedUrl(token);
    console.log("Tracker feed URL (paste into Apps Script):\n" + url);
    try { await navigator.clipboard.writeText(url); } catch (e) { /* no clipboard permission */ }
    toast(`${n} part${n === 1 ? "" : "s"} published. Feed URL copied to the clipboard (also logged to the console).`);
  } catch (e) {
    toast("Couldn't publish: " + ((e && e.message) || e), "error");
  }
}

let trackerTimer = null;
/* Called from fb.save() and fb.del() whenever a part changes.

   Deletes matter as much as edits: this is a whole-table snapshot, so a part
   removed in the app only disappears from the sheet when the snapshot is
   rewritten without it.

   This is self-healing in a way the per-record /pub mirror is not. A pub
   nameplate that failed to write is only repaired by a later save of that same
   record, which is why reports.js has a rebuild button. Here the aggregate is
   rewritten wholesale, so the next successful save of ANY part repairs the
   entire feed. */
function trackerQueue() {
  if (trackerTimer) clearTimeout(trackerTimer);
  trackerTimer = setTimeout(() => {
    trackerTimer = null;
    trackerPublish().catch(e =>
      console.warn("tracker feed not updated (the record itself saved fine):", (e && e.message) || e));
  }, TRACKER_DEBOUNCE_MS);
}
