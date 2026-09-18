# Changelog

Every released version of the FEB Composites app, newest first.

Releases are cut with `node tools/release.mjs <version>`, which tags the commit,
deploys hosting, publishes the GitHub Release with the Fusion add-in attached,
and stops. See [the release section of the tools README](tools/README.md).

It used to print a `#composites` note for a human to paste, with a picture or
two to attach. Simon does not send those (2026-09-17), so the note is gone and
the pictures are opt-in (`--shots`). What reaches the team is the **What's New**
panel in the app, which is hand-written every release and which the script
refuses to ship stale.

## Two apps, two tag series

Since September 2026 the repo also holds the CFD dashboard. The composites
app keeps the bare `vX.Y.Z` tags this file has always used, so every existing
tag and link stays valid. The dashboard tags as `cfd-vX.Y.Z` and keeps its own
changelog in its folder. `tools/release.mjs` only looks at bare `v` tags.

The FEBPlanStock Fusion add-in has no series of its own. It carries the app's
version and ships as a zip attached to the app's GitHub Release, so a `v4.9.0`
release page holds both the notes and the add-in a member downloads. That is
also why every `vX.Y.Z` from v4.2.0 on is tagged: the tags were backfilled on
2026-09-17 after five releases had gone out untagged.

## What the numbers mean

The app is a shop tool, not a library, so the scale is about **what the team has
to learn**, not about API compatibility:

- **Major** (`2.0.0`) — a new top-level area, or the way the team works changes.
  Navigation moves. People need telling before they open it.
- **Minor** (`1.1.0`) — a new capability inside an area that already exists.
  Worth a line in What's New; nobody has to relearn anything.
- **Patch** (`1.0.1`) — fixes and copy. Nothing new to learn.

---

## v6.1.0 — 2026-09-18

- R&D records are on the R&D tab, and only there
- One Notes place, a stepper per mold, and two more subteams

---

## v6.0.0 — 2026-09-18

- Document the five changes, and what not to undo
- A clock is not a fault, the appendix is one break, and Details groups in edit too
- An R&D study is a folder: it groups parts and runs, not only coupons
- A part can be made on several molds
- A part shows what it looks like
- Sections come in two kinds now, so the differences mean something

<details><summary>3 more</summary>

- Three heading levels instead of seven, and the mold's location gets a slot
- Disposing an issue now records what was DONE, not only what happened
- A disposed issue tells its story again, and its chip stops being a dead press

</details>

---

## v5.2.1 — 2026-09-18

- The whole card is the press, runs get their own foot, and the cards carry facts

---

## v5.2.0 — 2026-09-18

- Finish the programme strip: coverage, the Season jump, and the docs
- The programme's three create doors, and the tests for search and counts
- R&D parts and their runs join the strip, and the bench renders the real detail
- The masthead and the programme strip replace the R&D index
- CSS for the programme strip and the bench, not yet referenced
- The three view.tab gates admit the R&D bench

<details><summary>1 more</summary>

- R&D router: view.id becomes the bench's selection instead of being consumed

</details>

---

## v5.1.0 — 2026-09-17

- What's New for v5.1.0: the Reports tab
- Reports reads like a page somebody wants, and its board prints like a sheet

---

## v5.0.0 — 2026-09-17

- Releases stop waiting on a note nobody sends
- SESSION-STATE: the whole bundle is live, and the file says what it costs to rediscover
- Every delete goes to Recently deleted, and only a lead empties it
- Soft delete, filtered in one place, with nothing wired to it yet
- SESSION-STATE: techniques are live, and the fallback question shipped
- Leads can add a layup technique from the app, checklist and gates and all

<details><summary>19 more</summary>

