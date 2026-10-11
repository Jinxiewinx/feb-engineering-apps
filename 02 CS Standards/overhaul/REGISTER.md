# Documentation overhaul: change register (Round 1 merged)

Date: 2026-10-10. Built from the eight Round 1 audits in `overhaul/R1-audit/`
(A-meta, B-labels, C-workorders, D-molds, E-process, F-finish, G-supply,
H-paul). Round 2 drafters work from this file, not from the audits. The
audits keep the full evidence; this register keeps the decision.

## How to read it

- **One table per document**, CS-000 to CS-013, then CS-INDEX and the
  template, CS-014 (new), quick references, Steve, and "Other files" (README,
  app docs, tooling and code fixes outside the standards).
- **ID** is `R-<doc>-<n>`. It is stable: later rounds cite it in commit
  messages and revision history rows.
- **§** is the section in the current `src/` copy. "new" means an appended
  section or step; nothing here renumbers an existing section, because about
  50 `CS-0xx §n.n` references live in code and other standards.
- **Type**: wrong, missing, stale-path, style, process-rule (a shall, should
  or may added, removed or changed).
- **Decision**:
  - **do**: a clear correction, or a missing feature with code evidence.
    Drafters write it.
  - **do (rule)**: a process-rule change I judge right. Drafters write it,
    and it is listed in "Process-rule changes" with old and new wording so
    Nick and Simon can see what the rules now say.
  - **hold: Simon**: CS-011 §6, and anything that changes how a member
    physically does a shop step without evidence the team already works that
    way. Drafters leave the current text and mark the spot; the question is
    in "Open questions".
  - **drop**: wrong on inspection, or a "keep as is" recorded so the choice
    is visible.
- **Series-wide rows** sit in the CS-000 table and name every section they
  touch (for example R-000-11, the weekly meeting).
- **Datasheets moved under this audit.** Round 5 committed 31 datasheets in
  `f00a701` while Round 1 ran. Findings that said "West SDS not on file",
  "DP420 SDS not on file", "no acetone or IPA SDS" or "no glove chart" are
  rewritten here to cite the new files. Still missing after Round 5: the
  AT30 FAST SDS, the LiME LiNE Part B (isocyanate activator) SDS, a graphite
  powder SDS and the copper mesh spec. Several Round 5 files are stand-ins
  (`03 Datasheets/INDEX.md` Confirm column); no number is read from a
  stand-in.
- Evidence is short. The audit file named in brackets has the file:line,
  commit and Slack timestamp.

