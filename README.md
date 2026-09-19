# SN6 Resources — FEB Composites

I put this together in July 2026, after comp, from everything we did in SN5 — the Drive, the full #composites and #purchasing history, and the manufacturer datasheets for the stuff we actually buy. It's the handoff I wish I'd gotten: what went wrong and why, standards so the answers stop living in people's heads, and a work-order system so we can actually trace what we built. Everything went through staged reviews (G0–G4) against a reviewer agent loaded with our constraints and SN5 history before it landed here.

— Simon

New lead? Start with [HANDOFF.md](HANDOFF.md). It explains how to run and care
for everything in here.

## What's in here

| Folder | Contents | Start with |
|---|---|---|
| `00 Agent/` | The "simon" reviewer-agent definition. Archival copy; the live one is at `composites_programs/.claude/agents/simon.md` | |
| `01 Pain Points and Improvements/` | The SN5 season review: what went well, 10 major problems with root-cause analyses, traceability to the fixes | the .docx |
| `02 CS Standards/` | 14 numbered composites standards (CS-000 to CS-013). The markdown in `src/` is the canonical text; the .docx files are built output. Figures are SVG in `src/figures/` with rendered PNGs beside them | `CS-INDEX` |
| `03 Datasheets/` | 25 manufacturer TDS/SDS PDFs for the products we actually use | `INDEX.md` |
| `04 Printables/` | Shop reference sheets meant to be printed: resin ratios, flowcharts, checklists | `README.md` |
| `05 Design System/` | The app's visual language as a reusable system: tokens, component CSS, a living style guide | `styleguide.html` |
| `06 Composites App/` | The composites work-order app, live at feb-composites.web.app | `app/README.md` |
| `07 CFD PDF Viewer/` | The desktop original of the CFD viewer, kept buildable; the hosted version lives in `08` | `README.md` |
| `08 CFD Sims Dashboard/` | The CFD app, live at feb-cfd.web.app on its own Firebase project: a dashboard of every report with its downforce and drag by design point, saved views, and the report viewer from `07`, all in the composites app's shell | `README.md` |
| `09 Website/` | The public team website, built on the design system. Not deployed; its README has the state of it | `README.md` |
| `10 Fusion Add-in/` | `FEBPlanStock/`, a Fusion add-in that runs the stack planner from inside Fusion and draws the board layers over the mold, plus the feasibility study and spikes that led to it. Install it from the [latest release](https://github.com/Jinxiewinx/feb-engineering-apps/releases/latest): download the zip, unzip, double-click the installer | `10 Fusion Add-in/README.md` |
| `tools/` | Everything that builds and checks the rest: the docx builder, the generators, the servers, and 24 test suites | `README.md` |

## Getting started

[SETUP.md](SETUP.md) is the full walkthrough for a new machine, macOS or
Windows: what to install, how to verify it, how to run the suite, how to
deploy, and the platform traps that cost a day each if you meet them cold.

The short version. You need Node for the app tooling, Playwright for the
browser tests, the Firebase CLI and a JDK for the rules tests and deploys, and
Python 3 only if you are editing the standards. Three commands cover most days,
all run from this folder:

```bash
node tools/serve_populated.mjs --port 8791   # the app locally, seeded, no Firebase
node tools/test_app.mjs                      # the core logic suite
node tools/test_designsystem.mjs             # CSS drift check, ~1 second
```

The live app needs no setup at all: it is at https://feb-composites.web.app,
and access is controlled by the roster inside it.

The repo was renamed from `feb-composites-applications` to
`feb-engineering-apps` on 2026-09-02, when the CFD dashboard joined it. The
old URL redirects. The folders were renumbered the same day: reference
material first, the shared design system, then the four apps together, with
`03 App/` becoming `06 Composites App/`. The two apps are separate Firebase projects on purpose:
`feb-composites` and `feb-cfd`, each deployed from its own folder, so a
deploy of one can never touch the other's rules or data.

## The app

Anyone can open it and press **View as guest**: the whole app, read-only, with no
account and nothing to ask a lead for. Editing needs a name, because every
buy-off carries one.

`06 Composites App/app/` is the team's shared workspace for a season, running on Firebase.
Sign-up is self-serve: a name, a username and a password get you in as a member. It updates live for everyone and works
on phones and tablets as well as desktop. The full manual lives in
`06 Composites App/app/README.md` and the architecture in `06 Composites App/app/DESIGN-NOTES.md`;
this is the short tour.

![Dashboard: the pit board — four lanes, none of which can render empty](06%20Composites%20App/design/dashboard-mockup-20260827.png)

Twelve tabs, grouped in the sidebar by who is asking:

- **Dashboard:** the pit board. Four lanes, each a question: **Stopped**,
  **Waiting on you** (walks the same gate ladder the buy-off button does, so
  it never promises a signature the button refuses), **Due this week**, and
  **On the clock**. An empty lane says so in a sentence; below sit the
  program numbers and the shop footer.
- **Season:** the blueprint that replaced the Master Tracker spreadsheet. One
  columnated line per part the team means to make, mostly blank until the
  team knows more, and a line is a real part record from the moment it
  exists. The Google Sheet is downstream, republished every 15 minutes.
- **Work Orders:** the manufacturing traveler. Steps with named buy-offs,
  blocker steps, cure holds enforced from the resin datasheets, per-step
  photos, and issues that block Complete until they carry a resolution, a root
  cause and an account of what was done about it. All three stay readable on
  the run afterwards. Prints to a hand-fillable sheet that is always exactly
  two pages.
- **Parts:** every part down the left, the selected one beside it, each stage a
  row of steps you click. A part shows a photo of itself at the top, and can be
  made on several molds, so a split mold has both halves on the record with a
  progress bar each.
- **Molds:** the mold pipeline. A mold carries its stage, home location,
  sealing record and mold file; the planner slices an STL into board layers,
  splits at the ShopSabre depth limit, nests blanks onto the cheapest boards
  on the rack, and prints dimensioned drawing sets and cut sheets. "Mark
  these boards cut" updates the rack, offcuts included, with one Undo.
- **R&D:** the whole trial programme on one screen. A strip of cards across the
  top carries every study and every R&D part, with that part's runs as chips
  inside its card; pressing one opens it full width underneath. Coupon studies
  are still a grid you type into with no work order and no cure hold, and
  Compare gives means and ranges once a study has a swept setting and results.
  A study also works as a folder: file parts and runs under it and they group
  together. R&D records live here and only here, so Parts and Work Orders stay
  the season lists.
- **Inventory:** the storage map, one card per shelf with contents and
  warnings; flat lists for items, materials and the tooling-board rack; a
  spreadsheet-shaped Receiving page that runs the CS-011 chemical checks;
  and per-material run-out that turns into a Restock purchase.
- **Schedule:** the season as a station-by-week grid, or the week by day,
  subteam and person.
- **Budget:** purchases on two tracks, the goods (Submitted, Purchased,
  Arrived) and the money (Submitted, Approved, Reimbursed), with a receipt-scan
  button on phones and a Charged to field for spend that belongs to another
  team's budget.
- **Documents:** the 25 datasheets, member uploads, and pinned Google Docs in
  one filterable shelf.
- **Reports:** CSV exports, the printable Monday status board, and the bulk
  label builder.
- **People:** the roster, roles and trainings. Trainings gate work: a tagged
  step refuses an untrained signer unless a lead overrides with a logged
  reason.

![Inventory: the storage map, one card per shelf with contents and warnings](06%20Composites%20App/design/inventory-mockup-20260825.png)

![Parts: the index of every part beside the selected one, each stage a row of steps](06%20Composites%20App/design/parts-mockup-20260826.png)

Cross-links are everywhere; click a chip to jump to the related record. ⌘K
searches everything. Light and dark themes follow the system setting, and
printing always comes out black-on-white. Access is enforced server-side by
`firestore.rules`. Signing up creates your own roster entry as a member and
nothing more: you cannot name your own role, and only a lead can grant one or
remove anybody.

### Labels and scanning

Every physical thing gets a 4 × 1 inch label: the ID, the fact that actually
identifies it, and a QR code. A plain phone camera opens a public nameplate
saying what the object is, its stage and where it lives, no account and no
install; names, costs and files stay behind the roster. The in-app Scan
button makes a move two scans (the object, then the shelf), works on iPhones
through a lazy-loaded wasm decoder, and reads the UC EH&S barcode tags on
chemical containers, so the campus sticker is the container's identity. The
cure buy-off captures which fabric roll and which resin and hardener lots
went in, and "I don't know" is a recorded answer. The bulk builder prints
Avery sheets with a 100 mm calibration bar, because browsers silently scale.

![Labels: a printed Avery sheet with IDs, key facts and QR codes](06%20Composites%20App/design/labels-mockup-20260825.png)

![Scanning: the public nameplate a phone camera opens, no sign-in](06%20Composites%20App/design/scan-mockup-20260825.png)

The old single-file `06 Composites App/work-orders.html` stays as an offline backup and
archive viewer. It opens any exported JSON with no server at all. Don't delete
it.

## The CFD PDF viewer

`07 CFD PDF Viewer/` compares Fluent CFD reports without opening two PDFs side
by side and hunting for the same plot in each. Load two or more reports:
**Pages** scrolls them together, **Panels** pulls one named plot out of every
report cropped identically, **Overlay** blends or per-pixel-diffs two,
**Summary** tables the solver settings with changes highlighted, and
**Search** covers everything open. Desktop (Electron) and web are the same
code; its `README.md` has a two-command way to try it on the sample reports.

![The Panels view: the same named plot pulled from every open report](07%20CFD%20PDF%20Viewer/design/cfd-panels-mockup-20260803.png)

## The rest, briefly

**Pain Points and CS Standards** (`01`, `02`) are where the app's rules come
from: 10 root-caused SN5 problems, each mapped to a numbered standard that
fixes it. `CS-INDEX` is the lookup and `python3 tools/check_traceability.py`
audits the mapping. Every quantitative claim cites a datasheet in
`03 Datasheets/` or a recorded team measurement, and every standard ships
"Draft, pending Lead signature" until someone signs the approval table.

**Datasheets and Printables** (`04`, `05`) are reference material: manufacturer
TDS/SDS PDFs chosen from actual purchase history, and shop-floor sheets meant
to be printed.

**Design System** (`06`) is the app's visual language pulled out into something
reusable: tokens, component styles, and a living style guide in light and
dark. The app remains the source of truth; `tools/test_designsystem.mjs` keeps
the two from drifting apart.

**Open items (need a human):** move the `feb-composites` Firebase project to a
team Google account (or add the next lead as an owner) so it survives handoff;
confirm the ShopSabre's exact model against CS-005 §5; field-verify the CS-011
storage map at RFS; sign the approval tables. HANDOFF.md carries the full
list.

**Maintenance:** the standards are edited as Google Docs
(`02 CS Standards/GOOGLE-DOCS.md` has the folder and per-doc links); edits
sync back into `02 CS Standards/src/` with a revision bump, then rebuild with
`tools/.venv/bin/python tools/build_docx.py --all`, then
`python3 tools/gen_docs_manifest.py` and `python3 tools/check_traceability.py`.
Figures are edited as SVG in `src/figures/` and re-rendered with
`node tools/render_figures.mjs` before the rebuild. Regenerate retro work
orders only if the source data was wrong.

## Tests

The full inventory, what each suite covers, which need Playwright or the
Firebase emulator, and the hard-won lessons behind the browser tests all live
in [`tools/README.md`](tools/README.md). The short version:

```bash
node tools/test_app.mjs           # app logic, no browser, run this first
node tools/test_designsystem.mjs  # CSS drift between app and 06, ~1s
node tools/test_appui.mjs         # every tab, four widths, two themes, measured
node tools/test_detailui.mjs      # the same with records open and fields full
```

plus suites for the mold slicer and packer, the drawings, printing on phones,
labels and QR codes, scanning, the public scan page, the sanitizer, safe-area
insets, the website, and the three Firebase rules files. Before shipping
anything visual, run the matching browser suite and look at the screenshots it
can write with `--shots`; the tests measure, but only eyes catch "unreadable".
After a UI change, `node tools/make_mockups.mjs` regenerates the annotated
screenshots in this and the other READMEs.

One quirk worth knowing: the git root is this folder rather than `06 Composites App/`,
because the scripts in `tools/` resolve their paths relative to here.
`firebase deploy` still has to run from inside `06 Composites App/`.
