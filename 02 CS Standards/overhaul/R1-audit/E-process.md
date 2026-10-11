# R1 audit, cluster E: process standards (CS-004, CS-006, CS-007, CS-008)

Auditor: Claude (doc overhaul Round 1, requested by Simon Starbuck), 2026-10-10.
Read-only pass. Sources: the four standards at their current revs (CS-004 Rev D,
CS-006 Rev C, CS-007 Rev C, CS-008 Rev D, all effective 2026-08-28), `app/resins.js`,
`app/materials.js`, `app/workorders.js`, `app/shop.js`, `app/labels.js`,
`app/inventory.js`, app README, SESSION-STATE, HANDOFF, `git log --since=2026-08-28`,
every TDS/SDS in `03 Datasheets/` read with `pdftotext`, and `#composites` /
`#aerodynamics` Slack since 2026-09-01 (keyword searches plus thread reads).

Types: **wrong**, **missing**, **stale-path**, **style**, **process-rule** (a
shall/should/may added, removed or changed; these need Nick's and Simon's eyes).
Severity: high / medium / low. IDs are stable so the register can cite them.

## Headline items

1. **CS-006 §7.6 tells people to demould at the datasheet time** (18–24 h SLOW,
   6–8 h FAST). The governing FEB hold is 48 h / 24 h (CS-008 §5.1,
   `resins.js:61,68`) and the work order locks the step. Two standards give two
   answers to "when can I demould?", and Paul will quote whichever he finds first. (E20)
2. **CS-008 §5.1 says the hold numbers "live in one place, resins.js".** Since
   commit `64f1b31` (2026-08-07) a lead can change any hold from the app
   (`config/resins`). Who may change a hold, and how, is not in any standard. (E60)
3. **The XCR 12 h hold is not enforced anywhere**, though CS-008 §5.1 says "the
   app enforces this" for every row. No work-order step starts an XCR cure, and
   CS-004 never mentions the 12 h hold at all. (E06, E61)
4. **Hardener hazards are understated in three docs.** AT30 SLOW and the XCR
   hardener are classified *Skin Corr. 1A, H314, causes severe skin burns and eye
   damage*. CS-006 calls them irritants, CS-004 asks for safety glasses where the
   XCR SDS asks for goggles, and CS-008 calls everything a respiratory sensitizer,
   which no SDS on file says. (E02, E03, E21, E66)
5. **CS-007's main West reference is the wrong PDF.** R1 points to the West System
   International (UK) sheet, which says 5:1 *by weight* and 9–12 h thin-film cure;
   the numbers CS-007 quotes come from the Gougeon (US) sheet. 209 is missing from
   CS-007 entirely. (E40, E41)
6. **No degassing content exists**, and Paul's eval expects CS-006 to answer
   "What does our standard say about degassing resin before infusion?"
   (`tools/eval_askpaul.js:39`). Slack has no record of the team degassing. (E23)
7. **CS-007 requires a drop test, but the wet-layup techniques have no drop-test
   step**, so there is nowhere in the app to record it and nothing gates it. (E44)

---

## CS-004 Mold Sealing, Release & Surface Prep (Rev D)

### E01 · §2 Scope · stale-path · medium
- **Current** (line 37): "Not covered: 3D-printed compression molds (CS-006 Composites Appendix A)".
- **Evidence**: CS-006 has no appendix. `CS-003.md:37` and `CS-003.md:135`
  ("## Appendix A: 3D-printed compression (forged CF) molds").
- **Proposed**: "Not covered: 3D-printed compression (forged CF) molds (CS-003 Appendix A) and hotwire foam male molds."

### E02 · §6 Safety, eyes · wrong + process-rule · high
- **Current** (line 96): "Eyes/skin: safety glasses when mixing/pouring".
- **Evidence**: XCR SDS §8.2, resin v9.1 (10-06-2024) p.6 and hardener v5.1 (12-04-2024) p.7:
  "wear safety goggles with protective sides accordance with standard EN166. In the
  event of high danger, protect the face with a face shield." Both parts carry
  H318 (serious eye damage); the hardener is Skin Corr. 1A, H314.
- **Proposed**: "Eyes: safety goggles with side protection (EN 166) whenever XCR
  resin or hardener is open, mixed or brushed (R2 §8.2). Prescription glasses are
  not eye protection (R2)." Upgrading glasses to goggles changes what a member
  wears: **process-rule**, flag for Nick.

### E03 · §6 Safety, hazard statement · wrong · high
- **Current** (line 91): "the mixed system is a **skin and respiratory sensitizer**".
- **Evidence**: XCR SDS §2: resin H302, H315, H317, H318, H341 (suspected of
  causing genetic defects); hardener H302, H314, H317, H318. No H334 (respiratory
  sensitizer) on either part; §11 says only that the epoxy "may be ... a respiratory
  tract sensitiser" by analogy (SDS line ~468).
- **Proposed**: "Per R2: XCR resin and hardener both cause allergic skin reactions
  (H317) and serious eye damage (H318). The hardener is corrosive: it causes
  severe skin burns (H314). The resin is suspected of causing genetic defects
  (H341). Repeated careless exposure can make you permanently allergic to epoxies."

### E04 · §6 Safety, who may handle XCR · missing + process-rule · high
- **Evidence**: XCR SDS §7.1 (resin, line ~232): "Individuals with a history of
  skin sensitisation should not, under any circumstance, handle this mixture."
- **Proposed** new bullet: "Anyone who has had a skin reaction to epoxy shall not
  mix or brush XCR (R2 §7.1). Tell a lead; there is other work." New shall:
  **process-rule**.

### E05 · §3 key numbers + §7.3 step 6 · wrong · medium
- **Current**: "Overcoat window ... **within ~2 h 50 at 20 °C / 1 h 30 at 30 °C**" and
  step 6 "overcoat when the first coat is firm-but-tacky, **within ~2 h 50**".
