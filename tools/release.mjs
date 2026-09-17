#!/usr/bin/env node
/* release.mjs — cut a named release of the app.
 *
 *   node tools/release.mjs 1.1.0          # from the repo root
 *   node tools/release.mjs 1.1.0 --dry    # say what it would do, touch nothing
 *
 * WHAT IT DOES, in order, stopping at the first thing that goes wrong:
 *
 *   1. refuses a dirty tree
 *   2. finds the previous tag
 *   3. reads the commit subjects since it — they are already prose sentences
 *      describing user-visible outcomes, which is why this is cheap
 *   4. bumps APP_VERSION in core.js, and the Fusion add-in's two version
 *      strings with it, since the add-in ships on the app's number
 *   5. prepends a CHANGELOG.md section
 *   6. runs the test suites, and refuses to ship over a failure
 *   7. commits, tags, pushes over HTTPS
 *   8. deploys hosting — ONLY hosting
 *   9. verifies the new version is actually live, by fetching it
 *  9a. builds the Fusion add-in zip and publishes the GitHub Release for the
 *      tag, with the zip attached
 *  9b. shoots the release pictures — AFTER the live check, so the picture is
 *      provably of the version that shipped (Major and Minor only)
 *  10. prints the Slack note — built from WHATS_NEW, not from subjects — with
 *      the pictures to attach under it, and STOPS
 *
 * WHAT IT REFUSES TO GUESS:
 *
 * WHATS_NEW. Commit subjects are written for the next engineer reading git log
 * and they make good CHANGELOG lines, but they are not the sentences to put on
 * fifteen people's screens — v2.0.0 nearly shipped "Release notes skip the
 * handoff file's own commits" as the first thing the team would read, which is
 * true and useless to somebody standing at a layup table.
 *
 * This script used to generate WHATS_NEW from the subjects, which meant it
 * silently overwrote hand-written copy on the next release. Now it does not
 * touch it: it CHECKS that you changed it since the last tag, prints the
 * subjects as raw material, and refuses to ship if you did not. The CHANGELOG
 * keeps the subjects either way.
 *
 * The #composites note had the SAME bug one step further on, and v2.1.0 shipped
 * with it: the note was built from subjects, so it opened with "What's New for
 * the board and work-order release" and "Write down what v2.0.0 actually was" —
 * two internal sentences, in front of the whole team. Slack and the What's New
 * panel have exactly one audience between them, so they now say the same thing:
 * the note is WHATS_NEW. Subjects stay where they were always right, in the
 * CHANGELOG.
 *
 * RELEASE_SHOTS, for the same reason one step further on. A shot list picked
 * from what changed photographs the biggest diff, and the biggest diff is
 * almost never the thing worth showing — the same failure mode as generating
 * WHATS_NEW from subjects, in pictures. So tools/lib/release-shots.mjs is
 * hand-written, capped at two, and this script CHECKS that it moved since the
 * last tag and refuses to ship if it did not. A patch skips the whole thing:
 * "fixes and copy, nothing new to learn" has nothing to photograph.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 * It does not post to Slack. `#composites` announcements need Simon's explicit
 * ask (CLAUDE.md), so this prints the message and a human sends it. The webhook
 * exists in the app already if that is ever relaxed.
 *
 * It does not write config/release. That is the "Announce this release" button
 * in the app's ⋯ menu, pressed by a lead who is standing in the new version.
 * Keeping it there means this script needs no Firebase credential of its own,
 * and means nobody is told to reload before the deploy has actually landed.
 *
 * It does not deploy rules or functions. `--only hosting` means only hosting:
 * firestore.rules can lock the team out of their own data, and functions need
 * their own secret. Both are deliberate, separate acts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "06 Composites App");
const CORE = join(APP, "app", "core.js");
const CHANGELOG = join(ROOT, "CHANGELOG.md");
const ADDIN = join(ROOT, "10 Fusion Add-in", "FEBPlanStock");
const HOST = "https://feb-composites.web.app";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const NO_SHOTS = args.includes("--no-shots");
/* Force pictures onto a release that would skip them. "A patch has nothing new
   to look at" is a good default and a bad law: a patch that changes what a list
   SHOWS has plenty to look at, and v2.2.1 — R&D hidden by default on both rails
   — was exactly that. The default stays; this is how you say it does not apply. */
const FORCE_SHOTS = args.includes("--shots");
const version = args.find(a => /^\d+\.\d+\.\d+$/.test(a));

