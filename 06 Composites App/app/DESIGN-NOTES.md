# Design notes — the hosted app

Why the app is built the way it is. `README.md` next door is the manual: it
says what the app does and how to use it, and it is written for the team.
This file is for whoever changes the code, and it exists so that the reasons
behind the non-obvious choices survive the person who made them.

Read this before changing behaviour the README describes. Most of what is here
was learned by getting it wrong first.

Related: `tools/README.md` for the test suites and the screenshot tools,
`../../.claude/SESSION-STATE-POLICY.md` for what goes in the handoff file, and
`../sheets/README.md` for the half of the sheet sync that lives in the
spreadsheet.

## Never fold with `<details>`

A closed `<details>` skips **painting** its content rather than merely hiding
it. Section folds on work orders and parts are therefore a class on the card
(`.wosec.folded` hides `.wosec-body`), driven by a real `<button>`, and the
print stylesheet force-shows every section body.

This has bitten twice. Once as a mobile "fix" that forced a closed `<details>`
open with `display: block` and took the ticket page's entire left rail down to
blank white space — the children reported a real bounding box, `visibility:
visible`, `opacity: 1`, and drew nothing. And once as folded sections silently
vanishing from a browser print. `element.checkVisibility()` is the only helper
that tells the truth about this; every hand-rolled "is it visible" test asks the
wrong question.

The one legitimate `<details>` is `.wo-subfold`, for reference blocks inside a
card, where nothing prints and nothing hides.

## The jump bars are buttons, not anchors

The section jump bar on work orders, parts and tickets renders buttons. An
`href="#wo-stack"` would overwrite the deep link the app keeps in the URL hash,
which is the whole addressing scheme. The old anchor-based jump bar on Parts was
removed for this reason; do not reintroduce one.

## Routing

Navigation is the in-memory `view` object; `syncUrl()` mirrors it into the hash
with `replaceState`, **never** `pushState`. `NAV_STACK` is a referrer trail and
browser history is chronological. Reconciling the two would either make Back lie
or break `navBack`.

A pending deep link waits up to six seconds for its record to arrive, because
`fb.state` reaching `"ready"` only means auth is done — the collection snapshots
land afterwards. Giving up early was the first version, and it dumped every scan
into the search box.

`BRD-` and `STK-` both resolve to the one `stock` collection. Repointing them
would break deep-link redemption, the Move-here flow and the id-prefix
cross-check, so `stock` stays one collection with two homes, split on the id at
paint time: a board renders in Inventory, a stack plan on its mold.

## Lineage and links

`wo.partId` is the link that matters: the child names its parent, which is the
only direction that cannot go ambiguous. `part.workOrderId` still exists but
means "the current run", not "the link". None of the 33 SN5 parts carried an id
link, which is why name-matching and the Confirm button exist at all.

`p.mold` is the committed mold link; without it the mold is derived through the
part's runs. A part's `moldProgress` and the mold record's `stage` are
deliberately not synced — different enums, different owners — so the app reports
a disagreement rather than resolving it.

## Colour is derived from meaning, never from position

A stage that has not started reads grey, never amber. This was wrong for the
whole of SN5: `"N/A (Flat)"` occupies slot 0 of the mold enum, so `"Not
Started"` sat at index 1 and coloured itself as in-progress. Derive progress
colour from what a value *means* now, never from where it sits in an array.

Related: hue is never the only carrier. Material colour is a swatch beside a
short text tag, blockers carry the literal word, and the dashboard prints counts
as words. Everything has to survive greyscale, a colour-blind reader and the
black-and-white laser.

## Grouping a rail is a partition, not a filter per group

The Molds rail groups by stage by partitioning the already stage-sorted array.
Running a filter per stage would let DOM order and keyboard order diverge; the
partition is what guarantees the arrow keys walk exactly the rows on screen.
Group headers are drawn by the body renderer and are not rows, so the keyboard
cannot land on one.

The same shape applies to any filter on a keyboard-walkable list: apply it with
the other filters, not at render time. A no-home filter applied at render time
once left the arrow keys walking invisible molds.

## Density is canonicalised on the way in

Board grade is free entry through `canonDensity()`, but every value collapses to
one canonical form. The board grouping key, the planner's rack filter and the
packer's bucket key all compare density, so `"60"` and `60` landing as two
values would split one rack in two and report a shortfall in front of a full
shelf.

Board and plan density are stored as numbers, mold density as a string. That
asymmetry is deliberate: the coercion produces a byte-identical `SZ:` key for
everything already stored, so there was no migration. `packer.js` has no access
to `core.js` and does not need it — both its inputs canonicalise first.

## A map that hides things is not a map

Empty shelves used to collapse out of the storage map into a one-line text
strip, on the argument that an empty recently-walked shelf is a fact rather
than a card and that in a real shop it is over half the list. Both halves of
that are true and the conclusion was still wrong.

The map is the picture of the shop. A shelf you cannot see on it is a shelf you
forget you own, which is the failure the map exists to prevent — and the shelves
that vanished were exactly the ones with nothing on them to jog the memory.

The strip also quietly broke the page's one interaction. A `.loccard` is
clickable anywhere: `.lc-open` is a real button on the name whose `::after` is
absolutely positioned over the whole card, with `.lc-act` (Confirm) as a sibling
raised above it, so both are real buttons, both tab-reachable, and nothing calls
`stopPropagation`. The strip reused `.lc-open` with `::after { position: static }`,
which turns the stretched link back into a plain text link — so "click a location
to see what is on it" was true at the top of the page and false further down.
That asymmetry is invisible in a screenshot and does not fail any assertion;
it was found with `elementFromPoint` at each card's corners and centre.

Empty locations are quieter cards now (`.loccard.isempty`), and emptiness breaks
ties *within* an attention rank rather than overriding it — an unwalked empty
shelf still needs walking, so it should not sink below a walked full one.

Related: **+ Location** lives on the map, not on the items list. A class whose
records are better created elsewhere carries `newOn` in its SHOP spec, and
`renderShopList` prints where instead of offering a button that would strand the
user on the wrong page afterwards.

## The receiving count column cannot be widened

