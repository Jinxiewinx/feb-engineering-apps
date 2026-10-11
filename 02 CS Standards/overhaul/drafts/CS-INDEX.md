# CS-INDEX — Composites Standards Master List

| | |
|---|---|
| **Doc ID** | CS-INDEX |
| **Revision** | H |
| **Effective date** | 2026-10-10 |
| **Maintained by** | Composites Lead (update at the moment any standard changes status, CS-000 §7) |

**Revision history**

| Rev | Date | Author | Description of change |
|---|---|---|---|
| A | 2026-07-12 | Claude | Initial issue: CS-000 to CS-013 listed. |
| B | 2026-07-28 | Claude | Every standard one letter on after the language pass; status written "Draft, pending signature". |
| C | 2026-08-01 | Claude | CS-008 to Rev C, for the FEB hold column. |
| D | 2026-08-03 | Claude | CS-001 out of outline; CS-001 to CS-005 and CS-011 to CS-013 each moved a letter with it. |
| E | 2026-08-27 | Claude | CS-001 and CS-013 to Rev D, for the R&D build. |
| F | 2026-08-28 | Claude | Engineering pass: every standard moved one letter; CS-007, CS-008 and CS-009 out of outline. |
| G | 2026-08-29 | Claude | CS-001, CS-002 and CS-013 caught up with the R&D bench; CS-012 to Rev E, then Rev F the same day. |
| H | 2026-10-10 | Claude (doc overhaul, requested by Simon Starbuck) | Every standard one letter on for the documentation overhaul. CS-014 added. Quick-reference table added. Notes split into sections, with handoff reviews and candidate standards. Titles now repeat each H1 and statuses repeat each header exactly. Photos column added. Rows A to G back-filled from the git history of this file. Register R-IDX-01..07, R-000-16. |

---

## How to read this list

Every standard and every quick reference the team has is listed here, with its current revision. CS-000 is the standard for how they are numbered, revised and approved.

A standard is Released only when the Composites Lead signs its approval table (CS-000 §7.1 step 6); the header and this list change together. Until then it is Draft, which is the team's current guidance. The Status column repeats the standard's header word for word.

While a revision is being drafted outside `src/`, its row here says Under Revision and the standard's own header keeps its status until the revision lands (CS-000 §7.2 step 2).

Depth key: **Drafted** means full procedure, follow it as written (pending approver signature). **Outlined** means all sections present, procedure steps stubbed; complete before first use in anger. No standard is Outlined today.

