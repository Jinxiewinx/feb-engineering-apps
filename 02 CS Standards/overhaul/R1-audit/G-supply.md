# R1 audit, cluster G: supply (CS-011, CS-012, CS-014 scope)

Auditor: Claude (doc overhaul Round 1, read-only). Date: 2026-10-10.
Baseline: CS-011 Rev D (2026-08-28), CS-012 Rev F (2026-08-29), app v6.8.0
(`83e2c58`), functions as in `06 Composites App/functions/index.js`.

Sources read: STYLE.md, overhaul/PLAN.md, CS-011, CS-012, CS-001, CS-013 §4.1
and §7.2, CS-INDEX, app `inventory.js`, `receiving.js`, `budget.js`,
`shop.js`, `materials.js`, `ehsimport.js`, `scan.js`, `workorders.js` (lot
capture and "Log material used"), `core.js` (AI switch), `labels.js`,
`functions/index.js` (parseReceipt, parsePackingSlip, readContainerLabel,
caps and ceiling), `firestore.rules`, app README (Budget, Inventory,
Receiving, Running out, Getting the data back out, Scanning, Which lots went
in, Labels), DESIGN-NOTES (config docs, receipt parser, roll printer),
SESSION-STATE, HANDOFF, CHANGELOG, `git log --since=2026-08-28`,
`03 Datasheets/INDEX.md` and the IN2/AT30, XCR, West and Airtac SDS/TDS
text via pdftotext.

Slack (read only, nothing sent): #composites C092PTYH9V0 read in full from
2026-09-01; #purchasing C02L1E6EXTP and #purchasing-slackbot C0C3QJRUPGA
searched and read; #aerodynamics C02R91J5HU2, #mech, #general searched.

Every app label quoted below was copied from the code at the cited line.

---

## Headline

1. **CS-012 describes a purchasing channel that no longer exists.**
   #purchasing was retired on 2026-10-07 for #purchasing-slackbot and the
   Flux bot (`/purchase`, `/bigorder`, `/reference`, `/reimburse`, budget
   reference IDs such as `COMP-011`). §7.1, §7.2, §8 and §9 all name the old
   channel, and so do three strings in the app.
2. **CS-012 §7.8 asks the team to buy the wrong label printer.** It requests
   a Brother PT-D610BT with 24 mm TZe tape. The app was built for a Brother
   QL on DK-2210 roll stock over AirPrint (commit `c62df0b`, 2026-08-28), and
   DESIGN-NOTES records that 24 mm laminated tape was rejected because its
   18 mm print height cannot fit the 21.4 mm label.
3. **CS-011 §6 still forbids resin/hardener co-storage while the app and the
   shop do it.** The warning was removed from the code on 2026-08-28 "pending
   Simon's Rev D", but Rev D shipped the same day with "No rule changed".
   Proposal below, marked for Simon's review.
4. **CS-011 §5's minimums and the app's `RESTOCK_SEED` disagree** on XCR (1
   kit vs 2), West (½ tank + 1 can vs 1 tank + 1 can), and 195 twill (10 yd
   vs 1 roll). The app says its seed is "CS-011 §5's table, verbatim". One of
   them has to move.
5. **Nothing in the series governs receiving, lots, expiry, EH&S tags or the
   AI reads.** All of it shipped between 2026-08-04 and 2026-10-09. CS-014
   should own it; an outline is at the end.

---

## Findings: CS-011 Inventory, Storage & Transport

### G-01 §6 co-storage of resin and hardener (process-rule, Simon reviews)

- **Current (§6):** "segregate hardeners from resins on different shelves."
- **Evidence:**
  - `app/inventory.js:387-393`: "There is deliberately NO resin+hardener
    co-location warning here any more. The team stores them together (lead
    decision, Simon, 2026-08-28) — the imported EH&S inventory has both in
    the one flammables cabinet, which is where campus EH&S itself filed them.
    CS-011 §6 still says 'separate shelves' pending Simon's Rev D".
  - `app/receiving.js:896-897` (same decision, receiving confirm).
  - App README, Inventory: "Resin and hardener sharing a shelf is
    deliberately not a warning: the team stores them together, matching the
    campus EH&S filing."
  - SESSION-STATE "Constraints": "CS-011 §6 still forbids resin and hardener
    co-storage on purpose ... Simon revises the standard himself".
  - CS-011 Rev D history row (2026-08-28): "No rule changed." So the Rev D
    the code waits for never carried the change.
  - Counter-evidence for Simon to weigh: the IN2 resin SDS §7.2 "Advice on
    common storage" reads "Keep away from oxidizing agents, strongly acid or
    alkaline materials and amines" (`EC-SDS-IN2-Epoxy-Infusion-Resin-and-Hardener.pdf`,
    p.5). AT30 is an amine hardener (3-aminomethyl-3,5,5-trimethylcyclohexylamine,
    30 to 50%, same PDF, AT30 section 3). The AT30 section 7.2 adds "do not
    store in heat or direct sunlight" and "Protect from moisture". The XCR
    SDS §7.2 says "No data available" for incompatibilities and lists only
    strong oxidisers in §10.5.
- **Proposed (draft only, goes to `overhaul/proposals/CS-011-s6.md`, not into
  the CS-011 draft):** "Resin and hardener may share a cabinet, matching the
  campus EH&S filing, in their original sealed containers with lids tight.
  Keep each system's resin and hardener in its own secondary tray or bin on
  that shelf so a leak from one cannot reach the other. Never store an open
  or decanted container next to its partner." The tray clause is the
  compromise between the IN2 SDS line and the team's practice; drop it if
  Simon reads the SDS line as advice for bulk storage only.
- **Severity:** high. Paul quotes §6 as the rule while every shelf breaks it.

### G-02 §5 minimums disagree with the app's restock seed (process-rule)

- **Current (§5 table):** "IN2 resin + AT30 | 1 unopened kit (+ the opened
  one)"; "West 105 + 206 | ½ tank + 1 can"; "XCR | 1 kit"; "195 twill cloth |
  (sponsor) 10 yd".
- **Evidence:** `app/inventory.js:51-81` `RESTOCK_SEED`, whose comment at
  :42 says "The seed is CS-011 §5's table, verbatim":
  - IN2 `minCount: 2, unit: "kit"` and a separate AT30 rule, also 2 kits
    (matches §5 in substance: "opened kit + 1 unopened" expressed as two
    containers, explained at :146-153).
  - WEST-105 `minCount: 1, unit: "tank"` and WEST-206 `minCount: 1, unit:
    "can"`. §5 says half a tank.
  - XCR `minCount: 2, unit: "kit"`. §5 table and the worked example both
    say 1 kit.
  - 195-TWILL `minCount: 1, unit: "roll"`, with the note "§5 states this in
    yards (10 yd); we can count rolls honestly and yards we cannot".
  - Trigger is `<=` min (:209-215), so "at or below min" in §7.1 matches.
