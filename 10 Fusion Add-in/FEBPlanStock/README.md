# FEBPlanStock

The composites app's stack planner, run from inside Fusion. Select the mold
body, press **Plan stock** on the **FEB** panel (Utilities tab of the Design
workspace), and the app opens in a palette on the right with the mesh
already loaded. Sign in if asked, set the board density and mode, press
Plan. The app creates the stack plan and the mold record the same way it
does in a browser, and the planned blanks appear over the mold as
see-through bodies, one component named after the plan id, each body named
`L<layer> <thickness>mm S<section>`. The mold record carries a Fusion
section with the document, body, version and a link to its Fusion Team page.

Nothing is saved to the document by the add-in. You save.

## Install

The add-in is a folder; Fusion loads every folder in its per-user AddIns
directory at startup. Copy `FEBPlanStock/` (this folder, with the
`.manifest`, the `.py` and `resources/`) there:

| Platform | AddIns folder |
|---|---|
| macOS | `~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/` |
| Windows | `%APPDATA%\Autodesk\Autodesk Fusion 360\API\AddIns\` |

On macOS, from a terminal in this repo:

```bash
cp -R "10 Fusion Add-in/FEBPlanStock" "$HOME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/"
```

On Windows, in PowerShell from the repo folder:

```powershell
Copy-Item -Recurse "10 Fusion Add-in\FEBPlanStock" "$env:APPDATA\Autodesk\Autodesk Fusion 360\API\AddIns\"
```

Then either restart Fusion (the manifest says `runOnStartup`) or open
Utilities, Add-Ins, the Add-Ins tab, select FEBPlanStock and press Run. The
FEB panel appears on the Utilities tab of the Design workspace.

To update, replace the folder and restart Fusion. To remove, delete the
folder.

Verified on macOS (Fusion 2702.1.58, 2026-09-04). Windows is untested and
the path above is Autodesk's documented one.

## The shared team account

Members should not have to sign in to plan a mold from Fusion (Simon,
2026-09-07). So the palette signs itself in with one shared FEB account,
read from `credentials.json` beside the add-in:

```json
{ "user": "fusion", "password": "…" }
```

`user` is an app username (or an email). Copy `credentials.example.json` to
`credentials.json` and fill it in; the file is listed in the repo's
`.gitignore` and must never be committed, since the repo is public. Hand it
to members with the add-in folder. A lead creates the account once in the
app itself: Create account, name "Fusion add-in", username `fusion`, a
password. It joins as a member, which is all the add-in needs.

What the account changes on a mold: `fusion.by` is the shared account, and
`fusion.exportedBy` is the Autodesk user who pressed Plan stock, so the card
still says who. A palette that is already signed in as a real member is left
alone, and that member's own account stamps the mold instead.

Without the file, the palette shows the app's sign-in card on first use, the
add-in says so, and the mold opens by itself the moment someone signs in.
Either way the sign-in persists on that machine.

## Using it

1. Open the mold design. The mold body should sit on the origin the way
   CS-003 expects, with Z up; the planner slices along Z from the body's
   lowest point.
2. Utilities tab, FEB panel, Plan stock. Select the mold body (a solid body;
   one at a time). Press OK.
3. The FEB Composites palette opens docked on the right and signs in if it
   has to. The mold modal opens with the mesh loaded in millimetres and a
   name suggested from the document and body. Until the app is signed in and
   has loaded the rack, the mesh waits; a toast in the palette says what it
   is waiting on.
4. Set density (and thicknesses if you are choosing them yourself) and press
   Plan.
5. The blanks appear as bodies with 30% opacity in a component named after
   the plan (STK-SN6-…). Use them as CAM stock. Re-running Plan stock on the
   same mold replaces that component.

If the palette is closed, Plan stock reopens it; the page inside kept
running, so nothing has to reload. If the page has died or gone stale and
does not answer within eight seconds, the add-in reloads it and sends the
mesh again.

## If it does not work

`febplanstock.log` beside the add-in says what happened, one line per step:
`exported`, `page loaded`, `page state`, `sent mesh`, `page holds the mesh`
or `page took the mesh`, `sent sign-in`, `drew N bodies`. Read it before
guessing.

- "No 30 lb board stock on the rack" from the modal means the app is signed
  in and the rack has loaded, and there really is no board of that density in
  Inventory. Add boards, widen the range, or plan at a density that is on the
  rack. Before 2026-09-07 this could also mean the rack had not loaded yet;
  the mesh now waits for it.
- A sign-in failure names itself in a Fusion message box; check
  `credentials.json`.
- Nothing at all after `sent mesh`: the palette page is not answering. The
  watchdog reloads it once; if that does not help, close the palette, run
  Utilities, Add-Ins, stop and run FEBPlanStock, and try again.

## What talks to what

`FEBPlanStock.py` meshes the body with Fusion's `MeshCalculator` (Fusion's
API is in centimetres; the STL is written in millimetres by hand, so no
export dialog and no unit guess), base64-encodes it and sends it to the page
with `Palette.sendInfoToHTML("mold", …)`. The page side is
`06 Composites App/app/fusion.js`: it waits for Fusion's `adsk` bridge object,
announces `loaded`, opens the mold modal with the mesh, and after
`submitMold()` saves the plan sends `plan` back with the layers. The add-in
draws them. Two messages each way; the whole contract is at the top of each
file.

A log of what the add-in did is written to `febplanstock.log` beside the
add-in, because a running add-in has no console.
