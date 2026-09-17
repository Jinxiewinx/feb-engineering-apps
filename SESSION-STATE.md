# Session state

Rolling handoff. If a session got cut off, read this first. Update it as work
proceeds, not just when stopping.

**This file has a budget: 400 lines.** It holds durable state only — what is
unshipped, what is broken, what must not be undone, what is next. It is not a
transcript and not a changelog; `git log` is both of those. Before adding
anything, read `.claude/SESSION-STATE-POLICY.md`: it holds the five-part keep
test and the per-section caps, and it exists because this file once reached
3,183 lines and nobody could find anything in it.

Everything dropped in the 2026-08-25 cleanup is recoverable:

```bash
git log -p --follow -- SESSION-STATE.md
```

---

## Now

**Mold tracking, a trash can, and lead-addable techniques** (approved
2026-09-17). Fifteen chunks; the plan, the order and the reasoning behind
every decision are in `~/.claude/plans/joyful-shimmying-bunny.md`. Do not
re-derive them. Five bundles. **0-8 ARE LANDED, PUSHED, DEPLOYED AND VERIFIED
LIVE**: storage.rules trees, `MOLD_TRACK`, the "Tooling cut" stage,
`cutEligiblePlans()`, the commit advancing the mold, the packer scrap
partition, mold files and datum plans, the split waiver, and the editable
offcut review pane. Next is **9-11** `config/techniques` in the trainings pattern, template
versioning, then the editor — 10 before 11 without exception; **12-14** soft
delete and the 30-day trash, last, because its blast radius is every count in
the app.

**A storage-rules assertion was asserting nothing** (closed 2026-09-17, by the
spawned task at 3591308, and worth keeping only for the fact underneath).
firebase-tools' emulator does NOT leave `request.resource.contentType` unset on
a simple upload to `/v0/...`, as that suite's scope note claimed for a year: it
defaults the value to `application/octet-stream` and never reads the
Content-Type header. So no contentType-gated allow case is assertable there,
and any assertion that thinks it is sending a PDF is really sending
octet-stream.

**The Fusion add-in ships as a download, on the app's version** (2026-09-17).
`tools/release.mjs` cuts it in one command; the procedure is in `CLAUDE.md`,
not here.

Decisions that cost something to reach and should not be quietly reversed. No
.dmg or .exe: an UNSIGNED one is blocked harder than a plain script is, and
signing runs about $99/yr per platform. The two installers sit beside the
add-in folder in the zip, never inside it, or they get copied into Fusion's
AddIns directory too. The zip ships no `credentials.json`, so a member signs
in as themselves and their own name stamps the mold. Verified by installing
from the downloaded zip, over an existing install and onto a clean one, with
the quarantine flag applied by hand: 13 quarantined files in, 0 left in
AddIns.

**OPEN, two things nobody has done.** (1) The Windows installer has never
been run, nor the add-in itself beyond one member's 2026-09-07 install; needs
a Windows member. (2) Nobody has DOUBLE-CLICKED the Mac installer from a
browser download. Launching it from a shell bypasses Gatekeeper entirely, so
the "Open Anyway" walkthrough in `INSTALL.txt` is written from Apple's
behaviour and not from watching it happen. Both are labelled untested in
`INSTALL.txt`.

**A test trap from the shared picker** (v4.8.0): `confirmProceed()` in
`test_app.mjs` returns the callback's promise, so a test that confirms an
async delete must `await` it.

**Still open from v4.7.1 and v4.6.0.** Nobody has picked a bottom face in
the actual Fusion command dialog; the add-in has never been run against a
monolithic block plan. `applyMargin` now snaps every blank to the bottom
blank's half-inch grid, which fixed the layer offset Simon saw, but
STK-SN6-014 predates the fix and needs a re-plan to line up.
`tools/test_drawings.mjs` has three pre-existing failures (cutlist, cutcrowd,
cutbatch) from the visual audit, unrelated to any of this.

