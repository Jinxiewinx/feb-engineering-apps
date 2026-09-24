# Decisions

Load-bearing calls for the CFD dashboard. Each one says what it decided, why,
and what the alternative was, so a future session can reverse it on purpose
rather than by accident.

## 1. Web app on Firebase, not a downloadable desktop app (2026-09-02)

Simon left this open. The brief settles it: "collaboration between lots of
people" and "lots of data available quickly" both point at a hosted app with
a shared backend. A downloadable app would need its own sync layer to do the
same job, and the team already has the Firebase habit, the roster allowlist
pattern, and the deploy routine from `06 Composites App/`.

What we give up: offline use in the shop, and native file access to a Fluent
working directory. The first is not a CFD use case (sims are run and read at
a desk). The second is what `ingest/` is for. If a desktop wrapper is ever
wanted, the `07 CFD PDF Viewer/` folder already shows how to put Electron
around a static app in this repo, and it can be done later without changing
the app.

## 2. Its own Firebase project, not the composites one (2026-09-02, confirmed by Simon)

Project ID `feb-cfd`, created 2026-09-02 under the same Google account as
`feb-composites`. `.firebaserc` in this folder pins it. Reasons:

- The composites app's `firestore.rules` and `storage.rules` are the thing
  that can lock the team out of their data, and the standing deploy rule
  keeps them off-limits unless they change. Adding a second app's collections
  to the same rules file makes every CFD rules change a composites risk.
- Storage volume. Contour images and CSV exports for hundreds of sims will
  dwarf the composites app's photos. A separate project keeps the billing and
  quota story readable.
- Rosters differ. Aero and composites overlap but are not the same people.

Cost: a second roster to maintain, and the Blaze plan on the new project,
since Storage and Auth cannot be enabled without it. Linked 2026-09-02 to
the same billing account as `feb-composites`. Both costs are small. The design system, the guest-view pattern, and the auth flow are
copied over, not shared live, so the two apps can diverge.

## 3. Where data lives: Firestore for what you sort by, Storage for what you look at (2026-09-02)

The "lots of data, quickly" requirement is really two requirements with two
answers.

- **Firestore** holds one document per sim: identity, settings, status, and
  the summary result numbers. Small, indexed, live-updating. This is what the
  table, filters, and cross-sim plots read. Target: a sim document stays
  under a few KB so listing a thousand of them is one cheap query.
- **Cloud Storage** holds everything large: report PDFs, contour PNGs,
  residual and monitor CSVs, and the full result tables. The sim document
  carries the paths. These load on demand when a sim is opened, never on
  the list view.
- **Nothing large in Firestore, ever.** No base64 images, no arrays of ten
  thousand residual points. If a plot needs a data series, the series is a
  file in Storage and the app fetches and plots it client-side.

Cross-sim charts (CD against mesh count, say) read only the summary numbers,
so they stay fast at any sim count. Per-sim time series are fetched one sim
at a time.

## 4. Same repo, new top-level folder (2026-09-02)

Simon's call. It sits at `08 CFD Sims Dashboard/` next to the other numbered
folders. The repo was renamed from `feb-composites-applications` to
`feb-engineering-apps` the same day, since it now holds more than composites.
GitHub redirects the old URL. Release tags: composites keeps bare `vX.Y.Z`,
the dashboard uses `cfd-vX.Y.Z` (see the root `CHANGELOG.md`).

## 5. Always dark, always the icon rail, the viewer's own tokens inside the shell (2026-09-03)

Simon asked for the app to match the composites app: its sidebar, topbar
and cards. After seeing it with a full sidebar and a theme toggle he chose
the opposite of both: the sidebar is always the 56 px icon rail and the app
is always dark, with no toggles, so the viewer gets the width and the
Dashboard reads like the viewer. The viewer's page canvas is dark for a
reason of its own. Contour plots are vivid rainbow images and a bright surround shifts
how the colour scales read, which is why Fluent, ParaView and EnSight all
use dark chrome. So `styles.css` nests every viewer rule under `.viewer`
with the design system's dark values as that subtree's own tokens, and the
rest of the page themes normally. The design system's `components.css` is
loaded as-is; the viewer's colliding class names were renamed (`.vtool`,
`.vside`, `.vcol`) rather than fought.

## 6. Trend charts are this app's own vocabulary (2026-09-03)

The composites app has no charts by a written decision (`rnd.js`: adding a
chart family commits the design system to something it does not have). The
CFD app needs trendlines by request, so `chart.js` is a small SVG line chart
that lives here, styled from the design tokens, and is not added to
`05 Design System/`. One measure per chart, never two axes.

## 7. The splash is a gate, like the composites app's (2026-09-03)

First cut had the sheet leave by itself once its lamps lit, on the argument
that a dashboard opened several times a day should not ask to be let in.
Simon wanted the Continue button, as in the composites app, and that stands:
the lamps are still three real milestones, and once they are lit the sheet
waits for Continue, a tap anywhere, Enter, Space or Escape. A slow boot
offers Continue early; a failed one offers Retry. Nothing dismisses it on a
timer.

## 8. A phone gets one report at a time (2026-09-03)

Under 768 px the Viewer drops its side panel and the two-report views and
opens one report, picked from a select. Side-by-side comparison on a phone
screen is not worth building for; opening a report to read a plot is.

## 9. Each browser keeps the reports it has opened, keyed by hash (2026-09-24)

Opening a report used to download the whole PDF (5 to 20 MB) and re-read
every page every time, including every saved view and every shared link.
`cache.js` keeps the bytes in the Cache API and the index (pages, panels,
text, measured margins) in IndexedDB, keyed by the report's sha256, and the
Firestore SDK keeps the library listing in IndexedDB too.

- **Keyed by hash, so nothing is ever invalidated.** A record's file never
  changes (a changed report is a new upload with a new hash), so a cached
  copy cannot be stale. The index key also carries `INDEX_VERSION`: bump it
  when `indexer.js` or the margin pass changes what they produce, or every
  browser keeps serving the old index.
- **Local only.** Nothing large goes into Firestore (#3 stands); the cache is
  one person's browser, capped at 1 GB of PDFs, least recently used first.
- **Fails soft.** A private window or blocked storage means every call
  returns nothing and the app downloads as before.
- **Not a service worker.** A worker would also cache the app shell, and
  then a deploy would not reach people until the worker updated, which
  breaks "live matches the pushed commit". The shell stays `no-cache`.

## 10. Popovers, not the browser's dialogs (2026-09-24)

`prompt()` and `confirm()` froze the page (the note asked after an upload
held up every file queued behind it) and made the ⋯ menu a text box asking
you to type "rename", "note" or "delete". `menu.js` has an anchored menu, a
one-line field and a confirm, and the smoke test fails if any native dialog
opens. Delete is undoable for six seconds instead of confirmed twice.

