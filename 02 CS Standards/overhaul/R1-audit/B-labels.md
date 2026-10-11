# R1 audit, cluster B: labels (CS-001)

Auditor: Round 1, cluster B. Date: 2026-10-10. Read-only pass.
Standard audited: `02 CS Standards/src/CS-001.md` Rev F (2026-08-29).
Code read: `app/labels.js`, `app/scan.js`, `app/ehsimport.js`, `app/q.html`,
`app/core.js` (EH&S helpers 1687-1840, `trashedNote` 1967), `app/receiving.js`,
`app/inventory.js`, `app/shop.js`, `app/reports.js`, `app/stock.js`, `app/fb.js`
(pub mirror), `app/print.js`, `firestore.rules` (`/pub`), `firebase.json`
(`/Q/**` rewrite), app `README.md` §Labels and §Scanning, `DESIGN-NOTES.md`
(EH&S tag normalising, QR arithmetic, roll printer).
Git: commits since 2026-08-28 touching labels, scanning and EH&S (shas cited
per finding). Slack: #composites and #aerodynamics keyword searches since
2026-08-01 (results in §Slack below).

Type key: wrong / missing / stale-path / style / process-rule. Every
process-rule row needs a human decision and is flagged **[PROCESS-RULE]**.

---

## Summary

CS-001 Rev F was written against the app as of 2026-08-29. Three things moved
under it, and one thing was never true:

1. **The class word is not printed on any label, and never has been.** §4 makes
   it "Mandatory, and larger on the label than the code itself". The label has
   led with the name since 2026-08-13 (`8fd3b63`) and the class word exists only
   as a `data-cls` attribute and on the public scan page. Simon's decision has
   to pick a side (B-01).
2. **Chemical containers carry the UC EH&S tag as their identity**, and Simon
   decided on 2026-08-28 that "the team does not want a second FEB sticker on
   the same carton" (`834d6bc`). CS-001 §7.2 still says resin and hardener get
   a polyester FEB label on the container (B-06). CS-001 does not mention EH&S
   tags, Data Matrix, the edge print or the RSS import at all (B-07 to B-09).
3. **The roll printer path is a Brother QL with DK rolls** (`c62df0b`), driven
   through AirPrint. CS-001 §5 and CS-012 §7.8 still name a Brother PT-D610BT
   with TZe tape, which the app cannot drive and has no media entry for (B-03,
   B-04). Slack shows the printer is still not bought.
4. Scanning, the public nameplate, Custom label, Label media, storage-location
   labels, work-order labels, offcut labels at the cut commit, and Recently
   deleted all exist in the app and are absent from or misdescribed in CS-001
   (B-05, B-10 to B-18).

---

## Findings

### B-01 [PROCESS-RULE] The class word is not on the printed label (high)

- **Doc / section:** CS-001 §4 (Label, Class word), §7.6, Figure 1.
- **Current:** "Class word: PART, MOLD, ... Mandatory, and larger on the label
  than the code itself, so `P-SN6-007` can never be read as `PROJ-SN6-007`."
  §4 Label: "carrying, at minimum, the ID, the class word, the name".
- **Evidence:** `app/labels.js:358-389` `labelMarkup()` emits five rows: name
  (`.lbl-name`), ID row (`.lbl-rid`, with the R&D tag), key row (`.lbl-r2`),
  mid row (`.lbl-r3`), footer with the `FEB` tag (`.lbl-r4`). The class word
  only appears as `data-cls="..."` on the wrapper div (`labels.js:365`); no CSS
  in `print.css` renders it (`grep attr(data-cls)` finds nothing). The original
  `labels.js` (`972be8c`) did not print it either. Commit `8fd3b63`
  (2026-08-13, Simon's call) reordered to "name biggest with the ID second";
  `labels.js:284-288` says the vertical budget is spent ("Still no room for a
  masthead bar"). The class word does show on the public page (`q.html` `.cls`
  element, from `pub.cls`).
- **Proposed:** Simon decides. Two options:
  (a) **Standard follows the app** (recommended, because the vertical budget
  is genuinely spent and the decision to lead with the name was his): rewrite
  §4 as "Class word: the word for what kind of object a record is (list).
  The app derives it from the ID prefix; it is shown on the public scan page
  and in the app, and is what the ID prefix stands for on the printed label.
  It is never shown as a prefix alone." Drop "larger on the label than the
  code". Keep the 1:1 mapping to prefixes and the R&D-is-not-a-class rule,
  which are both still true in `labelClass()` (`labels.js:237-260`).
  (b) **App follows the standard:** print the class word in the footer beside
  `FEB` (for example `MOLD · FEB`), which costs no vertical space. That is an
  app change and is out of scope for this overhaul.
  Either way the rule changes, so it needs a register line.

### B-02 The label's line layout is described wrong (medium)

- **Doc / section:** CS-001 §4 (Label), §7.6 ("R&D builds" paragraph and the
  identifying-fact table), Figure 1 caption.
- **Current:** §7.6: "every other line carries variable-length content behind
  an ellipsis, and the third line is dropped outright whenever the name needs
  two." Table: "Fabric, resin, consumable: The vendor lot number, with opened
  and expiry dates."
- **Evidence:** `labels.js:277-295` and `:358-389`: row order is name (14 pt,
  wraps to two lines at 13/11/9/8 pt via `nameTier`, `:305-319`), ID 9.5 pt,
  key row bold 8.5 pt, mid row 7 pt, footer 7 pt + `FEB`. When the name needs
  two lines the **mid** row is not dropped: its content is merged into the
  footer (`:363`, `t.merge`). The key row is never merged. For lots
  (`labels.js:471-478`) the bold key row is `ratio · role`; the vendor lot is
  on the mid row (`LOT <vendorLot> · OPENED <date>`) and the footer is
  `RECD <date> · EXP <date> · <location>`. For fabric the key row is empty.
- **Proposed:** §4 Label: "a printed 4 × 1 in label (1⅓ × 4 in on 5522,
  29 × 90 mm on the die-cut roll). Top to bottom: the name, in the largest
  size that fits on one or two lines; the ID, with the R&D box when it
  applies; the key line in bold, which is the identifying fact (§7.6); a
  detail line; and a footer with the FEB mark. When the name needs two lines
  the detail line is folded into the footer. The QR code sits on the right."
  §7.6: replace "the third line is dropped outright" with "the detail line is
  folded into the footer". Replace the lot row of the table with the real
  content: "Resin, hardener, consumable: mix ratio and role in bold; vendor
  lot and opened date; received date, expiry and shelf". Fabric: say the
  vendor lot is the identifying fact even though it prints on the detail line
  (and note the empty bold line as an app opportunity, not a doc fix).

