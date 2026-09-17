#!/usr/bin/env node
/* package_addin.mjs: build the shareable FEBPlanStock zip.
 *
 *   node tools/package_addin.mjs            # build dist/FEBPlanStock-<ver>.zip
 *   node tools/package_addin.mjs --out DIR  # stage somewhere else (tests use this)
 *
 * WHY THIS EXISTS. Until this landed the only way to give somebody the add-in
 * was to clone a repo and cp -R a folder, which is not something you can ask
 * fifteen composites members to do. This makes one file with a version on it.
 *
 * ONE NUMBER FOR THE WHOLE THING (Simon, 2026-09-17). The add-in used to carry
 * its own 1.x line on its own `addin-v*` tags, which meant the project spoke
 * about itself in two numbers: an app at 4.8.0 and an add-in at 1.1.0 that were
 * built the same afternoon. To a member the add-in is a window into the app, so
 * it now carries the APP's version and ships as an asset on the APP's release.
 * `APP_VERSION` in core.js is the source of truth and this script only reads it;
 * release.mjs is what writes it into the manifest and the .py, in the same step
 * that bumps core.js, so the three cannot drift.
 *
 * That means this script does not cut releases any more. `tools/release.mjs`
 * does, for the app and the add-in together. There is no separate add-in
 * release to forget.
 *
 * WHAT IT REFUSES TO DO. Ship credentials.json. The repo is public and so is
 * every release attached to it, so the exclusion is an assertion over the
 * staged tree, not a glob that could quietly miss. Same for __pycache__ and
 * .pyc, which are just noise but would confuse "is this the file I sent you".
 *
 * THE LAYOUT, and why the installers sit outside the add-in folder:
 *
 *   FEBPlanStock-4.8.0/
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
const outIdx = argv.indexOf("--out");
const OUT = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, "dist");

const BANNED = [/(^|\/)credentials\.json$/, /(^|\/)__pycache__(\/|$)/, /\.pyc$/,
                /(^|\/)febplanstock\.log$/, /(^|\/)\.DS_Store$/];

function die(msg) { console.error("\n" + msg + "\n"); process.exit(1); }
function sh(cmd, args, opts) {
  return execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...opts }).trim();
}

/* APP_VERSION in core.js is the source of truth. The manifest is what Fusion
 * reads, and the Python constant is what the add-in reports to its log and to
 * the app; all three have to say the same thing or a member cannot tell anyone
 * what they are running. release.mjs writes all three together, so a mismatch
 * here means somebody edited one by hand. */
function versions() {
  const core = fs.readFileSync(path.join(ROOT, "06 Composites App", "app", "core.js"), "utf8");
  const app = (core.match(/^var APP_VERSION = "([^"]+)";$/m) || [])[1];
  if (!app) die("No APP_VERSION in core.js, so there is no version to build against.");

  const manifest = JSON.parse(fs.readFileSync(path.join(ADDIN, NAME + ".manifest"), "utf8"));
  const py = fs.readFileSync(path.join(ADDIN, NAME + ".py"), "utf8");
  const pyVer = (py.match(/^ADDIN_VERSION\s*=\s*"([^"]+)"/m) || [])[1];
  if (!pyVer) die(`No ADDIN_VERSION in ${NAME}.py. The add-in cannot report its own version.`);

  if (manifest.version !== app || pyVer !== app) {
    die(`Version mismatch, refusing to build:\n` +
        `  core.js APP_VERSION    ${app}   <- the source of truth\n` +
        `  ${NAME}.manifest  ${manifest.version}\n` +
        `  ${NAME}.py        ${pyVer}\n\n` +
        `Set the add-in's two to the app's. tools/release.mjs does this for you;\n` +
        `doing it by hand is only for a build you are testing.`);
  }
  return app;
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

console.log(`\nThis zip ships as an asset on the app's release. To cut one:\n` +
            `    node tools/release.mjs <version>\n`);
