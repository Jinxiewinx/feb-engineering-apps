/* build_ai_corpus.mjs — the documents "Ask Paul" can read, as plain-text
 * sections, written to 06 Composites App/functions/corpus.json.
 *
 * WHAT GOES IN. The app's reference tables (see `facts` below), and only
 * documents the app ships in docs/: the CS standards
 * (docs/standards/CS-*.md, split at their headings) and the datasheets
 * (docs/datasheets/*.pdf, through pdftotext, split by page). The standards are
 * unlisted in the Documents tab but still served, so a source chip can open
 * them. Nothing from outside the app, which is the whole promise: Paul answers
 * from what the team has, not from what a model remembers.
 *
 * WHY A FILE AND NOT A SEARCH SERVICE. About a thousand sections fit in a few
 * hundred KB, keyword scoring over them takes milliseconds inside the function,
 * and a JSON file in the repo can be diffed and checked. Nothing to keep in
 * sync, nothing else to deploy.
 *
 *   node tools/build_ai_corpus.mjs           # writes the file
 *   node tools/build_ai_corpus.mjs --check   # exits 1 if the file is stale
 *
 * Needs pdftotext (poppler). release.mjs runs --check before shipping.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "06 Composites App");
const DOCS = path.join(APP, "app", "docs");
const OUT = path.join(APP, "functions", "corpus.json");
const MAX = 2400; // characters per section; longer ones are split on paragraphs

const clean = (t) => t.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function splitLong(text) {
  if (text.length <= MAX) return [text];
  const out = [];
  let cur = "";
  for (const para of text.split(/\n\n+/)) {
    if (cur && (cur + "\n\n" + para).length > MAX) { out.push(cur); cur = ""; }
    cur = cur ? cur + "\n\n" + para : para;
    while (cur.length > MAX) { out.push(cur.slice(0, MAX)); cur = cur.slice(MAX); }
  }
  if (cur) out.push(cur);
  return out;
}

const sections = [];
function add(doc, title, src, section, text) {
  const parts = splitLong(clean(text));
  parts.forEach((t, i) => {
    if (t.length < 40) return; // a bare heading or a page number carries nothing
    const sec = parts.length > 1 ? `${section} (${i + 1}/${parts.length})` : section;
    sections.push({ ref: `${doc}#${sections.filter(s => s.doc === doc).length + 1}`, doc, title, src, section: sec, text: t });
  });
}

/* Standards: the .md copy, split at #/##/### headings. The PDF is what a
   person opens, so it is the src. */
const stdDir = path.join(DOCS, "standards");
for (const f of readdirSync(stdDir).filter(f => /^CS-\d+\.md$/.test(f)).sort()) {
  const doc = f.replace(/\.md$/, "");
  const md = readFileSync(path.join(stdDir, f), "utf8");
  const h1 = (md.match(/^#\s+(.+)$/m) || [])[1] || doc;
  const title = h1.replace(/\*\*/g, "").trim();
  const pdf = existsSync(path.join(stdDir, doc + ".pdf")) ? `docs/standards/${doc}.pdf` : `docs/standards/${f}`;
  let heading = "Introduction", buf = [];
  const flush = () => { if (buf.length) add(doc, title, pdf, heading, buf.join("\n")); buf = []; };
  for (const line of md.split("\n")) {
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) { flush(); heading = h[1].replace(/\*\*/g, "").trim(); continue; }
    buf.push(line);
  }
  flush();
}

/* Datasheets: one section per page, titled from the docs manifest so the
   chip reads the way the Documents tab does. */
const manifest = JSON.parse(readFileSync(path.join(DOCS, "manifest.json"), "utf8"));
const titleOf = (src) => (manifest.find(m => m.src === src) || {}).title;
const dsDir = path.join(DOCS, "datasheets");
for (const f of readdirSync(dsDir).filter(f => f.endsWith(".pdf")).sort()) {
  const src = `docs/datasheets/${f}`;
  const doc = "DS-" + f.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
  const title = titleOf(src) || f.replace(/\.pdf$/i, "");
  const raw = execFileSync("pdftotext", ["-layout", "-q", path.join(dsDir, f), "-"], { encoding: "utf8", maxBuffer: 32 << 20 });
  raw.split("\f").forEach((page, i) => add(doc, title, src, `page ${i + 1}`, page));
}

/* The app's own reference tables, which live as constants in the browser
   code: resin systems and their team holds, the materials table, the restock
   rules, the trainings catalogue. Copied out here (the literal only, evaluated
   in an empty sandbox) so Paul reads the same numbers the app enforces;
   askPaul folds the leads' config/* overrides over them at question time. */
function literal(file, name) {
  const src = readFileSync(path.join(APP, "app", file), "utf8");
  const m = src.match(new RegExp(`^const ${name} = ([\\[{][\\s\\S]*?^[\\]}]);`, "m"));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return vm.runInNewContext("(" + m[1] + ")", Object.create(null), { timeout: 1000 });
}
const facts = {
  resins: literal("resins.js", "RESINS"),
  materials: literal("materials.js", "MATERIALS"),
  restock: literal("inventory.js", "RESTOCK_SEED"),
  trainings: literal("workorders.js", "TRAININGS"),
};

const json = JSON.stringify({ note: "Built by tools/build_ai_corpus.mjs from app/docs and the app's reference tables. Do not edit by hand.", sections, facts }, null, 0) + "\n";
if (process.argv.includes("--check")) {
  const same = existsSync(OUT) && readFileSync(OUT, "utf8") === json;
  console.log(same ? "corpus.json is current" : "corpus.json is STALE: run node tools/build_ai_corpus.mjs");
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, json);
const docs = new Set(sections.map(s => s.doc));
console.log(`facts: ${facts.resins.length} resin systems, ${facts.materials.length} materials, ${facts.restock.length} restock rules, ${Object.keys(facts.trainings).length} trainings`);
console.log(`${sections.length} sections from ${docs.size} documents, ${(json.length / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), OUT)}`);