**Fusion build-shaping facts** (2026-09-04, from the six spikes; all cost a
live experiment to find). `STLExportOptions.unitType` reads inches but writes
mm at its default, so the add-in meshes through `MeshCalculator` in cm and
writes mm itself. Parametric mode needs a base feature for temporary bodies,
and names are set after `finishEdit()`. The `adsk` bridge object appears in
the palette page about a second after load, and a `sendInfoToHTML` before the
page has loaded is dropped, so the page speaks first and the add-in queues
the mesh. Fusion's own `response` HTMLEvent is unreliable over https, so the
add-in relies on the page's explicit `mold-received`. The `fusion360://` deep
link opens nothing, which is why the mold card links `dataFile.fusionWebURL`.

The S4/S5 spike add-ins are still installed beside FEBPlanStock on Simon's
Mac (`S4PaletteBridge`, `S5RestSignin`); delete when no longer wanted.

**The CFD app is at cfd-v0.3.1** (2026-09-03). Decisions that must not be
re-asked: open access with no sign-in; shared library in Storage; 07
untouched; the viewer canvas stays dark in both themes (DECISIONS #5); charts
are the CFD app's own (#6); the thumbnail plot is `stat-car-0` with a
first-contour fallback; trend x-axis is the design point parsed from the
name. Records backfill dp/results/meta/thumb on first open, so no migration
script exists or is needed. The three placeholder collections in
`firestore.rules` still wait on Simon's talk with the team. The bucket's CORS
is applied by gsutil, not by deploy. `.claude/launch.json` serves app/ on
:8792 for the browser pane, which refuses sub-path navigation, so the server
root is app/ itself.

**The standards' editing surface is Google Docs** (2026-08-29, Simon's
call): folder "CS Standards" at the root of his My Drive, one Doc per
standard plus INDEX and template, figures embedded. IDs and the sync-back
rule live in `02 CS Standards/GOOGLE-DOCS.md`: Docs are where edits happen,
`src/` markdown is still what builds the app copies, so Doc edits get synced
back with a rev bump and rebuilt. Approval tables still need real signatures.

**Pending presses that are Simon's, not a session's:** `⋯ → Announce this
release`, standing in the newest build, which gives anyone on an older build
a reload prompt (never pressed since v3.0.0; one press covers the newest
only); **Link materials** on the Materials list, signed in, to backfill the
50 imported containers; the **EH&S import** itself (lead sign-in; the file
is `~/Downloads/Chemical Export Aug 28 2026.xlsx`), nothing imported into
production yet.

**R&D bench (`rnd` collection, v4.0.0), the load-bearing parts:**

- **A study is physical and carries a label.** `RDS-SN6-###` a study,
  `CPN-SN6-###` a coupon, both 11 characters with a QR. `test_qr.mjs` keeps
  the 15-character form as a counterfactual so the 14-character cliff stays
  proven.
- **A cell edit never calls `render()`** (`rdUpd`, `rdVal`): `onchange` fires
  while Tab already carries focus and a repaint destroys the field mid-hop.
- **The guest cascade does not reach this grid**; it has no Edit button, so
  `rdCell` renders `.ro` itself.
- **A project's sheet rolls its batches up** (`rdSheetRows`).
- **Do not fuse the two meanings of "R&D".** `parts.rnd` is a real part with
  a traveler; the `rnd` collection is coupons with none. A test fails if
  `rnd.js` ever tests `retro`.
- Not shipped and declined for now, so do not build speculatively: UI to set
  a study's `defaults`, std-dev/CV in Compare, computed stress, linking a
  study to a part or mold.
- **If `DB.rnd` passes ~2,000, take `rnd` out of `COLLECTIONS`** and give the
  tab a per-study query; it is the twelfth whole-collection listener.

**The boot splash is a gate**, load-bearing bits: `splashAuth()` marks `data`
as not needed when auth resolves to `signedout` or `pending`, or the gate
hangs in front of the people who need the sign-in card (there is a test named
for this); `hideSplash(true)` must keep working, eight visual suites go
through it; `splashFail()` returns early when nothing is outstanding, because
the 12s backstop fires on healthy boots. A failed lamp is a hollow amber ring
by shape, not a filled dot.

**CS-011 §6 still forbids resin and hardener co-storage on purpose** while
the app's warning was removed code-only; Simon revises the standard himself
at Rev D. Do not edit it from a session.

