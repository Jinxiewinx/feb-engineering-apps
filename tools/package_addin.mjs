#!/usr/bin/env node
/* package_addin.mjs: build the shareable FEBPlanStock zip.
 *
 *   node tools/package_addin.mjs            # build dist/FEBPlanStock-<ver>.zip
 *   node tools/package_addin.mjs --release  # build, then cut a GitHub Release
 *   node tools/package_addin.mjs --out DIR  # stage somewhere else (tests use this)
 *
 * WHY THIS EXISTS. Until now the only way to give somebody the add-in was to
 * clone a repo and cp -R a folder, which is not something you can ask fifteen
 * composites members to do. This makes one file with a version on it.
 *
 * WHY IT IS NOT PART OF release.mjs. That script ships the web app, which
 * releases far more often than the add-in does. Coupling them would either
 * spam members with add-in reinstalls or hold app releases back. They share
 * nothing but the repo.
 *
 * WHAT IT REFUSES TO DO. Ship credentials.json. The repo is public and so is
 * every release attached to it, so the exclusion is an assertion over the
 * staged tree, not a glob that could quietly miss. Same for __pycache__ and
 * .pyc, which are just noise but would confuse "is this the file I sent you".
 *
 * THE LAYOUT, and why the installers sit outside the add-in folder:
 *
 *   FEBPlanStock-1.1.0/
 *     INSTALL.txt
 *     Install on Mac.command
 *     Install on Windows.bat
 *     FEBPlanStock/          <- this, and only this, is copied into AddIns
 *
 * If the installers lived inside FEBPlanStock/ they would be copied into
 * Fusion's AddIns directory along with everything else, where they are at
 * best confusing and at worst something a member double-clicks a second time.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ADDIN = path.join(ROOT, "10 Fusion Add-in", "FEBPlanStock");
const INSTALLER = path.join(ROOT, "10 Fusion Add-in", "installer");
const NAME = "FEBPlanStock";

const argv = process.argv.slice(2);
const DO_RELEASE = argv.includes("--release");
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, "dist");

const BANNED = [/(^|\/)credentials\.json$/, /(^|\/)__pycache__(\/|$)/, /\.pyc$/,
                /(^|\/)febplanstock\.log$/, /(^|\/)\.DS_Store$/];

function die(msg) { console.error("\n" + msg + "\n"); process.exit(1); }
function sh(cmd, args, opts) {
  return execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts }).trim();
}

/* The manifest is the single source of truth for the version; the Python
 * constant exists so the add-in can report itself to the app and to its log,
 * and the two drifting apart is exactly the bug that makes a version useless. */
function versions() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ADDIN, NAME + ".manifest"), "utf8"));
  const py = fs.readFileSync(path.join(ADDIN, NAME + ".py"), "utf8");
  const m = py.match(/^ADDIN_VERSION\s*=\s*"([^"]+)"/m);
  if (!m) die(`No ADDIN_VERSION in ${NAME}.py. The add-in cannot report its own version.`);
  if (m[1] !== manifest.version) {
    die(`Version mismatch, refusing to build:\n` +
        `  ${NAME}.manifest  ${manifest.version}\n` +
        `  ${NAME}.py        ${m[1]}\n` +
        `Set both to the same thing.`);
  }
  return manifest.version;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, e.name), to = path.join(dest, e.name);
    if (BANNED.some(r => r.test(e.name))) continue;
    if (e.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

const version = versions();
const stem = `${NAME}-${version}`;
const zipPath = path.join(OUT, `${stem}.zip`);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "feb-addin-"));
const top = path.join(stage, stem);
fs.mkdirSync(top, { recursive: true });

copyTree(ADDIN, path.join(top, NAME));
for (const f of ["INSTALL.txt", "Install on Mac.command", "Install on Windows.bat"]) {
  fs.copyFileSync(path.join(INSTALLER, f), path.join(top, f));
}
// zip preserves the mode, and a .command without it is a text file you cannot
// double-click.
fs.chmodSync(path.join(top, "Install on Mac.command"), 0o755);

// Last line of defence, over the staged tree rather than over the copy rules.
const staged = walk(top);
for (const f of staged) {
  if (BANNED.some(r => r.test(f))) die(`Refusing to ship ${f}. This should be impossible; fix BANNED.`);
}
for (const must of [`${NAME}/${NAME}.manifest`, `${NAME}/${NAME}.py`, `${NAME}/febframe.py`,
                    `${NAME}/resources/16x16.png`, `${NAME}/resources/32x32.png`,
                    `${NAME}/credentials.example.json`, "INSTALL.txt",
                    "Install on Mac.command", "Install on Windows.bat"]) {
  if (!staged.includes(must)) die(`Missing ${must} from the staged package.`);
}

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(zipPath, { force: true });
// -X drops the macOS extended attributes that would otherwise ride along.
sh("zip", ["-r", "-q", "-X", zipPath, stem], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });

const kb = Math.round(fs.statSync(zipPath).size / 1024);
console.log(`\nBuilt ${path.relative(ROOT, zipPath)}  (${kb} KB, ${staged.length} files, v${version})`);
for (const f of staged.sort()) console.log("    " + f);

if (!DO_RELEASE) {
  console.log(`\nTo publish it:  node tools/package_addin.mjs --release\n`);
  process.exit(0);
}

/* --release. Same shape as release.mjs: refuse a dirty tree, tag, push, and
 * let gh do the upload. Notes come from the commit subjects touching the
 * add-in since the last addin-v tag, which are already written as prose. */
const tag = `addin-v${version}`;
if (sh("git", ["status", "--porcelain"])) die("Working tree is dirty. Commit first; a release has to point at a commit.");
if (sh("git", ["tag", "-l", tag])) die(`Tag ${tag} already exists. Bump the version in the manifest and the .py.`);

let prev = "";
try { prev = sh("git", ["describe", "--tags", "--abbrev=0", "--match", "addin-v*"]); } catch { /* first one */ }
const range = prev ? `${prev}..HEAD` : "HEAD";
const subjects = sh("git", ["log", "--format=- %s", range, "--", "10 Fusion Add-in"]) || "- First packaged release.";

const notes = `${subjects}\n\n**Install:** download \`${stem}.zip\`, unzip it, and double-click ` +
  `\`Install on Mac.command\` or \`Install on Windows.bat\`. See \`INSTALL.txt\` inside for the ` +
  `one-time macOS Gatekeeper step.\n`;

sh("git", ["tag", "-a", tag, "-m", `FEBPlanStock ${version}`]);
sh("git", ["push", "origin", tag]);
sh("gh", ["release", "create", tag, zipPath, "--title", `FEBPlanStock ${version}`, "--notes", notes]);
console.log(`\nReleased ${tag}. Verify by downloading the zip in a browser and running the installer from THAT copy.\n`);