function die(msg) { console.error("\n✕ " + msg + "\n"); process.exit(1); }
function say(msg) { console.log(msg); }
function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}
/* Steps that change the world are funnelled through here so --dry is honest:
   one place decides whether anything actually happens. */
function act(what, fn) {
  if (DRY) { say("  (dry) would " + what); return null; }
  return fn();
}

if (!version) die(`Give the version to cut, e.g.\n\n    node tools/release.mjs 1.1.0\n\nMajor = a new top-level area or a change in how the team works.\nMinor = a new capability inside an area that exists.\nPatch = fixes and copy.\n\nSee the top of CHANGELOG.md.`);

/* ---- 1. a clean tree ---------------------------------------------------- */
say(`\nCutting v${version}${DRY ? "  (dry run)" : ""}\n`);
const dirty = run("git", ["status", "--porcelain"]).trim();
if (dirty && !DRY) die("The tree is dirty. Commit or stash first — a release must name a\ncommit that exists, or `git checkout v" + version + "` gives you something\nthat was never deployed.\n\n" + dirty);

/* ---- 2. the previous tag ------------------------------------------------ */
let prev = null;
/* --match keeps this to the composites app's bare vX.Y.Z tags. The CFD
   dashboard (08 CFD Sims Dashboard/) shares the repo and tags as cfd-vX.Y.Z;
   without the match, a cfd tag sitting nearer HEAD would be taken as the
   previous composites release and the changelog would start from it. */
try { prev = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]).trim(); } catch { /* no tags yet */ }
const range = prev ? `${prev}..HEAD` : "HEAD";
say(prev ? `  since ${prev}` : "  first tagged release — reading the whole history");

if (prev === "v" + version) die(`v${version} is already the latest tag.`);

/* ---- 3. the notes ------------------------------------------------------- */
/* Subjects only. The bodies in this repo are essays — rationale, rejected
   alternatives, measurements — which is exactly right for `git log` and far too
   much for a release note. The subject line is already the sentence a team
   member would want. */
const subjects = run("git", ["log", "--no-merges", "--format=%s", range])
  .split("\n").map(l => l.trim()).filter(Boolean)
  /* Housekeeping this repo does under its own name. SESSION-STATE.md is the
     internal handoff; a release note telling the team it was pruned is noise on
     a screen that interrupts them. Four such commits in the first 250.

     Deliberately NOT filtering a leading "docs" — this repo writes prose
     subjects, not prefixes, so "Docs and mockups for the inventory work" is a
     real change and the space after the word would have swallowed it. */
  .filter(l => !/^session state[:!( ]/i.test(l))
  .filter(l => !/^(chore|wip|fixup|squash)[:!(]/i.test(l));

if (!subjects.length && !DRY) die("No commits since " + prev + " — nothing to release.");
say(`  ${subjects.length} commit${subjects.length === 1 ? "" : "s"} to describe\n`);
subjects.forEach(l => say("    - " + l));

/* Six is a reading limit, not a storage limit: past it the CHANGELOG folds the
   rest into a <details>. Nothing team-facing is capped here any more — WHATS_NEW
   is its own hand-written list and is what both the app panel and the Slack note
   read. */
const HIGHLIGHT_CAP = 6;
const highlights = subjects.slice(0, HIGHLIGHT_CAP);
if (subjects.length > HIGHLIGHT_CAP) {
  say(`\n  Note: the CHANGELOG lists the first ${HIGHLIGHT_CAP} and folds the other ${subjects.length - HIGHLIGHT_CAP}`);
  say("  into a <details>. What the team reads is WHATS_NEW, which is yours.");
}

/* ---- 4. the version in the app ----------------------------------------- */
let core = readFileSync(CORE, "utf8");
const vRe = /^var APP_VERSION = "[^"]*";$/m;
const nRe = /^var WHATS_NEW = \[[\s\S]*?^\];$/m;
if (!vRe.test(core)) die("Couldn't find `var APP_VERSION = \"…\";` in core.js.");
if (!nRe.test(core)) die("Couldn't find the `var WHATS_NEW = [ … ];` block in core.js.");
const from = core.match(vRe)[0].match(/"([^"]*)"/)[1];
say(`\n  core.js: v${from} → v${version}`);