**EH&S tags are Data Matrix** (settled 2026-08-29 from a photo), 24
characters, `CA` + sixteen `0` + six hex in every sample. `invEhsShort`
shows the twelve edge characters in four-character groups with the last
group at full weight and the rest at 0.5, chosen against 627 real tags where
positions 0-18 never vary; the reasoning sits above `invEhsShort`, do not
re-litigate it. `ehsResolveTyped` accepts those twelve as a lookup, floor of
12, and an ambiguous tail returns no id. Any new writer of `ehsBarcode`
calls `ehsNorm`; comparisons go through `ehsKey`. The receiving grid stacks
to cards below 1320px; do not claw that back by shaving columns.

**Budget has two status tracks, not one enum** (v4.2.0): `status` is about
goods, `reimb` about money. Legacy records read through `buyStatus()` /
`reimbStatus()` and are never rewritten. The $50 gate lives on the money
track.

**`.sline` and `.shead` share one declaration of eight fixed grid tracks** on
the Season blueprint. Do not reach for `columns:` on `.seasongrid` a third
time.

**Guest mode is on and the app is publicly readable.** Anonymous sign-in with
`autodeleteAnonymousUsers`. Anyone with the URL reads everything, including
the team email addresses stamped on records; accepted deliberately. Verified
against production: every read 200, every write and delete 403, three client
layers refuse independently. Turning it off is the same Auth switch; the
rules can stay because `guest()` matches nothing then. Guest read costs
eleven full-collection snapshots per visitor on Blaze; Simon's call was ship
and watch the bill, the fix being a lazy per-tab sync, App Check its own
project. The storage CLI selector is `storage`, not `storage:rules`.

**A dashboard lane cannot ship without an empty state**: `laneShell()`
requires `emptyFn` and throws without one. **Nothing is scored across
lanes**; `actScore` tiers sit 50 apart because the bonuses sum to 45, and
`test_app.mjs` pins that. **`min == max` is asserted byte-identical to the
pre-range packer** in `test_packer.mjs`; it is the rollback story for density
ranges.

**Adding a method to `fb` means adding it to seven dev shims** (grep
`window.fb = {`), and the shims must match: `allocIdBlock` once minted from
the counter key instead of `ID_PREFIX[coll]` and nobody saw it for years.

**`test_safearea` is red on purpose.** At landscape-max two step-action
buttons on `wo-detail` sit past the safe area (x=873; the second reaches
945). The test is right, the CSS is not; fixing it needs Simon.

---

## Open questions for Simon

**Two answers the mold plan is blocked on** (neither blocks Chunks 5, 6 or 8).

1. **The split waiver probably measures the wrong quantity.** `sectionize`
   splits on stack HEIGHT, but the ShopSabre's 6in limit is plunge DEPTH,
   bounded by the cavity's Z relief. Shipping the flag as asked (Chunk 7),
   labelled "Machined depth stays under 6in", but the durable fix computes
   per-layer depth from the mesh and is worth its own conversation.
2. **`parts.js:1023` and `workorders.js:103` are the same map with disagreeing
   fallbacks**, so a part with a blank `layupType` silently gets a ten-step
   infusion checklist. Chunk 9 unifies them on `"Other"`. That is a behaviour
   change on existing parts and needs confirming before it lands.

**Two things need a human with a real device; automation cannot settle either.**

1. **Tab through the Budget grid by hand.** The Tab-moves-field-to-field
   behaviour from `9fffc9e` is UNVERIFIED. A synthetic Tab does no focus
   traversal in the harness, and the control case lands on `document.body` too,
   so a real regression and a harness artifact are indistinguishable there. The
   in-place update *is* confirmed working.
2. **Does the wide-table scrollbar show on iOS?** A wide table scrolls sideways
   in its own box and the only cue is a styled 6px scrollbar. Headless Chromium
   draws an overlay scrollbar that takes no space and never appears in a
   screenshot. If it is invisible on a real phone, a wide table has no scroll
   cue at all. The edge-fade shadow is not the answer here — a table's header
   tint and zebra rows paint over it, so it rendered as two grey smudges.