- **Proposed:** Decide XCR (1 or 2 kits) and West 105 (½ or 1 tank) at the
  Monday meeting; then rewrite the §5 table in the unit the app counts
  (containers: kit, tank, can, roll, box, set) with one column per rule:
  Material type (`matKey`), Minimum, Unit, Supplier, Lead time (days). The
  worked examples stay as the reasoning. Restate the IN2 rule as "2 kits on
  hand, one of them may be open" and AT30 the same, since the app counts them
  separately. If the team keeps 10 yd of 195 twill as the real target, say
  the app approximates it as 1 roll.
- **Severity:** high (two documents that should be one table already differ).

### G-03 §5 has no supplier or lead-time column, and tacky tape's supplier conflicts (wrong)

- **Current (§5):** "Tacky tape: ... domestic lead ~1 week → 6 rolls".
- **Evidence:** `RESTOCK_SEED` gives tacky tape `supplier: "Easy
  Composites", leadDays: 7` (`app/inventory.js:71`), but every other Easy
  Composites row is `leadDays: 42`. CS-006 §5 table (line 77) names "Airtech /
  General Sealants". `03 Datasheets/INDEX.md` "Not yet collected" lists
  "General Sealants tacky tape". The app's lead times (`leadDays`) drive the
  "order by" date on the Running out card (`restockOrderBy`, :190-196).
- **Proposed:** add Supplier and Lead time columns to §5 with these values,
  each cited: Easy Composites 42 days (CS-012 §7.4, PP-02); West System 14;
  McMaster 7; Sigmatex (sponsor) 30; tacky tape: Airtech or General Sealants,
  7 days, matching CS-006. Flag the app's tacky-tape supplier for a fix.
- **Severity:** medium.

### G-04 §6 flammables: the app calls the epoxies flammable, the SDSs do not (wrong)

- **Current (§6):** "flammables (Airtac, acetone, clear coat) in the
  flammables cabinet". This is right as far as it goes.
- **Evidence:** `RESTOCK_SEED` marks IN2, AT30, West 105, West 206 and XCR
  `hazard: "flammable"` (`app/inventory.js:53-63`). The receiving confirm
  uses that to warn "N flammable items would land on X, which is not a rated
  location" (`app/receiving.js:898-904`). The SDS flash points: IN2 140 °C,
  AT30 slow 150 °C, AT30 fast 100 °C (`EC-SDS-IN2-...pdf`, sections 9); XCR
  resin and hardener "FP > 100°C" (`EC-SDS-XCR-...pdf`); West 105 TDS
  "relatively high flash point". Airtac 2 SDS: "Class IA Flammable Liquid",
  flash point −42 °F (`airtac2spray.pdf`). The EH&S import derives hazard
  from GHS H220 to H226 (`app/ehsimport.js:182-189`), which would mark IN2
  "not flammable", so the two code paths disagree with each other too.
- **Proposed (§6):** replace the parenthesis with a short table: Material,
  Flash point (SDS), Store in. Airtac 2 and acetone and the clear coat go in
  the rated cabinet (Airtac: SDS cited; acetone and Lime Line: SDS not on
  file yet, Round 5 tier 1). Epoxy resins and hardeners: not flammable
  liquids by their SDS; the team keeps them in the cabinet anyway because
  that is where EH&S filed them (ties to G-01). Note for the app list: fix
  the epoxy `hazard` values in `RESTOCK_SEED`.
- **Severity:** high (a safety warning that cries wolf teaches people to
  ignore the real one for Airtac).

### G-05 §6 "never in food fridges" is not checked anywhere (missing)

- **Current (§6):** "**never in food fridges** (2026-02-17 incident)".
- **Evidence:** a storage location's Type select offers "fridge"
  (`app/shop.js:120`, `["", "shelf", "rack", "cabinet", "bin", "box",
  "fridge"]`), but `invLocWarnings` (`app/inventory.js:383-402`) only checks
  expiry, flammable-outside-rated and running low. A resin lot on a
  `fridge` BIN raises nothing.
- **Proposed:** keep the rule (unbolded, see G-17). Add to §8: "No chemical
  lot sits on a location whose Type is fridge" checked at the walk. App list:
  add a warning chip for RSN/CON on a fridge-type location.
- **Severity:** low.

### G-06 A "one open container per material" rule is missing, and the app depends on it (process-rule)

- **Current:** not in CS-011.
- **Evidence:** `app/workorders.js:3040-3042`: "The lot most recently opened
  for a class: the one that is physically on the bench, assuming CS-011's
  'one open container per material' rule is kept." App README "Which lots
  went in": "the most recently opened lot of that class, which under
  CS-011's one-open-container rule is the one physically on the bench".
  CS-011 has no such rule.
- **Proposed (new §7.6 "Opening a new container", or in CS-014 with a
  cross-ref):** "Open one container of a material at a time. Finish or set
  aside the open one before opening the next, and press the lot's stage
  button to Open when you break the seal (the app stamps the Opened date).
  The cure buy-off pre-fills the most recently opened lot, so two open jugs
  of AT30 make that default wrong." Should, not shall: a defensible default.
- **Severity:** high (the lot-traceability default silently relies on it).

### G-07 §7.1 stock walk: the app now does it, and the trigger goes somewhere else (stale + process-rule)

- **Current (§7.1):** "1. 15 minutes, named owner; an IA or first-year is
  the right owner, it is a good first responsibility. 2. Check the §5 list
  against reality. Anything at or below min goes to #purchasing the same
  day, per CS-012."
- **Evidence:**
  - Walk: each shelf card and contents page has **Confirm contents**
    (map card **Confirm**, `app/inventory.js:499`; contents page **Confirm
    contents**, :842), which stamps "Contents last confirmed" and
    "Confirmed by" (`app/shop.js:133-134`, `invConfirmContents` :886). The
    map's "need a walk" chip counts shelves not confirmed within 30 days
    (`INV_WALK_STALE_DAYS = 30`, :27). HANDOFF:58-61 already tells the new
    lead to walk this way.
  - Reorder: the **Running out** card ("below the minimum in CS-011 §5",
    :242) lists every material at or under its minimum with "order by"
    dates, says "on order · BUY-…" when a purchase already covers it, and
    offers **Add N to a purchase**, which creates a Submitted `Restock`
    purchase or adds lines to an open one (:250-330).
  - #purchasing is retired (see G-20).
- **Proposed (§7.1):**
  1. The stock-walk owner is named at the start of the season. A first-year
     or IA is a good owner.
  2. Once a month, open Inventory and walk each shelf: open its card, check
     the list against what is there, press **Confirm contents**.
  3. Fix what is wrong as you go: **Move** for something on the wrong shelf,
     set **How full** on a container, add anything missing with **Add here**.
  4. Open the **Running out** card on the storage map. For every row without
     "on order", press **Add N to a purchase**.
  5. Post the purchase request in #purchasing-slackbot the same day (CS-012
     §7.1).
  Process-rule: the channel in step 5 changes; the "same day" shall stays.
