# R1 audit, cluster A-meta: CS-000, CS-INDEX, CS-Template

Auditor: Claude (doc overhaul Round 1, requested by Simon Starbuck), 2026-10-10.
Read-only audit. Nothing outside this file was edited.

Sources read: `STYLE.md`, `overhaul/PLAN.md`, `src/CS-000.md`, `src/CS-INDEX.md`,
`template/CS-Template.md`, the headers of `src/CS-001..013.md`, `GOOGLE-DOCS.md`,
`src/rev-exemptions.txt`, `src/figures/cs000-lifecycle.svg`,
`tools/check_traceability.py`, `tools/README.md`, `tools/gen_docs_manifest.py`,
`tools/build_docx.py`, `tools/build_ai_corpus.mjs`, `functions/index.js`
(PAUL_SYSTEM, search_docs), `functions/context.js`, `functions/corpus.json`,
`app/documents.js`, `app/resins.js`, `app/core.js`, SESSION-STATE, HANDOFF,
CHANGELOG, README, `git log --since=2026-08-28` with `git show` on 45613d5,
97a486c, b16baa0, 94a674b, bb5cc0b, a8e6660, 7de5d56, 9092f0d, 15664ea.
`python3 tools/check_traceability.py` run today: all pass, one em-dash warning
(CS-001).

Slack: `#composites` (C092PTYH9V0) read from 2026-09-01 to today, plus keyword
searches (standard, SOP, prepreg, bend, perimeter shear, fridge, Wednesdays,
"CS Standards"). Read only; nothing sent, reacted or drafted.

Finding IDs are `A-nn`. Types follow the plan: wrong, missing, stale-path,
style, process-rule. Every process-rule row is also listed in section 2.

---

## 1. Findings

### CS-000 Documentation Standards, Template & Revision Process (Rev C)

**A-01 · wrong · high · CS-000 §5 (line 58)**
- Current: "Documents live in the team Drive under `Composites > Standards` (source + PDF/docx), and the master list is CS-INDEX."
- Evidence: Google Docs retired 2026-10-10 (45613d5; `GOOGLE-DOCS.md:3-8`; PLAN.md:31-32). The Drive folder was never `Composites > Standards` anyway: it was a "CS Standards" folder at Simon's My Drive root (`GOOGLE-DOCS.md:11-17`). The real locations: source `02 CS Standards/src/*.md`; docx beside it (`build_docx.py:249-253`); PDFs at `06 Composites App/app/docs/standards/CS-0xx.pdf` (`gen_docs_manifest.py:139-145`), unlisted in the Documents tab (`UNLISTED`, `gen_docs_manifest.py:50`). Paul is quoting this wrong line today: it is corpus section `CS-000#6` in `functions/corpus.json`, so "where are the standards kept?" gets the Drive answer.
- Proposed: "None; this is a process standard. Each standard's source is its markdown file in `02 CS Standards/src/` in the team repo, with figures as SVG in `src/figures/`. Everything else is built from that source: a .docx beside the sources and a PDF the app serves at `docs/standards/CS-0xx.pdf` (the Documents tab does not list the standards; Paul's source chips open the PDF). The August 2026 Google Docs copies are retired and frozen (`GOOGLE-DOCS.md`). The master list is CS-INDEX."

**A-02 · missing · high · CS-000 §4 + new §7.5: the quick-reference family**
- Current: CS-000 knows only CS-XXX standards, work orders and formal deliverables (§2, §4).
- Evidence: STYLE.md §6 defines QR-xxx and says "CS-000 is the authority on how documents are numbered" (STYLE.md:8-10); PLAN.md:122 "CS-000 Rev D defines this family". Tooling already treats them as a family: `gen_docs_manifest.py:143-145` ("Quick reference" category, unlisted), `build_ai_corpus.mjs` regex `/^(CS|QR)-\d+\.md$/` with `kind: "quickref"` and `parent` (b16baa0), `check_traceability.py` lint 10.
- Proposed §4 definition: "**Quick reference (QR-XXX)**: a short derived document, numbered QR-001 upward, that restates a standard's key numbers and steps where Paul and a member find them fast. It is not a controlled document: no approval table, no status. Its header names a `Parent` (the standard and section it is drawn from, e.g. `CS-008 §5.1`) and `Checked against` (the parent's revision, e.g. `CS-008 Rev E`); a quick reference about using the app names `Covers` (the app files it describes) instead. Where a quick reference and its parent disagree, the parent is right and the quick reference is fixed."
- Proposed new §7.5 "Writing or updating a quick reference" (appended, so §7.1 to §7.4 keep their numbers):
  1. Take the next free QR number from CS-INDEX and add its row there (reserves the number, same rule as §7.1 step 2).
  2. Copy `template/QR-Template.md` (see A-30). The H1 is `# QR-0xx Title`; the header table carries Doc ID, Title, Parent (or Covers) and Checked against.
  3. Copy every number from the parent or a datasheet, with the citation. A quick reference never introduces a number.
  4. Write each `##` section to stand alone, 300 to 2,400 characters, with the answer in its first 240 characters and an `Also called:` line (STYLE.md §6).
  5. Run `python3 tools/check_traceability.py`; it fails a quick reference whose Parent does not resolve or whose parent has moved past its "Checked against" revision.
