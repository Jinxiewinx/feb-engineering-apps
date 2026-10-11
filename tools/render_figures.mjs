/* Rasterize the CS-standard figures: every SVG in "02 CS Standards/src/figures"
   becomes a same-named PNG beside it, at 2x for print.

   Why PNG exists at all: the SVGs are the editable sources, but none of the
   three consumers can take them — python-docx has no SVG support, pandoc's
   xelatex path needs rsvg-convert (not installed), and the app's markdown
   renderer serves whatever file the markdown names. PNG works in all three,
   so the markdown references the PNG and the SVG stays the thing you edit.

   Chromium does the rendering (via the same loadChromium the browser tests
   use) because it is the only SVG renderer this machine is known to have —
   ImageMagick is present but rasterizes SVG text badly without rsvg.

   FONTS (2026-10-10). Figures are drawn in the app's typefaces, Saira and
   Inter (02 CS Standards/STYLE.md §5). The SVGs only NAME the families; this
   script injects the two variable woff2 files from 05 Design System/fonts/
   as data: @font-face rules at render time, so the fonts are not copied into
   thirteen-plus SVGs in git. It then waits for the fonts and refuses to
   screenshot if one did not load, because a fallback face renders silently
   and looks almost right.

   VARIANTS. Competing drafts of a figure live in figures/variants/ as
   <name>.<a|b|c>.svg and never ship. --variants renders them into
   figures/variants/png/ and writes figures/variants/review.html: every
   variant in colour and in grayscale side by side, which is how a reviewer
   checks CS-000 §7.1's "survives a grayscale print" rule.

   HASHES. figures/.hashes.json records the SHA-256 of each SVG next to its
   PNG, so check_traceability.py can tell a PNG that is older than its source.

   Usage:
     node tools/render_figures.mjs [name.svg ...]    (no args = all shipped figures)
     node tools/render_figures.mjs --variants [name.a.svg ...]
   Re-run after editing any SVG, then tools/build_docx.py --all and
   tools/gen_docs_manifest.py so the docx/PDF/app copies pick it up. */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadChromium, skipMessage } from "./lib/browser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIG = join(ROOT, "02 CS Standards", "src", "figures");
const VAR = join(FIG, "variants");
const FONTS = join(ROOT, "05 Design System", "fonts");
const SCALE = 2;

const args = process.argv.slice(2);
const variants = args.includes("--variants");
const only = args.filter(a => !a.startsWith("--"));
const dir = variants ? VAR : FIG;
const outDir = variants ? join(VAR, "png") : FIG;

const names = (await readdir(dir).catch(() => [])).filter(f => f.endsWith(".svg"))
  .filter(f => !only.length || only.includes(f)).sort();
if (!names.length) { console.error(`no SVGs matched in ${dir}`); process.exit(1); }

const chromium = await loadChromium();
if (!chromium) {
  console.error(skipMessage("the CS figures"));
  process.exit(1);
}

const font = async (file) => (await readFile(join(FONTS, file))).toString("base64");
const FONT_CSS = `
@font-face{font-family:'Saira';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${await font("saira-var.woff2")}) format('woff2')}
@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${await font("inter-var.woff2")}) format('woff2')}
html,body{margin:0;padding:0;background:#fff}svg{display:block}`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: SCALE });
const hashes = {};
const rendered = [];
for (const name of names) {
  const svg = await readFile(join(dir, name), "utf8");
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!m) { console.error(`${name}: no viewBox, skipped`); continue; }
  if (/(?:href|src)="(?!#|data:)/.test(svg)) {
    console.error(`${name}: refers to an external file; a figure must be self-contained`);
    process.exitCode = 1; continue;
  }
  const [w, h] = [Math.ceil(+m[1]), Math.ceil(+m[2])];
  await page.setViewportSize({ width: w, height: h });
  /* setContent, not a data: URL: the injected fonts make the page ~400 KB,
     and the inline SVG must size to its viewBox at 1 CSS px per unit. */
  const sized = svg.replace(/<svg\b/, `<svg width="${w}" height="${h}"`);
  await page.setContent(`<!doctype html><html><head><style>${FONT_CSS}</style></head><body>${sized}</body></html>`);
  const wants = [...new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map(x => x[1].split(",")[0].trim().replace(/['"]/g, "")))];
  const missing = await page.evaluate(async (fams) => {
    await document.fonts.ready;
    return fams.filter(f => ["Saira", "Inter"].includes(f) && !document.fonts.check(`600 16px "${f}"`));
  }, wants);
  if (missing.length) {
    console.error(`${name}: font(s) did not load: ${missing.join(", ")}; not rendered`);
    process.exitCode = 1; continue;
  }
  const png = name.replace(/\.svg$/, ".png");
  await page.screenshot({ path: join(outDir, png), clip: { x: 0, y: 0, width: w, height: h } });
  hashes[png] = createHash("sha256").update(svg).digest("hex");
  rendered.push({ name, png, w, h });
  console.log(`rendered ${name} -> ${png} (${w * SCALE}x${h * SCALE})`);
}
await browser.close();

if (!variants) {
  /* Merge, so rendering one figure does not forget the others' hashes. */
  const hfile = join(FIG, ".hashes.json");
  const prev = JSON.parse(await readFile(hfile, "utf8").catch(() => "{}"));
  const merged = Object.fromEntries(Object.entries({ ...prev, ...hashes }).sort());
  await writeFile(hfile, JSON.stringify(merged, null, 1) + "\n");
} else {
  /* The review sheet: one row per figure, its variants across, each shown in
     colour over grayscale. Opened locally by a reviewer; never shipped. */
  const groups = {};
  for (const r of rendered) (groups[r.name.replace(/\.[a-z]\.svg$/, "")] ||= []).push(r);
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = Object.entries(groups).map(([fig, vs]) => `
<section><h2>${esc(fig)}</h2><div class="row">${vs.map(v => `
  <figure><figcaption>${esc(v.name)} (${v.w}×${v.h})</figcaption>
    <img src="png/${esc(v.png)}" alt="${esc(v.name)} in colour">
    <img class="g" src="png/${esc(v.png)}" alt="${esc(v.name)} in grayscale"></figure>`).join("")}
</div></section>`).join("");
  await writeFile(join(VAR, "review.html"), `<!doctype html><meta charset="utf-8">
<title>Figure variants</title>
<style>body{font:14px Inter,system-ui,sans-serif;margin:24px;color:#141d2b}
h2{font-family:Saira,sans-serif;margin:32px 0 8px}.row{display:flex;gap:24px;flex-wrap:wrap}
figure{margin:0;flex:1 1 420px;max-width:680px}figcaption{color:#515f74;margin-bottom:6px}
img{width:100%;border:1px solid #dde3ec;display:block;margin-bottom:8px}
img.g{filter:grayscale(1)}</style>
<h1>Figure variants: colour above, grayscale below</h1>
<p>Each distinction must survive the grayscale copy (CS-000 §7.1 step 4).</p>${rows}\n`);
  console.log(`review sheet -> ${join("02 CS Standards", "src", "figures", "variants", "review.html")}`);
}
