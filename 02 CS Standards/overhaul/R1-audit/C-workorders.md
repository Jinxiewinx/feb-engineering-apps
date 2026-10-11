# R1 audit, cluster C: work orders (CS-002 Rev E, CS-013 Rev F)

Auditor: Claude (doc overhaul, Round 1, requested by Simon Starbuck). Date: 2026-10-10.
Read-only pass. Sources: `02 CS Standards/src/CS-002.md`, `CS-013.md`; app code in
`06 Composites App/app/` (workorders.js, parts.js, core.js, projects.js, rnd.js,
dashboard.js, reports.js, people.js, shop.js, fb.js) and `firestore.rules`;
`app/README.md`, `app/DESIGN-NOTES.md`; SESSION-STATE, HANDOFF, CHANGELOG;
`git log --since=2026-08-28`; #composites (C092PTYH9V0) and #aerodynamics
(C02R91J5HU2) since 2026-09-01.

Both standards were last revised 2026-08-29 (commit f185c62, app v4.1). Since
then the app went to v6.8.0 and these features landed with no standard behind
them: lead-editable layup techniques with versioned checklists (7de5d56, 9092f0d),
the part as the parent of many runs with a plan stack and a Materials (plan) BOM
copied into each run, several molds per part (174b91c), issue disposition with a
required "What was done" (a3f5b77), archive instead of delete (e51362d), soft
delete and Recently deleted (3cd3e97), person fields as roster picks (v6.2.0),
the training gate on buy-offs, self-serve accounts and guest mode (v4.4.0), R&D
moving wholly onto the R&D tab (2978fa2) and studies as folders of parts (10facc9).

Finding IDs below are `C-nn`. Types: wrong / missing / stale-path / style /
process-rule. Every process-rule row is collected again in the last section.

---

## A. CS-002 Layup Schedule Specification & Recording

### C-01 (wrong, high) §5 and §9: where the stack lives

- **Current** (§5, line 58): "The stack table lives in the part's work order (R2)." §9: "The WO ply table (spec + as-built + deviations + photos) is the permanent record."
- **Evidence**: the plan and the as-built are now two records. `core.js:2200-2232` (`stackEdit`): "The part's stack is the SPEC ... A run's stack is the AS-BUILT". Part page section "Layup stack" (`parts.js:1523`); run section "Stack & BOM" (`workorders.js:1385`). Editing the part's plan pushes to every run still on the plan whose "Stack frozen" step is unsigned; editing a run's stack marks it as-built (`wo.stackSource = "asbuilt"`) and never writes back. `newRunForPart` copies `p.layupStack` into the run (`parts.js:1118`).
- **Proposed** §5: "No equipment. The planned stack lives on the part (Parts tab, **Layup stack** section). Each run (work order) gets a copy at creation, and that copy becomes the as-built record in the run's **Stack & BOM** section (CS-013 §7.2)." §9: "The part's plan, each run's as-built stack with its deviations, and the step photos together are the permanent record."

### C-02 (wrong, high, process-rule) §7.2 step 2: who freezes the stack

- **Current** (line 76): "Freeze = ME/RE and the Composites Lead (plus the requesting subteam's lead for cross-team parts ...) initial the WO's stack table."
- **Evidence**: the freeze is one buy-off on the step titled "Stack frozen" (`workorders.js:272,278,283,288`, rule `{ kind: "blocker", needs: ["stack"] }`). It records one signer (`signStep`, `workorders.js:3366`), needs only a non-empty stack (`EVIDENCE.stack`, `workorders.js:578`), carries no training, no lead check and no note requirement. Nothing in the app captures a second or third signature.
- **Proposed**: decide between (a) changing the rule to match the app: "The stack is frozen by buying off the **Stack frozen** step on the run. Before signing, the signer shall have agreed the stack with the part's manufacturing engineer and the Composites Lead (and the requesting subteam's lead for a cross-team part), and shall name them in the step's note." or (b) keeping three signatures and asking for an app change (a `needs: ["note"]` rule on Stack frozen, or a lead-only training). Recommend (a) plus a technique edit adding `needs: ["note"]` to Stack frozen, which a lead can do today from Reports, Layup techniques, without code. **Process-rule: Simon/Nick decide.**

### C-03 (missing, medium, process-rule) §7.2 step 1: freeze before machining is only enforced inside a run

- **Current** (line 75): "The stack freezes before mold machining starts." §8 row 1 method: "WO blocker step".
- **Evidence**: inside a run the order holds (Stack frozen, then Mold design review, then Glue mold stock / Machine mold, all blockers in sequence: `workorders.js:271-274`). But mold progress is tracked on the mold record (stages "Designed", "Tooling cut", "Board glued", "Machined", "Sealed", "Ready for layup", `shop.js:46`) and the cut list advances a mold to "Tooling cut" (31994e0). Neither checks `stackFrozen()`; the only callers outside workorders.js/core.js are display (`parts.js:1313,1351`).
- **Proposed**: keep the rule, change §8 row 1 method to "Run blocker step in the app; for molds advanced on the Molds tab or cut-list, lead check at the weekly meeting that the part's run shows Stack frozen signed". Flag to cluster D (CS-003/005) since the cut list is theirs.

### C-04 (wrong, medium) §7.2 step 3 and §4 "Stack freeze": what a WO revision is now

