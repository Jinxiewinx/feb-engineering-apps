# FEB CFD Viewer

> **Hosted now.** Since 2026-09-02 this viewer runs at https://feb-cfd.web.app
> with a shared report library, from `08 CFD Sims Dashboard/`. This folder is
> the desktop original, kept buildable and unchanged; new work happens in 08.

Compare Fluent CFD reports without opening two PDFs side by side and hunting for
the same plot in each.

Load two or more design points. The reports scroll together, every named plot is
matched across them, and you can put the same contour side by side or lay one
over the other to see what actually moved.

![Panels view: the same named plot from every open report](design/cfd-panels-mockup-20260803.png)

## Try it in two commands

Two sample reports ship in this folder: `DP_22.pdf` (a real Fluent export) and
`DP_22_variant.pdf` (a perturbed copy, so the comparison views have something
to find; regenerate it with `npm run variant` if it is missing).

```
npm run serve
open http://localhost:8123/index.html    # then drop both PDFs onto the window
```

## What it does

Pages view puts one report per column, scrolling together. Unlock the toggle to
scroll one on its own when you want a closer look at a single report, then
Re-sync snaps everything back to the column you last touched.

Panels view is the one to reach for. Pick a plot by name and you get that plot
from every open report, cropped identically and scaled the same, so the eye can
do the comparing.

Overlay lays two reports on top of each other three ways. Blend fades between
them. Swipe puts a draggable divider down the middle, which is the best way to
judge a boundary because a discontinuity across a straight edge is obvious.
Difference computes the per-pixel change, amplified, and tells you what fraction
of the panel moved. Two identical reports read exactly 0.00%, so the number is
trustworthy.

![Overlay view: two reports on top of each other](design/cfd-overlay-mockup-20260803.png)

Summary skips the pictures. Mesh counts, solver settings, iterations, inlet
velocity and final residuals from every report in one table, with changed values
highlighted. Often this answers the question before you look at a plot at all.

![Summary view: the numbers from every report, changed values highlighted](design/cfd-summary-mockup-20260803.png)

Search covers plot names and the full document text. Typing `vc3` finds
`velo-car-3`, and picking a result moves every report to it at once.

Zoom with pinch on the trackpad, Cmd-scroll, or the toolbar buttons. When
tracking is on every column zooms together; unlock it and each zooms on its own.

Keys: `/` search, `j` and `k` next and previous plot, `s` toggle sync, `r`
re-sync, `1` to `4` switch view.

## Running it

As a desktop app:

```
npm install
npm start
```

As a plain web page, with nothing installed beyond Python:

```
npm run serve          # or: python3 -m http.server 8123 --directory app
open http://localhost:8123/index.html
```

It has to be served over HTTP rather than opened as a file. pdf.js is an ES
module and starts a module worker, and browsers refuse to load module scripts
from a `file://` origin. The Electron build works around this by serving the app
over a custom `app://` protocol, which is why the packaged app and the browser
page run identical code.

## Building

```
npm run build:mac      # .dmg and .zip in dist/
npm run build:win      # dist/win-unpacked/, a runnable Windows x64 folder
```

The macOS build is verified: it produces a 115 MB .dmg and .zip, and the packaged
app boots and indexes a report. It is not code-signed, so the first launch needs
right-click then Open, or Gatekeeper will refuse it.

**Windows.** `build:win` produces `dist/win-unpacked/`, a folder with
`FEB CFD Viewer.exe` and its libraries. Zip that folder and send it; the
recipient unzips and runs the .exe. The whole folder has to stay together (the
.exe needs the DLLs next to it), so send the zip, not the .exe alone. It targets
x64, which is what nearly every Windows PC runs (not ARM Windows). It is
unsigned, so Windows SmartScreen shows "Windows protected your PC" on first run;
click **More info** then **Run anyway**.

This folder build cross-compiles from macOS with no extra tools, because it skips
the installer step. A single-file installer (`build:win-installer`, producing an
NSIS .exe) additionally needs Wine on macOS, or a Windows machine, or CI.

Caveat: the Windows build is assembled from Electron's official Windows binaries
plus the exact app code the macOS build runs and the tests cover, but it has not
been launched on real Windows from here. Smoke it on a Windows machine before
handing it to the team.

`npm run smoke` drives a running desktop build over the DevTools protocol and
checks that a report actually loads and indexes in the window. Start the app with
`npx electron . --remote-debugging-port=9333` first. That test exists because
launching Electron and seeing a window is not proof the app works: the risky part
is pdf.js starting a module worker, which depends on the page origin.

## How the matching works