- **Evidence**: XCR TDS p.2 table row "Overcoat Time 02h 50 / 01h 30", and text:
  "The table above indicates the approximate 'overcoat time' when a new layer of
  resin should be applied ... although the status of the resin should be checked
  beforehand." It is the time the coat reaches B-stage, not a deadline. The
  figure (`cs004-seal-stack`) labels 2 h 50 "window closes".
- **Proposed** §3 row: "Overcoat time | about 2 h 50 at 20 °C, 1 h 30 at 30 °C: the
  first coat is usually firm-but-tacky by then (R1). Check with a fingernail; the
  state decides, not the clock." Step 6: "Overcoat when the first coat is
  firm-but-tacky, about 2 h 50 after mixing at 20 °C (1 h 30 at 30 °C) (R1). Check it ..."

### E06 · §7.3 step 7 / new step · missing + process-rule · high
- **Current**: "Initial cure is **8 h 30 at 20 °C** (R1); the mold is handleable after ~9 h."
  CS-004 never mentions the FEB hold.
- **Evidence**: CS-008 §5 XCR row "FEB hold **12 h**"; `resins.js:98-105` (XCR,
  `febHoldH: 12`, `sheetH: 9`). In the app no step starts an XCR cure: the
  techniques' "Seal and release mold" step carries no rule (`workorders.js:273-285`),
  and `holdState()` only reads a cure recorded on a `startsHold` step
  (`workorders.js:721-739`). So the 12 h is written down but never locks anything.
- **Proposed** step 7: "Do not start the release system (§7.4) until the FEB hold
  of **12 h** after the last coat has passed (CS-008 §5). The datasheet's initial
  cure is 8 h 30 at 20 °C (R1); the hold is the team's margin over it. The app
  does not lock this one: the person who sealed the mold writes the last-coat time
  in the work order's "Seal and release mold" step notes." **process-rule** (it
  makes an existing CS-008 number binding in CS-004). Alternative for Nick: add a
  hold to the seal step through Work Orders, Techniques, and change the last
  sentence to say the app locks it.
- Also reconcile §8 "Cure | Fingernail does not mark surface at 24 h" with the
  12 h hold: either the check happens at 12 h, or the table says the 24 h check
  is before first layup, not before release.

### E07 · §7.3 step 1 · missing · low
- **Evidence**: XCR TDS p.2: "Ensure that both resin and hardener containers are
  within this temperature range [15–30 °C] before use. High humidity environments
  should also be avoided."
- **Proposed** step 1 adds: "Both jugs are inside 15–30 °C before you mix (bring
  them in from the container first if the night is cold), and the room is not
  humid (R1)."

### E08 · §7.4 step 4 and §9 Records · missing · medium
- **Current**: "Mark the mold's record with sealing and release done (who, when,
  products, batch masses, coat counts), and set its stage to Sealed."
- **Evidence**: the mold record has exactly these sealing fields: "Sealing system"
  (select XCR / S120 / Resin / Other), "Sealed on", "Sealed by" (a roster pick
  since `a273b7e`, 2026-09-24), "Parts pulled" (`shop.js:88-93`). Batch masses
  and coat counts have no mold field; they belong in the work order step
  "Seal and release mold" (`workorders.js:273,285`). Stages are
  "Designed, Tooling cut, Board glued, Machined, Sealed, Ready for layup, Retired"
  (`shop.js:46`).
- **Proposed** step 4: "On the mold's page set Sealing system = XCR, Sealed on =
  today, Sealed by = you (pick yourself from the list), and Stage = Sealed. Write
  XCR batch masses, coat count and coat times in the "Seal and release mold" step
  notes on the work order." Add a step at the end of §7.5: "Set Stage = Ready for
  layup." Moving the stage name into a step is a small **process-rule** (it
  defines when a mold counts as Ready for layup).

### E09 · §7.5 caution example · wrong · low
- **Current**: "A label reading `SEALED 2025-11-02 · USES 09`".
- **Evidence**: `labels.js:430` prints `SEALED <date> · <SEALED BY, upper case> · USES 09 · REV <rev>`.
- **Proposed**: `SEALED 2025-11-02 · J LEE · USES 09` (any placeholder name, not a real member).
  Step 3 adds "and the sealed-by name".

### E10 · §7.3 step 6, board grade · missing + process-rule · medium
- **Current**: "30 lb board usually needs a second coat; 60 lb board often seals in one."
- **Evidence**: molds now carry a density range ("Board density, min/max",
  `shop.js:76-79`), and the packer may glue two grades edge to edge in one layer
  (app README:490-497). The README twice cites CS-004 for "grades are not
  interchangeable silently" (README:497, README:1013); CS-004 contains no such rule.
- **Proposed** step 6 adds: "A mold cut from a range of grades seals like its
  softest board: plan two coats if any of it is 30 lb." Plus a sentence in §2 or
  §7.2 that the README's citation can point at. **process-rule** (Nick decides;
  the README already behaves as if the rule exists).

### E11 · §5 IPA row · missing · low
- **Current**: "Isopropyl alcohol + microfiber cloths | ≥90% IPA".
- **Evidence**: stock includes "Isopropyl rubbing alcohol 70%" (`materials.js:86`,
  alias "rubbing alcohol") beside 91% IPA (`materials.js:85`).
- **Proposed**: "≥90% IPA (the 91% bottle). Not the 70% rubbing alcohol: the water in it slows drying."
  The parenthetical reason is general practice; drop it if a reviewer wants a source.

### E12 · §7.3 step 6, next-day second coat · missing · low
- **Evidence**: Slack #composites 2026-09-24, Sam Hartman's "9/24 Updates" thread
  (ts 1790292814.671159): first coat in the evening, "I am going to do another
  tmrw at 10am". A next-morning coat is past the overcoat time, so it needs the
  120-grit key. This is the normal path when a session ends after one coat.