- **Severity:** high.

### G-08 Minimums are lead-editable, but not from the app (missing, careful wording)

- **Evidence:** overrides live in `config/restock` (`app/inventory.js:84-112`,
  HANDOFF:69-70 "config/restock | CS-011 §5 minimums per material"). There
  is no editor in the app: the only reference to `"restock"` in `app/` is
  the read at `inventory.js:92`. App README calls them "lead-editable", which
  means a lead edits the Firestore document.
- **Proposed (§5, one line under the table):** "The app holds these minimums
  in its restock table. A lead tunes one by editing `config/restock` in the
  Firebase console; a change there is a change to this table and goes through
  CS-000 §7.2." Do not write "edit it in the app".
- **Severity:** medium (a standard that names a non-existent button gets
  quoted by Paul).

### G-09 Expired material has no rule (process-rule, needs a human decision)

- **Current:** CS-011 is silent on expiry. CS-001 §7.6 puts expiry dates on
  the label, nothing says what to do when one passes.
- **Evidence:** lot states are "Sealed", "Open", "Empty", "Expired"
  (`app/shop.js:58`). The map flags expired lots as a red warning
  (`lotExpired`, `app/inventory.js:375-377`, "N expired"). The cure buy-off
  does not check expiry (`workorders.js` has no reference to `expiresOn`).
  Shelf lives in `app/materials.js` come from the TDS: IN2 and AT30 12
  months, XCR 12 months.
- **Proposed:** a lead decides, and the standard states it. A candidate:
  "Do not use an expired resin, hardener or XCR on a season part. A lead may
  release it for R&D or a test panel after a small test cure; record that on
  the lot. Set its state to Expired and dispose of it through campus EH&S."
  The disposal step needs a lead to confirm the RFS route; it is not in the
  code or Slack.
- **Severity:** medium.

### G-10 §7.3 storage map: site names should match the app exactly (stale)

- **Current (§7.3 step 1):** "molds → RFS storage container ... finished
  parts → Jacobs basement shelves ... cloth → dry sealed bin; chemicals →
  per §6; consumables → General Box at RFS." §6: "the chemical
  boxes/barrel".
- **Evidence:** the Site select is `["", "RFS container", "Jacobs basement",
  "Flammables cabinet", "Dry sealed bin", "General Box", "Other"]`
  (`app/shop.js:68`). There is no "chemical boxes/barrel" site. Slack
  2026-09-18 (#composites, Nick): "if we have any xps stock, it would be in
  the storage container". #general 2026-09-15 (Oliver): the storage area
  below Jacobs is keycard access.
- **Proposed:** a table, Object | Site (as the app names it) | Rule:
  Molds | RFS container | never in front of the knaack or screw boxes.
  Finished parts | Jacobs basement | never the etch locker (2026-04-20
  agreement); keycard access. Cloth | Dry sealed bin. Flammables, resins,
  hardeners | Flammables cabinet (G-01, G-04). Consumables | General Box.
  Foam and board stock | RFS container. Drop "chemical boxes/barrel" or ask
  a lead whether it still exists (HANDOFF:52 asks for this field check).
- **Severity:** medium.

### G-11 §7.3 and R5 name the retired Stock tab (stale-path)

- **Current:** R5 "The app's Stock tab (live tooling-board + offcut
  inventory)"; §7.3 step 2 "Board and offcuts are logged in the app's Stock
  tab (R5)".
- **Evidence:** the Inventory tab's toggles are "Storage map", "Items list",
  "Materials list", "Boards" (`app/inventory.js:604`). README Boards: "The
  fourth toggle is the tooling rack, which used to be a third group on the
  Molds rail."
- **Proposed:** R5 "The app's Inventory tab (storage map, Materials list,
  Boards)"; step 2 "Boards and offcuts are logged under Inventory → Boards."
  Path fix, rides free if nothing else in the section changes.
- **Severity:** medium.

### G-12 §7.3 should describe grouped containers and the EH&S edge code (missing)

- **Evidence:** identical containers fold into one row by Material type
  ("AT30 SLOW EPOXY HARDENER ×10"), with states, soonest expiry and price;
  opening it lists each container by the last twelve characters of its EH&S
  tag, last group at full weight (`lotGroupKey`/`groupLots`,
  `app/inventory.js:709-720`; README Inventory). The contents page prints as
  the stock-walk sheet with groups open.
- **Proposed:** one paragraph in §7.3: "A shelf's page folds identical
  containers into one row. Open the row to see each container; the code it
  shows is the strip printed down the right edge of the UC EH&S tag, so you
  can match the screen to the jug in your hand. Printing the page gives the
  walk sheet with every container listed."
- **Severity:** low.

### G-13 Container level and "Log material used" belong in the standard (missing)

- **Evidence:** a lot's **How full** is "Full / Half / Low / Empty"
  (`app/shop.js:196`); consumables also carry **How many**. The work order's
  **Log material used** asks "The lot afterwards": "still fine", "running
  low — flag a reorder", "now empty" (`app/workorders.js:2952-2953`), which
  sets How full, the Empty state and the Emptied date (:2877-2891). Empty
  containers count as zero toward the minimum (`restockOnHand`, :155-168).
  **Flag for reorder (override)** remains for the person who knows better.
- **Proposed:** add to §7.1 or a new §7.6: "When you finish a layup, log what
  you used on the work order and say what state the container is in. A
  container you emptied is marked Empty, not deleted: the reorder count needs
  to see it." Should.
- **Severity:** medium.

### G-14 §8 and §9 records are stale (stale-path)

- **Current §8:** "Owner posts result in #composites | Slack + walk sheet";
  "Walk sheet + WO mold.location". **§9:** "Walk sheets (photo → Drive), WO
  mold.location fields, reorder requests in #purchasing."
- **Evidence:** walk record is `walkedAt`/`walkedBy` per shelf; the mold
  record has its own "Home location" (`app/shop.js:78`); Export → "Locations"
  is "One row per shelf, rack and bin, with counts and the last stock walk"
  (`app/inventory.js:1054-1055`); reorders are `Restock` purchases
  (`budget.js` PURPOSE list :40) and bot requests.
- **Proposed §9:** "Each shelf's Contents last confirmed and Confirmed by
  fields; each mold's Home location; Export → Locations (Copy for Sheets or
  Download .csv) as the walk summary; Restock purchases in the Budget tab and
  their #purchasing-slackbot requests." §8: method "Confirm contents on every
  active shelf; the 'need a walk' chip reads 0", record "Contents last
  confirmed". Keep the Slack post if Nick wants it, as a should.
- **Severity:** medium.

### G-15 Inventory export to Sheets is undocumented (missing)