### B-03 The named label printer is one the app cannot drive (high)

- **Doc / section:** CS-001 §5 (Label printer row, Label stock rows), §7.2
  Resin/hardener row ("5522 or TZe"), §7.9 step 1, Figure 1 ("TZe-251 tape is
  24 mm high"). Cross-cluster: CS-012 §7.8 (cluster G).
- **Current:** "Label printer | Brother PT-D610BT with TZe-251 24 mm laminated
  tape | ~$115, tape ~$19/roll | Needs ordering approval under CS-012."
- **Evidence:** `labels.js:531-562` `LABEL_ROLLS` holds only
  `dk2210` ("Brother DK-2210 · 29 mm continuous · cut at 101.6 mm") and
  `dk1201` ("Brother DK-1201 · 29 x 90 mm die-cut"). `labels.js:1167-1169` and
  DESIGN-NOTES "Why the roll printer has no address in the app": the only
  route is AirPrint from the phone's print dialog, "which is also why the
  hardware had to be a QL" (`c62df0b` commit message). There is no TZe media
  option. App README §Labels: "The roll printer is a Brother QL on the shed
  wifi." Slack: Simon's app thread (ts 1787808874.121659, 2026-08-26) still
  has "purchase / connect sequential label maker. Have app talk to this to
  print labels as we need them, not off Avery sticker pages" un-struck, while
  the items around it are struck through as done. SESSION-STATE "Next up"
  still lists "The one label test that needs the printer in hand".
- **Proposed:** §5 printer row: "Brother QL-series label printer on the shed
  wifi, printing over AirPrint, with DK-2210 29 mm continuous paper (cut at
  101.6 mm) and DK-1201 29 × 90 mm die-cut as the fallback roll. Needs ordering
  approval under CS-012. Not bought as of 2026-10-10." Leave the exact QL
  model to CS-012 (cluster G should change §7.8 from the PT-D610BT to a QL; the
  model choice is Simon's). §7.2 resin row: drop "or TZe" (see B-04 on why the
  thermal roll is not a chemical stock). §7.9 step 1: "The spare roll" instead
  of "the spare cartridge". Figure 1 dimension note: see figure notes.

### B-04 The roll path is missing: media, copies, no calibration bar, and what thermal stock is not for (high)

- **Doc / section:** CS-001 §5, §7.1, §7.2 (Media column), §8 (calibration
  check).
- **Current:** §7.1 describes only the sheet path (stock choice, Start at
  cell, calibration bar). §8: "Calibration bar measures 100 mm | Every print
  session".
- **Evidence:** `labels.js:675-713` (`labelRollHtml`: one page per label, no
  grid, no Start at cell, no calibration bar; "the label is its own ruler").
  Builder UI on a roll (`labels.js:819-824`): field "Copies of each", max 50
  (`LABEL_COPIES_MAX`, `:690`). App README §Labels: "Direct-thermal roll labels
  are for indoor bins, shelves, lots and consumables. They fade in UV, blacken
  with heat and smear under solvent, so anything going into a post-cure oven
  or getting wiped with IPA or acetone still gets a 5522 polyester label off
  the sheet printer."
- **Proposed:** §5: add two stock rows, "DK-2210, 29 mm continuous
  direct-thermal paper, cut at 101.6 mm (same size as an Avery 5161 cell)" and
  "DK-1201, 29 × 90 mm die-cut, fallback if iOS refuses a custom length". Note
  in the row: direct thermal fades in sun, darkens with heat and smears under
  IPA and acetone, so it is for shelves, bins, dry fabric and consumables only.
  §7.1: split into "On a sheet" (current steps) and "On a roll": choose the
  DK media, set "Copies of each", print through the phone's print dialog, and
  measure the first label of the session with a steel rule (101.6 mm on
  DK-2210); if it is short or long the dialog scaled it. §7.2 Media column for
  anything that sees IPA, acetone or resin: "5522 polyester, never the thermal
  roll". §8 calibration check: "Sheet: the calibration bar measures 100 mm.
  Roll: the first label measures 101.6 mm (DK-2210)." This is a new "shall"
  for roll stock on chemicals and solvent-wiped objects, so register it
  **[PROCESS-RULE]**.

### B-05 §7.1 names buttons that are not where it says (medium)

- **Doc / section:** CS-001 §7.1 steps 1-2.
- **Current:** "Press **Label** on a work order, part, mold, material lot or
  item, or use **Labels** under Reports for a batch. 2. Choose the stock".
- **Evidence:** Reports has no "Labels" button. It has a "Labels" sub-heading
  under "Exports and maintenance" with buttons **Label sheet**, **Custom
  label** and **Label media** (`reports.js:446-451`). "Labels" buttons (batch
  builder, opened on that collection) sit on the Inventory toolbar
  (`inventory.js:609`), the Molds tab (`molds.js:317`) and the Items and
  Materials lists (`shop.js:607`). The single **Label** button
  (`labels.js:739-741`) is on work orders (`workorders.js:1510`), parts
  (`parts.js:1753`), molds, items and lots (`shop.js:720`), boards
  (`stock.js:624, 644`) and a storage location's page (`inventory.js:838`).
  R&D: **Study label** on a study (`rnd.js:1222`) and a print icon on each
  coupon row (`rnd.js:1554`). The single Label button does not offer a stock
  choice: it prints on the device's media (`printOneLabel` → `openLabelPreview`
  → `labelMedia()`, `labels.js:612-617, 718-747`). The builder's field is
  "Media", not stock (`labels.js:808`). The device setting is **Label media**
  → "This device prints to"; a lead also sets "Team default", which only
  seeds a device nobody has set (`labels.js:1147-1171`).