- **Proposed**: reorder step 6 so the next-session path reads as a full branch:
  "Coming back another day? Then the first coat is tack-free: wait at least 9 h
  from application, key with 120-grit, blow off, IPA-wipe, then recoat (R1)."

### E13 · §3 storage and shelf life · missing · low
- **Evidence**: XCR TDS p.3: store resin and hardener at 20–25 °C, 12-month shelf
  life, keep tightly sealed. `materials.js:58` already uses the 12 months to fill expiry dates.
- **Proposed**: one row in the §3 table, "Storage | 20–25 °C, sealed; 12-month
  shelf life (R1). Where it lives: CS-011."

### E14 · header, photos · style · low
- Reviewer row carries the only em dash ("simon (reviewer agent) — G2a"). Replace with a comma.
- Three `[PHOTO: …]` placeholders (lines 116, 131, 140) stay until a lead supplies photos.

---

## CS-006 Resin Infusion (Rev C)

### E20 · §7.6 step 1 · wrong · high
- **Current** (line 142): "Demould at **18–24 h @25 °C** for SLOW (6–8 h FAST) per R1".
- **Evidence**: CS-008 §5 / §5.1 FEB hold 48 h SLOW, 24 h FAST; `resins.js:61,68`;
  the "Cure and demould" step stays locked until the hold passes
  (`workorders.js:3350-3360`). The printables card repeats the datasheet figure
  ("Cure / demould — SLOW: 18–24 h", `app/docs/printables.html`, CS-006 card).
- **Proposed**: "1. Do not demould before the FEB hold: **48 h** for SLOW, **24 h**
  for FAST, counted from the time you clamped the inlet (CS-008 §5.1). The work
  order's "Cure and demould" step stays locked until then; only a lead can
  override, with a written reason. The datasheet's own demould figure is 18–24 h
  SLOW / 6–8 h FAST at 25 °C (R1); a cold shop runs longer than either."
  It brings CS-006 into line with a rule CS-008 already states and the app already
  enforces, but members reading CS-006 will see their demould time double: list it
  as a **process-rule** line for visibility.

### E21 · §6 Safety, hardener hazard · wrong · high
- **Current** (line 87): "IN2 resin and amine hardener are skin/eye irritants and sensitizers."
- **Evidence**: `EC-SDS-IN2-Epoxy-Infusion-Resin-and-Hardener.pdf`: IN2 resin H315,
  H317, H319; AT30 Slow Hardener (v7.0, 10.07.2024) H302, H314 "Causes severe
  skin burns and eye damage", H317, H318, H332, classified Skin Corr. 1A and Eye Dam. 1.
- **Proposed**: "Per R2: IN2 resin irritates skin and eyes and causes allergic
  skin reactions. AT30 hardener is corrosive: it burns skin and can permanently
  damage eyes (H314, H318), and is harmful if inhaled (H332)." Then the gloves and
  eyes bullets as now.

### E22 · §6 Safety, respirator · process-rule · medium
- **Current**: CS-006 §6 has no respirator line. CS-004 §6 and CS-008 §6 specify an A-filter.
- **Evidence**: AT30 SDS §8: "Use respiratory protection unless adequate local
  exhaust ventilation is provided ... Recommended Filter type: ABEK-filter, EN 14387".
  The team stocks "Respirator cartridges (A + P100)" (`inventory.js:72`).
- **Proposed**: add "Respirator: in a closed room or for long sessions, a
  respirator with ABEK cartridges (EN 14387) per R2 §8." Whether the team switches
  from A to ABEK cartridges is a purchasing and PPE decision for Nick:
  **process-rule**, cross-cluster with CS-008 §6 (E66) and CS-011/012.

### E23 · new §7.8 "Degassing the resin" · missing + process-rule · high
- **Evidence**: no degassing step or mention in any standard (`grep -ri degas` hits
  only tests, STYLE and PLAN). Paul's eval expects a CS-006 citation for "What does
  our standard say about degassing resin before infusion?"
  (`tools/eval_askpaul.js:39`); `test_functions.mjs:418-422` mocks the same
  question. Slack search for "degas", "degassing" and "bubbles" in #composites
  finds no degassing practice; the IN2 TDS does not call for it. The only related
  practice on record is Larry's note (2026-04-03, ts 1775277279.331489): "if air
  bubbles appear and the bag is salvageable, flush it with resin".
- **Proposed**: a new `### 7.8 Degassing the resin` (appended, so §7.1–7.7 keep
  their numbers) that states current practice without inventing one: "We do not
  degas IN2 before infusing. The IN2 datasheet does not ask for it (R1), and the
  team has no degassing chamber on record. Air is kept out instead by: mixing
  slowly and double-potting (CS-008 §7), keeping the inlet fully submerged (§7.5
  step 3), holding ≥27 inHg, and passing the drop test (§7.4). If a run shows
  bubbles at the flow front, note where on the work order. Degassing is a
  candidate R&D study, not a step." Add "Also called: degas, degassing, debulking
  the resin" only if Nick confirms. Writing "we do not degas" down is a rule:
  **process-rule**, Nick confirms before it lands.

### E24 · §7.1, §7.4, §7.5 · missing · medium (app gates the standard should name)
- **Evidence**:
  - Training: "Dry stack and bag", "Drop test, 1 inHg or less over 10 min" and
    "Infuse" require the "Resin infusion" training to sign (`workorders.js:274-275,278-280`,
    gate at `workorders.js:3320-3324`); signing without it needs a training override
    with a reason, logged to the event log (`workorders.js:3300-3311`).
  - The drop-test step is a blocker and needs a note before it signs
    (`workorders.js:274`, `needs: ["note"]`).
  - Buying off "Infuse" opens the cure form: "Resin mixed", "Finished on" / "at",
    "Shop temperature, °C (optional)", "Which lots went in", "Materials used"
    (`workorders.js:2741-2771`). "Finished on" starts the hold.
