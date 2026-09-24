# FEB CFD app

Live at **https://feb-cfd.web.app**. Started 2026-09-02 as a shared dashboard
for the aero team's CFD work; the first thing in it is the report viewer that
used to be a desktop app in `07 CFD PDF Viewer/`, now with a library that the
whole team shares. What the dashboard tracks beyond that gets written down
when the team has said what they want.

`DECISIONS.md` has the reasoning behind the infrastructure choices (a web app
on Firebase, its own Firebase project, where data lives).

## How to use it

The site opens on the **Dashboard**: the latest design point's downforce,
drag and L/D, two trend charts by design point, the team's saved views, and
a card per report with a thumbnail of its `stat-car-0` contour (or the first
contour it has, named under the picture), when it was uploaded, who ran it,
a note, and its numbers. Open on a card puts that report in the **Viewer**
alongside whatever is already open. Tick two or more cards and **Compare in
Viewer** opens them all at once; the filter box over the cards (or `/`)
narrows them by name, note or DP. A card's ⋯ renames it, edits its note, or
deletes it; a delete can be undone for six seconds from the toast.

In the Viewer, Pages scroll together, Panels puts the same named plot from
every report side by side, Overlay lays one over another (blend, swipe, or
a difference map that reads 0.00% for identical reports), Summary diffs the
mesh and solver numbers. **Save view** keeps what is open, with the tab, the
plot and the overlay, as a named view on the Dashboard for everyone.

