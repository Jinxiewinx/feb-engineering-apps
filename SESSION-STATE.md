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

Each cost something to learn and would be easy to undo by accident. Anything
already explained in a README or in `DESIGN-NOTES.md` is deliberately **not**
repeated here; see `README.md`, `SETUP.md`, `tools/README.md`, `06 Composites
App/app/README.md`, `.../DESIGN-NOTES.md`, `.../SHELVED.md`, `HANDOFF.md` and
`.design-sync/NOTES.md`.

### Deleting and the trash

**`onFbData` is the ONE place a tombstone is filtered.** `DB[coll]` is the live
records, `DB.trash[coll]` the deleted. Nothing else should ever test `.deleted`;
about forty read sites depend on not having to. Adding `&& !r.deleted` somewhere
means you have misunderstood the split.

**`deletedFiles` on a tombstone is the only record of a deleted record's
uploads.** Storage listing is denied by rule, so losing that array makes the
blobs unreachable forever. `purgeTrash` in reports.js is the only caller of
`deleteFiles`. Two paths still hard-delete on purpose — the cut commit
consuming a board to zero, and `undoCuts` withdrawing offcuts it just made —
because both are stock consumption, not a deletion. Roster removal likewise:
roster is not one of the twelve collections and has no bin.

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
retro-fit.** `templateVersion` is what lets a run know it is behind, and it is
also what turns off BLOCKER_WORDS title matching — which still enforces on every
record predating it, including the 26 retro SN5 runs.

**A part's molds are `p.molds[]`; `p.mold` is read-only legacy.** No mirror:
two fields holding one fact, maintained by convention across separate writers,
is the shape `woIsRnd` derives to avoid. `partMold()` still answers with one.

### R&D

**Do not fuse the two meanings.** `parts.rnd` is a real part with a traveler;
the `rnd` collection is coupons with none. A test fails if `rnd.js` ever tests
`retro`. It does call `isRnd()` since the programme strip, and that is not the
fusion — see DESIGN-NOTES. In the coupon grid a cell edit never calls
`render()` (`rdUpd`, `rdVal`): `onchange` fires while Tab already carries focus
and a repaint destroys the field mid-hop. The guest cascade does not reach it
either, so `rdCell` renders `.ro` itself.

**R&D lives on the R&D tab and only there.** Both rails filter absolutely;
`onlyRnd`/`woOnlyRnd` are gone. `rdHome(tab, id)` in core.js does it, called
from `openRecord()` and `consumePendingLink()`. **`tabForId()` stays pure and
prefix-only** — do not push a record lookup into it. Related: if `DB.rnd` passes
~2,000, take `rnd` out of `COLLECTIONS` and give the tab a per-study query. That
escape hatch stays available only while every reader of `DB.rnd` is in
`rnd.js`.

**A study is physical and carries a label.** `RDS-SN6-###` and `CPN-SN6-###`,
both 11 characters with a QR; `test_qr.mjs` keeps the 15-character form as a
counterfactual so the 14-character cliff stays proven. A study groups parts
through `part.study`, never `wo.study`. Declined, so do not build
speculatively: std-dev/CV in Compare, and computed stress.

### App behaviour

**Guest mode is on and the app is publicly readable.** Anonymous sign-in;
anyone with the URL reads everything including team emails, accepted
deliberately. Verified live: every read 200, every write and delete 403, three
client layers refusing independently. Turning it off is the same Auth switch.
Guest read costs eleven full-collection snapshots per visitor on Blaze.

**Seasons, archiving and accounts.** A record's season is read off its id
against `config/season.code`; `inSeason()` also requires this season and not
archived, and later seasons mint on `<key>@<code>` counters. Nothing is deleted
to roll a season over — archive, never delete (Simon). A username is the
synthetic address `<u>@members.feb-composites.app`, so every email-keyed path is
unchanged; removal is a nudge, a real lock is disabling the Auth user, and
username accounts have no password reset. Budget has **two status tracks, not
one enum** — `status` is about goods, `reimb` about money, legacy records read
through `buyStatus()`/`reimbStatus()` and are never rewritten, and the $50 gate
lives on the money track.

**The boot splash is a gate, and a dashboard lane needs an empty state.**
`splashAuth()` marks `data` as not needed when auth resolves to `signedout` or
`pending`, or the gate hangs in front of the people who need the sign-in card;
`hideSplash(true)` must keep working, eight visual suites go through it; and
`splashFail()` returns early when nothing is outstanding because the 12s backstop
fires on healthy boots. `laneShell()` requires `emptyFn` and throws without one.
Nothing is scored across lanes — `actScore` tiers sit 50 apart because the
bonuses sum to 45.

**Four smaller ones.** `.sline` and `.shead` share one declaration of eight fixed
grid tracks on the Season blueprint — do not reach for `columns:` on
`.seasongrid` a third time. `render()` restores every `.plist` rail's scrollTop
by aria-label, so anything new that scrolls inside `<main>` should be a `.plist`.
Retro records store the literal `"not recorded (retro)"`, which `pv()` maps to
empty and `stripCS()` keeps off the printed sheet without touching stored data.
Avatar and file upload need the Blaze plan.

### Data model and rules

**The Firebase `apiKey` in `firebase-config.js` is public web config by design.**
The repo is public, Simon's call, scanned clean. Security lives in
`firestore.rules`, not in hiding that key — and unauthenticated REST honours
them: an anonymous GET of `pub/<id>` returns 404 while `parts/<id>` returns 403,
which is why the sheet sync needs no server, service account or OAuth.

