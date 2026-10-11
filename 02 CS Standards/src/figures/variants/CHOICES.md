# Figure choices, Round 3 (doc overhaul, 2026-10-10)

Two variants per figure (a, b), scored by a visual reviewer (ui) and a shop
reviewer (simon). Where they agreed, the pick stands. Where they split, the shop
reviewer won on content and the visual reviewer on legibility. The winner was
copied to `figures/<base>.v2.svg` (STYLE.md §5: a changed figure gets a new
filename) and every must-fix from both reviewers that applied to it was made.
Nothing in this folder ships.

| Figure | Winner | ui a / b | simon a / b | Why | Fixes applied |
|---|---|---|---|---|---|
| cs000-lifecycle | b | 6.5 / 8.5 | 7 / 8 | Released is the one solid box; paired revise/return arrows carry §7.2 in little ink | Entry line says the row never leaves CS-INDEX (§7.1 step 2); arrow reads "Reviewed, Lead signs" (§7.1 steps 5–6); A's bold "A blank Approver row is never Released" added; Retired band names "practice discontinued" |
| cs000-source-to-shop | b | 6 / 8.5 | 6 / 8 | A numbered recipe in §7.2 order, ending on "announce after both deploys" | Rebuild lines are the full §7.2 step 6 commands (tools/, venv python), letters aligned; "must pass" on --strict; outputs tagged b, c, d; "from 06 Composites App/, after the push" under the deploys; A's "Paul still says the old thing?" footer added |
| cs001-label-anatomy | b | 7.5 / 7 | 7 / 8 | Split; shop reviewer's pick: a real label (real QR, UT INLET L/H, stock tied to use) | A's "no class word is printed; only STORAGE" note added; detail line now process · MOLD-SN6-004 · WO (labelLines parts); CS-001 alt text rewritten to drop the class word |
| cs001-mold-identity | b | 6 / 8 | 7 / 8 | All three marks on one section, numbered in the order the shop meets them | Heading "Identified three times, in this order"; 40 mm dimensioned on both top flanges; flange reason (12.7 mm tacky tape, leak channel); back face reads "inboard of the 40 mm keep-out" (the 25 mm text conflict is flagged, not drawn); citations on one baseline; mold label gains REV B and the 30 PCF · 3 LAYERS · XCR line |
| cs001-scan-chain | b | 7 / 8 | 7 / 8 | Shop-language questions; outcomes heavier than questions; Refused needs no legend | "two+" label clear of the box; "Opens that container"; concrete …/Q/MOLD-SN6-004 example; refusal reason line; Log it boxed with its explanation; final "That doesn't look like a code from a label." exit added (scan.js) |
| cs001-two-codes | a | 7.5 / 7 | 8 / 7 | Both scans visibly converge on one RSN-SN6-001 record | Camera and app arrows leave from the QR; lot is IN2 INFUSION RESIN, 100 : 30 BY WEIGHT, LOT, RECD · EXP (labelLines lots); Campus box solid, not dashed; "24 characters, 6 groups of 4"; edge-print bracket on the rotated strip; empty band removed |
| cs002-stack | b | 6.5 / 8.5 | 7 / 8 | Pattern = orientation, thickness = gsm, big P-numbers | Cu mesh solid dark with open dots (cannot read as 0/90); legend adds mesh, core and "not to scale"; equal ply pitch; unlabelled arrow dropped; MOLD box says "(sealed, CS-004)" |
| cs002-plan-asbuilt | b | 6.5 / 8 | 6 / 8 | Only variant that draws both halves of the freeze rule | Part rows carry the §7.3 ply names, "P1 is the mold side"; Materials rows named; WO-SN6-011 marked "not frozen yet"; "Stack & BOM" once; Compare drawn as a button; ↩ plan "shown only when used ≠ plan"; hatch legend chip; height trimmed |
| cs003-layer-sheet | a | 8 / 6.5 | 7 / 6 | Plain case (L2 on L1 in setup 1) with the Board size column; B invited gluing across a split | Header in the drawings.js title format; chamfered mold corner for orientation; ①/② on insets and Datum A and their tables; in" [mm] placeholders (tables stacked full width so they fit); "Never glue across a SPLIT" by the elevation; heavier split line with end ticks; "rounded to a 1/2 in size"; Right label inside L1 |
| cs003-mold-section | a | 7.5 / 7 | 8 / 7 | Each rule labelled where it lives, with its reason and section | Rotated label replaced by a horizontal "max Z 6 in (152.4 mm)"; scribe Vs moved onto the flat at the flange end, both leadered; glue lines heavier; board-stack label in ink on a white patch |
| cs003-mold-stages | b | 6 / 8.5 | 7 / 8 | SET BY column (APP filled / YOU hollow) and a labelled BLOCKER row | Back-move note horizontal: back, skip ahead and Retired all ask first (molds.js); Tooling cut says you press Mark cut after fixing offcuts, then the app moves it; Board glued "once clamped and the stack is marked" (steps 14–15); Sealed lists Sealed by; refs in muted Inter; pitch tightened |
| cs004-seal-stack | b | 7.5 / 6 | 7 / 8 | Split; shop reviewer's pick: a bottom-up card with the fingernail branch and an unmissable 12 h band | Re-used mold path (Clean 'N Glaze, 1–2 coats); 30 °C numbers (4 min pot life, overcoat about 1 h 30); rotated build-order label replaced by a subtitle; PVA hatched rather than gold so gold keeps its meaning; CS-004 caption rewritten to describe this figure |
| cs005-feed-density | b | 7 / 8 | 7 / 8 | Two outcome boxes a machinist reads from across the room | SPLIT label right of the stack; boxes at house stroke; "still the 45 lb feed"; source line CS-005 §7.4 step 6, CS-003 §5 |
| cs005-zzero | b | 7.5 / 8.5 | 7 / 8 | Check vs X, solid vs dashed Z=0, "at the highest point" | "vacuum zones under the part open"; headings say Right / Wrong; glue lines labelled; "Feb 2026, old Shopbot (R4)"; CS-005 caption "once per setup" |
| cs006-infusion | b | 7 / 8.5 | 7 / 8 | The drop test drawn as a pass/fail loop before any resin is mixed | Peel ply named ("dry stack, peel ply on top"); pleats drawn and the pleat rule on the bag label; valve label under the valve; "never bag straight to pump"; AT-200Y about ½ in off the part; IN spiral leader kinked outside the mold; "Mix IN2 : AT30" |
| cs007-bag-stack | a | 7 / 7.5 | 8 / 6 | Split; shop reviewer's pick: a real section with the port on the breather; B had no port and the tape on the bag | Tape labelled "on the mold, AT-200Y, whole perimeter"; port labelled "sits on the breather"; fail path "Lost more? Hunt leaks (CS-006 §7.7), test again"; Foam wrapped step name added. Breather gap number left out: the standard gives none |
| cs008-holds | b | 6.5 / 8.5 | 7 / 8.5 | The governing hold is the heavy element; the datasheet number is the thin one | Reference temperature on every datasheet label; axis "hours from Finished on / at, set at buy-off"; XCR figure named as initial cure, handleable at about 9 h; locked step named ("Cure and demould", "Cure" on Foam wrapped); Finished defined; CS-008 caption updated (hollow bar) |
| cs009-insert-bond | b | 6.5 / 7.5 | 6 / 8.5 | Leads with "DP420 only, never 5-minute epoxy or superglue" | 2.5 h at 23 °C (73 °F); "Hold the gap the drawing calls for", TDS bondline marked as TDS, no team gap; prep drawn once, 120 grit marked team value; abrade the full bonded length; clamp glyph; acetone footnote (§7.3 step 3) |
| cs009-sacrificial | b | 5.5 / 8 | 6.5 / 8 | A drawn stop line, and the §7.2 response as four boxes | Sacrificial ply drawn thinner than the structural plies; CF skin actually tapers to the crest; app labels exact (⚑ Report an issue on this step; Photos of the defect); "Finish" on a Glass infusion run footnote; sander label wrapped inside the margin |
| cs010-mesh-path | b | 7 / 8 | 7.5 / 8.5 | To scale; probe types by shape; method and pass rule as one strip | "Default < 5 Ω, or the rules value on the run"; "bare, terminable mesh tail: peel-ply window or masked zone"; mesh lightened, probes enlarged; tail moved off the corner probe; "to the grounding point"; "in the step's note"; ⚑ label exact; WO-SN5-006 reference line |
| cs010-path-decision | a | 6.5 / 7.5 | 7 / 5 | Split; shop reviewer's pick, and the R2 must_show lists permeability as a deciding question, which only A keeps; B's Q1 "No" forked unlabelled | Questions numbered 1–4; RECONSIDER Yes has its own arrowhead into the bus; NO CF no longer claims the catch can went to copper paths; mass hint "a whole undertray"; unproven-path note moved from an orphan box to the footer |
| cs011-storage-map | b | 8 / 7 | 6 / 8 | Split; shop reviewer's pick: the resin/hardener shelf rule is drawn, and the NEVER row is clearer | Navy header bars turned into pale bands; "(§6)" not "(CS-011 §6)"; "No app Site names them yet"; Inventory → Boards on RFS container; incident and agreement dates on the NEVER boxes; "No finished parts"; field-check caveat |
| cs012-purchase-tracks | b | 7.5 / 8.5 | 5 / 8 | Numbered steps with each status on its row; heavy STOP bar | Title removed (the caption says it); "+ New Purchase" named; dotted link from Approved to the STOP bar; "under $50 still needs the subteam lead"; Arrived "receiving does not change it"; "/reimburse within a month of buying"; missing row divider; "gate" gone from the file |
| cs013-issue-path | b | 7 / 8 | 5 / 8 | A clean 1–4 spine; A used the banned word "gate" | Title removed; Resolve says where (issue page or closeout list); Cancel ticket leaves from an open issue; Reopen pressed on the closed issue, "the run is held again until it closes"; bar labelled "closeout: every issue closed"; "gate" gone from the file |
| cs013-records | b | 7.5 / 7 | 6 / 7 | Split; shop reviewer's pick: the scrap-and-re-lay story without three WOs fanning out | Subtitle names PROJ, STK, BUY, DOC as unlabelled records and the 14-character cap; the other half of the split mold is its own run in MOLD-SN6-005; buyRef replaced by the app's "From purchase"; BUY box says never labelled |
| cs014-receiving-flow | b | 6 / 8 | 6 / 8 | One numbered path with Class first and resin/hardener on separate rows | Title removed; "Review N records (Ctrl+Enter)" on the arrow; full column list; "all 24 characters off the face of the tag" instead of an edge-print-looking code; "dated with Arrived"; clipped-looking shelf base removed; No location line; Budget-tab Arrived hand-off |

No figure came back "neither" from both reviewers, so none was picked on score
alone.

## Left for the text, not the figures

- CS-001: §6 rule 2 (40 mm from the flange perimeter, either face) and the §7.2
  table (25 mm inboard of the outline) give two numbers for the back face. The
  figure shows the 40 mm keep-out, which satisfies both.
- CS-003 §5 lists 30 and 60 lb/ft³ board; the app and the feed figure use 45 lb.
- CS-007 §7.4 step 2 gives no number for the breather gap.
- CS-009 §7.6 step 8: the no-load hold is still [lead input needed]. When the
  lead sets it, cs009-insert-bond is redrawn under a new filename in the same
  change.
- CS-011 §7.3: the Flammables cabinet has no table row; resins and hardeners
  have no app Site.
- CS-013 text still says "gated" and "gate" in places (the figure no longer does).
- CS-008 §5.1 "48 h is after the weekend" only holds for a Friday infusion.
