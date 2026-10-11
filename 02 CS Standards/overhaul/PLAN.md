# Documentation overhaul: standards, figures, Paul/Steve reference, datasheets

## Context

The CS standards (CS-000..013 + INDEX) were last touched 2026-09-02. Since
then the app went from ~v5 to v6.8.0: receiving desk, lots, EH&S tags and the
RSS import, restock rules, several molds per part and the "Tooling cut" stage,
issue dispositions, soft delete, person fields, layup techniques with
checklists, the Fusion add-in, AI receipts/slips/jug labels, and Paul + Steve.
None of that is in a standard. Paul searches the standards (213 of 448 corpus
sections) and quotes them as FEB rules, and Steve searches the same corpus, so
a stale standard now becomes a stale answer at the layup table.

Findings that shape the plan:
- Built `.docx` and PDFs are stale (pre-2026-09-02 `04 Datasheets` / `03 App`
  paths). Only `corpus.json` reads the current markdown.
- Known errors: CS-004:37 cites "CS-006 Appendix A" (it is CS-003); CS-000:58
  names a Drive location; `HANDOFF.md:26-27` uses old folder numbers;
  `materials.js:65-66` Airtac TDS button opens the 2005 MSDS;
  `materials.js:46-47` WEST-209 "3:1 by weight" (TDS: 3:1 by volume, 3.68:1 by
  weight). Paul's `MAT:` record inherits both errors.
- 11 `[PHOTO: …]` placeholders; CS-011/012 have no figure; all 13 figures use
  Helvetica/Courier, not the app's Saira/Inter.
- Paul has no app manual, nothing on degassing or cores, and datasheet titles
  in the corpus are cleaned filenames ("1386A 2 1386B 2"). Retrieval is plain
  keyword match, split at `#/##/###`, 2,400-char cap, first 240 chars shown.
- Steve's catalog: 564 products, 446 untyped.
- Drive copies were not edited after 2026-09-03, so nothing needs pulling back.

Decisions with Simon (2026-10-10):
- **Google Docs dropped.** Markdown in the repo is canonical again; Drive copies
  are left alone and marked historical.
- Standards stay **hidden** in the Documents tab; Paul cites them.
- **Quick-reference docs in Paul's corpus** and a **Steve-only material set**
  that never enters Paul's corpus.
- One new standard: **CS-014 Receiving, Lots & EH&S**.
- CS-011 §6 co-storage: **agents draft it; Simon reviews before it lands.**
- **Several medium workflow runs**, one per round, each under ~10 agents,
  pushed between rounds (~45-55 agents total).

## Deliverables

1. CS-000..013 each revised one letter, CS-INDEX revised, CS-014 new (Rev A).
2. All figures restyled to the design system, chosen from competing variants;
   new figures for CS-011 (storage/transport), CS-012 (purchase → reimburse),
   CS-014 (delivery → lot → shelf), and an updated CS-013 records map.
3. Quick references `QR-001..~012` in `02 CS Standards/src/` (Paul's corpus,
   unlisted in the Documents tab, built to PDF so chips open).
4. Steve material in `06 Composites App/steve/` → `functions/steve_kb.json`,
   plus a category map for the 446 untyped catalog rows.
5. New TDS/SDS in `03 Datasheets/` with INDEX rows and `materials.js` links.
6. Tooling: lints, font-correct figure rendering, variant review sheet.
7. Stale side docs fixed: README, HANDOFF, `GOOGLE-DOCS.md`, app README's Ask
   Paul section (no Steve, "stays for the tab"), DESIGN-NOTES tool/round counts.

## House rules every agent gets

These go into one file, `02 CS Standards/STYLE.md`, written in Round 0. Every
workflow prompt says "read STYLE.md first" and every fact-checker scores
against it. Some of it restates CS-000; STYLE.md cites CS-000 rather than
competing with it.

**Wording**
- CLAUDE.md rule 5: zero em dashes in new prose; bold only for labels; no
  hedges, no "serves as", no "not X, it's Y"; vary sentence length.