- **Evidence:** Export modal "Export inventory" with three sets, each with
  **Copy for Sheets** and **Download .csv**: "Everything on every shelf",
  "Locations", "EH&S reconciliation" (`app/inventory.js:1051-1060`,
  :1130-1147); checkbox "include empty lots and retired molds". README: Copy
  "works on a phone, where a browser download often silently does nothing".
- **Proposed:** §9 line (above) plus §7.5 Season handoff step: "Export →
  Everything on every shelf → Copy for Sheets, paste into a new sheet in the
  season's Drive folder. That is the one-page 'what we actually have' list."
  This replaces hand-writing the handoff list.
- **Severity:** low.

### G-16 Scope misses foam stock and donated material (missing)

- **Current (§2):** "Consumables, resins/chemicals, cloth, tooling board,
  molds, and finished parts".
- **Evidence:** XPS foam is bought and stored now: #purchasing-slackbot
  REQ-000064 (2026-10-10, Nick) "COMP-011 | XPS Foam"; #composites
  2026-09-18 "is our xps stock in the storage bin?". ACP shop cleanout
  donation 2026-09-03 (#composites, Nick): release film, twill, gum tape,
  fibreglass, sandwich panels. README: "Walk-in deliveries (donations, legacy
  stock) still go through the plain Receive button and stay honestly
  un-costed."
- **Proposed §2:** "...cloth, tooling board, foam and core stock, molds,
  finished parts, and donated or sponsor material." Receiving of donations is
  CS-014's.
- **Severity:** low.

### G-17 Style (style)

- §5 heading "Equipment & Materials: layup-blocker min-stock list (starting
  values; tune with usage data)": rephrase for search, "5. Minimum stock:
  what we never run out of". Keep the number 5 (app code cites §5).
- Bold used for emphasis mid-sentence: "**opened kit + 1 unopened**", "**1
  unopened kit minimum**", "**6 rolls**" (§5), "**never in food fridges**"
  (§6). STYLE.md §2: bold is for labels.
- §4 Definitions is one run-on line and defines only min-stock. Define:
  stock walk, home location, Material type (`matKey`), restock rule,
  container level (How full), lot (cross-ref CS-014).
- §7.1 step 1 joins two clauses with a comma; §7.2 step 2 and §7.3 step 4
  ("The payoff, enforceable since 2026-08-03 ...") are reasoning, not
  steps. Move reasoning to prose under the heading.
- Section numbers cited from code that must stay stable: §5, §6, §7.1,
  §7.3 (`inventory.js`, `shop.js`, `scan.js`, `workorders.js`). New content
  goes in new subsections (§7.6 onward), not by renumbering.
- Zero em dashes today; keep it that way.

---

## Findings: CS-012 Purchasing & Reimbursement

### G-20 #purchasing is retired; requests go through the Flux bot (wrong, process-rule)

- **Current:** R1 "Team purchasing rules (Shailen Kumar, pinned in
  #purchasing, 2025-10-26)"; §7.1 "Every purchase gets approval BEFORE
  buying, posted in #purchasing"; §8 "#purchasing thread exists"; §9
  "#purchasing threads".
- **Evidence:** #purchasing, Shailen Kumar, 2026-10-07 14:54, ts
  1791410048.860969
  (https://cal-electric.slack.com/archives/C02L1E6EXTP/p1791410048860969):
  #purchasing-slackbot "is the new purchasing channel. This channel is now
  retired." Approval tiers restated unchanged (under $50 subteam lead, $50
  to $250 division lead, over $250 President or VP) and "the slack bot
  automatically pings the appropriate person". Bot tutorial in
  #purchasing-slackbot (C0C3QJRUPGA), 2026-10-03 13:45: `/purchase` opens a
  form for "reference_id, amount, reason", Review, upload receipt images or
  PDFs, Confirm; approval or rejection comes by DM; "Use `/reimburse
  reference_id, amount` when reimbursement is completed"; `/reference`
  lists the IDs; `/bigorder` is for several items with several reference IDs
  (Ian Du, 2026-09-23 21:24).
- **Proposed:** R1 becomes "Team purchasing policy (Shailen Kumar,
  #purchasing, 2026-10-07) and the Flux bot in #purchasing-slackbot". §7.1:
  1. Before buying anything, run `/purchase` in #purchasing-slackbot with
     the budget reference ID, the amount and the reason. Use `/bigorder` for
     several items on different reference IDs.
  2. The bot routes it to the approver for the amount: under $50 the
     subteam lead, $50 to $250 the division lead, over $250 the President or
     VP.
  3. Buy only after the bot's approval DM arrives.
  Process-rule: the place where approval is recorded changes. Open
  question for a lead: the tutorial asks for receipts at request time, which
  sits oddly with approval before purchase. Confirm whether composites
  uploads a quote or cart screenshot at request time and the receipt later.
- **Severity:** high.

### G-21 Budget reference IDs replace "categorize under the subteam" (wrong, process-rule)

- **Current (§7.2 step 5):** "Categorize under the subteam **using** the
  material, not the one buying it (R1)."
- **Evidence:** every bot request carries a reference ID: composites
  requests seen are COMP-000 (REQ-000052, 2026-10-03), COMP-011 "XPS Foam"
  (REQ-000064, 2026-10-10), COMP-013 "Safety" (REQ-000009, 2026-09-26),
  COMP-014 "wet gagues" (REQ-000058, 2026-10-08); RFS consumables went to
  TRAN-002 (REQ-000059, REQ-000060, 2026-10-08). Shailen 2026-10-07: "Using a
  -000 code does not magically create money"; "We are not adding any money to
  any subteam's budget." Ishaan Sid, #purchasing, 2026-10-09 11:30
  (ts 1791570623.576359): "all testing related purchases are now required to
  go under the TRAN-012 category ... THERE SHOULD BE VERY FEW -000
  PURHCASES".
- **Proposed (§7.2 step 5, and a §4 definition of "reference ID"):** "Pick
  the budget reference ID for the line the money comes from (`/reference`
  lists them; composites lines start `COMP-`). Testing purchases use
  TRAN-012. Use a `-000` ID only for something the budget never listed, and
  tell the lead, because it comes out of another line." Process-rule.
- **Severity:** high.

### G-22 Reimbursement: payment methods, the bot, and the logging deadline (wrong, process-rule)

- **Current (§7.2 step 4):** "Submit the pinned form within **1 month** of
  purchase. No Venmo, Zelle, cash or gift cards."
- **Evidence:** Shailen 2026-10-07: "purchases made with cash, Venmo, Zelle,
  PayPal, etc... cannot and will not be reimbursed. If you need to buy
  something using one of the above methods, reach out me BEFORE making the
  purchase." Any purchase not logged in the bot is not reimbursed ("Any
  request for anything purchased before October 9th not submitted by
  Friday, WILL NOT BE REIMBURSED"). GM recap #general 2026-09-24: "New
  reimbursement slack bot". Bot: `/reimburse reference_id, amount`.
- **Proposed:** step 4 "Log the purchase in the bot (G-20) and submit for
  reimbursement within one month. Cash, Venmo, Zelle and PayPal are not
  reimbursed; ask the finance lead before using one." Keep "gift cards" only
  if a lead confirms the 2025 pin still stands. Ask finance whether the
  pinned form still exists or `/reimburse` replaced it, and write whichever
  is true. Process-rule (adds PayPal; changes where you submit).
- **Severity:** high.

### G-23 The app's "$50 needs approval" flag does not match §7.1 (wrong, app and standard)

- **Current (§7.1):** every purchase needs approval, tiered.
- **Evidence:** `needsApproval` is `cost > 50 && reimb === "Submitted"`
  (`app/budget.js:84`), its comment says the gate "clears when the
  treasurer marks it Approved" on the money track (:79-83). Pills and
  warnings read "Over $50 — needs #purchasing sign-off before ordering"
  (`budget.js:538`, :597) and the Running out modal says "Over $50 still
  needs #purchasing sign-off before anyone orders it (CS-012 §7.1)"
  (`inventory.js:289`). So the app (a) shows no flag under $50, though the
  policy still needs the subteam lead, (b) names a retired channel, and (c)
  uses the reimbursement track's "Approved" for purchase approval.
- **Proposed (standard):** a short table in §7.2 mapping the Budget tab to
  the policy: Order status "Submitted" = request posted in the bot, not yet
  bought; "Purchased" = bought after approval; "Arrived" = on a shelf
  (receiving sets this, CS-014). Reimbursement "Submitted" = owed;
  "Approved" = the bot's approval DM came back; "Reimbursed" = paid. Write
  the bot's REQ number in the purchase's Notes. **For the app list:** reword
  the three strings to #purchasing-slackbot and decide whether the flag
  should show for every unapproved purchase.
- **Severity:** high.

### G-24 Logging every purchase in the Budget tab is not required anywhere (missing, process-rule)

- **Current:** CS-012 never mentions the app. §9 calls "the Budget sheet"
  the season's spend view.
- **Evidence:** Incoming is "a query over the Budget tab's purchase lines"
  (README; `invIncoming`, `app/inventory.js:1253-1270`); a received lot
  carries a read-only "From purchase" chip back to `BUY-SN6-###`; Running out
  suppresses a nag only when a purchase line covers the material
  (`restockOnOrder`, :175-183). None of this works for a purchase nobody
  logged. ID format from `fb.js:126` (`budget: "BUY"`) and :495.
