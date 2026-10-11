# R1 audit, cluster F (finish): CS-009 and CS-010

Auditor: Claude (doc overhaul Round 1, read-only). Date: 2026-10-10.
Scope: `02 CS Standards/src/CS-009.md` (Rev C) and `CS-010.md` (Rev C), their
figures, and everything they claim about the app, the datasheets and shop
practice.

Sources read: STYLE.md, overhaul/PLAN.md, both standards, CS-INDEX, the CS-002 /
CS-003 / CS-004 sections they cite, `app/workorders.js`, `app/projects.js`,
`app/people.js`, `app/reports.js`, `app/materials.js`, `app/inventory.js`,
`app/resins.js`, `app/core.js`, `app/facts.js`, `app/README.md`,
`tools/gen_retro_wos.py`, `app/sn5-work-orders.json`, SESSION-STATE.md,
`git log --since=2026-08-28` (neither standard changed after a8e6660, the
2026-09-02 folder renumber), `03 Datasheets/INDEX.md`, the DP420 TDS
(pdftotext), the SN5 Master Tracker inventory sheet and `Composites Info &
Safety.docx` (for the Lime Line claim only), and Slack #composites,
#aerodynamics, #cooling since 2026-09-01. No Paul chats were read. Slack was
read only.

Traceability lint today: both docs pass, zero em dashes in either.

## Summary

The two standards are mostly sound on the process they were written for (the
catch-can lesson, the sacrificial ply, the diffuser recipe). What has moved:

1. **DP420 numbers are wrong against the TDS on file**, and the INDEX row
   repeats one of them. Handling strength is 2.5 h at 23 °C, not 2 h; the TDS
   has no "full cure 24 h" figure at all.
2. **Bonding failed on the car in SN6 testing** (2026-09-27): a rear wing
   rod-end bond let go on track, an undertray insert had been bonded with
   5-minute epoxy, and an insert was loaded about an hour after bonding. Aero
   wrote its own bonding rule the next day. CS-009 §7.3 says nothing about
   hardware, inserts, load timing, threads or bondline, and is the obvious home.
3. **Clear coat rests on a stale spreadsheet.** "Lime Line, in stock" comes only
   from the SN5 inventory sheet that `03 Datasheets/INDEX.md` says not to trust.
   No TDS or SDS is on file for a two-part acrylic urethane, a product class
   whose hardener normally carries isocyanates, and §6 says nothing about it.
4. **Cutting moved beyond the Dremel**: the RFS composites bandsaw, the
   ShopSabre for flat panels and G10, and the Jacobs OMAX waterjet are all in
   use or booked this term. CS-009 lists a Dremel and "Jacobs" only.
5. **The app grew the pieces the standards point at vaguely**: per-step
   issues with dispositions, a Quality section, a training catalog whose own
   example is "Trimming and finishing / CS-009", and the "Other" technique whose
   first step is CS-010's criterion blocker. The standards still say
   "WO qualityChecks" and "WO field", and §8 of CS-010 names a field that does
   not exist.
6. **Grounding ideas in SN6 Slack drift from the validated method** (copper tape
   wrap "not too far off from how we grounded the diffuser", conductive copper
   paint). CS-010 should say how a new conductive path earns its place.

Counts: 26 findings, 9 of them process-rule (listed together at the end).

---

## CS-009 Trimming, Sanding & Finishing

### F-01 DP420 numbers contradict the TDS (wrong, high)

- **Current** (§5 table, §7.3 step 2): "R1: 2:1, 20 min work life, handling 2 h,
  full cure 24 h @72 °F" and "2:1, 20 min work life, handling at 2 h, full cure
  24 h at 72 °F".
- **Evidence**: `03 Datasheets/3m-scotch-weld-epoxy-adhesive-dp420-black.pdf`
  (V-7, December 2025), page 1: "Mix Ratio by Volume (B:A) 2:1", "Mix Ratio by
  Weight (B:A) 2:0.98", "Open Time 20 min" with the footnote "Max time allowed
  after applying adhesive to a substrate before bond must be closed and fixed",
  "Time to Handling Strength 23 °C (73 °F) 2.5 h". There is no full-cure figure.
  Overlap shear on FRP (epoxy) is reported after a **7 d** dwell (39.3 MPa,
  Acetone/Abrade/Acetone prep); peel is after 24 h at RT. The same PDF has been
  in the repo since 2026-07-12, so the standard never matched it.
  `03 Datasheets/INDEX.md` DP420 row repeats "24 h full cure".
- **Proposed** (§5 row and §7.3 step 2): "3M DP420: 2:1 by volume (B:A; 2:0.98
  by weight). Open time 20 min: close and fix the joint within 20 min of putting
  adhesive on. Handling strength 2.5 h at 23 °C (73 °F). The TDS reports bond
  strength after 7 days at 23 °C (R1)." Fix the INDEX.md row in the same change
  (drop "24 h full cure"). Rename "work life" to "open time" everywhere.