- **Proposed**:
  - §7.1 step 3 adds: "Steps from 'Dry stack and bag' to 'Infuse' are signed by
    someone with Resin infusion training in the app."
  - §7.4 step 2: "Write the start and end readings in the note on the work order's
    'Drop test, 1 inHg or less over 10 min' step. It will not sign without the note."
  - §7.5 step 6: "When you sign 'Infuse', set Resin mixed to IN2 + AT30 SLOW (or
    FAST), set Finished on / at to the time you clamped the inlet, and enter the
    shop temperature. That time starts the cure hold."

### E25 · §3 key numbers, SLOW pot life · wrong · medium
- **Current**: "Pot life @25 °C | **SLOW: 120–150 min · FAST: 10–14 min**".
- **Evidence**: IN2 TDS (v1.0, revised 02/05/2025) p.2 table gives 120–150 min /
  10–14 min, but its p.1 text says "'FAST' which has a pot-life of 9-14mins and
  'SLOW' which provides a pot-life of 80-100mins". The datasheet disagrees with itself.
- **Proposed**: "SLOW: 120–150 min in the TDS table, 80–100 min in its text; plan
  on 80–100 min. FAST: 10–14 min (R1)." Same fix in CS-008 §5 (E64) and §7.5 step 2.

### E26 · §7.5 step 1, topping up · missing + process-rule · low
- **Evidence**: IN2 TDS p.2: "you can reduce the chance of the resin 'gelling' in
  the pot by mixing small quantities at a time and topping up the resin jug as the
  resin is drawn into the laminate."
- **Proposed**: add "On a long infusion you may mix in two or more smaller
  batches and top up the pot as it draws down, keeping the inlet submerged (R1)."
  A new "may": **process-rule** (low stakes).

### E27 · §7.2 step 2 and §3 R5, Airtac · missing · medium
- **Current**: "tacking with light Airtac 2 mists only where needed".
- **Evidence**: `airtac2imp.pdf` (Airtac 2 Improved data sheet, updated 2020-03-03):
  "spray distance to the part is minimum 12 in (30 cm)"; "wait at least 10 seconds
  to give solvent the possibility to evaporate". The SDS on file, `airtac2spray.pdf`,
  is a 2005 MSDS for "Airtac 2 Spray Adhesive", the predecessor product
  (20–30% acetone, NFPA fire 4).
- **Proposed**: step 2: "Hold the can at least 30 cm (12 in) from the surface,
  mist lightly only where a ply needs holding, and wait 10 s before placing the
  ply (R5)." R5 row notes the SDS is the 2005 MSDS for the earlier product
  (Round 5 replaces it).

### E28 · §3 R2, FAST hardener SDS · missing · medium
- **Evidence**: the IN2 SDS file holds the IN2 resin and "AT30 Slow Hardener"
  only (trade names at SDS lines 17 and 1114). No AT30 FAST SDS is on file, yet
  §3 and §5 allow FAST.
- **Proposed**: R2 row reads "IN2 resin + AT30 SLOW hardener SDS (AT30 FAST SDS
  not on file)"; add AT30 FAST SDS to the Round 5 fetch list.

### E29 · §5 tacky tape row · wrong · low
- **Current**: "Tacky tape | Sealant/gum tape | Airtech / General Sealants".
- **Evidence**: the restock seed orders it from "Easy Composites", 7-day lead
  (`inventory.js:68-69`). Slack 2026-09-06 (ts 1788721357.386219, Nick): "we were
  also testing out a new gum tape that was terrible so the vacuum was terrible".
  ACP gave "thick gray gumtape" (2026-09-03, ts 1788469031.435479).
- **Proposed**: name the tape that seals and the source the team actually orders
  once Round 5 settles it; until then add "If a new tape will not hold 27 inHg,
  go back to the last one that did and note the brand on the WO."

### E30 · §7.7 Troubleshooting · missing · medium
- **Evidence**: Slack 2026-09-19 (ts 1789851251.991379, Alvin): "Infusion complete
  on the test mold. Air still leaks in from nowhere, but this hasn't been too much
  of an issue anyway." Larry's notes 2026-04-03 (ts 1775277279.331489): "machine
  the edges of molds or sand it down or edge in breather"; "Chamfer the mesh with
  scissors or tape it down to cover sharp edges"; "if air bubbles appear and the
  bag is salvageable, flush it with resin".
- **Proposed** rows:
  - "Leak you cannot find | Air drawn in through the mold itself (unsealed back
    or sides, cracks), or a sharp mold edge or mesh corner piercing the bag |
    Sand or radius sharp mold edges, edge them with breather, chamfer or tape mesh
    corners; check the mold's back and sides are sealed (CS-004)."
  - "Bubbles in the laminate under a sound bag | Air drawn in during the pull |
    If the bag still holds, flush more resin through before clamping (shop
    practice, Larry, 2026-04-03)."
- Also worth a line in the round report: the 2026-09-19 infusion ran with a known
  leak. §7.4 makes the drop test a blocker. Either the leak passed ≤1 inHg / 10 min
  or the rule was bypassed; a lead should check that WO.

### E31 · §9 Records · missing · low
- **Evidence**: the Infuse buy-off records resin, finish time, shop temperature,
  fabric/resin/hardener lots with how they were known (scanned / recalled /
  unknown), and materials used with cost (`workorders.js:2788-2810`, `3035-3107`).
- **Proposed**: "...hardener speed, gauge log, the lots and materials recorded at
  the Infuse buy-off, photos ..."

### E32 · §3, Rohacell · missing · low
- **Evidence**: `03 Datasheets/INDEX.md` lists CS-006 as citing Rohacell IG-F
  ("infusion-safe core"); CS-006 does not cite it.
