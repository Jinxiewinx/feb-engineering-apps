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