**Two one-time actions only a lead can do**, both still pending (they are also
items in `HANDOFF.md`):

- Press **Tracker feed** on the Reports tab to mint the token and publish the
  first snapshot. Until then the feed URL 404s rather than erroring, because
  there is no token and no document yet.
- Paste `Sync.gs` into the spreadsheet's Apps Script and install the trigger.

---

## Next up (not started)

- Chunks 1 through 14 of the mold/trash/techniques plan, above.
- The dashboard and guest mode follow-ups named in **Now**.
- Decide the four app-only families (Receiving, Export, Storage map, Search
  results, plus `table.sub`): lift them into `components.css` or drop them
  from `conventions.md`. `conventions.md` marks them app-only meanwhile.
- Port the traveler to the offline single-file `work-orders.html`, which
  still has the old print CSS.
- `reports.js` "Print status board" still calls raw `window.print()`, the
  only printable that does.
- `04 Printables/printables.html` is open to redesign; no house style.
- Per-record history/audit trail (Phase 5 of the inventory plan), deferred.
- **The one label test that needs the printer in hand**: whether iOS lets a
  custom page length through on continuous stock. If it forces a fixed size,
  switch the default media to `dk1201` (die-cut, already built). Test from
  the shop PC first to isolate the question to iOS.

---

## Constraints — don't relitigate

**The roll printer must be AirPrint, and that is not a preference.** A browser
cannot open a raw TCP socket, so port 9100 is unavailable; and the app is
served over HTTPS, so `fetch`ing a plain-HTTP LAN printer is blocked as mixed
content. Every "just POST to the printer" design dies on one of those two, and
a cheaper Bluetooth-only label maker cannot be driven from the app at all. The
reasoning is in `06 Composites App/app/DESIGN-NOTES.md`; what is here is the shopping
constraint, because it is invisible from the code.

**The laminated-tape option was checked and rejected on print height, not on
price.** A Brother PT-P750W ($155) takes 24 mm TZe laminated tape — IPA-proof,
−80 to +150 °C — and does support AirPrint, so it was a real candidate. Its
**maximum print height is 18 mm** against the 21.4 mm the current label needs
(25.4 less 2 mm margin top and bottom), so it cannot print this label without a
tighter redesign and a QR dropped from 21.4 to ~17.5 mm. Tape is also 3–4× the
cost per label. Simon chose the QL-810W direct-thermal path 2026-08-28 knowing
the labels fade in UV, blacken with heat and smear under solvent — they are for
shelves, bins and lots indoors, and anything that meets a post-cure oven or an
IPA wipe keeps Avery 5522 polyester off the sheet printer. Do not "fix" this by
switching to tape without redoing the vertical budget.

**The shelved `projects` TABS row is hidden but is NOT an alias.** The four
hidden rows under it (`stock`, `items`, `lots`, `weekplan`) are normalised
away in `render()` so their own render never runs. `projects` still renders
itself, because the issue detail page lives there and is reached only by chip
and by `#/PROJ-` link. Adding a normalisation line for it kills every link to
every issue, silently. `06 Composites App/app/SHELVED.md` is the full record.


Each of these cost something to learn and would be easy to undo by accident.
Anything already explained in a README is deliberately not repeated here; see
`README.md`, `SETUP.md`, `tools/README.md`, `06 Composites App/app/README.md`,
`HANDOFF.md` and `.design-sync/NOTES.md`.

### Deploying

**Rules deploy alone and FIRST, then hosting.** An old client under new rules
is fine; a new client under old rules fails every allocation. `--only hosting`
must stay meaning only hosting — `firestore.rules` and `storage.rules` can lock
the team out of their own data.

**The rules suites target the DEMO project.** They need Java and the firebase
CLI, but no login and no network, so a fresh machine or CI can run them without
touching the real `feb-composites` project.

**Verify a deploy off the live host, not from the CLI.** "Deploy complete" is
not a check; fetch a changed file and confirm the new code is actually in it.

### Data model and rules

**The Firebase `apiKey` in `firebase-config.js` is public web config by
design.** The repo is public, Simon's call, and scanned clean. Security lives
in `firestore.rules`, not in hiding that key.