- Normative verbs per CS-000 §4: **shall** = requirement, **should** = default
  you could defend at Monday meeting, **may** = option. A numbered §7 step is a
  requirement. Don't upgrade a should to a shall (or the reverse) without a
  register entry saying why.
- One action per step; the number lives in the step, never "see elsewhere".
- Write for a tired sophomore at RFS with gloves on.
- App names exactly as the UI shows them (tab, button, field labels), checked
  against the code, e.g. "Receiving desk", "Recently deleted", "⋯ → Announce".
  IDs in their real formats (`WO-SN6-###`, `CPN-SNx-###`, `STK-SN6-###`).
- Units: keep whatever the standard already uses; don't convert unasked. Every
  number cites its source (TDS/SDS in `03 Datasheets/`, a test report, a WO
  measurement, or a code table such as `resins.js` holds). Team holds and
  datasheet figures are always named as which-is-which (CS-008 §5.1).
- Preserve Simon's own voice where it appears; this sweep is of Claude prose.

**Formatting**
- CS-Template's nine sections, §6 Safety mandatory; `>` blockquote = CAUTION.
- Headings `##`/`###` only, numbered `n.n`, phrased with the words people ask
  with (Paul scores heading words +3). Keep existing section numbers where
  possible: ~52 `CS-0xx §n.n` references live in app code and markdown, and
  a renumber needs every one updated (the new lint catches misses).
- `[PHOTO: …]` placeholders stay until a lead supplies a photo; never invent
  one, never pull member photos into this public repo.

**Revision tracking**
- One letter bump per standard for the whole overhaul, not one per round.
- One history row per bump: date, author "Claude (doc overhaul, requested by
  Simon Starbuck)", what changed and why, one line each.
- Header Revision = last history row = INDEX Rev; Effective date = that row's
  date. Status stays "Draft, pending Lead signature"; Approver stays blank
  (Nick signs; CS-000: blank approver is never Released). Reviewer row records
  the `simon` reviewer agent and date.
- INDEX shows "Under Revision" for a doc while its draft is in flight (R2-R6),
  back to Draft at promotion.
- Process-rule changes (any shall/should added, removed or changed) are
  listed separately in the register and in the final report so Nick and Simon
  can see what the rules now say, not only that prose moved.
- Path fixes ride free (Simon, 2026-09-02); the bump lint takes an exemption
  file for them.

**Figures**
- SVG source in `src/figures/`, PNG via `render_figures.mjs`, markdown refs the
  PNG. Saira for titles, Inter for labels, monospace for IDs; colors from
  `05 Design System/tokens.css` (Berkeley blue/gold) as enhancement only.
  Every distinction survives grayscale (line weight, hatching, solid/hollow).
- Legible at 6.5 in print width: no text under ~9 pt equivalent.
- Self-contained SVG, `viewBox` required, caption in the markdown not the art.
- Variants live in `src/figures/variants/<name>.<a|b>.svg`, never in
  `figures/`; the pick is recorded in `variants/CHOICES.md`.
- A restyled figure gets a new filename (`cs006-infusion.v2.png`) because
  hosting caches PNGs as immutable for a year.

**Quick references (QR-xxx)**
- Derived documents, not standards: header carries `Parent: CS-0xx §n.n` and
  `Checked against: CS-0xx Rev X` (app how-tos: `Covers: receiving.js`). When
  a QR and its parent disagree, the parent wins; the lint fails when the
  parent's Rev moves past "checked against". CS-000 Rev D defines this family.
- Written for retrieval: each section 300-2,400 chars and self-contained,
  answer in the first 240 chars, heading in the asker's words, an "Also
  called:" line with aliases (degas/degassing, UT/undertray, AT30/hardener).
- Numbers only copied from the parent or a datasheet, with the citation.