- A run stamps which checklist it came from, and titles stop making blockers
- config/techniques folds over STD_STEPS, and the two-vocabulary map stops disagreeing
- SESSION-STATE: the whole mold and cut-list bundle is live
- The mark-cut confirm is a review pane: every offcut is a row you can correct
- The 6in section split can be waived per mold, and says so on the drawing
- Datum cut plans live on the mold, and a PDF opens without leaving the app
- packBoard partitions its remnants instead of dropping the small ones
- SESSION-STATE: chunks 0-4 are live
- The cut list proposes only molds still at Designed, and cutting moves them
- SESSION-STATE: the storage assertion was bad, not the rules
- "Tooling cut": the blanks are off the saw but not yet a stack
- MOLD_TRACK, so the stage bar's denominator survives a new stage
- The stackplans contentType assertion was testing octet-stream, not PDFs
- storage.rules had no molds/, items/ or lots/ tree, so Shop-tab photos never uploaded
- The ADDIN_VERSION comment says where the number comes from
- One version and one release page for the app and the Fusion add-in
- Release addin-v1.1.0, and stop git describe shouting on a first release
- Document the add-in install around the download, not around a git clone
- FEBPlanStock 1.1.0: a zip anyone can install, instead of a folder to copy

</details>

---

## v4.8.0 — 2026-09-16

- Select… on every list tab. Molds (molds and unlinked plans together), Boards, Purchases, Documents (uploads only), R&D studies, Schedule weeks, the Season blueprint and People get the same picker Parts, Work Orders and Inventory had: a Select… button where the tab's actions are, then All / None / N selected / Delete N / ✕, a box on every row, the whole row toggles. One shared implementation in core.js, so every tab reads the same way. All picks what is on screen, so a filter, a folded-away past week or the archive are respected. Leaving a tab drops a half-finished pick
- Each delete is one confirm that says what goes with the records: a mold's stack plans and their meshes, a purchase's receipt, an upload's file, a study's batches and coupons (with the undo bar), a week's goals and carpools. The single-record Delete buttons now go through the same functions, so a mold's own Delete cascades to its plans too instead of leaving orphans on the rail
- Delete is offered only where the rules allow it: lead-only lists show Select… to leads; R&D and Inventory stay open to every member; People never lets you pick yourself
- Fixes on the way: the Inventory picker now clears on tab change too, and the Fusion section on a mold card has its style defined

---

## v4.7.2 — 2026-09-16

- Cut list: blank labels no longer run across neighbouring rectangles. Each label sits in a nested, clipping SVG the size of its blank, the layer tag is on its own line, and the plan name above it is shortened with an ellipsis to fit; the full name is the tooltip. Blanks too small for a line get nothing rather than a fragment

---

## v4.7.1 — 2026-09-09

- Molds: the layers of a stepped stack line up. Each layer's blank was rounded to the half-inch and centred on its own slab, so a drafted wall shifted every layer's edges by a fraction of an increment and the corners of a glued stack did not overlay (seen on a two-layer plan drawn in Fusion). Now every blank in a plan snaps outward to one half-inch lattice anchored on the bottom blank's corner: equal-size layers coincide exactly, steps are whole half-inches, the bottom blank is unchanged. Re-plan a mold to get the aligned version
- The bottom-face hand-off was run end to end inside Fusion over the built-in MCP server (`10 Fusion Add-in/tools/fusion_mcp.py`): the picked face, the rotated export, and the oriented boxes standing on that face all checked out

---

## v4.7.0 — 2026-09-09

- Fusion add-in: Plan stock takes an optional bottom face as well as the mold body. A mold that is not modelled bottom-down (a split mold rotated 90 degrees, say) is laid flat on the picked face before export, planned upright, and the stock boxes come back drawn in the model's own orientation. The frame matrix is stored on the plan; the app's stock STL export applies its inverse so the export still lands on the CAD model, and the mold card says which way the picked face faced
- The frame math lives in `10 Fusion Add-in/FEBPlanStock/febframe.py`, free of the Fusion API so `tools/test_fusion_frame.py` runs it under plain python3; `slicer.js` gained the matching inverse

---

## v4.6.0 — 2026-09-09

- Molds: an STL can be planned as one solid block instead of stepped layers. The mold modal has a Blank shape choice under the STL fields; stepping stays the default, and a block gives every layer the whole mold's footprint plus margin, so the glue-up is one rectangular brick with nothing to line up. Re-planning a mold keeps the shape it was last planned with, and the plan page says "as one solid block"
- The cut list, drawings, sections and STL export are unchanged by the choice: a block layer is one rectangle per board, packed onto sheets with the same straight-through cuts

---

## v4.5.1 — 2026-09-07

