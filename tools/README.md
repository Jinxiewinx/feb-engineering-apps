# tools/

Everything in here builds or checks the rest of the repo. Nothing in this
folder ships to users; it exists so that a change to the app, the standards, or
the website can be verified before it lands. Run everything from the repo root
(`SN6 Resources/`), because the scripts resolve their paths relative to there.

## Prerequisites

- **Node** (any recent version) for every `.mjs` script.
- **Python 3** for the document pipeline. `build_docx.py` needs the virtualenv
  at `tools/.venv`. It is gitignored, so a fresh clone has to build it first.
  Invoke it as `tools/.venv/bin/python tools/build_docx.py`.
- **Playwright + Chromium** for the browser tests and the cameras:
  `npm i -g playwright && npx playwright install chromium`. Tests that need it
  skip loudly when it is missing, with a green exit code, so read the output.
  The repo's own copy lives at `.ds-sync/node_modules`; keep its playwright
  version matched to the cached Chromium build or it launches and reports a
  missing executable.
- **Firebase CLI** for the three rules suites, which run against the emulator.

**On Windows.** Everything above works, with three things that bite once each:

- **Line endings must be LF.** `.gitattributes` pins them, so a fresh clone is
  already right. If you cloned before that file existed, `git config
  core.autocrlf false` then `git rm --cached -r . && git reset --hard`. The
  symptom of getting this wrong is `test_app.mjs` dying immediately on
  `ReferenceError: DB is not defined`, because its strict-mode strip is
  anchored on `;\n` and CRLF slips past it.
- **`tools/.venv` is gitignored**, so it does not exist in a fresh clone on any
  platform, and on Windows the layout is `.venv\Scripts\python.exe` rather than
  `.venv/bin/python`. The whole of it:

  ```
  winget install --id Python.Python.3.12 --scope user   # Windows, if needed
  python -m venv tools/.venv
  tools/.venv/Scripts/python.exe -m pip install python-docx
  ```

  `python-docx` is the only third-party import in the pipeline; everything else
  is stdlib.
- **The Python tools all pass `encoding="utf-8"` explicitly, and must keep
  doing so.** Python's default is the locale codepage, which on Windows is
  cp1252 — so a bare `read_text()` turns every `§`, `—`, `°` and `±` in the
  markdown sources into mojibake, and `build_docx.py` then bakes it into the
  .docx. It is silent, it looks like a font problem, and the only reason it was
  not already in the repo is that the committed .docx were built where UTF-8 was
  the default. The check that catches it: rebuild an UNCHANGED standard and
  compare `word/document.xml` against the committed one — it must be byte
  identical. Writers pass `newline="\n"` for the same class of reason.
- **The emulator suites need a JDK** on PATH, which Windows has no reason to
  have already. `winget install Microsoft.OpenJDK.21` is enough; the CLI itself
  is `npm i -g firebase-tools`.

