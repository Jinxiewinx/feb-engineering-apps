# CS-XXX Title of Standard

Read `02 CS Standards/STYLE.md` before you write. The H1 above is `# CS-0xx Title`; the Title field below and the CS-INDEX row repeat that title exactly (CS-000 §4). Delete each guidance line as you fill its section.

| | |
|---|---|
| **Doc ID** | CS-XXX |
| **Title** | Full title |
| **Revision** | A |
| **Status** | Draft, pending Lead signature / Released / Retired (a doc is never "Released" while its Approver row is blank; Under Revision is shown in CS-INDEX only) |
| **Effective date** | YYYY-MM-DD |
| **Supersedes** | None (or the prior doc or practice) |

**Approvals**

| Role | Name | Date |
|---|---|---|
| Author | | |
| Reviewer | | |
| Approver (Composites Lead) | | |

The Reviewer row names the review of the current revision, with its date. An agent review is written "simon (reviewer agent)"; a shop procedure also names the member who walked it (CS-000 §7.1 step 5).

**Revision history**

| Rev | Date | Author | Description of change |
|---|---|---|---|
| A | YYYY-MM-DD | | Initial issue |

One row per revision letter, oldest first: what changed and why. The last row's date is the Effective date above, and its letter is the Revision. Agent work is credited as "Claude (what was done, requested by name)".

---

## 1. Purpose

One paragraph: what this standard controls and why it exists (cite the pain point or incident that motivated it, e.g. PP-XX).

Headings are `##` and `###` only, numbered `n.` and `n.n`, and worded the way a member would ask: "7.3 Degassing the resin", not "7.3 Preparation".

## 2. Scope

What parts/processes/materials this applies to, and what it explicitly does not cover.

## 3. References

| Ref | Document | Where |
|---|---|---|
| R1 | Product TDS/SDS | `03 Datasheets/<file>.pdf` |
| R2 | Related standard | CS-YYY |
| R3 | Pain point / incident record | PP-XX (FEB-COMP-PP-001) |

## 4. Definitions

Terms and shorthand used below (write for a first-semester member). Use shall, should and may as CS-000 §4 defines them.

## 5. Equipment & Materials

| Item | Spec / product | Source | Notes |
|---|---|---|---|

## 6. Safety

Mandatory section, even if it only says "no physical hazards, process standard." For anything touching chemicals, machines, or dust: PPE (which glove/filter standard), ventilation, exposure notes from the SDS (cite it), and what to do when it goes wrong. Numbers here too: "adequate ventilation" needs a where, "respirator" needs a cartridge type.

## 7. Procedure

Numbered steps. One action per step. State the number (time, temperature, ratio, grit, torque) in the step, never "see elsewhere". If a number lives in a TDS, restate it here AND cite the TDS; the member with gloves on does not open PDFs.

1. Step.
2. Step.

> Cautions use blockquote lines like this, and only for cautions. They render as ⚠ CAUTION callouts in the .docx; the PDF shows them indented only.

[PHOTO: description of the photo that belongs here]

A figure is one image line on its own, in the form `![Caption in the words a member would search for](figures/csXXX-name.png)`: the caption is the alt text and the build numbers it. The SVG source goes in `02 CS Standards/src/figures/` (CS-000 §7.1 step 4, STYLE.md §5).

## 8. Quality checks / acceptance criteria

| Check | Target | Method | Record where |
|---|---|---|---|

## 9. Records

What must be written down (usually: which work-order fields this standard fills), and where photos go.

## Appendix

Optional: background, RCA history, alternatives considered.