- Fusion hand-off: a mesh that arrives before the palette is signed in, or before the rack has loaded, waits and opens by itself once both hold, instead of opening over the sign-in card and refusing every density
- Fusion hand-off: the add-in can sign the palette in with a shared team account from a credentials file, so members never see the sign-in card; the mold still records the Autodesk user who exported it
- Fusion add-in: running Plan stock after closing the palette works again (the closed palette was wrongly treated as an unloaded page), and a page that stops answering is reloaded and given the mesh again

---

## v4.5.0 — 2026-09-04

- Molds: Plan stock from inside Fusion. The FEBPlanStock add-in (10 Fusion Add-in/) exports the selected body, hands it to the mold modal in a Fusion palette, and draws the planned blanks over the mold as semi-transparent bodies
- Molds: a Fusion section on the card names the document, body and version a mold was planned from, with a link to its Fusion Team page
- No rules change: the block rides on the existing molds create/update rule

---

## v4.2.0 — 2026-08-29

- Budget: two status tracks, because a purchase always had two lives
- Budget: Charged to, for spend that is real but is not composites' line
- The over-$50 gate moves onto the money track, where it belonged

---

## v4.1.1 — 2026-08-29

- The EH&S row's last group carries the weight, settled against 627 real tags
- SESSION-STATE: v4.1.0 is cut, pushed and live
- The v4.1.0 release picture

---

## v4.1.0 — 2026-08-29

- Inventory reads an EH&S tag the way the sticker prints it
- The RSS tags are Data Matrix, and now we know it from a tag
- The standards move to Google Docs as the editing surface
- Shorter reading everywhere Simon asked: README, What's New, and CS-012 §7.8
- CS-001/002/013 catch up with the R&D bench; CS-012 stops ruling printer types out
- Untrack tools/.venv: a symlink slipped past the ignore pattern

<details><summary>9 more</summary>

- Labels on a roll, and a label with nothing behind it
- R&D round two: delete, labels, photos, export, and a template
- Announce this release reaches the width the app is actually used at
- SESSION-STATE: v4.0.0 is live, rules deployed first and separately
- Figure captions: number once, not twice
- README + SESSION-STATE: record the figure pipeline and the branch's state
- CS-000..013 + INDEX: the engineering pass — normative language, figures in every process standard, two docs out of outline
- CS standards, figure pipeline: markdown images now reach all three outputs
- CS standards, figures: 13 hand-drawn SVG diagrams and the renderer that rasterizes them

</details>

---

## v4.0.0 — 2026-08-28

- Release prep for v4.0.0: What's New, the two pictures, and a wasm MIME fix
- Compare reports the precision it was given, not two decimals
- The R&D bench: coupons get a home that is not a work order
- The splash becomes a gate, and the lights go out to open it
- SESSION-STATE: v3.2.0 is cut and live; the announce press and Slack note are Simon's, pending

---

## v3.2.0 — 2026-08-28

- Release prep for v3.2.0: WHATS_NEW and the two pictures
- Inventory sections become their own cards; phones put the name first
- EH&S import: per-row unticks, and the location sections get room to breathe
- Inventory round 2 lands whole: scan-into-field, and the materials table
- Inventory Select…: mass delete for jugs, open to the whole roster
- Inventory round 2, first landing: grouped containers, sections, co-storage, iOS zoom

<details><summary>8 more</summary>

- EH&S barcodes, phase 4: the RSS export imports, and reconciliation exports back
- EH&S barcodes, phase 3: iPhones get camera scanning through vendored zxing-wasm
- SESSION-STATE: EH&S phases 1-2 live and verified; 3-4 paused per Simon, handoff posted in chat
- EH&S barcodes, phase 2: the scanner reads the university's tag
- EH&S barcodes, phase 1: the UC tag becomes a second identity for chemicals
- Step buy-off cluster stops poking into the landscape safe-area inset
- The mold's stage becomes a stepper, in the Parts idiom
- SESSION-STATE: v3.1.0 is live, and one Announce covers both releases

</details>

---

## v3.1.0 — 2026-08-27

- What's New: v3.0.0 was an hour ago, not last week
- Season: one part per line, on columns you can scan down
- SESSION-STATE: v3.0.0 is live, and nobody has been told yet