- **Proposed**: either add R8 Rohacell IG-F TDS/SDS for cored infusions, or the
  INDEX drops CS-006 from that row. Decide with the cores question (PLAN Future work).

### E33 · style · low
- Two em dashes: Reviewer row (line 17) and the empty table cell in §5
  ("Clamp/hose clamp for feed line | — |", line 83). Use "Any" or leave blank.
- §4 bolds a whole sentence mid-definition ("**Full vacuum at sea level ≈ 29.9 inHg; nothing reads "30 psi of vacuum"**"); STYLE §2 bold-for-labels.
- `[PHOTO: …]` ×2 stay.
- Inbound reference `CS-001:91` cites "CS-006 §7.4.3" (step 3 of §7.4). Keep
  §7.4's step numbers; append new steps at the end.

---

## CS-007 Wet Layup & Vacuum Bagging (Rev C)

### E40 · §3 R1, §5, §7.2, §7.6 · wrong · high
- **Current**: R1 = `WEST_SYSTEM_105_Epoxy_Resin_with_206_Slow_Hardener.pdf`
  "(5:1 by volume; pot life 20–25 min @72 °F; thin-film cure 10–15 h)"; §5
  "weight ratios in R1: 5.36:1 for 206".
- **Evidence**: that PDF is the West System International (Romsey, UK) sheet. It
  says "Mix ratio by volume 5 : 1 ... by weight 5 : 1", pot life "20 to 30 minutes"
  at 25 °C, thin-film cure "9 to 12 hours", minimum 16 °C. The numbers CS-007
  quotes (5.36:1 by weight, 20–25 min at 72 °F, 10–15 h) are from the Gougeon
  (US) sheets `west-system_slow-epoxy-hardener_206_tds.pdf` and
  `105_205-207-Combined.pdf`, which `resins.js:80` already cites. The team's cans
  are US stock (R5: "105 big tank, blue label").
- **Proposed**: R1 → `west-system_slow-epoxy-hardener_206_tds.pdf` (Gougeon
  Brothers, 105/206). Drop the UK sheet from CS-007 and CS-008 citations; Round 5
  marks it superseded in INDEX.

### E41 · §2, §3, §5, §7.2 · missing · high (209)
- **Evidence**: CS-008 §5 lists "West 105 + 209 ... Hot-day / very large wet
  layups" and §7 step 1 warns about its 3:1 pumps. CS-007, the wet-layup standard,
  never mentions 209. TDS `105-209-Epoxy-Resin-1.pdf`: 3 parts resin : 1 part
  hardener by volume (300 Mini Pump ratio), 3.68:1 by weight, pot life 40–50 min
  (100 g at 72 °F), thin-film solid 20–24 h, minimum 70 °F (21 °C). FEB hold 36 h
  (`resins.js:91-97`). `materials.js:44-47` was corrected to "3:1 by volume (3.68:1
  by weight)" in `bb5cc0b`, and Paul still says 3:1 by weight until the R7 functions deploy.
- **Proposed**:
  - §3 new R: "West 105/209 TDS (3:1 by volume; 3.68:1 by weight; pot life 40–50 min @72 °F) | `105-209-Epoxy-Resin-1.pdf`".
  - §5: "West 105 + 206 (default), 205 (small parts), or 209 (hot days, large
    layups; needs 70 °F minimum)".
  - §7.2 step 2: "209 uses **3:1 pumps**, not the 5:1 pumps. Check the pump head
    before the first stroke. By scale: 3.68:1 (R-209)."

### E42 · §7.1 or §7.6 · missing · medium (minimum temperatures)
- **Evidence**: US TDSs: 205 minimum 40 °F (4 °C); 206 minimum 60 °F (16 °C); 209 minimum 70 °F (21 °C).
- **Proposed** §7.1 new step 4: "Check the shop is above the hardener's minimum:
  206 60 °F (16 °C), 205 40 °F (4 °C), 209 70 °F (21 °C) (R1, R2, R-209). Below
  it, pick another hardener or wait." Appending keeps numbering.

### E43 · §6 Safety · wrong · high
- **Current**: "Per West SDS + team rules".
- **Evidence**: no West System SDS is in `03 Datasheets/` (`ls`; INDEX.md lists
  TDSs only). PLAN Round 5 Tier 1 already lists West 105/205/206/209 SDS.
- **Proposed**: until Round 5 lands it, "West System SDS: not yet on file (Round 5).
  Treat 105 and its hardeners like every epoxy in CS-008 §6." Once fetched, cite
  it as R6 and state its hazard lines the way E21 does for AT30.

### E44 · §7.5 Drop test vs the app · process-rule · high
- **Current**: "the bag shall lose **≤2 inHg over 10 minutes**. Record start and end readings on the WO."
- **Evidence**: the "Mold wet lay" and "Foam wrapped" techniques have no drop-test
  step (`workorders.js:282-287`): their steps run "Wet layup and bag" →
  "Cure and demould". The infusion techniques have a blocker drop-test step
  (`workorders.js:274,278`). So there is no field for the readings and no gate.
- **Proposed** (Nick picks one):
  - (a) keep the shall and add a blocker step "Drop test, 2 inHg or less over 10 min"
    with `needs: note` to both wet-layup techniques (a lead can do it from Work
    Orders, Techniques; README:849-857). §7.5 step 2 then names that step.
  - (b) keep the shall, and say "Write the readings in the 'Wet layup and bag'
    step notes" with no gate.
  Recommendation: (a), because it matches infusion and the app already supports it.
  **process-rule** either way.

### E45 · §7.6 step 2, hold detail · missing · medium
- **Current**: "Demold no earlier than the **FEB hold** for the system (CS-008 §5; the WO enforces it)."
- **Evidence**: signing "Wet layup and bag" / "Wet layup over core" opens the cure
  form; the next step ("Cure and demould", or "Cure" on Foam wrapped) waits on the
  hold (`workorders.js:283-287`, `2741`). Picking "Something else / not recorded"
  sets no hold (`workorders.js:2783-2786`). Wet-layup steps need "Wet layup" training (`workorders.js:283,286`).