/* WHATS_NEW is a human's job. What this does is make sure the human did it:
   if the block is byte-identical to the one at the previous tag, it is last
   release's copy and would go out describing the wrong version. */
if (prev) {
  let prevCore = "";
  try { prevCore = run("git", ["show", `${prev}:06 Composites App/app/core.js`]); } catch { /* file is new */ }
  const prevNotes = (prevCore.match(nRe) || [])[0];
  const nowNotes = (core.match(nRe) || [])[0];
  if (prevNotes && nowNotes && prevNotes === nowNotes) {
    die("WHATS_NEW in core.js has not changed since " + prev + ", so it still\n" +
        "describes that release. It is what interrupts the whole team on their next\n" +
        "reload, so write it in their words before shipping.\n\n" +
        "This release's commit subjects, as raw material:\n\n" +
        highlights.map(h => "  - " + h).join("\n") + "\n");
  }
}
core = core.replace(vRe, `var APP_VERSION = "${version}";`);
act("write core.js (APP_VERSION only — WHATS_NEW is yours)", () => writeFileSync(CORE, core));

/* ---- 4a. the Fusion add-in rides the same number ------------------------
   The add-in used to carry its own 1.x line, so the project talked about
   itself in two numbers that were built the same afternoon (Simon, 2026-09-17:
   make it coherent). It now ships as an asset on this release, at this
   version, which also makes the app's MIN_ADDIN_VERSION check readable: it
   compares two things measured on the same ruler.

   Both files are rewritten here rather than asserted, because a release that
   stops to tell you to go and edit two more files by hand is a release that
   eventually ships with them stale. */
const MANIFEST = join(ADDIN, "FEBPlanStock.manifest");
const ADDIN_PY = join(ADDIN, "FEBPlanStock.py");
const mRe = /^(\s*"version":\s*)"[^"]*"/m;
const aRe = /^ADDIN_VERSION = "[^"]*"/m;
let manifestSrc = readFileSync(MANIFEST, "utf8");
let addinSrc = readFileSync(ADDIN_PY, "utf8");
if (!mRe.test(manifestSrc)) die('Couldn\'t find `"version": "…"` in FEBPlanStock.manifest.');
if (!aRe.test(addinSrc)) die('Couldn\'t find `ADDIN_VERSION = "…"` in FEBPlanStock.py.');
const addinFrom = addinSrc.match(/^ADDIN_VERSION = "([^"]*)"/m)[1];
say(`  add-in:  v${addinFrom} → v${version}`);
manifestSrc = manifestSrc.replace(mRe, `$1"${version}"`);
addinSrc = addinSrc.replace(aRe, `ADDIN_VERSION = "${version}"`);
act("write the add-in's version into the manifest and the .py", () => {
  writeFileSync(MANIFEST, manifestSrc);
  writeFileSync(ADDIN_PY, addinSrc);
});

/* Parsed AFTER the stale check, so what is shown is what will ship — and parsed
   ONCE, because this is now the source for the Slack note as well as this
   preview. Two parses would be two chances to disagree about what the team was
   told.

   Empty is fatal, and fatal HERE rather than at step 10: the note is printed
   after the deploy has already gone out, which is far too late to find out
   there was nothing to say. */
const whatsNew = ((core.match(nRe) || [""])[0].match(/"(?:[^"\\]|\\.)*"/g) || [])
  .map(q => { try { return JSON.parse(q); } catch { return q; } })
  .filter(s => String(s).trim());
if (!whatsNew.length) {
  die("WHATS_NEW in core.js is empty, so the What's New panel and the\n" +
      "#composites note would both have nothing in them. Write it before shipping.\n\n" +
      "This release's commit subjects, as raw material:\n\n" +
      highlights.map(h => "  - " + h).join("\n") + "\n");
}
say("\n  WHATS_NEW — the What's New panel on their next reload, and the");
say("  #composites note at the bottom of this run:");
whatsNew.forEach(n => say("    • " + n));

/* ---- 4b. the picture -----------------------------------------------------
   Every Major and Minor release goes out with one or two pictures. A bulleted
   list of sentences is what we had, and the one thing that actually makes
   fifteen people open the app is a picture of the new thing.

   Checked HERE and shot at step 9b, for the two different reasons each half
   has: a stale shot list is a thing you can still fix before anything ships,
   and a picture is only honest if it is taken after the deploy is verified
   live. Same split, and the same stale check, as WHATS_NEW above — for the same
   reason that one exists: a shot list picked from what changed photographs the
   biggest diff, which is almost never the thing worth showing.

   A patch is "fixes and copy, nothing new to learn" (CHANGELOG.md), so there is
   normally nothing to photograph and this is skipped. --shots overrides that,
   because a patch that changes what a LIST SHOWS has plenty to look at. */
