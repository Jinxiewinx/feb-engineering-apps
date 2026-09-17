# CLAUDE.md — SN6 Resources repo

Repo-specific authorizations and working rules from Simon.

Two files carry the rest: `SESSION-STATE.md` is the rolling handoff — read it
first if a session was cut off — and `.claude/SESSION-STATE-POLICY.md` says
what may go in it and what has to come out. Keeping SESSION-STATE current
means pruning it, not only appending to it.

## Main and deploys are open (2026-08-05)

Simon's standing authorization for this repo, given so he does not have to
land or ship work himself:

- **Push to main directly.** This overrides the background-session default of
  "never push to main". Branches and PRs are still fine when a change wants
  review, but landing finished, tested work on main without asking is the
  normal path. Force-pushes over real history remain off limits.
- **Deploy Firebase hosting without asking**, from `06 Composites App/`:
  `firebase deploy --only hosting` to `feb-composites.web.app`. This includes
  deploys done purely to test or verify a change live, not only "section done"
  deploys. Deploy from a state that is pushed, so live always matches a commit
  and rollback is redeploying an earlier one.
- **`--only hosting` still means only hosting.** `firestore.rules` and
  `storage.rules` can lock the team out of their own data; deploy those only
  when the rules themselves changed, and say so in the report.
- After deploying, verify: `curl` a changed file off the live host and check
  the new code is actually in it. The CLI's "Deploy complete" is not the check.

## One version, one release (2026-09-17)

Simon asked for the versioning to be coherent, so there is one number and one
release page for the whole thing. Keep it that way.

**The app's `APP_VERSION` in `06 Composites App/app/core.js` is the only
version this project has.** The Fusion add-in carries the same number, in
`10 Fusion Add-in/FEBPlanStock/FEBPlanStock.manifest` and as `ADDIN_VERSION`
in `FEBPlanStock.py`, and ships as a zip attached to the app's GitHub Release.
There is no separate add-in version and no separate add-in release. The CFD
dashboard is a different app and keeps its own `cfd-v*` line.

**Everything is cut by one command**, from the repo root:

```bash
node tools/release.mjs <version>
```

It bumps `APP_VERSION`, writes the same version into the add-in's two files,
updates the CHANGELOG, runs the suites, commits, tags `v<version>`, pushes,
deploys hosting, verifies the deploy is live, builds
`dist/FEBPlanStock-<version>.zip`, publishes the GitHub Release with that zip
attached, shoots the release pictures, and prints a Slack note for a human to
send. `--dry` says what it would do and touches nothing.

Do not hand-edit the add-in's version, do not run `gh release create` by hand,
and do not add an `addin-v*` tag back. `tools/test_addin_package.mjs` fails if
the three version strings disagree or if `release.mjs` stops writing them, so a
drift is caught before it ships rather than by a member reporting a version
that does not exist.

**Cutting a release does not need asking** (Simon, 2026-09-17). Same standing
authorization as pushing to main and deploying hosting, and for the same
reason: he does not want to be the step the work waits on. Pick the version off
the scale in `CHANGELOG.md` — Major when the way the team works changes, which
is a real category and not a flourish — and run the one command.

**Writing `WHATS_NEW` is part of cutting the release, not a favour.** It is now
the ONLY thing that reaches the team: the #composites note the script used to
print is gone, because Simon does not send it. Five short lines, in the words
somebody at a layup table would use, about what changed for them. `release.mjs`
refuses to ship a stale one, deliberately — that gate is the last thing between
the team and a panel describing the previous version. Announcing in
`#composites` is still outward-facing and still needs asking; the in-app
⋯ → "Announce this release" press is a lead's.

**When the add-in changes but the app does not**, still cut an ordinary
release. A patch version is cheap and it keeps the rule that a member can read
one number off the app and off the add-in and compare them.

**`MIN_ADDIN_VERSION` in `06 Composites App/app/fusion.js`** is what warns a
member their add-in is stale. Raise it only when the page side genuinely needs
a newer add-in, not on every release: every bump makes somebody reinstall.

**What to verify after a release**, beyond what the script checks itself:
download the zip from the Release page in a browser and run the installer from
that copy. A locally built zip is not quarantined, so it cannot tell you
whether the macOS instructions in `INSTALL.txt` are still right.

## Push over HTTPS, never SSH

The machine's SSH key authenticates as `starbuckgold`, but the repo belongs to
`Jinxiewinx`, which is the `gh` CLI account. `ssh -T git@github.com` reporting
success is misleading here.

The standing rules: detailed commit messages, README updated in the same push,
SESSION-STATE.md kept current and pruned, no secrets or junk files, and
`#composites` announcements still need asking.
