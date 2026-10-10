#!/usr/bin/env node
/* build_steve_catalog.mjs — the Fibreglast store, as Steve's shelf.
 *
 * Steve (the team's always-wrong agent "from Fibreglast", 2026-10-10) only
 * recommends real products, with real links. Fibreglast runs on Shopify, whose
 * public /products.json lists the whole catalog 250 at a time. This pulls it
 * into functions/steve_catalog.json: handle, title, type, tags, lowest price,
 * whether anything is in stock, and a short plain blurb. The URL is built from
 * the handle, so a link can't be made up.
 *
 * Re-run by hand when prices should be fresh, commit, deploy functions. A
 * stale entry costs at worst a 404 link, so release.mjs doesn't gate on it.
 *
 *   node tools/build_steve_catalog.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STORE = "https://www.fibreglast.com";

const plain = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ").trim();

/* One products.json product -> one catalog row. Exported for the test. */
export function toRow(p) {
  const prices = (p.variants || []).map((v) => Number(v.price)).filter((n) => n > 0);
  return {
    handle: String(p.handle),
    title: String(p.title || "").trim(),
    type: String(p.product_type || "").trim(),
    tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",")).map((t) => String(t).trim()).filter((t) => t && !/^(non-)?promo/i.test(t)).slice(0, 12),
    price: prices.length ? Math.min(...prices) : null,
    available: (p.variants || []).some((v) => v.available !== false),
    blurb: plain(p.body_html).slice(0, 240),
  };
}

async function main() {
  const rows = [];
  for (let page = 1; page < 40; page++) {
    const res = await fetch(`${STORE}/products.json?limit=250&page=${page}`, { headers: { "User-Agent": "FEB-Composites-catalog/1.0" } });
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`);
    const { products } = await res.json();
    if (!products || !products.length) break;
    rows.push(...products.map(toRow).filter((r) => r.handle && r.title));
  }
  if (rows.length < 100) throw new Error(`only ${rows.length} products; not overwriting the catalog`);
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "06 Composites App", "functions", "steve_catalog.json");
  writeFileSync(out, JSON.stringify({ store: STORE, fetchedAt: new Date().toISOString().slice(0, 10), products: rows }) + "\n");
  console.log(`${rows.length} products -> ${path.relative(process.cwd(), out)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