- **Proposed (new §7.9 "Logging the purchase in the app"):**
  1. Make a purchase in Budget with **+ New Purchase** when you request it.
  2. Fill Item, Purchaser, Purpose, Cost, Source / vendor, and Charged to
     if it is not composites' money (G-25).
  3. Add **Line items**, one per thing you will put on a shelf: total and
     count as the receipt prints them.
  4. Attach the receipt with **+ Add / scan receipt** when you have it (G-26).
  5. Move Order status and Reimbursement as the purchase moves (G-23 table).
  Should, not shall. Process-rule (new).
  §9: "Budget tab purchases (BUY-SN6-###) with receipts and line items, the
  Budget CSV, and the bot's REQ history" replaces "#purchasing threads + the
  Budget sheet".
- **Severity:** high.

### G-25 "Charged to" is not in the standard (missing)

- **Evidence:** field "Charged to", placeholder "Composites", hint "Blank is
  ours. Name another team's budget and the cost is still tracked and still
  reimbursed, just not counted against composites." (`app/budget.js:604-605`).
  Off-budget purchases leave the season total and goal bars but still count
  for "$50" and for "Waiting on reimbursement" (:24-36, :119-133).
  Typing "Composites" counts as ours (:63-66). Released 2026-08-29
  (`9f8675b`). Slack shows the case: RFS consumables charged to TRAN-002,
  not a COMP line (REQ-000059/60, 2026-10-08).
- **Proposed (§4 + §7.9 step 2):** define Charged to; say "put the
  reference ID's owner there when it is not a COMP line (for example
  TRAN-002 for RFS consumables), so the composites season total stays
  ours". Recommend writing the reference ID itself, since it is what finance
  reads.
- **Severity:** medium.

### G-26 Receipts: ✨ Fill from receipt, Other files, PDFs (missing)

- **Current (§7.2 step 1):** "Photograph the **itemized receipt**."
- **Evidence:** the receipt slot takes a photo or a PDF invoice
  (`budget.js` comment at :62-69, README Budget). **✨ Fill from receipt**
  reads it into proposed line items and fills an empty vendor; every cell
  stays editable; a toast warns when lines miss the printed total by more
  than 15% (README; `fillLinesFromReceipt`, `budget.js:427-462`; server
  `parseReceipt`, `functions/index.js:237-277`, which reads only
  `budget/{id}/` paths and skips tax and subtotal rows, keeps shipping as a
  line). **Other files** "quotes, order confirmations, invoices"
  (`budget.js:431-433`, v6.3.1 `e7eaa05`).
- **Proposed:** step 1 "Photograph the itemized receipt, or save the
  emailed PDF invoice, and attach it to the purchase with **+ Add / scan
  receipt**." New step: "**✨ Fill from receipt** proposes the line items.
  Check every line against the receipt before you leave the page; it is a
  draft, not a record." Put the quote and order confirmation under **Other
  files**. Cross-ref CS-014 §5 for the AI switch and ceiling.
- **Severity:** medium.

### G-27 §7.4 the "basket doc" is now a Restock purchase (process-rule)

- **Current (§7.4):** "A shared 'basket' doc collects wants before each EC
  order (SN5 practice ...; make it a standing doc instead)."
- **Evidence:** **Add N to a purchase** creates a Submitted purchase named
  "Restock — N items", purpose "Restock", or appends to any purchase whose
  goods have not arrived ("Add to": "A new purchase" or an open BUY-)
  (`app/inventory.js:269-330`). Members can add lines to it like any
  purchase. Team-wide, #mech 2026-09-28 (Oliver Chang): "COTS Ordering Sheet
  == Stock Ordering Sheet == Stock Inventory"; #manufacturing 2026-10-04:
  stock is bought from that sheet after testing.
- **Proposed:** "Before each Easy Composites order, the lead opens one
  Restock purchase in Budget and members add their wants as line items. The
  Running out card adds the reorders to it. When the basket closes, post it
  through `/bigorder` or `/purchase`." Mention the team-wide stock ordering
  sheet for COTS and metal stock as a reference, not a composites rule.
  Process-rule (replaces the standing doc with an app record). Keep §7.4 as
  the number (`inventory.js:49` cites it).
- **Severity:** medium.

### G-28 §7.6 Sponsor asks: donations arrive outside purchasing (missing)

- **Evidence:** ACP cleanout haul 2026-09-03 (#composites, Nick, list of
  release film, twill, gum tape, fibreglass, sandwich panels); Airtech
  sponsorship request 2025-09-25. README: walk-in deliveries stay
  un-costed.