const isPatch = /^\d+\.\d+\.[1-9]\d*$/.test(version);
const wantShots = !NO_SHOTS && (!isPatch || FORCE_SHOTS);
if (isPatch && !FORCE_SHOTS && !NO_SHOTS) {
  say("\n  a patch ships no pictures — nothing new to look at");
  say("  (--shots if this one does)");
} else if (NO_SHOTS) {
  say("\n  --no-shots: this release will be announced WITHOUT a picture");
} else {
  const shotsMoved = prev
    ? run("git", ["diff", "--name-only", `${prev}..HEAD`, "--", "tools/lib/release-shots.mjs"]).trim()
    : "first release";
  if (!shotsMoved) {
    die(`tools/lib/release-shots.mjs has not changed since ${prev}, so this release\n` +
        `would be announced with the LAST one's pictures.\n\n` +
        `Write the one or two pictures that show what changed, then cut again.\n` +
        `Iterate on the framing without cutting a release:\n\n` +
        `    node tools/shoot_release.mjs --version ${version}\n\n` +
        `Or ship without a picture on purpose:  node tools/release.mjs ${version} --no-shots`);
  }
}

/* ---- 5. the changelog --------------------------------------------------- */
const today = run("git", ["log", "-1", "--format=%cs"]).trim();
const entry = `## v${version} — ${today}\n\n` +
  highlights.map(h => `- ${h}`).join("\n") +
  (subjects.length > HIGHLIGHT_CAP
    ? `\n\n<details><summary>${subjects.length - HIGHLIGHT_CAP} more</summary>\n\n` +
      subjects.slice(HIGHLIGHT_CAP).map(h => `- ${h}`).join("\n") + "\n\n</details>"
    : "") +
  "\n\n---\n\n";

if (!existsSync(CHANGELOG)) die("CHANGELOG.md is missing.");
let log = readFileSync(CHANGELOG, "utf8");
const marker = "---\n\n## ";
const at = log.indexOf(marker);
if (at < 0) die("CHANGELOG.md has no `---` before its first version section;\nthis script inserts there and won't guess.");
log = log.slice(0, at + marker.length - 3) + entry + log.slice(at + 5);
act("prepend the CHANGELOG.md section", () => writeFileSync(CHANGELOG, log));

/* ---- 6. the gate -------------------------------------------------------- */
/* Before the commit, so a red suite leaves nothing behind but edited files you
   can `git checkout --`. */
const SUITES = ["test_app.mjs", "test_designsystem.mjs", "test_route.mjs", "test_appui.mjs", "test_detailui.mjs"];
say("\n  running the suites");
for (const s of SUITES) {
  const file = join(ROOT, "tools", s);
  if (!existsSync(file)) { say(`    – ${s} (not present, skipped)`); continue; }
  try {
    const out = execFileSync(process.execPath, [file], { cwd: APP, encoding: "utf8" });
    const tail = out.trim().split("\n").pop();
    if (/[1-9]\d* failed/.test(tail)) throw new Error(tail);
    say(`    ✓ ${s} — ${tail}`);
  } catch (e) {
    const detail = (e.stdout || "") + (e.stderr || "") + (e.message || "");
    die(`${s} failed. Not shipping.\n\n` + detail.trim().split("\n").slice(-25).join("\n"));
  }
}

/* ---- 7. commit, tag, push ---------------------------------------------- */
const msg = `Release v${version}\n\n` + subjects.map(l => `- ${l}`).join("\n") + "\n";
act("commit, tag and push", () => {
  run("git", ["add", "CHANGELOG.md", "06 Composites App/app/core.js",
              "10 Fusion Add-in/FEBPlanStock/FEBPlanStock.manifest",
              "10 Fusion Add-in/FEBPlanStock/FEBPlanStock.py"]);
  run("git", ["commit", "-m", msg]);
  run("git", ["tag", "-a", "v" + version, "-m", msg]);
  // HTTPS, never SSH: the machine's SSH key authenticates as the wrong account
  // for this repo. See CLAUDE.md.
  run("git", ["push"]);
  run("git", ["push", "--tags"]);
  say("  pushed, tagged v" + version);
});