Node paths that reach `import()` must be `file://` URLs, not bare paths —
`pathToFileURL()`, never `"file://" + p`. A Windows absolute path starts `C:\`,
so the concatenation produces an unknown `c:` scheme, and the throw usually
lands in a `catch` that reports the dependency as missing. That is exactly how
every browser suite here once skipped GREEN on a machine with Playwright
installed.

## The tests

Logic and data, no browser:

| Test | What it checks |
|---|---|
| `test_app.mjs` | App logic across every tab, in a DOM stub. The big one; run it first. |
| `test_designsystem.mjs` | The app's CSS against `05 Design System/`: token and component drift, and that the CSS parses at all. ~1 second. |
| `test_slicer.mjs` | Mold geometry: STL slicing, islands, containment. |
| `test_packer.mjs` | Cut lists: guillotine feasibility, kerf, stock policy. |
| `test_fusion_frame.py` | The Fusion add-in's bottom-face frame math (`febframe.py`), under plain python3. |
| `test_qr.mjs` | QR encoding. Asserts version 3 alphanumeric exactly; see "The QR guard" below. |
| `test_label_roll.mjs` | Labels on a roll, and the custom label. Parses the millimetres out of BOTH `labels.js` and `print.css` and compares them, because the two files say the same thing in different languages and a drift between them still previews perfectly — onto the wrong length of tape. Also the guard that stops a hand-typed label impersonating a record. |
| `test_sheetsync.mjs` | `06 Composites App/sheets/Sync.gs`, the Apps Script that mirrors the app into the Composites Master Tracker, against fake Sheets objects. It is the only code here that writes into somebody else's live spreadsheet, unattended, every 15 minutes — so the cases that matter are the ones where it must NOT write: orphan rows kept and tinted, column A's formula untouched, unmapped columns left alone. |

Rendered in headless Chromium (need Playwright):

| Test | What it checks |
|---|---|
| `test_appui.mjs` | Layout of every tab at four widths and two themes, measured: nothing off-screen, tap targets, text sizes, dark-mode coverage. |
| `test_detailui.mjs` | The same, but with records open and their fields full: detail pages plus six overlay states at 320/393/430/1440. |
| `test_drawings.mjs` | Mold drawing sheets: renders each one and checks it is readable. No label crossed by a line, nothing under 5.5pt, nothing off the sheet. |
| `test_print_mobile.mjs` | The printable documents on a phone: fit, reachable controls, the two-page traveler cap. |
| `test_safearea.mjs` | The notch, the Dynamic Island, the home indicator, at real iPhone inset values. |
| `test_labels.mjs` | The label sheets, down to the pixels: each QR is rasterized and its dark-pixel fraction checked, because a blank SVG passes every DOM assertion. Also measures a roll page: `test_label_roll.mjs` proves the JS and the CSS agree, this proves a browser agrees with them. |
| `test_sanitize.mjs` | The comment sanitizer, running the real vendored DOMPurify. Never assert allowlist policy anywhere else; nothing else can see it. |
| `test_scan.mjs` | In-app scanning and lot capture. |
| `test_receiving_ui.mjs` | The receiving desk, measured at three widths and both themes with 7 and 40 rows. Needs `serve_populated.mjs` running. An empty grid cannot overflow and cannot be unreadable, so it has to be filled before it is measured; that is what found both of the desk's layout bugs. |
| `test_q_landing.mjs` | The public `/Q/<ID>` nameplate page, including its offline watchdog. |
| `test_route.mjs` | Deep links from a scanned code into the signed-in app. |
| `test_website.mjs` | The public site: design-system usage, reveals, no-JS fallback, phone layout. |

Against the Firebase emulator:

| Test | What it checks |
|---|---|
| `test_wo_rules.mjs` | Firestore security rules for the team collections. |
| `test_storage_rules.mjs` | Storage rules: who can upload what, where. Deny-side only — the emulator's upload endpoint does not set request.resource.contentType, so the *allow* cases cannot be asserted here at all; the test header explains. |
| `test_pub_rules.mjs` | The two public holes: the `pub` scan-mirror (anonymous read of one document, nothing else) and the `tracker` sheet feed (anonymous read of one secret-id document, and no way for anyone to enumerate its way to that id). |

The emulator suites run like this. They target the DEMO project, so they need
Java and the CLI but no `firebase login` and no network:

```bash
cd "06 Composites App" && firebase emulators:exec --only firestore --project demo-feb-work-orders \
  "node ../tools/test_wo_rules.mjs"