- Type note: adding QR as a document family is a decision Simon made (PLAN.md:33-34), so this is "missing", not a new rule. The re-check obligation in A-04 is the rule.

**A-03 · missing · high · CS-000 §7.2: build and publish steps**
- Current: §7.2 ends at "Announce released revisions in the weekly summary message." Nothing says how an edited markdown file becomes the PDF a member opens or the section Paul quotes.
- Evidence: the pipeline exists and is ordered in `tools/README.md:134-142` (render_figures, build_docx --all, gen_docs_manifest, build_ai_corpus, check_traceability). The 2026-09-02 path fixes reached `src/` but the built copies were never rebuilt, so "ten .docx files and eight in-app PDFs still told members to look in 04 Datasheets and 03 App" for five weeks (97a486c message). Paul's corpus only changes on a functions deploy (`tools/README.md:127`; bb5cc0b: "Paul keeps the old 209 ratio until then").
- Proposed new steps appended to §7.2 (existing steps 1 to 4 keep their numbers):
  5. "Rebuild the outputs from the repo root: `node tools/render_figures.mjs` (only if an SVG changed), `tools/.venv/bin/python tools/build_docx.py --all`, `python3 tools/gen_docs_manifest.py`, `node tools/build_ai_corpus.mjs`, then `python3 tools/check_traceability.py`. Commit the source and every rebuilt file together."
  6. "A revision is not in members' hands until the app's hosting is deployed (the in-app PDF), and not in Paul's answers until `functions` is deployed (the corpus). Do both, and say in the history row's commit which deploys carried it."
- Also §7.1 step 6 should point at step 5 and 6 above, since a new standard needs the same build.

**A-04 · process-rule · medium · CS-000 §7.2: dependants of a revision**
- Current: no rule about documents that pin a standard's revision or quote its numbers.
- Evidence: `04 Printables/printables.html` cards pin CS-006 Rev A, CS-007 Rev A, CS-005 Rev B, CS-013 Rev A (lines 54-367), all now stale (SESSION-STATE "Now" bullet; HANDOFF.md:128-130 already says a printables change is part of a revision). QR "Checked against" drift fails lint 10 under `--strict`. About 52 `CS-0xx §n.n` references live in app and functions code and 62 in the standards (grep today), and `check_traceability.py` lint 11 is the only thing that catches a renumber.
- Proposed new §7.2 step (after step 3): "Update everything that depends on the old revision in the same change: each quick reference whose Parent is this standard (re-check it and move its Checked against), each printables card that names the revision, and every `CS-0xx §n.n` reference in other standards and in the app's code if a section number moved. `check_traceability.py` lists the quick references and references that no longer agree."
- Flag: this adds a "shall"-strength obligation (numbered step). Needs a register row.

**A-05 · process-rule · medium · CS-000 §4 Revision: path fixes and one letter per change set**
- Current: "Any change to procedure content bumps the revision; typo fixes may be batched into the next content revision." (line 50)
- Evidence: Simon, 2026-09-02, "a path fix rides free" (CLAUDE.md rule 5; memory `path-fix-no-rev-bump.md`; `GOOGLE-DOCS.md:38-44`). Now enforced mechanically through `src/rev-exemptions.txt` and lint 8 (94a674b). STYLE.md §4 adds "one letter per standard per change set, however many rounds it took". CS-012 took two letters in one day (E and F, both 2026-08-29, INDEX notes line 29), which the new rule would have merged.
- Proposed: "**Revision**: letters, starting at A. Any change to procedure content bumps the revision by one letter per change set, however many drafts it took. Typo fixes may be batched into the next content revision. A path fix (a renamed folder or file updated inside the text) needs no bump; record it in `src/rev-exemptions.txt` so the bump check accepts it."
- Flag: "one letter per change set" is a new rule in CS-000 (it is only in STYLE.md today). The path-fix part only records an existing Simon decision.

