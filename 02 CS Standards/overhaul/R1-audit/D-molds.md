# R1 audit, cluster D: molds (CS-003 Rev D, CS-005 Rev E)

Auditor: Claude (doc overhaul Round 1, read-only). Date: 2026-10-10.
Sources: `02 CS Standards/src/CS-003.md`, `CS-005.md`; app code at v6.8.0
(`app/shop.js`, `molds.js`, `stock.js`, `packer.js`, `slicer.js`,
`drawings.js`, `fusion.js`, `parts.js`, `workorders.js`, `timeline.js`,
`scan.js`); `10 Fusion Add-in/`; git log since 2026-08-28; SESSION-STATE,
HANDOFF, CHANGELOG; `03 Datasheets/URE_BOND_90_TB.pdf` and
`1386A_2-1386B_2.pdf` (pdftotext); #composites and #aerodynamics Slack since
2026-09-01 (read only, nothing sent).

Both standards were last revised 2026-08-28. Since then the mold side of the
app changed more than any other area: the "Tooling cut" stage (544f23b), the
Designed-only cut list that advances molds (31994e0), the split waiver
(658ad85), datum cut plans on the mold (c4c7885), offcut review (f011373),
several molds per part (174b91c), the Fusion add-in (eb5ea94 through 7aca19c).
The stack planner itself dates from 07-24 and was never written into CS-003
at all.

Section numbers to keep stable (live references counted in code and docs):
CS-003 §7.1.4, §7.1.5, §7.1.6, §7.2, §7.3; CS-005 §7.4, §7.5. New content
below is proposed as appended steps or new subsections so none of those move.

---

## Process-rule changes (need Simon/Nick visibility)

| # | Doc § | Change | Why |
|---|---|---|---|
| P1 | CS-003 §7.2 step 1 | Review must happen before any blank is **cut** from the cut list, not only before glue or booking | The cut list consumes board at Designed and moves the mold to Tooling cut, with no link to the WO review (F6) |
| P2 | CS-003 §7.1.6, §7.2 item 6 | Split waiver allowed; reviewer **shall** check a waived mold's machined depth | App ships the waiver (F8) |
| P3 | CS-003 §5 | New rule: board grades are not interchangeable silently; a range is declared in the mold modal; the stack is machined at the highest grade cut | Code cites CS-004 for this rule, CS-004 does not contain it (F13) |
| P4 | CS-003 §3/§5/§7.3 | Ure-Bond 90 is rated by its TB for board "up to 30# density"; team glues 45/60 lb | Simon decides: accept as team practice beyond the TB, or name another adhesive (F2) |
| P5 | CS-003 §7.3 step 2 | State the wait before machining: TB says machinable at 4 h, full cure 16 h; current text implies 16 h | One number, labelled team hold vs datasheet (F3) |
| P6 | CS-003 §7.1.4 | Overhangs allowed on a split mold (each piece positive draft from its own direction) | Team is building split molds for exactly this (F15) |
| P7 | CS-003 §9 | Datum cut plans **should** be attached to the mold when one exists | New file field (F18) |
| P8 | CS-003 §7.3 step 3 | Mark the mold ID on the glued stack as well as part name/WO | Mold record now exists from Designed (F24); coordinate with cluster B (CS-001 §7.4) |
| P9 | CS-003 §7.3 / app | "Glue mold stock" is gated by ShopSabre CNC training in the app; the standard names no training for gluing | Ask whether that is intended (F23) |
| P10 | CS-005 §4 | A lead grants the app's "ShopSabre CNC" training only after the RFS student access dashboard shows the member's ShopSabre training | App now tracks it; RFS stays the authority (F26) |
| P11 | CS-005 §7.4 | New step: CAM feeds are set for the densest board in the stack | The app prints this on every cut list and drawing, the standard never says it (F27) |
| P12 | CS-005 §7.4 | CAM uses the current FEB ShopSabre tool library; the old one is deprecated | Slack 2026-09-13 (F28) |
| P13 | CS-005 §7.4 step 1 | "Zero Z once per job" becomes "once per setup" | A split stack is several setups (F29) |
| P14 | CS-005 §2 | Scope covers XPS foam, G10 and flat CF panels on the ShopSabre, or explicitly excludes them | Slack shows all three in use (F30) |

---

## CS-003 Mold Design & Manufacturing

### F1. §6 Ure-Bond 90 safety misses the isocyanate hazard (wrong, high)