### F-02 120 grit is attributed to the DP420 TDS (wrong, medium)

- **Current** (§4): "Keying: ... 120-grit for DP420 (R1)." §7.3 step 1 repeats
  120 grit.
- **Evidence**: the TDS surface-prep section (page 5) says "Sandblast or abrade
  using clean fine grit abrasives" (steel) and "Abrade using fine grit
  abrasives" (plastics). No grit number anywhere in it. 120 grit is the XCR
  TDS's overcoat key (INDEX.md XCR row) and team habit.
- **Proposed**: "Keying: abrading a bond face so adhesive has something to grip.
  The team uses 120 grit; the DP420 TDS asks only for clean, fine-grit abrasive
  (R1)." (STYLE §2: say which numbers are team values.)

### F-03 Bond prep order and solvent (wrong, medium; acetone part is process-rule)

- **Current** (§7.3 step 1): "Key both faces with 120-grit, then IPA wipe (never
  acetone near tooling board, CS-004 §7.1)."
- **Evidence**: TDS page 5, every substrate it lists runs solvent wipe, abrade,
  solvent wipe again (steel: "acetone, isopropyl or alcohol solvents";
  plastics: IPA / abrade / IPA). Its FRP-epoxy shear data uses
  Acetone/Abrade/Acetone. CS-004 §7.1's acetone ban is about tooling board
  ("it attacks the board"), not cured parts or metal. Aero's rod-end bond study
  plans "keying, acetone & IPA prep, full cure" (Kina Li, #aerodynamics,
  2026-10-05, ts 1791235601.015279).
- **Proposed** §7.3 steps, one action each:
  1. Wipe both faces with IPA to lift oil and release agent.
  2. Abrade both faces with 120 grit until the gloss is gone (team value, F-02).
  3. Wipe again with clean IPA, or acetone on cured laminate and metal parts that
     are away from any mold; let it flash off. No acetone on or near tooling
     board (CS-004 §7.1).
  4. Gloves on from here; do not touch the bond faces.
- **Process-rule flag**: explicitly allowing acetone on cured parts and metal is
  a new "may". Low risk, but Nick should see it.

### F-04 Bonding hardware and inserts is ungoverned, and it failed on the car (missing, high; process-rule)

- **Current**: §2 scope mentions "surface prep for bonding" only. §7.3 is two
  steps about two CF faces. Nothing on inserts, rod ends, threads, 3D-printed
  mounts, bondline, or when a bonded joint may take load.
- **Evidence**:
  - #aerodynamics thread ts 1790574880.619419 (2026-09-27, SN5 testing notes,
    Ramon Avila): the rear wing "CF bonded joint between the carbon fiber insert
    and rod end assembly failed", the wing dropped onto the car; the undertray
    had to come off because a "carbon rod insert debonding with rod end"; the
    notes also say "Let carbon fiber insert cure for about an hour before
    mounting onto the car". DP420 handling strength is 2.5 h (F-01).
  - Same thread: Alvin Liu says one insert was bonded "with 5-minute epoxy so it
    would pass rules", and "We don't follow any recommended practices (cleaning,
    keying, workholding, etc.)"; Kina Li: "IPA + sand down the rod ends. I hit
    some of them with the file". Alvin: "We bond everything with DP420, although
    I think some front wing 3DP are bonded with superglue."
  - #aerodynamics ts 1790615224.181889 (2026-09-28, Kina Li, aero's written
    rule): "We will only be using DP420 for all adhesive situations where we need
    to bond carbon fiber components. We will key/file down both surfaces and
    wipe down with IPA prior to bonding, and clamp while curing as possible."
  - #aerodynamics ts 1791147077.275309 (2026-10-04): DP420 "leaked into the
    threads of one of the RW rod ends and stuck the rod at a set length."
  - Rod-end bond study, ts 1791235601.015279 (2026-10-05 onward): adhesive dams
    inside the tube, grooves, bond gap; the first test insert is drawn with a
    "0.005in bond gap" (Sahil Trivedi, 2026-10-10). DP420 TDS test bondline is
    0.13-0.20 mm (5-8 mil).