Fluent exports these reports through Chromium and every export has the same
shape, which is the only reason automatic comparison is possible. Two properties
of that layout do the work:

Panel titles are set much larger than body text and sit against the left margin.
In the sample every one lands at 26.8125 pt, so a tolerance band around that
picks out all 59 named panels (36 contours, 6 vectors, 17 convergence plots)
without parsing layout.

Panels sit on a roughly uniform 502.5 pt pitch and flow continuously down the
document, so a panel can start near the bottom of one page and finish on the
next. Nothing in the app may assume a panel lives on one page.

That pitch is a typical spacing, not a rule. Where a page break falls inside a
panel it pushes the plot down, and 28 of the 58 panels in the sample then occupy
more of the strip than the pitch suggests, by up to 152 pt. Panel height is
therefore measured from where the next panel or section heading actually begins.
Assuming the pitch cropped the bottom off half the contours.

Pages are also laid out in **content space**: each page's print margins are
measured once at load (render small, scan for the first and last inked row) and
dropped, so pages abut their ink rather than their paper edges. A convergence
plot that Chromium split across a page break then composites as one continuous
image with no white band through it, and the panel crop no longer mistakes that
band for the gap under the title. `withContentSpace` in `indexer.js` does the
geometry; `measureMargins` in `render.js` does the measurement. Both reports get
identical trimming, so two identical reports still difference to exactly zero.

So pages are stacked into a single continuous strip of PDF points, and a panel is
a window into that strip. Rendering one is a crop that may composite two page
canvases, which handles vector convergence plots, raster contours and
page-straddling panels through one path.

Panels match across reports by name, falling back to position. A plot present in
one report and missing from another shows as an explicit gap rather than
silently pairing with the wrong thing.

If Fluent's export ever changes shape, `test/test_indexer.mjs` is what breaks
first. It runs the real indexer over `DP_22.pdf` and checks page geometry,
section detection, the full contour naming grid, the measured pitch, panels that
cross a page break, and the matching fallbacks.

```
npm test
```

## Three things not to undo

**Do not "simplify" the Electron shell to `loadFile`.** This app is ES modules
because pdf.js ships as one and pulls a module worker with it, which forces an
HTTP origin. The custom `app://` protocol is what lets the desktop and browser
builds run identical code with nothing conditional between them.

**Panels crop through one shared box across every report being compared**
(`jointCrop` in `render.js`). Cropping each report to its own content would
offset them, and the difference view would then report that offset as change
everywhere. The guard is that two identical reports still diff to exactly 0
pixels.

**Nothing may assume a panel lives on one page.** Panels flow across page
breaks; layout is in content space rather than paper space so a plot spanning a
break is one continuous image, and paper-space `absY` survives as `paperAbsY`
for the cases that still need it.

Settled, and not worth re-asking: open access with no sign-in, the shared
library in Storage, `07` untouched, the viewer canvas dark in both themes, and
charts that are this app's own. Records backfill on first open, so there is no
migration script and none is needed. The bucket's CORS is applied by gsutil, not
by a deploy.

## Files

| Path | What |
|---|---|
| `app/index.html` `styles.css` | Shell and the dark theme |
| `app/core.js` | State, document loading, tabs, keyboard, drag and drop |
| `app/indexer.js` | Reads panels out of a report and matches them across reports |
| `app/render.js` | Page and panel rasterisation with a bounded canvas cache |
| `app/pages.js` | Side-by-side page view and the scroll sync |
| `app/panels.js` | One named plot from every report |
| `app/compare.js` | Blend, swipe and difference |
| `app/search.js` `summary.js` | Search, and the numeric comparison table |
| `app/vendor/` | pdf.js, committed so the browser path works from a clone |
| `electron/main.js` `preload.cjs` | Desktop shell, `app://` protocol, native dialog, menu |
| `tools/vendor-pdfjs.mjs` | Refresh the vendored pdf.js after an upgrade |
| `tools/make-test-variant.mjs` | Perturbed copy of the sample, so the diff has something to find |

## Notes

The app uses ES modules, unlike the composites app in `06 Composites App/`, which
uses classic scripts sharing global scope. pdf.js forces it.

Only one report exists so far, `DP_22.pdf`. Testing uses it against itself, where
the difference must be exactly blank, and against a Ghostscript-perturbed copy
that re-encodes the contour images while leaving the text layer alone. Real
report-to-report variation stays unverified until a second design point lands,
and panel matching is the part most likely to need adjusting when it does.

The dark chrome and neutral grey canvas are not decoration. Contour plots are
vivid rainbow images and a bright white surround shifts how those colour scales
read, which is why ParaView, EnSight and Fluent all do the same thing.