Current: "two-part urethane, nitrile gloves, ventilated area, no skin contact;
cure heat is mild but clamped assemblies stay put for 4 h."

Evidence: SDS 1386A (`03 Datasheets/1386A_2-1386B_2.pdf`) §2 lists H334
respiratory sensitization Cat 1 and H319 serious eye irritation; §3 lists MDI
(CAS 101-68-8) at 15 to 35%; §8 hand protection "any liquid-tight gloves such
as butyl rubber, neoprene or PVC", eye protection "Safety glasses with side
shields", respiratory protection as backup where ventilation is inadequate
(P284). TB p.1: "Part A (Yellow Label) contains methylene
diphenyldiisocyante... may cause lung damage and sensitization." The TB's
"mild heat" line is about speeding cure, not about exotherm.

Proposed §6 bullet:
"Ure-Bond 90 (R1; SDS `1386A_2-1386B_2.pdf`). Part A is an isocyanate (MDI)
and a respiratory sensitizer: once sensitized, a person reacts to tiny
exposures for life. Mix and glue only in room-size ventilation, never heated or
sprayed. Wear safety glasses with side shields and liquid-tight gloves (the SDS
names butyl, neoprene or PVC), long sleeves. If ventilation is poor, wear the
CS-009 respirator. Skin: soap and water. Eyes: flush 15 min and get medical
attention (TB)." Glove choice for nitrile should be settled by the Round 5
glove chart (QR-008); until then do not assert nitrile.

### F2. Ure-Bond 90 is rated to 30 lb board; §5 and the app go to 60 (wrong, high, process-rule P4)

Current §5: "PU, 30 lb/ft³ general / 60 lb/ft³ fine-finish"; "Board adhesive |
Ure-Bond 90". §3: "Why Ure-Bond 90: ... purpose-made rigid urethane adhesive".

Evidence: TB p.1 "strong, rigid bond between urethane modeling board surfaces,
up to 30# density." App plans 30, 45 and 60 lb stacks and mixed-grade layers
(`stock.js:16` `DENSITIES = [30, 45, 60]`; mold modal "Board density, min/max").
Slack 2025-09-09 (Simon) mentions bringing "the 60 density foam back".

Proposed: add to §5 Notes "TB rates it for board up to 30 lb/ft³." Then one of
(Simon picks): (a) "Above 30 lb the team uses it anyway; this is team practice
beyond the TB, recorded here so nobody mistakes it for a datasheet figure", or
(b) name the adhesive for 45/60 lb glue-ups. Do not draft (a) without his yes.

### F3. §7.3 step 2 has no numbers and contradicts the TB on machining time (wrong, medium, process-rule P5)

Current: "Ure-Bond 90 per R1: mix per TB, spread thin/even on one face, mate,
clamp evenly, **4 h clamp minimum**; full cure per TB before machining."

Evidence (TB p.1): mix 1A:1B by volume, 100A:88B by weight; pre-mix Part B;
mix 3 minutes scraping sides and bottom; pot life 8 min at 73 °F/23 °C; clamp 4
h; "machinable in 4 hours"; full cure 16 h at 73 °F/23 °C. STYLE.md §2: the
number goes in the step.

Proposed step 2, split one action per step:
"2. Pre-mix Part B. Measure 1A:1B by volume (100A:88B by weight). Mix 3 min,
scraping sides and bottom. Pot life is 8 min at 73 °F, so mix only what one
joint takes."
"3. Spread thin and even on one face, mate, clamp evenly for 4 h (TB)."
"4. Do not machine until [16 h after glue-up: the TB's full cure. The TB allows
machining at 4 h; the team waits for full cure] / [4 h, per TB]." Simon picks;
label whichever is chosen as team hold or datasheet figure.

### F4. §7.3 step 1 uses compressed air, which CS-005 §6 forbids (wrong, medium)

Current: "Faces must be dust-free (compressed air + IPA wipe)."
Evidence: CS-005 §6 "Vacuum shared rooms; don't blow dust around with
compressed air." TB: porous surfaces "sanded until clean and any excess dust
removed thoroughly... Solvent wash the surface and let the solvent fully dry".
Proposed: "Vacuum the faces, wipe with IPA, and let the IPA flash off fully
before glue touches it (TB)."

### F5. §7.2 checklist misses the stack-plan check the app sends reviewers to (missing, high)