- **Proposed**: a new subsection that keeps every existing number stable, e.g.
  **§7.6 Bonding inserts and hardware into CF tube and parts** (the next free
  number; see F-16 for why 7.6 is convenient), plus one line in §2 scope:
  1. Use DP420 for every bond that carries load on the car. (process-rule:
     shall)
  2. Do not use 5-minute epoxy or superglue (CA) on any load-carrying joint.
     (process-rule: shall not)
  3. Prep both faces per §7.3 steps 1-4. On a metal insert, abrade the whole
     bonded length, not a few file strokes.
  4. Mask threads and plug the tube behind the insert (a dam) so adhesive cannot
     reach threads or run down the tube.
  5. Purge a short bead from the DP420 cartridge before fitting the mixing
     nozzle, as the TDS directs (page 4).
  6. Keep the bondline at the gap the drawing calls for. The TDS's test bondline
     is 0.13-0.20 mm (R1); the aero rod-end study is measuring the best gap and
     its result goes here when it lands.
  7. Clamp or fixture the joint so it cannot move until handling strength
     (2.5 h at 23 °C, R1).
  8. Do not load the joint (mount on the car, torque a rod end, drive) before
     [team hold, lead to set]. The TDS reports strength after 7 days. (process-
     rule: a new hold; Nick sets the number. The app's step rule
     `{ kind: "hold", hours: N }` exists in code, `workorders.js` around line
     246, but no template uses it and the technique editor does not offer it,
     so the standard must not claim the app enforces it.)
  9. Record on the WO step note: adhesive and lot, prep done, time bonded, time
     first loaded.
- Severity high: a bonded joint failed at speed and dropped a wing, and the
  next bonds are being made now.

### F-05 DP420 dispensing and storage are missing (missing, low)

- **Evidence**: TDS page 4: duo-pak cartridges in the EPX applicator; purge to
  confirm both sides flow; attach the mixing nozzle. Page 5: store 16-27 °C
  (60-80 °F), 40-60% RH, use within 24 months from date of manufacture.
  `materials.js:77-78` has the DP420 TDS link but no shelf life and no SDS.
- **Proposed**: add both to §5 (or a §7.3 step for the purge, covered in F-04
  step 5). Note for the materials owner (cluster G / R5): `shelfLifeMonths: 24`
  with `src` citing the TDS is now possible.

### F-06 Clear coat: "in stock" is unsourced and the isocyanate hazard is absent (wrong, high; process-rule)

- **Current** (§5): "Clear coat | Acrylic Urethane A/B (Lime Line, in stock) |
  §7.4; encapsulates the part label (CS-001 §7.5)". §6 has nothing on it.
  §7.4: "coat per product instructions".
- **Evidence**:
  - The only trace of Lime Line anywhere is the SN5 Master Tracker inventory
    sheet: "Acrylic Urethane Clearcoat (A) Lime Line 1 gallon / Acrylic Urethane
    Clearcoat (B) 1 quart". `03 Datasheets/INDEX.md` line 3: "the Master Tracker
    Inventory sheet is stale, do not trust it over these".
  - Not in `materials.js`, not in `RESTOCK_SEED` (`inventory.js:52-81`), no TDS
    or SDS in `03 Datasheets/`. No Slack mention of Lime Line ever; "clearcoat"
    last appears 2026-05-20 (#aerodynamics, "clearcoat/seal towbar"). PLAN.md
    Round 5 Tier 1 already lists "Lime Line acrylic urethane clear TDS+SDS
    (isocyanate)".
  - Two-part acrylic urethane clears normally cure with a polyisocyanate
    hardener, a respiratory and skin sensitizer. The shop's respirator
    cartridges are "A + P100" (`inventory.js:77`); whether that is acceptable
    for this product, and whether it may be sprayed at all, is the SDS's call,
    and the SDS is not here.
- **Proposed**:
  - §5 row: "Clear coat | Lime Line acrylic urethane, part A + part B | Stock
    unverified (only source is the SN5 inventory sheet). TDS and SDS not on
    file."
  - §6 new bullet: "Two-part urethane clear coat: the hardener is expected to
    contain isocyanates, which sensitize the lungs and skin. Its SDS is not on
    file. Until it is, nobody opens, mixes or applies it."
  - §7.4 step 1 (new, process-rule): "Do not open or mix the clear coat until its
    SDS is in `03 Datasheets/` and this section quotes its PPE and ventilation
    requirements." (process-rule: shall, Simon/Nick review.)
  - Optional second process-rule for the lead: "The team does not spray two-part
    urethane." Recommend asking Nick whether anyone sprays it; Slack does not say.
  - When the SDS arrives (R5), §6 is rewritten from it, not from this audit.
- Coordination: CS-001 §7.5 step 4 has label B encapsulated by the clear coat.
  If clear coat is on hold, CS-001 needs a line on what protects label B
  meanwhile (cluster B).

### F-07 §7.4 has no numbers (style, medium)

- **Current**: "coat per product instructions and record coats on the WO."
- **Evidence**: STYLE.md §2 "The number goes in the step ... If the number is in
  a datasheet, restate it and cite the datasheet." There is no datasheet to
  cite.
- **Proposed**: after F-06's gate, one step each for mix ratio, pot life, recoat
  window and cure before handling, each marked "[from the Lime Line TDS, not yet
  on file]" until R5 delivers it. Record coats in the "Trim and finish" step
  note (F-12).