---

## v3.0.0 — 2026-08-27

- Write the v3.0.0 What's New and shot list
- Guest mode is switched on, and the app is publicly readable
- The program and the shop's footer go side by side, and team lore gets a surface
- The guest door recognises the code the SDK actually throws
- The guest door catches, so a refusal is a sentence rather than silence
- Re-shoot the dashboard and season mockups, and their captions

<details><summary>9 more</summary>

- View as guest: the whole app, read-only, with no account
- The dashboard becomes a pit board: four lanes, and none of them can vanish
- The dashboard learns what you can actually do right now
- The splash waits, the blueprint became a read, the cut list reached paper
- AUDIT_NET, and the sanitizer suite stops waiting on a CDN
- test_q_landing was talking to production Firestore, not to nothing
- The app loads per file, so coverage can finally name one
- SESSION-STATE: v2.2.2 is live and main matches it
- The two v2.2.2 release pictures

</details>

---

## v2.2.2 — 2026-08-27

- SESSION-STATE: main is ahead of live, and the printed note is stale
- The R&D chip swaps the list instead of adding to it
- The two v2.2.1 release pictures

---

## v2.2.1 — 2026-08-27

- release.mjs: --shots, for a patch that does have something to look at
- R&D is out of the rails by default, and the list fade stops eating the last row
- The two v2.2.0 release pictures

---

## v2.2.0 — 2026-08-27

- What's New for v2.2.0: the R&D build, in the team's words
- Rebuild the CS docx, and fix the encoding bug that made it unsafe
- R&D parts: real work that is not a season deliverable

---

## v2.1.2 — 2026-08-26

- Datasheets back on the Documents tab, printables guide off
- SESSION-STATE: the Season WIP banner is meant to come off

---

## v2.1.1 — 2026-08-26

- Mark the Season tab a work in progress
- The #composites note is WHATS_NEW, not commit subjects
- SESSION-STATE: v2.1.0 is out, and the Slack note still guesses

---

## v2.1.0 — 2026-08-25

- What's New for the board and work-order release
- A shelf card reads top of the pile down
- One row per board on the rack, not one row per size
- Sort the rack, plan molds across a density range, and delete work orders cleanly
- Write down what v2.0.0 actually was, and what shipping it taught

---

## v2.0.2 — 2026-08-25

- The release script stops writing the team's release note for them. It bumps
  the version and checks that a human rewrote What's New since the last tag,
  rather than generating it from commit subjects and overwriting the rewrite on
  the next release.

---

## v2.0.1 — 2026-08-25

- What's New reads like a note to a person rather than a changelog.
- The deploy's live-check retries instead of failing on a good deploy that the
  CDN had not finished serving yet.

---

## v2.0.0 — 2026-08-25

The season plan moves into the app, and the board is rebuilt around the app that
exists after v1.0.0.

### Added

- **The Season tab** — the blueprint, and the end of running the season off the
  Composites Master Tracker spreadsheet. One row per part the team means to
  make, thirteen columns, most cells empty by design: a row that exists with
  nothing in it is a commitment to build the thing. A row **is** a real part
  from the moment it exists, so there is no promotion step — "making the real
  part file" just means filling the row in. Every cell edits in place; the three
  stage columns are colour-coded and still go through the evidence gate and the
  skip-ahead confirm; the part name stays pinned while the other twelve columns
  scroll. This season only, and the Google Sheet is downstream now.
- **Photos on an issue after it is raised**, from the work order — a thumb strip
  and a camera button on each row, joining the run's lightbox set.

### Changed

- **The dashboard stopped saying things twice.** Shop status is now only what is
  blocked and what is curing; the inventory counters became Stock & housekeeping
  at the bottom, where a monthly habit belongs. The alert strip owns the T-minus
  outright. And an issue folds into the run it holds up, leaving a flag with the
  count still open — every issue has a work order, so the board had been listing
  the same run twice, the same double-count that once overstated "behind
  schedule" by about 40% for parts and work orders.
- **Creating or editing a part opens on Details**, instead of below Progress,
  the layup stack, the materials plan and the runs. The same fix work orders got
  in v1.0.0.