**Steve material**
- No numbers at all (steveGuard strips them anyway), nothing about safety or
  PPE, no wrong advice that could hurt someone or a part irreversibly. His
  wrongness stays in technique opinion and over-buying.
- Only products that exist in `steve_catalog.json`; never disparage
  Fibreglast; no claims of speaking for them.
- Lives outside `app/` (hosting serves all of `app/`); a test asserts no Paul
  corpus section comes from it.

## Rounds

Every round: pushes to main when it ends (CLAUDE.md rule 1), SESSION-STATE
"Now" updated with the round number and what's next, README touched when a
user-visible thing changes. Drafts live in `02 CS Standards/overhaul/` (not
served, not in the corpus) until Round 7 promotes them, so main and the live
app never hold a half-updated standard. Each workflow run is its own
resumable unit.

### Round 0: tooling and baseline (me, no workflow)
Small commits, each pushed:
1. `STYLE.md`; `GOOGLE-DOCS.md` marked historical; README:211-217 and
   HANDOFF:117-123 say markdown is canonical; memory note
   `cs-standards-google-docs.md` rewritten.
2. Rebuild stale docx/PDFs from current markdown (baseline, no content change).
3. `gen_docs_manifest.py`: fail on a PDF render error instead of falling back
   to `.md`; deterministic docx pick; `QR-*.md` glob + "Quick reference"
   category in `UNLISTED`; `SOURCE_DATE_EPOCH`.
4. `build_ai_corpus.mjs:63` regex → `/^(CS|QR)-\d+\.md$/`, with `kind` and
   `parent` fields.
5. `render_figures.mjs`: inject Saira/Inter from `05 Design System/fonts/` as
   one base64 `@font-face` block at render time, `setContent` instead of a
   data URL, wait on `document.fonts.ready` and assert the font loaded,
   `--variants` mode, a review sheet (each variant color + grayscale), PNG hash
   file.
6. `check_traceability.py` lints, warn-only at first: header ↔ INDEX (status by
   keyword), history order and last-row match, body-changed-without-bump vs
   last `v*` tag (exemption file), em-dash count, QR parent/drift, `§n.n`
   cross-refs resolve to headings (markdown + app JS), figure exists and hash
   matches. CS-014 needs an H1 `# CS-014 …` and an INDEX row.
7. `materials.js` Airtac and WEST-209 fixes; `resins.js` into the hygiene
   check; SDS/TDS content check (an `sds` link's page text must read as a
   safety sheet; Rohacell allowlisted).

### Round 1: gap audit (workflow, 8 agents, read-only)
One auditor per cluster compares the standard text against app code, `git log`
since each doc's last rev, SESSION-STATE/HANDOFF, `#composites` Slack since
2026-09-01 (keyword searches per CLAUDE.md), and the datasheets. Output
`overhaul/R1-audit/<cluster>.md`: each finding with evidence (file:line, sha,
Slack ts), a proposed change, and a type (wrong / missing feature / stale path
/ style / process-rule change).
- A: CS-000, INDEX, template (markdown canonical, QR family, lints)
- B: CS-001 labels (roll labels, Data Matrix, EH&S UC tags, lot labels)
- C: CS-002 + CS-013 (techniques + checklists, issue disposition, soft delete,
  person fields, several molds per part, R&D)
- D: CS-003 + CS-005 (Tooling cut stage, stack planner, Fusion add-in, split
  waiver, datum cut plans)
- E: CS-004/006/007/008 (resin holds as lead config, degassing gap, XCR)
- F: CS-009 + CS-010
- G: CS-011 + CS-012 + CS-014 scope (receiving desk, Incoming, AI slips and
  receipts, restock rules, "Charged to", co-storage)
- H: Paul/Steve gap finder: eval cases, PAUL_SYSTEM, corpus coverage; proposes
  the QR list and the Steve material outline. Does not read anyone's chats.

Then me: merge into `overhaul/REGISTER.md` (one row per change: id, doc, §,
type, evidence, decision). Process-rule rows get flagged. I decide the rest
and keep going (rule 3); anything that would change how a member physically
does a step gets a one-line note in the round report.