### F-08 PPE does not match the respirator the shop stocks, and the "PPE table" another standard cites does not exist (wrong, medium; process-rule on the minimum)

- **Current** (§6): "respirator (P100/dust) + dust extraction ON ... long
  sleeves; gloves".
- **Evidence**:
  - The shop's respirator consumable is "Respirator cartridges (A + P100)",
    marked "Safety-blocking: no cartridges, no layup." (`inventory.js:77-78`).
  - CS-003 §6 cites "respirator + extraction for power sanding (CS-009 PPE
    table)". CS-009 has no table.
  - `app/facts.js:30` (a tip Paul and the app can surface) says "Cutting or
    sanding cured carbon needs a dust mask or respirator". Simon's SN5 primer
    (`Composites Info & Safety.docx`) says the same. CS-009 says respirator.
    These disagree on the minimum.
  - No SDS on file for any chemical CS-009 uses: DP420, IPA, acetone, Lime Line,
    West 404 (INDEX.md; PLAN.md R5 Tier 1). The DP420 TDS (page 1) identifies an
    amine accelerator and epoxy base, and page 5 says to extinguish ignition
    sources when using solvents.
  - G10 (glass-epoxy) is now being cut and sanded ("we wanded the G10 faces
    slightly", Simon, #composites 2026-10-10, ts 1791680440.315469).
- **Proposed**: §6 becomes a PPE-by-task table (which also makes CS-003's
  reference true):

  | Task | Lungs | Hands / body | Eyes | Also |
  |---|---|---|---|---|
  | Cutting, sanding, machining cured CF or G10 | Team respirator, P100 filters (the A + P100 set) | Gloves, long sleeves | Safety glasses | Extractor running; second trained person (§6 rule) |
  | Solvent wipe (IPA, acetone) | Ventilation | Nitrile gloves | Glasses | No ignition sources (R1 note); glove chart pending (R5) |
  | Mixing and applying DP420 | Ventilation | Nitrile gloves (amine epoxy, treat as a sensitizer like CS-004 §6) | Glasses | SDS pending (R5) |
  | Clear coat | Blocked until SDS (F-06) | | | |

- **Process-rule flag**: confirm the minimum for cutting and sanding is a
  respirator with P100, not "dust mask or respirator". If Nick agrees, the
  `facts.js:30` tip should be aligned (cluster H / app change, not this doc).
  Simon's primer keeps its own wording.

### F-09 Cutting tools: bandsaw, ShopSabre and the OMAX waterjet are missing (missing, medium)

- **Current**: §2 "Waterjet/CNC cutting of flat panels included at outline
  level." §5: Dremel with reinforced wheels; "Waterjet | Jacobs, DXF through the
  WO". §7.5 "Waterjet flat panels".
- **Evidence**:
  - RFS composites bandsaw, with its own training: "Do you have composites
    bandsaw training?" / "I think I have it certified"; G10 cut on it because
    "that's what Larry recommended" (#composites 10/10 thread, ts
    1791598931.301419).
  - ShopSabre for cured flat panels: "potentially cutting flat panels on shop
    sabre" (Simon, 2026-09-25, ts 1790358975.434619); machining G10 inserts and
    "carbon test pieces" on the ShopSabre with RFS staff (Larry) wanting to
    oversee G10 (thread ts 1791478385.435269).
  - Waterjet is the Jacobs Hall OMAX: "OMAX waterjet is particularly important
    for us, try to get a slot soon!" (Nick, ts 1790723151.348059); the thread
    adds that metal shop is not a prerequisite and the online quiz comes before
    the hands-on training. Ansh: waterjet is "the only one in makerspace we can
    cut 2d carbon fiber panels on" (ts 1790207078.799249). Booking is the Jacobs
    water-jet reservation page (Kina, #aerodynamics, 2026-09-27).
- **Proposed**:
  - §2: "Cured CF, glass and G10 parts and panels ... Flat-panel cutting by
    waterjet, ShopSabre or bandsaw is in scope."
  - §5 rows: "Bandsaw | RFS composites bandsaw | RFS training required; straight
    cuts in panels and G10"; "CNC router | RFS ShopSabre | CS-005 governs the
    machine; extraction on; ask RFS staff before machining G10"; "Waterjet |
    Jacobs Hall OMAX | Jacobs waterjet training (online quiz, then hands-on);
    book a slot on the Jacobs reservation page".
  - §7.5 retitled "Cutting flat panels: waterjet, ShopSabre or bandsaw", keeping
    the DXF-through-the-WO and confirm-revision steps and adding the dust rules
    of §6 for the ShopSabre and bandsaw.
  - Leave the Dremel as the tool for trimming molded parts (§7.1), which matches
    the diffuser record ("parts dremeled", WO-SN5-006 timeline).

### F-10 "stop, record it, assess against the WO qualityChecks" predates issues and dispositions (missing, medium)

- **Current** (§7.2 step 1): "Exposed structural weave past the plan: stop,
  record it, assess against the WO qualityChecks."
- **Evidence**: every step carries a ⚑ button titled "Report an issue on this
  step" (`workorders.js:2410`), whose modal is "Report an issue" with Title,
  What happened, Photos of the defect (`workorders.js:2662-2674`). The run
  cannot complete until each issue has a Disposition from "UAI (Use As Is)",
  "Corrective Action", "Rework", "Scrap", "Other" (`projects.js:18`) and both
  "What happened" and "What was done" are filled (`workorders.js:2229-2240`;
  app README "Issues").
- **Proposed**: "Exposed structural weave past the plan: stop sanding. On the
  'Trim and finish' step press ⚑ (Report an issue on this step), photograph the
  spot, and leave the disposition to the part's engineer or the lead. The run
  cannot complete until the issue is disposed." Same pattern for §7.3 (a
  starved bond fillet) and CS-010 §7.4.

### F-11 App names are paraphrased (style, medium)

- **Current**: "the WO's demould step gates this" (§7.1); "WO qualityChecks"
  (§7.2, §8); "Trim/sand/bond/coat steps on the WO with operator + date" (§9);
  "record coats on the WO" (§7.4).
- **Evidence**:
  - The hold step is titled "Cure and demould" (Mold infusion, Glass infusion,
    Mold wet lay) or "Cure" (Foam wrapped) (`workorders.js:271-290`).
  - The finishing step is a single "Trim and finish" step (Mold infusion, Mold
    wet lay, Foam wrapped). Glass infusion has "Cut to DXF, confirm revision"
    then "Finish". There are no separate sand, bond or coat steps.
  - The Quality section heading is "Quality checks / acceptance criteria", with
    columns "Criterion", "Target (set at creation!)", "Actual", "Pass"
    (`workorders.js:2336-2338`; section label "Quality", line 1394).
  - Photos: "Add photos to this step"; sign-off button "buy off as <your name>"
    (`workorders.js:2089`).
  - `qualityChecks` is a database field name, not something a member sees.
- **Proposed**: use those labels verbatim. §9: "Record trimming, sanding,
  bonding and coating in the note of the 'Trim and finish' step (or 'Finish' on
  a glass-infusion run), add photos with 'Add photos to this step', and buy off
  the step. Measured checks go in the Quality section."

### F-12 "Second trained person": trained in what? (missing, medium; process-rule)

- **Current** (§6): "Supervision rule (SN5, stands until the lead changes it):
  no cutting cured carbon without a second trained person present."
- **Evidence**: the built-in trainings are Mold design, ShopSabre CNC, Wet
  layup, Resin infusion, Foam core, Forged carbon fiber (`workorders.js:18-25`);
  none covers trimming. The People tab's Catalog (lead only) adds trainings, and
  its own example is "e.g. Trimming and finishing" with CS standard "CS-009"
  (`people.js:517-521`). A lead can gate the "Trim and finish" step on a training
  from Reports → Layup techniques → Edit steps (`reports.js:409-420`). Today the
  step has no training rule. The SN6 lead is Nick Jepsen; nothing in Slack since
  2026-09-01 changes the supervision rule.
- **Proposed**: keep the rule; define "trained" as "holds the Trimming and
  finishing training in the app"; add one sentence that the lead adds that
  training in People → Catalog and may gate the "Trim and finish" step with it.
  Replace "(SN5, stands until the lead changes it)" with "(set in SN5; the
  Composites Lead may change it)".