/* ---- 8. deploy ---------------------------------------------------------- */
act("deploy hosting", () => {
  say("\n  deploying hosting");
  execFileSync("firebase", ["deploy", "--only", "hosting"], { cwd: APP, encoding: "utf8", stdio: "inherit", shell: process.platform === "win32" });
});

/* ---- 9. verify it is actually live ------------------------------------- */
/* "Deploy complete" is not the check (CLAUDE.md). Fetch the file and look.

   Retried, because the first run of this against a real deploy failed and the
   deploy was fine: the CLI returns as soon as the release is finalised, and the
   edge can still be serving the previous file for a few seconds. A single fetch
   turns that race into a red "NOT v2.0.0" on a release that shipped correctly,
   which is worse than useless — the next person learns to ignore the check.

   Cache-busted per attempt as well as no-store: an intermediate proxy that
   ignores no-store would otherwise hand back the same stale body every time and
   the retries would all agree with each other about the wrong answer. */
if (!DRY) {
  say("\n  verifying against " + HOST);
  const TRIES = 6, GAP = 5000;
  let live = "", ok = false;
  for (let i = 1; i <= TRIES; i++) {
    try {
      const res = await fetch(`${HOST}/core.js?v=${version}-${i}`, { cache: "no-store" });
      if (res.ok) {
        live = await res.text();
        if (live.includes(`var APP_VERSION = "${version}";`)) { ok = true; break; }
      }
    } catch (e) { /* a blip mid-propagation is exactly what the retries are for */ }
    if (i < TRIES) {
      say(`    not there yet (${i}/${TRIES}) — the edge can lag the CLI by a few seconds`);
      await new Promise(r => setTimeout(r, GAP));
    }
  }
  if (!ok) {
    die(`The deploy reported success but ${HOST}/core.js is still NOT v${version}\n` +
        `after ${TRIES} tries over ${(TRIES - 1) * GAP / 1000}s. Check the Firebase console\n` +
        `before telling anyone it shipped.`);
  }
  say(`  ✓ ${HOST} is serving v${version}`);
}

/* ---- 9a. the GitHub Release, with the add-in attached ------------------
   AFTER the live check, for the same reason as the pictures: a release page
   that points at a version nobody can load is worse than no release page.

   The tag is already pushed by step 7. This is what turns it into something a
   member can be sent a link to, and it is the only place the Fusion add-in
   zip is published. There is no separate add-in release to remember, which is
   the whole point of folding it in here.

   Non-fatal on purpose. By this point the app IS deployed and live, and the
   tag IS pushed. A `gh` that is not installed or not logged in must not read
   as "the release failed", so it says what is true and prints the one command
   that finishes the job. */
if (!DRY) {
  say("\n  building the Fusion add-in zip");
  try {
    const built = execFileSync(process.execPath, [join(ROOT, "tools", "package_addin.mjs")],
      { cwd: ROOT, encoding: "utf8" });
    const zip = join(ROOT, "dist", `FEBPlanStock-${version}.zip`);
    if (!built.includes(`FEBPlanStock-${version}.zip`)) {
      die(`package_addin.mjs did not build FEBPlanStock-${version}.zip.\n` +
          `v${version} IS DEPLOYED AND LIVE; only the release page is missing.`);
    }
    say(`    dist/FEBPlanStock-${version}.zip`);

    /* WHATS_NEW, not the commit subjects. The subjects are written for the
       next engineer reading git log; this page is read by whoever was sent
       the link to download the add-in. Same reasoning as the Slack note. */
    const notes = whatsNew.map(h => `- ${h}`).join("\n") +
      `\n\n**The app** is live at ${HOST} — reload to get this version.\n\n` +
      `**The Fusion add-in**: download \`FEBPlanStock-${version}.zip\` below, unzip it, and ` +
      `double-click \`Install on Mac.command\` or \`Install on Windows.bat\`. ` +
      `\`INSTALL.txt\` inside covers the one-time macOS security dialog. ` +
      `It carries the app's version so the two always match.\n\n` +
      `Full notes: [CHANGELOG.md](https://github.com/Jinxiewinx/feb-engineering-apps/blob/v${version}/CHANGELOG.md)\n`;

    say("  publishing the GitHub Release");
    execFileSync("gh", ["release", "create", "v" + version, zip,
                        "--title", `Composites app v${version}`, "--notes", notes],
                 { cwd: ROOT, encoding: "utf8" });
    say(`  ✓ https://github.com/Jinxiewinx/feb-engineering-apps/releases/tag/v${version}`);
  } catch (e) {
    const detail = ((e.stdout || "") + (e.stderr || "") + (e.message || "")).trim();
    say(`\n  ⚠ v${version} IS DEPLOYED, LIVE AND TAGGED — only the GitHub Release page failed.`);
    say("    " + detail.split("\n").slice(-6).join("\n    "));
    say(`\n    Finish it with:  node tools/package_addin.mjs && gh release create v${version} dist/FEBPlanStock-${version}.zip`);
  }
} else {
  // --dry has to say this happens, or the one step it cannot rehearse is also
  // the one step nobody knows to expect.
  say(`\n  (dry) would build dist/FEBPlanStock-${version}.zip and publish the`);
  say(`        GitHub Release for v${version} with it attached`);
}