## CS-000 Document Control

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-000-01 | §5 | wrong | Replace the Drive line: the source is the markdown in `02 CS Standards/src/`, figures as SVG in `src/figures/`; built from it, a .docx beside the sources and a PDF at `docs/standards/CS-0xx.pdf` (unlisted in Documents, opened by Paul's chips); the August Google Docs are retired and frozen (`GOOGLE-DOCS.md`); the master list is CS-INDEX | Google Docs retired 2026-10-10 (45613d5); Drive folder name never matched; Paul quotes this line today as CS-000#6 [A] | do |
| R-000-02 | §4, new §7.5 | missing | Define Quick reference (QR-XXX): derived, uncontrolled, no approval table, header Parent and Checked against (or Covers for an app how-to), the parent wins. `Parent` may list several sections separated by semicolons, with one Checked against per parent. New §7.5 "Writing or updating a quick reference": reserve the number in CS-INDEX, copy `template/QR-Template.md`, numbers copied with citation, sections 300 to 2,400 characters with the answer in the first 240 and an "Also called:" line, run `check_traceability.py` | STYLE §6; corpus regex `(CS or QR)-\d+` (b16baa0); lint 10; QR-008/009/010 draw on several standards [A, H] | do (rule) |
| R-000-03 | §7.2 new steps 5-6; §7.1 step 6 | missing | Step 5: rebuild from the repo root (render_figures if an SVG changed, build_docx --all, gen_docs_manifest, build_ai_corpus, check_traceability) and commit source and built files together. Step 6: a revision reaches members only after the hosting deploy and Paul only after the functions deploy; do both and name them in the commit. §7.1 step 6 points here | tools/README.md:134-142; path fixes sat stale in built copies for five weeks (97a486c); bb5cc0b "Paul keeps the old 209 ratio until then" [A] | do (rule) |
| R-000-04 | §7.2 new step after 3 | process-rule | In the same change as a revision, update every QR whose Parent is this standard, every printables card naming the revision, and every `CS-0xx §n.n` reference in other standards and app code if a section number moved | printables.html pins revisions three letters old; lints 10 and 11 [A] | do (rule) |
| R-000-05 | §4 Revision | process-rule | One letter per change set, however many drafts; typo fixes may wait; a path fix needs no bump and is recorded in `src/rev-exemptions.txt` | Simon 2026-09-02; lint 8 (94a674b); CS-012 took E and F the same day [A] | do (rule) |
| R-000-06 | §7.2 step 2; §4 Status | process-rule | "Under Revision" is set in CS-INDEX only while the draft lives outside `src/`; lint 6 accepts INDEX "Under Revision" against a header "Draft". The auditor's first option (also edit the src header) was not taken: a status-only header edit forces a PDF rebuild and deploy that tells a member nothing | lint 6 (check_traceability.py:190) gives 14 warnings during R2-R6; PLAN:98 [A] | do (rule) |
| R-000-07 | §7.1 step 6 | process-rule | Define the lead's signature: the Composites Lead approves in writing (a Slack message or a PDF comment naming document and revision); the repo maintainer records the name and date in the Approver row, sets Released in header and CS-INDEX, and links the approval in the commit message | 14 blank Approver rows; Drive gone, so nothing can become Released [A] | do (rule) |
| R-000-08 | §7.1 step 5 | process-rule | An agent review, written "simon (reviewer agent)" with its date, satisfies the review for a process standard. A shop procedure also needs a member who did not write it to walk it before the lead signs; their name goes beside the agent's. The Reviewer row names the review of the current revision | 12 of 14 rows are agent reviews; most undated; CS-001 blank [A] | do (rule) |
| R-000-09 | §2 | process-rule | App values a lead can change (team cure holds, technique checklists, restock minimums) are owned by CS-008, CS-013 and CS-011, which state the rule and the value at their revision and name the app as the live value. A lead who changes one shall open a revision of the owning standard within two weeks. Merges E's CS-008 "record a changed hold at the next revision" and G-08 | resins.js:45-50; 7de5d56, 9092f0d; inventory.js:83-112 [A, E, G] | do (rule) |
| R-000-10 | §2; §4 Draft | process-rule | Paul's answers, Steve's notes and anything AI read off a receipt, slip or label are not controlled documents and never a source under §7.1 step 3. Add after Draft: "Paul cites a Draft standard as the team's current guidance and names its revision" | PAUL_SYSTEM rule 1; AI fills 48f7a9b, c93020c [A] | do (rule) |
| R-000-11 | series | wrong | "Monday meeting" becomes "the weekly meeting" in CS-000 §4 and §8, CS-002 §7.2 step 3, CS-005 §7.1 step 4 ("show up Monday night"), CS-013 §7.4 and §8 rows 1 and 3, and STYLE.md §2 (R-OTH-01) | #composites, Nick 2026-09-20, ts 1789966467.645809: meetings now Wednesday 6:30 [A, C, D] | do |
| R-000-12 | §7.1 step 4 | missing | Figures: rendered in Saira and Inter by render_figures.mjs; markdown references the PNG with the caption as alt text; no text under about 9 pt at 6.5 in print width; a changed figure gets a new filename; details in STYLE §5 | STYLE §5; b16baa0 [A] | do |
| R-000-13 | §8 | missing | Replace "Skim headers" with `check_traceability.py --strict`; add rows for cross-references and figures (same script), QRs checked against the parent's current revision, and built copies matching source (an unchanged standard rebuilds byte-identical) | lints 6-12; 97a486c [A] | do |
| R-000-14 | §3 | missing | Add R4 STYLE.md (CS-000 wins), R5 tools/README.md pipeline section, R6 tools/check_traceability.py, R7 GOOGLE-DOCS.md (historical); R2 also names template/QR-Template.md | [A] | do |
| R-000-15 | §9 | missing | CS-INDEX records what exists; each revision history says what changed and why; the commit history of `02 CS Standards/src/` records every edit, including exempt path fixes | [A] | do |
| R-000-16 | §7.4 | process-rule | Handoff review covers "every Released or Draft standard"; record in CS-INDEX that summer 2026 was skipped (the series was being written) and the first is due before fall recruiting 2027 | no standard is Released, so the rule reviews nothing today [A] | do (rule) |
| R-000-17 | §1 | style | Rewrite "turnover isn't a risk, it's a schedule" | First-person opening paragraph reads as Simon's voice; line dates from 533ed39 with no authorship split; CLAUDE.md rule 5 keeps his voice | drop |
| R-000-18 | §7 blockquote; §7.1 step 2 | style | The maxim "A standard nobody can find..." becomes a plain sentence at the end of §7.4; drop the bold on "immediately". Keep the two bolded rules (blank approver, two-week post-incident review) | STYLE §2-3 [A] | do |
| R-000-19 | §2 | missing | One line: Steve's notes (`06 Composites App/steve/`) are a joke character's material, not documents under this standard, and are never cited | STYLE §7; build_ai_corpus.mjs header [A] | do |
| R-000-20 | series headers | wrong | Round 6 fills every Reviewer row with the overhaul review and its date, with no em-dash suffixes (the G-round notes in CS-004 and CS-006 move to history if worth keeping) | CS-001 blank; CS-004/005/006 dated 2026-07-12, three revisions old [A, E] | do |

## CS-001 Labeling & Identification

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-001-01 | §4 Class word; §7.6; Fig. 1 | process-rule | Drop "mandatory, and larger on the label than the code itself". The label leads with the name; the class word is derived from the ID prefix and shown on the scan page and in the app. Keep the one-to-one prefix mapping and "R&D is not a class". The other option (app prints the class word beside FEB) was not taken | labels.js:358-389 never printed a class word since 972be8c; name-leads layout is Simon's call (8fd3b63) [B] | do (rule) |
| R-001-02 | §5; §7.2; §7.9 step 1; Fig. 1 | wrong | Printer becomes a Brother QL-series on the shed wifi via AirPrint with DK-2210 29 mm continuous (cut at 101.6 mm) and DK-1201 29x90 die-cut as fallback, needing CS-012 approval, not bought as of 2026-10-10. Drop "or TZe"; "spare roll", not "spare cartridge". Same fix in CS-012 §7.8 (R-012-06) | labels.js:531-562 LABEL_ROLLS; c62df0b; Slack 1787808874.121659 "purchase / connect label maker" still open [B, G] | do |
| R-001-03 | §5; §7.1; §7.2; §8 | missing | DK-2210 and DK-1201 stock rows with the direct-thermal caveat; "On a roll" steps (media, Copies of each, print dialog, measure the first label at 101.6 mm); a roll-length check in §8 | labels.js:675-713, 819-824; app README Labels [B] | do |
| R-001-04 | §7.2 | process-rule | New shall: anything that will see IPA, acetone or resin gets a 5522 polyester label, never direct-thermal roll stock | app README: thermal fades in UV, blackens with heat, smears under solvent [B] | do (rule) |
| R-001-05 | §7.1 steps 1-2 | wrong | Step 1 names the real buttons (Label, Study label, the coupon print icon, Labels on Inventory, Molds, Items and Materials, Label sheet under Reports). Step 2: Label prints on this device's media, set under Reports → Label media; to print 5522 from a device set otherwise, use the builder's Media | reports.js:446-451; labels.js:612-617, 808, 1147-1171 [B] | do |
| R-001-06 | §2; §5; §7.2 resin row; §7.6 | process-rule | A chemical container wearing a campus EH&S tag gets no FEB label; the tag is its label, recorded in EH&S barcode (§7.11). An untagged container gets a 5522 FEB label until campus tags it, then the tag is recorded and the FEB label stays (never peel, §7.5). App conflict at receiving.js:798 goes to R-OTH-24 | 834d6bc "the team does not want a second FEB sticker"; Slack 1787808874.121659 barcode sync struck through as done [B] | do (rule) |
| R-001-07 | §4 | missing | Define EH&S tag (campus RSS sticker, Data Matrix, 24 characters in six groups of four, last 12 reprinted down the right edge, stored in EH&S barcode, FEB never prints one) and Data Matrix (the scanner reads it; FEB labels are QR). Synthetic example code only | core.js:1695-1740; 8861ef6 [B] | do |
| R-001-08 | new §7.11 | missing | "Chemical containers and the UC EH&S tag": scan or type the tag into the EH&S tag column at receiving; scan into EH&S barcode on an existing record; type the 12 edge characters if scuffed; one tag per container; an unknown tag offers "Log it". The desk itself is CS-014 | receiving.js:572-636; shop.js:126,177,903; scan.js:234-294 [B] | do |
| R-001-09 | §3; §9 | missing | Reference CS-014; §9 says EH&S barcode is the join key to campus RSS | ehsimport.js; inventory.js:994-1058 [B] | do |
| R-001-10 | new §7.12 | missing | "Scanning a label": phone camera opens the public page; in-app Scan opens the record; Move then "Scan the shelf"; "Move here (scan)" for restocking; FEB QR or EH&S tag at either end; type the ID or the last 12 tag characters if the camera fails | scan.js:71-339; inventory.js:841,869-880; workorders.js:3072-3081 [B] | do |
| R-001-11 | §4 QR code; §9 | wrong | Replace "needing no account and no signal": no account needed; on a weak connection the page still shows class and ID from the code; with no connection the phone cannot open it, so read the label. §9 lists what the public page shows and never shows, and what "No record with this ID yet" means. App README fix in R-OTH-13 | q.html; no service worker; firestore.rules /pub hasOnly [B] | do |
| R-001-12 | §9 | missing | A deleted record's label scans to "no record" publicly; in the app it names who deleted it; restore under Reports → Recently deleted, do not relabel | 3cd3e97; fb.js:399-425; core.js:1967-1973 [B] | do |
| R-001-13 | new §7.13; §7.10 | process-rule | "Labels with no record": Custom label is for signs, warnings and untracked bins; it shall not be used for anything that has a record or carry an ID-shaped line; a shelf holding tracked material gets a storage record and its own Label | inventory.js:610, 839; labels.js:914-982 [B] | do (rule) |
| R-001-14 | §7.6 Storage row; §7.10 | wrong | Storage label prints site and kind, FLAMMABLES OK when rated, and a footer with the contents-confirmed date. Steps: + Location on Inventory → Storage map, Label on the location page, any RSS shelf tag in EH&S barcode | labels.js:479-488; inventory.js:601,843 [B] | do |
| R-001-15 | §2; §4 class words; §7.2 | missing | Add WORK ORDER and CONSUMABLE; RESIN covers hardener; work orders in scope. The §7.2 row for a WO label waits on what physical thing it goes on (open question 13) | labels.js:238,243,761-769; workorders.js:1510 [B] | do |
| R-001-16 | §2; §4 | missing | Issues (PROJ), purchases (BUY), documents (DOC) and stack plans (STK) never get a label; keeping PROJ off labels stops it being misread as P. CS-013 §4.1 already cites this | labels.js:757-760; fb.js:126 [B] | do |
| R-001-17 | §7.4 new step before 1 | process-rule | At tooling cut, before a blank leaves the saw, write its mold ID or plan name and layer tag (L1, L2b) from the cut sheet in paint marker. Merged with R-003-25 | 544f23b, 5a26fc7 cut sheets carry the tags; no evidence members mark blanks today [B, D] | hold: Simon |
| R-001-18 | §7.2 remnant row; §7.6 Board | missing | Marker ID on the face plus the printed board label (density, dimensions, origin mold) on a taped tag, printed from "Print labels" after marking a cut | stock.js:1797-1808; labels.js:500-513 [B] | do |
| R-001-19 | §7.7 last line | process-rule | Write OPEN, date and initials in paint marker on a recorded container when it is opened (its label predates opening). Pressing Open in the app is R-014-05 | receiving.js:960 prints Sealed labels; no evidence of the marker habit [B] | hold: Simon |
| R-001-20 | §7.2 | missing | Consumable row: on the box or bin holding them, one label per record; chemical consumables follow R-001-06 | receiving.js:58-61 [B] | do |
| R-001-21 | §7.2 fabric offcut bag | wrong | The lot label has no blank field: write the remaining length beside the label in paint marker and update the record's quantity | labels.js:471-478 [B] | do |
| R-001-22 | §7.5 step 1 | missing | On a roll set Copies of each to 2; on a sheet print twice using Start at cell. App hint fix in R-OTH-25 | labels.js:649-673, 823 [B] | do |
| R-001-23 | §6 rule 2; §7.4 step 3 | wrong | "CS-006 §7.4.3" becomes "CS-006 §7.4 step 3" (step 3 lists seams first; B's proposed "CS-006 §7.4" loses that). "CS-004 §7, step 4" becomes "CS-004 §7.5" | Checked CS-006.md:121-127 and CS-004.md:142 [B, E] | do |
| R-001-24 | §7.4 step 1 | wrong | "Mark the part name, the WO and an up arrow", matching CS-003 §7.3 step 3 | CS-003.md:113 [B] | do |
| R-001-25 | §4 QR caution | missing | One sentence: the app draws the QR at 21.4 mm (27 mm on 5522), never below 14 mm, quiet zone inside the label; do not trim into it | labels.js:74-112, 653 [B] | do |
| R-001-26 | §7.6 | missing | One line: check an AI-read lot or expiry against the container before printing (CS-014 owns the rule, R-014-03) | shop.js:741-742; c93020c [B] | do |
| R-001-27 | whole | style | Unbold emphasis (keep §6 rule labels); move the Rev C narrative in §1 to history; rename "7.3 The general rule" to "7.3 Engrave, encapsulate or laminate: choosing the label method"; new headings in askers' words | STYLE §2-3 [B] | do |
| R-001-28 | §8 | process-rule | New checks: a roll label measures 101.6 mm each session; every chemical container has its EH&S tag recorded or an FEB label (monthly walk with the EH&S reconciliation export); no thermal label on IPA, acetone or resin items; every shelf with tracked material has a storage record and label (Confirm contents) | follows R-001-03, -04, -06, -13 [B] | do (rule) |
| R-001-29 | §9 | missing | Add EH&S barcode, the public nameplate and how it is rebuilt (Reports → Rebuild scan mirror), the shelf contents-confirmed date | labels.js:193-232; reports.js:456 [B] | do |
| R-001-30 | §3 | missing | CS-014 row; app-code row (app/labels.js, app/scan.js, app/q.html) | [B] | do |

## CS-002 Laminate Schedule & Ply Stacks

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-002-01 | §5; §9 | wrong | The plan lives on the part (Parts tab, Layup stack); each run gets a copy that becomes its as-built record in Stack & BOM. §9: plan, each run's as-built, deviations and step photos are the record | core.js:2200-2232; parts.js:1118,1523; workorders.js:1385 [C] | do |
| R-002-02 | §7.2 step 2 | process-rule | Freeze is the buy-off of Stack frozen on the run. The signer shall have agreed the stack with the RE and the Composites Lead (and the requesting subteam's lead) and names them in the step note. A lead may add a note requirement to Stack frozen in Layup techniques | one buy-off, one signer (workorders.js:272, 3366) [C] | do (rule) |
| R-002-03 | §7.2 step 1; §8 row 1 | process-rule | Rule unchanged (stack freezes before mold machining). §8 method becomes: the run's blocker in the app, plus a lead check at the weekly meeting for any mold advanced on the Molds tab or the cut list, since neither checks Stack frozen | shop.js:46; 31994e0; stackFrozen() only display callers [C, D] | do (rule) |
| R-002-04 | §4 Stack freeze; §7.2 step 3 | wrong | A frozen-stack change: edit the run's stack in Stack & BOM, raise the run's Revision one letter, write why in Notes; press "Adopt as the part's plan" if future runs should follow | workorders.js:340,1596-1645; core.js:2238-2275 [C] | do |
| R-002-05 | §7.4 step 1 | process-rule | "The RE ticks each ply as laid" becomes: the RE checks each ply against the run's stack and edits any change into it with the reason in that ply's Notes; a tick in pen on a printed traveler is allowed (may). Same text in CS-007 (R-007-08) | the ply table has no laid tick (core.js:2069-2104) [C, E] | do (rule) |
| R-002-06 | §7.4 new step 4 | missing | At the cure buy-off confirm or correct Materials used per BOM line (blank = not measured); "↩ plan" or "Adopt as the part's plan" so the next run starts from what this one learned | workorders.js:1674,1711,2974; parts.js:1073,1123 [C] | do |
| R-002-07 | §7.1 step 1 | wrong | The ME drafts the stack on the part (Parts tab, Layup stack, + ply), one row per ply from the mold surface outward | core.js:2081,2111-2125 [C] | do |
| R-002-08 | §4 | missing | Define ME / RE: the Mold Engineer and Manufacturing Engineer fields on the part and its runs, both roster picks. Same definition in CS-013 §4 | people.js:136; workorders.js:1604 [C] | do |
| R-002-09 | §4 cloth naming | missing | Keep "always gsm"; a cloth with unmeasured gsm is written by type and source (UD carbon, ACP, gsm TBD) until measured; inserts (G10) and their thickness are plies like cores | Slack 2026-09-03, 2026-09-30, thread 1791598931.301419 [C] | do |
| R-002-10 | Coupons heading | style | "### Coupons" becomes "### 7.5 Coupons: IDs and data files" | STYLE §3; no inbound reference [C] | do |
| R-002-11 | Coupons paragraph | wrong | The study's Materials carry the stack as text (P1 outward, or the run ID the panel came from), the three lots, layup date and who laid it up; coupons inherit; clearing a coupon cell hands it back | rnd.js:194,1375-1381 [C] | do |
| R-002-12 | §7.3 example | style | Split the P5-P6 row into P5 (195 twill, 0/90) and P6 (195 twill, ±45) | app ply table is one row per ply [C] | do |
| R-002-13 | §3 R1 | stale-path | Add the path `01 Pain Points and Improvements/src/pain-points.md` beside FEB-COMP-PP-001; add R5 app README (Parts, Work Orders, R&D bench). Same R1 fix in CS-013 | [C] | do |

## CS-003 Mold Design & Tooling Board

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-003-01 | §6 Ure-Bond 90 | wrong | Hazard: Part A contains MDI (an isocyanate), a respiratory sensitizer (H334) and eye irritant (H319). Mix and glue only with room ventilation, never heated or sprayed. Eyes: flush 15 min and get medical attention. "Cure heat is mild" goes: the TB's mild heat is about speeding the cure | SDS 1386A §2, §3; URE_BOND_90_TB p1 [D] | do |
| R-003-02 | §6 Ure-Bond 90 PPE | process-rule | PPE becomes safety glasses with side shields, liquid-tight gloves of a material the SDS names (butyl, neoprene or PVC; nitrile per the Ansell chart from R5), long sleeves, and the CS-009 respirator if ventilation is poor | SDS §8, P284 [D] | hold: Simon |
| R-003-03 | §3; §5 | process-rule | The TB rates Ure-Bond 90 for board up to 30 lb/ft³; the app plans 30, 45 and 60 lb and mixed stacks. Either record 45/60 lb glue-ups as team practice beyond the TB, or name another adhesive above 30 lb | TB p1; stock.js:16 [D] | hold: Simon |
| R-003-04 | §7.3 step 2 | missing | Split into steps with the TB numbers: 1A:1B by volume (100A:88B by weight), pre-mix Part B, mix 3 min, pot life 8 min at 73 °F, clamp 4 h. The wait before machining stays the existing "full cure per TB", now with its number: 16 h at 73 °F (23 °C). State the TB's "machinable in 4 hours" as the datasheet figure, not the rule | TB p1 [D] | do |
| R-003-05 | §7.3 step 1 | process-rule | "Compressed air + IPA wipe" becomes: vacuum the faces, wipe with IPA, and let the IPA flash off fully before glue touches it | CS-005 §6 bans blowing dust with compressed air; TB "let the solvent fully dry" [D] | do (rule) |
| R-003-06 | §7.2 checklist | missing | Item 7 becomes "Mold file (STK-SN6-###) exists and the Molds overview shows no Short N blanks". New items: 10 the plan is the current Mold file, not Superseded; 11 the dashed mold outline sits inside every block in the Stack view; 12 every plan warning fixed in CAD or answered in the WO note | molds.js:631; slicer.js:959-1003 [D] | do |
| R-003-07 | §7.2 steps 1-2 | process-rule | The review happens before any blank is cut from the cut list, any stock is glued or any ShopSabre slot is booked: "No initials, no cutting, no glue, no booking." Say the cut list does not check the review | stock.js cutHeldBackReason; 31994e0 [D] | do (rule) |
| R-003-08 | §7.2 | missing | The app holds "Mold design review" until the CAD is attached or linked and the signer holds Mold design training; it does not check that the signer is not the designer | workorders.js:272-283, 584-592, 3262-3305 [D] | do |
| R-003-09 | §4 Max-Z; §7.1.6; §7.2 item 6 | process-rule | The planner splits stacks over 6 in automatically. Tick the split waiver only when the design keeps the cutter within 6 in of a reachable face; the app records who. Item 6 adds: or a split waiver, with the reviewer having checked the deepest machined point and tool reach past the collet | stock.js:915; molds.js:579-587; 658ad85 [D] | do (rule) |
| R-003-10 | §7.1 new step 8 | missing | Plan the stack in the app before review (Molds → + Mold; Re-plan by a lead); export STL in mm and match STL units, or use the Fusion add-in; one body at a time; the planner uses only boards in Inventory → Boards, splits at 6 in, and creates the mold at Designed with its Mold file. STL is beta: check the Stack view, fall back to dimensions | stock.js uploadMold; molds.js:610-621 [D] | do |
| R-003-11 | §5 CAD/CAM row; §7.1 new step 9 | missing | Fusion add-in (FEBPlanStock): Molds → Plan from Fusion; in Fusion, Utilities → FEB → Plan stock; select Mold body and Bottom face; blanks return as bodies in a component named after the plan; save the document yourself. CS-005 §7.1 gets a one-line cross-reference (H wanted it in CS-005; it belongs where planning is) | FEBPlanStock.py:418-487; molds.js:318; fusion.js MIN_ADDIN_VERSION [D, H] | do |
| R-003-12 | §7.3 | missing | Retitle "7.3 Cutting blanks and gluing tooling board (Ure-Bond 90)". New first steps: open the cut list (Designed and reviewed molds only), check the batch tag, cut all the way across, "Mark these boards cut…" with offcut sizes corrected in mm (moves the mold to Tooling cut), "Print labels" for offcuts; re-cut by walking the stage back. Name the cutting tool once open question 4 is answered | shop.js:36-46; packer.js:44; 544f23b, 31994e0 [D, H] | do |
| R-003-13 | §7.3 | missing | Place each layer from its layer sheet in the Drawings set: insets from the board below, then check the Datum A table. Blanks carry 1 to 2 in margin, rounded to 1/2 in | drawings.js:1330-1489; slicer.js:72-85 [D] | do |
| R-003-14 | §5 board grades | process-rule | CS-003 §5 owns the rule the code already cites to CS-004: grades are not interchangeable silently; plan at one grade or give min and max in the mold modal; inside that range any board may supply any blank; the densest board cut sets the feed (CS-005 §7.4). Code and README citations move to CS-003 §5 (R-OTH-19) | stock.js:336,1004; packer.js:304; README:497 cite a CS-004 sentence that does not exist [D, E] | do (rule) |
| R-003-15 | §5; §7.2 item 7 | missing | On hand: Inventory → Boards, one record per sheet or offcut (BRD-SN6-###) with its shelf; the planner uses only boards recorded there | inventory.js:604; stock.js [D] | do |
| R-003-16 | §2; §7.1.4; §7.1 new step 10 | process-rule | Append to §7.1.4: a part with an overhang is made on a split mold, each piece with positive draft from its own direction, split line and alignment features in CAD. Step 10: each piece is its own mold record, linked on the part; a WO covers one mold, so the second piece gets its own run and its own §7.2 review | Slack 1789864448.608589, 1791137261.914529, 1790837965.882759; 174b91c [D] | do (rule) |
| R-003-17 | §4; §7 steps | missing | Define Mold stage (Designed, Tooling cut, Board glued, Machined, Sealed, Ready for layup, Retired off the track) and name the stage each step sets; retire an unused mold, do not delete it | shop.js:46; molds.js:135-167 [D] | do |
| R-003-18 | §9; §7.4 step 2 | wrong | The mold is its own record (MOLD-SN6-###): stage, Home location, density range, Highest density cut, layers, sealing, Parts pulled, Mold file (STK-SN6-###), Datum cut plans. The WO holds the review buy-off, the Glue mold stock and Machine mold step notes, and photos | shop.js SHOP.molds; workorders.js:343,1582 [D] | do |
| R-003-19 | §4; §9 | process-rule | Define datum cut plan. New should: when reference cuts are taken off a mold after a part comes out, attach the drawing under Datum cut plans | molds.js:589-604; c4c7885 [D] | do (rule) |
| R-003-20 | §7.1 step 8 | process-rule | Re-plans are done by a lead; the old plan stays under Earlier, marked Superseded; cut and machine only from the current plan | molds.js:476-481,610-621 [D] | do (rule) |
| R-003-21 | §7.2 item 8; §8 | missing | The machining time estimate and the actual go in the WO's Machine mold step note (there is no estimate field) | workorders.js:273,593-597 [D] | do |
| R-003-22 | §3 | stale-path | Add R7 app README (Molds; The cut list, on paper), R8 FEBPlanStock README, R9 `SN5 Tooling Board Adhesives.docx`, R10 Precision Board PBLT-30/60 TDS and SDS (now on file, f00a701; confirm PBLT against a board label). Use or drop R6 Rohacell | [D]; 03 Datasheets/INDEX.md:42 | do |
| R-003-23 | §7.2; §7.3; §5 table | style | Drop emphasis bold (keep step-lead labels); the em-dash empty cell becomes blank or "n/a" | STYLE §2 [D] | do |
| R-003-24 | §7.3 training | process-rule | Gluing mold stock requires ShopSabre CNC training, as the app already gates it (or the app rule changes) | workorders.js:273,284 [D] | hold: Simon |
| R-003-25 | §7.3 step 3 | process-rule | Add the mold ID to the paint-marker marking on the glued stack. Held with R-001-17 | stock.js submitMold creates the ID at Designed [D] | hold: Simon |

## CS-004 Mold Sealing & Release

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-004-01 | §7.3 step 7; §8 cure row | process-rule | Do not start the release system (§7.4) until the 12 h FEB hold after the last XCR coat (CS-008 §5 already sets it); datasheet initial cure 8 h 30 at 20 °C (R1). The app does not lock it: record the last-coat time in the "Seal and release mold" step note. §8's "fingernail at 24 h" becomes "before the release system goes on, at or after 12 h" | CS-008 §5; resins.js:98-105; no startsHold on the seal step [E] | do (rule) |
| R-004-02 | §6 eyes | process-rule | "Safety glasses" becomes safety goggles with side protection (EN 166) whenever XCR resin or hardener is open, mixed or brushed; prescription glasses are not eye protection | XCR SDS §8.2, H318 on both parts [E] | hold: Simon |
| R-004-03 | §6 hazards | wrong | Per the SDS: both parts cause allergic skin reactions (H317) and serious eye damage (H318); the hardener is corrosive (H314); the resin is suspected of causing genetic defects (H341). Not a respiratory sensitizer (no H334) | XCR SDS §2 [E] | do |
| R-004-04 | §6 | process-rule | New shall: anyone who has had a skin reaction to epoxy shall not mix or brush XCR, and tells a lead | XCR SDS §7.1 [E] | do (rule) |
| R-004-05 | §2 | stale-path | "CS-006 Composites Appendix A" becomes "CS-003 Appendix A" (3D-printed compression molds); add hotwire foam male molds to Not covered | CS-003.md:37,135 [E] | do |
| R-004-06 | §3; §7.3 step 6 | wrong | Overcoat time about 2 h 50 at 20 °C (1 h 30 at 30 °C) is when the first coat is usually firm but tacky; check with a fingernail, the state decides (R1). Not a deadline | XCR TDS p2 [E] | do |
| R-004-07 | §7.4 step 4; §7.5; §9 | process-rule | Name the exact fields: Sealing system = XCR, Sealed on, Sealed by (pick yourself), Stage = Sealed; batch masses, coats and times in the "Seal and release mold" step note. Append to §7.5: set Stage = Ready for layup | shop.js:46,88-93; a273b7e [E] | do (rule) |
| R-004-08 | §7.3 step 6 | process-rule | New should: a mold cut from a range of grades seals like its softest board; plan two coats if any of it is 30 lb | shop.js:76-79; README:490-497 [E] | do (rule) |
| R-004-09 | §7.3 step 1 | missing | Both jugs inside 15-30 °C before mixing (bring them in first on a cold night); room not humid (R1) | XCR TDS p2 [E] | do |
| R-004-10 | §7.5 caution; step 3 | wrong | Example becomes "SEALED 2025-11-02 · J LEE · USES 09" (placeholder name); step 3 also checks the sealed-by name | labels.js:430 [E] | do |
| R-004-11 | §5 IPA row | missing | "≥90% IPA (the 91% bottle), not the 70% rubbing alcohol"; cite the new IPA SDSs (stand-ins) | materials.js:85-86; f00a701 [E] | do |
| R-004-12 | §7.3 step 6 | missing | Make the next-session branch explicit: coming back another day means tack-free; wait at least 9 h, key with 120 grit, blow off, IPA wipe, recoat (R1) | Slack thread 1790292814.671159 [E] | do |
| R-004-13 | §3 | missing | Row: storage 20-25 °C, sealed, 12-month shelf life (R1); where it lives is CS-011 | XCR TDS p3; materials.js:58 [E] | do |
| R-004-14 | header; §7.3-7.4 headings | style | Reviewer row: comma for the em dash. Headings "7.3 Sealing with XCR: batch size, coats, overcoat window" and "7.4 Release: wax coats, then PVA". Three [PHOTO] placeholders stay | STYLE §2; H retrieval sim [E, H] | do |

## CS-005 CNC Machining (ShopSabre)

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-005-01 | §4 Certified operator | process-rule | "Nothing in this repo tracks HOT status" is wrong. The RFS record on the RSO/RFS student access dashboard is the authority; the app's ShopSabre CNC training mirrors it, and a lead grants it only after seeing the RFS record | workorders.js:18-24,273,284; Slack 1789751742.035699 [D] | do (rule) |
| R-005-02 | §7.4 new step | process-rule | Set CAM feeds for the highest grade in the stack (the mold's Highest density cut, or the top of its planned range before cutting) | stock.js feedRateBand; drawings.js:1375-1380 [D] | do (rule) |
| R-005-03 | §7.4 step 2 | process-rule | Build CAM against the current FEB ShopSabre tool library (posted 2026-09-16; the older one is deprecated). Where the file lives is open question 12 | Slack 1789327005.119489, 1789616754.437739, 1791599270.395009 [D] | do (rule) |
| R-005-04 | §7.4 step 1 | process-rule | "Zero Z once per job" becomes once per setup; each section of a split stack is its own setup with its own stock STL and zero | molds.js:622-624; drawings.js:1379 [D] | do (rule) |
| R-005-05 | §2 | process-rule | Scope covers XPS foam, G10 and cured CF panels under the same booking, operator and Z-zero rules; G10 only with Larry's say-so; CF and G10 dust per CS-009 | Slack 1790837965.882759, 1791478658.838899, 1790358975.434619 [D] | do (rule) |
| R-005-06 | §5 max cut depth | missing | The app splits stacks over 6 in unless waived (CS-003 §7.1.6); for a waived stack, check the deepest machined point against flute length and collet clearance before the first setup. Keep the R2 placard open item | slicer.js:231; 658ad85 [D] | do |
| R-005-07 | §7.2 | missing | Prerequisites: mold at Board glued, its Mold file current, CAM stock is the plan's Stock STL (per section) or the add-in boxes. "No initials, no cutting" becomes "No initials, no machining" (cut now names Tooling cut) | shop.js:46; molds.js:476-481,622-624 [D] | do |
| R-005-08 | §7.1 step 4 | wrong | Put the job in a ShopSabre slot row on the Schedule tab; the weekly meeting reviews the next two weeks of machine load (R-000-11) | timeline.js:34,243-245 [D] | do |
| R-005-09 | §7.1 step 1; §9 | missing | Estimate and actuals go in the WO's Machine mold step note (required); a photo is suggested | workorders.js:273,593-619 [D] | do |
| R-005-10 | §7.5 step 6 | wrong | Set the mold's stage to Machined and its Home location, then clean and seal per CS-004 | shop.js [D] | do |
| R-005-11 | §3 R1, R3 | stale-path | R1 the RSO/RFS hub; R3 `SN5 Composites/Shopbot Procedure Checklist_.docx` | Slack 2026-09-18 [D] | do |
| R-005-12 | header; headings; bold | style | Title "(ShopSabre at RFS)" with no em dash, matching H1 and INDEX (R-IDX-04); blank the em-dash cells; drop emphasis bold; headings "7.1 Booking the ShopSabre" and "7.5 During the run, engraving the ID and cleanup" | STYLE §2-3 [D, A] | do |

## CS-006 Resin Infusion

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-006-01 | §7.6 step 1 | wrong | Demould no earlier than the FEB hold for the hardener, counted from inlet clamp time: 48 h SLOW, 24 h FAST (CS-008 §5.1); the WO locks the step; only a lead overrides, with a written reason. The datasheet's 18-24 h SLOW and 6-8 h FAST at 25 °C are stated as the datasheet figure. Listed under process rules for visibility, though CS-008 already set the rule | CS-008 §5.1; resins.js:61,68; retrieval sim ranks this section second for demould questions [E, H] | do (rule) |
| R-006-02 | §6 | wrong | IN2 resin irritates skin and eyes and causes allergic skin reactions; AT30 hardener is corrosive and can permanently damage eyes (H314, H318), harmful if inhaled (H332) | EC SDS, AT30 Slow v7.0 [E] | do |
| R-006-03 | §6 | process-rule | New: in a closed room or a long session, a respirator with ABEK cartridges (EN 14387) per the AT30 SDS §8. The shop stocks 3M 60921 OV/P100 (f00a701 spec sheet), so this is a purchase too | AT30 SDS §8; inventory.js:77 [E] | hold: Simon |
| R-006-04 | new §7.8 | process-rule | "7.8 Degassing the resin": the team does not degas IN2; the TDS does not ask for it; no chamber on record; air is controlled by slow mixing, a submerged inlet (§7.5 step 3), at least 27 inHg and the drop test (§7.4); note bubble locations on the WO; degassing is a candidate R&D study. Lands after Nick confirms the fact (open question 9) | no degassing in Slack, repo or IN2 TDS; eval_askpaul.js:39 passes on any CS-006 section [E, H] | do (rule) |
| R-006-05 | §7.1 step 3; §7.4 step 2; §7.5 step 6 | missing | Name the app gates: Resin infusion training on Dry stack and bag, the drop-test step and Infuse; readings go in the note on "Drop test, 1 inHg or less over 10 min" (it will not sign without one); at the Infuse buy-off pick IN2 + AT30 SLOW or FAST, set Finished on/at to inlet clamp time, enter shop temperature (that starts the hold) | workorders.js:274-280, 2741-2771, 3300-3324 [E] | do |
| R-006-06 | §3; §7.5 step 2 | wrong | SLOW pot life: the TDS table says 120-150 min and its text says 80-100 min; plan on 80-100 min. FAST 10-14 min (R1). Same in CS-008 §5 | IN2 TDS p1-2 [E] | do |
| R-006-07 | §7.2 step 2; §3 R5 | missing | Airtac 2: hold the can at least 30 cm (12 in) away, mist lightly, wait 10 s before placing the ply (R5). R5 row notes the SDS on file is the 2005 MSDS of the predecessor | airtac2imp.pdf; airtac2spray.pdf [E] | do |
| R-006-08 | §3 R2 | missing | R2 reads "IN2 resin + AT30 SLOW hardener SDS (AT30 FAST SDS not on file)" | still missing after f00a701 [E] | do |
| R-006-09 | §7.7 table | missing | Rows: "Leak you cannot find" (air through an unsealed mold back or sides or cracks, sharp edges piercing the bag: sand edges, edge in breather, tape mesh corners, check the mold was sealed per CS-004) and "Bubbles under a sound bag" (flush more resin before clamping) | Slack 1789851251.991379; Larry's notes 1775277279.331489 [E] | do |
| R-006-10 | §7.7 heading | style | "7.7 Troubleshooting: leaks, dry spots, race-tracking"; first symptom "Gauge won't reach 25 inHg (bag leak)". Number stays 7.7 | retrieval sim: "bag leak" misses CS-006 [H] | do |
| R-006-11 | §7.5 step 1 | process-rule | New may: on a long infusion, mix two or more smaller batches and top up the pot, keeping the inlet submerged (R1) | IN2 TDS p2 [E] | do (rule) |
| R-006-12 | §5 tacky tape row | wrong | Three sources disagree (CS-006 Airtech / General Sealants; restock seed Easy Composites; R5 filed Airtech AT-200Y as a stand-in). Name the tape the team buys once open question 10 is answered; meanwhile: if a new tape will not hold 27 inHg, go back to the last one that did and note the brand on the WO | inventory.js:71; Slack 1788721357.386219; 03 Datasheets/INDEX.md:48 [E, G] | do |
| R-006-13 | §9 | missing | Add the lots and materials recorded at the Infuse buy-off | workorders.js:2788-2810, 3035-3107 [E] | do |
| R-006-14 | §3 Rohacell | missing | Drop CS-006 from the Rohacell row in `03 Datasheets/INDEX.md` until the cores standard exists (R-OTH-11) | INDEX.md lists CS-006 as citing it; CS-006 never does [E] | do |
| R-006-15 | header; §4; §5 | style | Comma for the reviewer em dash; "Any" or blank for the em-dash cell; unbold the whole bolded sentence in §4; keep §7.4 step numbers (CS-001 cites step 3); two [PHOTO] stay | STYLE §2 [E] | do |

## CS-007 Wet Layup

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-007-01 | §3 R1 | wrong | R1 becomes `west-system_slow-epoxy-hardener_206_tds.pdf` (Gougeon US, 105/206). The UK sheet (5:1 by weight, different pot life) leaves CS-007 and CS-008 citations and is marked superseded in the Datasheets INDEX | quoted numbers come from the US sheets; team cans are US stock [E] | do |
| R-007-02 | §2; §3; §5; §7.2 | missing | Add West 209: R ref to `105-209-Epoxy-Resin-1.pdf`; §5 lists 209 for hot days and large layups (minimum 70 °F / 21 °C); §7.2 step 2: 209 uses the 3:1 pumps, not 5:1, check the pump head; by scale 3.68:1 | 209 TDS; resins.js:91-97; materials.js fixed in bb5cc0b [E] | do |
| R-007-03 | §6 | wrong | "Per West SDS" now has SDSs to cite: `WEST-SDS-105/205/206/209` (f00a701). Quote their hazard lines (206: H314, H317) and treat 105 and its hardeners as CS-008 §6 says | f00a701; WEST-SDS-206 §2 [E] | do |
| R-007-04 | §7.5 | process-rule | The ≤2 inHg over 10 min shall is unchanged. Readings go in the "Wet layup and bag" step note. A lead should add a blocker step "Drop test, 2 inHg or less over 10 min" (needs a note) to the Mold wet lay and Foam wrapped techniques; once added, §7.5 names it | workorders.js:274,278,282-287 [E] | do (rule) |
| R-007-05 | §7.1 new step 4 | process-rule | New shall: check the shop is above the hardener's minimum (206: 60 °F / 16 °C; 205: 40 °F / 4 °C; 209: 70 °F / 21 °C); below it pick another hardener or wait | US West TDSs [E] | do (rule) |
| R-007-06 | §7.6 step 2 | missing | When signing "Wet layup and bag", pick the resin mixed (West 105 + 206 slow, 205 fast or 209 extra slow) and the finish time; hold 24 h for 206 and 205, 36 h for 209 (CS-008 §5); only a lead signs early, with a reason | workorders.js:283-287, 2741, 2783-2786 [E] | do |
| R-007-07 | §7.4 new step 4 | process-rule | New may: replace peel ply with release film (A4000R) or mylar, or add a caul plate, where the WO says so; still under test (2026-09); record which and photograph the finish. No numbers | Slack 1788469031.435479, 1788720713.060589, 1791478385.435269 [E] | do (rule) |
| R-007-08 | §7 step 2 (per-ply tick) | process-rule | Same change as R-002-05: check each ply against the run's stack; a pen tick on a printed traveler is allowed | CS-007.md:80 [C, E] | do (rule) |
| R-007-09 | §2 | missing | Honeycomb (Nomex) cores and inserts follow this standard for the skins; core-specific rules are not written yet (cores candidate in CS-INDEX) | Slack 1789850654.253819, 1791598931.301419 [E] | do |
| R-007-10 | header | style | Standard status wording (drop "photos to add at first SN6 use"); keep two [PHOTO]; date the reviewer row | SN6 wet layups have happened (Slack 1790358233.320019) [E] | do |
| R-007-11 | §7.2 step 3 | style | "205 halves that" becomes "205: 9-12 min per 100 g at 72 °F (R2)" | 105/205 TDS [E] | do |
| R-007-12 | §7.7 | missing | Name the app steps for Foam wrapped (Shape foam core, Wet layup over core, Cure; Foam core training). Note in the round report that Nick's DR2 SOP and CS-006/007 should merge, not drift | workorders.js:282-285; #aerodynamics 1790363449.626439 [E] | do |

## CS-008 Resin Systems & Cure Holds

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-008-01 | §5.1 "The app enforces this" | process-rule | Rewrite: the table is the code table (signed 2026-08-01); a lead may change a hold from the app via "Change this hold…", never below the datasheet figure, with a named sign-off; "Revert to the code table" undoes it; "Why N hours?" shows the hold in force. A changed hold opens a revision of this standard (R-000-09) | 64f1b31; resins.js:45-50,108-193; a273b7e [E] | do (rule) |
| R-008-02 | §5.1; §7 step 6 | process-rule | Say the app does not lock XCR mold sealing or any cure recorded as "Something else / not recorded". New shall in step 6: pick the resin actually mixed; use "Something else / not recorded" only for a resin not in §5, write it in the step note, and demould is a lead's call | workorders.js:721-739, 2783-2786; resins.js:198-201 [E] | do (rule) |
| R-008-03 | §6 hazards | wrong | Every resin here is a skin sensitizer (H317); none is a respiratory sensitizer (no H334); the hardeners (AT30 SLOW, XCR hardener, West 206) burn skin and can blind (H314, H318); XCR resin H341. Cite the new West SDSs | all SDSs on file incl. f00a701 [E] | do |
| R-008-04 | §6 PPE | process-rule | Goggles while pouring and mixing; respirator cartridge per SDS (A1 covers XCR; the AT30 SDS asks for ABEK); the shop stocks OV/P100. A PPE and purchasing call | XCR SDS §8.2; AT30 SDS §8; 3M-spec-60921 [E] | hold: Simon |
| R-008-05 | §5 table header; 205 cell | wrong | Column "Demould (datasheet)" becomes "Datasheet cure figure"; 205 cell "thin-film solid 6-8 h"; footnote: West publishes no demould time, thin-film cure is the nearest | resins.js:52-55,79 [E] | do |
| R-008-06 | §5 Full properties | wrong | West 206 and 205: "working strength 1-4 d" (not "days"); 209 "maximum strength 4-9 d" | US TDSs [E] | do |
| R-008-07 | §3 R3, R4 | wrong | R4 lists the SDSs actually on file: IN2 + AT30 SLOW, XCR resin + hardener, West 105/205/206/209 (f00a701). AT30 FAST SDS not on file. R3 drops the UK 105/206 sheet | f00a701 [E] | do |
| R-008-08 | §9; §5.1 cold shop | missing | §9 adds the lots and Materials used from the cure buy-off; §5.1 says the app warns below the datasheet reference temperature and leaves the hold unchanged | workorders.js:741-760, 2973, 3035-3107 [E] | do |
| R-008-09 | §6 bullet 3 (blending) | process-rule | For IN2, blend AT30 FAST and SLOW at the same 100:30 (R1). For West, no source on file covers blending 205 and 206: do not blend until one does | IN2 TDS; no West TDS mentions it [E] | do (rule) |
| R-008-10 | §5 table | missing | Add a minimum-temperature column for West rows and one line on how exact the scale must be (206 4.84-6.19:1, 205 4.83-6.20:1, 209 3.30-4.03:1 by weight); storage temperatures go to CS-011 with a pointer | US TDSs [E] | do |
| R-008-11 | §7 step 1 | process-rule | New should: check the jug's expiry on its label or lot page before mixing; past it, ask a lead before it goes on a part | shop.js:58; materials.js:34-59 [E] | do (rule) |
| R-008-12 | §7 | missing | Crystallized 105 after a cold spell: warm to 125 °F and stir until clear; after a long gap test the pumps with a small batch (R3) | US West TDSs [E] | do |
| R-008-13 | §5 XCR cell | wrong | "initial cure 8 h 30, handleable about 9 h at 20 °C", matching resins.js and the figure | resins.js:102-103 [E] | do |
| R-008-14 | §5 heading; §5.1 ref; reviewer | style | "5. Equipment & Materials: the resin table"; "per §7.5" becomes "per §7 step 5"; date the reviewer row | STYLE §2-3 [E] | do |

## CS-009 Trimming, Sanding, Bonding & Finishing

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-009-01 | §5; §7.3 step 2 | wrong | DP420: 2:1 by volume (B:A; 2:0.98 by weight); open time 20 min (close and fix the joint within 20 min of applying); handling strength 2.5 h at 23 °C (73 °F); the TDS reports bond strength after 7 days at 23 °C. No "24 h full cure". Same fix in the Datasheets INDEX row (R-OTH-11) | DP420 TDS V-7 p1 [F] | do |
| R-009-02 | new §7.6; §2 | process-rule | "7.6 Bonding inserts and hardware into CF tube and parts": DP420 shall be used for every load-carrying bond, never 5-minute epoxy or CA; prep per §7.3; abrade the full bonded length of the metal; mask threads and dam the tube; purge the cartridge before fitting the nozzle; bondline per drawing (TDS test bondline 0.13-0.20 mm); fixture until handling strength (2.5 h); no load before the team hold (number: open question 11); record adhesive, lot, prep, bonded time and first-load time in the step note. Do not claim the app enforces it. Fix the retro "§7.6" titles in the same change (R-OTH-18) | RW rod-end bond failed on track (#aerodynamics 1790574880.619419); aero DP420-only rule 1790615224.181889; thread leak 1791147077.275309 [F] | do (rule) |
| R-009-03 | §5; §6; §7.4 | process-rule | Clear coat is LiME LiNE UC4:1; its TDS and Part A SDS are now on file (f00a701), stock unverified. Part B (activator) is an isocyanate and its SDS is not published. New shall: nobody opens, mixes or applies Part B until its SDS or the can's label hazard text is on file and §6 quotes its PPE | 03 Datasheets/INDEX.md:39; no Slack use since 2026-09 [F] | do (rule) |
| R-009-04 | §4 Keying | wrong | "The team uses 120 grit; the DP420 TDS asks only for clean, fine-grit abrasive (R1)" | DP420 TDS p5 [F] | do |
| R-009-05 | §7.3 step 1 | process-rule | Four steps: IPA wipe; abrade at 120 grit (team value); wipe again with clean IPA, or with acetone on cured laminate and metal away from any mold (new may), let it flash off; gloves on, do not touch the faces | DP420 TDS p5; aero rod-end plan 1791235601.015279 [F] | do (rule) |
| R-009-06 | §6 | process-rule | Replace the PPE line with a PPE-by-task table (cutting, sanding or machining CF or G10; solvent wipe; DP420; clear coat) with the respirator and cartridge as the minimum for dust; then align facts.js:30 (R-OTH-31). CS-003 §6 already cites this table | inventory.js:77; facts.js:30; Ansell charts and acetone/IPA/DP420 SDSs now on file [F] | hold: Simon |
| R-009-07 | §2; §5; §7.5 | missing | Scope covers CF, glass and G10. §5 rows: RFS composites bandsaw (RFS training), ShopSabre (CS-005; ask RFS staff before G10), Jacobs Hall OMAX waterjet (Jacobs training). Retitle "7.5 Cutting flat panels: waterjet, ShopSabre or bandsaw", keeping DXF-through-the-WO and confirm-revision | Slack 1791598931.301419, 1790358975.434619, 1790723151.348059 [F] | do |
| R-009-08 | §7.2 step 1 | missing | Weave past the plan: stop sanding; on the Trim and finish step press ⚑ (Report an issue on this step), photograph the spot, leave the disposition to the part's engineer or the lead; the run cannot complete until it is disposed | workorders.js:2410,2662-2674; projects.js:18 [F] | do |
| R-009-09 | §7.1; §7.2; §7.4; §8; §9 | style | Use the app labels verbatim ("Cure and demould", "Trim and finish", "Quality checks / acceptance criteria", "Add photos to this step"). §9: record trimming, sanding, bonding and coating in the Trim and finish note (Finish on a glass run), photos on the step, measured checks in Quality | workorders.js:271-290, 2336-2338 [F] | do |
| R-009-10 | §6 supervision | process-rule | Keep "no cutting cured carbon without a second trained person". Trained means holding the Trimming and finishing training in the app; the lead adds it in People → Catalog and may gate the Trim and finish step. "(SN5, stands until the lead changes it)" becomes "(set in SN5; the Composites Lead may change it)" | people.js:517-521; workorders.js:18-25 [F] | do (rule) |
| R-009-11 | §7.4 | style | One step each for ratio, pot life, recoat window and cure before handling, taken from the LiME LiNE TDS now on file (f00a701), behind the R-009-03 gate | STYLE §2 [F] | do |
| R-009-12 | §5; §7.3 | missing | DP420: purge until both sides flow, then fit the mixing nozzle; store 16-27 °C, 40-60% RH, use within 24 months of manufacture | DP420 TDS p4-5 [F] | do |
| R-009-13 | §5 | process-rule | New row: thickened epoxy (West 105/206 + 404) for fillets and gap filling only, not load-carrying bonds unless the lead approves; 404 TDS and SDS now on file | materials.js:92; f00a701; aero DP420-only rule [F] | do (rule) |
| R-009-14 | §4; Fig. 1 | wrong | "CS-002 §7.1.3" becomes "CS-002 §7.1 step 3" in text and figure | CS-002.md:66-70 [F] | do |
| R-009-15 | §8; §7.2; §7.5 | style | Mark ±1 mm as a team value; unbold the emphasis spans; keep the §6 rule bolds | STYLE §2 [F] | do |
| R-009-16 | §2 | missing | Placeholder "Drilling holes and cutting openings [lead input needed]"; no numbers until a lead or test supplies them | SN5 seat crack, #composites 1790610889.634989 [F] | do |
| R-009-17 | §2 | missing | Temporary scanning sprays and powders are outside CS-009 until the metrology study concludes | #composites 2026-08-29; 1790837965.882759 [F] | do |

## CS-010 Grounding & Conductive Paths

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-010-01 | §8; §7.1 | wrong | The criterion is a Quality row "grounding resistance" with its Target filled at run creation (or the note on "Define acceptance criterion" on an Other run); the decision goes in the Stack frozen note. Retrofit and cross-team jobs are created with the Other technique. There is no "decision point" field | workorders.js:291, 2336-2338 [F] | do |
| R-010-02 | §9; §3 | stale-path | WO-SN5-006 (UT diffuser) is the reference part (target up front, method recorded, <1 Ω at comp; its record holds the summary only); WO-SN5-026 (catch can, about 40 Ω) is the counter-example; the first SN6 grounded part is the first full probe table. Add both to §3 | sn5-work-orders.json [F] | do |
| R-010-03 | §7.1; §7.2 step 1 | process-rule | Third branch: surface paths (bonded strip or braid, copper tape, conductive paint) applied after cure; any path not proven on this team is proven on a first article by §7.3 before a part depends on it; mass is a decision factor. New shall: only permeable mesh goes in an infused stack; foil, sheet or paint film blocks resin flow | Simon, Slack 1791248106.544919; #cooling 1789966817.624499 [F] | do (rule) |
| R-010-04 | §2 | missing | Requests from other subteams arrive as a WO with the Other technique; the ohm and distance targets stay the rules owner's numbers | #cooling, #brakes-ergonomics 2026-09-20, 2026-10-09 [F] | do |
| R-010-05 | §6 | process-rule | Graphite powder: respirator with P100 and nitrile gloves while weighing and mixing; gloves for cut copper mesh. Graphite SDS not on file | §5/§7.2 allow 1-5 wt% graphite [F] | hold: Simon |
| R-010-06 | §7.3 step 3; §8 | missing | Record the full probe table as a table in the measuring step's note and the worst reading as the Actual on the Quality row; a point over target is a ⚑ issue on that step, disposed per §7.4 | rte.js:66 [F] | do |
| R-010-07 | §5; §7.2 step 1 | missing | Copper mesh spec "not recorded" until someone reads it off the package (open question 18); name the ply "copper mesh" in the stack so the stack view tags it | gen_retro_wos.py:198; core.js:2053 [F] | do |
| R-010-08 | §1; §7.1-7.4 | style | Keep "Good fit:"/"Bad fit:" and §4 terms as labels; unbold the other 20-odd emphasis spans | STYLE §2 [F] | do |

## CS-011 Inventory, Storage & Transport

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-011-01 | §6 co-storage | process-rule | Resin and hardener may share a cabinet (matching the campus EH&S filing) in sealed original containers, each system in its own tray or bin; never an open or decanted container beside its partner. Drafted only in `overhaul/proposals/CS-011-s6.md`, not in the CS-011 draft. Counter-evidence to show Simon: IN2 SDS §7.2 "keep away from amines" | inventory.js:387-393 "lead decision, Simon, 2026-08-28 ... pending Simon's Rev D" [G] | hold: Simon |
| R-011-02 | §6 flammables | wrong | Table Material / Flash point (SDS) / Store in: Airtac, acetone and clear coat in the rated cabinet; the epoxies are not flammable liquids per their SDSs (flash points 100-150 °C) and sit in the cabinet because EH&S filed them there. App seed fix in R-OTH-22 | SDS flash points; receiving.js:898-904; ehsimport.js:182-189 [G] | hold: Simon |
| R-011-03 | §5 table shape | missing | Rewrite in container units with columns Material type, Minimum, Unit, Supplier, Lead time (EC 42 d, West System 14 d, McMaster 7 d, Sigmatex 30 d); IN2 and AT30 as "2 kits on hand, one may be open". Tacky tape supplier per R-006-12 | inventory.js:42-81 [G] | do |
| R-011-04 | §5 values | process-rule | The standard and the app's seed disagree: XCR 1 kit vs 2, West 105 ½ tank vs 1 tank, 195 twill 10 yd vs 1 roll. A lead picks; the loser is changed | inventory.js:58,62,79 claims to be "§5 verbatim" [G] | hold: Simon |
| R-011-05 | §5 note | missing | "A lead tunes a minimum by editing config/restock in the Firebase console; a change there is a change to this table (CS-000 §7.2)." Never "edit it in the app" (there is no editor) | inventory.js:84-112 [G] | do |
| R-011-06 | §7.1 | process-rule | Monthly walk in five steps: a named owner; open each shelf, check, press Confirm contents; fix with Move, How full or Add here; Running out card → "Add N to a purchase"; post the request in #purchasing-slackbot the same day (CS-012 §7.1) | inventory.js:27,242,269-330,499,842; #purchasing retired 2026-10-07 [G] | do (rule) |
| R-011-07 | §7.3; §6 site names | stale-path | Table Object / Site (app name) / Rule with the app's sites (RFS container, Jacobs basement, Flammables cabinet, Dry sealed bin, General Box, Other); foam and board stock to the RFS container. "Chemical boxes/barrel" stays only if open question 15 confirms it | shop.js:68 [G] | do |
| R-011-08 | R5; §7.3 step 2 | stale-path | "Stock tab" becomes "Inventory tab (Storage map, Materials list, Boards)"; boards and offcuts are logged under Inventory → Boards. Path fix | core.js:3555 hidden; inventory.js:604 [G, H] | do |
| R-011-09 | §8; §9 | stale-path | §9: shelf "Contents last confirmed" and "Confirmed by"; mold Home location; Export → Locations; Restock purchases and #purchasing-slackbot requests. §8 method: Confirm contents on every active shelf, the "need a walk" chip reads 0 | shop.js:78,133-134; inventory.js:1054-1055 [G] | do |
| R-011-10 | §7.3 | missing | One paragraph on grouped containers: identical containers fold by Material type (×N, states, soonest expiry, price); an opened group lists each container by its EH&S edge code; the printed page is the walk sheet | inventory.js:709-720 [G] | do |
| R-011-11 | §7.5 | missing | Handoff list: Export → Everything on every shelf → Copy for Sheets, pasted into the season Drive folder | inventory.js:1051-1060,1130-1147 [G] | do |
| R-011-12 | §2 | missing | Add foam and core stock, and donated or sponsor material | REQ-000064; Slack 2026-09-18, 2026-09-03 [G] | do |
| R-011-13 | §8 | process-rule | New check: no chemical lot on a fridge-type location (the app does not warn; R-OTH-26) | shop.js:120; inventory.js:383-402 [G] | do (rule) |
| R-011-14 | §7.3 heading | style | "7.3 Where things are stored (storage map)", first line "Where to store or keep molds, parts, cloth, chemicals and consumables:" | "store" does not match "storage" in Paul's search [H] | do |
| R-011-15 | §4; §5 heading; bold; §7 steps | style | Heading "5. Minimum stock: what we never run out of"; unbold; define stock walk, Home location, Material type, restock rule, How full, lot; reasoning out of numbered steps. Keep §5, §6, §7.1, §7.3 numbers (code cites them) | STYLE §2-3 [G] | do |

## CS-012 Purchasing & Reimbursement

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-012-01 | R1; §7.1; §8; §9 | process-rule | "Posted in #purchasing" becomes: before buying, run /purchase in #purchasing-slackbot with reference ID, amount and reason (/bigorder for several IDs); the bot routes by tier (under $50 subteam lead; $50-250 division lead; over $250 President/VP); buy only after the approval DM | #purchasing, Shailen 2026-10-07 ts 1791410048.860969; Flux tutorial 2026-10-03 [G] | do (rule) |
| R-012-02 | §7.2 step 5; §4 | process-rule | "Categorize under the subteam using the material" becomes: pick the budget reference ID for the line the money comes from (/reference lists them; composites lines start COMP-); testing purchases use TRAN-012; a -000 ID only for an unlisted item, and tell the lead. Define reference ID | REQ-000052/64/09/58/59/60; Ishaan 1791570623.576359 [G] | do (rule) |
| R-012-03 | §7.2 step 4 | process-rule | "Submit the pinned form within 1 month" becomes: log the purchase in the bot and submit for reimbursement within one month; cash, Venmo, Zelle and PayPal are not reimbursed (PayPal added), ask the finance lead first. Whether the pinned form survives is open question 14 | Shailen 2026-10-07; #general 2026-09-24 [G] | do (rule) |
| R-012-04 | §7.1; §7.2 | wrong | Table mapping the Budget tab's Order status (Submitted, Purchased, Arrived) and Reimbursement (Submitted, Approved, Reimbursed) to the policy; Approved = the bot's approval DM; write the bot REQ number in Notes. App string and under-$50 fix in R-OTH-23 | budget.js:79-84,538,597 [G] | do |
| R-012-05 | new §7.9 | process-rule | New should: "7.9 Logging the purchase in the app": + New Purchase when you request; fill Item, Purchaser, Purpose, Cost, Source / vendor, Charged to; Line items one per shelf thing; + Add / scan receipt; move both status tracks. §9 records become Budget tab purchases, the CSV and the bot's REQ history | inventory.js:175-183,1253-1270; fb.js:126 [G] | do (rule) |
| R-012-06 | §7.8 | wrong | The standing request becomes an AirPrint Brother QL with DK-2210 rolls (same as R-001-02), not the PT-D610BT with TZe tape; if one is already owned, §7.8 records the purchase and DK-2210 moves to CS-011 §5 (open question 8) | c62df0b; DESIGN-NOTES rejects 24 mm TZe [G, B] | do |
| R-012-07 | §4; §7.9 | missing | Define "Charged to"; write the non-COMP reference ID there (for example TRAN-002) so the composites total stays ours | budget.js:24-36,604-605; 9f8675b [G] | do |
| R-012-08 | §7.2 receipts | missing | Attach the receipt or emailed PDF with "+ Add / scan receipt"; "✨ Fill from receipt" proposes lines, check each against the receipt (rule R-014-03); quotes and confirmations under Other files | budget.js:423,431; e7eaa05 [G] | do |
| R-012-09 | §7.4 basket | process-rule | The "basket doc" becomes: before each Easy Composites order the lead opens one Restock purchase in Budget; members add line items; Running out adds reorders; post it with /bigorder or /purchase. The team stock sheet is for COTS and metal only | inventory.js:269-330; #mech 2026-09-28 [G] | do (rule) |
| R-012-10 | §7.6 | missing | Sponsor and donated material is received like any delivery (CS-014 §7.11), with no purchase and no cost; the supplier names the sponsor | Slack 2026-09-03 [G] | do |
| R-012-11 | §7.7 | process-rule | New: a purchase not logged in #purchasing-slackbot is not reimbursed. Keep "dates change yearly" | Shailen 2026-10-07 [G] | do (rule) |
| R-012-12 | §7.2 heading | style | "7.2 Getting reimbursed (paid back)" | "reimbursed" misses "Reimbursement" in search [H] | do |
| R-012-13 | §7.1-7.6 | style | Plain wording ("Get approval before you buy anything"), drop the duplicate bold labels, split §7.4 step 1, history row notes tiers re-verified 2026-10-07. Keep §7.1 and §7.4 numbers (code cites them) | STYLE §2 [G] | do |

## CS-013 Work Orders & Part IDs

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-013-01 | §4.1 rule 3; rule 1 | process-rule | "A re-laid part is a new part, new P ID, supersedes" becomes: a re-laid part is a new run, not a new part; dispose the failed run's issue as Scrap with why, then + New run on the same part; the part keeps its P ID and the run ID tells the pieces apart. Rule 1 gains a sentence on what P names. Labels follow (CS-001) | core.js:2276-2280; parts.js:1065-1066,1360; no supersedes field [C] | do (rule) |
| R-013-02 | §5 | wrong | Make an account with name, username and password; you start as a member; a lead makes leads on People; View as guest reads everything and changes nothing; removing someone keeps their name on records | 10d4bfb; firestore.rules [C] | do |
| R-013-03 | §7.2 step 2 | wrong | Photos via the camera on the step row land on the step and in the run's Photos section; note steps suggest a photo, never require one | workorders.js:651,674,2409,3333-3338 [C] | do |
| R-013-04 | §7.1 | wrong | 1 New Part (or open it). 2 Fill requirements, Layup stack and Materials (plan) on the part. 3 + New run (Use a previous run for a remake). 4 Set Quality targets on the run. "New WO" only for a one-off with no part | workorders.js:1192; parts.js:674,1107-1127,1360 [C] | do |
| R-013-05 | new §7.5 | process-rule | "7.5 Layup techniques (the step checklists)": what a technique is; members read them under Reports; leads add from a copy, edit and archive; edits never change existing runs; "Add them" brings new steps into a run. New shall: every technique keeps the Stack frozen blocker, and every bagged technique keeps its drop-test blocker (the app only warns) | reports.js:388-427; workorders.js:301-309,1730-1735,1833,1934-1946 [C] | do (rule) |
| R-013-06 | §4 Buy-off | process-rule | A training-gated step can be signed only by someone a lead recorded as trained on People; a lead may sign without it with a written reason in the event log; leads are not trained by role. Cross-ref CS-005 §4 for the RFS authority | workorders.js:18-25,271-291,3283-3313; people.js:88-89 [C] | do (rule) |
| R-013-07 | new §7.6 | missing | "7.6 Issues: raising and closing them": raise on the run it holds up (⚠ Raise an issue, ⚑ per step); a run shall not complete until each issue has a Disposition, What happened and What was done; a false alarm is cancelled, not disposed; Reopen clears the fix and keeps the root cause. Code comments that call this "the CS-003 enforcement point" re-point here (R-OTH-19) | projects.js:18,66-91; workorders.js:816,2251,2410,2587-2597; a3f5b77 [C, H] | do (rule) |
| R-013-08 | new §7.7 | process-rule | "7.7 Archiving, deleting and Recently deleted": finished or abandoned parts and runs should be archived, not deleted; only a lead deletes; a deleted record restores from Reports → Recently deleted for 30 days, then a lead empties them; IDs are never reissued | core.js:758,785; reports.js:72-120; 3cd3e97 [C, H] | do (rule) |
| R-013-09 | §4 Buy-off (self-review) | process-rule | Mold design review shall be bought off by someone other than the mold's designer (restating CS-003 §7.2). The app only warns when the run's creator signs; the reviewer checks the Mold Engineer field. App change to key on the Mold Engineer in R-OTH-32 | workorders.js:3340-3344 [C] | do (rule) |
| R-013-10 | §4 | missing | Define Cure hold (team hold for the recorded resin, CS-008 §5.1; a lead may sign through with a reason), On hold status (blocks nothing), Evidence (stack, CAD or note; lead override with reason); the blocker list adds the Other technique's acceptance criterion | workorders.js:8,226-246,576-598,721,3156-3251 [C] | do |
| R-013-11 | §7.4; §8 | wrong | At the weekly meeting the lead brings Reports → Print status board and clears the Dashboard's Stopped lane first; §8 "Lead check at the weekly meeting" | dashboard.js:224-299; R-000-11 [C] | do |
| R-013-12 | §4 R&D; §7.1 step 4 | wrong | Start R&D from the R&D tab with + Part or + Run; the R&D part checkbox until a run exists; then only a lead presses Move to season, once, one way. R&D is also kept off the Parts and Work Orders lists (the count chip jumps to R&D) and stays on Dashboard and Reports. Split the 140-word bullet | 2978fa2; rnd.js:819-821; parts.js:892-970 [C] | do |
| R-013-13 | §2 | process-rule | New should: test pieces you cut, measure and compare go in a study; anything with a mold, checklist or cure to sign is a part and run (R&D if not for the car). A study may hold the parts and runs an effort produced; filing does not make a part R&D; deleting a study ungroups its parts | Nick 2026-09-03 left the choice to members; 10facc9 [C] | do (rule) |
| R-013-14 | §4 | missing | Person fields are roster picks ("Use \"name\"" only for someone not on the app); a buy-off stores the name as at signing, the account and the time; screens show the current name | core.js:970-978; workorders.js:3366; print.js:158 [C] | do |
| R-013-15 | §7.1 step 2 | process-rule | "Delete inapplicable steps consciously" becomes: steps come from the technique; fix a mismatched checklist by choosing (or asking a lead to add) the right technique; sign an inapplicable step with a note saying why. Members cannot delete steps | workorders.js:301,355 [C] | do (rule) |
| R-013-16 | §7.2 step 5 | wrong | Link the part to its mold records in the part's Mold section (a split mold is two links); each run points at the one mold it was laid in; a run on the other half is its own run | 174b91c; parts.js:1112-1116; shop.js:93 [C] | do |
| R-013-17 | §7.2 step 4 | missing | Quote the option exactly ("I don't know / not recorded"); the buy-off also asks Materials used and records whether a lot was scanned | workorders.js:3069,3095-3110 [C] | do |
| R-013-18 | §7.3 step 1 | wrong | Fill actuals in Quality, set Complete; an open issue opens the closeout list instead, dispose each (§7.6) | workorders.js:1394,2518-2534 [C] | do |
| R-013-19 | §4.1 prefix table | missing | Add STK (mold stack plan, "mold file" on the part page), BUY (purchase) and DOC (document), the last two not physical | fb.js:126 [C] | do |
| R-013-20 | §8 row 1 | wrong | "Every active part has a WO" becomes "every part has a run before it consumes carbon or machine time"; parts with no run are listed on the Work Orders rail; lead checks weekly | app README Work Orders [C] | do |
| R-013-21 | §8 new rows | process-rule | "Issues disposed and explained before Complete" (app gate) and "Training-gated steps signed by trained people; every override has a reason" with the method: the lead reads the override entries at the weekly meeting (new lead duty) | workorders.js:3189,3251,3305; projects.js:66-79 [C] | do (rule) |
| R-013-22 | §8 cell; §4 R&D bullet | style | Write "none" for the em-dash cell | STYLE §2 [C] | do |
| R-013-23 | §7.3 step 2; §7.4 step 2 | missing | Backup "(on a phone, in the ⋯ menu)"; cadence and destination unchanged | core.js:3678-3679 [C] | do |

## CS-INDEX and CS-Template

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-IDX-01 | table; Notes | missing | At R2 start add the CS-014 row (Receiving, Lots & EH&S, Rev A, "Draft, pending Lead signature", Drafted, PP-02 and PP-10) and "Next free number: CS-015" | PLAN:36,43 [A] | do |
| R-IDX-02 | Notes paragraph | style | Split the 2,629-character paragraph into How to read this list, Standards, Quick references, Next free numbers, Change log (dated bullets, newest first), Handoff reviews, Candidate standards; remove its two em dashes and the emphasis bold | STYLE §1-2 [A] | do |
| R-IDX-03 | new table | missing | Quick references table (Doc ID, Title, Parent or Covers, Checked against); extend lint 5 to check it against `src/QR-*.md` (R-OTH-05) | CS-000 §7: INDEX lists every document [A] | do |
| R-IDX-04 | titles; Status | process-rule | The H1 is canonical: header Title = H1 minus the ID, INDEX Title = the same text, INDEX status = header status text exactly (CS-003, 004, 005, 009, 010, 012 differ today). New CS-000 §4 line: a title is written once, identically, in H1, header and CS-INDEX. Lints 5 and 6 to exact match | check_traceability.py:119-123,190 [A] | do (rule) |
| R-IDX-05 | header | missing | Add a revision history table starting at H ("CS-014 added, quick-reference table added, notes split, titles and statuses aligned"); lint 7 covers CS-INDEX | f185c62, 36cf5d5; check_traceability.py:176 [A] | do |
| R-IDX-06 | Depth column | wrong | Note photos wanted on all six rows with [PHOTO] (CS-003 1, CS-004 3, CS-006 2, CS-007 2, CS-009 1, CS-010 1), or a "Photos wanted" count column | grep of src [A] | do |
| R-IDX-07 | new Candidate standards | missing | Numbers not reserved: sandwich cores and degassing; forged CF and structural bonding; AI helpers in the shop; prepreg handling, storage and cure; laminate test coupons and test reports. Gap with no parent: new-member onboarding (RFS access, EH&S trainings, PDM) | PLAN:311-313; Slack 1789614567.789899, 1791657268.876049 and others [A, H] | do |
| R-IDX-08 | H1 | style | Keep "# CS-INDEX" H1 with its em dash: it names the built docx and PDF | renaming changes a linked filename [A] | drop |
| R-TPL-01 | §7 caution line | wrong | "They render as ⚠ CAUTION callouts in the .docx; the PDF shows them indented only" until the R7 Lua filter (R-OTH-04) | build_docx.py:190; pdftotext of CS-006.pdf [A] | do |
| R-TPL-02 | guidance lines | missing | Read STYLE.md first; H1 "# CS-0xx Title" repeated exactly in the Title field and INDEX; agent author format; one history row per letter, last row date = Effective; ##/### only, numbered, in askers' words; shall/should/may per CS-000 §4; figure line with the caption as alt text | STYLE §2-5; lints 5-7, 11 [A] | do |
| R-TPL-03 | Supersedes row | style | "None (or the prior doc or practice)" instead of the em dash | the template's only em dash [A] | do |
| R-TPL-04 | new QR-Template.md | missing | H1 "# QR-0XX Title"; header Doc ID / Title / Parent / Checked against (Covers variant in a comment); one-line "parent wins" note; a sample ## section with an answer-first sentence and an "Also called:" line; 300-2,400 character guidance | check_traceability.py:233-252; build_ai_corpus.mjs Parent parse [A] | do |

## CS-014 Receiving, Lots & EH&S (new)

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-014-01 | whole | missing | New standard, Rev A, H1 "# CS-014 Receiving, Lots & EH&S", nine template sections per the outline in G-supply.md ("Proposed CS-014"): §7.1 Incoming (⚠ after 14 days), §7.2 Opening the Receiving desk, §7.3 Filling in the sheet, §7.4 ✨ From packing slip, §7.5 "Create N records?", Print N labels or Undo, §7.6 EH&S tags at receipt, §7.7 Dates, expiry and ✨ Read label, §7.8 Opening, using up and emptying, §7.9 Expired material, §7.10 Reconciling with campus EH&S, §7.11 Donations, sponsor and legacy stock | receiving.js; inventory.js:1209,1278-1296; shop.js:976-978; materials.js [G, H] | do |
| R-014-02 | §7.6; §7.10 | missing | Record tags at receipt (one per container, space-separated codes for several jugs, the 12-character edge strip); monthly reconciliation: EH&S import (lead), Export → EH&S reconciliation, retire emptied containers in RSS, name the chemical-inventory role holder (open question 16). CS-001 §7.11 covers the tag as a label; CS-014 covers the desk and campus records | ehsimport.js; inventory.js:614,994-1058; import not yet run in production [G, B] | do |
| R-014-03 | §5; §7.4; §7.7 | process-rule | New shall, series-wide for AI fills: anything a ✨ button fills (packing slip, jug label, receipt) is a draft; check every row against the paper, jug or receipt before saving; an AI-read expiry stays marked until you type over it. State the lead's ✨ AI features switch, the $80 monthly ceiling and the 50 photo reads per person per day as sourced facts. CS-001 §7.6 and CS-012 §7.2 cross-reference it | receiving.js:502; shop.js:743; core.js:144,3710; functions/index.js:47,55 [G, B] | do (rule) |
| R-014-04 | §6; §7.7 | process-rule | New shall: the receiver sets Hazard on every chemical lot, until the app stamps it (R-OTH-24) | receiving.js:957-975 writes role, never hazard; inventory.js:398-400 [G] | do (rule) |
| R-014-05 | §7.8 | process-rule | New should: open one container of a material at a time; press the lot's stage button to Open when you break the seal (stamps Opened); the cure buy-off pre-fills the most recently opened lot, so two open jugs make that default wrong. CS-011 §7.1 cross-references it | workorders.js:3040-3042 cites a rule that does not exist [G] | do (rule) |
| R-014-06 | §7.8 | process-rule | New should: when you finish a layup, log what you used on the WO and set the container's state; an emptied container is marked Empty, not deleted | shop.js:196; workorders.js:2877-2891,2952-2953; inventory.js:155-168 [G] | do (rule) |
| R-014-07 | §7.9 | process-rule | Expired resin, hardener or XCR: candidate "not on a season part; a lead may release it for R&D or a test panel after a small test cure recorded on the lot; set state Expired; dispose through campus EH&S". Also covers CS-011 (G-09) | shop.js:58; inventory.js:375-377; cure buy-off does not check expiry [G] | hold: Simon |
| R-014-08 | §6 | missing | Read the SDS before opening a damaged or leaking container; gloves at receipt; chemicals straight to a rated shelf, never a fridge; a leaking container is not shelved, a lead decides; disposal of expired or emptied containers goes through campus EH&S by the RFS route (open question 7) | [G] | do |
| R-014-09 | §8 | missing | Checks table: received the day it arrives; every chemical lot has an EH&S tag; every chemical lot has Hazard set; no expiry still "vendor label (AI read)" at the walk; emptied containers retired in RSS monthly; no expired lot on a season part | [G] | do |
| R-014-10 | §7.11 | missing | Donations and legacy stock: received with no purchase and no cost; supplier names the sponsor | README walk-in deliveries; Slack 2026-09-03 [G] | do |

## Quick references

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-QR-01 | QR-001 | missing | Mix ratios and cure holds (Tier 1) | see Quick references section [H] | do |
| R-QR-02 | QR-002 | missing | Infusion setup checklist (Tier 1); degassing section copies CS-006 §7.8 once it lands | [H] | do |
| R-QR-03 | QR-003 | missing | Wet layup and the bag stack (Tier 1) | [H] | do |
| R-QR-04 | QR-004 | missing | Mold sealing and release, in order (Tier 1) | [H] | do |
| R-QR-05 | QR-005 | missing | Which label goes where (Tier 2) | [H] | do |
| R-QR-06 | QR-006 | missing | Receiving a delivery and material lots (Tier 2) | [H] | do |
| R-QR-07 | QR-007 | missing | Work orders: steps, buy-offs, holds and issues (Tier 1) | [H] | do |
| R-QR-08 | QR-008 | missing | PPE and handling by chemical. Was blocked on Round 5; the SDSs and Ansell charts are now on file, so it moves to Tier 2. Every PPE line copies the parent standards, so it waits on the PPE holds | f00a701 [H] | do |
| R-QR-09 | QR-009 | missing | Words the team uses, one section per family (Tier 3) | [H] | do |
| R-QR-10 | QR-010 | missing | Where things are in the app (Tier 2) | [H] | do |
| R-QR-11 | QR-011 | missing | Fusion add-in: planning stock (Tier 3); parent CS-003 §7.1 (R-003-11), not CS-005 | [H, D] | do |
| R-QR-12 | QR-012 | missing | Bag leaks and dry spots (Tier 1) | [H] | do |
| R-QR-13 | QR-013 | missing | Trim, sand and bond prep (Tier 2), with the corrected DP420 numbers (R-009-01) | [H, F] | do |
| R-QR-14 | QR-014 | missing | Where things are stored (Tier 1); its co-storage section copies CS-011 §6 only after R-011-01 is decided | [H, G] | do |
| R-QR-15 | QR-015 | missing | Buying something and getting paid back (Tier 2), written against the bot process (R-012-01 to -03) | [H, G] | do |

## Steve

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-STV-01 | STYLE.md §7; STEVE_SYSTEM rule 3 | missing | Name Steve's no-go topics: PPE and SDS, grounding and electrical bonding, chemical storage and co-storage, CNC operation, exotherm and waste, mixing products across resin systems, skipping or thinning release, passing a failing drop test. Mirror them in STEVE_SYSTEM rule 3 | index.js:613 lists numbers and PPE only; catalog reaches gloves and respirators [H] | do |
| R-STV-02 | steve_catalog.json | missing | Offline `cat` field after `toRow` from the 18-rule table (first match wins, all 564 rows) | 446 of 564 rows untyped; prototype placed all but 10 [H] | do |
| R-STV-03 | searchCatalog | wrong | Exclude `safety-ppe` from Steve's results always; exclude `gelcoat-colour` unless the query says gel coat, colour or RAL | "gloves" returns nitrile gloves; "copper mesh" returns RAL 8004 [H] | do |
| R-STV-04 | steveGuard; toRow | wrong | Exempt a cited product title from the guard (or drop `dispensing-guns`); add coats?, layers?, plies, ply and grit to STEVE_NUMBER; decode HTML entities in titles | index.js:627; "20&#37; Shrink Tape" [H] | do |
| R-STV-05 | steve/ | missing | Write `steve/fibreglast-lines.md` and `steve/upsell-map.md` from the outline in "Steve material" | PLAN R4 [H] | do |
| R-STV-06 | functions; tests | missing | Steve-only `search_steve_notes` tool; a test that no corpus section has a `src` under `steve/`; six eval_steve.js cases (R-OTH-30) | build_ai_corpus.mjs:12-14 promises it, nothing tests it [H] | do |

## Other files

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-OTH-01 | STYLE.md §2 | wrong | "Monday meeting" becomes "the weekly meeting" (R-000-11) | [A] | do |
| R-OTH-02 | STYLE.md §6 | missing | `Parent` may list several sections separated by semicolons, with one Checked against each; the drift lint fails if any parent moves (matches R-000-02) | build_ai_corpus.mjs:71 reads one Parent [H] | do |
| R-OTH-03 | STYLE.md §3 | wrong | Blockquotes render as CAUTION in the .docx only until R-OTH-04 lands | [A] | do |
| R-OTH-04 | tools/gen_docs_manifest.py | missing | R7: a pandoc Lua filter in md_to_pdf that prefixes "⚠ CAUTION:" to blockquotes | gen_docs_manifest.py:103-108 [A] | do |
| R-OTH-05 | tools/check_traceability.py | missing | Lint 5 exact title match and the QR table; lint 6 exact status text and accept INDEX "Under Revision" against a Draft header (R-000-06); lint 7 covers CS-INDEX | [A] | do |
| R-OTH-06 | tools/build_ai_corpus.mjs | wrong | Split the revision history out of section #1 (keep ID, title, status, effective date); include CS-INDEX.md; add revision and status to every corpus section | CS-007#1 is the top hit for the bag stack question; context.js:340-343 [H, A] | do |
| R-OTH-07 | functions/context.js:194 | wrong | Validate a resin override as resins.js:126-131 does (number, at least sheetH, febBy present and not pending/tbd/todo) before folding, so Paul's hold equals the app's | [H] | do |
| R-OTH-08 | functions/context.js searchDocs | wrong | Title bonus on a datasheet's page 1 only, or score SDS sections only when the query has a safety word. More urgent now: the corpus grew from 448 to 766 sections with the Round 5 SDS pages | f00a701; "AT30 hardener" returns only SDS pages [H] | do |
| R-OTH-09 | functions/index.js PAUL_SYSTEM; search_docs | missing | Rule 1 names quick references and "the standard wins over a QR"; add the search hint (short stems, try demould/demold and synonyms before "not documented"); update the search_docs description | [H] | do |
| R-OTH-10 | 03 Datasheets/INDEX.md; manifest titles | stale-path | Human titles from the INDEX rows ("Ure-Bond 90 SDS (Smooth-On)", "Airtac 2 SDS (Airtech)") instead of cleaned filenames | corpus.json titles [H] | do |
| R-OTH-11 | 03 Datasheets/INDEX.md | wrong | DP420 row: drop "24 h full cure", use handling 2.5 h at 23 °C (R-009-01); Rohacell row drops CS-006 (R-006-14); the UK West 105/206 sheet marked superseded (R-007-01) | [F, E] | do |
| R-OTH-12 | app/README.md Ask Paul | wrong | Saved chats under "Chats", "New chat", "What Paul remembers"; Steve with "Steve is always wrong" and "Ask Paul instead"; the hold is shown on the cure step's "Why N hours?" (no Resins page) | paul.js:21-29,55-56,503-507; 13f3ae4 [H] | do |
| R-OTH-13 | app/README.md elsewhere | wrong | Scanning: drop the "no signal" claim; Inventory and Work Orders: drop "no undo" (Recently deleted); where R&D parts live; where techniques are edited; buy-off names; the grade rule cites CS-003 §5 | [B, C, D, G] | do |
| R-OTH-14 | app/DESIGN-NOTES.md | stale-path | Six tools plus web_search (Steve adds search_fibreglast); rounds 6 Paul, 3 Steve; sessionStorage is a reload cache; mention Steve and paulRemember; the receipt parser is not "the one Cloud Function"; the config table adds config/ai and config/budget | index.js:396-486,619-648 [H, G] | do |
| R-OTH-15 | HANDOFF.md | stale-path | :111-115 says a hold change needs a code deploy (no longer); :121-130 pipeline adds render_figures and build_ai_corpus and drops "builds churn"; new section on the AI helpers (lead switch, $80 ceiling, functions deploy needs asking, corpus and catalog rebuild needs a functions deploy) | [A, E, H] | do |
| R-OTH-16 | tools/README.md | stale-path | :129 describes check_traceability.py as before the lints; :128 eval is 17 cases, not ~15; rows for eval_steve.js and build_steve_catalog.mjs | [A, H] | do |
| R-OTH-17 | 04 Printables/printables.html | wrong | CS-006 card prints "Cure / demould SLOW 18-24 h" and Rev A; CS-008 card says "Outlined"; all pinned revisions stale. Rebuild after R7 (R-000-04) | [A, E] | do |
| R-OTH-18 | tools/gen_retro_wos.py:140; app/sn5-work-orders.json | wrong | Seven retro step titles cite "CS-009 §7.6" for the waterjet (it is §7.5); fix in the same change that adds the new §7.6 (R-009-02) | [F] | do |
| R-OTH-19 | code comments | stale-path | "The CS-003 enforcement point" (projects.js:65, workorders.js:2516, season.js:31) → CS-013 §7.6; grade-rule cites in stock.js:336,1004 and packer.js:304 → CS-003 §5; stale rnd.js:812 and projects.js:66 comments | [C, D] | do |
| R-OTH-20 | app/resins.js:195-197 | wrong | The comment says an unknown resin falls back to the datasheet figure; the code returns 0 (no hold). Fix the comment | [E] | do |
| R-OTH-21 | app/materials.js | wrong | IN2 storage 20-25 °C → 10-25 °C per the TDS (line 38); DP420 shelfLifeMonths 24 with the TDS as source | [E, F] | do |
| R-OTH-22 | app/inventory.js RESTOCK_SEED | wrong | Drop hazard "flammable" from IN2, AT30, West 105/206 and XCR (SDS flash points 100-150 °C); tacky tape supplier per R-006-12; minimums after R-011-04 | inventory.js:51-81 [G] | do |
| R-OTH-23 | app/budget.js:538,597; inventory.js:289 | wrong | "Over $50, needs #purchasing sign-off" strings name the retired channel; approval is needed under $50 too | [G] | do |
| R-OTH-24 | app/receiving.js | wrong | Stamp Hazard on received chemical lots; :798 "one QR label each" for resin contradicts R-001-06 | [G, B] | do |
| R-OTH-25 | app/labels.js; app/q.html | wrong | Copies hint "one for the bag" → "one for the traveler" (labels.js:823); the BIN footer "SCAN TO SEE CONTENTS" is true only in the app; fabric lot labels print an empty key line; q.html's CLS map lacks RDS and CPN | [B] | do |
| R-OTH-26 | app/inventory.js invLocWarnings | missing | Warn on a chemical lot at a fridge-type location (R-011-13) | inventory.js:383-402 [G] | do |
| R-OTH-27 | app/budget.js; firestore.rules; README | wrong | No UI sets closedShort; purchase delete is lead-only in the client (budget.js:242) while README and rules let any member tombstone. Settle on lead-only (matches R-013-08) and fix the other two | [G] | do |
| R-OTH-28 | app/core.js:3582 | wrong | The Documents tab tooltip mentions standards and printables, both unlisted | [A] | do |
| R-OTH-29 | app/shop.js:36-43 | wrong | The Tooling cut comment says both "off the ShopSabre" and "off the saw"; fix once open question 4 is answered | checked shop.js:36-43 | do |
| R-OTH-30 | tools/eval_askpaul.js; eval_steve.js; new test_corpus_retrieval.mjs | wrong | The degassing case passes on any CS-006 section: require a cited section matching /degas/i. Add the 11 Paul and 6 Steve cases from H-paul.md §4; accept a QR whose parent is the expected standard; add the offline retrieval test | eval_askpaul.js:39 [H] | do |
| R-OTH-31 | app/facts.js:30 | wrong | "dust mask or respirator" is weaker than CS-009 §6; align after R-009-06 is decided | [F] | hold: Simon |
| R-OTH-32 | app/workorders.js:3340-3344 | missing | The self-review warning keys on the run's creator; key it on the Mold Engineer so R-013-09 has app support | [C] | do |

## Process-rule changes

Every shall, should or may added, removed or changed. "Old" is the current
`src/` text (paraphrased where long); "New" is the wording the drafter aims
for. Rows marked held are not drafted until the open question is answered.

### Decided (do (rule))

| ID | Old | New |
|---|---|---|
| R-000-02 | No quick-reference family | QR-XXX defined; derived, no approval; the parent wins; a QR is updated by §7.5; Parent may list several sections |
| R-000-03 | §7.2 ends at "Announce released revisions" | Rebuild and commit sources with built files; a revision reaches members after the hosting deploy and Paul after the functions deploy, and both are done |
| R-000-04 | No rule on dependent documents | A revision updates, in the same change, every QR on this parent, every printables card naming the revision, and every moved `§n.n` reference |
| R-000-05 | "Any change to procedure content bumps the revision; typo fixes may be batched" | One letter per change set; typo fixes may wait; a path fix takes no letter and is recorded in `src/rev-exemptions.txt` |
| R-000-06 | "Set Status → Under Revision in CS-INDEX" | Unchanged for INDEX; the header stays Draft while the draft lives outside `src/`, and the lint accepts that pairing |
| R-000-07 | "The Composites Lead approves: name + date in the approval table" | The lead approves in writing (Slack message or PDF comment naming document and revision); the maintainer records name, date and Released, and links the approval in the commit |
| R-000-08 | "One reviewer who did NOT write the draft walks it mentally (or physically, for shop procedures)" | An agent review counts for a process standard; a shop procedure also needs a member walk-through before signature; the Reviewer row names the review of the current revision |
| R-000-09 | Scope silent on app values | Lead-changeable app values are owned by CS-008, CS-013 and CS-011; changing one shall open a revision of the owner within two weeks |
| R-000-10 | Draft is "usable as guidance, not yet the rule" | Paul, Steve and AI reads are never a source; Paul cites a Draft standard as current guidance and names its revision |
| R-000-16 | Handoff review covers "every Released standard" | Covers every Released or Draft standard; first one due before fall recruiting 2027 |
| R-IDX-04 | Titles may differ between H1, header and INDEX | A title is written once, identically, in H1, header and CS-INDEX; status text matches exactly |
| R-001-01 | Class word "Mandatory, and larger on the label than the code itself" | No class word on the label; it is derived from the prefix and shown on the scan page and in the app; the name leads |
| R-001-04 | (none) | Shall: anything that sees IPA, acetone or resin gets 5522 polyester, never direct-thermal roll stock |
| R-001-06 | Resin and hardener: "on the container, polyester only (5522 or TZe)" | A container with a campus EH&S tag gets no FEB label (the tag is recorded in EH&S barcode); an untagged one gets a 5522 FEB label, which stays after the tag arrives |
| R-001-13 | (none) | Custom labels shall not be used for anything with a record or carry an ID-shaped line; a shelf holding tracked material gets a storage record and Label |
| R-001-28 | §8 has no roll, EH&S, thermal or shelf checks | Four new checks: roll length each session; every chemical container tagged or FEB-labelled; no thermal label on solvent or resin items; every tracked shelf recorded and labelled |
| R-002-02 | "ME/RE and the Composites Lead (plus the requesting subteam's lead) initial the WO's stack table" | One buy-off of Stack frozen; the signer shall have agreed the stack with the RE and the lead (and subteam lead) and names them in the step note |
| R-002-03 | §8 method "WO blocker step" | App blocker on runs plus a lead check at the weekly meeting for molds advanced outside a run |
| R-002-05 | "The RE ticks each ply as laid and notes any deviation in the WO" | The RE checks each ply against the run's stack and records changes in it with the reason; a pen tick on a printed traveler is allowed (may) |
| R-003-05 | "Faces must be dust-free (compressed air + IPA wipe)" | Vacuum the faces, wipe with IPA, let it flash off fully before gluing |
| R-003-07 | "Before any stock is glued or any slot booked ... No initials, no glue, no booking" | Before any blank is cut from the cut list, any stock is glued or any slot booked: "No initials, no cutting, no glue, no booking" |
| R-003-09 | Stacks over max-Z "must be split into sections" | Split automatically over 6 in; a waiver only when the cutter stays within 6 in of a reachable face, with the reviewer checking depth and tool reach |
| R-003-14 | (rule cited by code, missing from every standard) | Grades are not interchangeable silently; plan at one grade or a declared range; the densest board cut sets the feed |
| R-003-16 | "No overhangs. 3-axis machining only" | An overhang part is made on a split mold; each piece its own record, run and review |
| R-003-19 | (none) | Should: attach the drawing of any reference cuts under Datum cut plans |
| R-003-20 | (none) | Re-plans by a lead only; cut and machine only from the current plan |
| R-004-01 | XCR "handleable after ~9 h"; §8 fingernail at 24 h | No release system until the 12 h FEB hold after the last coat; record the last-coat time in the step note; §8 check at or after 12 h, before release |
| R-004-04 | (none) | Shall not mix or brush XCR after a past skin reaction to epoxy; tell a lead |
| R-004-07 | "Mark the mold's record with sealing and release done ... stage Sealed" | Exact fields named; append: set Stage = Ready for layup at the end of §7.5 |
| R-004-08 | "30 lb board usually needs a second coat" | Should: a mixed-grade mold seals like its softest board; plan two coats if any is 30 lb |
| R-005-01 | "Nothing in this repo tracks HOT status" | RFS record is the authority; the app's ShopSabre CNC training mirrors it and a lead grants it only after seeing the RFS record |
| R-005-02 | (none) | Set CAM feeds for the highest grade in the stack |
| R-005-03 | "Make sure your CAM tool numbers match the rack" | Build CAM against the current FEB ShopSabre tool library |
| R-005-04 | "Zero Z once per job" | Zero Z once per setup; each split section is its own setup |
| R-005-05 | Scope: tooling-board molds and stock | Adds XPS foam, G10 (only with Larry's say-so) and cured CF panels under the same rules |
| R-006-01 | "Demould at 18-24 h @25 °C SLOW (6-8 h FAST)" | No demould before the FEB hold: 48 h SLOW, 24 h FAST from inlet clamp; datasheet figure stated as such |
| R-006-04 | (nothing on degassing) | The team does not degas IN2; air is controlled by mixing, submerged inlet, vacuum level and the drop test (after Nick confirms) |
| R-006-11 | Mix one batch by formula | May: top up with smaller batches on a long infusion, inlet kept submerged |
| R-007-04 | "Record start and end readings on the WO" | Readings in the "Wet layup and bag" step note; a lead should add the 2 inHg drop-test blocker to both wet-layup techniques |
| R-007-05 | (no minimum temperatures) | Shall: check the shop is above the hardener minimum (16 °C for 206, 4 °C for 205, 21 °C for 209) |
| R-007-07 | Peel ply over the full laminate | May: release film, mylar or a caul plate where the WO says so; record and photograph |
| R-007-08 | "RE ticks each ply" | As R-002-05 |
| R-008-01 | "The numbers live in one place, resins.js ... a test rejects a hold shorter than datasheet" | A lead may change a hold in the app (never below datasheet, named sign-off); a changed hold opens a revision |
| R-008-02 | Implies every cure is locked | XCR and "Something else / not recorded" are not locked; shall pick the resin actually mixed; "Something else" only for a resin not in §5, demould is a lead's call |
| R-008-09 | "Blend hardener speeds (same total ratio, per R1/R3)" | Blend only AT30 FAST and SLOW for IN2; do not blend West hardeners until a source covers it |
| R-008-11 | (none) | Should: check expiry before mixing; past it, ask a lead |
| R-009-02 | (nothing on inserts or load timing) | DP420 for every load-carrying bond; no 5-minute epoxy or CA; mask, dam, purge, fixture; no load before the team hold; record first-load time |
| R-009-03 | "Lime Line, in stock"; "coat per product instructions" | Shall not open, mix or apply Part B until its SDS or label hazard text is on file and §6 quotes its PPE |
| R-009-05 | "Key both faces with 120-grit, then IPA wipe" | IPA, abrade, wipe again; may use acetone on cured laminate and metal away from molds |
| R-009-10 | "No cutting cured carbon without a second trained person (SN5, stands until the lead changes it)" | Same rule; trained = holds Trimming and finishing in the app; "(set in SN5; the Composites Lead may change it)" |
| R-009-13 | (West 404 not mentioned) | Thickened epoxy for fillets and gap filling only, not load-carrying unless the lead approves |
| R-010-03 | Mesh in stack or epoxy + strip/braid | Adds surface paths proven on a first article; shall: only permeable mesh in an infused stack |
| R-011-06 | "Check the §5 list against reality; anything at or below min goes to #purchasing the same day" | Named owner; Confirm contents on each shelf; Running out → Add N to a purchase; request in #purchasing-slackbot the same day |
| R-011-13 | (none) | §8 check: no chemical lot on a fridge-type location |
| R-012-01 | "Every purchase gets approval BEFORE buying, posted in #purchasing" | /purchase in #purchasing-slackbot; buy only after the approval DM; tiers unchanged |
| R-012-02 | "Categorize under the subteam using the material" | Use the budget reference ID of the paying line; TRAN-012 for testing; -000 only for unlisted items |
| R-012-03 | "Submit the pinned form within 1 month. No Venmo, Zelle, cash or gift cards" | Log in the bot and submit within one month; cash, Venmo, Zelle and PayPal are not reimbursed |
| R-012-05 | (Budget tab never mentioned) | Should: log every purchase in the Budget tab with line items, receipt and both status tracks |
| R-012-09 | Shared "basket" doc before each EC order | One Restock purchase in Budget, posted via /bigorder or /purchase |
| R-012-11 | Reimbursements by the finance deadline | Adds: a purchase not logged in the bot is not reimbursed |
| R-013-01 | "A re-laid part is a new part ... new P ID, new work order, supersedes" | A re-laid part is a new run of the same part; the failed run's issue is disposed as Scrap |
| R-013-05 | "Standard step list for the process type" | Techniques defined; shall keep the Stack frozen and drop-test blockers |
| R-013-06 | Buy-off silent on training | Training-gated steps signed only by trained people; lead override with written reason; leads not trained by role |
| R-013-07 | (no issue rule in any standard) | A run shall not complete until every issue has Disposition, What happened and What was done |
| R-013-08 | (none) | Should archive rather than delete; only a lead deletes; restore within 30 days |
| R-013-09 | "Self-buy-off allowed except where a step names an independent reviewer" | Mold design review shall be signed by someone other than the designer; the app only warns |
| R-013-13 | (no rule for study vs part) | Should: measured test pieces in a study; anything with a mold, checklist or cure is a part and run |
| R-013-15 | "Delete inapplicable ones consciously, don't skip silently" | Choose the right technique; sign an inapplicable step with a note saying why |
| R-013-21 | (no §8 rows for issues or overrides) | Issues disposed before Complete; every override has a reason; the lead reads override entries at the weekly meeting |
| R-014-03 | (none) | Shall: anything a ✨ button fills is a draft, checked row by row before saving; AI-read expiry stays marked until typed over |
| R-014-04 | (none) | Shall: the receiver sets Hazard on every chemical lot |
| R-014-05 | (rule cited by code, missing) | Should: one open container per material; press Open when the seal breaks |
| R-014-06 | (none) | Should: log material used and set container state; Empty, never delete |

### Held for Simon (hold: Simon)

| ID | Old | Proposed |
|---|---|---|
| R-001-17 | Layer 1 marking starts at glue-up | Mark each blank with mold ID or plan name and layer tag at tooling cut |
| R-001-19 | Opened sticker only for containers with no record | Also write OPEN, date and initials on recorded containers |
| R-003-02 | "Nitrile gloves, ventilated area, no skin contact" (Ure-Bond 90) | Glasses with side shields, gloves of an SDS-named material, sleeves, respirator if ventilation is poor |
| R-003-03 | Ure-Bond 90 for 30 and 60 lb board | TB rates it to 30 lb; record 45/60 practice or name another adhesive |
| R-003-24 | No training named for gluing | Gluing needs ShopSabre CNC training (as the app gates it), or the app changes |
| R-003-25 | Stack marked with part name, WO, up direction | Add the mold ID |
| R-004-02 | "Safety glasses when mixing/pouring" (XCR) | EN 166 goggles with side protection |
| R-006-03 | (no respirator line in CS-006) | ABEK respirator in closed rooms or long sessions |
| R-008-04 | "A-filter respirator for long/enclosed sessions" | Goggles while pouring and mixing; cartridge per SDS (A1 for XCR, ABEK for AT30) |
| R-009-06 | "Respirator (P100/dust) + dust extraction ON; long sleeves; gloves" | PPE-by-task table with a respirator and cartridge as the dust minimum |
| R-010-05 | "No special hazards beyond CS-009 dust rules" | P100 respirator and nitrile for graphite powder; gloves for cut copper mesh |
| R-011-01 | "Segregate hardeners from resins on different shelves" | May share a cabinet, sealed, each system in its own tray (proposal file only) |
| R-011-02 | Flammables cabinet list | Flash-point table; epoxies kept there because EH&S filed them, not because they are flammable |
| R-011-04 | XCR 1 kit; West 105 ½ tank + 1 can; 195 twill 10 yd | Match the app seed or change the seed |
| R-014-07 | (no expired-material rule) | Not on a season part; lead may release for R&D after a test cure; dispose through campus EH&S |
| R-OTH-31 | facts.js "dust mask or respirator" | Follows R-009-06 |

## Figures

All 13 existing figures get the same base change: Saira titles, Inter labels,
monospace IDs (injected by render_figures.mjs), text no smaller than about 22
units on a 1000-unit viewBox, caption moved out of the art into the alt text
(in the asker's words, since alt text is indexed), every distinction
surviving grayscale, and a `.v2` filename.

### Existing figures

| Figure | What must change |
|---|---|
| cs000-lifecycle | Helvetica and 10.5-15-unit text on an 880-wide box (about 5.6-8 pt). Add a Draft ⇄ Under Revision path (every standard is Draft and the overhaul moves Drafts into Under Revision). The "blank Approver row is never Released" sentence moves to §4 prose if it ends up the smallest text |
| cs001-label-anatomy | Redraw as v2 from labels.js:358-389: NAME leads (14 pt, up to two lines, uppercase), then the ID row at 9.5 pt with the R&D box, the bold key line, a detail line, and the footer with the FEB tag at right. No class word. On a lot the key line is ratio · role and the vendor lot is on the detail line. Dimension note: DK-2210 29 mm cut at 101.6 mm, not TZe 24 mm; show the 5522 variant with its 27 mm QR against 21.4 mm |
| cs001-mold-identity | Printed-label inset: mold name first, ID second, footer KEEP-OUT 40MM (labels.js:427-437). Keep-out dimensions and back-face zone are right |
| cs002-stack | Draw P5 and P6 as two plies with their own orientations (R-002-12); restyle |
| cs003-mold-section | "Total height ≤ machine max-Z (≈6 in)" becomes "over 6 in: split into sections (dowels and datums in CAD) unless the split is waived"; optional split inset with dowels |
| cs004-seal-stack | "Window closes" at 2 h 50 becomes "approximate overcoat time: check firm but tacky"; mark the 12 h FEB hold before the release system goes on |
| cs005-zzero | "Touch off here, once per job" becomes "once per setup" (R-005-04) |
| cs006-infusion | Correct as drawn. Optional gauge inset "≥27 inHg; ≤1 inHg in 10 min" |
| cs007-bag-stack | Correct. A variant showing release film or a caul plate in place of peel ply if R-007-07 lands |
| cs008-holds | Title not "Demould" (the West rows are thin-film cure figures); XCR datasheet bar 9 h, not 8.5 h; footer "the app locks the WO demould step" is false for XCR; label the holds "code table, 2026-08-01; a lead may change them"; extend the axis to 48 h; caption out of the art |
| cs009-sacrificial | Footer "Edge finish (§7.3)" becomes §7.2 step 3; "CS-002 §7.1.3" becomes "CS-002 §7.1 step 3"; "weave = stop, record, assess" becomes "stop, report an issue on the step"; text size |
| cs010-mesh-path | Text size; confirm the edge-midpoint probe points are drawn and distinct from the 100 mm grid points in grayscale |
| cs013-records | Redraw as v2: the part at top as parent of several runs, each with its as-built stack, consumed lots and issues (disposition and what was done); the part linked to two molds (split mold, Parts pulled on each); a study as a folder holding coupons (inheriting study Materials) and optionally a part; a BUY-SN6-### purchase linked to received lots by buyRef. Rules under the boxes follow R-013-01 (no "supersedes") |

### New figures wanted

| For | Figure |
|---|---|
| CS-000 | Source to shop: `src/CS-0xx.md` and `figures/*.svg` through the build steps to the .docx, the in-app PDF and Paul's corpus, the hosting and functions deploys marked, a QR hanging off its parent with "Checked against" |
| CS-001 | Two codes, one container: an FEB QR label beside a UC EH&S Data Matrix tag (RSS mark, 24-character code in six groups of four, last 12 down the right edge), with what each resolves to. Synthetic code only (test fixture tail 0024 3F1C) |
| CS-001 (and QR-005) | Scan resolution chain: FEB /Q/&lt;ID&gt; → exact EH&S tag → 12-character edge tail (ambiguous = refuse) → unknown tag → "Log it" at the Receiving desk |
| CS-001 | Cut-sheet blank with plan name and layer tag and the matching paint-marker mark; only if R-001-17 is accepted |
| CS-002 | Plan versus as-built: part Layup stack and Materials (plan) copied into each run at + New run; run edits marked as-built with a drift count; "Adopt as the part's plan" and "↩ plan" as return paths; Stack frozen cutting the run off from later plan edits |
| CS-003 | Mold life as a track: Designed → Tooling cut → Board glued → Machined → Sealed → Ready for layup, Retired off to the side; what moves each stage; where the Mold design review blocker sits (before cutting) |
| CS-003 | Layer sheet: board on board with insets, Datum A at the near-left corner, 1-2 in margin, half-inch lattice, a SPLIT line; solid blocks, dashed mold, dash-dot layer below, as drawings.js does |
| CS-005 (optional) | Feed set by the densest board in a mixed 30/45 lb stack |
| CS-009 | Section through a CF tube with a bonded insert or rod end: solvent, abrade, solvent; the bondline gap (TDS test 0.13-0.20 mm); dam inside the tube; masked threads; a "no load before the hold" clock |
| CS-010 | Decision tree for the conductive path (mesh in the stack, surface path, no CF) by geometry, permeability, mass and grounding-point access |
| CS-011 | Storage map by site (RFS container, Jacobs basement, Flammables cabinet, Dry sealed bin, General Box) with what lives where; the flammables cabinet hatched, food fridge and etch locker as crossed boxes; app site names exactly |
| CS-012 | One purchase on two tracks: goods (Submitted, Purchased, Arrived) solid, money (Submitted, Approved, Reimbursed) dashed, with /purchase, the approval DM and /reimburse on the money track and receiving (CS-014) where goods reach Arrived |
| CS-013 | The issue path on a run: raise (⚠ or ⚑) → Disposition (five methods) + What happened + What was done → run may complete; Reopen loops back and clears the disposition. Reusable on QR-007 |
| CS-014 | Delivery → Receiving desk sheet → "Create N records?" → lots (FAB/RSN one per unit, CON one with a count) → shelf; a side branch for ✨ packing slip through a thick "person checks" bar; a branch for the EH&S tag |
| QR-001 | Cure-hold card: datasheet figure against FEB hold per system, with 5:1 and 3:1 pump heads side by side so 209 cannot be confused with 205/206 |
| QR-008 | PPE strip by chemical from the SDS lines; drawn only after the PPE holds are decided |
| QR-012 | Leak-hunt map: the bag in plan view with the five leak sites from CS-006 §7.7 (perimeter tacky tape, pleats, connector bases, spiral ends, punctures) |
| QR-002, QR-003 | Reuse cs006-infusion.v2 and cs007-bag-stack.v2; no new drawing |
| QR-010 | A table copied from core.js nav, not a figure (a nav map would go stale) |

No figure for CS-INDEX or the template.

## Quick references

Final list: 15 QRs, from cluster H with three adjustments. QR-008 moves from
Tier 3 to Tier 2 because Round 5 filed the SDSs and glove charts it was
waiting on; it still copies its PPE lines from the parent standards, so it is
drafted after the PPE holds. QR-011's parent is CS-003 §7.1, where the Fusion
add-in now lands. QR-013 uses the corrected DP420 numbers. Every QR follows
STYLE §6: sections of 300 to 2,400 characters, the answer in the first 240,
headings in the asker's words, an "Also called:" line. Where demould comes up,
both spellings go in the heading (the search is literal).

| QR | Title | Tier | Parent / Covers | Must answer | Also called |
|---|---|---|---|---|---|
| QR-001 | Mix ratios and cure holds | 1 | CS-008 §5; §5.1 (numbers also in resins.js, materials.js) | IN2:AT30 ratio and that it is by weight; West 105 with 205, 206 and 209 by volume and weight (209 is the 3:1 pump); team hold against datasheet figure for each system; why the hold is longer and who can change it ("Why N hours?"; a lead can lengthen, never go below datasheet); pot life per system; XCR ratio. Says the app's cure step shows the hold in force today | demould, demold, de-mould; cure hold, FEB hold, wait time; AT30, hardener; 105, West, West System; ratio, mix ratio, how much hardener; pot life, working time |
| QR-002 | Infusion setup checklist | 1 | CS-006 §7.1 to §7.6; §7.8 | Stack order (peel ply, mesh, mesh break 30-50 mm short of the outlet); resin travel limit 0.5 m; 27 inHg before resin; drop test pass 1 inHg in 10 min; resin to mix (dry fibre mass × 0.65 × 1.2 to 1.3); do we degas (copies §7.8); when to demould (points to QR-001) | infusion, infuse, VARTM; flow mesh, infusion mesh, flow media, green mesh; spiral, spiral wrap, feed line; resin trap, catch pot; drop test, leak test, leak-down; degas, degassing, de-gas |
| QR-003 | Wet layup and the bag stack | 1 | CS-007 §7.2 to §7.6 | Bag stack order; breather clearance from the part edge; resin to mix; drop test for wet layup (2 inHg in 10 min); hardener minimum temperatures; when to demold (QR-001) | wet layup, wet lay, hand layup; bag, vacuum bag; breather, bleeder, batting; peel ply, release ply; UT, undertray |
| QR-004 | Mold sealing and release, in order | 1 | CS-004 §7.1 to §7.5 | XCR coats, batch size, overcoat time and the fingernail check; the 12 h hold before release; wax coats then PVA and the wait between; what to clean with (IPA, never acetone on board); when the mold is Ready for layup | seal, sealer, sealing, mold sealer, XCR; release, release agent, mold release; wax, Formula Five; PVA, Partall; Clean 'N Glaze, mold cleaner |
| QR-005 | Which label goes where | 2 | CS-001 §7.2; §7.6; §7.11 | Where a mold's label goes and the keep-out zones; what a part gets at demold (two labels); what a lot label says; chemical containers and the EH&S tag; no printer; the engraved mold ID. The "which label" table in the first 240 characters | label, sticker, tag; QR, Data Matrix, barcode; lot, jug, roll; EH&S tag, UC tag |
| QR-006 | Receiving a delivery and material lots | 2 | CS-014 §7 (Covers app/receiving.js until CS-014 promotes) | How to log a delivery (Inventory → Receive a delivery opens the Receiving desk); one record per roll or jug, consumables one record with a count; where lot number and expiry come from (Expiry from values); what ✨ From packing slip does and why every row is checked; recording the EH&S tag; setting Hazard | receive, receiving, delivery, package, order arrived; lot, batch, jug, roll; expiry, expiration, use-by; packing slip, delivery note |
| QR-007 | Work orders: steps, buy-offs, holds and issues | 1 | CS-013 §7.1 to §7.7 (Covers app/workorders.js) | Who can sign a step; what blocks (Stack frozen, design review, drop test, acceptance criterion); why the demould step is locked; which training each step needs; raising and disposing an issue; closing a run; getting a deleted record back from Recently deleted; part versus run | WO, work order, run, traveler; buy-off, sign-off, sign; blocker, locked step; technique, process, checklist; issue, ticket, disposition |
| QR-008 | PPE and handling by chemical | 2 | CS-003 §6; CS-004 §6; CS-006 §6; CS-008 §6; CS-009 §6 (multi-parent), plus the SDSs | Which gloves for XCR, IN2, West, DP420, acetone, IPA (Ansell charts); when a respirator is needed and which cartridge; skin and eye first aid per SDS; a hot cup (exotherm). Drafted after the PPE holds are decided | PPE, safety gear; gloves, nitrile; respirator, mask, P100, organic vapor; SDS, MSDS, safety sheet; goggles, safety glasses |
| QR-009 | Words the team uses | 3 | §4 of CS-001, CS-006, CS-007, CS-008, CS-013 (multi-parent) | What UT, RW, FW, WO, RDS, CPN, STK, lot, buy-off and FEB hold mean; part versus R&D part versus study. One section per family (parts and aero, consumables, resins and chemistry, records and IDs, people and roles) | the aliases are the content |
| QR-010 | Where things are in the app | 2 | Covers app/core.js nav, app/inventory.js, app/paul.js | Where tooling board is (Inventory → Boards; Stock is hidden); molds and stack plans (Molds); Recently deleted; R&D or part and run; standards and datasheets (Documents); asking Paul or Steve, Chats, New chat. Labels copied from code; nav today Dashboard, Season, Parts, Work Orders, Molds, Inventory, R&D, Schedule, Budget, Documents, Reports, People | app, web app, FEB Composites; tab, page; Stock, boards, tooling board; bin, trash, deleted |
| QR-011 | Fusion add-in: planning stock | 3 | CS-003 §7.1 (Covers 10 Fusion Add-in/, app/fusion.js) | How to install it (Mac, Windows); why the app says the add-in is out of date; where the plan goes (STK-SN6-###); what the split waiver measures | Fusion, Fusion 360; add-in, plugin, FEBPlanStock; stock plan, stack plan, board plan |
| QR-012 | Bag leaks and dry spots | 1 | CS-006 §7.4; §7.7; CS-007 §7.5 | Where to look when the bag will not hold (seams, pleats, connector bases, spiral ends, mold back and sharp edges); what passes the drop test; a dry spot still wet (second feed) or cured (record as a defect); race-tracking; air leaking in "from nowhere" | leak, leaking, losing vacuum, air leak; dry spot, dry patch, starved, unwetted, white fibre; race-tracking, racing |
| QR-013 | Trim, sand and bond prep | 2 | CS-009 §7.1 to §7.3; §7.6 | When to trim (after the cure hold); grit to key a bond face (120, team value); DP420 ratio, 20 min open time, 2.5 h handling strength; why never a machine sander on thin laminate; DP420 for any load-carrying insert | trim, cut, edge; sand, sanding, key, scuff; bond, glue, DP420, structural adhesive; insert, rod end |
| QR-014 | Where things are stored | 1 | CS-011 §7.3; §6 | Where molds, parts, cloth, chemicals and consumables live (app site names); where flammables go; recording a move (scan, Move, scan the shelf); whether resin and hardener are kept apart (copies §6 after R-011-01) | store, storage, keep, put away, shelf, bin; etch locker, Jacobs basement, RFS container; flammables cabinet |
| QR-015 | Buying something and getting paid back | 2 | CS-012 §7.1; §7.2; §7.9 (Covers app/budget.js) | Who approves and how (/purchase in #purchasing-slackbot); which reference ID; how to get reimbursed and what the receipt needs; payment methods not reimbursed; what ✨ Fill from receipt reads and why you check it; rush orders | reimburse, reimbursed, reimbursement, paid back; purchase, buy, order; receipt, invoice; purchasing bot, Flux |

Not added: a grounding card (CS-010 already ranks first for grounding
questions) and an onboarding card (no parent standard; recorded as a gap in
R-IDX-07).

## Steve material

From H-paul.md §3. Steve's files live in `06 Composites App/steve/`, never in
Paul's corpus.

**`steve/fibreglast-lines.md`**: one `##` section per product family, in his
voice, no numbers, each naming handles verified in `steve_catalog.json`:

| Family | Example handles |
|---|---|
| Sealant tape and bag films | yellow-sealant-tape-00580, gray-sealant-tape-00581, nylon-bagging-film, stretchlon-200-bagging-film-1678 |
| Peel ply, breather, release film | polyester-peel-ply-583, nylon-released-peel-ply-582, breather-and-bleeder-579, high-temperature-release-film-3782 |
| Infusion media and lines | green-hdpe-infusion-flow-media, enkafusion-nylon-matting-roll-1401, spiral-tubing-1403, omega-flow-channel, 1523-1 |
| Vacuum pumps, gauges, leak finding | vacuum-gauge-00896, vac-checker, ultrasonic-leak-detector-3819, stethoscope-1504 |
| Mold release and mold prep | pva-release-film-13, parting-wax-1016, non-silicone-high-temp-paste-wax-4121, step-1-mold-polish-and-step-2-mold-polish-1102 |
| Mixing and dispensing | graduated-measuring-cups-821, 1245-digital-scale, mixing-sticks-paddles-58, jiffy-mixers-319 |
| Carbon fabric | 3k-2-x-2-twill-weave-carbon-fiber-fabric-01069, 3k-plain-weave-carbon-fiber-fabric-00530, carbon-fiber-veil-1064 |
| Cores | nomex-honeycomb-1562, divinymat-01024-a, vinyl-foam-4lb-density, grid-scored-pet-foam-core-sheets |
| Cutting and sanding | modified-kevlar-scissors, olfa-rotary-cutter-01706-a, gold-hook-and-loop-ao-sanding-discs-120-grit, perma-grit-sanding-blocks |
| Rollers and squeegees | aluminum-bubble-buster-roller-sleeves-2242, plastic-and-rubber-squeegees |
| Kits and sample packs | vacuum-bagging-materials-sample-pack-4002, resin-infusion-sample-pack, sandwich-core-sample-pack |
| Shop organisation | six-roll-fabric-rack-01720-a, cutting-station-01722-a, composite-markers-silver-color |

**`steve/upsell-map.md`**: shop topic → the catalog categories Steve may
push, and what he must never say.

| Topic (standard / QR) | Steve's categories | Steve must never |
|---|---|---|
| Bag leaks, drop test (CS-006 §7.4, QR-012) | bagging-films-tapes, vacuum-pumps-fittings | say a failing drop test is fine to infuse |
| Dry spots, infusion setup (CS-006, QR-002) | infusion-media-lines, bagging-films-tapes | advise changing mesh layout or travel distance |
| Wet layup (CS-007, QR-003) | bagging-films-tapes, cutting-sanding-tools, mixing-dispensing | |
| Mold seal and release (CS-004, QR-004) | mold-release-prep | suggest skipping or thinning release |
| Mixing and cure (CS-008, QR-001) | mixing-dispensing | suggest mixing products from two systems; any ratio or time |
| Trim, sand, bond (CS-009, QR-013) | cutting-sanding-tools, adhesives | |
| Cores (CS-002, CS-006) | core, kits-samples | |
| Labels, work orders, the app (CS-001, CS-013, QR-010) | shop organisation | misstate a record fact |
| Storage and purchasing (CS-011, CS-012) | shop organisation, kits-samples | anything about where chemicals go or what may share a shelf |
| Grounding (CS-010) | none: deflect to Paul | any grounding or resistance advice |
| CNC and tooling board (CS-003, CS-005) | mold-release-prep, kits-samples | any machine operating advice |
| PPE, SDS, exotherm, waste | none: deflect to Paul | anything at all |

**Catalog categories** (R-STV-02, -03): the 18-rule `cat` table in
H-paul.md §3.3, first match wins, applied to all 564 rows: safety-ppe,
gelcoat-colour, kits-samples, prepreg, vacuum-pumps-fittings,
infusion-media-lines, bagging-films-tapes, mold-release-prep, core,
adhesives, carbon-fabric, glass-aramid-fabric, epoxy-resins, other-resins,
coatings-fillers-pigments, mixing-dispensing, cutting-sanding-tools,
instruments-heat. Safety-ppe never reaches Steve; gelcoat-colour only when
the query asks for gel coat, colour or RAL; instruments-heat and
wind-turbine-only rows rank below the shop families.

**Wiring and tests** (R-STV-04, -06; R-OTH-30): `search_steve_notes`
Steve-only; the guard test that no corpus section comes from `steve/`;
steveGuard title exemption and the coats/layers/plies/grit pattern; six
`eval_steve.js` cases (gloves for XCR, high resistance to ground, resin and
hardener on one shelf, coats of wax, fixing a bag leak, a Fibreglast hardener
with IN2).

## Open questions

Only what a person has to answer. Each names who and the rows it unblocks.

1. **CS-011 §6 co-storage and the flammables list** (Simon). Proposal goes to
   `overhaul/proposals/CS-011-s6.md`; the IN2 SDS line "keep away from
   amines" is the counter-evidence. R-011-01, R-011-02, QR-014.
2. **PPE upgrades the SDSs ask for** (Simon, with Nick for purchasing).
   Goggles (EN 166) for XCR; Ure-Bond 90 gloves, glasses and respirator;
   ABEK versus the OV/P100 cartridges the shop stocks for AT30; the CS-009
   PPE-by-task table; P100 for graphite powder. Recommendation: adopt them
   and buy goggles. R-003-02, R-004-02, R-006-03, R-008-04, R-009-06,
   R-010-05, R-OTH-31, QR-008.
3. **Ure-Bond 90 on 45 and 60 lb board** (Simon). The TB rates it to 30 lb.
   R-003-03.
4. **What cuts tooling-board blanks**, the ShopSabre or a saw? shop.js says
   both; packer.js models a 1/8 in saw kerf. R-003-12, R-OTH-29.
5. **Gluing behind ShopSabre CNC training?** The app gates it today; no
   standard says so. R-003-24.
6. **Marking blanks and containers by hand**: mold ID or plan name plus layer
   tag at tooling cut, the mold ID on the glued stack, and OPEN plus date on
   a recorded container. R-001-17, R-003-25, R-001-19.
7. **Expired and emptied chemicals** (Nick): may expired resin go on R&D work
   after a test cure, and what is the RFS disposal route? R-014-07, R-014-08.
8. **Has a Brother QL been bought?** Decides whether CS-012 §7.8 is a request
   or a record. R-001-02, R-012-06.
9. **Does the team degas resin?** (Nick) CS-006 §7.8 states "we do not" and
   lands only on a yes. R-006-04, QR-002.
10. **Which tacky tape does the team buy**: General Sealants, Airtech AT-200Y
    or the Easy Composites one? R-006-12, R-011-03, R-OTH-22.
11. **Team hold before a DP420-bonded insert takes load** (Nick with aero).
    The TDS gives handling strength at 2.5 h; the team number is a lead's.
    R-009-02.
12. **Where the current ShopSabre tool library file lives** (a lead). R-005-03.
13. **What a work-order label physically goes on** (Nick). R-001-15.
14. **Purchasing bot details** (finance lead): does the bot want a receipt at
    request time, and does the pinned reimbursement form still exist?
    R-012-01, R-012-03.
15. **Is "chemical boxes/barrel" still a real storage location?** R-011-07.
16. **Who holds the chemical-inventory role** for EH&S reconciliation, and
    when does the first production EH&S import run? R-014-02.
17. **Minimum stock values** (Nick): XCR 1 or 2 kits, West 105 half or one
    tank, 195 twill in yards or rolls. R-011-04.
18. **Things to read off a container at RFS**: the LiME LiNE Part B can's
    hazard label, the copper mesh wire size and opening, and the tooling
    board grade (PBLT or PBHT). R-009-03, R-010-07, R-003-22.

## Answers from Simon (2026-10-10, after Round 2 started)

Round 2 drafted without these. Round 6's fix pass applies them; a reviewer
checking a draft against the register reads this section as overriding the
rows it names.

- **PPE (open question 2): adopt, but no new purchases.** Write the PPE the
  SDSs require where the shop already has it as a requirement. Where it
  needs buying (EN 166 goggles for XCR, ABEK cartridges for AT30, anything
  else not stocked), write it as "should" and add it to a purchase list in
  the final report for Nick. Rows R-003-02, R-004-02, R-006-03, R-008-04,
  R-009-06, R-010-05, R-OTH-31 become "do (rule)" on those terms.
- **Degassing (open question 9): yes, sometimes.** CS-006 §7.8 describes
  degassing as an optional step (when, how, what to watch), not "we do not
  degas". Nick confirms the exact setup; the draft marks that one detail
  for him. R-006-04, QR-002.
- **Blanks (open question 4): mostly a saw**, as the packer models (1/8 in
  kerf). The ShopSabre may cut blanks in future; say "a saw (the ShopSabre
  may be used)". R-003-12, R-OTH-29.
- **Tacky tape (open question 10): Airtech AT-200Y.** Cite
  `03 Datasheets/AIRTECH-TDS-AT-200Y-Sealant-Tape.pdf`; the INDEX row's
  "confirm" note can go; the restock seed's supplier changes to Airtech.
  R-006-12, R-011-03, R-OTH-22.
- **Hand-marking (open question 6): no preference; Claude's call.** Blanks
  yes: mold ID or plan name plus layer tag at Tooling cut, and the mold ID
  on the glued stack (R-001-17, R-003-25 become "do (rule)"). Recorded
  containers no: the app record already carries the open date, and a
  second hand-written copy is one more thing to disagree (R-001-19 drop).

## Rows added in Round 2 review

Raised by the Round 2 revisers (`proposals/register-rows-from-R2-review.md`), merged here.

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-007-13 | §7.5 | process-rule | Withdraw the second half of R-007-04 (a lead should add a "Drop test, 2 inHg or less over 10 min" blocker to Mold wet lay and Foam wrapped) until the app's cure hold looks back to the last hold-starting step. §7.5 states the limit as plain fact: a step between "Wet layup and bag" and "Cure and demould" (or "Cure") switches the hold off, so the drop test is recorded in the "Wet layup and bag" note. The same limit applies to R-013-05 / CS-013 §7.5: a lead adding a drop-test step to a wet-layup technique would lose the cure hold | `app/workorders.js:721-738`, holdState() reads only `steps[idx - 1]` | do (rule) |
| R-OTH-33 | app/workorders.js holdState | missing | Make holdState() walk back from the hold step to the nearest step with `kind: "startsHold"` instead of reading only `steps[idx - 1]`, so a blocker (a drop test) can sit between the resin step and the hold. Once it lands, R-007-04's should can return and CS-007 §7.5 can name the step | `app/workorders.js:721-738` | do |
| R-004-15 | §5 Compressed air row; §7.1 step 1 | process-rule | "Blow all dust off the mold with compressed air" becomes "Vacuum all dust off the mold, including pockets and scribe lines"; the §5 row becomes a shop vacuum. Three standards disagree today: CS-005 §6 bans blowing dust around with compressed air, CS-003 Rev E (R-003-05) replaced compressed air with vacuuming before gluing, and CS-004 still blows dust off the machined mold. The alternative is to record in CS-004 why sealing prep is the exception. The §7.3 step 6 tack-free recoat ("Blow off the dust") is the same question | CS-005 §6; R-003-05 | hold: Simon |

Process-rule changes list, old and new wording:

| ID | Old | New |
|---|---|---|
| R-007-13 | "A lead should add the 2 inHg drop-test blocker to both wet-layup techniques" (R-007-04) | No should; readings stay in the "Wet layup and bag" note until the app's hold looks past a blocker |
| R-004-15 | "Blow all dust off the mold with compressed air" | "Vacuum all dust off the mold, including pockets and scribe lines" (if Simon agrees) |

## Rows added in Round 4 (quick references and Steve)

Raised by the Round 4 critics and retrieval tester; the reviser could not
apply them because they touch a draft standard or code. Round 6's fix pass
applies the draft-standard rows; Claude applies the code rows before R7.

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-006-30 | CS-006 §6 | wrong | "The shop stocks OV/P100 (3M 60921)" disagrees with the other parents, which name A + P100 (the restock row "A + P100"). Say what the restock row says | inventory.js restock seed; QR-008 critic | do |
| R-008-30 | CS-008 §6 | process-rule | Respirator is a "should" here but "wear" in CS-004 §6 and CS-007 §6. Under Simon's PPE answer the stocked A + P100 cartridge is required; only ABEK for AT30 stays a should | Answers from Simon; QR-008 critic | do (rule) |
| R-004-30 | CS-004 §7.4 | missing | Between steps 1 and 2: the Formula Five out-gas wait before the first wax coat, cited to the Formula Five guide; CS-004 sets no wait today | 03 Datasheets/FORMULA-FIVE-Mold-Release-Wax.pdf; QR-004 critic | do |
| R-009-30 | CS-009 §7.4 heading | style | Retitle "7.4 Clear coat" to "7.4 Clear coat a part: mixing and applying LiME LiNE UC4:1" (number unchanged) so searches for "clear coat" and "LiME LiNE" land | R4 retrieval test | do |
| R-003-30 | CS-003 §7.3 heading | style | Retitle to "7.3 Cutting blanks and gluing tooling board (Ure-Bond 90)" so "glue" matches | R4 retrieval test | do |
| R-011-30 | CS-011 §7.2 heading | style | Retitle "Order timing" to "Order timing: when to order resin and cloth" | R4 retrieval test | do |
| R-STV-07 | REGISTER Steve material; steve/upsell-map.md | wrong | "Trim, sand, bond" drops "adhesives" from Steve's categories: a Fibreglast structural adhesive is the September insert-bond failure mode | R4 fact critic | do |
| R-STV-08 | functions/context.js searchCatalog | missing | Read the `cat` field: never return safety-ppe or solvents-catalysts; gelcoat-colour only when the query says gel coat, colour or RAL | steve/catalog-categories.json; R4 critic | do |
| R-OTH-34 | tools/build_ai_corpus.mjs | wrong | Skip the H1 "Introduction" section of a QR (the header table and a lead-in carry nothing a search should land on) | R4 retrieval test | do |
| R-OTH-35 | functions/context.js score | wrong | Terms of 3 characters or fewer match whole words only ("lot" matched "pilot", "slot", "bottle") | R4 retrieval test | do |

## Rows added in Round 3 (figures)

The Round 3 integrator found places where the draft text, not the figure,
needs fixing (`src/figures/variants/CHOICES.md`). Round 6 applies them.

| ID | § | Type | Change | Evidence | Decision |
|---|---|---|---|---|---|
| R-001-30 | CS-001 §4, §7.4 | wrong | The draft gives a 40 mm flange keep-out in one place and "25 mm inboard of the outline" in another; settle on one rule (the figure draws the 40 mm keep-out, which satisfies both) | cs001-mold-identity.v2 | do |
| R-003-31 | CS-003 §5 | missing | The board table lists 30 and 60 lb/ft³ only; the app and cs005-feed-density.v2 use 45 lb too. Add 45 or say why not | stock.js; packer.js | do |
| R-011-31 | CS-011 storage table | missing | No Flammables cabinet row, and resins/hardeners have no app Site; the figure says "No app Site names them yet". Add the row (the §6 contents stay held) | cs011-storage-map.v2 | do |
| R-013-30 | CS-013 | style | Text still says "gate"/"gated" where the figures and app say blocker/hold; use the app's words | cs013-issue-path.v2 | do |
| R-008-31 | CS-008 | wrong | "48 h is after the weekend" holds only for a Friday infusion; reword | cs008-holds.v2 | do |
| R-010-30 | CS-010 | missing | The draft does not say what the catch can ended up with; the figure no longer claims copper paths. State the outcome or leave it out | cs010-path-decision.v2 | do |
