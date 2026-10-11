# Handoff

Written for Nick Jepsen, SN6 composites lead, and for whoever comes after him.
This is the operator's guide to the repo: what you own now, what needs doing
once, what needs doing on a rhythm, and how to change things without breaking
them. The README is the tour of what everything is; this is how to run it.

## What you own

Three running things and a body of documents.

**The app**, live at https://feb-composites.web.app. Firebase project
`feb-composites`: Firestore database, Storage bucket, Hosting. The team signs
in with email and password; nobody can see anything until a lead adds their
email to the roster (Roster button in the header). You are that lead. The
manual is `06 Composites App/app/README.md`.

**The CFD viewer**, `07 CFD PDF Viewer/`. Nothing hosted; it runs locally or
as a desktop build people pass around. Nothing to maintain unless Fluent
changes its export format, and `npm test` in that folder tells you if it did.

**The website**, `09 Website/`. Built but never deployed. Before it ships it
needs photos, a real application form and someone checking the copy; its
README lists all of it.

**The documents**: the CS standards (`02`), the pain-points review (`01`), the
datasheets (`03`), the printables (`04`). The standards are the team's process
memory. The app enforces some of them (cure holds, blocker steps, lot
capture); the rest only work if people can find and trust them.

## Do these once, early

In rough priority order:

1. **Get ownership of the Firebase project.** It currently lives under
   Simon's Google account, which is the exact failure the setup guide warns
   about. Have Simon add you as an owner: Firebase console, Project settings,
   Users and permissions. Better, move it to a team account. Until this is
   done, a lost account locks the team out of its own data.
2. **Click "Rebuild scan mirror" once**, under Reports, signed in as a lead.
   The public scan pages read a mirror collection that starts empty; until a
   lead builds it, every scanned label honestly says "no record with this ID
   yet". After the first build it maintains itself.
3. **Buy an oil-based paint marker** (about $5). Every standard Sharpie mark
   in the shop dissolves in the ≥90% IPA wipes the process itself requires.
   This is the cheapest, highest-value fix in the whole handoff.
4. **Sign the approval tables.** Every CS standard ships "Draft, pending Lead
   signature", and under CS-000 a standard with a blank approver row is never
   Released. Read them first; signing is what makes them yours.
5. **Tell the team.** The app, the labels, the scanning: none of it has been
   announced in #composites. It works, but nobody was told.
6. Two physical checks when you are next at RFS: confirm the ShopSabre's
   exact model against CS-005 §5, and walk the CS-011 storage map to see that
   the locations it names still exist.

## The rhythm

**Monthly: walk the shop.** CS-011 §7.1's stock walk is built into the app
now: open Inventory, and on each shelf's page tap **Confirm contents** after
checking the list against reality. The map shows how long since each shelf
was walked, and §8's "molds in home locations" number falls out of it.

**Monthly: back up.** Backup button in the app header, save the JSON into the
season's Drive folder. Firestore is reliable, but a plain file in Drive is the
backup nobody can lock you out of, and it is also the only version history the
records have.

**At roster changes:** add new members (they create an account, you add the
email), remove departed ones. Their account keeps existing but stops working.

**At handoff to SN7:** the next lead gets `lead` on the roster, owner on the
Firebase project, and this file gets updated with whatever changed on your
watch.

## Changing things

**The app's code** lives in `06 Composites App/app/`, plain JS with no build step. The
workflow that keeps it safe:

1. Make the change, then run the tests from the repo root. Minimum
   `node tools/test_app.mjs` and `node tools/test_designsystem.mjs`; for
   anything visual, the matching browser suite too. `tools/README.md` says
   which test covers what.
2. Commit and push first, then deploy:

   ```bash
   cd "06 Composites App" && firebase deploy --only hosting
   ```

   Push first so that whatever is live always matches a commit, which makes a
   rollback "redeploy an earlier commit" instead of an archaeology dig.
3. Verify with your eyes, not the CLI's "Deploy complete": load the site, or
   curl the changed file off the live host and check the new code is in it.

**When you cut a named release, it goes out with a picture.** Every Major and
Minor carries one or two, written by hand into `tools/lib/release-shots.mjs`
before you cut; `node tools/release.mjs <version>` refuses to ship if that file
has not moved since the last tag, shoots them once the deploy is verified live,
and prints their paths under the `#composites` note for you to attach. Patches
skip it by default — nothing new to look at — unless you pass `--shots`, which
is what a patch that changes what a list *shows* wants. Full reasoning in
`tools/README.md`.