- **Process-rule flag**: defining "trained" and gating the step are rule
  changes for Nick.

### F-13 West 404 filler is in the shop and absent from the standard (missing, low; process-rule)

- **Evidence**: `materials.js:92` "West System 404 high-density filler" (alias
  only, no datasheet); SN5 inventory sheet "404 High Density Adhesive Filler
  West System 43 oz"; PLAN.md R5 Tier 1 wants its TDS+SDS. Aero's rule says
  DP420 for all CF bonds (F-04).
- **Proposed**: one §5 row: "Thickened epoxy | West 105/206 + 404 | For fillets
  and gap filling only, not for load-carrying bonds unless the lead approves.
  TDS/SDS pending (R5)." Process-rule: the lead decides whether 404 is ever a
  structural adhesive here.

### F-14 "CS-002 §7.1.3" names a heading that does not exist (wrong, low)

- **Current** (§4, and in figure cs009): "(CS-002 §7.1.3)".
- **Evidence**: CS-002 has `### 7.1 Specify` with numbered steps; the sacrificial
  ply is step 3 (CS-002.md:70). STYLE §3: headings go no deeper than `###`. The
  lint passes only because it matches the §7.1 prefix.
- **Proposed**: "CS-002 §7.1, step 3".

### F-15 Unsourced tolerance and decorative bold (style, low)