To add a report, drop a Fluent PDF onto the window or press Open PDFs. It
opens immediately and, with the checkbox on, uploads to the library for
everyone while it is being read: the force numbers are read off the
report's Report Definitions page, a thumbnail is rendered from the open PDF,
and a one-line note is asked for on the report's row in the Open list
(skippable, editable later from the card's ⋯). The same file uploaded twice
is recognised by its hash and not stored again. Reports uploaded before the
Dashboard existed catch up the first time anyone opens them.

**Opening is fast the second time.** This browser keeps each report it has
opened, and the index read from it, keyed by the file's hash (`cache.js`,
DECISIONS #9), so reopening a report, a saved view or a colleague's link
downloads and re-reads nothing. Reports asked for together load together,
each showing "downloading N%" then "reading N%" in the Open list. Resting
the pointer on a card starts fetching it.

**Zoom** with ⌘/Ctrl + scroll, a trackpad pinch, or `+` `−` `0`. `?` lists
every key.

The address bar carries what you have open, the tab, the plot and the
overlay. Copy it and send it: the link is the comparison.

**On a phone** the rail is a bottom bar and the Viewer shows one report at
a time: Pages and Panels only, with a select in the toolbar to pick from
the library or open a PDF from the phone. Comparing side by side is a
desktop thing; a two-report link opens its first report.

**Access is open.** No sign-in to read, upload, rename or delete; Simon's
call (2026-09-02) so nobody has to be added to anything. What the bucket
still refuses: anything that is not a PDF, anything over 60 MB, and any
record shape other than the one in `firestore.rules`. If that ever gets
abused, the two guardrails to add first are a billing budget alert and App
Check; neither needs a login.

## What exists

| Path | What it is |
|---|---|
| `app/` | The app. `core.js` routes between Dashboard and Viewer and holds the state; `shell.js` is the composites-style icon rail, topbar and lightbox (always dark, no toggles); `dashboard.js` and `chart.js` the landing page; `extract.js` reads numbers out of a report's text; `library.js` is the only file that talks to Firebase; `cache.js` is this browser's copy of reports and indexes; `menu.js` the popovers (menus, one-line fields, confirms) that stand in for `prompt()`; `render.js` rasterises page ranges; the rest are the viewer's views ported from `07`. `vendor/` is pdf.js. `ds/` is copied from `05 Design System/` and a test keeps it byte-identical |
| `firebase.json`, `.firebaserc` | Pins `feb-cfd`. Hosting root `app/`. Emulator ports offset from the composites app's so both can run |
| `firestore.rules` | `reports` and `views` are open with fixed record shapes; a report's dp, results, meta and thumb may be written by any opener (backfill). The other collections keep the composites roster model, unused until something needs sign-in |
| `storage.rules` | `reports/<id>/report.pdf` (PDF, under 60 MB) and `reports/<id>/thumb.png` (PNG, under 2 MB): public read and write. Other trees keep their roster gating |
| `cors.json` | The bucket's CORS policy. Applied by hand with gsutil, never by `firebase deploy` |
| `test/` | `test_indexer.mjs` (the PDF indexer and the number extraction against the real DP_22 fixture), `test_viewer_smoke.mjs` (Playwright, library stubbed by `lib_stub.mjs`: Dashboard, viewer, URL and saved-view round trips, menus, compare, the cache; `SHOTS=<dir>` saves screenshots), `test_library_emu.mjs` (the real library against the emulators: upload, numbers, thumbnail, backfill, views), `test_perf.mjs` (timings, see below) |
| `tools/` | Rules tests, the design-system byte check, and the pdf.js vendoring script |
| `CHANGELOG.md` | Released versions, `cfd-vX.Y.Z` |

## Running it

Node, the Firebase CLI and a JDK (for the emulators), same as `SETUP.md` at
the repo root. From this folder:

```bash
npm test            # ds check, rules, indexer, browser smoke, emulator round trip
npm run emulators   # auth, Firestore, storage, hosting, with the UI on :4001
npm run serve       # the app on :8792; on localhost it talks to the emulators
npm run deploy      # hosting only, to feb-cfd.web.app
npm run perf        # timings: open, reopen, pinch frames, slider (RUNS=3 for a median)
```

`npm run perf` prints numbers rather than passing or failing on them (a CI
box and a laptop differ by 3x); it fails only if a page is left soft after
a pinch or the page errors. Run it before and after anything that touches
`render.js`, `pages.js` or the loading path, and put both numbers in the
commit. In a sandbox that cannot reach gstatic.com, the emulator suite can
load the Firebase SDK from an unpacked `firebase@12.16.0` npm package:
`FIREBASE_SDK_DIR=<dir>/package npm run test:library`.

Playwright is not a dependency of the repo; the browser suites skip with a
message when it is missing (see `SETUP.md` at the root).

Rules deploy separately and only when they change, and the CORS policy is a
third thing again:

```bash
firebase deploy --only firestore:rules,storage --project feb-cfd
gsutil cors set cors.json gs://feb-cfd.firebasestorage.app
```

## State of the Firebase project

`feb-cfd`, console at https://console.firebase.google.com/project/feb-cfd.

| Service | State |
|---|---|
| Hosting | Live, the viewer, at https://feb-cfd.web.app |
| Firestore | Created, `us-west1` (same region as `feb-composites`). Rules deployed |
| Storage | Enabled, default bucket `feb-cfd.firebasestorage.app` in `us-west1`. Rules and CORS applied |
| Auth | Enabled: email/password and anonymous (guest), the same two providers as the composites app |

The project is on the Blaze plan, linked 2026-09-02 to the billing account
`feb-composites` uses. Nothing is charged until usage passes the free tier.

## Releases

Tags are `cfd-vX.Y.Z`, never bare `vX.Y.Z`, which belongs to the composites
app in the same repo. Version numbers follow the composites rubric at the
top of the root `CHANGELOG.md`; releases are listed in this folder's
`CHANGELOG.md`. To cut one: bump `APP_VERSION` in `app/core.js`, add the
changelog entry, commit, `git tag cfd-vX.Y.Z`, push with tags, `npm run
deploy`, then curl `core.js` off the host and check the version.

## Next

1. Talk to the team about what the dashboard tracks beyond the viewer.
2. Write the data model and replace the placeholder collections, tests in
   the same commit.
3. Guardrails if the open bucket is ever abused: a billing budget alert,
   then App Check.