### Round 2: drafting (workflow, ~9 agents)
One drafter per cluster rewrites from the register into
`overhaul/drafts/CS-0xx.md` with the revision bump and history row already in.
Plus CS-014 (new) and a separate `overhaul/proposals/CS-011-s6.md` for
Simon's review (not merged into the draft). A paired critic per two clusters
reads each draft against STYLE.md and the register and sends back a diff of
misses; drafters do one revision pass.

### Round 3: graphics (workflow, ~9 agents)
Figure list: the 13 existing plus CS-011, CS-012, CS-014 and QR card figures
(cure-hold timeline, bag stack, label anatomy reused).
- Drafters A (faithful restyle) and B (rethink what the figure should show)
  each take ~8 figures, so every figure gets two variants. One agent per brief
  per half of the list: 4 drafters.
- `render_figures.mjs --variants` + review sheet.
- 2 judges: the `ui-reviewer` agent on the rendered sheets (legibility,
  grayscale survival, design-system match), the `simon` persona on shop
  usefulness. Disagreements: I pick, recorded in CHOICES.md with the reason.
- A third variant only for figures both judges scored low.

### Round 4: quick references and Steve material (workflow, ~8 agents)
Candidate QRs (final list comes from Round 1 H):
QR-001 mix ratios & cure holds card; QR-002 infusion setup checklist;
QR-003 wet layup bag stack checklist; QR-004 mold seal & release sequence;
QR-005 labels & IDs; QR-006 receiving a delivery / lots; QR-007 work-order
life and buy-offs; QR-008 PPE and handling by chemical (from the SDSs,
including glove choice for acetone); QR-009 glossary & aliases; QR-010 where
things are in the app; QR-011 Fusion add-in plan stock; QR-012 bag leaks and
dry spots troubleshooting.
Steve: `steve/fibreglast-lines.md` (product families in his voice),
`steve/upsell-map.md` (topic → catalog categories), and a category map for the
446 untyped rows applied as an offline step after `toRow`. Wiring: a
Steve-only `search_steve_notes` tool in `AGENTS.steve.tools`
(`functions/index.js:647`), test lists at `test_functions.mjs:393,677`
updated, guard test added.
3 QR drafters, 1 Steve drafter, then 2 critics (STYLE + retrieval shape), then
1 retrieval tester that runs the corpus search locally for ~30 likely shop
questions and reports which ones land on the wrong section.

### Round 5: datasheets (workflow, ~5 agents; can run beside Round 2)
Research agents find the current manufacturer PDF URLs (manufacturer or
distributor domains only), with size and revision date. **Before anything is
downloaded I ask you once with the full list** (file, source, size). Then
fetch into an isolated scratch dir, `pdftotext` to confirm it isn't a scan,
rename to `[\w .\-'&]` only, add INDEX rows, link in `materials.js`.