`.rxc-qty` holds the count input and the live readout of what the line will
become. Both must sit on one line: it wrapped once, and a cell reading
`12 / 1 record / of 12` reads as broken rather than as information.

The obvious fix is the wrong one. That column is deliberately narrow because
`table.sub.rxgrid` is `table-layout: fixed`, so every pixel it takes comes off
the material-name input — the only column a person actually types prose into.
`tools/test_receiving_ui.mjs` asserts the name input is at least 150px at
1201px wide, and it guards a real regression: at 1100 the old widths left that
input 60px while every numeric check passed. Adding 8px to `.rxc-qty` takes the
name to 143 and fails it.

So the fit has to come from inside the cell. Two things buy it: the readout is
kept short (`1 of 12`, with the sentence moved to the element's `title`), and
the count input is sized for the two or three digits a delivery line carries
rather than the 54px it had. `white-space: nowrap` on the cell is what stops the
span dropping to a second line — the break was between the input and the text,
not inside either.

## Cell edits must not re-render

The Budget line grid and the Receiving sheet both follow this: a cell edit never
triggers a render, because `onchange` fires *while* Tab is already carrying
focus to the next field. Re-rendering destroys the destination element and focus
falls to `document.body`.

Where a render is genuinely needed after an edit, use
`renderSoonKeepFocus()` — it defers, renders, then refocuses by id and restores
the caret. Fields that rely on it carry a stable id.

The R&D coupon grid follows the same rule in `rdUpd` and `rdVal`, and pays a
second price for it: **`render()`'s guest read-only cascade does not reach it.**
That cascade works by clearing `view.edit`, and the grid has no Edit button to
clear — so `rdCell` renders the `.ro` form itself. Anything that routes those
cells through a shared field helper has to re-check both halves.

## The trash

Deleting is a tombstone, not a removal. **`onFbData` is the ONE place a
tombstone is filtered**: it splits each snapshot into `DB[coll]` (live) and
`DB.trash[coll]` (deleted), and nothing else in the app should ever test
`.deleted`. Roughly forty read sites depend on not having to, so a stray
`&& !r.deleted` somewhere means the split has been misunderstood.

**`deletedFiles` on a tombstone is the only record of what a deleted record's
uploads were.** Storage *listing* is denied by rule, so if that array is lost
the blobs are unreachable forever — there is no way to enumerate them and no
way to bill for them knowingly. `purgeTrash` in `reports.js` is the only code in
the app that calls `deleteFiles`.

**Two paths still hard-delete on purpose.** The cut commit consuming a board to
zero, and `undoCuts` withdrawing offcuts it has just created. Both are stock
being consumed rather than somebody deleting a record, and a tombstone for
either would put a phantom board in the rack. Roster removal is likewise
unchanged: `roster` is not one of the twelve collections and has no bin.

## Writes

Edits save **per field**. `save(coll, obj, field)` names the field; array and
object fields go through `saveField`. A whole-record write would let someone
editing a BOM clobber a buy-off saved at the same moment.

Each ply in a layup stack carries a hidden id so two people editing the same
stack merge instead of overwriting. Only reordering is last-writer-wins, because
two people reordering the same stack has no correct answer.

Partial receipt uses `buyRef.n` — received quantity is a sum over the records
that exist, so Incoming stays a query and undo needs nothing rolled back.
Records written before `n` existed behave exactly as before; nothing was
migrated.

Incoming reconciliation trusts the received record's `buyRef` (the lot exists)
rather than the purchase's own back-link, so a half-landed save heals itself at
the next render.

## Person fields

A field that names a person is two keys: `<key>` is the name as it read when
set, and `<key>Email` says who that is. The email is the link, `ext` means
"deliberately somebody not on the app", and empty means an old typed name
nobody has resolved. The name stays because the Sheet feed must never carry
an email, a removed member must still read as somebody, and CSV, print and
labels all read it. Everything that displays or groups goes through
`personRef` (core.js), which prefers the live roster name, so a rename needs
no migration. `PERSON_FIELDS` is the one list of where these live.

Old names are linked by a lead from People › Unlinked, never automatically on
load: every client writing at once would race, and the screen is already right
because `personRef` infers unambiguous matches at render time. The backfill is
not stamped (`fb.patchMany`), so it does not bury the activity feed. Retro
records never link on a bare first name.

The picker (`personField`) keeps its state outside the DOM so a snapshot
repaint mid-typing leaves it open, and its handlers carry only a field id and
a row index: `esc()` does not escape apostrophes. Enter on text that matches
nobody writes nothing; Other has to be chosen. Two designs were built and
scored against each other; the inline combobox lost because Enter after a
typo saved the typo.

## The `config/` documents

Lead-writable, roster-readable, and each one is the answer to "where does this
number live". None of them are derivable from the code that reads them.

| Doc | Holds |
|---|---|
| `config/season` | Season code (`SN6`), name, competition date and milestones. The code goes into every new id and picks which season the rails show |
| `config/restock` | CS-011 §5 minimums per material, with the standard's own reasoning attached. Editable because §5 calls them "starting values; tune with usage data" |
| `config/trainings` | Trainings added beyond the six built-ins. Archives instead of deleting, so a historic grant keeps rendering its name |
| `config/resins` | Per-resin cure-hold overrides. Never below the datasheet floor — see below |
| `config/tracker` | The sheet feed's secret token. Never in source |
| `config/labels` | The team's default label media. Only seeds a device nobody has set — the operative setting is per-device in `localStorage` |

Three field names carry more weight than they look:

- **`matKey`** ("IN2", "TACKY-TAPE") is what ties a lot to a material, and so
  what lets the reorder signal live on the material rather than the container.
  A received lot is born with the key and the reorder row disappears by itself.
  The old `lowFlag` lived on a container and vanished when the last one
  emptied — being nearly out was a chip, being completely out was silence.
- **`lotSource`** records how a lot reference was obtained: `"scanned"`,
  `"recalled"` (the prefilled default) or `"unknown"`. It prints on the
  traveler. A verified lot has to be distinguishable from a remembered one, or
  the default-and-confirm design would quietly launder guesses into records.
- **`role`** and `hazard` are written by the Receiving class cell. Before that
  flow existed nothing asked for them, so every received lot was born unable to
  trigger the flammables check, and the cure buy-off could not tell a hardener
  from a resin. (The one-time §6 resin/hardener co-location warning is gone —
  the team stores them together, lead decision 2026-08-28.)

The Activity feed is built from the `updatedAt` / `updatedBy` pair every record
already carried, plus comments and step buy-offs — no separate event log.
## Cure holds

The hold numbers ship in `resins.js`, each signed off by a lead. A lead can
write a per-resin override into `config/resins`, but only the hold and its
sign-off can move: the datasheet floor stays in code, and an override below it
is refused at write time **and** ignored at read time, so nothing can weaken a
hold from either side.

## Seasons and `archived` (v4.3.0)

Nothing is deleted to make room. Two axes, both in `core.js` beside
`inSeason()`:

| | |
|---|---|
| `recSeason(rec)` | read off the id (`P-SN5-001` is SN5); an explicit `season` field wins |
| `seasonCode()` | `config/season.code`, `"SN6"` when unset |
| `thisSeason(rec)` | the two agree |
| `isArchived(rec)` | the raw `archived` flag on a part, work order or R&D study |
| `setArchived(coll, ids, on)` | the one write path; stamps `archivedAt` / `archivedBy`, any roster member |

`inSeason()` now also requires `!archived && thisSeason()`, so the dashboard,
the Season blueprint and the Sheet mirror drop archived and last-season
records without any of those files knowing either flag exists.

The rails default to this season with archived hidden. Two chips, same
swap-not-add shape as R&D: the other-season chip (named after the season when
there is only one) adds last season back, and the archived chip *replaces* the
list with what is put away. `view.allSeasons` survives `setTab()` so a lead
reading the SN5 archive can walk Parts to Work Orders; `view.showArch` does
not.

Rolling a season over is one edit in Season settings. `fb.allocId` mints with
the new code and a fresh `<key>@<code>` counter, while the SN6 counter keys
stay byte-identical (re-keying a live counter resets it to 1 and mints
duplicates over real records).

`archived` is **not** `retro`. An archived run still enforces its gates if
somebody restores and works it; the flag changes where a record is listed,
never what it means.

## Accounts are self-serve

Sign-up is name, username and password. **A username is the synthetic address
`<u>@members.feb-composites.app`** (`USER_DOMAIN`, `loginEmailFor`, `userHandle`
in `core.js`), so every email-keyed path in the app is unchanged and the older
email accounts still sign in. `firestore.rules` lets an account create only its
own roster doc, as a member, with the four sign-up fields; leads keep roles and
removal.

**Removal is a nudge, not a lock.** A removed person can sign up again, so the
real lock is disabling the Auth user in the console. And a username account has
no password reset — recovery is deleting the Auth user and signing up again with
the same username.

## `rnd` is not a second `retro`

They look identical — a boolean whole-record modifier on `parts` that changes
what the record means everywhere it is read — and they are opposites in the half
that matters.

`retro` means two things at once:

- *not this season's plan* — `season.js`, `tracker.js`, the dashboard feed
- *do not enforce; this is a document, not a job* — the evidence gate, cure
  holds, blockers, the attention query, the training gate, the cure modal

`rnd` wants the first meaning and the **exact opposite** of the second. An R&D
part is real carbon on a real deadline: a mold shakedown that skips the
stack-freeze blocker is precisely how you get a bad shakedown, and an R&D cure
hold is a real cure hold with real resin and a real clock.

So **every `if (x.retro) return null` gate stays exactly as written and never
gains an `rnd` test.** If you are about to add one beside a `retro` one, stop —
the feature has silently become `retro` with a different word, and the only
thing that catches it is the test named *"AN R&D RUN STILL ENFORCES"* in
`test_app.mjs`. That test exists for you.

Three accessors, all in `core.js` next to `isLead()`:

| | |
|---|---|
| `isRnd(rec)` | the raw flag on a **part** |
| `inSeason(rec)` | `!retro && !rnd` — **the one predicate** every "is this on this season's board" site calls |
| `woIsRnd(wo)` | a run's programme, **derived** from its part through `partOf()`, falling back to the run's own flag only when there is no part |
| `recIsRnd(coll, o)` | the `(collection, record)` form, for the label, the nameplate and the label-sheet builder |

`inSeason()` is fused on purpose. `retro` is honoured in about twenty-five
places and forgotten in nine, and the reason is that every site has to remember
a flag test; a second flag on a second axis would double that. **Never spell out
`!p.retro && !isRnd(p)` by hand.**

`woIsRnd()` derives rather than stores, and that is what makes promotion **one
field write on one document**. A stored copy would make "promote this part" a
fan-out over every run it has, with no transaction across them and a
half-promoted state in the middle — and it would drift the moment somebody
confirmed a name guess or relinked a run.

**R&D is hidden in five places, and the difference between them matters.**

Two are absolute and are the point of the feature: `seasonRows()` and
`trackerRow()` (plus the Season toolbar's denominator, which is really the same
site twice — see below). A season blueprint that lists trials is overstating
what the season is, and the Sheet mirrors the blueprint.

Two are a SWITCH: `partIndexRows()` and `woIndexRows()`, via `view.onlyRnd` /
`view.woOnlyRnd`. Each rail is the season list **or** the R&D list, never both,
and the chip swaps between them. Off is the default, because in practice a
season's worth of coupons buries the parts you are actually building.

The switch is exclusive rather than additive on purpose: there is exactly one
question on screen at a time — *what are we building for the car* or *what are
we trying out* — and a merged list answers neither cleanly. It is also why the
flags are `onlyRnd` and not `fRnd`: `fLate`, `fMine` and `fDone` all narrow the
same list, and this one REPLACES it.

That default is a real risk — a deadline nobody sees is a deadline nobody meets
— and three things pay for it. All three have to stay true:

1. The chip is always rendered when R&D exists and carries its **count of what
   exists**, not of what is on screen. The rail says how many it is holding
   back rather than just holding them back.
2. **The dashboard, `deadlineItems()`, Reports and the printed traveler never
   filter R&D.** A late or blocked trial still surfaces on the landing page,
   which is where lateness is supposed to be found. Do not "tidy" R&D out of
   those; it is what makes hiding it on the rails survivable.
3. Both rails re-add the **selected/open record** after filtering, so arriving
   from a dashboard row, a ⌘K hit or a deep link opens the thing you clicked
   even while the rail is showing the other list. That is the one moment both
   kinds appear together, and it is the existing "never falls out from under
   you" rule doing its job rather than an exception to the switch.

Anything beyond those five is building a second archive. Search, the CSVs,
People, the schedule, inventory and budget all stay unfiltered.

The two Season sites are **one change, not two**. Filter the rows and not the
denominator and the toolbar reports parts it is not showing, which is the quiet
sibling of the release where the blueprint photographed empty because every
fixture was retro and nothing asserted on a count that was always zero.

**`onlyRnd` and `woOnlyRnd` are named differently from `fLate`/`fMine`/`fDone`
on purpose.** Every other flag on those rails narrows the same list; these two
swap it for a different one. A reader who assumes `fRnd` behaves like `fLate`
gets it wrong, so they do not get an `f` prefix.

**Never encode R&D in a part's name.** `"R&D — NOSECONE"` is the obvious
workaround and it breaks three things at once: `Sync.gs` matches rows on the
Part Name column, so a rename orphans that part's row in the Master Tracker and
tints it amber forever; `partOf()` falls back to a name match, so it silently
unlinks the part from its work order; and `nameTier()` gives a one-line label
only 20 characters, so six characters of prefix pushes most names to two lines
and deletes the mid row from the printed label.

## "R&D" means two things, and they must stay apart

Since 2026-08-28 there are two, and the shared word is all they have in common.

| | `parts.rnd === true` | the `rnd` collection |
|---|---|---|
| what it is | a real part | a coupon |
| owned by | the Parts tab | the R&D tab |
| also rendered on | the R&D tab's strip and bench | — |
| ids | `P-SN6-###` | `RDS-SN6-###`, `CPN-SN6-###` |
| has a traveler | **yes** — blockers, cure holds, evidence gates, buy-offs | **no** |
| read by `inSeason()` | yes | **never** |
| on the tracker feed | never | never |

An R&D **part** is real carbon on a real deadline, and every gate above still
bites — that is the whole point of the section before this one. An R&D
**coupon** is a test piece somebody cut this afternoon: no revision, no
signature, no cure hold, and a grid you type into like a spreadsheet.

**Somebody will try to unify them.** It looks like duplication and it is not.
Three lines hold it:

- `rnd.js` never tests `retro`. A test reads the source and asserts it.
- Nothing in the `rnd` collection is ever read by `inSeason()`, `seasonRows()`,
  `trackerRow()`, `partIndexRows()` or `woIndexRows()`.
- A coupon never gets an `rnd` boolean. It is not a part that is flagged; it is
  a different record.

**`rnd.js` does call `isRnd()` now, and that is not the fusion.** Until
2026-09-18 it did not, and this list said so. The programme strip changed that:
the tab renders the R&D parts and their runs beside the studies, so it has to
ask which parts those are. Reading the flag is not the danger — the danger is a
`retro` gate growing an `rnd` test, or a coupon growing an `rnd` boolean, and
both of those are still asserted above. The two record kinds stay apart in the
data; they simply share a screen.

### The R&D tab IS the home (2026-09-18, revised)

**This section said the opposite for about a day.** It said the tab was a lens
over records the Parts and Work Orders rails still owned, and that removing them
from those rails "would have cost the lineage bar, the scan landing, ⌘K, the
dashboard, Season's jump and the run-start header, and bought nothing". Simon
asked for the removal anyway, and the costs turned out to be one function.

**An R&D part or run is viewable and editable from the R&D tab alone.** Both
rails filter absolutely — `!isRnd(p)` and `!woIsRnd(w)`, no chip, no switch —
and `woPartsNoRun()` filters too (the sixth hide site, which the old "five
places" list never named: those rows carry the button that STARTS a run).

**`rdHome(tab, id)` in core.js is the whole mechanism.** Around twenty routes
can hand an R&D record to a tab that will not list it — a chip, the lineage bar,
the dashboard, ⌘K, Reports, a mold's Used-by row, a ticket's related parts. All
of them pass through `openRecord()`, so the redirect sits there instead of in
twenty callers. `consumePendingLink()` calls it too, which is safe precisely
because that function already waits for the record to arrive (that is what
`PENDING_GRACE_MS` is for), so it has the record in hand when it decides.

**`tabForId()` stays pure and prefix-only, and this is deliberate.** It takes an
id and nothing else; `P-` cannot tell a trial from a deliverable, and
`test_route.mjs` holds it in step with `fb.js`'s `ID_PREFIX`. Every caller that
needs the R&D answer has the record; that is where the question is asked. Do not
push a record lookup down into it.

Three consequences that are easy to miss:

- **The rails' "selected record is re-added" rule skips R&D.** That rule exists
  so an arrival cannot strand you on a rail that refuses to list what it opened.
  R&D arrivals are answered by the redirect instead, so re-adding one would be
  the last remaining way to view a trial from those tabs.
- **The R&D chips stay on both rails, as doors.** They still count what EXISTS,
  because a rail that hides work without saying so is the failure this whole
  feature exists to avoid. Pressing one now goes to the bench.
- **The prev/next arrows are hidden in the bench.** They walk the Parts and Work
  Orders rails, which no longer contain R&D, so from the bench they would
  teleport you to an unrelated season record. The strip is how you move there.

`newPart(true)` and `newWO(true)` are **moved, not mirrored** — a trial started
from the Parts toolbar would be invisible on the rail that made it. And
`setPartRnd(id, true)` follows the record to the bench, because a part that
vanishes out from under the person who just flagged it is worse than a tab
change they can see.

### What the lens section used to say

The tab shows all three kinds at once — a card per study, a card per R&D part
with its runs as chips inside it — over a full-width bench that renders the
**real** `renderPartDetail()` / `renderWODetail()`, not a summary of them. A
traveler without its blockers and buy-offs would be a screenshot of the work.

But it does not own those records:

- **A part's id still routes to Parts.** `ID_TO_COLL` is keyed on prefix, an id
  is printed on a label and pasted into Slack, and it must mean one thing.
  Reloading `#/P-SN6-101` lands on the Parts tab, one sidebar press from the
  bench. There is a test saying so, because it looks like a bug and is not.
- **`view.rdPane` is derived from `view.id` on every render and never
  persisted.** That is what makes `navBack()` work for nothing: `navHere()`
  records `{tab, mode, id}` and restoring the triple rebuilds the pane.
- **`renderRnd()` routes `view.id` rather than consuming it.** It used to null
  the field every render. It cannot: the detail renderers read `view.id` from
  dozens of inline handlers at *click* time, so a consumed id means a page that
  paints once and then answers every press about the wrong record.

**Superseded.** `onlyRnd` and `woOnlyRnd` are gone — not unused, gone, with a
test saying so, because a dead key on `view` is the kind of thing somebody wires
back up. See the section above for what replaced them.

**Two sticky bands.** The bench is the only screen in the app with two: the
strip, and the `.secnav` of the detail it renders. `.rdbench .secnav` and
`.rdbench .undobar` stack under the strip, and `--rd-strip-h` is declared on
`#main` rather than on `.rdstrip` — the bench is the strip's *sibling*, so a
property set on the strip never reaches it and every rule that subtracts the
strip's height would silently use its fallback.

### A study is a folder as well as a grid (2026-09-18)

A study groups **parts and runs**, not only coupons. The field is `study` on the
part, matching the coupon's own field name — not `studyId`, which would be a
third spelling of one relationship beside `study` and `parent`. The child names
the parent, like every other edge here.

**There is no `wo.study`.** A run's study is its part's, through `partOf()`.
Storing a copy would make moving a part a fan-out over every run it has, which
is the argument `woIsRnd()` is built on two sections above.

**Declined, so do not build speculatively**: std-dev and CV in the Compare fold,
and computed stress from specimen dimensions. Both have been asked for and both
were turned down — the grid is meant to beat a spreadsheet at capture, not to
become one.

This was declined twice before, on the grounds that "adjacency is what the link
was for" — the strip already puts a study and a part on one screen. What changed
is that adjacency cannot give the group a **name**, cannot answer "which of
these eleven parts belonged to the split-mold effort" six months later, and
cannot be filtered on.

Four things that would each have shipped as a bug, so do not undo them:

- **`rdIsParent` still means "has batches".** `rdChildren` is studies-only, so
  parts cannot enter it — but if they ever could, a study holding one part would
  start refusing coupons.
- **The study card counts parts and runs**, or a study with four parts and no
  coupons renders as empty.
- **`rdPartCard` asks `isRnd(p)`** before printing "R&D part" and the capsule. A
  study can group a season part, and hardcoding those was a lie in the exact
  place the badge exists to prevent one.
- **Both delete paths ungroup the parts.** The folder goes; the parts are real
  records with real travelers and stay, rather than pointing at an id that no
  longer resolves. Archive deliberately does **not** cascade: parking a study
  must not take a season deliverable off the board.

The assignment picker lives on the **study** and writes to the **part**. That is
not symmetry for its own sake — it is what keeps every reader of `DB.rnd` inside
`rnd.js`, which the cliff below depends on.

### Sections come in two tiers (2026-09-18)

`sectionCard()` emits `data-tier="work"|"ref"` and, when warned,
`data-warn="bad"|"hold"`. Work panels stay cards; reference sections (the ones
that already defaulted folded) are ruled rows. `secOrder()` puts all the work
sections first so the tier boundary is **one break** — interleaved, a ruled row
between two cards reads as a gap in a card stack rather than a second kind of
thing.

- **A warned section always promotes to a work card.** State beats kind, the
  same rule `secFolded` already applies to folds. `fresh` deliberately does not
  promote: it lives on one section, and a page that rearranges itself when
  somebody comments is worse than a flat one.
- **`bad` is red, `hold` is amber.** A run curing on schedule is a clock, not a
  fault; painting it the same red as an undisposed nonconformance both lies
  about the run and costs the tint its meaning, which is that the one card
  wearing it is the one that needs you.
- **No left spine on the work tier.** The header already carries a 3px skewed
  gold bar 11px from the card edge, and a second vertical accent beside it reads
  as a fault. Card-versus-flat needs no third mark — and it sidesteps the print
  block's `.card` shorthand, which resets any `border-left`.
- **The data- attributes go before the class list.** `test_app.mjs` pins this
  markup with regexes expecting `class` last, flush against the bracket.

### The disposition of an issue is two answers (2026-09-18)

`whatHappened` is the root cause, asked at raise. `dispositionNote` is what was
done, asked at disposal, required on **every** method with wording that varies
by method (`DISPO_WORDS`).

**`undisposedIssuesForWO` means disposed AND explained.** Requiring the note only
in `statusGate` was toothless: an issue counted as disposed the moment it had a
method, so picking Scrap dropped it out of the closeout modal and the work order
completed with nobody having written why the part could not be saved.

`reopenIssue` clears `dispositionNote` and keeps `whatHappened`. The root cause
is still true after a reopen; the account of the fix is not.

### One cliff, written down before it is hit

`rnd` is the twelfth whole-collection `onSnapshot` at boot, and coupons will be
the most numerous record type in the app inside a month — ten at a time, several
times a week, forever. Five hundred is nothing on shop wifi. Five thousand is
not.

**If `DB.rnd` passes about 2,000, take `rnd` out of `COLLECTIONS` and give the
tab a per-study query.** Nothing else in the app reads the collection, so it is
a contained change — but only while that stays true, which is the real reason it
is written here rather than discovered later.

The programme strip is the obvious thing to break that. It does not: every
reader of `DB.rnd` it added is inside `rnd.js` and inside the tab's own render.
Keep it that way. A dashboard line or a ⌘K entry over the collection would be a
whole-collection scan, and the day the per-study query is wanted it could no
longer be had without unpicking them first.

## Retro records say so, and never on paper

The 26 imported SN5 runs store the literal string `"not recorded (retro)"` in
most fields, because a blank and an unknown are different things and the import
had to keep them apart. `pv()` in `print.js` maps it back to empty so it never
reaches paper looking like data — a printed traveler saying "not recorded
(retro)" in a box somebody is meant to write in is worse than an empty box.

`stripCS()` in `workorders.js` does the same job for standard references, at
render time, on legacy and retro records: titles, notes and event-log text.
Stored data is untouched, so the archive keeps its original wording.

## The public surfaces

There are two deliberate public holes, and both are narrow on purpose.

**`pub/<ID>`** backs the scan nameplate. Firestore rules cannot filter fields
(`allow read` is all-or-nothing per document), so the public page cannot read
the real records — it reads a mirror carrying nine whitelisted fields, all of
which are already printed on the physical label. `pubProjection()` in
`labels.js` builds it and a `hasOnly()` clause in `firestore.rules` rejects any
write carrying anything else, so a bug in the projection cannot publish a layup
stack or somebody's email. `get` is public; `list` stays behind the roster, so
the collection cannot be dumped.

**`tracker/<token>`** backs the sheet sync, and is the wider of the two: the
whole season's part list plus engineer names and comment text. What protects it
is a 32-character random token minted by a lead and kept in `config/tracker`,
never in source. `list` is denied to everyone including leads, so the token
cannot be recovered by enumerating the collection.

`tools/test_pub_rules.mjs` checks all of this against the emulator, including
the regression that matters most: that `workOrders`, `parts`, `roster` and
`budget` are all **still** 403 to an anonymous caller.

A mirror failure only warns to the console, deliberately — telling someone their
save failed when it did not is worse than a stale nameplate. **Rebuild scan
mirror** under Reports covers records that predate the feature and writes that
bypass `save()` (`mutateField`, `appendTo`).

## Why the sheet sync is shaped like that

Hosting is static, there are no Cloud Functions for this and no service account,
so there is nowhere here to run a timer; and the app must not grow a Google
sign-in, for the reason `gdocs.js` gives at length. So the timer lives inside
the spreadsheet as a bound Apps Script that **pulls**, and the app publishes one
document it can fetch with no credential.

The binding constraint on the snapshot is Firestore **index entries** — 7.5 KiB
each, 20,000 per document — not the 1 MiB document limit. That is why it stores
one compact JSON *string* per part rather than an array of maps, which also
means the Apps Script does one `JSON.parse` per row instead of walking
Firestore's `{mapValue:{fields:…}}` shape.

It is a whole-table rewrite rather than a per-record mirror, which makes it
self-healing in a way `pub` is not: a failed `pub` write is only repaired by a
later save of that same record, whereas here the next successful save of any
part republishes everything. It rides on `fb.save()` and `fb.del()` behind a
four-second debounce, because every field edit in `parts.js` is its own
`updateDoc` and tabbing through a record would otherwise republish a dozen
times.

## Uploads

`storage.rules` checks the file **extension** as well as the content type,
because a browser has no MIME type for a `.SLDPRT` — it arrives as
`application/octet-stream`, and allowing that on its own would allow any binary
under any name. The type is still checked, and that is the actual security
condition: nothing writable here can be served as something the browser will
render, which is what would turn an upload into stored XSS against the whole
team.

Rich text is sanitized with the vendored DOMPurify before storage and again
before display. `proseHtml()` in `core.js` decorates *after* sanitising to add
`.tblwrap` and `.cgal`, because `class` is not allowlisted and authors therefore
cannot ask for either.

## EH&S tag normalising

A UC EH&S tag is 24 characters, `CA` + sixteen zeros + six hex. Across the 627
real tags in the RSS export **positions 0-18 never vary**, so an undifferentiated
strip is mostly shared prefix — which is why `invEhsShort` shows the twelve edge
characters in four-character groups, last group at full weight and the rest at
half. The dim half must stay legible rather than decorative: it is what gets
compared against the sticker.

**Any new writer of `ehsBarcode` calls `ehsNorm`, and comparisons go through
`ehsKey`.** Two tags that differ only by case or spacing are the same tag, and
the one place that forgot it produced a duplicate nobody could see.
`ehsResolveTyped` accepts the twelve edge characters as a lookup with a floor of
12, and an ambiguous tail returns no id rather than a guess.

## The receipt parser

`✨ Fill from receipt` is the app's one Cloud Function (`functions/index.js`,
`parseReceipt`): the client sends the storage path, the function checks the
caller against the roster, downloads the image, asks a Haiku-class Claude model
for the line items, and returns them. The Anthropic API key lives in a Functions
secret, server-side only — a key readable by the roster would be an open spend
faucet, which is why the client-side option lost.

Functions deploy separately (`firebase deploy --only functions`, after
`firebase functions:secrets:set ANTHROPIC_API_KEY`) and never ride along on a
hosting deploy.

## Anything that touches a screen edge

The app draws under the status bar deliberately (`viewport-fit=cover`,
standalone PWA, translucent status bar), which is what lets the topbar meet the
Dynamic Island instead of sitting under a white letterbox. Two rules follow:

1. Use the `--sa-t` / `--sa-r` / `--sa-b` / `--sa-l` tokens, never `env()`
   directly. The indirection is what lets `test_safearea.mjs` simulate a phone.
   Insets belong on the base rule, not inside a `max-width` block: a landscape
   Pro Max is 932px, so it takes the desktop rules and still has an island.
2. Anything sticky under the topbar offsets from `--topbar-h`, never a pixel
   count. The topbar's height depends on the top inset, so `top: 62px` is right
   on a laptop and puts the element *behind* the bar on a phone.

## CSS lives in two places, and only two

All screen CSS is in the `<style>` block in `index.html`; the printed sheet is
`print.css`. Responsive rules go in the single block at the END of that
stylesheet — at equal specificity the later rule wins, and keeping them together
is what makes the cascade predictable. Rules scattered back up next to their
components are a bug waiting to happen.

Two rules in there are load-bearing and easy to undo. **`.sline` and `.shead`
share one declaration of eight fixed grid tracks** on the Season blueprint,
because a header and its rows drifting apart is the bug that declaration exists
to prevent — do not reach for `columns:` on `.seasongrid` a third time. And
**`render()` snapshots and restores every `.plist` rail's `scrollTop`**, keyed by
`aria-label`, so anything new that scrolls inside `<main>` and has to survive a
repaint should either be a `.plist` or get the same treatment.

`print.css` is deliberately **not** inside `@media print`, so the sheet renders
identically on screen and on paper. That is what makes the preview trustworthy
and lets the design be reviewed from a screenshot. Label CSS lives there too and
never in `index.html`, because `downloadSheet()` fetches `print.css` and inlines
it — anything in `index.html` vanishes from every saved sheet, and a saved sheet
on a phone at RFS with no wifi is the case that matters.

`labelSheetHtml()` must never reuse `fitSheetHtml()`, `LAYOUTS` or `MAX_PAGES`.
Those exist to squeeze a work order onto two pages via a ladder of candidate row
counts measured most-generous-first; they mean nothing for a fixed label grid.

`05 Design System/` was extracted from this stylesheet rather than imported by
it, so there are two copies of the same design and nothing but
`tools/test_designsystem.mjs` holding them together.

## The QR arithmetic

The QR encodes `HTTPS://FEB-COMPOSITES.WEB.APP/Q/<ID>`, uppercase, no query
string, no fragment. QR alphanumeric mode covers only `0-9 A-Z space $%*+-./:`,
and staying inside it keeps a 45-character URL at version 3 (29 modules) with
error-correction level Q, 25% recovery. One lowercase letter, one `?utm=`, or a
switch to a `#hash` route drops it to byte mode, which needs version 4 and only
gets level M. Nothing about the printed label looks different; it just scans
worse once it has resin on it.

`tools/test_qr.mjs` asserts the module count is exactly 29, and that single
assertion is the whole guard.

The same arithmetic caps an ID at 14 characters (47 − 30 of host − 3 of `/Q/`).
Everything in the grammar fits. It did not always: when a coupon was a substring
of a panel, `PNL-SN6-006-C03` at 15 characters was one over, and coupon labels
were text-only. A coupon is now a first-class `rnd` record at `CPN-SN6-042`,
eleven characters, so it carries a QR like everything else. The rule did not
move; which ids satisfy it did. `test_qr.mjs` keeps the old spelling as a
counterfactual so the cliff stays proven rather than assumed.

## Why the roll printer has no address in the app

A browser cannot open a raw TCP socket, so the usual way to drive a label
printer — port 9100 — is not available to us at all. Nor is its HTTP interface:
the app is served over HTTPS from `feb-composites.web.app`, and an HTTPS page
`fetch`ing `http://192.168.x.x` is blocked as mixed content. Every "just POST to
the printer" design dies on one of those two.

What is left is the operating system's own print path. The phone discovers the
printer over Bonjour, `window.print()` reaches it through AirPrint, and the app
never learns an IP, a port or a token. That is why **Label media** has a stock
picker and no address field: there is nothing to type, and a printer that does
not appear in the print dialog is off the network rather than misconfigured
here.

The cost is a print dialog per label. Removing it needs an always-on machine in
the shed — the app writes a job to Firestore, something in the shed watches for
it and prints — and there is no such machine. If one ever appears, the API key
for whatever service does the printing belongs in a Functions secret and not in
`config/`, for the reason the receipt parser already sets out.

The geometry is why none of this cost a redesign. On a QL the roll's width runs
across the print head and the length along the feed is whatever you cut, so
29 mm stock cut at 101.6 mm **is** the Avery 5161 cell. `labelHtml()` was
already written against that number for exactly this day. `labelMarkup()` is the
one place the markup lives, and `tools/test_label_roll.mjs` asserts the sheet
and roll labels come out byte-identical, because a fork is how the printed label
and the public scan card start disagreeing about what an object is.

`.roll-page` is deliberately not `.ws-page`: `sheetFileHtml()` injects
`@media print { .ws-page { padding: 0 0.45in } }` into every saved standalone
sheet, and 0.45 in either side of a 101.6 mm label leaves nothing. The preview
would look right and only the saved file — the copy printed at the bench with no
wifi — would be wrong.


**`labelSheetHtml()` must never reuse `fitSheetHtml()`, `LAYOUTS` or
`MAX_PAGES`.** Those exist to squeeze a work order onto two pages through a
ladder of candidate row counts, measured most-generous-first; they mean nothing
for a fixed label grid, where the geometry is the printer's and not the content's.

Do not replace that ladder with fixed row counts either. The point of measuring
is that a sparse work order gets room to write in and a dense one still lands on
two pages; a fixed count gives one of those away.


**Laminated tape was checked and rejected on print height, not on price.** A
Brother PT-P750W takes 24 mm TZe laminated tape — IPA-proof, −80 to +150 °C —
and does support AirPrint, so it was a real candidate. Its maximum print height
is **18 mm** against the 21.4 mm this label needs (25.4 less a 2 mm margin top
and bottom), so it cannot print this label at all without a tighter redesign and
a QR dropped from 21.4 to about 17.5 mm. Tape also runs 3–4× the cost per label.

The direct-thermal path was chosen knowing the labels fade in UV, blacken with
heat and smear under solvent: they are for shelves, bins and lots indoors, and
anything meeting a post-cure oven or an IPA wipe gets polyester off the sheet
printer instead. Do not "fix" that weakness by switching to tape without redoing
the vertical budget first.

## The boot splash is a gate

A cold load at RFS used to show a white page, so the splash holds the screen
until the app can actually be used. Three things in it are load-bearing:

- **`splashAuth()` marks `data` as not needed** when auth resolves to
  `signedout` or `pending`. Without that the gate hangs in front of exactly the
  people who need the sign-in card — there is a test named for this.
- **`hideSplash(true)` must keep working.** Eight visual suites go through it;
  if it stops forcing, every one of them photographs a splash screen.
- **`splashFail()` returns early when nothing is outstanding**, because the 12s
  backstop fires on healthy boots too and would otherwise report a failure that
  did not happen.

A failed lamp is a hollow amber ring by shape, not a filled dot — the same rule
as everywhere else here, that hue is never the only carrier.

## The dashboard

The grid class is `.dboard`, because `.board` belongs to the Tickets kanban.

The work list merges a part and its work order into one row: the SN5 archive
proved the double-counting overstated "behind" by about 40%.

Nothing that renders empty on the team's own archive sits above the fold. That
is a layout constraint, not a preference — it is what stops the board reading as
a wall of zeroes on a quiet week.

**A lane cannot ship without an empty state.** `laneShell()` requires `emptyFn`
and throws without one, which is the mechanical form of the rule above.

**Nothing is scored across lanes.** `actScore` tiers sit 50 apart because the
bonuses sum to 45, so a bonus can reorder within a tier and can never promote a
row past one. `test_app.mjs` pins the arithmetic.

## Reviewing a UI change

`.claude/agents/ui-reviewer.md` is a read-only reviewer that scores a screen 0–5
on eight axes (scan speed, signal-to-ink, colour semantics, interaction cost,
wayfinding, hierarchy, responsive integrity, house fidelity) and passes only at
no-axis-below-3 and average ≥4 — the same bar as the `simon` reviewer in
`00 Agent/`. Worth running before any UI change lands: the string assertions in
`test_app.mjs` will happily pass a screen that draws every fact twice, and did.

Shoot the images with `tools/shoot_ui.mjs` first; it asserts nothing and is a
camera, not a test. See `tools/README.md`.

## The file map

| File | What |
|---|---|
| `index.html` | Markup and all screen CSS (sidebar, board, modal, avatars, pickers, doc viewer) plus script includes |
| `core.js` | Shell: sidebar and topbar, tab router, auth and roster, modal system, avatars, HTML sanitizer, multi-select picker, shared store |
| `fb.js` | The only file that imports Firebase (auth, per-collection sync, writes, file upload) |
| `workorders.js` `parts.js` `molds.js` `projects.js` `timeline.js` `weeklyplan.js` `budget.js` `people.js` `dashboard.js` `documents.js` `inventory.js` `stock.js` `reports.js` | One tab each; they reach Firebase only through core's `save()` and `del()` and `fb.*` |
| `shop.js` | The schema engine for the physical world — molds, items and material lots all run on it, which is what makes one record type behave like the next |
| `receiving.js` | The receiving desk: many things, onto many shelves, in one pass. Sibling of the Budget line grid and inherits its no-render-on-cell-edit rule |
| `slicer.js` `packer.js` `slicer.worker.js` | The mold planner. `slicer.js` (geometry) and `packer.js` (blanks → cut list) are **pure**: no DOM, no Firebase, no globals, so both are fully testable under node. The worker runs the slicer off the main thread |
| `stackview.js` | The exploded isometric view of a mold stack |
| `rte.js` | The comment and description composer: one COMMANDS registry, three shells, the paste pipeline, and the shared comment/thread rendering |
| `scan.js` | Pointing the phone at a label from inside the app, plus the Move and advance bench actions |
| `resins.js` | The resin systems and their cure holds. Deep-links six datasheet PDFs **by path**, which is why those files must stay served even though they are unlisted |
| `gdocs.js` | Google Docs, Slides and Sheets attached to the records they belong to. Its comment explains at length why the app has no Google sign-in |
| `facts.js` | The dashboard fact of the day, mined from the team's own SN5 documentation |
| `print.js` `print.css` | The printed work-order traveler. Styles are deliberately outside `@media print` so the sheet can be previewed and reviewed on screen |
| `tracker.js` | The Google Sheet mirror feed: builds the whole-table snapshot the Master Tracker's Apps Script pulls, and the lead-only setup that mints its secret token. The field list in it is a security boundary, not a convenience |
| `labels.js` | The label sheets and `pubProjection()`, which is the other security boundary |
| `meshview.js` | The rotatable 3D mold-in-stock view. Hand-rolled WebGL, no dependency: pure camera maths tested under node, thin GL glue that only runs in a browser |
| `drawings.js` | The printable engineering drawing set for a stack plan: general isometric, a third-angle three-view, then one dimensioned sheet per layer. The mold under the blocks is a silhouette traced off the stored STL. Pure string-building, so the whole set is asserted under node |
| `stlio.js` | Writes binary STL and shrinks a mesh to fit storage. Serves both the stock export and the stored viewer mesh; the slicer's own `parseSTL` reads back what it writes |
| `samples/*.stl` | Three sample molds offered in "Plan a mold", so the planner can be tried without exporting anything from Fusion. Built by `tools/gen_sample_molds.mjs`; fetched on demand, not at page load |
| `vendor/purify.min.js` | DOMPurify 3.2.4, self-hosted with an SRI pin. Was a CDN load, which meant rich text silently fell back to plain text whenever the shop wifi dropped |
| `firebase-config.js` | Project config, as `window.FIREBASE_CONFIG` |
| `docs/` | Bundled reference docs and the generated `manifest.json` |
| `sn5-*.json` | Retro SN5 archives, the seeds for "Load SN5 archive". The stock one is the board rack SN5 left behind; the stack planner picks thicknesses from what you own, so on a fresh project it has nothing to plan against until this is loaded |
| `../sheets/Sync.gs` `../sheets/README.md` | The other half of the sheet sync, which lives inside the spreadsheet rather than here |
| `../firestore.rules` | Server-side access control, the actual security |
| `../storage.rules` | File-upload access control |
| `../firebase.json`, `../.firebaserc` | Hosting, rules and emulator config |

## Regenerating bundled data

- `python3 tools/gen_sn5_seeds.py` rebuilds the SN5 parts and timeline seed JSON.
- `node tools/gen_sample_molds.mjs` rebuilds the three sample molds in `samples/`.
- `python3 tools/gen_docs_manifest.py` copies the datasheets, standards and
  printables into `app/docs/` and rebuilds `docs/manifest.json`. Re-run it
  whenever a datasheet or CS standard changes. It still copies every file; the
  `UNLISTED` set at the top decides which categories get a manifest entry, and
  Datasheets and Standards are in it as of 2026-08-18.
