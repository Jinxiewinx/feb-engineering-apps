# 10 Fusion Add-in

FEBPlanStock: plan a mold's tooling board stack from inside Fusion, using the
composites app's own planner. Select the mold body, press **Plan stock** on the
**FEB** panel of the Utilities tab, and the app opens in a palette with the mesh
already loaded. The planned blanks come back as see-through boxes over the mold.

## Installing it

Download the zip from the
[latest release](https://github.com/Jinxiewinx/feb-engineering-apps/releases/latest)
and double-click the installer inside. `FEBPlanStock/README.md` has the full
walkthrough, including the one-time macOS security dialog and what to do when it
misbehaves. The app links the same download: **Plan from Fusion**, on the Molds
tab.

## Cutting a release

From the repo root:

```bash
node tools/test_addin_package.mjs
node tools/package_addin.mjs
node tools/package_addin.mjs --release
```

The first builds and checks, the second writes `dist/FEBPlanStock-<ver>.zip` so
you can look at it, and the third tags `addin-v<ver>`, pushes, and creates the
GitHub Release with the zip attached.

Bump the version in **both** `FEBPlanStock/FEBPlanStock.manifest` and
`ADDIN_VERSION` in `FEBPlanStock/FEBPlanStock.py` first. The packager refuses to
build when they disagree, since a version the add-in cannot report is a version
nobody can act on.

Raise `MIN_ADDIN_VERSION` in `06 Composites App/app/fusion.js` only when a
change to the page side needs a matching change in the add-in. Every bump makes
somebody reinstall.

After releasing, download the zip in a browser and run the installer from that
copy. A local build is not quarantined, so it cannot tell you whether the macOS
instructions in `INSTALL.txt` are right.

## What is in here

| Path | What it is |
|---|---|
| `FEBPlanStock/` | The add-in. This folder, and only this folder, goes into Fusion's AddIns directory. |
| `installer/` | The three files the packager puts beside the add-in in the zip: `INSTALL.txt` and one installer per platform. |
| `FEASIBILITY.md`, `FEASIBILITY-PLAN.md` | The 2026-09-04 study that chose this architecture, a real app in a Fusion palette. |
| `MCP.md` | Driving a live Fusion session from Claude Code over Fusion's built-in MCP server on `127.0.0.1:27182`. |
| `spikes/` | The six throwaway spikes behind the feasibility study, with their results. |
| `tools/` | `fusion_mcp.py` and `find_fusion_mcp.py`, the MCP client used to verify the add-in against a running Fusion. |

`NEXT-SESSION-PROMPT.md` is a handoff from 2026-09-04 and is now history.

## Known gaps

The Windows installer targets Autodesk's documented per-user path but has never
been run on Windows. Neither has the add-in itself, beyond one member's install
on 2026-09-07 that surfaced two real bugs. A Windows member trying the installer
and reporting back is the outstanding task.