Tier 1, safety, in use now: West System 105/205/206/209 SDS (CS-007/008 cite
an SDS that isn't on file); 3M DP420 SDS; acetone SDS; IPA SDS; Lime Line
acrylic urethane clear TDS+SDS (isocyanate); Frekote 700-NC TDS+SDS; West 404
TDS+SDS; Bondo SDS; vacuum pump oil SDS; a current Airtac 2 SDS to replace
the 2005 MSDS; a nitrile glove chemical-resistance chart (feeds QR-008).
Tier 2, design numbers: Coastal tooling board TDS+SDS (dust); EC 3D-core,
flow mesh, 2-in-1 mesh/peel ply; Airtech spiral wrap and breather; tacky tape
(also settles the CS-006 vs restock vendor conflict); copper mesh spec;
3M A/P100 cartridge spec.
Tier 3, ask a person: Sigmatex cloth (sponsor contact), ACP Nomex and CF tube
(behind a login). These go on a list for a lead, not fetched.
Also: dedupe the overlapping West 105 TDS files (keep the newest, INDEX notes
which superseded which; old files stay because they are cited).
Seven `RESTOCK_SEED` keys lack a `MATERIALS` row (FLOW-MESH, TACKY-TAPE, …);
add rows where a datasheet now exists.
Test `test_app.mjs:3195` hard-codes 25 datasheets; update the count.

### Round 6: fact-check (workflow, ~9 agents, two passes)
Adversarial, read-only, each agent on a slice:
- 3 number checkers: every number in drafts and QRs against datasheet text
  and `resins.js`/`materials.js`/`inventory.js`.
- 2 app-claim checkers: every UI name, ID format, workflow and gate against
  the code.
- 1 cross-ref checker: every `CS-0xx §n.n` and every QR parent.
- 1 style checker using the `avoid-ai-writing` skill in detect mode against
  STYLE.md.
- 1 `simon` persona reviewer (00 Agent/simon.md) scoring shop usability.
- 1 Steve safety checker: any number, PPE, or harmful-wrong advice in Steve
  material or reachable through it.
Findings → me → fixes → a second pass only over what failed.

### Round 7: promote, build, ship (me)
1. Copy drafts into `src/`, figures into `figures/`, QRs into `src/`; INDEX
   rows, statuses back to Draft, Next free → CS-015, notes paragraph for the
   overhaul (and a "candidates" line, see Future work).
2. Update `PAUL_SYSTEM` rule 1 and the `search_docs` description to mention
   quick references and "the standard wins over a QR"; Steve prompt points at
   his notes. Update `eval_askpaul.js` (accept a QR whose parent is the
   expected standard; add cases for CS-014, QR-001, QR-008, an app how-to)
   and `eval_steve.js` (a case that tries to pull a number out of his notes).
3. Build order: `render_figures` → `build_docx.py --all` →
   `gen_docs_manifest.py` → `build_ai_corpus.mjs` → `check_traceability.py`
   (lints flipped from warn to fail) → test suites.
4. Commit and push in pieces (standards, figures, QRs, Steve, datasheets).
5. `node tools/release.mjs 6.9.0` with WHATS_NEW in shop words (hosting only).
6. **Functions deploy (`firebase deploy --only functions:askPaul`) is not
   under the standing authorization. I'll ask you at that point.** It goes
   after hosting so new chip paths exist first.
7. CS-011 §6 proposal waits for your yes before it goes into CS-011.

## Verification

- `check_traceability.py` clean with lints in fail mode; `test_app.mjs`,
  `test_functions.mjs`, `test_drawings.mjs` (3 known red unchanged),
  `test_designsystem.mjs` pass.
- Grayscale review sheet for every chosen figure; open three PDFs
  (CS-006, CS-014, QR-001) and check figure fonts and captions render.
- Corpus: local search for the Round 4 question set lands on the right section;
  no section sourced from `steve/`.
- Live: `curl` the new PDFs and `manifest.json` off `feb-composites.web.app`;
  after the functions deploy, `eval_askpaul.js` and `eval_steve.js` in a
  signed-in browser session (Steve bar 5/6 or better; Paul no regressions on
  the existing 17), plus one real question through the panel and a check that
  the source chip opens the new PDF.
- Final report: process-rule changes listed separately, datasheets still
  missing, photos still wanted.

## Future work (recorded in INDEX notes, not drafted now)

- Candidate standards: sandwich cores & degassing; forged CF & structural
  bonding; AI helpers in the shop (what Paul/Steve/AI fills may be trusted
  for). Numbers get reserved only when drafting starts (CS-000 §7.1).
- Nick signs approvals → Released.
- 11 photo placeholders: a lead picks shop photos (none of members' faces;
  the repo is public).
- Showing standards in the Documents tab, if wanted later: one line in
  `UNLISTED`.
- Member-facing guide to Paul and Steve, and a maintainer doc for the corpus
  (both offered today, not chosen).
- Datasheet freshness: a yearly check that vendor revisions haven't moved.
