# How the composites documents are written

This is the house style for everything in `02 CS Standards/`: the CS
standards, the quick references (QR-xxx), and their figures. It also covers
the Steve material in `06 Composites App/steve/`. Every agent or person
drafting, editing or checking one of these reads this first.

CS-000 is the authority on how documents are numbered, revised and approved.
Where this file repeats CS-000 it says so, and if the two ever disagree,
CS-000 wins and this file gets fixed.

Written 2026-10-10 for the documentation overhaul. The markdown in `src/` is
the only editing surface; the Google Docs copies from August are history (see
`GOOGLE-DOCS.md`).

## 1. Who reads these

A first- or second-year member at RFS with gloves on, tired, reading on a
phone. Then Paul, the app's helper, who searches these files and quotes them
back as FEB's rules. Write for both: plain steps a person can follow, in
sections a keyword search can find.

## 2. Wording

- **No em dashes** in new prose. Use a comma, a period, parentheses, or two
  sentences. (CLAUDE.md rule 5.)
- **Bold is for labels**, such as a definition term or a table header, not
  for emphasis in the middle of a sentence. The one standing exception is a
  rule CS-000 already bolds.
- Cut hedges ("generally", "it may be worth"), hollow intensifiers ("really",
  "critical" used as decoration), copula dodges ("serves as", "acts as",
  "boasts") and the "it's not X, it's Y" pivot. State the thing.
- Vary sentence length. A short sentence after a long one is how a rule lands.
- **Normative verbs** (CS-000 §4). **Shall** is a requirement. **Should** is the
  default you could defend out loud at the Monday meeting. **May** is an
  allowed option. A numbered step in a §7 procedure is a requirement even
  without "shall". Changing a shall to a should, or the reverse, is a
  process-rule change: it needs its own line in the overhaul register and in
  the revision history.
- **One action per step.** The number goes in the step (time, temperature,
  ratio, grit, vacuum level), never "see elsewhere". If the number is in a
  datasheet, restate it and cite the datasheet.
- **App names exactly as the app shows them.** Tab names, buttons, field
  labels and menu paths are copied from the code, not paraphrased: "Receiving
  desk", "Recently deleted", "⋯ → Announce this release". If you cannot find
  the label in `06 Composites App/app/`, do not write it.
- **IDs in their real formats**: `WO-SN6-###`, `CPN-SNx-###`, `RDS-SNx-###`,
  `STK-SN6-###`. Check the format in the code that generates it.
- **Units**: keep the units the standard already uses. Do not convert unasked.
  Where a datasheet gives both, keep both.
- **Every number has a source**: a TDS/SDS in `03 Datasheets/`, a test report,
  a recorded work-order measurement, or a code table (`app/resins.js` holds,
  `app/materials.js` ratios). "We've always done it this way" is not a source;
  if that is all there is, say so in the text (CS-000 §7.1 step 3).
- **Team holds versus datasheet figures**: always say which is which. The
  team's cure hold is longer than the datasheet on purpose (CS-008 §5.1).
- **Other people's voice stays.** Simon's own writing keeps its em dashes and
  its phrasing. This style applies to Claude's prose.

## 3. Formatting

- Every standard keeps CS-Template's nine sections in order. §6 Safety is
  mandatory, even when it only says "no physical hazards".
- A `>` blockquote renders as a CAUTION callout. Use it for cautions only.
- Headings are `##` and `###`, numbered `n.` and `n.n`. Nothing deeper: the
  search splits at `###` and no lower.
- **Phrase headings with the words people ask with.** "7.3 Degassing the
  resin" beats "7.3 Preparation". Paul's search scores heading words higher
  than body words.
- **Keep section numbers stable.** About 50 `CS-0xx §n.n` references live in
  app code and in other standards. If a renumber is unavoidable, update every
  reference in the same change; `tools/check_traceability.py` lists any that
  no longer resolve.
- `[PHOTO: …]` placeholders stay until a lead supplies a real shop photo.
  Never invent a photo, and never put a member's face in this repo: it is
  public.
- Tables for anything with more than two columns of facts (materials,
  checks, records). Bullet lists only for content that is a list.

## 4. Revision tracking

This section applies CS-000 §7.2 to the overhaul.

- **One letter per standard per change set.** The 2026-10 overhaul bumps each
  standard it touches by exactly one letter, however many rounds it took.
- **One history row per bump**: date, author, then what changed and why, one
  line each. Author for agent work: "Claude (doc overhaul, requested by Simon
  Starbuck)".