Evidence: the mold page and plan page both print "Dashed outline is the mold
at the top of each layer. Check it sits inside every block before initialling
the CS-003 §7.2 review step." (`molds.js:631`, `stock.js` renderStackPlan).
`stackview.js:3` calls this a blocker check. Plans carry slicer warnings
(overhang/negative draft near X,Y citing §7.1.4, rough mesh, section split,
board thicker than the machine cuts; `slicer.js:959-1003`) and the Molds
overview lists them under "Needs a hand" → "Plans with warnings". A re-planned
mold's old plan shows "Superseded ... Do not cut from this one."

Proposed new checklist rows (append, keep 1-9):
- 10 | Stack plan is the current one on the mold's Mold file (not marked Superseded)
- 11 | In the Stack view the dashed mold outline sits inside every block
- 12 | Every plan warning is read and either fixed in CAD or answered in the WO note

And reword item 7 to the app's words: "Mold file (STK-SN6-###) exists, and the
Molds overview says every planned blank fits the rack (no 'Short N blanks')."

### F6. Review gate does not cover cutting blanks (process-rule P1, high)

Current §7.2 step 1: "Before any stock is glued or any slot booked..." and
step 2 "No initials, no glue, no booking."

Evidence: the cut list offers every mold still at Designed
(`stock.js` cutHeldBackReason: only "no mold", stage, "superseded") and
"Mark these boards cut…" moves the mold to Tooling cut (`stock.js:1722-1741`).
The design review lives on the WO ("Mold design review" blocker,
`workorders.js:272`), and nothing in the cut list reads it. The WO blocker does
stop "Glue mold stock" being signed early, so glue is covered and cutting is
not.

Proposed: "Before any blank is cut from the cut list, any stock is glued, or any
ShopSabre slot is booked..." and "No initials, no cutting, no glue, no booking.
The cut list does not check the review for you: look at the run before pressing
Mark these boards cut…"

### F7. §7.2 should say what the app enforces and what it does not (missing, medium)

Evidence: "Mold design review" is `kind: "blocker"`, `needs: ["file"]`,
`training: "moldDesign"` (`workorders.js:272,283`). The file rule reads "the
CAD, attached or linked" (`workorders.js:584-592`). Training "Mold design"
(code MOLD) is granted per person on the People tab; an untrained signer is
stopped ("You're not recorded as Mold design-trained") and only a lead can
"Sign without it", which logs a reason (`workorders.js:3262-3305`). Nothing
checks that the signer is not the mold engineer.

Proposed paragraph after step 2: "The app holds the step until the CAD is
attached or linked on the work order and the signer holds Mold design training
(granted by a lead on the People tab). It does not check that the signer is not
the designer. That part of the rule is yours."

### F8. Max-Z split can now be waived (missing, high, process-rule P2)

Current §4: "molds taller than max-Z must be split into sections"; §7.1.6 "if
mold height exceeds machine max-Z, split into sections in CAD"; §7.2 item 6.