- **Proposed:** add a step: "Sponsor and donated material is received like
  any delivery (CS-014) with no purchase and no cost, and the supplier field
  names the sponsor." Keep the existing sponsor rule.
- **Severity:** low.

### G-29 §7.8 requests the wrong printer (wrong)

- **Current (§7.8):** "Brother PT-D610BT label printer, plus 3 × TZe-251 24
  mm laminated tape and 1 × TZe-231 12 mm"; "~$115 hardware, ~$76 tape".
- **Evidence:** commit `c62df0b` (2026-08-28) "adds a roll path for a
  Brother QL on the shed wifi ... AirPrint through the phone's own print
  dialog is the only route, which is also why the hardware had to be a QL."
  Media in `app/labels.js:559-561`: "Brother DK-2210 · 29 mm continuous ·
  cut at 101.6 mm" and "Brother DK-1201 · 29 x 90 mm die-cut". DESIGN-NOTES
  "Why the roll printer has no address in the app": "Laminated tape was
  checked and rejected on print height, not on price ... maximum print
  height is 18 mm against the 21.4 mm this label needs". App README Labels:
  "The roll printer is a Brother QL on the shed wifi". CS-012 Rev E/F (both
  2026-08-29) edited §7.8 after that commit without changing the model.
  Whether a QL has been bought is unclear: SESSION-STATE lists "The one
  label test that needs the printer in hand" as not done.
- **Proposed:** a lead confirms whether the QL is owned. If owned, §7.8
  becomes a record of the purchase (model, BUY- ID) and the consumable line
  "DK-2210 29 mm continuous rolls" moves to CS-011 §5 as a minimum-stock
  item. If not owned, rewrite the request for an AirPrint Brother QL with
  DK-2210 and drop the TZe lines and costs (no QL price is in the repo, so
  the cost line needs a quote). Also flag CS-001 §5 (cluster B), which lists
  the same PT-D610BT row.
- **Severity:** high.

### G-30 §6, §7.5, §7.7 and the rest (keep, with small edits)

- §6 "deposits take up to a month": no newer source; keep.
- §7.5 rush rule (shipping more than 2× the item): keep.
- §7.7 season close: add "Purchases not logged in the bot are not
  reimbursed (policy of 2026-10-07)." Dates change yearly; keep that line.
- §7.3 distributed purchasers: keep.

### G-31 Style (style)

- §7.1: "**Every purchase gets approval BEFORE buying**" is emphasis bold
  and capitals. Write "Get approval before you buy anything."
- §7.2: "**itemized receipt**", "**1 month**", "**using**" are emphasis bold.
- §7.4 and §7.6 open with "**Order calendar:**" and "**Sponsor asks:**",
  repeating the heading. Drop them.
- §7.4 step 1 is three actions in one step; split per STYLE.md §2.
- §7.8 "**Justification.**" and "**Why not cheaper.**" are labels; fine.
- Headings for search: §7.1 "Getting a purchase approved", §7.2 "Getting
  reimbursed", §7.4 "When to order (the order calendar)". Keep numbers:
  §7.1 and §7.4 are cited from `budget.js:80` and `inventory.js:49,289`.
- Status header: "re-verify tiers/names each fall" is done for 2026
  (Shailen, 2026-10-07); the history row should say so.

---

## Findings that belong in CS-014 (missing from the whole series)

Each of these is a feature in the code with no governing text. The outline
below places them.

### G-40 The receiving desk (missing)

- **Evidence:** entry points: map toolbar **Receive a delivery**
  (`inventory.js:607`), a shelf's **Receive delivery** (:840), Incoming
  **Arrived ▸** (:1291, seeds the whole order), an unknown scanned EH&S tag
  (opens the desk with the code in a fresh resin row, `receiving.js:110-122`).
  Page heading "Receiving desk", or "Add to this shelf" from a shelf
  (`receiving.js:497`). Columns: "Class", "What is it", "How many", "Shelf",
  "Vendor lot", "EH&S tag", "Expires", "$ each" (:572-573). Class choices
  "Fabric", "Resin", "Hardener", "Consumable" (:48-53). Header fields
  "Supplier", "Arrived", "New lines land on". Index toggles "On order" and
  "Shelves", with **Take all N** and **Take** per line (:667-692). Enter
  commits a line and opens the next carrying class, shelf and supplier;
  Cmd/Ctrl-Enter confirms. A paste from an order email becomes rows
  (`rxPaste`). Confirm modal "Create N records?" lists rows by shelf, each
  tickable ("Untick anything that did not actually turn up"), and shows
  flammable-shelf and EH&S warnings (`rxConfirmHtml` :787,
  `rxEhsWarnings` :862, `rxProposedWarnings` :885).
  Fabric and resin rows make one record per unit; consumables one record
  with a count; more than 50 tracked units in a row is refused (:773-777).
  After **Create N records**, an undo bar offers **Print N labels** and
  **Undo** (:1055-1058); labels are never auto-printed. An unfinished sheet
  survives a reload for 24 hours (`RX_DRAFT_MAX_AGE_MS`) and the toolbar
  shows **Finish N lines**.
- **Severity:** high.

### G-41 Incoming (missing)

- **Evidence:** card "Incoming", "bought, not yet on a shelf · N"
  (`inventory.js:1278-1296`): each purchase line not yet fully received,
  with unit price, BUY chip, vendor, "ordered Nd ago" and ⚠ past 14 days
  (`INV_STALE_ORDER_DAYS = 14`, :1209). Partial receipts show "N of M in ·
  K to come". A line leaves the strip when received records point back at
  it (`buyRef`). Note: a `closedShort` flag skips a short-shipped line, but
  nothing in the app sets it (only read at :1261), so a line that will never
  arrive cannot be written off from the UI. App list item.
- **Severity:** medium.

### G-42 AI reads: a person checks before save, a lead's switch, the $80 ceiling (missing)

- **Evidence:**
  - **✨ From packing slip** on the desk (`receiving.js:502`): rows land in
    the same grid; class, Material type, supplier and cost come from the
    app's own tables, not the model (`rxInferFromName`, :246-271); the photo
    is deleted after reading (:430-436). Server `parsePackingSlip` reads
    shipped quantity, not ordered, and fills lot and expiry only where
    printed (`SLIP_PROMPT` and `parsePackingSlip`, `functions/index.js:290-345`).
  - **✨ Read label** on a resin, hardener or consumable lot page
    (`shop.js:743`): sheet "From the label", empty fields pre-ticked, filled
    ones say "replaces …", nothing written until **Apply**
    (`lotLabelReview`/`lotApplyLabel`, `shop.js:1181-1226`). Material is limited to the team's MATERIALS keys
    (`readContainerLabel`, `functions/index.js:354-395`).
  - An expiry read by the model is stamped "vendor label (AI read)"
    (`AI_EXPIRY_SOURCE`, `core.js:144`) until a person edits the date, then
    "vendor label" (`shop.js:498-500`).
  - **✨ Fill from receipt** (G-26).
  - Lead switch: ⋯ menu "✨ AI features: on, tap to turn off" with "$X of
    $80 this month" (`core.js:3710-3711`); off hides every ✨ button and the
    functions refuse ("AI features are switched off by a lead.",
    `functions/index.js:68-83`). Ceiling: `MONTHLY_BUDGET_USD = 80`
    (`functions/index.js:55`), refusal "The team's AI budget for this month
    is used up. It's back on the 1st." Per person per day: 50 photo reads
    shared by receipt, slip and label (`DAILY_CAPS`, :47).
  - SESSION-STATE: not yet tried on a real slip or jug photo.