**A-06 · process-rule · medium · CS-000 §7.2 step 2 and §4: where "Under Revision" is written**
- Current: §7.2 step 2 "Set Status → Under Revision in CS-INDEX". §4 says of Released: "The header must say so itself, because members read headers, not the INDEX footnotes."
- Evidence: STYLE.md §4 and PLAN.md:98 put every in-flight standard in "Under Revision" on the INDEX during R2-R6, while the drafts live in `overhaul/drafts/` and the `src/` headers stay "Draft, pending Lead signature". `check_traceability.py:190` lint 6 compares header status with the INDEX status by keyword, so that state produces 14 warnings (and 14 failures once R7 flips `--strict`). Members read the PDF built from the `src/` header, not the INDEX (CS-000's own reasoning, line 51).
- Proposed (recommended): "Set Status → Under Revision in CS-INDEX and in the header of the current `src/` copy at the same time. A status-only header edit is not a content change and needs no letter." Then rebuild the PDF so the member sees it. Alternative if Simon prefers the header untouched: say "in CS-INDEX only" explicitly and make lint 6 accept INDEX "Under Revision" against any header status.
- Flag: changes what a member sees on the PDF header during a revision.

**A-07 · process-rule · high · CS-000 §7.1 step 6: how the lead signs**
- Current: "The Composites Lead approves: name + date in the approval table, Status → Released, CS-INDEX updated."
- Evidence: every standard is unsigned (all 14 headers, "Approver (Composites Lead) | | |"). HANDOFF.md:47-50 asks the lead to sign. With Google Docs retired, the approval table lives only in markdown in a git repo; Nick Jepsen (SN6 lead) does not commit to it. Nothing says what counts as a signature, so nothing can ever become Released.
- Proposed: "The Composites Lead approves in writing (a Slack message or a comment on the PDF naming the document and revision is enough). Whoever maintains the repo records it: the lead's name and the date in the Approver row, Status → Released in the header and CS-INDEX, and a link to the approval in the commit message."
- Flag: defines what a signature is. Nick and Simon should see it.

**A-08 · process-rule · medium · CS-000 §7.1 step 5: the reviewer**
- Current: "Get one reviewer who did NOT write the draft to walk the procedure mentally (or physically, for shop procedures) and comment."
- Evidence: the Reviewer rows record an agent: "simon (reviewer agent)" in 12 of 14 headers, and STYLE.md §4 standardises that wording. An agent cannot walk a shop procedure physically. CS-001's Reviewer row is blank; most rows carry no date; CS-004 and CS-006 carry the July G-round date although they have been revised three times since (headers above).
- Proposed: "An agent review (recorded as `simon (reviewer agent)` with its date) satisfies this step for a process standard. A shop procedure also needs a member who did not write it to walk it before the lead signs; record their name in the Reviewer row beside the agent's. The Reviewer row names the review of the current revision, with its date."
- Flag: decides whether an AI review counts toward Release.

**A-09 · process-rule · medium · CS-000 §2 Scope: values the app enforces that a lead can change**
- Current: §2 lists CS standards, work orders and formal deliverables. Nothing on app configuration.
- Evidence: three rule sets now live in Firestore config, lead-editable, outside any standard: cure holds (`config/resins`, `resins.js:45-50`, "changing a number no longer means a deploy"); layup technique checklists with gates and their own `rev` (`config/techniques`, 7de5d56, 9092f0d: "Saving writes the WHOLE steps array and bumps rev"); restock rules (`config/restock`, `inventory.js:83`). CS-008 §5.1 states the holds as numbers; a lead override in the app silently makes the standard wrong.
- Proposed §2 addition: "Some rules are enforced by the app from values a lead can change there: the team cure holds, the layup technique checklists and the restock rules. The standard that owns each one (CS-008, CS-002/CS-013, CS-011) states the rule and the value at its current revision and names the app as the live value. A lead who changes one of these in the app shall open a revision of the owning standard (§7.2) within two weeks, so the two do not drift."
- Flag: new shall. Alternative: the standard stops stating the number and only points at the app's "why N hours?" view; weaker for Paul and for print.

**A-10 · process-rule · medium · CS-000 §2/§4: AI output is not a source, and how Paul treats Draft**
- Current: §7.1 step 3 lists acceptable sources (TDS/SDS, test report, recorded measurement). §4: Draft is "usable as guidance, not yet the rule".
- Evidence: PAUL_SYSTEM rule 1 says "the team's procedures live in the CS standards" (`functions/index.js:435`) and STYLE.md §1 says Paul quotes them "as FEB's rules", but every standard is Draft. The corpus carries no revision or status per section (`build_ai_corpus.mjs` section shape; `context.js:340-343` docSource returns doc/title/section/src only). AI fills exist for receipts, packing slips and jug labels (48f7a9b, c93020c), and Paul can search the web (6b2803c).
- Proposed: §2: "Paul's answers, Steve's notes, and anything an AI read off a receipt, slip or label are not controlled documents and are never a source under §7.1 step 3; cite the datasheet, record or standard the number came from." §4 Status, after Draft: "Paul cites a Draft standard as the team's current guidance and names its revision." Tooling note for R7: add `rev` and `status` to each corpus section so the chip can show them.
- Flag: the Draft sentence changes what members are told an answer means. Simon decides whether "guidance" or "rule" is the word Paul uses.

**A-11 · wrong · medium · CS-000 §8 table and §4: "Monday meeting"**
- Current: §4 "a reason you could say out loud at the Monday meeting"; §8 "Lead checks at Monday meeting".
- Evidence: Nick, #composites 2026-09-20 21:54 PDT, ts 1789966467.645809: "the new meeting time for this semester is 6:30 - 7:30 on Wednesdays". The same phrase is in CS-002:77, CS-005:80 ("Monday night"), CS-013:130,137,141 and STYLE.md:35.
- Proposed: "the weekly meeting" everywhere (survives the next semester's move). Series-wide; clusters C and D own the other lines. STYLE.md §2 needs the same edit.

**A-12 · missing · medium · CS-000 §7.1 step 4: figure conventions**
- Current: SVG in `src/figures/`, PNG by `render_figures.mjs`, grayscale survival, blue and gold as enhancement.
- Evidence: STYLE.md §5 and b16baa0: Saira for titles, Inter for labels, monospace for IDs, injected at render time from `05 Design System/fonts/`; the renderer refuses a figure whose font did not load; legible at 6.5 in (about 9 pt; 22 units on a 1000-wide viewBox); caption in the markdown alt text, numbered by the build; variants in `figures/variants/`, never shipped, pick recorded in `variants/CHOICES.md`; a changed figure gets a new filename because hosting caches PNGs for a year; `figures/.hashes.json` lets lint 12 catch a stale PNG.
- Proposed step 4: "Draw a figure where one carries the geometry better than prose (keep-out zones, stack-ups, plumbing, anything dimensioned). The SVG in `02 CS Standards/src/figures/` is the source; `node tools/render_figures.mjs` renders it to PNG in Saira and Inter, and the markdown references the PNG with the caption as its alt text. Every distinction must survive a grayscale print (line weight, hatching, solid against hollow); Berkeley blue and gold are enhancement only. No text smaller than about 9 pt at 6.5 in print width. A changed figure gets a new filename. Details are in STYLE.md §5."

**A-13 · missing · medium · CS-000 §8 checks**
- Current: four rows, all by eye ("Skim headers", reviewer walk-through).
- Evidence: `check_traceability.py` lints 6-12 (94a674b): header vs INDEX, history order and last row, body changed without a bump, em dashes, QR parent and drift, `§n.n` cross-references, figure exists and is current. Builds are byte-reproducible (97a486c; `tools/README.md:45-48` uses "rebuild an unchanged standard" as the encoding check).
- Proposed rows to add:
  - "Header, last history row and CS-INDEX agree; history letters in order | 100% | `python3 tools/check_traceability.py --strict` | Commit"
  - "Every `CS-0xx §n.n` reference resolves; every figure is current | 100% | same | Commit"
  - "Quick references checked against the parent's current revision | 100% | same | QR header"
  - "Built copies match the source | An unchanged standard rebuilds byte-identical | Rebuild and `git status` | Commit"
- And change row 1's method from "Skim headers" to the script.

**A-14 · missing · low · CS-000 §3 References**
- Current: R1 pain points, R2 template, R3 CS-013.
- Proposed additions: R4 `02 CS Standards/STYLE.md` (house style; CS-000 wins where they differ); R5 `tools/README.md`, "Generators and the document pipeline"; R6 `tools/check_traceability.py`; R7 `02 CS Standards/GOOGLE-DOCS.md` (historical record of the Drive copies). R2 should also name the new `template/QR-Template.md`.

**A-15 · missing · low · CS-000 §9 Records**
- Current: "CS-INDEX is the record."
- Evidence: the commit history of `02 CS Standards/src/` is the full edit record (every rebuild and path fix is a commit; GOOGLE-DOCS.md shows what happens when the record lives elsewhere).
- Proposed: "CS-INDEX is the record of what exists and its status. Each standard's revision history says what changed and why. The repo's commit history of `02 CS Standards/src/` is the record of every edit, including path fixes that took no letter (`src/rev-exemptions.txt`)."

**A-16 · missing · low · CS-000 §7.4 Annual handoff review**
- Current: "Each summer, the incoming lead skims every Released standard with the outgoing lead..."
- Evidence: no standard is Released, so a literal reading reviews nothing. Nick became SN6 lead in April 2026; no handoff review is recorded in CS-INDEX notes.
- Proposed: "every Released or Draft standard". Record in the INDEX "Handoff review" block (A-21) that the summer 2026 review was not held because the series was written that summer, and that the first is due before fall recruiting 2027.

**A-17 · style · low · CS-000 §1 Purpose (line 32)**
- Current: "On a student team, turnover isn't a risk, it's a schedule."
- Evidence: the "not X, it's Y" pivot STYLE.md §2 cuts. The Author row says "Simon Starbuck (drafted with Claude)", so authorship of this line is unclear.
- Proposed: ask Simon first; if it is Claude's: "On a student team, turnover runs on a schedule: every lead leaves." If it is Simon's, keep it.

**A-18 · style · low · CS-000 §7 blockquote (line 92) and bold (line 69)**
- Current: `> A standard nobody can find is a standard that doesn't exist. CS-INDEX is the single place...`; "add a row there with Status = Draft **immediately**".
- Evidence: STYLE.md §3: a blockquote renders as a CAUTION callout, cautions only. This is a maxim. Bold "immediately" is emphasis, not a label or a rule.
- Proposed: move the maxim to a plain sentence closing §7.4 or §9 ("Keep CS-INDEX current at the moment of change, not later: it is the one place that lists every document, its revision and its status."). Drop the bold on "immediately". Keep the two bolded rules (blank approver never Released; post-incident two-week review); STYLE.md §2 names them as the standing exception.

**A-19 · missing · low · CS-000 §2: Steve**
- Evidence: STYLE.md §7; `build_ai_corpus.mjs` header comment (b16baa0) says Steve's notes are never read into the corpus.
- Proposed one line in §2: "Steve's notes (`06 Composites App/steve/`) are a joke character's material, not documents under this standard, and are never cited."

### CS-INDEX Composites Standards Master List (Rev G)

**A-20 · missing · high · CS-INDEX: CS-014 row and next free number**
- Current: "Next free number: **CS-014**."
- Evidence: PLAN.md:36 and :43 (CS-014 Receiving, Lots & EH&S, Rev A, drafted in R2). CS-000 §7.1 step 2 reserves the number by adding the row "immediately" when drafting starts.
- Proposed: at R2 start add `| CS-014 | Receiving, Lots & EH&S | A | Draft, pending Lead signature | Drafted | PP-02, PP-10 |` (pain points per `pain-points.md` §5: PP-02 lead-time/min-stock, PP-10 storage and live locations) and "Next free number: CS-015".

**A-21 · style + missing · medium · CS-INDEX notes paragraph (line 29)**
- Current: one 2,629-character paragraph mixing the Release rule, next free number, and dated change notes from 2026-07-28 to 2026-08-29.
- Evidence: unreadable on a phone (STYLE.md §1); over the 2,400-character section cap if the INDEX ever enters Paul's corpus (it does not today: the corpus regex is `^(CS|QR)-\d+\.md$`); CS-000 §7.4 step 2 sends handoff findings "into CS-INDEX notes" but there is no place for them; it contains two em dashes and a bold "**not**" used for emphasis.
- Proposed structure (headings in the words people ask with):
  - `## How to read this list`: the depth key (line 10), and "A standard is Released only when the Composites Lead signs its approval table (CS-000 §7.1); the header and this list change together."
  - `## Standards` (the existing table).
  - `## Quick references` (new table, A-22).
  - `## Next free numbers`: CS-015, QR-0xx.
  - `## Change log`: one dated bullet per change set, newest first, each one line on what moved and why. The current notes split into bullets for 2026-07-28, 2026-08-01, 2026-08-27, 2026-08-28, 2026-08-29, plus a 2026-10 overhaul bullet written at R7.
  - `## Handoff reviews (CS-000 §7.4)`: date, leads, outcome per standard.
  - `## Candidate standards` (A-26).
- The 2026-08-27 bullet loses its two em dashes: "...for the R&D build: a part that is real carbon on a real deadline but is not a season deliverable." and "An R&D record enforces exactly like any other (the opposite of a retro record in that respect), and the ID never carries the distinction..." Drop the bold on "not a class word".

**A-22 · missing · high · CS-INDEX: quick references are not listed**
- Evidence: CS-000 §7.4 callout: "CS-INDEX is the single place that lists every document". QRs (R4) will be in the corpus and served as PDFs but appear nowhere a lead looks.
- Proposed second table: `| Doc ID | Title | Parent (or Covers) | Checked against |`. No Rev, Status or Depth: quick references have no approval (STYLE.md §6). Lint 5 should check this table against `src/QR-*.md` the same way it checks standards.

**A-23 · wrong · medium · CS-INDEX: titles and status wording disagree with headers**
- Evidence (H1 / header Title field / INDEX Title):

| Doc | H1 | Header Title | INDEX |
|---|---|---|---|
| CS-003 | Mold Design & Manufacturing | Mold Design & Manufacturing (Tooling Board) | Mold Design & Manufacturing |
| CS-004 | Mold Sealing, Release & Surface Prep | Mold Sealing, Release & Surface Preparation (Polyurethane Tooling Board) | Mold Sealing, Release & Surface Prep |
| CS-005 | CNC Machining of Tooling Board (ShopSabre) | CNC Machining of Tooling Board — ShopSabre @ RFS | CNC Machining of Tooling Board (ShopSabre) |
| CS-009 | Trimming, Sanding & Finishing | Trimming, Sanding & Finishing of Cured Composites | Trimming, Sanding & Finishing of Cured Composites |
| CS-010 | CF Grounding & Electrical Bonding | Carbon Fiber Grounding & Electrical Bonding | CF Grounding & Electrical Bonding |
| CS-012 | Purchasing & Reimbursement | Purchasing & Reimbursement (Composites) | Purchasing & Reimbursement (Composites) |

  Every INDEX status reads "Draft, pending signature"; every header reads "Draft, pending Lead signature". Lint 5 passes all of these because it matches the H1 up to the first " (" as a substring of the row (`check_traceability.py:119-123`); lint 6 compares status by keyword only (`:190`).
- Proposed: one title per standard, with the H1 as the canonical form, because the H1 names the .docx (`build_docx.py:250-252`; renaming it leaves the old docx behind, 97a486c) and is the title Paul shows (`build_ai_corpus.mjs` `title = h1`). So: header Title field = H1 minus the ID; INDEX Title = the same text; INDEX status = header status text exactly ("Draft, pending Lead signature"). The longer phrasings move into §1 or §2 of each standard if their information matters (Tooling Board, polyurethane, @ RFS, cured composites). The CS-005 Title field also carries an em dash. Tighten lint 5 to compare the Title field exactly and lint 6 to compare the full status text. Add a CS-000 §4 sentence: "A standard's title is written once, identically, in its H1, its header and CS-INDEX."

**A-24 · missing · medium · CS-INDEX has no revision history**
- Current: header says Revision G, Effective 2026-08-29; no history table.
- Evidence: the INDEX changed twice on 2026-08-29 (f185c62 then 36cf5d5) and its letters A to G cannot be traced to dates. Lint 7 skips it (`std_files` excludes CS-INDEX, `check_traceability.py:176`). STYLE.md §4 requires header = last history row = INDEX for standards but nothing holds the INDEX itself to that.
- Proposed: give CS-INDEX a short "Revision history" table in the same format as a standard. Back-fill is optional; start it at H for the overhaul ("H | 2026-10-xx | Claude (doc overhaul, requested by Simon Starbuck) | CS-014 added, quick-reference table added, notes split into sections, titles and statuses aligned with headers"). Extend lint 7 to CS-INDEX.

**A-25 · wrong · low · CS-INDEX Depth column: photo notes are inconsistent**
- Current: "Drafted (photos at first SN6 use)" on CS-007 and CS-009 only.
- Evidence: `[PHOTO: …]` placeholders in src today: CS-003 1, CS-004 3, CS-006 2, CS-007 2, CS-009 1, CS-010 1 (grep), plus 1 in the template.
- Proposed: either note photos on all six rows or add a "Photos wanted" count column. "Outlined" is no longer used by any row; keep the key line since CS-000 §7.1 still allows a first draft at that depth.

**A-26 · missing · medium · CS-INDEX: candidate standards (not reserved)**
- Evidence and proposal: a `## Candidate standards` block, numbers not reserved until drafting starts (CS-000 §7.1 step 2; PLAN.md:311-313):
  - Sandwich cores and degassing (PLAN.md:311; Paul has nothing on degassing or cores, PLAN.md:24-25). Slack: Nomex vs G10 insert thickness, Simon 2026-10-10 18:00 PDT, ts 1791680440.315469.
  - Forged CF and structural bonding (PLAN.md:312).
  - AI helpers in the shop: what Paul, Steve and AI fills may be trusted for (PLAN.md:312-313; see A-10).
  - Prepreg handling, storage and cure: new practice. Ansh, 2026-09-16 20:09 PDT, ts 1789614567.789899 ("Oliver is looking into getting a fridge ... talk to Larry about prepreg usage at RFS"); Nick's ACP haul 2026-09-03 13:57 PDT (prepreg tooling); Nick's 2026-09-30 23:59 PDT next steps ("early rounds of prepreg testing, pending prepreg from BFR").
  - Laminate test coupons and test reports (3-point bend, perimeter shear, Hesse testing): Nick 2026-09-30 23:59 PDT asks Simon to "Write standard SOPs ... so testing data is valid across different layups"; coupon sizes for the anti-intrusion plate under discussion, Nick 2026-10-10 11:34 PDT, ts 1791657268.876049 (thread 1791656991.890139). May fold into CS-002/CS-013's R&D bench instead of a new number; cluster C decides.

### CS-Template (template/CS-Template.md)

**A-27 · wrong · medium · template §7 caution line (line 64)**
- Current: "> Cautions use blockquote lines like this; they render as ⚠ CAUTION callouts."
- Evidence: only the .docx does that (`build_docx.py:190`). The in-app PDF, which is what members open and what Paul's chips open, renders a blockquote as plain indented text: `pdftotext CS-006.pdf` shows the CS-006 caution with no "CAUTION" label, zero matches for "caution" in the whole PDF. `gen_docs_manifest.py:103-108` runs pandoc with no filter. The corpus keeps the raw `> `.
- Proposed: fix the tooling in R7 (a pandoc Lua filter in `md_to_pdf` that prefixes "⚠ CAUTION:" to a blockquote, matching the docx) and keep the template text. Until then the template should say "they render as ⚠ CAUTION callouts in the .docx; the PDF shows them indented only". Same fix applies to the matching claim in STYLE.md §3.

**A-28 · missing · medium · template: house rules a drafter needs on the page**
- Current: the template predates STYLE.md and the lints.
- Evidence: STYLE.md §2-§5; `check_traceability.py` lints 5-7 and 11 parse the H1, header fields, history rows and numbered headings; `build_ai_corpus.mjs` splits at `#/##/###` and scores heading words.
- Proposed additions as short guidance lines (not new sections):
  - Top: "Read `02 CS Standards/STYLE.md` first. The H1 is `# CS-0xx Title`, and the Title field and the CS-INDEX row repeat that title exactly."
  - Revision history: author for agent work "Claude (<what>, requested by <name>)"; one row per letter; the last row's date is the Effective date.
  - Headings: `##` and `###` only, numbered `n.` and `n.n`, worded the way a member would ask ("7.3 Degassing the resin", not "7.3 Preparation").
  - §4: "Use shall / should / may as CS-000 §4 defines them."
  - §7: a figure line, `![Caption sentence; the build numbers it.](figures/csXXX-name.png)`, with "SVG source in `src/figures/`, see CS-000 §7.1 step 4".

**A-29 · style · low · template header (line 10)**
- Current: "| **Supersedes** | — (or prior doc/practice) |"
- Proposed: "| **Supersedes** | None (or the prior doc or practice) |". Removes the template's only em dash, so new standards do not inherit one.

**A-30 · missing · medium · no quick-reference template**
- Evidence: the parsers expect exact header rows: `build_ai_corpus.mjs` reads `| **Parent** | CS-008 §5.1 |`; `check_traceability.py:233-252` reads `Parent`, `Checked against` ("CS-0xx Rev X") and `Covers` (backticked paths). A drafter guessing the format fails lint 10 silently in warn mode.
- Proposed `template/QR-Template.md`:

```markdown
# QR-0XX Title in the words people ask with

| | |
|---|---|
| **Doc ID** | QR-0XX |
| **Title** | Title in the words people ask with |
| **Parent** | CS-0XX §n.n |
| **Checked against** | CS-0XX Rev X |

<!-- An app how-to replaces the Parent and Checked against rows with:
| **Covers** | `app/receiving.js` | -->

Derived from its parent standard. If this and the parent disagree, the parent is right.

## Question as a member would ask it

The answer in one or two sentences first: the number, with its source (CS-0XX §n.n, or the datasheet name).
Also called: alias one, alias two.

Steps or table. 300 to 2,400 characters per section.
```

### Headers of the other standards against CS-INDEX

Revision letters, effective dates and last history rows agree for all 13 (lints 6 and 7 pass today). Disagreements beyond the titles and status wording in A-23:

**A-31 · wrong · low · Reviewer rows**
- CS-001 Reviewer row is blank (every other standard names "simon (reviewer agent)"). Dates are blank on CS-000, 002, 003, 007, 008, 009, 010, 011, 012, 013; CS-004 and CS-006 carry 2026-07-12 plus a G-round note after an em dash ("— G2a", "— G0 findings incorporated"); CS-005 carries 2026-07-12. None of those dates is the review of the current revision.
- Proposed: the R6 fact-check fills each Reviewer row with the review of the overhaul revision and its date, without the em-dash suffixes (the G-round note can move to the history row if it matters). Owned by each cluster's drafter; CS-000 A-08 sets the rule.

**A-32 · style · low · CS-INDEX H1 em dash**
- "# CS-INDEX — Composites Standards Master List". The H1 names the built docx (`CS-INDEX — Composites Standards Master List.docx`) and the PDF title. Recommend keeping it: renaming changes a file other things may link to, and lint 9 already excludes H1s. Listed so the decision is visible.

---

## 2. Process-rule changes (need human visibility)

| ID | Doc § | Change | Who should see it |
|---|---|---|---|
| A-04 | CS-000 §7.2 | New step: update dependent QRs, printables cards and `§n.n` references in the same change as a revision | Nick, Simon |
| A-05 | CS-000 §4 | One letter per change set (was STYLE-only); path fixes need no letter (records Simon 2026-09-02) | Simon |
| A-06 | CS-000 §7.2 step 2 | "Under Revision" is written in the `src/` header and the INDEX together (or INDEX-only, stated) | Simon |
| A-07 | CS-000 §7.1 step 6 | Defines what a lead's signature is now Drive is gone (written approval, recorded by the maintainer) | Nick, Simon |
| A-08 | CS-000 §7.1 step 5 | An agent review counts as the review for a process standard; shop procedures also need a member walk-through | Nick, Simon |
| A-09 | CS-000 §2 | A lead who changes an app-enforced value (holds, techniques, restock) shall open a revision of the owning standard within two weeks | Nick, Simon |
| A-10 | CS-000 §2, §4 | AI output is never a source; Paul cites Draft standards as guidance and names the revision | Simon |

No finding touches CS-011 §6.

## 3. Figure notes

- `cs000-lifecycle.svg` uses `font-family="Helvetica, Arial, sans-serif"` (line 1), not Saira/Inter (STYLE.md §5).
- Its text is 10.5 to 15 units on an 880-unit viewBox: at 6.5 in print width that is about 5.6 to 8 pt, below STYLE.md §5's 9 pt floor. Labels need roughly 17 units or more at this width.
- It shows only Draft → Released → Under Revision → Released and Released → Retired. Every standard today is Draft, and the overhaul moves Drafts into Under Revision (STYLE.md §4), a path the figure does not draw. Add Draft ⇄ Under Revision.
- It carries the rule sentence "A doc whose Approver row is blank is never Released. No exceptions." inside the drawing. That is a rule, not a caption, so it may stay, but if the grayscale review sheet shows it as the smallest text, move it to the §4 prose (which already says it).
- New figure worth drawing for CS-000: "source to shop", one line from `src/CS-0xx.md` (and `figures/*.svg`) through the build steps to the three places a revision lands (the .docx, the in-app PDF, Paul's corpus), with the two deploys marked, and a QR hanging off its parent with "Checked against". It answers "I edited the standard, why does Paul still say the old thing?" (bb5cc0b is the live example).
- CS-INDEX and the template have no figures and need none.

## 4. Keep (still right, do not change)

- CS-000 §4 normative verbs (shall / should / may; numbered §7 step is a requirement). Only the meeting day changes (A-11).
- CS-000 §4 Status set and the bolded rule "A doc whose Approver row is blank is never Released"; lint 6 enforces it.
- CS-000 §7.2 step 1 post-incident review within two weeks, bolded.
- CS-000 §7.3 "Never delete the file": the app depends on it (`documents.js:7-11`, `gen_docs_manifest.py:39-45` keep every issued PDF at its path).
- CS-000 §7.1 step 3 source rule; `resins.js:13` and `workorders.js:3113` cite CS-000 §8 for it. Keep §8's number.
- CS-000 §3 R1/R2 paths and §7.1 step 3 `03 Datasheets/` are current (fixed in a8e6660).
- CS-000 Appendix (the Mold Sealer Alternatives story) is history and reads well.
- CS-INDEX table columns (Doc ID, Title, Rev, Status, Depth, pain points) and the "Maintained by" line.
- Template's nine sections, §6 mandatory text, `[PHOTO: …]` placeholder, and §7's "the member with gloves on does not open PDFs".
- Section numbers in CS-000: all new content above is appended (§7.2 steps 5-6, §7.5) so no existing reference moves.

## 5. Notes for other clusters and side docs

- "Monday meeting" (A-11) also sits in CS-002:77 (cluster C), CS-005:80 (D), CS-013:130, 137, 141 (C) and STYLE.md:35.
- `tools/README.md:129` still describes `check_traceability.py` as only the pain-point and csRef audit; it now runs lints 6-12.
- `HANDOFF.md:121-130` lists three build commands (no `render_figures`, no `build_ai_corpus`) and says "Everything regenerates and everything churns", which stopped being true with the reproducible builds in 97a486c.
- The Documents tab tooltip says "Documents — datasheets, standards, printables" (`core.js:3582`) although standards and printables are unlisted.
- The PDFs are set in Latin Modern (pdffonts on CS-006.pdf), so figures will be Saira/Inter inside a Latin Modern page. Fine, but worth knowing at R3 judging.