- §8 "Trim to scribe | ±1 mm of line": no source. STYLE §2: say "team value"
  if that is all there is.
- Bold used for emphasis mid-step: §7.2 steps 1-2 ("**Read the WO stack before
  sanding anything.**", "**hand-sand only, count strokes, check often.**"),
  §7.5 "**through the WO**". Unbold. §6's supervision rule and the CF-dust lead
  are rule labels; keep those (CS-000 bolds rules).

### F-16 Retro work orders cite "CS-009 §7.6", which does not exist (wrong, low)

- **Evidence**: 7 step titles in `app/sn5-work-orders.json` and
  `tools/gen_retro_wos.py:140` read "Cut to DXF (CS-009 §7.6, confirm rev)".
  CS-009's waterjet section is §7.5. `stripCS` hides it on screen, but the raw
  string is in the data.
- **Proposed**: no renumber. If F-04 adds §7.6 for inserts, these titles would
  then point at the wrong section, so fix the generator and the JSON to §7.5 in
  the same change (not a standard edit). Record in the register.

### F-17 Drilling and cutouts are not covered (missing, low)

- **Evidence**: SN5 seat feedback, Mads Brown, #composites 2026-09-28 (ts
  1790610889.634989): "one of the bolts on the side went thru the seat (maybe
  just need large washer). also the part above the cutout has cracked".
- **Proposed**: a scope line or a placeholder subsection "Drilling holes and
  cutting openings [lead input needed]". No numbers until a lead or a test
  supplies them.

### F-18 Coatings for scanning (missing, low)

- **Evidence**: Nico Ortiz wants to scan pieces "with and without clear coat"
  (#composites 2026-08-29); Nick's action items ask Jeremy to test "if we need
  matte coatings to improve scanning" (ts 1790837965.882759).
- **Proposed**: one scope sentence that temporary scanning sprays or powders are
  outside CS-009, or a line under §7.4 once the metrology study decides. Low.

---

## CS-010 CF Grounding & Electrical Bonding

### G-01 The reference record is loaded, and it is a summary, not a table (stale, medium)

- **Current** (§9): "The diffuser's <1 Ω table is the reference example once
  WO-SN5 retro-records are loaded."
- **Evidence**: the 26 retro work orders are loaded (lint: "retro WO count ==
  26"). WO-SN5-006 "UT DIFFUSER" carries one Quality row: criterion "grounding
  resistance", target "<5 Ω every probe point", actual "<1 Ω continuous
  everywhere (2026-06-21)", pass. There is no per-point table, which is exactly
  what §9 says a record must hold ("values, not 'pass'"). The catch can is
  WO-SN5-026 (~40 Ω via CF wrap).
- **Proposed**: "WO-SN5-006 (UT diffuser) is the reference part: target set up
  front, method recorded, <1 Ω at comp (2026-06-21). Its record holds the
  summary only; the first SN6 grounded part is the first full probe table.
  WO-SN5-026 (catch can) is the counter-example." Add both as references in §3.

### G-02 §8 names a WO field that does not exist; the criterion blocker exists only in the "Other" technique (wrong, medium; process-rule option)

- **Current** (§8): "Criterion written before work | ... | WO blocker step";
  "Decision point answered | CF-mesh vs alternative path, with one-line why |
  WO field".
- **Evidence**: no decision-point field anywhere in `workorders.js`. The "Other"
  technique's first step is "Define acceptance criterion: target and method,
  set before work starts", a blocker that needs a note (`workorders.js:291`).
  A grounded part built as "Mold infusion" (the diffuser) gets no such step: its
  first blocker is "Stack frozen". The Quality table's target column is labelled
  "Target (set at creation!)".
- **Proposed** §8 rows:
  - "Criterion written before work | Ω target, probe pattern, method | A Quality
    row 'grounding resistance' with the Target filled when the run is created;
    on an 'Other' run, the note on 'Define acceptance criterion' | WO".
  - "Decision point answered | mesh in the stack, or a surface path, with a
    one-line why | Note on 'Stack frozen' (or on 'Define acceptance criterion'
    for a retrofit) | WO".
  - §7.1 step 1: "A retrofit or cross-team grounding job is created with the
    'Other' technique, so the criterion step blocks everything after it."
- **Process-rule option**: a lead could add a "Grounded mold infusion" technique
  with the criterion step as a blocker (Reports → Layup techniques). Nick
  decides; do not write it as existing.

### G-03 SN6 is reaching for copper tape and copper paint; the standard should say how a new path earns its place (missing, medium)

- **Current**: §7.1 lists mesh in the stack (good fit) and "epoxy + copper
  strip/braid paths" (bad-fit fallback). §7.4 lists strip bridges and ground
  tabs.
- **Evidence**:
  - #cooling thread ts 1789947047.163069 (2026-09-20): cooling is asking about
    "carbon fiber grounding w/ catch can" again. Nick: "Is the current catch can
    wrapped in copper tape for grounding? if so we can probably just wrap the
    carbon in copper tape as well, thats not too far off from how we grounded
    the diffuser" (ts 1789966817.624499). The diffuser was mesh in the stack
    (WO-SN5-006, §7.2), not a tape wrap, and the catch can is §7.1's named bad
    fit.
  - #brakes-ergonomics 2026-09-20: aluminum cable ties and copper tape listed as
    grounding materials.
  - #composites ts 1791231472.229019 (2026-10-05): copper conductive paint
    proposed as "a lighter alternative to the mesh"; Kina: "for the UT the copper
    mesh is heavy"; Simon: a non-permeable copper layer "won't let resin air
    through if it's in the layup", painting it on after cure is fine
    (ts 1791248106.544919).
- **Proposed**:
  - §7.1: add a third branch, "Surface paths: copper strip or braid bonded with
    epoxy, copper tape, conductive paint. Applied after cure. A surface path
    that has not been proven on this team is proven on a first article by §7.3
    before any part depends on it." Add mass as a decision factor (mesh is heavy
    on large parts).
  - §7.2 step 1: "Only permeable mesh goes in an infused stack. Foil, solid sheet
    or a painted film blocks resin flow."
  - Keep the catch-can wording; it is about to be tested again.

### G-04 Who asks, and the distance rule people are quoting (missing, low)

- **Evidence**: #cooling 2026-10-09 (Min Jacob Gon Kim): fittings and sensors
  "within 100 mm range set by the grounding rules" of the motor or inverter;
  Aakash: UC Davis "got flagged for having metal fittings next to motor".
- **Proposed**: in §2, one line: "Requests come from other subteams (cooling,
  brakes, aero). Each request arrives as a work order with the 'Other' technique
  (G-02)." Do not quote the 100 mm rule as fact; it stays the rules owner's
  number, which §2 already says.