Evidence: mold modal tick "Machined depth stays under 6in — do not section
this stack" (`stock.js:915`), stored as `noSplit/noSplitBy/noSplitAt` on the
mold and `splitWaived/maxCutDepthMm` on the plan; the mold shows a "split
waived" pill naming who and when (`molds.js:579-587`); the plan warns "the
section split was waived at planning... Check that before the first setup —
nothing here measures the cavity" (`slicer.js:997`); a single board thicker
than 6 in always warns (`slicer.js:1003`). Commit 658ad85 (Simon: "there are
fancy things we can do in design to get around this problem sometimes").
SESSION-STATE:148: the waiver measures stack height, while the real limit is
plunge depth, and collet collision and gantry height also bind.

Proposed §4 Max-Z: "...must be split into sections with alignment datums,
unless the split is waived (§7.1.6)." Proposed §7.1.6 second sentence: "The
planner splits any stack over 6 in automatically. Tick 'Machined depth stays
under 6in' only when the design keeps the cutter within 6 in of a face it can
reach (a shallow cavity in a tall blank, dowelled inserts, a face machined from
both sides). The app records who ticked it." Item 6: "Height ≤ max-Z (CS-005
§5); or sections with dowel and datum features in CAD; or a split waiver, with
the reviewer having checked the deepest machined point and the tool's reach
past the collet."

### F9. The stack planner is not in the standard (missing, high)

Evidence: app README "Molds"; `stock.js` uploadMold/submitMold. "+ Mold" opens
"New mold" with Name, "Board density, min/max (lb/ft³)", "Start from"
(dimensions (X × Y × Z) / an STL file — beta / nothing yet — just record the
mold), "STL units" ("An STL carries no units. Getting this wrong is a 25.4×
mistake."), "Blank shape" (step each layer in / one solid block), "Machined
depth", "Boards" (choose them for me, from stock / I'll pick the thicknesses).
A multi-body STL asks "Which body?" and plans one body at a time. Planning
creates the mold at "Designed" (MOLD-SN6-###) with its plan (STK-SN6-###)
linked as the "Mold file". Re-plan and "Plan the stack" are lead-only
(`molds.js:610-621`); the old plan is kept under "Earlier:".

Proposed §7.1 step 8 (append): "Plan the stack in the app before review:
Molds → + Mold, or Re-plan on an existing mold (leads). Export the mold body as
an STL in millimetres and set STL units to match, or use the Fusion add-in
(step 9). Plan one body at a time. The plan picks thicknesses from boards
recorded in Inventory → Boards, splits at 6 in, and creates the mold record at
Designed with its Mold file." Mention "beta": "Check the Stack view before
anyone cuts; if it looks wrong, plan from dimensions instead."

### F10. The Fusion add-in (missing, medium)

Evidence: `10 Fusion Add-in/FEBPlanStock/README.md`; `FEBPlanStock.py:418-487`
("Plan stock" on panel "FEB", Utilities tab; inputs "Mold body", optional
"Bottom face"); blanks drawn as see-through bodies named `L<layer>
<thickness>mm S<section>` in a component named after the plan id; "Use them as
CAM stock." Install from the Molds tab "Plan from Fusion" (`molds.js:318`);
version equals the app version (manifest 6.8.0); `fusion.js:69`
MIN_ADDIN_VERSION 4.8.0 triggers "Reinstall it from Plan from Fusion on the
Molds tab." Windows installer never run (SESSION-STATE:117).

Proposed §5 row: "Plan from Fusion | FEBPlanStock add-in | Molds tab → Plan
from Fusion | Utilities tab → FEB → Plan stock". Proposed §7.1 step 9: "From
Fusion: select the Mold body, and the Bottom face if the mold is not modelled
bottom-down (a split mold on its side). Plan in the palette. The blanks come
back as bodies in a component named after the plan; save the document
yourself, the add-in does not."

### F11. Cutting blanks from the cut list ("Tooling cut") is missing (missing, high)

Evidence: shop.js:36-46 stage comment; README "The cut list only offers molds
still at Designed", "Every offcut is reviewed before it becomes a board",
"Marking boards cut moves the mold to Tooling cut"; cut list UI: "Cut list"
(Molds rail), "Every mold ready to cut (N)", "Print cut list", "Mark these
boards cut…", modal "Mark these boards cut?", "Correct the sizes before you
commit", "+ Add offcut", "Mark cut"; undo bar "Print labels" (`stock.js`).
Kerf 1/8 in (`packer.js:44`); pieces under 4 in shown greyed and unticked
(`packer.js:45`); sizes typed in mm. Printed sets carry a batch stamp tag and
"PRELIMINARY" when the search was narrowed (README "The cut list, on paper").
To re-cut, walk the mold's stage back (asks first).

Proposed: retitle §7.3 "Cutting blanks and gluing the stack" and insert steps
before the current step 1 (no §7.3.n references exist):
"1. Open Molds → Cut list. Only molds at Designed with a reviewed design (§7.2)
are cut. Print cut list; check the batch tag on every sheet matches before
cutting from a sheet that has been in a drawer."
"2. Cut on the sheet's numbered cuts, all the way across each time."
"3. Press Mark these boards cut…, untick any board not cut, and correct every
offcut size in millimetres to what is in your hand. Mark cut moves the mold to
Tooling cut."
"4. Press Print labels on the bar that appears and label each offcut now."
Open question for Simon: which tool cuts blanks. `shop.js:36` and commit
544f23b say "off the ShopSabre"; `packer.js` models a 1/8 in saw kerf and
guillotine cuts "for the saw". The standard should name one.

### F12. Gluing should follow the drawing set, Datum A, and the margin (missing, medium)

Evidence: Drawings button on the mold; per-layer sheets "PLACEMENT ON Ln —
INSET FROM EACH EDGE" and "CHECK — FROM DATUM A"; "Datum A is the near-left
corner of the stack" (`drawings.js:1330-1345,1447-1489`). Blanks carry a 1 to 2
in margin and are rounded to 1/2 in (`slicer.js:72-85`); a layer can hold
several blanks tagged L2a, L2b (`stock.js` blanksFromPlans); in a range plan
two grades may share a layer (README).

Proposed §7.3 step (after dry-fit): "Place each layer from its layer sheet: the
insets from the board below, then check the Datum A table. A board sawn
oversize moves every inset the same way; the datum check catches it."

### F13. Grade rule is cited to CS-004 but lives nowhere (missing, medium, process-rule P3)

Evidence: `stock.js` (submitMold comment) "CS-004 still says grades are not
interchangeable silently"; README "CS-004 has not moved". CS-004 has no such
sentence (grep: only "30–60 lb/ft³" at CS-004:37). Feed band "Machine at the
N lb/ft³ feed." (`stock.js` feedRateBand); "Highest density cut (lb/ft³)" on
the mold (`shop.js`).

Proposed §5 note: "Board grades are not interchangeable silently. Plan at one
grade, or give a min and max in the mold modal; inside that range any board may
supply any blank. The densest board cut sets the feed for the whole stack
(CS-005 §7.4)." Also record the 45 lb grade: "30 lb general, 60 lb fine finish;
45 lb sheets turn up on the rack too."

### F14. Board stock is in Inventory → Boards (missing, medium)

Current §7.2 item 7 "Stock size exists (check inventory)". Evidence:
`inventory.js:604` segments "Storage map", "Items list", "Materials list",
"Boards"; "+ Board"; one record per sheet (`stock.js` header, Simon "Each board
should have its own entry"); a record with qty > 1 shows "not tracked apart";
the planner only chooses from recorded boards ("No board stock recorded yet").
Proposed §5 row Notes: "On hand: Inventory → Boards. One record per sheet or
offcut (BRD-SN6-###) with its shelf. The planner can only use boards recorded
there." Cluster G: CS-011 R5 and §7 still say "Stock tab" (stale-path).

### F15. Split molds and several molds per part (missing, medium, process-rule P6)

Current §7.1.4: "No overhangs. 3-axis machining only".
Evidence: Slack #composites Sam Hartman 2026-09-19 "1/2 of split mold
machined" (ts 1789864448.608589); 2026-10-04 "whilst trying to re split the
mold the entire flower pot released at once" (1791137261.914529); Nick
2026-09-30 "Make a mini seat mold to test the efficacy of split mold methods on
male mold parts... it could allow us to manufacture overhangs"
(1790837965.882759). App: a part holds `molds[]`, "+ Link a mold…" / "+ Link
another mold…" (`parts.js:998-999`); plan, drawings and QR label follow the
first mold; a new run seeds the first mold only, "A run on the other half is a
second run" (174b91c).

Proposed §7.1.4 append: "A part with an overhang is made on a split mold. Each
piece has positive draft from its own machining direction, and the split line
and its alignment features are designed in CAD." New §7.1 step 10: "Each piece
of a split mold is its own mold record. Link every piece on the part (+ Link
another mold…). The part's plan, drawings and label follow the first mold in
the list; a work order covers one mold, so the second piece gets its own run
and its own §7.2 review."

### F16. Mold stages are not defined (missing, medium)

Evidence: `shop.js:46` MOLD_STAGE = Designed, Tooling cut, Board glued,
Machined, Sealed, Ready for layup, Retired (off the track, `MOLD_TRACK`).
Stepper: one step forward applies with undo; skipping ahead or moving back
asks; Retired asks (`molds.js:135-167`). "Log offcuts" offered on Tooling cut
and Board glued (`scan.js:404-413`). Part "Mold progress" is a different enum,
deliberately not synced (`parts.js:1172-1181`).

Proposed §4 definition "Mold stage" with the list, and in each step "set the
mold's stage to X": §7.1 step 8 (Designed, automatic), F11 step 3 (Tooling cut,
automatic), §7.3 after clamping (Board glued), §7.4 step 1 (Machined, CS-005
§7.5), §7.4 step 2 (Sealed / Ready for layup per CS-004). Retire a mold that
will not be used again; do not delete it (delete is lead-only and goes to
Recently deleted).

### F17. §9 Records and §7.4 step 2 describe a "WO mold block" (wrong, medium)

Current §9: "WO mold block: stack plan, adhesive + clamp time, review checklist
initials, machining estimate vs actual, photos". §7.4.2: "Update the WO mold
record (layers, density, sealing, location)."

Evidence: the mold is its own record (`shop.js` SHOP.molds) with fields
"Name", "Stage", "Home location", "Work order", "Board density, min/max",
"Highest density cut (lb/ft³)", "Board layers", "Sealing system", "Sealed on",
"Sealed by", "Parts pulled", "Revision", "Also known as"; plus "Mold file",
"Datum cut plans", and a Fusion section. The WO keeps a per-run Mold section
("Mold ID", "Layers", "Density (lb/ft³)", sealing, location;
`workorders.js:343,1582`).

Proposed §9: "Mold record (MOLD-SN6-###): stage, home location, density range
and highest density cut, layers, sealing system/date/by, parts pulled, the
Mold file (STK-SN6-###) and any datum cut plans. Work order: the Mold design
review buy-off, the Glue mold stock and Machine mold step notes (clamp time,
machining estimate and actual), and photos." §7.4.2: "...update the mold
record: Sealing system, Sealed on, Sealed by, Home location, and its stage."

### F18. Datum cut plans (missing, low, process-rule P7)

Evidence: mold card section "Datum cut plans", "The reference cuts taken off
this mold once a part has come out of it. Most molds never need one.", "+ Add
files" (`molds.js:589-604`; c4c7885). PDFs preview in app.
Proposed §4 definition and §9: "When reference cuts are taken off a mold after
a part comes out, the drawing should be attached to the mold under Datum cut
plans."

### F19. Re-plans (missing, low)

Evidence: "Re-plan" is lead-only; the old plan stays under "Earlier:"; opening
it shows "Superseded by ... Do not cut from this one." and, for a lead, "Make
this the current plan" (`molds.js:476-481,610-621`). Superseded plans are held
back from the cut list. Proposed one sentence in §7.1 step 8 and checklist row
10 (F5).

### F20. Where the machining estimate and actual go (missing, low)

Current §7.2 item 8 "Machining time estimate written on the WO"; §8 "Machine
log | WO". Evidence: no estimate field exists on a WO; "Machine mold" requires
"a note on this step" ("When it was done, on which machine, and what the
numbers were"; `workorders.js:273,593-597`). Proposed: "in the Machine mold
step note".

### F21. References (stale-path / missing, low)

- R1 should cite the TB and SDS by both filenames (already does) and the
  numbers now pulled into §7.3 (F3).
- Add R7 app README "Molds" and "The cut list, on paper"
  (`06 Composites App/app/README.md`), R8 `10 Fusion Add-in/FEBPlanStock/README.md`,
  R9 `SN5 Composites/Documentation/SN5 Tooling Board Adhesives.docx` (exists,
  uncited; J. Stephen 2025-10-12 adhesive survey).
- R6 Rohacell IG-F is listed but never used in the body. Either drop it or use
  it (0.3 MPa / 130 °C, TDS p.1) where cores meet molds.
- No Coastal tooling-board TDS/SDS on file (Round 5 Tier 2); §5 and §6 cite
  none for board dust.

### F22. Style (style, low)

- Bold mid-sentence: :105 "No initials, no glue, no booking.", :112 "4 h clamp
  minimum", :113 "Mark the stack immediately", "two adjacent side faces".
  Keep the step-lead labels in §7.1 ("Flanges:") as labels.
- Em dash as an empty table cell at :67. Use "n/a" or leave blank.
- §7.3 heading after F11: "7.3 Cutting blanks and gluing the stack" (asker's
  words: cut list, glue).

### F23. Gluing is gated by CNC training in the app (process-rule P9, low)

Evidence: `["Glue mold stock", { training: "cnc" }]` (`workorders.js:273`);
MoldWetLay merges it into "Glue and machine mold" with CNC training
(`workorders.js:284`). CS-003 §7.3 names no training. Ask Simon whether gluing
should need "ShopSabre CNC" training; either the standard says so or the app
rule changes.

### F24. Mold ID at glue-up (process-rule P8, low)

Current §7.3.3: "part name, WO, and the up-direction". The mold record and its
MOLD-SN6-### id exist from Designed now (F9). Proposed: add the mold ID.
Coordinate with cluster B, since CS-001 §7.4 step 1 carries the same rule.

### Keep in CS-003

§1 purpose and the PP-03 story; §7.1 numbers (75 mm flange, 2° draft, 15 mm
minimum section, fillet ≥ tool radius, conical divots), which the slicer and
figure both cite; the non-designer reviewer rule; the paint-marker CAUTION
callout; Appendix A (clamp arithmetic checks: 2,400/16 = 150 psi,
2,400/64 = 37.5 psi).

---

## CS-005 CNC Machining of Tooling Board (ShopSabre)

### F26. §4 says nothing tracks HOT status (wrong, high, process-rule P10)

Current: "nothing in this repo tracks HOT status... RFS's own HOT record is the
actual authority."

Evidence: training "ShopSabre CNC" (code CNC) is granted per person on the
People tab and gates "Glue mold stock", "Machine mold" and "Glue and machine
mold" (`workorders.js:18-24,273,284`); an untrained signer is stopped and only
a lead can "Sign without it" with a logged reason. Slack: Nick 2026-09-18 "The
student access dashboard... should show you if you have access and what
equipment trainings you have" (ts 1789751742.035699); "Oliver has scheduled us
for shopsabre training on 10/18" (1789785188.805509).

Proposed: "Certified operator: completed RFS ShopSabre training and HOT. RFS's
record, on the RSO/RFS student access dashboard, is the authority. The app's
ShopSabre CNC training (People tab) mirrors it: a lead grants it only after
seeing the RFS record, and the app will not let anyone else sign Machine mold.
The end-of-SN5 list (Ansh, Simon, Kina, Nico, Nick, Justin, Sam, Alvin,
Ernesto) is history. Train new members in the fall." This also cuts the
current paragraph roughly in half (style).

### F27. Feed rate set by the densest board (missing, medium, process-rule P11)

Evidence: cut list band "Machine at the N lb/ft³ feed." and "The densest board
in a stack sets the feed for the whole thing" (`stock.js` feedRateBand); layer
sheet note "machine every setup at the N lb feed" (`drawings.js:1375-1380`);
mold field "Highest density cut (lb/ft³)", written when boards are marked cut.
CS-005 never mentions feeds. Proposed §7.4 step: "Set CAM feeds for the
highest grade in the stack: the mold's Highest density cut, or before cutting,
the top of its planned range."

### F28. Current tool library (missing, medium, process-rule P12)

Evidence: Slack Alvin Liu 2026-09-13 "New ShopSabre tool library (old one is
deprecated)" (ts 1789327005.119489); 2026-09-16 "New ShopSabre tools file"
(1789616754.437739). Nick 2026-10-09 "reuse my re3 cad and just change the bits
in the cam" (1791599270.395009). Proposed §7.4 step 2 bullet: "Build CAM
against the current FEB ShopSabre tool library (posted in #composites
2026-09-16; the older one is deprecated)." Where the file lives should be
filled in by a lead; Slack carries it only as an attachment.

### F29. "Zero Z once per job" with split stacks (wrong, medium, process-rule P13)

Evidence: a stack over 6 in is planned as sections, each its own setup with its
own stock STL ("STL S1", "STL S2"; `molds.js:622-624`), SPLIT callouts on the
drawings, "machine every setup" (`drawings.js:1379`). Proposed: "Zero Z once
per setup..." and add: "Each section of a split stack is its own setup: its own
stock STL, its own zero, its own engraved ID check." Figure label in
cs005-zzero ("touch off here, once per job") changes with it.

### F30. Scope is tooling board only; the team machines more (missing, medium, process-rule P14)

Evidence: XPS foam wing cores (Nick 2026-09-30, ts 1790837965.882759, "bonding
two machined foam halves together"; 2026-10-09, 1791599270.395009); G10
inserts, "Larry has wanted to oversee it" (Simon 2026-10-08, 1791478658.838899;
Nick 2026-10-09, 1791599129.261929); flat CF panels "potentially cutting flat
panels on shop sabre" (Simon 2026-09-25, 1790358975.434619); caul plates
(1791478767.146469). Proposed §2: "Also XPS foam, G10 and cured CF panels.
The booking, operator, Z-zero and first-cut rules apply unchanged. G10 runs
only with Larry's say-so. Cured CF dust follows CS-009." Or exclude explicitly.
Decide, do not leave silent.

### F31. §5 max cut depth needs the waiver and the reach caveat (missing, medium)

Evidence: the app's split threshold is 6 in (`slicer.js:231`
MAX_CUT_DEPTH_MM = 152.4) and can be waived per mold (F8); SESSION-STATE:148
"the real limit is plunge DEPTH... collet collision and gantry height also
bind". Proposed §5 Notes addition: "The app splits stacks over 6 in unless a
split is waived (CS-003 §7.1.6). A waived stack is taller than 6 in: check the
deepest machined point against tool flute length and collet clearance before
the first setup." Keep the existing R2 open item (placard check still pending,
HANDOFF:52-53).

### F32. §7.2 prerequisites predate mold records (missing, medium)

Current step 3: "Stock glued/cured per CS-003 §7.3 and labeled".
Proposed: "3. The mold is at Board glued in the app, its Mold file is the
current plan (not Superseded), and the stock in front of you carries the mold's
paint-marker ID." Add: "4. CAM stock is the plan's Stock STL (STL S1, S2… for
a split stack) or the Fusion add-in's boxes, so the program and the glued
block agree." Step 2's "No initials, no cutting." should read "no machining",
since "cut" now also names the Tooling cut stage.

### F33. Monday meeting and machine load (wrong/stale, low)

Current §7.1.4: "The weekly summary carries the next 2 weeks of machine load so
conflicts show up Monday night". Evidence: meetings moved to Wednesdays 6:30 to
7:30 (Nick 2026-09-20, ts 1789966467.645809). The Schedule tab has rows
"ShopSabre slot 1" and "ShopSabre slot 2" with the own-reservation note
(`timeline.js:34,243-245`). Proposed: "Put the job in a ShopSabre slot row on
the Schedule tab for the week, and the weekly meeting reviews the next two
weeks of machine load."

### F34. Where the estimate goes (missing, low)

Current §7.1.1 "put the machining time estimate on the WO". No field exists;
proposed "in the WO's Machine mold step note" (same as F20). §9: "WO Machine
mold step note (the app requires one): operator, date, slot, estimate vs
actual, tool list, incidents; a photo is suggested."

### F35. §7.5 step 6 (wrong, low)

Current: "Mold goes to cleaning and sealing per CS-004; update the mold record's
location." Proposed: "Set the mold's stage to Machined and its Home location.
Then clean and seal per CS-004."

### F36. References (stale-path, low)

- R1 "RFS website" → the RSO/RFS hub (sites.google.com/berkeley.edu/rsorfs-hub,
  linked in #composites 2026-09-18).
- R3 "SN5 Drive root" → `SN5 Composites/Shopbot Procedure Checklist_.docx`.
- `timeline.js:241` cites "CS-005 §1" for the Shopbot fallback; it is §2/Appendix
  (code comment, not a standard edit).

### F37. Style (style, low)

- Title row em dash ("CNC Machining of Tooling Board — ShopSabre @ RFS") → "CNC
  Machining of Tooling Board (ShopSabre at RFS)". The H1 already uses the
  bracket form.
- Em dashes as empty table cells at :123, :126.
- Bold mid-sentence: :34 "ShopSabre at RFS", :61 "max cut depth ≈ 6″ in
  practice", :77 "starts", :85 "No initials, no cutting.", :96, :97, :112
  "before", :114, :117 "record of record". Keep only what CS-000 bolds.
- Headings: "7.1 Plan and book (the PP-06 discipline)" → "7.1 Booking the
  ShopSabre"; "7.5 During and after" → "7.5 During the run, engraving the ID
  and cleanup".
- §6 aside "(kept from the Shopbot rules; still a good rule)" and §4 "it has
  saved us more than it has cost us" can go.

### Keep in CS-005

The 5×10 bed, vacuum hold-down, ATC facts; the Z-zero-from-stock-top rule and
figure; own-reservation booking (Slack still shows members booking their own,
1791600706.660069); Larry's CAM review (Slack 2026-10-05, ts 1791255583.929269,
and 2026-10-08 confirm he still reviews); hand-push test; first-minutes watch;
the engraving spec (6 mm, 1.0 mm deep, 3.175 mm ball or 90° V); the Appendix.

---

## Out of cluster, noticed in passing

- `molds.js:668` mold delete message says "There is no undo — export a backup
  first if unsure." while `bulkDeleteRecords` sends it to Recently deleted
  (`core.js:2914-2919`). Code fix.
- `projects.js:65`, `workorders.js:1533,2516`, `season.js:31` call issue
  disposition and the parts evidence gate "the CS-003 enforcement point". No
  standard contains issue disposition at all (grep). Cluster C should place it
  (CS-013) and the comments should follow.
- CS-011 R5 and §7 say "Stock tab" for boards; it is Inventory → Boards
  (cluster G).
- "Tooling cut" means blanks cut on which tool? See F11; README and shop.js say
  ShopSabre, packer.js says saw kerf.