**The tracker snapshot stores one compact JSON *string* per part.** The binding
constraint is Firestore index entries (7.5 KiB each, 20,000 per document), not
the 1 MiB document limit. An array of maps would blow the entry count.

**EH&S tags are Data Matrix**, 24 characters, `CA` + sixteen `0` + six hex.
`invEhsShort` shows the twelve edge characters because across 627 real tags
positions 0-18 never vary. Any new writer of `ehsBarcode` calls `ehsNorm`;
comparisons go through `ehsKey`. Related: **CS-011 §6 still forbids resin and
hardener co-storage on purpose** while the app's warning was removed code-only.
Simon revises the standard himself at Rev D; never edit it from a session.

### Deploying

**Rules deploy alone and FIRST, then hosting.** An old client under new rules is
fine; a new client under old rules fails every allocation. `--only hosting` must
stay meaning only hosting. And verify off the live host: "Deploy complete" is
not a check, so fetch a changed file and confirm the new code is in it.

**The rules suites target the DEMO project.** They need Java and the firebase
CLI but no login and no network, so a fresh machine or CI runs them without
touching production. The storage CLI selector is `storage`, not `storage:rules`.

### Printing and labels

**The roll printer must be AirPrint, and that is not a preference.** A browser
cannot open a raw TCP socket and the app is HTTPS, so a plain-HTTP LAN printer
is blocked as mixed content. A Bluetooth-only label maker cannot be driven at
all. The full reasoning is in DESIGN-NOTES; this is the shopping constraint. **Laminated tape was rejected on
print height, not price** — the Brother PT-P750W tops out at 18 mm against the
21.4 mm this label needs. Do not "fix" direct thermal's fade/heat/solvent
weakness by switching to tape without redoing the vertical budget.

**`labelSheetHtml()` must never reuse `fitSheetHtml()`, `LAYOUTS` or
`MAX_PAGES`.** Those squeeze a work order onto two pages via a ladder of
candidate row counts; they mean nothing for a fixed label grid. Do not replace
the ladder with fixed row counts either — a sparse run gets room to write and a
dense one still lands on two pages. `.dwg-tabwrap`'s `flex: 1 1 auto` is scoped
to `.dwg-cols >` for a related reason: `.dwg-page` is a flex COLUMN, so unscoped
it pushed the cut schedule's tables to opposite ends of the sheet. Page numbering
stays hand-written because Chrome has no `@page` margin-box counters.

### Fusion

**Install decisions that cost something to reach.** No .dmg or .exe: an unsigned
one is blocked harder than a plain script, and signing is ~$99/yr per platform.
The two installers sit beside the add-in folder in the zip, never inside it, or
they get copied into Fusion's AddIns directory too. The zip ships no
`credentials.json`, so a member signs in as themselves.

**Build-shaping facts, all from live experiment.** `STLExportOptions.unitType`
reads inches but writes mm at its default, so the add-in meshes through
`MeshCalculator` in cm and writes mm itself. Parametric mode needs a base feature
for temporary bodies, and names are set after `finishEdit()`. The `adsk` bridge
appears about a second after load and a `sendInfoToHTML` before that is dropped,
so the page speaks first. Fusion's own `response` event is unreliable over https.
`fusion360://` opens nothing, which is why the mold card links
`dataFile.fusionWebURL`.

### The CFD viewer (07)

**Nothing may assume a panel lives on one page** — panels flow across page
breaks. Layout is in content space so a plot spanning a break is one continuous
image, and paper-space `absY` survives as `paperAbsY` for the cases that still
need it. (The pitch and the content-space rationale are in that app's README.)

**Do not "simplify" the Electron shell to `loadFile`.** The app is ES modules
because pdf.js ships as one and pulls a module worker, which forces an HTTP
origin. The custom `app://` protocol is what lets desktop and browser run
identical code. **Panels crop through one shared box** across every report being
compared (`jointCrop`); cropping each to its own content would offset them and
the difference view would call that offset change everywhere. Two identical
reports must diff to exactly 0 pixels. **Settled, do not re-ask:** open access
with no sign-in, shared library in Storage, 07 untouched, the viewer canvas dark
in both themes, charts the CFD app's own. Records backfill on first open, so no
migration script is needed, and the bucket's CORS is applied by gsutil.

### The test harness

**App files load per-file from `index.html`'s `<script>` tags**, each as its own
`vm.Script`. There is no FILES list to forget. The gotcha: top-level
`const`/`let` are global-LEXICAL, so bare `DB` works and `globalThis.DB` is
`undefined` — and **a duplicate `function` name across two app files silently
shadows**, which has cost a debugging session.

**Never assert sanitizer allowlist policy in `test_app.mjs`** — it cannot see it.
`tools/test_sanitize.mjs` runs the real vendored DOMPurify in Chromium. And the
design-system drift test compares only selectors present in BOTH copies — a rule
missing from one file is skipped, not reported, which is why the explicit
state-modifier check beside it must stay: the diff cannot see an absence.

**Three traps.** Playwright suites skip and still exit 0 when Chromium is
missing — read the output, never the exit code. `confirmProceed()` returns the
callback's promise, so a test confirming an async delete must `await` it. Adding
a method to `fb` means adding it to seven dev shims (grep `window.fb = {`), and
they must match: `allocIdBlock` once minted from the counter key instead of
`ID_PREFIX[coll]` and nobody saw it for years. And a backtick inside a JS template literal ends
the literal — it has bitten `documents.js`, `projects.js` and `AUDIT` in
`test_detailui.mjs`, every time as prose quoting code.

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
