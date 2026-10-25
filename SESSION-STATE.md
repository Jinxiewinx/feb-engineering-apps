# Session state

Rolling handoff. If a session got cut off, read this first. Update it as work
proceeds, not just when stopping.

**This file has a budget: 400 lines.** It holds durable state only — what is
unshipped, what is broken, what must not be undone, what is next. It is not a
transcript and not a changelog; `git log` is both of those. Before adding
anything, read `.claude/SESSION-STATE-POLICY.md`: it holds the five-part keep
test and the per-section caps, and it exists because this file once reached
3,183 lines and nobody could find anything in it.

Everything dropped in a cleanup is recoverable:

```bash
git log -p --follow -- SESSION-STATE.md
```

---

## Now

**Paul in Slack (2026-10-24), deployed 2026-10-25, not yet tried in Slack.** Plan:
`~/.claude/plans/i-d-like-to-expand-atomic-marshmallow.md`. Tag @Paul in a
thread and he answers there (the @grok idea). `runAgent()` now holds the loop
askPaul and slackPaul share; `slackEvents` (signed HTTP, writes
`slackJobs/{event_id}`) and `slackPaul` (Firestore trigger, does the work).
test_functions 229/229; emulator checked signature, challenge, retry dedupe.
- Slack app created by Simon, both secrets set, functions deployed from
  1202ab0 (slackEvents + slackPaul ACTIVE; live URL answers 405 to GET and
  401 to an unsigned POST). Left: Event Subscriptions "Retry" to verify the
  URL, `/invite @Paul`, first real mention. Check `firebase functions:log
  --only slackPaul` for `slackPaul: ok` or `slackPaul fail:` lines.
- Every functions deploy now needs SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET
  (they exist).
- Not yet tried live: a real thread, Steve via "@Paul steve", a DM, the
  roster refusal. Phase 2 idea: read images in the thread (files:read).