**The tracker snapshot stores one compact JSON *string* per part.** The binding
constraint is Firestore index entries — 7.5 KiB each, 20,000 per document — not
the 1 MiB document limit. An array of maps would blow the entry count.

**Unauthenticated Firestore REST honours `firestore.rules`.** Verified live: an
anonymous GET of `pub/<id>` returns 404 while `parts/<id>` returns 403. That is
the whole reason the sheet sync works with no server, no service account and
no OAuth.

### Printing

**`print.css` is deliberately not inside `@media print`.** The sheet renders
identically on screen and on paper, which is what makes the preview trustworthy
and lets the design be reviewed from a screenshot. Tidying it into a print-only
block breaks the entire review loop.

**Label CSS lives in `print.css`, never `index.html`.** `downloadSheet()`
fetches `print.css` and inlines it, so anything in `index.html` vanishes from
every saved sheet — and a saved sheet on a phone at RFS with no wifi is the
case that matters.

**`labelSheetHtml()` must never reuse `fitSheetHtml()`, `LAYOUTS` or
`MAX_PAGES`.** Those exist to squeeze a work order onto two pages via a ladder
of candidate row counts, measured most-generous-first; they mean nothing for a
fixed label grid. Do not replace the ladder with fixed row counts either — the
point is that a sparse work order gets room to write and a dense one still
lands on two pages.

**`.dwg-tabwrap`'s `flex: 1 1 auto` is scoped to `.dwg-cols >` on purpose.**
It exists to take the width left beside the fixed key and inset inside a flex
ROW. `.dwg-page` is a flex COLUMN, so unscoped it made a full-width table grow
vertically and pushed the cut schedule's two tables to opposite ends of the
sheet. Widen the selector and the tables drift apart again.

**Every distinction must survive grayscale.** Shop travelers print on a
black-and-white laser first, so blockers use hatching plus heavy rules plus the
literal word BLOCKER, never colour alone. Berkeley blue and gold are
enhancement only.

**Page numbering is hand-written (`Page ___ of ___`).** Chrome has no `@page`
margin-box counters, so there is no honest way to print it.

### The CFD viewer (07)

**Pages stack into one continuous strip of PDF points, and a panel is a window
into that strip.** Panels sit on a uniform 502.5 pt pitch and flow across page
breaks, so nothing may assume a panel lives on one page.

**Layout is in content space, not paper space.** Pages lay out with their print
margins removed, so a plot spanning a page break is one continuous image and
the crop stops mistaking the seam's white band for a title gap. Paper-space
`absY` survives as `paperAbsY`.

**Do not "simplify" the Electron shell to `loadFile`.** This app is ES modules
because pdf.js ships as one and pulls a module worker with it, which forces an
HTTP origin. The custom `app://` protocol is what lets the desktop and browser
builds run identical code with nothing conditional between them.

**Panels crop through one shared box across every report being compared**
(`jointCrop` in `render.js`). Cropping each report to its own content would
offset them and the difference view would report that offset as change
everywhere. The guard is that two identical reports still diff to exactly 0
pixels.

### The test harness

**App files load per-file from `index.html`'s `<script>` tags** via
`tools/lib/appload.mjs`, each as its own `vm.Script` with its real path. There is
no `FILES` list to forget and no regex allowlist. Coverage attributes by file as
a result. The gotcha: top-level `const`/`let` are global-LEXICAL, so bare `DB`
works and `globalThis.DB` is `undefined`.

**Never assert sanitizer allowlist policy in `test_app.mjs`** — it cannot see
it. `tools/test_sanitize.mjs` runs the real vendored DOMPurify in Chromium. The
old stub ignored the allowlist entirely, which meant zero real coverage and hid
two live bugs.

**The design-system drift test compares only selectors present in BOTH copies.**
A rule missing from one file is skipped, not reported — which is how `.bignum`
carried state classes that did nothing for a year. There is now an explicit
state-modifier check alongside the rule-by-rule diff; keep it, because the diff
alone cannot see an absence.

**A backtick inside a JS template literal ends the literal.** It has bitten
`documents.js`, `projects.js` and the `AUDIT` string in `test_detailui.mjs` —
every time it was prose in a comment quoting code. Write those comments without
backticks. `AUDIT` says "no backticks below this line" for this reason.