- **Current**: §4 "the signed decision that the stack will not change without a WO revision"; §7.2.3 "A frozen-stack change requires a WO revision".
- **Evidence**: the run's Revision is a free-text field in Details (`workorders.js:1596,1614`), default "A" (`workorders.js:340`); nothing bumps it. After Stack frozen is signed, part-plan edits no longer reach the run (`core.js:2238-2240`, `stackFrozen`), and the run shows "Stack frozen — the bench is working to this. Editing the part's plan will not move it." (`workorders.js:1645`). Editing the run's stack is still allowed and marks it as-built with a drift count and a compare (`openStackCompare`, `core.js:2263`).
- **Proposed** §7.2.3: "To change a frozen stack, edit the run's stack in **Stack & BOM** (the run then shows how many plies moved from the plan), raise the run's **Revision** by one letter in Details, and write why in the run's Notes. If the change should apply to future runs, press **Adopt as the part's plan** in the compare view." Keep "quick, visible, counted".

### C-05 (wrong, medium, process-rule) §7.4 step 1: "ticks each ply as laid"

- **Current** (line 96): "During layup, the RE ticks each ply as laid and notes any deviation in the WO".
- **Evidence**: the ply table has columns Ply, Material, Orientation, Coverage, Notes and per-row controls ↑ ↓ + ⧉ ✕ (`core.js:2069-2104`). There is no per-ply laid tick anywhere in the code. CS-007 §7 step 2 (`CS-007.md:80`) repeats "Tick each ply as laid on the WO".
- **Proposed**: "During layup, the manufacturing engineer checks each ply against the run's stack (Stack & BOM). Any change (substituted cloth, extra ply, mesh moved) is edited into the run's stack row by row, with the reason in that ply's Notes cell. On the printed traveler, tick each ply in pen." Either that, or ask for a per-ply tick in the app. **Process-rule**: the requirement to tick each ply changes from an app action to a paper action. Tell cluster E (CS-007).

### C-06 (missing, medium) §7.4: plan vs as-built, and the materials actually used

- **Current**: §7.4 covers plies, photos, mass and thickness only.
- **Evidence**: the run's BOM is copied from the part's **Materials (plan)** (`parts.js:1536,1123`). **Consume** on a BOM line (`workorders.js:1674`) logs used quantity, who, when and the cost at that moment; the cure buy-off shows "Materials used — prefilled from the plan, fix any that differ" (`workorders.js:2974`) and for a lot line asks "still fine / running low / now empty". **↩ plan** (`workorders.js:1711`) pushes a run's actual back onto the part. For the stack: divergence banner, side-by-side compare, **Adopt as the part's plan** (`core.js:2275`). A run started with **Use a previous run** can carry "Layup stack as laid" from an earlier run (`parts.js:1066,1073`).
- **Proposed**: new step 4 in §7.4: "At the cure buy-off, confirm or correct **Materials used** for each BOM line; a blank means not measured. If this run proved the plan wrong, press **↩ plan** on the BOM line or **Adopt as the part's plan** on the stack, so the next run starts from what this one learned." (Paul gets asked "how do I log what I used" and has no section to cite today.)

### C-07 (wrong, low) §7.1 step 1: who drafts, and where

- **Current** (line 68): "The part's Manufacturing Engineer drafts the stack as a ply table".
- **Evidence**: the plan is drafted on the part page, **Layup stack** section, "+ ply" button, add-ply modal with fields Material (required), Orientation, Coverage, Notes (`core.js:2111-2125`); caption "P1 is the mold surface. Plies run outward." (`core.js:2081`). Field label is "Manufacturing Engineer" (`parts.js:1287`).
- **Proposed**: "The part's Manufacturing Engineer drafts the stack on the part (Parts tab, **Layup stack**, **+ ply**), one row per ply from the mold surface outward." Keep the 7.3 cross-ref.

### C-08 (missing, low) §4: ME and RE are never defined

- **Current**: "ME/RE" (§7.2.2), "RE" (§7.4.1, §8). Neither doc defines them.
- **Evidence**: the app's person page tags `moldEngineer` as "ME" and `manufacturingEngineer` as "RE" (`people.js:136`). Field labels: "Mold Engineer", "Manufacturing Engineer" (`workorders.js:1604`, `parts.js:1287`). Both are roster picks since v6.2.0 (`core.js:970-978`).
- **Proposed** §4 addition: "**ME / RE**: the part's Mold Engineer (ME) and Manufacturing Engineer (RE), the two engineer fields on the part and its runs. Both are picked from the roster." Same definition in CS-013 §4 (C-24).

### C-09 (stale, medium) §7.2 step 3 and §8: "Monday meeting"

- **Current**: §7.2.3 "reviewed at the Monday meeting".
- **Evidence**: Slack #composites, Nick Jepsen 2026-09-20 21:54 PDT: the new meeting time this semester is 6:30 to 7:30 on Wednesdays (later posts 2026-09-23, 2026-09-29, 2026-10-07 confirm Wednesday 6:30).
- **Proposed**: "the weekly composites meeting". Day-free, so it survives the next reschedule. Same fix in CS-013 (C-27). Note for cluster A: STYLE.md §2 also says "the Monday meeting".

### C-10 (missing, low) §4 cloth naming: materials in use beyond the Sigmatex four

