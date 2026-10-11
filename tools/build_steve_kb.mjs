#!/usr/bin/env node
/* build_steve_kb.mjs: Steve's notes and catalog categories, offline.
 *
 * Two outputs, both in 06 Composites App/functions/ so they deploy with the
 * functions:
 *
 * 1. steve_kb.json. steve/fibreglast-lines.md and steve/upsell-map.md split
 *    at their ## headings into sections {ref: "STEVE-<n>", title, section,
 *    text}. Steve's search_steve_notes tool reads this file and nothing else
 *    (register R-STV-06). Paul never gets the tool, and the refs are never
 *    put in the citation set, so a [STEVE-n] Steve writes is dropped: the
 *    notes are background for his voice, not a source. The steve/ README and
 *    catalog-categories.json are deliberately left out: they carry register
 *    IDs and code, and Steve's material stays free of numbers.
 *
 * 2. steve_catalog.json, categorised. Each product gets a `cat` from the
 *    ordered rules in steve/catalog-categories.json (first match wins,
 *    fallback "other"), and its title has HTML entities decoded ("20&#37;
 *    Shrink Tape" was stored raw). searchCatalog reads `cat` to keep PPE and
 *    solvents away from Steve (R-STV-02, R-STV-03, R-STV-08).
 *
 * WHY A SEPARATE SCRIPT and not a mode of build_steve_catalog.mjs. That one
 * hits Fibreglast's live store and is re-run by hand when prices should be
 * fresh, so release.mjs can't run it. This one reads only files in the repo,
 * is deterministic, and has a --check mode release.mjs runs beside the
 * corpus check. build_steve_catalog.mjs imports categorise() and
 * decodeEntities() from here, so a refetch writes `cat` too.
 *
 *   node tools/build_steve_kb.mjs           # writes both files
 *   node tools/build_steve_kb.mjs --check   # exits 1 if either is stale
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(here, "..", "06 Composites App");
const STEVE = path.join(APP, "steve");
const KB_OUT = path.join(APP, "functions", "steve_kb.json");
const CATALOG = path.join(APP, "functions", "steve_catalog.json");
const NOTES = ["fibreglast-lines.md", "upsell-map.md"];

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  ndash: "-", mdash: "-", reg: "®", trade: "™", copy: "©", deg: "°", frac12: "½", frac14: "¼", times: "×", hellip: "..." };
/* Shopify titles carry the odd entity ("20&#37; Shrink Tape"). Numeric and
   the common named ones; an unknown name is left as it was. */
export function decodeEntities(s) {
  return String(s == null ? "" : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+\d*);/gi, (m, n) => (n.toLowerCase() in NAMED ? NAMED[n.toLowerCase()] : m));
}

/* The category rules, compiled once. */
export function loadRules(file = path.join(STEVE, "catalog-categories.json")) {
  const f = JSON.parse(readFileSync(file, "utf8"));
  return { rules: f.rules.map((r) => ({ cat: r.cat, re: new RegExp(r.match, "i") })), fallback: f.fallback || "other" };
}

/* One catalog row -> its category. The test string is the decoded title,
   the tags and the handle, in that order, as the rules file describes. */
export function categorise(row, rules = loadRules()) {
  const hay = `${decodeEntities(row.title)} ${(row.tags || []).join(" ")} ${row.handle}`;
  const hit = rules.rules.find((r) => r.re.test(hay));
  return hit ? hit.cat : rules.fallback;
}

/* A catalog row as it ships: decoded title and a `cat`, every other field
   left as toRow wrote it. Runs on rows already in steve_catalog.json, so
   categorising never needs a refetch. */
export function withCategory(row, rules = loadRules()) {
  const { cat, ...rest } = row;
  const out = { ...rest, title: decodeEntities(rest.title) };
  return { ...out, cat: categorise(out, rules) };
}

/* steve/*.md -> sections. The lead-in before the first ## is a section too
   ("About these notes"): in the upsell map it carries the rules that hold for
   every topic. */
export function splitNotes(dir = STEVE) {
  const sections = [];
  for (const f of NOTES) {
    const md = readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "");
    const title = ((md.match(/^#\s+(.+)$/m) || [])[1] || f).trim();
    let heading = "About these notes", buf = [];
    const flush = () => {
      const text = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (text.length >= 40) sections.push({ ref: `STEVE-${sections.length + 1}`, title, section: heading, text });
      buf = [];
    };
    for (const line of md.split("\n")) {
      if (/^#\s/.test(line)) continue;
      const h = line.match(/^##\s+(.+)$/);
      if (h) { flush(); heading = h[1].trim(); continue; }
      buf.push(line);
    }
    flush();
  }
  return sections;
}

export function build() {
  const kb = JSON.stringify({ note: "Built by tools/build_steve_kb.mjs from steve/fibreglast-lines.md and steve/upsell-map.md. Steve's background only: never cited, never in Paul's corpus. Do not edit by hand.", sections: splitNotes() }, null, 0) + "\n";
  const rules = loadRules();
  const cat = JSON.parse(readFileSync(CATALOG, "utf8"));
  const catalog = JSON.stringify({ ...cat, products: cat.products.map((p) => withCategory(p, rules)) }) + "\n";
  return { kb, catalog };
}

function main() {
  const { kb, catalog } = build();
  const kbSame = existsSync(KB_OUT) && readFileSync(KB_OUT, "utf8") === kb;
  const catSame = readFileSync(CATALOG, "utf8") === catalog;
  if (process.argv.includes("--check")) {
    console.log(kbSame ? "steve_kb.json is current" : "steve_kb.json is STALE: run node tools/build_steve_kb.mjs");
    console.log(catSame ? "steve_catalog.json categories are current" : "steve_catalog.json categories are STALE: run node tools/build_steve_kb.mjs");
    process.exit(kbSame && catSame ? 0 : 1);
  }
  if (!kbSame) writeFileSync(KB_OUT, kb);
  if (!catSame) writeFileSync(CATALOG, catalog);
  const k = JSON.parse(kb), c = JSON.parse(catalog);
  const counts = {};
  for (const p of c.products) counts[p.cat] = (counts[p.cat] || 0) + 1;
  console.log(`${k.sections.length} note sections -> ${path.relative(process.cwd(), KB_OUT)}`);
  console.log(`${c.products.length} products categorised -> ${path.relative(process.cwd(), CATALOG)}`);
  console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k2, n]) => `  ${k2}: ${n}`).join("\n"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