**Playwright suites skip and still exit 0** when Chromium is missing. Read the
output; never trust the exit code alone. (Also in `SETUP.md`.)

### App behaviour

**`formatBlock` needs the angle-bracket form (`"<h2>"`)** or it is a silent
no-op in Safari. An empty contenteditable holds a bare text node with no block,
so editors are seeded with `<p><br></p>` or formatBlock has nothing to convert.

**`proseHtml()` decorates AFTER sanitising**, adding `.tblwrap` and `.cgal`,
because `class` is not allowlisted and authors therefore cannot ask for either.

**Retro records store the literal `"not recorded (retro)"`.** `pv()` maps it to
empty so it never reaches paper looking like data.

**Standard references are off the printed sheet.** `stripCS()` in
`workorders.js` removes them at render time from legacy and retro records,
covering titles, notes and event-log text. Stored data is untouched, so the
archive keeps its original wording.

**Accounts are self-serve (v4.4.0).** Sign-up is name + username + password;
a username is the synthetic address `<u>@members.feb-composites.app`
(`USER_DOMAIN`, `loginEmailFor`, `userHandle` in core.js), so every email-keyed
path is unchanged and old email accounts still sign in. `firestore.rules`
lets an account create only its own roster doc, as member, with the four
sign-up fields; leads keep roles and removal. **Deployed rules** on
2026-09-03, purely additive on `/roster` create. Removal is a nudge now:
a removed person can rejoin, so a real lock is disabling the Auth user in
the console. Username accounts have no password reset; recovery is delete
the Auth user, sign up again with the same username.

**Seasons and `archived` (v4.3.0).** A record's season is read off its id;
the current one is `config/season.code` (Season settings, fallback SN6).
`inSeason()` now also requires this season and not archived. Rails default to
this season with archived hidden; chips swap in SN5 / archived. New ids for a
later season mint on `<key>@<code>` counters, SN6 keys unchanged. Nothing is
deleted to roll a season over. Simon's ask, 2026-09-03: archive, never delete.

**`render()` snapshots and restores every `.plist` rail's scrollTop** (v4.2.1),
keyed by aria-label. Anything new that scrolls inside `<main>` and must survive
a re-render should be a `.plist` or get the same treatment.

**Storage-backed features (avatar, file upload) need the Firebase Blaze plan.**
They are built and tested against the emulator.

---

## Recent log

Five sessions, newest first. Older entries live in `git log`, not here.

**2026-09-17 — the storage suite can assert allow cases now.** The long-failing
`authed write of a non-STL content type to stackplans/` was a bad assertion,
not a rule gap: the emulator's simple-upload endpoint never reads the
Content-Type header and reports `application/octet-stream` to the rules engine,
which the stackplans rule accepts on purpose. A resumable upload carries the
type through, so `writeTyped()` now covers the wrong-type and right-type cases
both. No rule logic changed.

**2026-09-17 — one version, one release** for the app and the Fusion add-in;
`tools/release.mjs` cuts everything. Then the mold/trash/techniques plan
approved, and Chunk 0 landed: `molds/`, `items/` and `lots/` added to
`storage.rules`, which had been silently refusing every photo pasted into a
Shop-tab note.

**2026-09-04 — Fusion add-in study, Stage 1 and 2.** Spikes S1, S2, S3, S6
through Fusion's built-in MCP server; S4 and S5 as throwaway add-ins.

**2026-09-03 — composites app v4.2.1 to v4.4.1:** rails keep their scroll,
Parts Select…, archive-not-delete with season codes, self-serve accounts
with usernames, Roster page removed. CFD app to cfd-v0.3.1: dashboard, saved
views, shell, splash gate, phone layout.

**2026-09-02 — CFD viewer live at feb-cfd.web.app** (cfd-v0.1.0), folders
renumbered (`03 App/` is `06 Composites App/`), repo renamed to
`feb-engineering-apps`.

**2026-08-28 — v4.0.0** (R&D bench, boot gate), mold stage stepper, inventory
round 2 and EH&S phases complete.