**`--only hosting` is deliberate.** The same `firebase.json` also carries
`firestore.rules` and `storage.rules`, and those are the part that can lock
the whole team out of their own data. Deploy rules only when the rules
themselves changed, test them against the emulator first
(`tools/test_wo_rules.mjs`, `test_storage_rules.mjs`, `test_pub_rules.mjs`),
and say so in the commit.

**Cure hold numbers** live in `06 Composites App/app/resins.js`, one file, one entry per
resin system, each carrying the datasheet figure, the hold FEB actually
enforces, and who signed it off. A test refuses a hold below its datasheet
figure or without a name on it. A lead can also change a hold in the app
(the override lives in the config, no deploy needed); CS-000 then wants
CS-008 revised within two weeks so the standard says the same number.
Adding a resin means having its TDS in `03 Datasheets/` first.

**The standards** are edited in `02 CS Standards/src/` (the markdown is
canonical; the .docx is built; the August Google Docs copies are retired).
`02 CS Standards/STYLE.md` is the house style. Then:

```bash
node tools/render_figures.mjs          # only if an SVG changed
tools/.venv/bin/python tools/build_docx.py --all
python3 tools/gen_docs_manifest.py
node tools/build_ai_corpus.mjs
python3 tools/check_traceability.py --strict
```

The builds are reproducible, so only what changed shows up in git. A content
change to a standard is a revision bump with a row in its revision table, per
CS-000 §7.2, and in the same change every quick reference on that standard
and every printables card that names its revision. Members see a new revision
after the hosting deploy; Paul quotes it only after the functions deploy.

**The AI helpers** (Paul, Steve, and the ✨ readers for receipts, packing
slips and jug labels) run as Cloud Functions on Claude Haiku. A lead can
switch all of them off from ⋯, and they stop themselves at $80 a month.
Anything that changes what they know (a standard, a quick reference, a
datasheet, Steve's notes in `06 Composites App/steve/`, the Fibreglast
catalog) needs `build_ai_corpus.mjs` or `build_steve_kb.mjs`, a commit, and a
functions deploy: `firebase deploy --only functions` from
`06 Composites App/`. That deploy is separate from hosting and is not covered
by the standing deploy authorization; ask first.

**The screenshots in the READMEs** regenerate with
`node tools/make_mockups.mjs` after any UI change. Captions live in that
script.

## The money

Effectively zero. The Firebase project is on the Blaze plan only because
Storage requires a card; real usage is a rounding error against the free
tier, and a billing budget with alerts is set so it cannot surprise-bill.
If a bill ever appears, something is wrong; look before paying.

## Honest limits worth knowing

Buy-offs record who signed and what evidence existed, but nothing is
tamper-proof: any roster member can edit any record, and the monthly Drive
exports are the audit trail. If a record looks wrong, that is a conversation
with a person, not a software problem.

The offline `06 Composites App/work-orders.html` opens any exported JSON forever, with
nothing installed. It is the disaster-recovery path and the archive viewer.
Don't delete it, and don't let it become a second source of truth.

## Working on this repo with Claude

The repo is set up for it. `CLAUDE.md` in the parent folder carries the
working rules a session follows (push often with real commit messages, keep
`SESSION-STATE.md` current, act on judgment, deploy when a section lands).
`SESSION-STATE.md` is the rolling engineering log; read its top section before
continuing any unfinished work, and skim it when something in the app seems
inexplicable, because the reason is usually written down there.
`00 Agent/simon.md` defines a reviewer persona loaded with SN5 history that
can score drafts and documents; the live copy lives in
`composites_programs/.claude/agents/`. None of this requires Claude, but the
history in those files is real either way.

## If something breaks

The app misbehaving after a deploy: redeploy the previous commit. Data looks
wrong: check the event logs on the record, then the latest Drive backup.
Locked out entirely: the Firebase console (whoever owns the project) can
always read Firestore directly and reset the roster the way the setup guide's
bootstrap step describes. Scanning says "no record": the mirror needs a
rebuild, Reports tab. Uploads failing at RFS: the wifi hangs rather than
refuses; try a hotspot before blaming the app.

Questions the docs don't answer: ask Simon, then write the answer down here
so the next person doesn't have to.