- **Proposed**: "When you sign 'Wet layup and bag', pick the resin you mixed
  (West 105 + 206 slow, 205 fast or 209 extra slow) and the time you finished
  bagging. That starts the hold: 24 h for 206 and 205, 36 h for 209 (CS-008 §5).
  Only a lead can sign the cure step early, and must write why."

### E46 · §7.4 Bag, release film and caul plates · missing + process-rule · medium
- **Evidence**: Slack 2026-09-03 ACP haul (ts 1788469031.435479): "A4000R release
  film (stretchy release film!!)", "Bleeder lease C and E ... like peel ply but
  easier to take off". 2026-09-06 test thread (ts 1788720713.060589): "It released
  like butter but isn't flat"; ripples also under a caul plate; "2d mylar
  technique" gave no ripples on simple curves. 2026-10-08/10 floor closeout and
  G10 test threads (ts 1791478385.435269, 1791598931.301419): a caul plate is cut
  for the floor closeout layup.
- **Proposed**: §7.4 step 4 (appended): "You may replace peel ply with a release
  film (A4000R) or a mylar sheet, or add a caul plate over the peel ply, where the
  work order says so. These are still under test (2026-09); record which on the WO
  and photograph the finish." A new "may": **process-rule**. Do not add numbers;
  none are on record.

### E47 · §2 Scope, cored flat panels · missing · low
- **Evidence**: Slack 2026-09-19 updates (ts 1789850654.253819): Nomex-cored flat
  panels at several densities; 2026-10-10 thread: G10 inserts in Nomex, thickness
  mismatch noted. CS-007's crush rule (§7.5 step 3) covers only foam cores.
- **Proposed**: §2 adds "Honeycomb (Nomex) cores and inserts: follow this
  standard for the skins; core-specific rules are not written yet (see the cores
  candidate in CS-INDEX)." Ties to PLAN Future work.

### E48 · header Status, photos, reviewer · stale + style · low
- **Current**: "Draft, pending Lead signature (photos to add at first SN6 use)".
- **Evidence**: SN6-season wet layups have happened (new members shadowed one on
  2026-09-26, ts 1790358233.320019; flat panels 2026-09-19). Photos are still absent.
  Reviewer row has no date.
- **Proposed**: Status back to the standard wording; keep the two `[PHOTO: …]`
  placeholders and list them in the final report's photos-wanted list.

### E49 · §7.2 step 3 · style · low
- **Current**: "205 halves that (R2)."
- **Proposed**: "205: **9–12 min per 100 g at 72 °F** (R2)." STYLE §2, the number goes in the step.

### E50 · §7.7 Foam-wrapped elements · missing · low
- **Evidence**: #composites 2026-09-30 (ts 1790837965.882759): XPS foam for large
  wings, possibly bonding two machined foam halves; "Foam wrapped" technique steps
  "Shape foam core" (training "Foam core") then "Wet layup over core"
  (`workorders.js:282-285`). #aerodynamics 2026-09-25 (ts 1790363449.626439):
  Nick is writing an "SOP on flat panels, infusion, hollow elements & foam core
  elements" for Aero DR2.
- **Proposed**: name the app steps in §7.7, and flag in the register that Nick's
  DR2 SOP and CS-006/CS-007 should become one document, not two that drift.

---

## CS-008 Resins, Mixing & Cure Schedules (Rev D)

### E60 · §5.1 "The app enforces this" paragraph · wrong + process-rule · high
- **Current**: "The numbers live in one place, `06 Composites App/app/resins.js`,
  and a hold shorter than its datasheet figure is rejected by a test."
- **Evidence**: commit `64f1b31` (2026-08-07) "Cure holds become lead-editable:
  config/resins, guarded at write AND read". `resins.js:45-50, 108-193`: a lead
  opens "Why N hours?" → "Change this hold…" → modal "Change the <resin> hold" with
  "FEB hold (hours)" and "Signed off by" (a roster pick plus a date since `a273b7e`);
  "Revert to the code table" undoes it. The editor refuses a value below the
  datasheet (`resins.js:175`, toast "Not below the datasheet ...") and the app
  ignores an invalid override at read time (`resins.js:126-131`). "The change
  reaches everyone's app immediately" (`resins.js:155`). HANDOFF.md:111-115 has
  the same stale "editing that file and deploying" claim.
- **Proposed** replacement paragraph: "The app enforces this. The table above is
  the code table, signed off 2026-08-01. A lead may change a hold from the app:
  open 'Why N hours?' on a held step, press 'Change this hold…', enter the new
  hours and pick who signed it off. The app refuses a hold below the datasheet
  figure, the change applies to every work order at once, and 'Revert to the code
  table' undoes it. The 'Why N hours?' window always shows the hold in force and
  who signed it. A changed hold is a change to this standard: record it in the
  revision history at the next revision." The last sentence is a
  **process-rule** (it ties an app override back to CS-000 revision control);
  Nick decides whether he wants that or just a note.

### E61 · §5.1 + §7 step 6, what the app does not lock · wrong + process-rule · high
- **Current**: "A work order's demould step stays locked until the FEB hold has elapsed..."
  (reads as covering every row).
- **Evidence**:
  - XCR: no step starts an XCR cure (see E06), so its 12 h hold locks nothing.
  - "Something else / not recorded" in the cure form: "No resin recorded means no
    cure hold on the next step." (`workorders.js:2783-2786`).
  - An unknown resin id gets no hold (`resinHoldHours` returns 0, `resins.js:198-201`;
    `holdState` returns null, `workorders.js:730`).
  - Retro work orders never enforce (`workorders.js:725`).