- **Proposed rule (process-rule, new):** "Anything a ✨ button fills is a
  draft. Check every row against the paper or the jug before you save. An
  AI-read expiry stays marked until you type over it, so type it off the jug
  when you can." Shall. The ceiling and caps are facts, not rules: state
  them with their source.
- **Severity:** high.

### G-43 Lots, lot fields and expiry sources (missing)

- **Evidence:** lot classes "Fabric roll / offcut" (FAB), "Resin / hardener"
  (RSN), "Consumable" (CON) (`shop.js:155-158`); IDs `FAB-SN6-###`,
  `RSN-SN6-###`, `CON-SN6-###` (per-class counters, `fb.js:472-495`).
  Fields by class `shop.js:976-978`; labels: "Material", "Material type",
  "State", "Role", "Mix ratio", "Vendor lot number", "EH&S barcode",
  "Supplier", "Received", "Opened", "Expires", "Home location", "Cut from
  roll", "How full", "How many", "Counted on", "Unit cost ($)", "Cost unit",
  "Hazard" ("flammable" / "not flammable" / blank = unknown), "Expiry from"
  ("vendor label", "vendor label (AI read)", "shelf-life table"), "Emptied",
  "Flag for reorder (override)". A received lot starts "Sealed"
  (`receiving.js:959`); the stage button to Open stamps Opened, to Empty
  stamps Emptied (`scan.js:370-375`). **Link materials** on the Materials
  list fills a blank Material type from the alias table and a blank expiry
  from received date plus TDS shelf life, stamped "shelf-life table", and
  never overwrites (`materials.js:137-210`). Fabric has no expiry and no
  hazard field by design.
- **Gap for the app list:** receiving writes Role but not Hazard on a
  received lot (`receiving.js:957-975` has no `hazard`), though
  DESIGN-NOTES says "`role` and `hazard` are written by the Receiving class
  cell". The map's flammables warning reads `lot.hazard`, so a received can
  of acetone on an unrated shelf raises nothing after the confirm. Until
  fixed, CS-014 should tell the receiver to set Hazard on chemical lots.
- **Severity:** high.

### G-44 EH&S tags, the RSS import and reconciliation (missing)

- **Evidence:** "EH&S tag" column and "EH&S barcode" field with a camera
  button; one tag per container, refused if another record wears it;
  several jugs in one row take space-separated codes dealt in order, with a
  warning when short (README Receiving; `rxEhsWarnings`). Tag grammar: Data
  Matrix, "RSS", 24 characters in six groups of four; the last twelve are
  reprinted down the right edge and typing those finds the container if
  unique (README Scanning, DESIGN-NOTES "EH&S tag normalising"). A code that
  is not 24 characters saves with a note. Shelves can carry their RSS
  sublocation tag (`shop.js:126-129`). **EH&S import** (lead only,
  `inventory.js:614`) reads the RSS .xlsx export, "Their shelf is our"
  mapping, per-row unticks so a re-import does not resurrect deleted
  containers, never edits or deletes (`ehsimport.js`). Export "EH&S
  reconciliation" sorts problem rows first, with notes "no EH&S tag on
  record", "check the tag", and "emptied — retire it in RSS too"
  (`inventory.js:1001-1043`). SESSION-STATE: the import has not been run in
  production yet. Slack #composites 2026-09-16 (Nick): "I have chemical
  inventory training on saturday", so the lead now holds the campus
  inventory role.
- **Severity:** high.

---

## Proposed CS-014 Receiving, Lots & EH&S (Rev A outline)

Number: CS-014 is the next free number (CS-INDEX:29). Reserve it with a
Draft row when drafting starts (CS-000 §7.1 step 2). Title for search:
"CS-014 Receiving, Lots & EH&S". H1 `# CS-014 Receiving, Lots & EH&S`
(PLAN Round 0 item 6 lint).

### 1. Purpose
Why a delivery has to become records the day it arrives: PP-02 (no buffer,
the stale sheet), "which roll went into this panel" (PP-09, CS-013 §7.2),
campus EH&S requiring every chemical container to wear a UC tag, and the
old receive modal that put a mixed order on one shelf. Two short paragraphs.

### 2. Scope
Receiving deliveries, donations and legacy stock into the app; lot records
for fabric, resin/hardener and consumables; dates and expiry; EH&S tags and
reconciliation with the campus RSS inventory; the AI reads used at
receiving. Not covered: approving and paying for the purchase (CS-012),
where things live and minimum stock (CS-011), the printed label itself
(CS-001), lot capture at the cure buy-off (CS-013 §7.2). Boards are
received through Inventory → Boards (CS-005/CS-011), not the desk.

### 3. References
CS-001 (labels), CS-011 (storage map, §5 minimums, §6 storage), CS-012
(purchases, Budget tab), CS-013 §4.1 (ID grammar) and §7.2 (lot capture),
SDSs in `03 Datasheets/`, app README sections Receiving / Scanning / Which
lots went in, and the code it describes: `app/receiving.js`,
`app/inventory.js` (Incoming, map warnings, exports), `app/shop.js` (lot
fields, Read label), `app/materials.js` (aliases, shelf life),
`app/ehsimport.js`, `app/scan.js`, `functions/index.js`
(`parsePackingSlip`, `readContainerLabel`).

### 4. Definitions
Lot (one physical container or roll; consumables one record with a
count); Material type (`matKey`); vendor lot number; EH&S tag (UC RSS Data
Matrix, 24 characters, edge strip of 12); RSS sublocation tag; Incoming;
received / opened / emptied dates; Expiry from and its three values; How
full; AI read. IDs in their real formats: `FAB-SN6-###`, `RSN-SN6-###`,
`CON-SN6-###`, `BIN-SN6-###`, `BUY-SN6-###`.

### 5. Equipment & Materials
A phone with the app signed in; camera for scanning; label stock per CS-001
§5 (5522 polyester for chemicals); the purchase record if there is one. The
AI facts in one table with sources: lead switch in ⋯, $80 monthly ceiling,
50 photo reads per person per day, Haiku 5.5, photos deleted after reading.