- **The header, the last history row and the CS-INDEX row agree** on the
  revision letter, and the Effective date is the last row's date.
- **Status** stays "Draft, pending Lead signature" until the Composites Lead
  signs the Approver row. A blank Approver row is never Released (CS-000 §4).
  The Reviewer row records who reviewed and when; an agent review is written
  "simon (reviewer agent)".
- While a draft is in flight, CS-INDEX shows that standard as Under Revision.
- **A path fix rides free.** Renaming a folder and updating the path string
  inside a standard is not a prose edit and needs no bump (Simon,
  2026-09-02). Record it in `src/rev-exemptions.txt` so the bump check
  accepts it.
- Typo fixes may wait for the next content revision (CS-000 §4).

## 5. Figures

- SVG is the source, in `src/figures/`. `node tools/render_figures.mjs`
  renders each to a 2x PNG beside it, and the markdown references the PNG.
- **Type**: Saira for titles, Inter for labels, a monospace face for IDs and
  part numbers. The renderer embeds Saira and Inter from
  `05 Design System/fonts/`; do not embed fonts in the SVG itself.
- **Colour**: Berkeley Blue `#003262`, California Gold `#FDB515`, ink
  `#141d2b`, muted `#515f74`, hairline `#dde3ec` (from
  `05 Design System/tokens.css`). Colour is enhancement only.
- **Every distinction survives a grayscale print**: line weight, hatching,
  solid against hollow, labels. If two things differ only by hue, the figure
  fails (CS-000 §7.1 step 4).
- **Legible at 6.5 in print width**: no text smaller than about 9 pt at that
  width. For a 1000-unit-wide viewBox that is roughly 22 units.
- Self-contained: a `viewBox`, no external images, fonts or links.
- The caption lives in the markdown image alt text, not inside the drawing.
  The build numbers captions; do not write "Figure 3" yourself.
- **Variants** for comparison live in `src/figures/variants/<name>.<a|b|c>.svg`
  and are rendered with `node tools/render_figures.mjs --variants`. Nothing
  in `variants/` ships. The chosen one is copied into `figures/` and the
  choice and its reason go in `variants/CHOICES.md`.
- **A changed figure gets a new filename** (`cs006-infusion.v2.svg`), because
  the app's host caches PNGs for a year under the old name.

## 6. Quick references (QR-xxx)

Quick references are short, derived documents that put a standard's key
numbers and steps where Paul finds them fast. They are not standards and
carry no approval table.

- **Header**: Doc ID, title, `Parent` (the standard and section it is drawn
  from, e.g. `CS-008 §5.1`), and `Checked against` (the parent's revision,
  e.g. `CS-008 Rev E`). A quick reference about using the app names the code
  it describes instead: `Covers: app/receiving.js`.
- **The parent wins.** If a quick reference and its standard ever disagree,
  the standard is right and the quick reference is fixed. The check fails a
  quick reference whose parent has moved past its "Checked against" revision.
- **Numbers are copied, never new**: every number comes from the parent or a
  datasheet, with the citation.
- **Written for search**:
  - each `##` section stands alone and runs 300 to 2,400 characters;
  - the answer is in the first 240 characters of the section (that is all the
    search result shows);
  - the heading uses the asker's words;
  - an `Also called:` line lists the other names people use (degas /
    degassing, UT / undertray, AT30 / hardener, bag / vacuum bag).
- Files sit beside the standards as `src/QR-0xx.md` so they share `figures/`.

## 7. Steve material

Steve is the team's joke helper "from Fibreglast", always a little wrong and
always upselling. His notes live in `06 Composites App/steve/`, outside the
served `app/` folder and outside Paul's search.

- **No numbers.** No ratios, times, temperatures, pressures, percentages or
  quantities. The server strips them anyway; don't write them.
- **No safety or PPE content at all**, and no wrong advice that could hurt a
  person or ruin a part or mold for good. His wrongness lives in technique
  opinions and in buying more product than the job needs.
- **Only real products**: every product named exists in
  `functions/steve_catalog.json`, cited by its handle.
- Never disparage Fibreglast or its products. Never claim to speak for them.

## 8. Checking your work

Before a draft is handed on:

```bash
python3 tools/check_traceability.py
```

It checks the INDEX against the files, citations, revision history order,
header against INDEX, a body change without a bump, em dashes, quick
reference parents, `§n.n` cross-references and figure files.