/* ---- 9b. the picture ---------------------------------------------------
   AFTER the live check, deliberately: a release picture is only honest if it is
   of the version that actually shipped, and step 9 is the first moment that is
   known. Before it, the app on the port is whatever is on disk.

   shoot_release.mjs DIES when Chromium is missing rather than skipping, which
   is the opposite of every other Playwright suite here. That is on purpose and
   its header says why: a skipped test teaches you nothing and breaks nothing,
   whereas a skipped picture is a release announced without one and nobody
   finding out. --no-shots is the way past it. */
let shots = [];
if (wantShots && !DRY) {
  say("\n  shooting the release pictures");
  try {
    const out = execFileSync(process.execPath, [join(ROOT, "tools", "shoot_release.mjs"), "--version", version],
      { cwd: ROOT, encoding: "utf8" });
    shots = out.split("\n").filter(l => l.startsWith("SHOT ")).map(l => l.slice(5).trim());
    shots.forEach(f => say("    " + f));
    if (!shots.length) die("shoot_release.mjs wrote nothing. The release IS live; re-run it by hand:\n\n" +
                           `    node tools/shoot_release.mjs --version ${version}`);
  } catch (e) {
    /* The deploy has already gone out and been verified, so this must not read
       as "the release failed". Say exactly what is and is not true. */
    const detail = ((e.stdout || "") + (e.stderr || "") + (e.message || "")).trim();
    die(`v${version} IS DEPLOYED AND LIVE — only the pictures failed.\n\n` +
        detail.split("\n").slice(-12).join("\n") + "\n\n" +
        `Fix it and run:  node tools/shoot_release.mjs --version ${version}\n` +
        `Then post the note by hand; nothing else is left to do.`);
  }
}

/* ---- 10. the Slack note, for a human to send --------------------------- */
/* Slack mrkdwn, not HTML: *bold* is a single asterisk and there is no entity
   escaping — the app's own slackIssueCreatedMsg carries the same warning.

   The three characters Slack DOES want escaped in message text are & < >, and
   they have to be escaped in the copy but NOT in the link below it, where the
   angle brackets are the link syntax. Prose is unlikely to contain them; a note
   silently turning into half a link because somebody wrote "<1/8 in" is the kind
   of thing nobody catches until it is on fifteen screens. */
const slackEscape = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slack = [
  `*Composites app v${version} is out* — <${HOST}|feb-composites.web.app>`,
  "",
  ...whatsNew.map(h => `• ${slackEscape(h)}`),
  "",
  "Reload the app to get it. If you have it installed on a tablet, it will prompt you.",
].join("\n");

say("\n" + "─".repeat(64));
say("Paste into #composites (Simon's call — this script never posts):\n");
say(slack);
say("─".repeat(64));
if (shots.length) {
  say(`\n${shots.length === 1 ? "One image" : "Two images"} to attach (drag ${shots.length === 1 ? "it" : "them"} into the message):`);
  shots.forEach(f => say("  " + f));
} else if (wantShots && DRY) {
  say("\n(a real run would shoot the release pictures here and list them)");
} else if (!wantShots) {
  say(`\nNO PICTURE with this one${NO_SHOTS ? " (--no-shots)" : " — a patch has nothing new to look at; --shots if it does"}.`);
}
say(`\nThen open the app as a lead and hit ⋯ → "Announce this release",`);
say("so anyone still on an older build gets the reload prompt.\n");
