#!/usr/bin/env node
/* Packaging tests for tools/package_addin.mjs.

   Run from SN6 Resources/:  node tools/test_addin_package.mjs

   This builds a real zip into a temp directory, unzips it, and checks the
   tree. It is not a unit test of the packager's internals: the thing that can
   actually go wrong here is the ARTIFACT, and the ways it goes wrong are all
   visible from outside.

   The one that matters most is credentials.json. The repo is public and so is
   every release attached to it, so a build that leaks the shared team account
   is a credential disclosure, not a packaging bug. The packager asserts it
   twice already; this asserts it a third time against the file a member would
   actually download.

   Second is the executable bit on Install on Mac.command. Lose it and the
   installer becomes a text file that opens in TextEdit when double-clicked,
   which looks exactly like the add-in not working. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
function ok(cond, what) {
  checks++;
  if (cond) return;
  failures++;
  console.error("  FAIL  " + what);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feb-addin-test-"));
const dist = path.join(tmp, "dist"), unzipped = path.join(tmp, "unzipped");

// ---------- one version across the app and the add-in ----------
// The add-in ships as an asset on the app's release and carries the app's
// number (Simon, 2026-09-17). Three files have to say the same thing, and
// release.mjs writes all three, so a mismatch means a hand edit.
const addin = path.join(ROOT, "10 Fusion Add-in", "FEBPlanStock");
const coreSrc = fs.readFileSync(path.join(ROOT, "06 Composites App", "app", "core.js"), "utf8");
const appVer = (coreSrc.match(/^var APP_VERSION = "([^"]+)";$/m) || [])[1];
const manifest = JSON.parse(fs.readFileSync(path.join(addin, "FEBPlanStock.manifest"), "utf8"));
const pySrc = fs.readFileSync(path.join(addin, "FEBPlanStock.py"), "utf8");
const pyVer = (pySrc.match(/^ADDIN_VERSION\s*=\s*"([^"]+)"/m) || [])[1];
ok(!!appVer, "core.js declares APP_VERSION");
ok(!!pyVer, "FEBPlanStock.py declares ADDIN_VERSION");
ok(manifest.version === appVer, `manifest (${manifest.version}) matches APP_VERSION (${appVer})`);
ok(pyVer === appVer, `ADDIN_VERSION (${pyVer}) matches APP_VERSION (${appVer})`);
ok(/^\d+\.\d+\.\d+$/.test(appVer), `version ${appVer} is three numbers`);

// release.mjs has to keep writing all three, or they drift on the next release
// and nobody notices until a member reports a version that does not exist.
const relSrc = fs.readFileSync(path.join(ROOT, "tools", "release.mjs"), "utf8");
ok(/ADDIN_VERSION = "\$\{version\}"/.test(relSrc), "release.mjs writes ADDIN_VERSION");
ok(relSrc.includes("FEBPlanStock.manifest"), "release.mjs writes the manifest version");
ok(/gh", \["release", "create"/.test(relSrc), "release.mjs publishes a GitHub Release");
ok(relSrc.includes("package_addin.mjs"), "release.mjs builds the add-in zip");

// The add-in has to actually tell the app its version, or the app's staleness
// check in fusion.js silently never fires.
ok(/msg\["addinVersion"\]\s*=\s*ADDIN_VERSION/.test(pySrc), "the mold message carries addinVersion");
const fusionJs = fs.readFileSync(path.join(ROOT, "06 Composites App", "app", "fusion.js"), "utf8");
const minVer = (fusionJs.match(/MIN_ADDIN_VERSION\s*=\s*"([^"]+)"/) || [])[1];
ok(!!minVer, "fusion.js declares MIN_ADDIN_VERSION");
// A minimum ahead of what we ship would nag every member on a fresh install.
ok(minVer && !cmpNewer(minVer, appVer),
   `MIN_ADDIN_VERSION (${minVer}) is not ahead of the shipped version (${appVer})`);
function cmpNewer(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return false;
}

// ---------- build and unpack ----------
// The packager refuses to build on a version mismatch and on anything it
// would have to ship that it should not. Report that as a test failure with
// its own message rather than as a stack trace from here.
try {
  execFileSync("node", ["tools/package_addin.mjs", "--out", dist], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  const why = String(e.stderr || e.stdout || e.message).trim();
  console.error("\n  FAIL  the packager refused to build:\n" + why.split("\n").map(l => "        " + l).join("\n"));
  console.error(`\ntest_addin_package: ${checks - 1}/${checks + 1} checks passed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
const stem = `FEBPlanStock-${appVer}`;
const zip = path.join(dist, stem + ".zip");
ok(fs.existsSync(zip), `built ${stem}.zip`);

fs.mkdirSync(unzipped, { recursive: true });
execFileSync("unzip", ["-q", zip, "-d", unzipped]);
const top = path.join(unzipped, stem);
ok(fs.existsSync(top), "the zip has one top-level folder named after the version");

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}
const files = walk(top);

// ---------- nothing secret, nothing generated ----------
ok(!files.some(f => /credentials\.json$/.test(f) && !/example/.test(f)),
   "NO credentials.json anywhere in the package");
ok(!files.some(f => /__pycache__|\.pyc$/.test(f)), "no __pycache__ or .pyc");
ok(!files.some(f => /febplanstock\.log$/.test(f)), "no log file");
ok(!files.some(f => /\.DS_Store$/.test(f)), "no .DS_Store");

// ---------- everything Fusion needs ----------
for (const f of ["FEBPlanStock/FEBPlanStock.manifest", "FEBPlanStock/FEBPlanStock.py",
                 "FEBPlanStock/febframe.py", "FEBPlanStock/resources/16x16.png",
                 "FEBPlanStock/resources/32x32.png", "FEBPlanStock/credentials.example.json"]) {
  ok(files.includes(f), `package contains ${f}`);
}

// ---------- the installers, and where they are ----------
for (const f of ["INSTALL.txt", "Install on Mac.command", "Install on Windows.bat"]) {
  ok(files.includes(f), `package contains ${f}`);
  // Inside FEBPlanStock/ they would be copied into Fusion's AddIns directory,
  // where a member can double-click one a second time by accident.
  ok(!files.includes("FEBPlanStock/" + f), `${f} is NOT inside the add-in folder`);
}
const mode = fs.statSync(path.join(top, "Install on Mac.command")).mode;
ok((mode & 0o111) !== 0, "Install on Mac.command is executable after unzipping");

// ---------- the installers are syntactically sound ----------
execFileSync("bash", ["-n", path.join(top, "Install on Mac.command")]);
ok(true, "Install on Mac.command parses");

// Both installers must target Autodesk's documented per-user AddIns path, and
// must not hard-code anybody's home directory.
const mac = fs.readFileSync(path.join(top, "Install on Mac.command"), "utf8");
const win = fs.readFileSync(path.join(top, "Install on Windows.bat"), "utf8");
ok(mac.includes("$HOME/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns"),
   "the Mac installer targets the documented AddIns path");
ok(win.includes("%APPDATA%\\Autodesk\\Autodesk Fusion 360\\API\\AddIns"),
   "the Windows installer targets the documented AddIns path");
ok(!mac.includes("/Users/"), "the Mac installer hard-codes nobody's home directory");
// An update that wipes credentials.json is the bug the old hand-copy had.
ok(/credentials\.json/.test(mac) && /credentials\.json/.test(win),
   "both installers preserve credentials.json across an update");
// The manifest says the add-in is Python, and Fusion will not run it quarantined.
ok(mac.includes("com.apple.quarantine"), "the Mac installer clears quarantine");

// ---------- the version is legible from the artifact ----------
const shipped = JSON.parse(fs.readFileSync(path.join(top, "FEBPlanStock", "FEBPlanStock.manifest"), "utf8"));
ok(shipped.version === appVer, "the shipped manifest carries the version the zip is named for");
ok(shipped.runOnStartup === true, "the shipped add-in still runs on startup");

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\ntest_addin_package: ${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
