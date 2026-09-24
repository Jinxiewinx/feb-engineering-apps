# Changelog

Every released version of the FEB CFD app, newest first. Tags are
`cfd-vX.Y.Z`; the bare `vX.Y.Z` series in the root `CHANGELOG.md` belongs to
the composites app. Same rubric for the numbers: Major when the team has to
relearn navigation, Minor for a new capability, Patch for fixes and copy.

---

## cfd-v0.4.0 — 2026-09-24

Faster everywhere, and no more browser dialogs. Same layout.

- **Zoom is smooth and ends sharp.** A pinch or ⌘/Ctrl-scroll scales the
  page on the graphics card while your fingers move and redraws once they
  stop. Pages no longer stay blurry after a zoom. `+`, `−` and `0` zoom too.
- **A report you have opened before opens instantly.** This browser keeps
  it, so reopening it, a saved view or a link downloads nothing. Two
  reports load side by side instead of one after the other, with a
  percentage while they download and read.
- **Compare from the Dashboard.** Tick two cards, press Compare. A filter
  box over the cards, and `/` to reach it.
- **The ⋯ menu is a menu.** Rename, note and delete in a small popover
  instead of typing a word into a dialog. Delete can be undone for a few
  seconds.
- **Uploading does not stop you.** The upload starts while the report is
  being read, the note is asked on its row in the Open list, and a second
  file does not wait for the first one's note.
- Overlay: dragging the swipe divider and the amplify slider no longer
  stutter. `?` shows every keyboard shortcut.

Measured with `npm run perf` (median of 3, 800 ms simulated download,
retina):

| | 0.3.1 | 0.4.0 |
|---|---|---|
| Pinch over two reports | 5 fps, 12.4 s blocked | 60 fps, 0.15 s blocked |
| First page, one report | 2.5 s | 2.1 s |
| First page, two reports | 4.9 s | 2.7 s |
| Reopening a report | 2.5 s | 0.5 s |
| Difference slider, 30 moves | 431 ms blocked | 0 ms |

---

## cfd-v0.3.1 — 2026-09-03

- The splash waits for Continue once its lamps are lit, as in the composites
  app. A tap anywhere, Enter, Space or Escape also work.

## cfd-v0.3.0 — 2026-09-03

- A boot splash like the composites app's: the mark draws in while pdf.js
  and the library arrive, three lamps for three real milestones. It leaves
  on its own once they light, and becomes a gate only when the connection
  is slow or fails.
- Works on a phone. Under 768 px the rail is a bottom bar, the Dashboard
  stacks, and the Viewer opens one report at a time: no side panel, no
  Overlay or Summary, a select in the toolbar to pick from the library or
  open a PDF from the phone. A two-report link opens its first report.

## cfd-v0.2.1 — 2026-09-03

- The sidebar is always the icon rail and the app is always dark; both
  toggles are gone (Simon's call after seeing 0.2.0).
- The Dashboard fills the full width beside the rail.

## cfd-v0.2.0 — 2026-09-03

A Dashboard, saved views, and the composites app's shell.

- The app now opens on a Dashboard: the latest design point's downforce,
  drag and L/D as tiles, two trend charts by design point, the saved views,
  and a card for every report in the library with a thumbnail of its
  `stat-car-0` contour, its date, analyst and mesh size, a note, and its
  numbers. Clicking a card opens the report in the viewer.
- Every upload reads the force numbers out of the report's own Report
  Definitions page and renders the thumbnail from the open PDF. Reports
  uploaded before this catch up the first time anyone opens them.
- Save view: what is open, with the tab, the plot and the overlay, becomes a
  named view on the Dashboard that anyone can open.
- The same sidebar, topbar, cards and light/dark toggle as the composites
  app, with the CFD mark in the sidebar. The viewer's page canvas stays dark
  in both themes.
- A note asked after upload, editable later, shown on the card.

## cfd-v0.1.0 — 2026-09-02

The desktop CFD viewer, hosted. Everything `07 CFD PDF Viewer` did (Pages,
Panels, Overlay blend/swipe/difference, Summary, Search) now runs at
https://feb-cfd.web.app with a shared report library.

- Reports opened here are uploaded to a library the whole team sees; the
  next person opens them from the list instead of hunting for the PDF.
- The address bar carries what is open, the tab and the plot, so a link is a
  comparison.
- The same PDF uploaded twice is recognised by its hash and not stored twice.
- Swipe works on a touch screen.
- No sign-in for anything, by decision. The bucket accepts only PDFs under
  60 MB.