### G-05 §6 omits graphite powder and mesh handling (missing, low; process-rule)

- **Current** (§6): "Bench measurements on loose parts: no special hazards
  beyond CS-009 dust rules if sanding contact points."
- **Evidence**: §5 and §7.2 step 4 allow graphite powder at 1-5 wt% in resin;
  no graphite SDS on file. Cut copper mesh leaves sharp wire ends.
- **Proposed**: "Weighing and mixing graphite powder: respirator with P100 and
  nitrile gloves; SDS to be filed (R5). Cut copper mesh: gloves." Mark as
  process-rule (new PPE requirement) for Nick.

### G-06 Where the probe table goes in the app (missing, low)

- **Current** (§7.3 step 3): "Record each value minus lead offset." §8: "WO
  qualityChecks (full table of readings)".
- **Evidence**: a Quality row holds one Actual string. Step notes are rich text
  and can hold a table (`rte.js:66` `tableHtml`). Failures belong in an issue
  (F-10).
- **Proposed**: "Record the full probe table as a table in the measuring step's
  note, and the worst reading as the Actual on the 'grounding resistance'
  Quality row. A point over target is an issue on that step (⚑), disposed per
  §7.4."

### G-07 Copper mesh is unspecified, and the stack view only tags it by name (missing, low)

- **Evidence**: §5 "Fine woven mesh (repeat team buy) | Amazon". The retro BOM
  says "Amazon ($27.55, Budget sheet)" (`gen_retro_wos.py:198`). PLAN.md R5 Tier
  2 lists "copper mesh spec". The stack bar tags a ply "Mesh" only if its
  material name contains "mesh" or "copper" (`core.js:2053`).
- **Proposed**: add wire size and opening when the spec is found; until then say
  "spec not recorded". In §7.2 step 1: "Name the ply 'copper mesh' in the
  stack."

### G-08 Decorative bold (style, low)

- CS-010 has 23 bold spans. §1 bolds "diffuser", "catch can" and the Ω values
  mid-sentence; §7.1-§7.4 bold sentences for emphasis. Keep "Good fit:" /
  "Bad fit:" and the §4 terms as labels; unbold the rest (STYLE §2).

---

## Process-rule changes (need human visibility)