- The dashboard's Season module is now **Build progress**, which is what its
  three bars show. The tab took the word.

### Fixed

- The three stage columns carried their state class on the `<select>` rather
  than on a wrapper, which matched no rule in the stylesheet — so the colour
  coding rendered plain white while looking entirely correct in the DOM.
- Test fixtures described a part list with no current season in it (all 33 are
  `retro`), so the Season tab and the Google Sheet feed — which both exclude
  retro — were photographed empty by every screenshot and browser suite.

---

## v1.0.0 — 2026-08-25

The first named release. Also the release that turned the app from a project
tracker into a work tracker.

### Changed

- **Issues live on the work order now.** A work order has an Issues section:
  what is open, what it was disposed as, and a button to raise the next one.
  Resolving from there goes through the same CS-003 gate as everywhere else, so
  a run still cannot complete over an undisposed issue.
- **The Tickets tab is shelved.** The app stopped being a place to track
  projects. Every existing ticket is still in Firestore and still opens from a
  link or a chip — it is only off the sidebar. See
  [`06 Composites App/app/SHELVED.md`](06%20Composites%20App/app/SHELVED.md) for what was paused and how
  to bring it back.
- **Work Orders filter on open issues**, so "which runs are held up" is one chip.
- **Creating or editing a work order opens on Details.** It used to open below a
  seven-step list, scrolled past the only fields a new run has.
- **A loading screen**, instead of a white page then a bare "Connecting…" card.
  It lays up the two plies of the mark and shows a line of the team's own shop
  lore while Firebase connects.
- **"Load SN5 archive" is off the toolbar**, for leads too. A one-click bulk
  import has no business next to Sign out now that the app holds the season the
  team is actually running. The function and the seed files remain — the
  screenshot and mockup tooling depends on them.

### Added

- **The app knows its version.** It is in the ⋯ menu, so a bug report can name
  the build. A What's New panel opens once per version, and a lead can announce
  a release from the same menu — anyone still running an older build then gets a
  "reload to get it" banner without having to be told in person.

### Fixed

- Work order sections 7 and 8 were unreachable from the keyboard: the hint said
  `1`–`6` and the regex said `[1-7]` over seven sections. Both now agree, and a
  test keeps them agreeing.

---

## 0.x — before versioning

The first 36 days, 2026-07-21 to 2026-08-25: 243 commits, no tags, one author.
Recorded here so a future lead can place a change in time; the detail is in
`git log`, whose commit bodies are the real record.

| When | What landed |
|---|---|
| 07-21 | The original single-file printable work-order traveler |
| 07-22 | Mobile and the design system: drawer nav, tokens, dark mode, self-hosted fonts, installable PWA |
| 07-24 | Mold stack planner: board inventory, STL slicer, exploded stack view, cut list |
| 07-27 | **Tickets** — projects and issues, with the CS-003 disposition gates |
| 07-30 | 3D mold view and ISO 3098 engineering drawings |
| 07-31 | **It went live.** First hosting deploy; the design system and screenshot tooling |
| 08-01 | Document-grade comments and rich text; cure holds enforced against the datasheet |
| 08-02 | The dashboard rebuilt as a grouped list |
| 08-03 | **Labels, QR and scanning** — molds, materials and items become physical records |
| 08-04 | Tabs consolidated, and **Inventory** becomes the storage map; the receiving wizard |
| 08-05 | The part/run/mold data model: the part is the parent |
| 08-06 | Master–detail rails everywhere |
| 08-07 | The dashboard becomes the board: countdown, launchpad, activity feed |
| 08-11 | Widescreen layout, budget goals and category caps |
| 08-15 | Work-order photos, the training matrix, and the Google Sheet tracker mirror |
| 08-19 | **BOM costing** and the first backend: a `parseReceipt` Cloud Function |
| 08-23 | Windows portability, and the receiving desk |
| 08-24 | Boards leave Molds for Inventory; the docs split in two |

By the scale above, several of those were majors — going live, labels and
scanning, the tab consolidation, the backend. They are left untagged: v1.0.0 is
a starting line, not a re-reading of the past. The next change of that size gets
a confident `2.0.0`.