- **Proposed** §5.1 adds: "What the app does not lock: mold sealing with XCR
  (CS-004 §7.3 says who watches that clock), and any cure recorded as 'Something
  else / not recorded'." §7 step 6 adds: "When you sign the layup or infusion,
  pick the resin you actually mixed. Choose 'Something else / not recorded' only
  for a resin not in §5, and then write the resin in the step notes; its demould
  time is a lead's call." **process-rule** (new shall on recording the resin).

### E62 · §5 table, "Demould (datasheet)" column · wrong · medium
- **Current**: column header "Demould (datasheet)"; West 105+205 cell "6–8 h".
- **Evidence**: West publishes no demould figure (`resins.js:52-55`; the TDSs give
  "Cure to a solid, thin film"). The 206 and 209 cells say "thin-film solid"; the
  205 cell does not. The figure `cs008-holds` is titled "Demould: datasheet figure".
- **Proposed**: header "Datasheet cure figure"; 205 cell "thin-film solid 6–8 h";
  a footnote "West publishes no demould time; the thin-film figure is the nearest."

### E63 · §5 table, Full properties · wrong · medium
- **Current**: West 105+206 and 105+205 "days".
- **Evidence**: US TDSs: 206 and 205 "Cure to working strength 1 to 4 days"; 209
  "Cure to maximum strength 4 to 9 days" (already right in the table).
- **Proposed**: "working strength 1–4 d" for both.

### E64 · §5 table, IN2 SLOW pot life · wrong · medium
- Same TDS conflict as E25. Proposed cell: "120–150 min @25 °C (TDS table; its text says 80–100)".

### E65 · §5 table, more datasheet numbers · missing · low
- **Evidence**: US TDSs: acceptable weight-ratio ranges 206 4.84–6.19:1, 205
  4.83–6.20:1, 209 3.30–4.03:1; minimum temperatures 205 40 °F, 206 60 °F, 209 70 °F.
  IN2 TDS: storage 10–25 °C, 12-month shelf life. XCR TDS: storage 20–25 °C, 12 months.
- **Proposed**: add a "Minimum temp" column (West rows) and a sentence under the
  table: "How exact does the scale need to be? West allows 4.84–6.19:1 for 206 (R3);
  IN2 and XCR give no range, so weigh to 1 g." Storage numbers go to CS-011 with a pointer here.

### E66 · §6 Safety · wrong + process-rule · high
- **Current**: "All epoxies here are **skin/respiratory sensitizers** (R4) ... A-filter respirator for long/enclosed sessions."
- **Evidence**: on-file SDSs: every system H317 (skin sensitizer), none H334.
  AT30 SLOW and XCR hardener are Skin Corr. 1A, H314 and Eye Dam. 1, H318; XCR
  resin H341. AT30 SDS §8 recommends ABEK filters; XCR SDS §8.2 A1 (brown) plus
  "type A, B, E, K, P"; XCR SDS asks for goggles (EN 166).
- **Proposed**: "Every resin here can make you allergic through the skin (H317).
  The hardeners are worse than the resins: AT30 and the XCR hardener burn skin and
  can blind (H314, H318). Gloves (nitrile, EN ISO 374-1), goggles while pouring and
  mixing, ventilation, soap not solvent. Respirator for long or enclosed sessions:
  A1 cartridges cover XCR (R4, XCR SDS §8.2); the AT30 SDS asks for ABEK (R4, AT30
  SDS §8)." The cartridge and goggles parts are **process-rule** (PPE change,
  purchasing knock-on in `inventory.js:72`). Pair with E02, E21, E22.