| ID | Doc § | Change | Who decides |
|---|---|---|---|
| F-03 | CS-009 §7.3 | Acetone **may** be used on cured laminate and metal away from molds | Nick |
| F-04a | CS-009 new §7.6 | DP420 **shall** be used for every load-carrying bond on the car | Nick (aero already does this, 2026-09-28) |
| F-04b | CS-009 new §7.6 | 5-minute epoxy and CA **shall not** be used on load-carrying joints | Nick |
| F-04c | CS-009 new §7.6 | A bonded joint **shall not** be loaded before a team hold (number to set; TDS handling is 2.5 h, strength data at 7 d) | Nick, Simon |
| F-06 | CS-009 §6, §7.4 | Clear coat **shall not** be opened or mixed until its SDS is on file; optional "no spraying two-part urethane" | Simon, Nick |
| F-08 | CS-009 §6 | Minimum for cutting/sanding is a respirator with P100, not "dust mask or respirator" | Nick |
| F-12 | CS-009 §6 | "Trained" = holds the app's Trimming and finishing training; lead may gate the step | Nick |
| F-13 | CS-009 §5 | West 404 thickened epoxy not a structural adhesive without lead approval | Nick |
| G-05 | CS-010 §6 | PPE for graphite powder and cut mesh | Nick |

G-02's "Grounded mold infusion" technique is an option for the lead, not a
proposed rule.

## Keep (still right, do not change)

- CS-009 §4 and §7.2: the sacrificial ply is the sanding budget; zones under 3
  plies are hand-sanded only. The catch-can puncture (2026-05-27) is the
  reason, and Figure 1 makes the case.
- CS-009 §7.1: trim after the FEB hold; tape the cut path; cut outside the line
  and sand to it.
- CS-009 §7.5: the DXF comes through the WO, never a DM; confirm revision. The
  Glass infusion technique's "Cut to DXF, confirm revision" step agrees.
- CS-009 §6: the supervision rule and the extractor-on rule (wording tweak only,
  F-12).
- CS-010 §7.1: decide the conductive path and write the criterion before work.
  SN6 cooling is asking about a CF catch can again, so this is live.
- CS-010 §7.2-§7.4: 25 mm mesh overlap; terminable tail protected during
  infusion; zero the leads; hardware torqued as it will fly; 100 mm grid plus
  edge midpoints; every point passes; never sand thin laminate chasing contact;
  re-measure the full pattern after a fix.
- CS-010 §2 and §6: the rules owner sets the Ω target; ESO confirms HV
  isolation before measuring on the car.

## Figures

- `cs009-sacrificial.svg`: the footer says "Edge finish ... (§7.3)"; edge finish
  is §7.2 step 3 (§7.3 is bond prep). It also cites "CS-002 §7.1.3" (F-14).
  Labels are font-size 10.5-14 in an 880-wide viewBox, about 5.6-7.5 pt at
  6.5 in print width, under STYLE §5's ~9 pt floor (needs about 19 units at this
  width). Helvetica, not Saira/Inter. The title line inside the art repeats the
  caption's job. "weave = stop, record, assess" could read "stop, report an
  issue on the step" (F-10).
- `cs010-mesh-path.svg`: same type-size and font problems (10.5-14 units, 880
  wide). The in-art title cites §7.2 and §7.3, fine, but duplicates the caption.
  Check in the grayscale sheet that the edge-midpoint probe points the caption
  promises are drawn and distinct from the 100 mm grid points.
- New figure worth drawing for CS-009 §7.6 (F-04): a section through a CF tube
  with a bonded insert, showing the prep sequence, the bondline gap (TDS test
  bondline 0.13-0.20 mm), the dam inside the tube, masked threads, and the
  "no load before the hold" clock. This is the joint that failed in September.
- New figure candidate for CS-010 §7.1 (G-03): a decision tree, mesh in the
  stack vs surface path vs no CF, with the questions that drive it (geometry,
  permeability in an infusion, mass, where the grounding point is).

## Quick-reference candidates for Round 4

- "Bonding with DP420" (parent CS-009 §7.3 / new §7.6): ratio, open time,
  handling time, the load hold, prep order, threads and dams. Also called:
  DP420, epoxy glue, structural adhesive, rod end bonding, insert bonding.
- "Grounding a part: the probe method" (parent CS-010 §7.3): zero leads,
  torque, grid, every point passes, where to record. Also called: ground test,
  resistance check, ohms, continuity.
- Feed the CS-009 §6 PPE table into QR-008.

## Notes for other clusters

- Cluster B (CS-001 §7.5): label B's encapsulation depends on a clear coat that
  F-06 puts on hold.
- Cluster D (CS-003 §6): cites a "CS-009 PPE table"; F-08 creates it.
- Cluster G / R5: DP420 shelf life (24 months, TDS) can go into `materials.js`;
  Lime Line, West 404, DP420, IPA, acetone and graphite SDSs are all missing;
  `03 Datasheets/INDEX.md` DP420 row says "24 h full cure", which the TDS does
  not.
- Cluster H: `facts.js:30` says "dust mask or respirator", which a member can
  read as weaker than CS-009 §6.