- **Current** (line 53): "88 spread-tow, 195 twill, 220 twill, 670 twill (Sigmatex)".
- **Evidence**: Slack: UD carbon in use, gsm not yet known (Nick, 2026-09-30 23:59, Alvin's item "Determine gsm of unidirectional carbon fiber"); ACP haul brought 2x2 twill and plain-weave fiberglass (Nick, 2026-09-03 13:57); G10 inserts in a Nomex core layup, with a thickness mismatch noted (thread ts 1791598931.301419, 2026-10-10: "the nomex was slightly under .25 and the G10 was slightly above"). Restock row `195-TWILL` (`inventory.js:79`).
- **Proposed**: keep the rule "always gsm, never 'the thick one'". Add: "A cloth whose gsm is not yet measured is written by type and source until it is (`UD carbon, ACP, gsm TBD`), and measuring it is a task, not a footnote. Inserts (G10, aluminium) and their thickness are plies in the table like cores." The G10 note is exactly the deviation §7.4 asks for; the floor closeout and AIP work is where it will be needed.

### C-11 (style, low) "Coupons" heading is unnumbered

- **Current** (line 100): `### Coupons`, no number, under §7.
- **Evidence**: STYLE.md §3: headings `##`/`###`, numbered `n.` and `n.n`.
- **Proposed**: `### 7.5 Coupons: IDs and data files`. No inbound reference points at it (checked `grep "CS-002 §"`), so the number is free.

### C-12 (wrong, low) Coupons paragraph: the study's stack is free text, and two more fields are inherited

- **Current** (line 102): "The study carries the stack, fabric lots, resin and hardener lots once, and every coupon inherits them".
- **Evidence**: `RD_INHERITS = ["stack", "fabricLots", "resinLot", "hardenerLot", "lotSource", "laidOn", "by"]` (`rnd.js:194`). The study's **Materials** fold shows "Layup stack" as a text field, plus "Fabric lot", "Resin lot", "Hardener lot", "Lot record", "Laid up on", "Laid up by" (a roster pick) (`rnd.js:1375-1381`). Clearing a coupon's own cell hands it back to the study (`rnd.js:1371-1373`).
- **Proposed**: "The study's **Materials** carry the layup stack (as text, in the §7.3 order from P1 out, or the ID of the run whose panel the coupons came from), the fabric, resin and hardener lots, the layup date and who laid it up. Every coupon inherits them; a coupon that was different says so in its own row, and clearing that cell hands it back to the study."

### C-13 (missing, low) Coupon test method

- **Evidence**: Slack, Nick 2026-09-30 23:59, Simon's item: "Write standard SOPs ... for this layup method so testing data is valid across different layups." AIP coupon sizes being settled from the rules (Nick 2026-10-10 11:34: 3-point bend 138 x 500 mm, perimeter shear 100 x 100 min, his recollection of the rules, unverified).
- **Proposed**: no text yet. Record in INDEX "candidates" that a coupon test method (3-point bend at Hesse) is being written by Simon, and that CS-002 §7.5 will cite it. Do not invent the numbers.

### C-14 (style, low) §7.3 example row "P5–P6"

- **Current** (line 87): one row for two plies with "0/90, ±45".
- **Evidence**: the app table is one row per ply, numbered P1..Pn automatically (`core.js:2089`); the ⧉ Duplicate control exists for repeated plies.
- **Proposed**: split into P5 `195 twill, 0/90` and P6 `195 twill, ±45`, so the format shown is the format the app accepts. The figure follows (see figure notes).

### C-15 (missing, low) §3 References: the app manual

- **Proposed**: add `R5 | The composites app: Parts, Work Orders, R&D bench | 06 Composites App/app/README.md`. R1's "Where" column says `FEB-COMP-PP-001`; add the path `01 Pain Points and Improvements/src/pain-points.md` beside the ID (path fix, rides free).

---

## B. CS-013 Work Orders & Part Traceability

### C-16 (wrong, high) §5: sign-in and the roster

- **Current** (line 98): "Sign in with email and password; a lead has to add your email to the roster before you can see or touch anything."
- **Evidence**: v4.4.0 (10d4bfb, 2026-09-03) "self-serve accounts with usernames"; README "How access works": anyone creates an account with a name, a username and a password and starts as a member; `firestore.rules` lets an account create only its own roster entry as a member. Guest mode: **View as guest** reads everything, edits nothing (README "Viewing as a guest"). Leads alone delete, restore a backup and change roles.
- **Proposed**: "Make an account on the sign-in page with your name, a username and a password; you start as a member and can work straight away. A lead makes someone a lead on People. **View as guest** reads the whole app and changes nothing, because a buy-off carries a name. When someone leaves, a lead removes them from the roster on People; their name stays on every record they signed."

### C-17 (wrong, high) §7.2 step 2: steps do take photos now

- **Current** (line 116): "photo references (phone photos → the part's Drive folder, filename written on the WO step; WO steps don't take a real upload yet; Tickets and Documents do".
- **Evidence**: each step row has a camera button "Add photos to this step" (`workorders.js:2409`, `addStepPhotos` at 674, uploads to `projects/<woId>/`); step notes open a full composer that takes photos (`openStepNote`, 3403); a **Photos** section gathers step photos, image files and note images (`woAllPhotos`, 651; section at 1390). Steps that need a note suggest a photo before signing (`workorders.js:3333-3338`).
- **Proposed**: "Each step: buy-off, a note, and photos. Press the camera on the step row to attach photos straight from the phone; they land on that step and in the run's **Photos** section. Steps that need a note (machining, the drop test) also ask for a photo, which is suggested and never required."

### C-18 (wrong, high, process-rule) §4.1 rule 3: a re-laid part is a new part

- **Current** (line 87): "Scrap a part for porosity and lay it again and that is a different piece of carbon: new `P` ID, new work order, and `supersedes` pointing at the old one."
- **Evidence**: the app models the opposite. `core.js:2276-2280`: "A part is the durable thing the car needs. A work order is ONE RUN at making it ... A remake after a failed infusion is a second run, not a rewritten first one." README "How parts, runs and molds fit together": "one RUN each at making it (a remake is a second run)". **+ New run** on the part (`parts.js:1360`) offers **Start fresh** or **Use a previous run**. There is no `supersedes` field anywhere in `app/*.js` (grep returns nothing). The issue disposition "Scrap" (`projects.js:18`) closes the issue and leaves the part ID alone.
- **Proposed**: "**A re-laid part is a new run, not a new part.** Scrap a layup for porosity and lay it again: dispose the issue on the failed run as Scrap with why it could not be saved, then start a second run on the same part with **+ New run** (Use a previous run carries the mold, files, stack and BOM). The part keeps its `P` ID; the run ID tells the two pieces of carbon apart." Rule 1 ("An ID names a physical object") then needs a sentence: a `P` record names the part the car needs, and each physical piece of it is identified by the run that made it. This touches CS-001 labels (cluster B: what a part label prints). **Process-rule: Simon/Nick decide.** The figure says "re-laid = NEW ID + supersedes" and must change with it.

### C-19 (wrong, high) §7.1: creating a run, and the part as the parent

- **Current** (line 108): "Open the app → New Work Order → it assigns the next `WO-SN6-###`." Step 2 lists everything to fill at creation, including stack and BOM.
- **Evidence**: the toolbar button is **New WO** (`workorders.js:1192`), not "New Work Order". The intended path starts from the part: **New Part** (`parts.js:674`), then plan the stack (Layup stack) and **Materials (plan)** on it, then **+ New run** (`parts.js:1360`), which copies name, subteam, engineers, deadline, mass target, technique, stack, BOM and the first mold (`parts.js:1107-1127`). A part that already has runs asks **Start fresh — from the part's own plan** or **Use a previous run — pick what to keep** (`parts.js:1065-1066`). The Work Orders rail groups runs by part and lists parts with no run yet, with the button that starts one (README, Work Orders).
- **Proposed** §7.1: "1. Make the part on the Parts tab with **New Part** (it gets `P-SN6-###`), or open the existing one. 2. On the part, fill the requirements before any work: subteam, Mold Engineer and Manufacturing Engineer, layup deadline, target weight, layup type (the technique), the **Layup stack** plan (CS-002) and **Materials (plan)**. 3. Press **+ New run**. The run gets `WO-SN6-###` and copies the part's plan. For a remake, choose **Use a previous run** and tick what to carry. 4. On the run, set the quality checks with numeric targets (mass is pre-filled from the part). **New WO** on the Work Orders tab makes a run with no part; use it only for a one-off job that will never be remade." Steps 3 (cross-team) and 4 (R&D) stay, renumbered after.

### C-20 (wrong, medium) §7.1 step 2: "delete inapplicable ones consciously"

- **Current**: "the app pre-fills steps from the templates; delete inapplicable ones consciously, don't skip silently".
- **Evidence**: a run cannot delete or add its own steps. Steps are copied from the technique at creation (`stepsFromTechnique`, `workorders.js:301`); the only changes afterwards are **Add them** for steps a newer technique version added (`woAddNewSteps`, 1952) and the lead-only "Reset steps", which erases buy-offs (`resetSteps`, 355). Step status is set only by buying off (no status control on a step).
- **Proposed**: "The run's steps come from its technique (the part's layup type). If the checklist does not fit the job, the fix is the technique, not the run: pick the right one before the run starts, or ask a lead to add one (§7.5). A step that genuinely does not apply is signed with a note saying why."

### C-21 (missing, high) Layup techniques: checklists, gates and versions

- **Current**: CS-013 says "standard step list for the process type" and nothing else.
- **Evidence**: Reports tab, **Layup techniques** (`reports.js:388-427`): "A technique is a checklist and the gates on it." Leads: **Edit steps**, **Archive**/**Restore** (custom only; built-ins rename but never archive), **Add a technique** with **Name** and **Start from** (a new technique is always a clone, `workorders.js:1763-1778`). Per step: rule kind ("no rule — an ordinary step", "blocker — nothing later may be signed until this is", "starts the cure — asks for resin and finish time", "a wait, as long as the recorded resin needs", `workorders.js:1730-1735`), evidence and training. Each save bumps `rev`; a run stamps `technique`, `templateVersion`, `templateTs` at birth (`workorders.js:301-309`). A run on an older version shows "The <name> checklist has changed since this run was created" with **Add them** for new steps, touching nothing signed (`workorders.js:1934-1946`). Built-ins: Mold infusion, Glass infusion, Mold wet lay, Foam wrapped, Other (`workorders.js:9`, names from `humanTechnique`). Commits 978d4ea, 9092f0d, 7de5d56.
- **Proposed**: new §7.5 "Layup techniques: the checklists runs are made from". Content: what a technique is; members read them on Reports; leads add (always from a copy), edit, archive; editing never changes an existing run; a run behind the current version offers **Add them**; the Other technique starts with the blocker "Define acceptance criterion: target and method, set before work starts". **Process-rule** (add): "A new or edited technique shall keep a Stack frozen blocker before the first physical step, and an infusion technique shall keep the drop-test blocker." The app warns but does not enforce this (`workorders.js:1833`, the editor row warning). Simon/Nick decide whether that is a shall or a should.

### C-22 (missing, high) §4 Buy-off: trainings gate who may sign

- **Current**: buy-off definition says nothing about training.
- **Evidence**: a step can name a training (`STD_STEPS`, `workorders.js:271-291`): Mold design review needs "Mold design"; Glue mold stock and Machine mold need "ShopSabre CNC"; Dry stack and bag, Drop test and Infuse need "Resin infusion"; Wet layup steps need "Wet layup"; Shape foam core needs "Foam core" (catalog `workorders.js:18-25`). An untrained signer gets "Not yet — this step needs <training> training" with the list of people who hold it (`openTrainingGate`); only a lead can **Sign without it**, with a written reason that goes in the event log (`openTrainingOverride`, `submitTrainingOverride`, 3283-3313). "Leads are NOT implicitly qualified" (`workorders.js:3263`). Trainings are granted by a lead on People (**＋ Record training session**, matrix, **Catalog**, `people.js:88-89`). Engineer fields only warn "not X-trained" (`engWarnHtml`, `workorders.js:203`).
- **Proposed**: add to §4: "**Training gate**: a step that names a training can be bought off only by someone a lead has recorded as holding it on People. A lead may sign without it and must write why; the reason goes in the run's event log. A lead is not trained by being a lead." Add a §8 row (C-29). Cross-reference CS-005 for the RFS ShopSabre HOT, which the app's "ShopSabre CNC" training does not replace (CS-005 §4 says RFS's own record is the authority; Slack 2026-09-18 Nick: RFS student access dashboard shows equipment trainings). **Process-rule** (codifies a gate that already exists).

### C-23 (wrong, medium, process-rule) §4 Buy-off: self-review is a warning, keyed on who created the run

- **Current** (line 54): "self-buy-off allowed except where a step names an independent reviewer, e.g. mold design review".
- **Evidence**: `workorders.js:3340-3344`: if the step title contains "design review" and the signer is `w.createdBy`, a confirm titled "Self-review" says "You created this work order. A design review should be signed off by someone else. Sign it anyway?" with **Sign it anyway**. Any member can proceed. It keys on the run's creator, not on the Mold Engineer. The dashboard ranks a self-review down for the creator (`dashboard.js:258-262,356`). With runs now started from the part (C-19), the creator is whoever pressed **+ New run**, often not the designer.
- **Proposed**: decide the verb and the person. Recommended text: "The **Mold design review** step should be bought off by someone other than the mold's designer. The app warns the person who created the run; the reviewer checks the Mold Engineer field themselves." If the team wants a shall, the app needs a change (key on `moldEngineerEmail`, lead-only override like the training gate). **Process-rule: Simon/Nick decide** shall vs should and which field names the designer.

### C-24 (missing, medium) §4: blocker, cure hold, On hold, and evidence

- **Current** (line 55): "Blocker step: ... (stack freeze, design review, drop test)." No definition of a hold or of evidence.
- **Evidence**: rule kinds blocker / startsHold / hold (`workorders.js:226-246,546-555`). A cure hold is the next step after Infuse / Wet layup and bag / Wet layup over core, as long as the recorded resin needs (`holdState`, 721); a member is refused with "Still curing", a lead gets "Demould early?" and must write why, logged (`openHoldOverride`, 3156). Blocked shows red, curing amber: "A run curing on schedule is a clock, not a fault" (f5dd5a2; DESIGN-NOTES "Sections come in two tiers"). Separately, a run's status can be `OnHold` (`WO_STATUSES`, `workorders.js:8`), which blocks nothing. Evidence: Stack frozen needs a stack, Mold design review needs "the CAD, attached or linked", machining and the drop test need a note (`EVIDENCE`, 576-598); a lead may **Sign without it** with a reason (3239).
- **Proposed** §4 additions: "**Cure hold**: a wait on the step after the one that starts a cure, as long as the team hold for the resin recorded at that buy-off (CS-008 §5.1). Members cannot sign through it; a lead can, with a written reason. **On hold** (run status): parked by a person; it blocks nothing in the app. **Evidence**: what a step needs before it can be signed (a stack, the CAD, a note); a lead can sign without it, with a reason." Extend the blocker list with "acceptance criterion (the Other technique)" and "ME / RE" from C-08.

### C-25 (missing, high) Issues on a run: raise, dispose with what was done, close

- **Current**: CS-013 never mentions issues. The app's gate comment calls itself "The CS-003 enforcement point" (`projects.js:66`) and CHANGELOG 07-27 says "with the CS-003 disposition gates", but CS-003 has no issue or disposition text (grep for disposition/issue across `src/` finds none).
- **Evidence**: **⚠ Raise an issue** at the foot of the Issues section and ⚑ "Report an issue on this step" on each step (`workorders.js:2251,2410`). Dispositions: "UAI (Use As Is)", "Corrective Action", "Rework", "Scrap", "Other" (`projects.js:18`). To close: a disposition, **What happened** (root cause) and **What was done**, whose prompt depends on the method: "Why is it acceptable as it is?", "What was changed so it cannot recur?", "What was done to fix it?", "Why could it not be saved?", "What was done?" (`DISPO_WORDS`, `projects.js:85-91`; gate `statusGate` 66-79). A run cannot be set Complete while an issue is undisposed or unexplained; the closeout modal offers per-row **Resolve**, **Resolve all & complete work order** and **Cancel ticket (false alarm)** (`workorders.js:2587-2597`, `undisposedIssuesForWO` 816). **Reopen** clears the disposition and what was done, keeps the root cause (`projects.js:715-745`). Commit a3f5b77 (Simon, 2026-09-18).
- **Proposed**: new §7.6 "Issues: when something goes wrong on a run", with those steps and labels, stating as rules: "An issue shall be raised on the run it holds up. A run shall not complete over an issue that lacks a disposition, a root cause and an account of what was done. A false alarm is cancelled, not disposed." Then CS-003 does not need to own it; fix the code comment in a later code change (not this overhaul). **Process-rule** (codifies existing gates).

### C-26 (missing, high) Archive, delete and Recently deleted

- **Current**: §4.1 rule 2 mentions "after a delete"; nothing else on removing records.
- **Evidence**: Archive: any member, on the part or run page (edit mode) or **Select…** on the rail; archived records leave rails, dashboard and Season but stay, with who and when; the **archived** chip shows them with **Restore** (`setArchived`, `core.js:758`; e51362d; README Parts "Archive, don't delete"). Delete: lead-only for runs and parts (`woBulkDelete` "Only a lead can delete work orders.", `workorders.js:442`; `partBulkDelete`, `parts.js:400`) and for issues (`projects.js:842`). Every delete is a tombstone: "It goes to Recently deleted and can be restored for 30 days" (`TRASH_DAYS = 30`, `core.js:785`). Deleting a run takes its issues and uploads with it and clears links on parts, molds and panels, all restored together (`workorders.js:421-494`). **Recently deleted** is on Reports, always open, **Restore** per deletion; only a lead can **Empty them** once past 30 days (`reports.js:72-120`). Two paths still hard-delete on purpose: a board cut to zero and undoing a cut (DESIGN-NOTES "The trash").
- **Proposed**: new §7.7 "Putting records away: archive, delete, Recently deleted". Rules: "A finished or abandoned part or run should be archived, not deleted. Delete is for a record that should never have existed, and only a lead deletes. A deleted record can be restored from Reports, Recently deleted, for 30 days; after that a lead empties it and it is gone with its uploads. A deleted ID is never reissued (§4.1 rule 2)." **Process-rule** (the "should archive" is new as a written rule; Simon asked for it 2026-09-03 in e51362d).

### C-27 (stale, medium) §7.4 step 1 and §8: the weekly board

- **Current** (line 130): "Monday meeting: the app's list view (filter: InWork) *is* the part status board". §8 rows 1 and 5: "Lead check at Monday meeting".
- **Evidence**: meeting is Wednesday 6:30 (C-09). The status board is now Reports, "this week's board", with **Print status board** whose masthead carries the open blocker count (README Reports). The Dashboard has lanes **Stopped**, **Waiting on you**, **Due this week**, **On the clock** (README Dashboard; `dashboard.js:224-299`). The Work Orders status filter still exists (`workorders.js:1220`) but is not the board.
- **Proposed**: "At the weekly composites meeting, the lead brings the **Print status board** from Reports (or shows it). The Dashboard's **Stopped** lane lists every run whose next step nobody can sign; clear those first." §8: "Lead check at the weekly meeting".

### C-28 (wrong, medium) §4 R&D and §7.1 step 4: R&D lives on the R&D tab, and the buttons moved

- **Current** (line 111): "*R&D part* beside *New Part*, *R&D run* beside *New WO*". §4: R&D is excluded from "the season part list, ... the Season blueprint and ... the Master Tracker mirror; it is counted and marked everywhere else."
- **Evidence**: 2978fa2 / v6.1.0: R&D parts and runs are on the R&D tab only; both rails filter them absolutely, keeping an **R&D** count chip that jumps to the R&D tab (`parts.js:686-689`, `workorders.js:1210-1213`). The create buttons are on the R&D tab masthead: **+ Study**, **+ Part**, **+ Run** (rendered as an icon plus "Study", "Part", "Run", `rnd.js:819-821`); Parts has only **New Part** and Work Orders only **New WO** (`parts.js:674`, `workorders.js:1192`). The flag on a part with no run is a checkbox labelled "R&D part" in edit mode (`parts.js:892`); after a run exists only a lead sees **Move to season** (`parts.js:895`), one-way, keeps the ID, writes a comment (`promoteToSeason`, 939-970). (The `rnd.js:812` comment saying the buttons are "MIRRORED" is stale; DESIGN-NOTES "The R&D tab IS the home" says "moved, not mirrored".)
- **Proposed** §7.1 step 4: "Start it from the R&D tab with **+ Part** or **+ Run**; a run started on an R&D part is R&D automatically. Until a part has a run, the **R&D part** checkbox on its page can be flipped either way. After that only a lead can press **Move to season**, once, and nothing moves a season part back." §4: "excluded from the Season tab, the Google Sheet mirror and the Parts and Work Orders lists (it lives on the R&D tab, and those lists show an R&D count that jumps there); counted and marked everywhere else, including the Dashboard and Reports."

### C-29 (missing, medium) §2 and §4: when to use a study and when a part, and studies as folders

- **Current**: §2 separates bench coupons from R&D parts but gives no rule for which to make.
- **Evidence**: Slack, Nick Jepsen 2026-09-03 14:03 PDT: members asked to add their projects to the app "either as an R&D project or part+work order depending on which you believe fits your needs best." Studies now group parts and runs as well as coupons (10facc9; README "A study is also a folder"); filing a season part under a study does not make it R&D; deleting a study ungroups its parts and never deletes them; archiving a study leaves its parts alone. Study statuses **Active / Done / Parked** (`rnd.js:57`).
- **Proposed** §2 addition: "Which record to make: test pieces you will cut, measure and compare (coupons, offcuts, trial panels you will not keep) go in a study. Anything with a mold, a checklist or a cure you need to sign is a part and a run, marked R&D if it is not for the car. A study can also hold the parts and runs an effort produced ('split mold tests'); filing a part under a study does not change whether it is R&D."

### C-30 (missing, medium) Person fields

- **Current**: §4 buy-off "name, email, and timestamp"; §7.1 "ME/RE" typed.
- **Evidence**: v6.2.0: every "who" field is a roster pick stored as name plus email (`PERSON_FIELDS`, `core.js:970-978`: Purchaser, Mold engineer, Manufacturing engineer, Sealed by, Bin confirmed by, Laid up by). The picker lists trained people first, offers `Use "…"` for someone not on the app, and never offers "N/A" or "TBD" (README "Who did it"). Screens show the current roster name (`personChipFor`, core.js); the printed traveler prints the stored name (`print.js:158`). A buy-off stores name, email, uid, date and time (`signStep`, `workorders.js:3366`).
- **Proposed** §4: "**Person fields**: every field that names a person (Mold Engineer, Manufacturing Engineer, Sealed by, Laid up by) is picked from the roster, not typed. Pick **Use "name"** only for someone who is not on the app." Buy-off: "the signer's name as it read at the time, their account and the time; screens show their current name."

### C-31 (wrong, low) §7.2 step 5: several molds per part

- **Current** (line 119): "Point the work order at a **mold record** (`MOLD-SNx-###`) rather than only naming one."
- **Evidence**: molds now link on the part as a list (`p.molds[]`, 174b91c; SESSION-STATE "A part's molds are `p.molds[]`; `p.mold` is read-only legacy"). **+ New run** seeds the run with the part's first mold only; "A run on the other half of a split mold is a second run" (`parts.js:1112-1116`). A part with two or more molds shows a stage stepper per mold (830ea4a).
- **Proposed**: "Link the part to its mold records (`MOLD-SNx-###`) in the part's **Mold** section; a split mold is two links. Each run points at the one mold it was laid in, filled from the part's first mold; a run on the other half of a split mold is its own run." Keep "location, sealing record and Parts pulled live on the mold" (field label is "Parts pulled", `shop.js:93`).

### C-32 (missing, low) §7.2 step 4: lots, as-used materials

- **Current**: step 4 describes the three lot fields and "I don't know"; still right.
- **Evidence**: the same modal also carries "Materials used — prefilled from the plan" (C-06) and records how each lot was known, `lotSource` "scanned" / "recalled" / "partial" / "unknown", printed on the traveler (`readLotFields`, `workorders.js:3095-3110`). The option label is "I don't know / not recorded" (`workorders.js:3069`).
- **Proposed**: quote the label exactly; add one sentence: "The same buy-off asks what material each BOM line actually used (CS-002 §7.4). A lot you scanned is recorded as scanned, so a checked lot and a remembered one read differently in March."

### C-33 (wrong, low) §7.3 step 1: Complete is gated

- **Current** (line 124): "Fill qualityChecks actuals ..., attach final photos, mark status Complete."
- **Evidence**: setting Complete with undisposed issues opens the closeout modal (`workorders.js:2518-2534`); quality section label is **Quality** (`workorders.js:1394`), "+ check" adds a row.
- **Proposed**: "Fill the actuals in **Quality** (mass, thickness, Ω table), check the photos, and set the status to Complete. If an issue is still open the app opens the closeout list instead; dispose each one (§7.6)."

### C-34 (missing, low) §4.1 prefix table

- **Current**: 13 prefixes.
- **Evidence**: `fb.js:126` `ID_PREFIX` also mints `BUY` (purchase), `DOC` (document) and `STK` (stack plan, shown as "mold file" on parts). STYLE.md §2 lists `STK-SN6-###` as a real format.
- **Proposed**: add rows `STK | a mold's stack plan: how the mold is cut from tooling board ("mold file" on the part page)`, `BUY | a purchase. Not a physical object`, `DOC | a document in the Documents tab. Not a physical object`. Rule 1 already covers non-physical IDs via the PROJ wording; extend it to name BUY and DOC.

### C-35 (wrong, low) §8 row 1: "Every active part has a WO"

- **Evidence**: with the part as parent, a part legitimately exists before its first run (the Work Orders rail lists "Parts nobody has started ... with the button that starts a run").
- **Proposed**: "Every part has a run before it consumes carbon or machine time | 100% | Work Orders rail: parts with no run are listed at the bottom; lead checks at the weekly meeting".

### C-36 (missing, medium, process-rule) §8: overrides and new checks

- **Evidence**: three lead overrides now exist and all write to the run's event log: training ("signed by X without Y training. Reason: ..."), evidence ("signed by X without ..."), cure hold ("Cure hold overridden by X with N h of M remaining") (`workorders.js:3189,3251,3305`).
- **Proposed** new §8 rows: "Issues disposed and explained before Complete | 100% | App gate | Run Issues section"; "Training-gated steps signed by trained people | Every override has a reason | App gate; lead reads overrides in event logs at the weekly meeting | Run event log". The second is a new review duty. **Process-rule: Simon/Nick decide** whether a weekly override read is wanted.

### C-37 (style, low) §8 empty cell and long sentences

- **Current**: row 1 "Record where" is "—" (line 137). §4 R&D definition is one 140-word bullet.
- **Proposed**: write "none" in the cell (STYLE §2, no em dashes). Split the R&D bullet into a definition sentence and a short list of where it is hidden and where it is marked (C-28 rewrites it anyway). History rows keep their em dashes (records, not prose).

### C-38 (keep, but say so) §7.3 step 2 and §7.4 step 2: Backup

- **Evidence**: **Backup** is in the header for every signed-in member, **Restore** for leads only (`core.js:3678-3679`); on a phone both sit in the ⋯ menu (README "Getting around").
- **Proposed**: one clause: "(on a phone, in the ⋯ menu)". The monthly cadence and Drive destination stay.

---

## C. Process-rule changes for human review

| ID | Doc § | Change | Who decides |
|---|---|---|---|
| C-02 | CS-002 §7.2.2 | Freeze = one signature on Stack frozen plus a note naming who agreed, instead of three sets of initials | Simon / Nick |
| C-03 | CS-002 §8 | State that molds advanced outside a run are checked by the lead, since the app does not gate them | Nick |
| C-05 | CS-002 §7.4.1 (and CS-007) | Per-ply tick moves to paper (or the app grows one) | Simon / Nick |
| C-18 | CS-013 §4.1 rule 3 | A re-laid part is a new run under the same `P` ID, not a new `P` with `supersedes` | Simon / Nick (touches CS-001) |
| C-21 | CS-013 new §7.5 | Techniques shall keep the Stack frozen and drop-test blockers | Simon / Nick |
| C-22 | CS-013 §4 | Training gate on buy-offs written down (exists in app) | Nick |
| C-23 | CS-013 §4 | Self-review: shall vs should, and keyed on Mold Engineer vs run creator | Simon / Nick |
| C-25 | CS-013 new §7.6 | Issue disposition rules written down (exist in app) | Nick |
| C-26 | CS-013 new §7.7 | "Archive, don't delete" as a should; delete lead-only; 30-day restore | Nick |
| C-36 | CS-013 §8 | Weekly lead read of override entries | Simon / Nick |

No CS-011 §6 content is touched by this cluster.

## D. Still right, do not change

- CS-002 §4 orientation and stack definitions; P1 = mold surface (the app says the same: "P1 is the mold surface. Plies run outward.", `core.js:2081`).
- CS-002 §7.1 steps 2 to 4 (justify, function plies, targets). CS-009 cites §7.1.3 and CS-010 cites §7.1 and §7.4: keep those numbers.
- CS-002 §7.2.1 the rule itself (freeze before machining) and its order in every built-in technique; CS-003/006/007 cite CS-002 §7.2.
- CS-002 §7.3 column set: matches the app's ply table exactly (Ply, Material, Orientation, Coverage, Notes).
- CS-002 coupon rules: ID on the panel before the first cut, data file named after the coupon.
- CS-013 §4 retro definition and §8 retro-honesty row (code cites "CS-013 §8's ban on fabricated buy-offs", `workorders.js:3030`).
- CS-013 §4.1 rules 1, 2 and 4, the 14-character QR cap and dates-as-fields (code cites §4.1 at `core.js:492,718`, `parts.js:924`). Keep the section number.
- CS-013 §4 "R&D is a property of the object, not a status" and "an R&D work order enforces its blockers, cure holds and evidence gates exactly like any other": exactly what DESIGN-NOTES "`rnd` is not a second `retro`" pins with a test.
- CS-013 §7.2 step 4 "I don't know is a valid answer": unchanged in code.
- CS-013 §7.2 step 6 mold location by scanning (cluster D may refine).
- CS-013 R2b `work-orders.html` still exists and is the offline archive viewer (HANDOFF line 151).

## E. Figures

- **cs013-records (wrong)**: draws `WO-SN6-012` "builds" `P-SN6-007` one-to-one and labels the part "re-laid = NEW ID + supersedes" (contradicts C-18). Shows one mold, no issues, no Materials plan, no study holding parts. Redraw with the part as parent: P at the top; several runs (WO) under it, each with its as-built stack, consumed lots and its issues (Issue with disposition and "what was done"); the part linking to two molds (split mold) with "Parts pulled" on each; a study (RDS) as a folder holding coupons (CPN, inheriting the study's materials) and, optionally, a part. Keep the rules under the boxes, updated. New filename `cs013-records.v2.svg` (STYLE §5).
- **cs002-stack (keep, small fix)**: right as a section drawing. If C-14 lands, draw P5 and P6 as two plies with their own orientations. Restyle per Round 3.
- **New figure worth drawing for CS-002**: "plan and as-built". The part's Layup stack and Materials (plan) copied into each run at **+ New run**; the run's edits marked as-built with a drift count; the two return paths **Adopt as the part's plan** and **↩ plan**; Stack frozen cutting the run off from later plan edits. One picture answers the most common "which stack is the real one" question.
- **New figure worth drawing for CS-013 §7.6**: the issue path on a run: raise (⚠ / ⚑) → disposition (five methods) + What happened + What was done → run may complete; Reopen loops back and clears the disposition. Doubles as a QR-007 card.

## F. Notes for the merge (out of this cluster's scope, seen in passing)

- `app/README.md` is stale in four places this audit relied on: Work Orders says delete has "no undo" (it goes to Recently deleted for 30 days); "R&D parts are a different thing ... Those live on the Parts tab" (they live on the R&D tab since v6.1.0); Budget/People says techniques are edited "from the Techniques button on Work Orders" (they moved to Reports); "What a buy-off is" says old signatures keep their name on screen (screens now show the current roster name). Belongs to the side-doc fixes in deliverable 7.
- `rnd.js:812` comment says the R&D create buttons are "MIRRORED" on Parts and Work Orders; they were moved. `projects.js:66` calls the issue gate "The CS-003 enforcement point"; if C-25 lands it becomes CS-013 §7.6. Code comments, not for this overhaul.
- STYLE.md §2 uses "the Monday meeting" as its should-test; the meeting is Wednesday now (cluster A).
- CS-007 §7 step 2 repeats "Tick each ply as laid on the WO" (cluster E, see C-05).
- Slack: no supply, storage or layup-stack decisions since 2026-09-01 bear on these two standards beyond those cited. Searches run: `stack`, `coupons`, `"work order"`, `app` in #composites; `layup` in #aerodynamics. Threads read: 1791478385.435269 (floor closeout + G10), 1791598931.301419 (10/10). Nothing sent.