### E67 · §6 third bullet, blending hardeners · wrong · low
- **Current**: "Blend hardener *speeds* (same total ratio, per R1/R3) instead".
- **Evidence**: the IN2 TDS allows blending FAST and SLOW ("FAST and SLOW hardeners
  can be blended"). None of the West TDSs on file mention blending 205 and 206.
- **Proposed**: "For IN2, blend AT30 FAST and SLOW at the same total 100:30 (R1).
  For West, the TDSs on file say nothing about blending; don't, until a West
  source on file says how." (Or fetch West's user manual in Round 5.)

### E68 · §3 R3/R4 · wrong · medium
- **Current**: R4 "SDS for all of the above | `03 Datasheets/`".
- **Evidence**: no West System SDS and no AT30 FAST SDS on file (E28, E43). R3
  should also not include the UK 105/206 sheet (E40).
- **Proposed**: R4 "IN2 + AT30 SLOW SDS; XCR resin + hardener SDS. West System and
  AT30 FAST SDS: not yet on file (Round 5)."

### E69 · §9 Records + §5.1 · missing · medium
- **Current**: "The resin, the finish time and the shop temperature are captured by the work order..."
- **Evidence**: the same buy-off also asks "Which lots went in" (Fabric, Resin,
  Hardener; pre-filled with the open lot; "I don't know / not recorded" is a valid
  answer, stored as `lotSource` scanned / recalled / partial / unknown) and
  "Materials used — prefilled from the plan, fix any that differ"
  (`workorders.js:3035-3107`, `2973`). A cold shop (temperature below the
  datasheet's reference, 25 °C IN2, 22 °C West, 20 °C XCR) shows "Colder than this
  number assumes, so it will run long. Test the flange, not the clock." but does
  not lengthen the hold (`workorders.js:741-760`).
- **Proposed**: §9 lists lots and materials; §5.1's cold-shop bullet adds "the
  app warns when the recorded temperature is below the datasheet's, and leaves the
  hold unchanged".

### E70 · §7 step 1, expired material · missing + process-rule · low
- **Evidence**: lots carry an expiry and an "Expired" state (`shop.js:58`);
  "Link materials" fills expiry from the 12-month shelf lives of IN2, AT30 and XCR
  (`materials.js:34-59`, `145-212`).
- **Proposed**: "Check the jug's expiry on its label or lot page before you mix.
  Past it, ask a lead before it goes on a part (R1, R2 storage sections)."
  New "should": **process-rule**.

### E71 · §7 or §8, cold storage of 105 · missing · low
- **Evidence**: West TDSs (all three US sheets): "Repeated freeze/thaw cycles
  during storage may cause crystallization of 105 Resin. Warm resin to 125 °F and
  stir to dissolve crystals"; "After a long storage, verify the metering accuracy
  of the pumps. Mix a small test batch".
- **Proposed**: one line in §7: "Cloudy or crystallized 105 after a cold spell:
  warm it to 125 °F and stir until clear (R3). After a long gap, test the pumps
  with a small batch first (R3)."

### E72 · style · low
- §5 heading "THE TABLE (verify each against its TDS before signing)": shouting,
  and this audit has now checked every number (results above). Proposed heading
  "## 5. Equipment & Materials: the resin table".
- §5.1 "Log the temperature per §7.5" points at step 5 of §7, which has no
  heading. Write "§7 step 5" (STYLE §3, the search splits at `###`).
- Reviewer row has no date.
- §7 step 1 "⚠ 209 uses **3:1 pumps**" is correct (TDS) and stays.

### E73 · §5 XCR datasheet figure · wrong · low
- **Current**: XCR "8.5 h initial"; `resins.js:102-103` uses `sheetH: 9`, "initial
  cure 8 h 30 at 20 °C, handleable at about 9 h". Both are in the TDS.
- **Proposed**: cell "initial cure 8 h 30, handleable ~9 h @20 °C" so the
  standard, the app's "Why N hours?" window and the figure say the same thing.

---

## What is right and should not change

- CS-008 ratios, every one checked against the PDFs: IN2:AT30 100:30 by weight;
  XCR 100:41 by weight, 2:1 by volume; West 206 5.36:1 and 205 5.19:1 by weight,
  5:1 by volume; 209 3:1 by volume, 3.68:1 by weight. CS-008 already had 209 right
  before `materials.js` was fixed.
- CS-008 §5.1's account of the holds (shift boundaries, both FAST at 24 h, cold
  shop not covered) and the override rules: lead only, typed reason, event-log
  entry with name and hours short. All match `workorders.js:3156-3193` and
  `3350-3360`. The hold counts from the recorded finish time, as §7 step 6 says.
- CS-006 §7.4: ≥27 inHg and ≤1 inHg / 10 min as a blocker. The app's step title is
  exactly "Drop test, 1 inHg or less over 10 min". Resin trap mandatory, 30–50 mm
  mesh break, 0.5 m travel: all still right, and the figure shows them.
- CS-004 XCR numbers other than E05: pot life 8 min / 4 min (150 g), initial cure
  8 h 30 / 4 h 30, ≥9 h + 120-grit key after tack-free, ≥14 days full properties,
  15–30 °C with ≥20 °C preferred, no water for 24 h, A1 brown cartridges (XCR SDS
  §8.2). The 40 mm flange keep-out matches the label foot "KEEP-OUT 40MM" (`labels.js:435`).
- CS-004 Appendix (Duratec history) and §1 rationale: Simon's decision record, keep.
- CS-007 0.9 mix factor, ≥25 inHg, the crush rule, the breather clearance figure.
- Step numbering referenced from elsewhere: CS-004 §7.3 step 5 (`CS-003:81`,
  `cs003-mold-section.svg:33`), CS-004 §7.5 (`cs001-mold-identity.svg:25`),
  CS-006 §7.4 step 3 (`CS-001:91`), CS-006 §7.3 and §7.7 (CS-007 and printables).
  New steps go at the end of their lists; new sections are appended (§7.8).

## Figures

- `cs008-holds`: titled "Demould" though four rows are not demould figures (E62);
  the XCR datasheet bar is 8.5 h where the app uses 9 h (E73); the footer says
  "The app locks the WO demould step", untrue for XCR (E61); the holds are now the
  code-table values, overridable by a lead, so the figure should say "code table,
  2026-08-01"; the axis stops at 36 h while the SLOW bar runs to 48 h behind an
  arrow; and the caption sentence is drawn inside the art (STYLE §5). Restyle in R3
  with the axis to 48 h.
- `cs004-seal-stack`: "window closes ~2 h 50" misreads the TDS (E05); the
  timeline should show the 12 h FEB hold before the release system goes on (E06).
- `cs006-infusion`: correct. A small gauge inset with "≥27 inHg, ≤1 inHg / 10 min"
  would put the blocker numbers on the picture people look at.
- `cs007-bag-stack`: correct for peel ply / breather / bag. If E46 lands, a
  variant with release film or caul plate in place of peel ply.
- New figure worth drawing for QR-001: one cure-hold card per system (datasheet vs
  FEB hold, pumps 5:1 vs 3:1 drawn as two pump heads). And for QR-008: a hardener
  PPE strip (gloves, goggles, cartridge type) drawn from the SDS lines in E02/E21/E66.

## Notes for other clusters

- `app/docs/printables.html` CS-006 card still prints "Cure / demould: SLOW
  18–24 h" and CS-006 Rev A; the CS-008 card says "CS-008 is Outlined status".
  SESSION-STATE already flags the stale revs; E20's fix needs to reach that card.
- `materials.js:38` IN2 `src` says "stored 20–25°C"; the IN2 TDS says 10–25 °C
  (20–25 °C is XCR's). Cluster G / materials.
- `resins.js:195-197` comment says an unknown resin "falls back to the datasheet
  figure", but `resinHoldHours` returns 0 and no hold is enforced. Code comment, not a standard.
- HANDOFF.md:111-115 still says changing a hold means editing `resins.js` and deploying (E60).
- README:497 and README:1013 cite CS-004 for a board-grade rule CS-004 lacks (E10).