- **Proposed:** Step 1: "Open the record and press **Label** (work order, part,
  mold, board, test panel, jig, storage location, material lot), **Study
  label** on an R&D study, or the print icon on a coupon row. For several at
  once press **Labels** on the Inventory, Molds, Items or Materials list, or
  **Label sheet** under Reports." Step 2: "**Label** prints on this device's
  media, set under Reports → **Label media**. To print a chemical label on 5522
  from a device set to plain stock, use the batch builder and pick 5522 under
  **Media**." Keep Start at cell and the calibration bar steps (both labels
  match the code: "Start at cell", "Include the 100 mm calibration bar").

### B-06 [PROCESS-RULE] Chemical containers: the UC EH&S tag versus a second FEB sticker (high)

- **Doc / section:** CS-001 §2 (scope: "resin and hardener containers"), §5
  (5522 row: "Survives a hardener drip"), §7.2 table row "Resin, hardener | On
  the container | Polyester only (5522 or TZe)", §7.6 (lot fact).
- **Evidence:** Commit `834d6bc` (2026-08-28): "Every chemical container at RFS
  gets a UC EH&S barcode sticker (the RSS Chemicals campus inventory system),
  and the team does not want a second FEB sticker on the same carton. So the
  EH&S code becomes a stored identity on our own records instead." Same
  sentence in `core.js:1687-1693` and `scan.js:18-21` ("the team will not
  double-sticker a carton"). Slack, Simon 2026-08-26 (ts 1787808874.121659):
  "Have app barcodes sync with RFS chemicals barcodes so we can use the same
  for both", now struck through as done. The EH&S barcode field exists on
  RSN and CON lots and on BIN locations, not on fabric (`shop.js:126, 177,
  970-978`; `834d6bc`: "dry fabric is not in the campus chemical system").
  Conflict inside the app: the receiving desk's confirm still says "Fabric
  and resin become one record and one QR label each" (`receiving.js:798`) and
  its undo bar offers "Print N labels" for every created lot including
  resin (`receiving.js:1057-1067`).
- **Proposed (Simon decides, and the CS-011 §6 owner should see it):**
  New §7.2 rows replacing "Resin, hardener":
  - "Resin, hardener or consumable container that wears a UC EH&S tag: no FEB
    label. The EH&S tag is its label. Record the tag in the lot's **EH&S
    barcode** field (§7.11)."
  - "Chemical container with no EH&S tag yet: a 5522 polyester FEB label on the
    container until campus tags it; then enter the tag and leave the FEB label
    on." (Or remove the FEB label once tagged. Pick one; the app supports both.)
  §7.6: the lot fact table stays for fabric and for untagged containers.
  Note for the register: the receiving desk text at `receiving.js:798` should
  then change ("one record each; untagged chemical containers get a label"),
  which is an app change outside this overhaul.

### B-07 Definitions for the EH&S tag and Data Matrix are missing (medium)

- **Doc / section:** CS-001 §4.
- **Current:** nothing; §4 defines only ID, Label, Class word, QR code, Mark,
  R&D mark, Engraving.
- **Evidence:** `core.js:1695-1740` and commits `496d092`, `cf5b7dc`,
  `8861ef6` (2026-08-29): the tag is a Data Matrix square with "RSS" printed
  beside it; a 24-character code of uppercase letters and digits printed as six
  groups of four; the last twelve characters reprinted, rotated, down the right
  edge. 627 of 627 tags in the RSS export were 24 characters. Constants
  `EHS_LEN = 24`, `EHS_GROUP = 4`, `EHS_TAIL = 12` (`core.js:1738-1740`). The
  scanner reads `qr_code`, `code_128`, `code_39`, `code_93`, `data_matrix`
  (`scan.js:119`). FEB labels are QR only; the app never prints Data Matrix.
- **Proposed:** add to §4:
  - "**EH&S tag**: the UC EH&S barcode sticker that campus (RSS Chemicals)
    puts on every chemical container and on storage sublocations. A Data
    Matrix square marked RSS, with a 24-character code printed underneath in
    six groups of four, and the last twelve characters repeated down the right
    edge (the **edge print**). A second identity for the container, stored in
    the record's **EH&S barcode** field. FEB never prints one."
  - "**Data Matrix**: the square 2-D code on an EH&S tag. FEB's own labels use
    QR. The app's scanner reads both."
  Use a made-up code in examples (the test fixture tail `…0024 3F1C`), not a
  real container's.

### B-08 How to record and scan an EH&S tag is not in any standard (high)

- **Doc / section:** CS-001 §7 (new section, proposed §7.11, appended so no
  existing number moves).
- **Evidence:**
  - Receiving desk column "EH&S tag" with a camera button ("Scan the tag(s)
    with the camera"), sticky across codes; several codes in one cell are dealt
    to the containers in order (`receiving.js:572-573, 626-636`; `834d6bc`,
    `4306a5a`).
  - Lot or storage-location page: field "EH&S barcode" with a scan button
    titled "Scan the EH&S tag" (`shop.js:126, 177, 903`; `scan.js:429-445`).
  - One tag, one container: a tag another record wears is refused, naming the
    wearer (`scan.js:438`, `core.js:1834-1839` `ehsConflict`).
  - Typing: the whole code or the twelve edge-print characters find the
    container; two containers sharing an edge print are refused with "type
    more of the code" (`core.js:1811-1826`, `scan.js:234-241`).
  - A tag no record wears, scanned from the topbar Scan: "No record wears
    EH&S tag … yet. Log the container at the receiving desk?" with button
    "Log it", opening the desk with the code in a resin row
    (`scan.js:290-294`, `receiving.js:112-124`).
  - The tag's shape check is advisory: a code that is not 24 characters saves
    with a warning (`core.js:1775-1781`; `cf5b7dc`).
- **Proposed:** new "§7.11 Chemical containers and the UC EH&S tag", five
  steps: (1) at the receiving desk, scan or type the tag into the **EH&S
  tag** cell, one code per container; (2) for a container already on a shelf,
  open its record, press Edit and use the scan button beside **EH&S barcode**;
  (3) if the face of the tag is scuffed, type the twelve edge-print
  characters; (4) one tag belongs to one container, and the app refuses a
  second; (5) a tag the app does not know, scanned with **Scan**, offers
  **Log it**, which opens the receiving desk with the code filled in.
  Coordinate with cluster G: CS-014 owns receiving, so CS-001 §7.11 should
  stay about identity and point at CS-014 for the desk.
  Slack support: Nick Jepsen, 2026-06-16 (ts 1781635481.411929, EH&S
  inventory thread): asked for "a general protocol document" for the barcodes.

### B-09 The RSS import and the reconciliation export are not referenced (low)

- **Doc / section:** CS-001 §3, §9.
- **Evidence:** `ehsimport.js` (lead-only **EH&S import** on the Inventory
  toolbar, `inventory.js:614`): takes the RSS Chemicals web export (.xlsx, or a
  re-saved .csv), ticks Formula Electric sublocations by default, maps each to
  a shelf, creates one record per unknown barcode, skips barcodes already
  worn, never edits or deletes (`ehsimport.js:1-27, 39-94`). Inventory →
  Export → "EH&S reconciliation" lists containers with the barcode as the join
  key, untagged and emptied ones first (`inventory.js:994-1030, 1057-1058`).
  SESSION-STATE "Next up": the production import has not been run.
- **Proposed:** CS-014 owns both (PLAN.md cluster G scope). CS-001 §3 gains a
  reference row "CS-014 (receiving, lots and the EH&S tag)", and §9 says the
  EH&S barcode on each chemical lot is the join key to campus's RSS inventory.
  No procedure here.

### B-10 In-app scanning is undocumented (medium)

- **Doc / section:** CS-001 §7.10 (mentions scanning in one sentence), §9;
  proposed new §7.12.
- **Evidence:** Topbar button titled "Scan a label" (`core.js:3659`) opens a
  modal titled "Scan" with the hint "Point the camera at any label — ours, or
  the UC EH&S tag on a chemical — to open that record." (`scan.js:270-296`).
  Fallback field "…or type the code" / "Type the code from the label"
  (`scan.js:71`). iPhones load a scanner the first time ("Loading the
  scanner… first time takes a few seconds.", `scan.js:89-93`). Move button on
  mold, item and lot pages → **Scan the shelf** → **Move it**
  (`scan.js:304-339`, `shop.js:738`); on a storage location, **Move here
  (scan)** keeps the camera open for item after item (`inventory.js:841,
  869-880`). Cure buy-off: scan button titled "Scan the container's label"
  beside each lot (`workorders.js:3072-3081`). A code is accepted as the full
  URL, the bare ID, lowercase, or with spaces (`scan.js:199-209`).
- **Proposed:** new "§7.12 Scanning a label". Two ways: the phone's own camera
  opens the public page (§9); the **Scan** button in the app opens the record.
  Moving a thing: open it, **Move**, **Scan the shelf**. Restocking a shelf:
  open the shelf, **Move here (scan)**, scan each item. Either FEB QR or EH&S
  tag works at either end. If the camera will not open, type the ID or the
  tag's last twelve characters. Then §7.10's last sentence can point here.

### B-11 The public nameplate: what it shows, and "no signal" (medium)

- **Doc / section:** CS-001 §4 (QR code definition), §9.
- **Current:** §4: "Scanning it with any phone camera opens a public page
  naming the object, needing no account and no signal." §9: "A scan of any
  label resolves to the public page for that record, so a stock walk can be
  done with a phone and no account."
- **Evidence:** `q.html` paints the class (from the prefix) and the ID from the
  URL before any network call, then reads `pub/<ID>` and shows Stage,
  Location, Work order, Revision, Updated, and the R&D note; on failure it says
  "Couldn't reach the database. The ID above comes from the label itself, so
  it's still correct." after a 5 s timeout (`q.html` render/load). The page
  itself is fetched from hosting with `no-cache` headers (`firebase.json`) and
  there is no service worker anywhere in `app/` (grep `serviceWorker`: none),
  so a phone with no connection at all cannot load the page. The mirror holds
  only `id, cls, name, status, location, wo, rev, note, updatedAt`
  (`firestore.rules` `/pub` `hasOnly`, `labels.js:193-232`): no layup stack,
  no seal record, no names. The mirror starts empty until a lead presses
  **Rebuild scan mirror** under Reports (`reports.js:456`, `HANDOFF.md:40-43`).
- **Proposed:** §4 QR code: "...opens a public page with no account needed. On
  a weak connection it still shows the class and ID, which come from the code
  itself; with no connection the phone cannot open it, so read the label."
  §9: "The public page shows name, stage, location (shelf name), work order,
  revision, last update and the R&D note. It never shows a layup stack, a
  sealing record or a person. A label scanning to 'No record with this ID yet'
  means the record was never saved, belongs to another season, or the scan
  mirror needs **Rebuild scan mirror** (Reports, lead)." The app README
  §Scanning makes the same "no signal" claim; flag it for the README fix.

### B-12 Scanning a deleted record's label (low)

- **Doc / section:** CS-001 §9 (and §8 stock walk).
- **Evidence:** Deleting moves records to **Recently deleted** under Reports
  (`3cd3e97`); `fb.js:399-406` deletes the public nameplate on trash, and
  restore republishes it (`fb.js:410-425`). In the app, Scan on a deleted
  record says "<ID> was deleted by <name> N days ago. Restore it under
  Reports, Recently deleted." (`core.js:1967-1973`, `scan.js:278-284`). The
  public page then says "No record with this ID yet...".
- **Proposed:** one sentence in §9: "A label on a deleted record scans to 'no
  record' on the public page. Scanned in the app, it says who deleted it and
  that it can be restored under Reports → **Recently deleted**. Do not
  relabel; restore." Low because it is rare, but it is exactly the case a
  stock walk hits.

### B-13 [PROCESS-RULE] Labels with no record behind them (Custom label) (medium)

- **Doc / section:** CS-001 §7 (new, proposed §7.13), §7.10, §7.9 step 3.
- **Evidence:** **Custom label** on Inventory (`inventory.js:610`), on a
  storage location (`inventory.js:839`) and under Reports (`reports.js:449`).
  Modal "Custom label": fields Name, Second line, Key line, Footer, QR, Media,
  Copies, "Print one again" (last ten, per device) (`labels.js:1050-1097`).
  Its own hint: "A label with no record behind it — a shelf, a cabinet, a
  warning. Anything the app already tracks should be labelled from its own
  record instead." It refuses an ID-shaped second line: a real ID is sent to
  the record's own Label button, an invented one is refused outright
  (`labels.js:914-932`). QR text is uppercased, must stay in alphanumeric mode
  and keep modules at least 0.4 mm (`labels.js:960-982`).
- **Conflict:** §7.10 says "Every shelf, bin and rack holding composites
  material gets a storage record and a label". The Custom label hint offers
  "a shelf" as a use.
- **Proposed:** new "§7.13 Labels with no record (Custom label)": for cabinet
  signs, warnings (DO NOT CUT), bins of untracked things. Shall not be used for
  anything with a record, and shall not carry anything shaped like an ID (the
  app enforces both). A shelf that holds tracked material gets a storage
  record and its own **Label** (§7.10), not a custom label. §7.9 step 3
  (paint marker on masking tape for 72 hours) stays as the no-printer fallback.
  The "shelf with tracked material must be a record" sentence is a
  shall-clarification: register it.

### B-14 Storage-location labels say more than "nothing further" (medium)

- **Doc / section:** CS-001 §7.6 table (Storage location row), §7.10.
- **Current:** "Storage location | Nothing further; the name is the fact".
  §7.10 says nothing about how a location is made.
- **Evidence:** `labels.js:479-488`: a BIN label prints key `STORAGE`, detail
  `<site> · <kind> · FLAMMABLES OK` (when rated), footer `CONTENTS CONFIRMED
  <date>` or `SCAN TO SEE CONTENTS`. Locations are created with **+ Location**
  on Inventory → **Storage map** (`inventory.js:601`; `shop.js:104-108`
  `newOn: "inventory map"`), and **Confirm contents** on the shelf page stamps
  the walk date (`inventory.js:843`). A BIN can also carry an RSS sublocation
  tag in **EH&S barcode**, so scanning the campus shelf tag resolves to the
  same shelf (`core.js:1786-1795`, `834d6bc`: "one shelf tag can serve both
  apps"). Contents only show when scanned inside the app; the public page has
  no contents (`pubProjection` fields).
- **Proposed:** §7.6 row: "Storage location | Site and kind of location, and
  FLAMMABLES OK when the shelf is rated for them; footer carries the date the
  contents were last confirmed." §7.10 gains three steps: create it with **+
  Location** on Inventory → **Storage map**; print it with **Label** on the
  location's page and fix it to the front edge; if campus has tagged the
  shelf, enter that RSS tag in the location's **EH&S barcode** field so either
  tag finds the shelf. Note that a printed "CONTENTS CONFIRMED" date goes stale
  like a mold seal date; reprint after a walk if the team wants it current
  (**[PROCESS-RULE]** only if made a shall).

### B-15 Work orders get labels; the class list is missing WORK ORDER and CONSUMABLE (medium)

- **Doc / section:** CS-001 §2 scope, §4 class-word list, §7.2 table.
- **Current:** class words "PART, MOLD, TEST PANEL, STUDY, COUPON, FABRIC,
  RESIN, BOARD, JIG, STORAGE". Scope has no work orders.
- **Evidence:** `labels.js:238` `byColl`: `workOrders: "WORK ORDER"`;
  `:243` lots `CON: "CONSUMABLE"`; RSN covers hardener too (`role` on the
  key line). Label button on a work order (`workorders.js:1510`); its key row
  is the stack line (`labels.js:489-499`, `stackLine` `:403-417`).
  `LABELABLE` (`labels.js:761-769`) lists Molds, Parts, Work orders, Tooling
  board, Panels & items, Material lots, R&D studies & coupons.
- **Proposed:** §4 list: add WORK ORDER and CONSUMABLE, and say RESIN covers
  hardener (the key line says which). §2 scope: add work orders. §7.2: a row
  for "Work order (the bagged layup or kit before it is a part)", or, if the
  team does not use work-order labels on anything physical, say where it
  belongs. I could not find a stated use in code or Slack; ask Nick.

### B-16 Which records never get a label is unstated (low)

- **Doc / section:** CS-001 §4 or §2 "Not covered".
- **Evidence:** CS-013 §4.1 row `PROJ` says "never gets a printed label (CS-001
  §4)", but CS-001 §4 never says it. Code: tickets, budget and documents are
  excluded on purpose (`labels.js:757-760`; `labelClass` returns null). `STK`
  stack plans and `DOC` are also not labelable (`ID_PREFIX`, `fb.js:126`).
- **Proposed:** §2 Not covered: "Records that are not physical objects never
  get a label: issues (`PROJ`), purchases (`BUY`), documents (`DOC`) and stack
  plans (`STK`). Keeping `PROJ` off labels is also what stops it being misread
  as `P`." This makes CS-013's citation true.

### B-17 [PROCESS-RULE] Blanks at "Tooling cut" are unmarked until glue-up (medium)

- **Doc / section:** CS-001 §7.4 step 1, Figure 2; cross-cluster CS-003 §7.3
  (cluster D).
- **Current:** layer 1 of mold identity starts "At glue-up (CS-003 §7.3)".
- **Evidence:** Mold stages now run "Designed", "Tooling cut", "Board glued"…
  (`shop.js:46`; `544f23b`, 2026-09-17). One board's nest can hold blanks for
  several molds; the cut sheets tag each blank with its plan name and layer
  tag (L1, L2b), "what somebody at the saw matches against the cut list"
  (`5a26fc7`; app README "The cut list, on paper"). Slack, Nick Jepsen
  2026-08-26 in the app thread (ts 1787808874.121659): he is fine with mixed
  boards "as long as everything is labeled and it's clear what goes to what".
- **Proposed:** insert before step 1 (renumbering inside §7.4 is safe; no code
  cites §7.4 step numbers): "At tooling cut. Before a blank leaves the saw,
  write its mold ID or plan name and its layer tag from the cut sheet (L1,
  L2b) on it in paint marker." New shall: register it and tell cluster D so
  CS-003 matches.

### B-18 Board offcuts get printed labels at the cut commit (medium)

- **Doc / section:** CS-001 §7.2 rows "Tooling board sheet" and "Board
  remnant", §7.6 Board row.
- **Current:** "Board remnant | Marker for the ID, plus a taped tag for
  dimensions | Marker plus tag".
- **Evidence:** After **Mark cut**, the cut undo bar offers **Print labels**
  for the offcuts it just created, preselected in the builder
  (`stock.js:1797-1808`, `labels.js:773-784`). Advancing a mold to "Tooling
  cut" offers **Log offcuts** (`scan.js:405-412`). A board label prints
  density (pcf), `L X W X T`, qty, origin (the mold it came off) and shelf
  (`labels.js:500-513`).
- **Proposed:** remnant row: "Marker for the ID on the face, plus the printed
  board label on a taped tag (it carries density, dimensions and the mold it
  came off). Print it from **Print labels** on the bar that appears after
  marking a cut." Keep the marker rule for full sheets.

### B-19 Opening a container: the app stamps the date, the printed label does not (low)

- **Doc / section:** CS-001 §7.7 last line ("Anything opened but not given a
  lot record gets an opened sticker").
- **Evidence:** the lot page's stage button names its destination ("Open");
  pressing it stamps `openedOn` (`scan.js:356-386`, `LOT_STATE` `shop.js:58`).
  A label printed at receiving shows no opened date because the lot was
  Sealed then (`labels.js:475`; receiving creates `stage: "Sealed"`,
  `receiving.js:960`).
- **Proposed:** add: "A container with a record: press **Open** on its page
  when you open it, and write `OPEN <date> <initials>` on it in paint marker,
  because its label was printed before it was opened." The marker step is a
  new should: **[PROCESS-RULE]**.

### B-20 Consumables are one record with a count, not one label each (low)

- **Doc / section:** CS-001 §7.2 table (no consumable row).
- **Evidence:** `receiving.js:58-61`: "Consumables are one record carrying a
  count: nobody puts a QR label on each of fifty mixing cups."
- **Proposed:** add row "Consumable (cups, bag film, tape) | On the box or
  bin holding them | Printed, one label per record". If it is a chemical
  (release agent, acetone), B-06 applies.

### B-21 The fabric offcut label has no blank field (low)

- **Doc / section:** CS-001 §7.2 "Fabric offcut bag".
- **Current:** "On the bag, with a blank field for the remaining length |
  Printed, hand-write the quantity".
- **Evidence:** the lot label has no blank field (`labels.js:471-478`).
- **Proposed:** "On the bag. Write the remaining length on the bag beside the
  label in paint marker, and update the record's quantity."

### B-22 Two labels at demold: the app's hint disagrees with §7.5 (low)

- **Doc / section:** CS-001 §7.5 step 1.
- **Current:** "Staple label B to the work order traveler."
- **Evidence:** roll builder hint: "Two is the usual ask at demould — one for
  the part, one for the bag." (`labels.js:823`). On a sheet there is no copies
  field (one label per record, `labels.js:649-673`).
- **Proposed:** §7.5 step 1 gains "On the roll, set **Copies of each** to 2. On
  a sheet, print the part's label twice (use **Start at cell** for the
  second)." The app hint should say "traveler", not "bag" (app change, noted
  for the register; the standard is right).

### B-23 Two cross-references point at sections that do not exist (low)

- **Doc / section:** CS-001 §6 rule 2, §7.4 step 3.
- **Current:** §6: "CS-006 §7.4.3 already names tacky-tape seams". §7.4 step 3:
  "(CS-004 §7, step 4 "Identify")".
- **Evidence:** CS-006 has no §7.4.3; tacky-tape seams are named in CS-006
  §7.4 step 1 (`CS-006.md:123`). Identify is CS-004 §7.5 (`CS-004.md:142`);
  CS-001's own Figure 2 already says "CS-004 §7.5".
- **Proposed:** "CS-006 §7.4" and "CS-004 §7.5". The STYLE.md lint
  (`check_traceability.py`) should catch the first; record it in the register
  either way.

### B-24 Glue-up mark content differs from CS-003 (low)

- **Doc / section:** CS-001 §7.4 step 1.
- **Current:** "Mark the part name in paint marker".
- **Evidence:** CS-003 §7.3 step 3 (`CS-003.md:113`): "part name, WO, and the
  up-direction (CS-001 §7.4)".
- **Proposed:** "Mark the part name, the WO and an up arrow". The two
  standards cite each other, so they should say the same thing.

### B-25 QR size numbers are not stated (low)

- **Doc / section:** CS-001 §4 QR note.
- **Evidence:** QR is 21.4 mm on 5161 and on rolls, 27 mm on 5522
  (`labels.js:653`, `LABEL_ROLLS`); floor 14 mm, the code refuses smaller
  (`labels.js:74-79, 102-104`); 4-module quiet zone inside the drawing
  (`labels.js:92-95, 112`); custom QR modules must be at least 0.4 mm
  (`labels.js:975-979`). A season code past SN9 still fits the 14-character
  budget (`MOLD-SN10-004` is 13; `scan.js` accepts SN10+, `e51362d`).
- **Proposed:** one sentence in the §4 caution: "The app draws the code at
  21.4 mm (27 mm on 5522), never below 14 mm, with its quiet zone inside the
  label. Do not trim a label into its quiet zone." Cite `labels.js` as the
  source.

### B-26 AI-read vendor label fills the lot facts the label prints (low)

- **Doc / section:** CS-001 §7.6 (lot facts).
- **Evidence:** lot page **✨ Read label** photographs the vendor's container
  label and offers lot number and expiry to confirm; an unedited AI expiry is
  stamped "vendor label (AI read)" (`shop.js:741-742`; `c93020c`).
- **Proposed:** CS-014 owns it (cluster G). In CS-001 §7.6, one line: "The
  vendor lot and expiry on the label are whatever the record holds; check an
  AI-read value against the container before printing." Low.

### B-27 Style (low)

- **Doc / section:** whole document.
- **Evidence:** em dashes in body prose: none outside the revision history and
  a quoted printed string (fine). Decorative bold mid-sentence: §5 Paint
  marker note ("**Replaces the Sharpie for every hand mark.**"), §7.1 step 4
  ("**measure it with a steel rule: it must be exactly 100 mm.**"), §7.4 step
  2 ("**This is the record of record.**"), §7.5 step 1 ("**two identical
  labels**"), §7.6 ("**the one fact that identifies that class of object**"),
  §7.8 caution ("**2 in tape over a 2 in label is exactly wrong.**"). §1's
  second paragraph ("Rev C exists because Rev B said that and then stopped") is
  revision narrative in a Purpose section. Heading "7.3 The general rule" says
  nothing a searcher would type.
- **Proposed:** unbold the mid-sentence emphasis (keep bold on the §6 rule
  labels and table labels); move the Rev C narrative to the history row it
  already has; rename §7.3 "7.3 Engrave, encapsulate or laminate: choosing the
  label method" (number unchanged). New sections B-08, B-10, B-13 get
  asker's-word headings: "7.11 Chemical containers and the UC EH&S tag",
  "7.12 Scanning a label", "7.13 Labels with no record (Custom label)".

### B-28 [PROCESS-RULE] §8 checks to add (medium)

- **Doc / section:** CS-001 §8.
- **Evidence:** B-04, B-06, B-08, B-14.
- **Proposed rows:**
  - "Roll labels measure 101.6 mm (DK-2210) | First label of each session |
    Steel rule | none"
  - "Every chemical container on a shelf has its EH&S tag recorded, or an FEB
    label if untagged | 100% | Monthly stock walk, using the EH&S
    reconciliation export | Walk notes"
  - "No thermal-roll label on anything that gets IPA, acetone or resin | 100% |
    Spot check | none"
  - "Every shelf holding tracked material has a storage record and its label |
    100% | Monthly stock walk | Confirm contents on the shelf page"

### B-29 §9 Records misses what the app now keeps (low)

- **Doc / section:** CS-001 §9.
- **Evidence:** EH&S barcode on lots and locations; the public mirror
  (`pub/<ID>`); the device and team label media (`localStorage`
  `feb-label-media`, `config/labels`, `labels.js:577-622`); shelf walk date
  (`walkedAt`, `walkedBy`).
- **Proposed:** add the EH&S barcode (join key to campus RSS), the public
  nameplate and how it is rebuilt, and the shelf's contents-confirmed date.
  Label media is a device setting, not a record; mention it in §7.1 only.

### B-30 §3 References need CS-014 and the code (low)

- **Doc / section:** CS-001 §3.
- **Proposed:** add "CS-014 (receiving, lots and the EH&S tag)" once cluster G
  confirms the number, and an app-code row: "`app/labels.js` (label layout,
  QR budget), `app/scan.js` (scan resolution), `app/q.html` (public page)" so
  a future reviewer knows where the numbers live (STYLE.md §2 allows a code
  table as a source).

---

## What is right and should not change

- §6's three rules (no label on the working surface, 40 mm flange keep-out,
  no silicone-adhesive tape). The 40 mm figure is also printed on every mold
  label footer as `KEEP-OUT 40MM` (`labels.js:434-436`).
- §7.4's three identification layers and the "record of record" engraving;
  §7.4's apply-after-sealing rule and reprint on re-seal. The mold label key
  line is exactly `SEALED <date> · <who> · USES nn · REV x`
  (`labels.js:427-437`), matching the `SEALED 2025-11-02 · USES 09` example.
- §7.5's "print two, never peel and re-stick" relocation.
- §7.7's write-on-the-cup rule for mixed pots, and its 8 min XCR pot life
  (CS-004 §5 table and §7.3 agree).
- §7.8's overlaminate method and the "tape wider than the label" rule.
- §4's QR payload rules: uppercase `HTTPS://FEB-COMPOSITES.WEB.APP/Q/<ID>`,
  alphanumeric mode, version 3 at level Q, 14-character ID budget
  (`labels.js:37-70`, `firebase.json` `/Q/**` rewrite, `test_qr.mjs`).
- The R&D mark: on the ID row, not a class word, mirrored to the scan page as
  "R&D build — a real part, not a season deliverable." (`labels.js:229, 382`),
  and the traveler stamp `R&D — NOT A SEASON DELIVERABLE` (`print.js:112`,
  uppercased by `.ws-stamp`).
- Coupons: `CPN-SNx-###` and `RDS-SNx-###` are 11 characters and carry a QR;
  marker on the tab, printed label on the bag or tray.
- §7.1's "Start at cell" and calibration bar wording match the builder
  ("Start at cell", "Include the 100 mm calibration bar") for sheets.
- Avery 5161 and 5522 grids (`labels.js:526-529`).

---

## Slack (#composites C092PTYH9V0, #aerodynamics C02R91J5HU2)

Searched since 2026-08-01 for label, labels, printer, QR, sharpie, marker,
EHS, barcodes, tag, storage, inventory, app. Nothing since 2026-09-01 changes
labelling practice. Relevant messages:

- Simon, 2026-08-26 22:34 PDT, "Composites App Release / Suggestions Thread"
  (ts 1787808874.121659,
  https://cal-electric.slack.com/archives/C092PTYH9V0/p1787808874121659):
  "Have app barcodes sync with RFS chemicals barcodes so we can use the same
  for both" (struck through, done) and "purchase / connect sequential label
  maker..." (not struck, still open). Nick in the same thread wants cut-list
  pieces "labeled and it's clear what goes to what".
- Nick Jepsen, 2026-06-16 (ts 1781635481.411929, thread 1781560223.314509):
  asks for "a general protocol document" for the barcodes before the EH&S
  inventory check. Supports B-08.
- 2026-08-28: Nick "working on chemical inventory", Simon "flat panel tests
  and inventory" (the day of the EH&S import work).
- #aerodynamics: no label hits since 2026-09-01.