### 6. Safety
Read the SDS before opening a damaged or leaking container (location of
SDSs: Documents tab / `03 Datasheets/`). Gloves when handling chemical
containers at receipt. Chemicals go straight to a shelf rated for them
(CS-011 §6, G-04); never a fridge. Set Hazard on every chemical lot (G-43).
A leaking container is not received onto a shelf: a lead decides. Disposal
of expired or emptied chemical containers goes through campus EH&S; a lead
supplies the RFS route (not in code or Slack today).

### 7. Procedure
- **7.1 Before it arrives: purchase lines and Incoming.** Line items on the
  purchase are what Incoming shows; ⚠ after 14 days means chase the order.
  Cross-ref CS-012 §7.9 (G-24).
- **7.2 Opening the receiving desk.** The three ways in, by exact label.
- **7.3 Filling in the sheet.** One row per kind of thing; Class; How many
  fans out to records; Shelf; Vendor lot; Expires; $ each. Enter, paste.
- **7.4 Reading a packing slip with ✨.** Then the rule from G-42: check
  every row.
- **7.5 Confirming and labelling.** "Create N records?", untick what did not
  arrive, read the warnings, **Create**; then **Print N labels** (CS-001
  §7.1) or **Undo**. Partial deliveries leave the rest on Incoming.
- **7.6 EH&S tags on chemical containers.** Scan or type each tag into its
  row, one per container; the 12-character edge strip; what a short code
  means.
- **7.7 Dates, expiry and ✨ Read label.** Received, Opened, Expires, Expiry
  from; Read label → From the label → Apply; Link materials for old
  records.
- **7.8 Opening, using up and emptying a container.** Stage button to Open
  (stamps Opened); one open container per material (moved here or
  cross-ref CS-011, G-06); Log material used → The lot afterwards; Empty is a
  state, not a delete.
- **7.9 Expired material.** The rule from G-09 once a lead decides it.
- **7.10 Reconciling with campus EH&S.** Who holds the chemical-inventory
  role; EH&S import (lead); Export → EH&S reconciliation; retire emptied
  containers in RSS; how often (proposal: at the monthly walk).
- **7.11 Donations, sponsor stock and legacy stock.** Received with no
  purchase and no cost; supplier names the sponsor (G-28).

### 8. Quality checks
| Check | Target | Method | Record |
|---|---|---|---|
| Delivery received the day it arrives | 100% | Incoming has no line marked arrived elsewhere | Lot Received date |
| Every chemical lot has an EH&S tag | 100% | EH&S reconciliation export, "no EH&S tag" rows = 0 | Export |
| Every chemical lot has Hazard set | 100% | Materials list filter | Lot record |
| AI-read expiries confirmed | 0 still "vendor label (AI read)" at the walk | Materials list | Lot record |
| Emptied containers retired in RSS | 100% monthly | EH&S reconciliation | Export |
| No expired lot used on a season part | 0 | Cure buy-off lots vs Expires | WO |

### 9. Records
Lot records (FAB/RSN/CON), their `buyRef` link to the purchase, EH&S
reconciliation exports kept in the season's Drive folder, the lead's monthly
Backup.

### Move versus cross-reference

- **Moves into CS-014 (new text, nothing to cut elsewhere):** all receiving,
  lot, expiry, EH&S and AI-read content. Today it lives only in the app
  README and code; no standard holds it, so nothing is deleted from CS-011
  or CS-012 to make room.
- **Moves from CS-011:** the new "one open container" rule (G-06) and the
  container-level text (G-13) can sit in either. Recommend CS-014 §7.8 holds
  the procedure and CS-011 §7.1 cross-refs it, because they are lot actions.
- **Stays in CS-001, cross-referenced:** label media, where a label goes on
  a container (§7.2), what a lot label says (§7.6: vendor lot, opened and
  expiry), the opened sticker for unrecorded containers (§7.7). Cluster B
  should decide whether CS-001 also describes the UC tag's physical
  appearance; CS-014 then cross-refs it and describes recording it.
- **Stays in CS-011:** storage map, sites, §5 minimums and the Running out
  card, §6 storage rules (including the co-storage proposal), transport,
  handoff.
- **Stays in CS-012:** approval, the bot, reimbursement, Budget tab tracks,
  Charged to, line items, receipts and ✨ Fill from receipt. CS-014 §5 holds
  the shared AI-switch/ceiling facts; CS-012 cross-refs them.
- **Stays in CS-013:** lot capture at the cure buy-off (§7.2 step 4); the
  ID prefix table, which should gain `BUY` (cluster C).

---

## What is still right and should not change

- CS-011 §1 purpose and its PP-02/PP-10 history.
- CS-011 §5 sizing rule and worked examples; the reasoning is the source the
  app's `why` strings quote.
- CS-011 §6 "never in food fridges" and the flammables-cabinet rule for
  Airtac (matches its SDS).
- CS-011 §7.3 step 3, "scan the object, tap Move, scan the shelf": matches
  `scan.js` and README Scanning exactly. **Move here (scan)** is the inverse
  and can be added.
- CS-011 §7.2 order timing (Easy Composites ≥6 weeks): matches `leadDays:
  42`.
- CS-011 §7.4 transport and §7.5 handoff (U-Haul still used: REQ-000046 and
  REQ-000049, TRAN-001).
- CS-012 approval tiers: unchanged, confirmed 2026-10-07.
- CS-012 §7.2 steps 1 to 3 (itemized receipt, redacted card statement,
  Amazon shipped/delivered) and step 5's principle.
- CS-012 §7.3 distributed purchasers, §7.5 rush rule, §7.6 sponsor batching.

## Section numbers code depends on (do not renumber)

CS-011 §5, §6, §7.1, §7.3; CS-012 §7.1, §7.4 (`inventory.js:10,42,49,59,242,289,373,390,562,884`,
`shop.js:64,117,208`, `scan.js:12,302`, `budget.js:80`, `workorders.js:3042`).

## For the app fix list (not a doc change)

1. `RESTOCK_SEED` hazards for IN2, AT30, West 105/206, XCR (G-04).
2. `RESTOCK_SEED` tacky tape supplier (G-03); XCR/West minimums once G-02 is
   decided.
3. "#purchasing sign-off" strings at `budget.js:538`, `budget.js:597`,
   `inventory.js:289` (G-23); the under-$50 case.
4. Receiving does not stamp `hazard` (G-43).
5. No UI sets `closedShort` (G-41).
6. Chemical on a fridge-type location raises no warning (G-05).
7. Client-side purchase delete is lead-only (`budget.js:242`, "Only a lead
   can delete purchases.") while README says any member deletes to Recently
   deleted; firestore.rules lets any roster member tombstone. One of them is
   wrong.
8. README Inventory still says Select… delete has "no undo", stale since
   Recently deleted (v5.0.0, `3cd3e97`).
9. DESIGN-NOTES "The receipt parser" opens with "the app's one Cloud
   Function" and the `config/` table omits `config/ai` and `config/budget`.