- Re-run tools/eval_askpaul.js after the refactor (signed-in browser).
- 2026-10-25: Paul is open to everyone (Simon: "no difference when talking
  to Paul regardless if you are on the roster"). `requireAsker()` makes a
  non-member a guest keyed on uid (app) or Slack id; same tools, no saved
  chats/notes; app guests share `guestPool` 300/day. Client: `paulOn()`
  shows Paul to guests, `READ_ONLY_CALLS` in fb.js lets only askPaul past
  `noWrites()`. Guests can't read config/ai, so they get the cartoon, not
  the lead-set picture.
- 2026-10-25: Paul (askPaul, slackPaul) on Sonnet 5.5 (`PAUL_MODEL`), Steve
  and the rest stay Haiku. Per-model `PRICES` in recordSpend (Sonnet 20x
  Haiku); automatic prompt caching on Paul's loop; a Sonnet refusal retries
  once on Haiku; rescue call uses low effort (Sonnet 400s on thinking
  disabled); paulCompact drops thinking blocks after its first stubbed
  result (Sonnet's history-editing check). guestPool cut 300 -> 60/day.
  SLACK_NOTE is verdict-first with a ~600-char budget (grok-style.md item
  1). NOT yet run: tools/eval_askpaul.js (33 cases, bar 29), now including
  six `style:"slack"` cases. Needs a signed-in browser.

**Documentation overhaul (2026-10-10), promoted.** Plan, register,
audits, reviews: `02 CS Standards/overhaul/`. House style:
`02 CS Standards/STYLE.md`. Markdown is canonical; Google Docs retired.
src/ holds CS-000..014 (CS-014 new), CS-INDEX Rev H, QR-001..015; all
"Draft, pending Lead signature". v6.9.0 ships them to members.
- v6.9.0 live (hosting, verified) and functions deployed 2026-10-10
  (askPaul revision 00012, ACTIVE): Paul has the new corpus, quick refs and
  search fixes; Steve has his notes tool, records-only tools and filters.
- NOT yet run: tools/eval_askpaul.js (27 cases, bar 24) and
  tools/eval_steve.js (12 cases) in a signed-in browser. Claude cannot sign
  in, so this is Simon's or a lead's.
- Open for a lead: REGISTER.md last section (CS-011 §6 proposal,
  back-face engraving, label timing, DP420 no-load hold, NICK TO CONFIRM
  marks in CS-006, and more).
- 04 Printables cards predate the overhaul (banner says so; only the IN2
  demould hold was corrected). Rebuild from the quick references.

**Paul round 3 (2026-10-10).** Plan: `~/.claude/plans/i-have-paul-tested-misty-otter.md`.
v6.6.2: the "isn't available" fix (empty forced last round on long
questions; now 6 rounds + 75s budget + fresh rescue call, readable errors,
Try again, refund on failure, `askPaul fail:` log line). v6.7.0: chats saved
in `paulUsers/{email}/chats/{id}` (owner-only rules; lead can't read; server
appends, client can only read/rename/delete), personal context block,
`paulRemember` Firestore trigger keeping <=20 notes, `search_my_chats` tool,
"Hi, I'm Paul, from Easy Composites!" intro with the guardrail kept.
- **Steve (v6.8.0, 2026-10-10):** second agent "from Fibreglast", always
  wrong, upsells from `functions/steve_catalog.json` (Shopify snapshot via
  `tools/build_steve_catalog.mjs`). Same askPaul callable, `agent:"steve"`;
  `steveGuard` replaces any sentence with a number+unit; client labels every
  answer and offers Ask Paul instead. Steve's chats skip `paulRemember`.
  Not yet run: `tools/eval_steve.js` live (bar 5/6).
- Not yet run: `tools/eval_askpaul.js` in the live app after the PAUL_SYSTEM
  rewrite (needs a signed-in session; 17 cases now, two for the intro).
- Not yet tried live: a real long question on the iPhone, the stream-drop
  recovery, and the first `paulRemember` run (watch its log line).

**AI round 2 shipped as v6.4.0 (2026-10-09).** Plan:
`~/.claude/plans/now-that-there-is-cozy-sloth.md`. Live and verified:
Ask Paul (topbar bubble; `askPaul` + `functions/context.js` + `corpus.json`,
Haiku 5.5 medium, eval 14/15 then the miss fixed), ✨ packing slip (receiving
desk), ✨ read label (lot page, `expirySource` "vendor label (AI read)"), the
lead's AI switch with month spend, per-job caps, $80/month ceiling. Real cost
so far: $0.03 for the whole day of testing; Paul ~$0.0015 a question.
- Not yet tried on a REAL slip or jug photo, only synthetic ones.
- Re-run `tools/eval_askpaul.js` in the live app after any change to
  PAUL_SYSTEM or the tools. After adding/changing a document:
  `build_ai_corpus.mjs`, commit, deploy functions (release.mjs refuses a
  stale corpus but does not deploy functions).
- "Announce this release" (lead press) not done for 6.3.x or 6.4.0.
- **v6.5.0 live (2026-10-09):** Paul as a docked chat (phone sheet + return
  button), live steps + thinking streamed (`res.sendChunk` / `fb.callStream`),
  record awareness, ⌘K row, 100/day; the ✨ job bar (`aiJob*`); lead-set
  Paul picture (⋯, Storage `paul/`, NEVER commit his photo: repo is public);
  Paul open rails the sidebar at 900-1400px. Picture not uploaded yet (a
  lead's job).
- **v6.6.0 (2026-10-09):** Paul sees the whole app (shelved projects out,
  R&D parts/runs in, people, resins with team holds, materials, restock,
  season, budget goals, `app_overview`) and searches the web (labelled,
  sources listed; falls back to sites named in the prose when Haiku attaches
  no citations; log line "askPaul web: pages= citations= kept=").

**Receipts on Claude Haiku 5.5, shipped as v6.3.0 (2026-10-09); v6.3.1 adds an Other files box per purchase.** Plan:
`~/.claude/plans/now-that-there-is-cozy-sloth.md`. `parseReceipt` is live on
Node 22 with secret version 2 (version 1 was a 31-char non-key and 401'd; a
deploy pins the secret version, so a new key needs a functions redeploy).
Verified live with a synthetic McMaster receipt: five lines, vendor and total
all right, 1306 in / 219 out tokens. Not yet tried on a real phone photo or a
real PDF invoice. "Announce this release" is a lead's press and not done.
firebase-functions is still ^6; the CLI nags for a major upgrade, not needed
yet. Phase 2 (packing slip → receiving, jug label → lot fields, matKey
suggestions) is in the plan and not started.

**Guardrail mods (2026-10-06).** `feb-guard` and `feb-deploy-verify` in
`.claude/skills/` (README, "Claude Code guardrails"). Unit tests pass; the
pushed-tree check and the live fetch have not yet run against a real deploy,
so watch the first one.

**Person fields (2026-09-24), shipped as v6.2.0.**
Plan: `~/.claude/plans/for-the-composites-app-tender-wave.md`. Typed "who"
fields are roster picks stored as `<key>` + `<key>Email` (email / `ext` /
unset). Picker is variant B (chip + popover), chosen by ui-reviewer over A
(inline combobox, lost on typo+Enter writing junk); A's branch
`worktree-agent-a9045248d93b53197` is kept locally, unmerged, worktree removed. People › Unlinked has
NOT been run on live data: that is a mass write and waits on Simon. Resin
built-in RESINS rows still carry febBy text only (no email), on purpose.

**`test_safearea` is red on purpose.** At landscape-max two step-action buttons
on `wo-detail` sit past the safe area (x=873; the second reaches 945). The test
is right, the CSS is not; fixing it needs Simon.

**`tools/test_drawings.mjs` has three pre-existing failures** (cutlist,
cutcrowd, cutbatch) from the visual audit, unrelated to anything current.

**The Fusion add-in is barely exercised.** One member's 2026-09-07 install is
the only run on real hardware; the Windows installer has never been run at all,
and nobody has DOUBLE-CLICKED the Mac installer from a browser download —
launching from a shell bypasses Gatekeeper, so the "Open Anyway" walkthrough in
`INSTALL.txt` is written from Apple's documented behaviour rather than from
watching it. Both are labelled untested there. No bottom face has been picked in
the real Fusion command dialog, and the add-in has never run against a
monolithic block plan. STK-SN6-014 predates the `applyMargin` half-inch snap and
needs a re-plan to line up.

**The three placeholder collections in `firestore.rules`** still wait on Simon's
talk with the team.

**The S4/S5 spike add-ins are still installed** beside FEBPlanStock on Simon's
Mac (`S4PaletteBridge`, `S5RestSignin`). Delete when no longer wanted.

---

## Open questions for Simon

**Two need a real device.** (1) Tab through the Budget grid by hand: a synthetic
Tab does no focus traversal, so a regression and a harness artifact are
indistinguishable. (2) Does the wide-table scrollbar show on iOS? Headless
Chromium's overlay one takes no space, so if it is invisible a wide table has no
scroll cue — and an edge fade cannot stand in, because header tint and zebra
rows paint over it.

**Three presses only a lead can make**, also in `HANDOFF.md`: `⋯ → Announce this
release`; **Tracker feed** on Reports (the feed URL 404s until it is pressed);
and `Sync.gs` into the spreadsheet's Apps Script with its trigger.

**The split waiver measures stack HEIGHT; the real limit is plunge DEPTH.** Left
open on purpose: collet collision and gantry height also bind, so depth from the
mesh would answer a third of the question while reading as if it answered all
of it.

---

## Next up (not started)

- Decide the app-only CSS families (Receiving, Export, Storage map, Search
  results, `table.sub`): lift into `components.css` or drop from
  `conventions.md`, which marks them app-only meanwhile.
- Port the traveler to the offline single-file `work-orders.html`, which still
  has the old print CSS.
- `04 Printables/printables.html` is open to redesign; no house style.
- Per-record history/audit trail (Phase 5 of the inventory plan), deferred.
- **Link materials** on the Materials list, signed in, to backfill the 50
  imported containers.
- The **EH&S import** (lead sign-in; `~/Downloads/Chemical Export Aug 28
  2026.xlsx`), nothing imported into production yet.
- **The one label test that needs the printer in hand**: whether iOS lets a
  custom page length through on continuous stock. If it forces a fixed size,
  switch the default media to `dk1201` (die-cut, already built). Test from the
  shop PC first to isolate the question to iOS.

---

## Constraints — don't relitigate

Each cost something to learn and would be easy to undo by accident. **Anything
that needed more than about sixty words to say is not here — it is prose, and it
lives in a maintained doc.** See `06 Composites App/app/DESIGN-NOTES.md` first,
then that folder's `README.md` and `SHELVED.md`, `tools/README.md`,
`07 CFD PDF Viewer/README.md`, `10 Fusion Add-in/README.md`, `SETUP.md`,
`HANDOFF.md` and `.design-sync/NOTES.md`.

### Molds, stock and techniques

**The cut list is Designed-only and HARD.** Walking a mold's stage back is the
only override, deliberately, because it leaves a trail. The commit advances the
mold to "Tooling cut"; do not remove that without removing the filter, or people
stop marking molds cut.

**`MIN_REMNANT_MM` answers "what counts as recovered value when choosing a
split"**, not "is this worth keeping". `leftover` and `scrap` partition the
offcuts and only `leftover` is scored, so moving that line changes which boards
get opened for a whole batch.

**A technique's steps are copied into a work order at creation, never
retro-fit.** `templateVersion` lets a run know it is behind, and it is also what
turns off BLOCKER_WORDS title matching — which still enforces on every record
predating it, including the 26 retro SN5 runs.

**A part's molds are `p.molds[]`; `p.mold` is read-only legacy.** No mirror: two
fields holding one fact, maintained by convention across separate writers, is
the shape `woIsRnd` derives to avoid. `partMold()` still answers with one.

### Data model and rules

**The Firebase `apiKey` in `firebase-config.js` is public web config by design.**
The repo is public, Simon's call, scanned clean. Security lives in
`firestore.rules`, not in hiding that key — and unauthenticated REST honours
them, which is why the sheet sync needs no server or service account.

**The tracker snapshot stores one compact JSON *string* per part.** The binding
constraint is Firestore index entries (7.5 KiB each, 20,000 per document), not
the 1 MiB document limit. An array of maps would blow the entry count.

**Guest mode is on and the app is publicly readable.** Anonymous sign-in; anyone
with the URL reads everything including the team emails stamped on records,
accepted deliberately. Turning it off is the same Auth switch. Guest read costs
eleven full-collection snapshots per visitor.

**CS-011 §6 still forbids resin and hardener co-storage on purpose** while the
app's warning was removed code-only. Simon revises the standard himself at
Rev D; never edit it from a session.

### Deploying

**Rules deploy alone and FIRST, then hosting.** An old client under new rules is
fine; a new client under old rules fails every allocation. `--only hosting` must
stay meaning only hosting. Verify off the live host — "Deploy complete" is not
a check.

**The rules suites target the DEMO project.** They need Java and the firebase
CLI but no login and no network, so a fresh machine or CI runs them without
touching production. The storage CLI selector is `storage`, not `storage:rules`.

---

## Recent log

Five sessions, newest first. Older entries live in `git log`, not here.

**2026-09-18 — v6.1.0.** R&D moved wholly onto its own tab: both rails filter
absolutely, `rdHome()` redirects the twenty-odd arrival routes, `tabForId()`
stays pure. Also a stepper per mold on a multi-mold part, the stray note card
folded into the Notes section, and TESTING/N-A subteams.

**2026-09-18 — v6.0.0.** Five fixes from Simon's review: several molds per part,
a part hero photo, a disposition note required to close an issue, R&D studies as
folders, and two-tier work-order sections. A UI review of the rendered screens
caught three things the string tests passed.

**2026-09-18 — v5.2.0 and v5.2.1.** The R&D programme strip: studies, R&D parts
and their runs on one sticky card strip over a full-width bench that renders the
real part and run detail. `renderRnd` routes `view.id` instead of consuming it.

**2026-09-17 — mold tracking, a trash can and lead-addable techniques**, fifteen
chunks, landed and deployed. Rules deployed twice (techniques on the guest read
allowlist; items/lots delete back to `isLead()`), storage.rules once for the
`molds/`, `items/` and `lots/` trees. One version, one release for the app and
the Fusion add-in; `tools/release.mjs` cuts everything.

**2026-09-04 — Fusion add-in study**, stages 1 and 2. Spikes S1, S2, S3, S6
through Fusion's built-in MCP server; S4 and S5 as throwaway add-ins.