**Photos wanted** counts the `[PHOTO: …]` placeholders still in the standard. Each one waits for a real shop photo from a lead (no member's face: the repo is public).

## Standards

| Doc ID | Title | Rev | Status | Depth | Motivating pain point(s) | Photos wanted |
|---|---|---|---|---|---|---|
| CS-000 | Documentation Standards, Template & Revision Process | D | Draft, pending Lead signature | Drafted | PP-09 | 0 |
| CS-001 | Part, Mold & Material Labeling | G | Draft, pending Lead signature | Drafted | PP-09, PP-10 | 0 |
| CS-002 | Layup Schedule Specification & Recording | F | Draft, pending Lead signature | Drafted | PP-04, PP-07 | 0 |
| CS-003 | Mold Design & Manufacturing | E | Draft, pending Lead signature | Drafted | PP-03; SN4 lessons | 1 |
| CS-004 | Mold Sealing, Release & Surface Prep | E | Draft, pending Lead signature | Drafted | PP-01 | 3 |
| CS-005 | CNC Machining of Tooling Board (ShopSabre) | F | Draft, pending Lead signature | Drafted | PP-06; Z-plunge incidents | 0 |
| CS-006 | Resin Infusion | D | Draft, pending Lead signature | Drafted | Leak-risk minors; G0 review findings | 2 |
| CS-007 | Wet Layup & Vacuum Bagging | D | Draft, pending Lead signature | Drafted | Clamp/bagging minors | 2 |
| CS-008 | Resins, Mixing & Cure Schedules | E | Draft, pending Lead signature | Drafted | FCF resin starvation; exotherm safety; cure holds | 0 |
| CS-009 | Trimming, Sanding & Finishing | D | Draft, pending Lead signature (photos to add at first SN6 use) | Drafted | Catch-can puncture; PPE | 1 |
| CS-010 | CF Grounding & Electrical Bonding | D | Draft, pending Lead signature | Drafted | PP-05 | 1 |
| CS-011 | Inventory, Storage & Transport | E | Draft, pending Lead signature (storage-map locations to field-verify) | Drafted | PP-02, PP-10 | 0 |
| CS-012 | Purchasing & Reimbursement | G | Draft, pending Lead signature (re-verify tiers/names each fall) | Drafted | PP-02, PP-08 | 0 |
| CS-013 | Work Orders & Part Traceability | G | Draft, pending Lead signature | Drafted | PP-09; bridges to the WO system | 0 |
| CS-014 | Receiving, Lots & EH&S | A | Draft, pending Lead signature | Drafted | PP-02, PP-10 | 0 |

## Quick references

Quick references are short documents derived from a standard (CS-000 §4). They carry no approval and no status. Checked against is the parent's revision the quick reference was last checked against; if a quick reference and its parent disagree, the parent is right. One drawn from several sections names its standard in every entry and has one Checked against per entry, in the same order.

| Doc ID | Title | Parent (or Covers) | Checked against |
|---|---|---|---|
| QR-001 | Mix ratios and cure holds | CS-008 §5; CS-008 §5.1 | CS-008 Rev E; CS-008 Rev E |
| QR-002 | Infusion setup checklist | CS-006 §7.1 to §7.6; CS-006 §7.8 | CS-006 Rev D; CS-006 Rev D |
| QR-003 | Wet layup and the bag stack | CS-007 §7.2 to §7.6 | CS-007 Rev D |
| QR-004 | Mold sealing and release, in order | CS-004 §7.1 to §7.5 | CS-004 Rev E |
| QR-005 | Which label goes where | CS-001 §7.2; CS-001 §7.6; CS-001 §7.11 | CS-001 Rev G; CS-001 Rev G; CS-001 Rev G |
| QR-006 | Receiving a delivery and material lots | CS-014 §7 | CS-014 Rev A |
| QR-007 | Work orders: steps, buy-offs, holds and issues | CS-013 §7.1 to §7.7 | CS-013 Rev G |
| QR-008 | PPE and handling by chemical | CS-003 §6; CS-004 §6; CS-006 §6; CS-008 §6; CS-009 §6 | CS-003 Rev E; CS-004 Rev E; CS-006 Rev D; CS-008 Rev E; CS-009 Rev D |
| QR-009 | Words the team uses | CS-001 §4; CS-006 §4; CS-007 §4; CS-008 §4; CS-013 §4 | CS-001 Rev G; CS-006 Rev D; CS-007 Rev D; CS-008 Rev E; CS-013 Rev G |
| QR-010 | Where things are in the app | Covers `app/core.js`, `app/inventory.js`, `app/paul.js` | None (Covers) |
| QR-011 | Fusion add-in: planning stock | CS-003 §7.1 | CS-003 Rev E |
| QR-012 | Bag leaks and dry spots | CS-006 §7.4; CS-006 §7.7; CS-007 §7.5 | CS-006 Rev D; CS-006 Rev D; CS-007 Rev D |
| QR-013 | Trim, sand and bond prep | CS-009 §7.1 to §7.3; CS-009 §7.6 | CS-009 Rev D; CS-009 Rev D |
| QR-014 | Where things are stored | CS-011 §7.3; CS-011 §6 | CS-011 Rev E; CS-011 Rev E |
| QR-015 | Buying something and getting paid back | CS-012 §7.1; CS-012 §7.2; CS-012 §7.9 | CS-012 Rev G; CS-012 Rev G; CS-012 Rev G |

QR-006, QR-007, QR-011 and QR-015 also describe app screens (`app/receiving.js`, `app/workorders.js`, `app/fusion.js` with `10 Fusion Add-in/`, and `app/budget.js`), but their headers carry Parent and Checked against, not Covers.

QR-008 copies its PPE lines from the parent standards, so it is written only after the PPE decisions held for Simon are made; until then its row reserves the number. QR-014's section on what may share a shelf waits the same way on CS-011 §6.

## Next free numbers

- Standards: CS-015.
- Quick references: QR-016.

A number is reserved by adding its row here when drafting starts (CS-000 §7.1 step 2, §7.5 step 1).

## Change log

Newest first. Each standard's own revision history has the detail.

### 2026-10-10: the documentation overhaul

Every standard moved one letter, CS-000 to Rev D through CS-013 to Rev G, and CS-014 Receiving, Lots & EH&S joined at Rev A. The markdown in `02 CS Standards/src/` is the only source again: the August Google Docs copies are retired and frozen (`02 CS Standards/GOOGLE-DOCS.md`). CS-000 now defines quick references, and fifteen are listed above. The weekly meeting moved to Wednesdays, so the standards say "the weekly meeting" instead of naming a day. Titles in this list now repeat each standard's H1, and the Status column repeats each header. Every change is listed by ID in `02 CS Standards/overhaul/REGISTER.md`.

### 2026-08-29: the R&D bench, and CS-012's printer paragraphs

CS-001, CS-002 and CS-013 (plus the CS-013 figure) caught up with the app's v4.0.0 R&D bench: a coupon is its own record `CPN-SNx-###` under a study `RDS-SNx-###`, both carry QR labels, and bench coupons run without work orders while R&D parts keep full enforcement. The retired `PNL-…-Cnn` spelling survives only on frozen SN5-era records. CS-012 dropped its "Why not more" printer paragraph at Simon's request, so the standard no longer rules printer types in or out. Later the same day, CS-012 → Rev F: the "Model choice" paragraph left §7.8 as well, so the request names one model and argues against none.

### 2026-08-28: the engineering pass

Every standard took an engineering pass at Simon's request, and the series gained drawn figures. CS-000 Rev C defines the normative verbs (shall/should/may) the whole series now reads by and records where figures live (`src/figures/`, SVG source, PNG rendered by `tools/render_figures.mjs`). Twelve standards carry a figure. CS-007 and CS-009 came out of outline into full procedures (their numbers were already in Rev B, only unpacked), and CS-008's §7 dropped a stale "(outline)" label. No process rule changed anywhere: the pass was structure, language and figures, which is why every history row says so.

### 2026-08-27: the R&D build

CS-013 and CS-001 → Rev D together, for the R&D build: a part that is real carbon on a real deadline but is not a season deliverable. CS-013 §4 defines it and §7.1 says when to mark it; CS-001 §4 and §7.6 place the mark on the label's ID line and state outright that it is not a class word, so the class-word list is unchanged and TEST PANEL keeps its single meaning. An R&D record enforces exactly like any other (the opposite of a retro record in that respect), and the ID never carries the distinction, so a build can be moved into the season without a relabel.

### 2026-08-01: the FEB hold column

CS-008 → Rev C, adding the FEB hold column to the resin table and §5.1 explaining it. The work-order app now blocks a demould step until that hold elapses, and the standard had been stating only the datasheet figures.

### 2026-07-28: the language pass

Every doc above got a language pass (fewer em dashes, less decorative bold) plus targeted accuracy fixes. The most substantive: CS-013 now describes the live Firebase app, not the retired offline `work-orders.html`; CS-005 gained a dated web cross-check and a sharpened certified-operator caveat; CS-011 gained a note tying it to the app's Stock tab.

## Handoff reviews (CS-000 §7.4)

- Summer 2026: not held. The series was being written that summer (CS-000 Rev A to Rev C), so there was nothing settled to review. Nick Jepsen was confirmed as SN6 Composites Lead in April 2026.
- The first handoff review is due before fall recruiting 2027 and covers every Released or Draft standard.

## Candidate future standards

Topics that may need their own standard. No number is reserved for any of them; a candidate takes the next free number only when drafting starts (CS-000 §7.1 step 2).

- Sandwich cores and degassing. Honeycomb skins follow CS-007 for now (CS-007 §2); core-specific rules are not written yet.
- Forged CF and structural bonding.
- AI helpers in the shop: what Paul, Steve and the ✨ fills may be trusted for.
- Prepreg handling, storage and cure. New practice for SN6.
- Laminate test coupons and test reports (3-point bend, perimeter shear). This may fold into the R&D bench in CS-002 and CS-013 instead of taking a new number.

A gap with no parent standard: new-member onboarding (RFS access, EH&S trainings, PDM).