```

`test_pub_rules.mjs` the same way; `test_storage_rules.mjs` wants
`--only auth,storage`.

Do not quote the inner path. The single-quoted form this file used to carry
works in a POSIX shell and fails on Windows, where `emulators:exec` hands the
string to `cmd.exe` and the quotes arrive as part of the filename.

## Generators and the document pipeline

| Script | What it does |
|---|---|
| `build_docx.py` | Renders the markdown sources in `02 CS Standards/src/` and `01 Pain Points.../src/` into FEB-styled .docx. No per-document mode; everything churns, commit all of it. |
| `gen_docs_manifest.py` | Bundles datasheets, standards and printables into `06 Composites App/app/docs/` and writes the manifest the Documents tab reads. Run it after adding a datasheet or rebuilding a standard. |
| `check_traceability.py` | Audits the pain-point-to-standard mapping and every csRef in the retro work orders. Run after any standards change. |
| `gen_retro_wos.py` | Regenerates the 26 retro SN5 work orders from the Master Tracker extract. Only needed if the source data was wrong. |
| `gen_sn5_seeds.py` | The other SN5 archives (parts, schedule, stock) from the same sources. |
| `gen_sample_molds.mjs` | The three sample mold STLs that ship with the stack planner. |

The standards flow, in order: edit `02 CS Standards/src/*.md`, then

```bash
tools/.venv/bin/python tools/build_docx.py --all
python3 tools/gen_docs_manifest.py
python3 tools/check_traceability.py
```

## Cutting a release

```bash
node tools/release.mjs 1.1.0          # from the repo root
node tools/release.mjs 1.1.0 --dry    # say what it would do, touch nothing
```

It refuses a dirty tree, reads the commit subjects since the last tag, bumps
`APP_VERSION` in `core.js`, prepends a `CHANGELOG.md` section, **runs the suites
and refuses to ship over a failure**, then commits, tags, pushes, deploys
hosting, and fetches `core.js` off the live host to check the new version is
genuinely there — "Deploy complete" is not the check.

**`WHATS_NEW` is yours, and it is the only thing the team reads.** The script
does not write it: it checks you changed it since the last tag, refuses to ship
if you did not, and prints the subjects as raw material. Both team-facing
surfaces read that one list — the What's New panel in the app and the
`#composites` note this prints — so they cannot say different things.

**Every Major and Minor release ships one or two pictures.** Write them into
`tools/lib/release-shots.mjs` before you cut. It is the same hand-written act as
`WHATS_NEW` and it is checked the same way: the script refuses to ship if that
file has not moved since the last tag, because a shot list picked from what
changed photographs the biggest diff, and the biggest diff is almost never the
thing worth showing. **Two is the cap** — three pictures in a Slack post is a
blog entry and nobody reads the third.

`release.mjs` shoots them at step 9b, *after* it has verified the deploy is live,
so the picture is provably of the version that actually shipped, and prints
their paths under the Slack note for you to drag in. Iterate on the framing
without cutting a release:

```bash
node tools/shoot_release.mjs --version 2.2.0
```

Two things about it that differ from every other browser tool here, both on
purpose. It **dies when Chromium is missing** rather than printing a skip line
and exiting 0: a skipped test teaches you nothing and breaks nothing, whereas a
skipped picture is a release announced without one and nobody finding out. And
it seeds from the **same fixtures the suites use**, so a release picture cannot
show a state no test covers — which is the other half of the lesson behind
`SEASON_PARTS`.

Patches skip all of this by default: "fixes and copy, nothing new to learn" has
nothing to photograph. That is a default and not a law — a patch that changes
what a *list shows* has plenty to look at, so `--shots` forces pictures onto
one. Conversely `--no-shots` announces a Major or Minor without a picture, and
the note carries a line saying there isn't one. Both are deliberate acts you
have to type.

What it deliberately does not do:

- **It does not post to Slack.** `#composites` announcements need Simon's
  explicit ask, so it prints the message and a human sends it.
- **It does not write `config/release`.** That is the "Announce this release"
  button in the app's ⋯ menu, pressed by a lead who is standing in the new
  version — which is what makes everyone else's stale session offer a reload.
  Keeping it there means this script needs no Firebase credential of its own,
  and nobody is told to reload before the deploy has actually landed.
- **It does not deploy rules or functions.** `--only hosting` means only
  hosting. Both of those are separate, deliberate acts.

The commit-message convention is what makes this cheap: subjects in this repo
are prose sentences describing a user-visible outcome, so `git log --format=%s`
is already the CHANGELOG. Keep writing them that way — but they are written for
the next engineer reading `git log`, which is why they stop at the CHANGELOG and
`WHATS_NEW` is written separately for the shop.

What counts as major, minor or patch is at the top of `CHANGELOG.md`.

## Servers and cameras

| Script | What it does |
|---|---|
| `serve_populated.mjs` | The real app on a local port, Firebase stubbed, seeded from the SN5 archive plus populated fixtures. Nothing saves; reload resets. The way to poke the app by hand. |
| `nocache_server.py` | A static server that actually sends no-cache headers. Use it instead of `python3 -m http.server`, which will happily serve a stale script while you debug code that is not running. |
| `shoot_ui.mjs` | The camera: PNGs of any tab at four widths and two themes, real SN5 data. Asserts nothing. |
| `make_mockups.mjs` | The camera plus a picture frame: the annotated screenshots embedded in the READMEs. Captions live in its SHOTS table; rerun it after a UI change and the mockups update themselves. |
| `shoot_release.mjs` | The same camera pointed at what CHANGED: the one or two pictures that go out with a release, from `tools/lib/release-shots.mjs`. Run by `release.mjs` after the deploy is verified live. Unlike every other browser tool here it DIES without Chromium rather than skipping — see "Cutting a release". |
| `shoot_receiving.mjs` | The camera pointed at the receiving desk, which `shoot_ui.mjs` cannot reach: it is a surface you drive into, not a tab in a list state. Needs `serve_populated.mjs` running. Asserts nothing, on purpose. |
| `print-preview.html` | Open in a browser; its Audit all button runs every seed work order through the print layout ladder and reports page counts. |

`tools/lib/` holds the shared plumbing (`browser.mjs` serves directories and
finds Chromium; `fixtures.mjs` and `fixtures-content.mjs` are the demo data)
and `tools/fixtures/` holds a test STL.

The fixtures are not optional for the camera. `loadArchive()` seeds only work
orders, parts, schedule and stock, so without them half the tabs photograph as
empty states — and an empty tab is the one state a density audit learns nothing
from.

For manual phone checks, open `serve_populated.mjs`'s URL in Chrome's device
toolbar at iPhone 15 rather than a narrow desktop window. Half the responsive
rules key off `pointer: coarse`, and only the device toolbar sets that.

## Why the browser tests exist

Most of the suite asserts on strings and numbers, and a sheet can pass all of
that while printing a dimension straight through a dimension line, or running
off the side of a phone. The browser tests render the real thing in headless
Chromium and measure what the browser actually laid out. Add `--shots <dir>`
to `test_drawings.mjs` or `test_print_mobile.mjs` for PNGs of whatever failed.
Run them before shipping a change to `drawings.js`, `print.js` or `print.css`.

The rest of this file is the lessons that suite was bought with. They are
worth reading before writing any new UI test.

### Layout is not paint

A closed `<details>` skips painting its content. An author `display` rule only
restores layout. A "mobile fix" here once forced a closed `<details>` open with
`display: block` at desktop widths and took the ticket page's entire left rail
down to blank white space. The children reported a real bounding box,
`visibility: visible`, `opacity: 1`, and drew nothing. The only signal telling
the truth was `element.checkVisibility()`, and the assertion written for
exactly that case had used `getBoundingClientRect().height > 0` instead.

Every hand-rolled "is it visible" helper asks the wrong question. Use
`checkVisibility()`. `test_detailui.mjs` now has a `nothing unreachable` check
for content hidden with no way to reveal it, verified against the broken build.

One level further down: paint is not correctness either. An `<svg>` QR with a
malformed path passes `checkVisibility()`, reports a perfect box, and paints
nothing. `test_labels.mjs` rasterizes each code to a canvas and asserts the
dark-pixel fraction lands between 0.30 and 0.60. A real code is about 45%
dark, a blank square is 0%, a black box is 100%. Pixels are the only honest
check for a QR.

### A browser test must stay off the network, and can prove it

`sealNetwork(page, { mode })` in `tools/lib/browser.mjs` blocks everything that
is not 127.0.0.1 or localhost. **Seal by origin; never block a host by glob.**
`mode: "hang"` is the RFS case — the wifi associates and nothing ever comes
back. `mode: "abort"` is a refusal.

The rule exists because `test_q_landing.mjs` routed on a glob of the form
star-star-slash gstatic.com-slash-star-star, which matches nothing: the URL is
`https://WWW.gstatic.com/...` and the leading star-star-slash wants a slash
where `www.` sits. All six of its routes matched zero requests. Every "with no
network" assertion in the file ran against the real Firebase SDK and a live
channel to PRODUCTION Firestore, rendering four rows of real data. The offline
watchdog it exists to defend had never executed once, and the assertions raced
real network latency — which was the intermittency people kept re-running.

**`AUDIT_NET=1` proves it.** Run any browser suite with it and read the
NET-AUDIT lines at the end:

```bash
AUDIT_NET=1 node tools/test_q_landing.mjs   # -> NET-AUDIT clean
```

Worth knowing if you extend it: the two obvious Playwright events both cry wolf.
`request` fires even for a request `sealNetwork` aborts, so it flags a sealed
suite. `requestfinished` fires for route-FULFILLED requests too, so it flags a
correctly stubbed one — that false positive briefly indicted `test_detailui`,
whose photo route was working exactly as intended. `response.serverAddr()` is
the honest discriminator: a real remote address off the wire, null from a route.

### Traps in the harness itself

**App files load from `index.html`, not from a list kept by hand.**
`tools/lib/appload.mjs` reads the `<script>` tags and runs each file as its own
`vm.Script` carrying its real path, so the tests load what the app loads, in the
order it loads it. Adding an app file needs no change here.

Two things follow from the per-file load, and both replaced a trap that used to
live in this section. Coverage attributes by file, because V8 keys on script
URL and a concatenated `eval` has none — `node --test --experimental-test-coverage`
now names `06 Composites App/app/core.js`. And top-level `const`/`let` land in the GLOBAL
LEXICAL environment, so the tests read them by bare name and the two regex
allowlists that rewrote ~70 declarations into implicit globals are gone.

**The one gotcha that came with it:** those bindings are global-lexical, not
properties of `globalThis`. Bare `DB` works; `globalThis.DB` and `window.DB` are
`undefined`. If you are reaching for one through an object, that is why it is
not there.

**Never assert sanitizer allowlist policy in `test_app.mjs`** — it cannot see
it. `test_sanitize.mjs` runs the real vendored DOMPurify in Chromium. The old
suite stubbed DOMPurify with a regex that ignored the allowlist, so the
sanitizer had zero real coverage; running the library for real found two live
bugs immediately.

**A backtick inside a JS template literal ends the literal.** It has bitten
`documents.js`, `projects.js` and the `AUDIT` string in `test_detailui.mjs`,
every time as prose in a comment quoting code. Write those comments without
backticks — that is why `AUDIT` says "no backticks below this line".

### Shoot both widths, especially the one the change is for

That `<details>` regression shipped because the change existed only to alter
desktop behavior and every screenshot taken of it, and all four reviewer
agents, looked at 393px. A blank rail overflows nothing, clips nothing, and is
not too tall, so no numeric check could see it either.
`test_detailui.mjs --width 1440 --shots <dir>` does the desktop half.

### Fixtures must populate, and green is not readable

`test_appui.mjs` once passed clean on a bug Simon could see on his phone. It
audits every tab and never opens a record, and every fixture carried empty
comments, no docs and no files. An empty thread cannot overflow. That is why
`tools/lib/fixtures-content.mjs` exists: a bare 120-character Drive URL, an
underscore-joined CAD filename, a 600-character one-paragraph update, a pasted
six-column table, a code block. `test_detailui.mjs` opens every detail page
with those fields full.

The same fix round also produced the clearest limit of measuring: every number
went green while the tables became unreadable. `overflow-wrap: anywhere` gives
a table cell a min-content width of one character, so a pasted pull-test table
rendered its header letter by letter down the page. No overflow, nothing
clipped, and you could not read a row across. Run `--shots` and look.

Two harness traps of the same kind. The fb stub sets `state: "ready"` on its
first line, before the seeds land, so waiting on it measures a half-seeded
database; wait on `__fixturesReady`. And measuring an `<a>` that wraps a
`<button>` reports the anchor's 14px line box, which calls every such button
too small when none of them are.

### The camera is not a test, on purpose

`shoot_ui.mjs` renders the real app with real SN5 data and writes images. It
asserts nothing, because the failure it exists for cannot be written down as a
number: the Parts tab once passed every string assertion while drawing each of
its three progress stages twice. Pair the shots with
`.claude/agents/ui-reviewer.md`, a read-only reviewer that scores a screen on
eight axes. Because the camera resolves the app relative to itself rather than
the cwd, running it inside a git worktree photographs that worktree, which is
how competing designs get shot under identical conditions.

### The QR guard

`HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004` is 45 characters. In QR
alphanumeric mode that fits version 3 (29 modules) at error-correction level
Q, 25% recovery. In byte mode the same string needs version 4 and only gets
15%. One lowercase letter or one query parameter costs a version and an ECC
level, and the printed label looks identical; it just scans worse once it has
resin on it. `test_qr.mjs` asserts `getModuleCount() === 29` exactly, and that
single assertion is the whole guard. The same arithmetic caps an ID at 14
characters. Note that the qrcode-generator library does not auto-detect
alphanumeric mode; pass `'Alphanumeric'` explicitly or you silently get bytes.
