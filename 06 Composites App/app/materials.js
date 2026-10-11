"use strict";
/* materials.js — what a material IS, keyed by matKey.
 *
 * The third config table, alongside the restock rules (reorder thresholds)
 * and RESINS (cure holds). This one holds identity and paperwork: which
 * names mean this material, where its datasheet and SDS live, and the two
 * numbers people walk to a laptop for — mix ratio and shelf life.
 *
 * WHY IT EXISTS. The EH&S import created records straight from RSS's names
 * ("IN2 Epoxy Infusion Resin", "AT30 SLOW EPOXY HARDENER"), with matKey
 * blank — so the restock engine, which groups by matKey, was blind to fifty
 * containers, and nothing linked a jug to the TDS sitting twenty files away
 * in docs/datasheets/. The alias table is the join: name → matKey, filled
 * only when blank, and everything keyed on matKey lights up at once.
 *
 * ALIAS MATCHING IS A DELIBERATE EXCEPTION to the "never pattern-match
 * names" rule (rxInferFromName's comment). That rule exists because a
 * GUESSED safety fact is a silent false all-clear. An alias row is not a
 * guess: a human wrote "at30 means AT30" into this table, the same trust
 * level as a restock rule — and this table carries NO safety fields at all.
 * Hazard and role stay the restock table's and the import's business, so
 * the two sources can never disagree.
 *
 * RATIOS AND SHELF LIVES COME ONLY FROM THE BUNDLED DATASHEETS, and each
 * entry's `src` names the PDF the numbers were read from. No datasheet in
 * docs/manifest.json, no number — blank beats guessed, and
 * materialsTableProblems() (asserted by tools/test_app.mjs) enforces that
 * every doc/sds path here actually exists in the manifest.
 *
 * Matching: first entry whose alias appears in the lowercased name wins, so
 * specific entries (91% IPA) must sit above generic ones (isopropyl). */

const MATERIALS = [
  { matKey: "IN2", label: "IN2 infusion resin", aliases: ["in2"],
    doc: "docs/datasheets/EC-TDS-IN2-Infusion-Resin.pdf",
    sds: "docs/datasheets/EC-SDS-IN2-Epoxy-Infusion-Resin-and-Hardener.pdf",
    ratio: "100:30 with AT30, by weight", shelfLifeMonths: 12,
    src: "EC TDS IN2 (mix ratio 100:30 by weight; 12-month shelf life stored 20–25°C)" },
  { matKey: "AT30", label: "AT30 hardener", aliases: ["at30"],
    doc: "docs/datasheets/EC-TDS-IN2-Infusion-Resin.pdf",
    sds: "docs/datasheets/EC-SDS-IN2-Epoxy-Infusion-Resin-and-Hardener.pdf",
    ratio: "100:30 with IN2, by weight", shelfLifeMonths: 12,
    src: "EC TDS IN2 — the IN2 sheet states the AT30 ratio and the shared shelf life" },
  { matKey: "WEST-209", label: "West System 209 extra slow hardener", aliases: ["209 extra slow", "209 hardener"],
    doc: "docs/datasheets/105-209-Epoxy-Resin-1.pdf",
    ratio: "3:1 with 105, by volume (3.68:1 by weight)",
    src: "West System 105/209 TDS (3 parts resin : 1 part hardener by volume, 300 Mini Pump ratio; 3.68:1 by weight)" },
  { matKey: "WEST-206", label: "West System 206 slow hardener", aliases: ["206 slow", "206 hardener"],
    doc: "docs/datasheets/west-system_slow-epoxy-hardener_206_tds.pdf",
    ratio: "5:1 with 105, by volume",
    src: "West System 206 TDS (5 parts resin : 1 part hardener, 300 Mini Pump ratio)" },
  { matKey: "WEST-105", label: "West System 105 resin", aliases: ["west system 105", "105 epoxy resin", "west 105"],
    doc: "docs/datasheets/WestSystems-105-205-Epoxy-Resin.pdf",
    src: "ratio depends on the hardener — see its entry" },
  { matKey: "XCR", label: "XCR mold coating resin", aliases: ["xcr"],
    doc: "docs/datasheets/EC-TDS-XCR-Epoxy-Coating-Resin.pdf",
    sds: "docs/datasheets/EC-SDS-XCR-Epoxy-Coating-Resin-Combined.pdf",
    shelfLifeMonths: 12,
    src: "EC TDS XCR (12-month shelf life; ratio left blank — read it off the sheet)" },
  { matKey: "VB160", label: "VB160 bagging film", aliases: ["vb160"],
    doc: "docs/datasheets/EC-TDS-VB160-Vacuum-Bagging-Film.pdf",
    sds: "docs/datasheets/EC-SDS-VB160-Vacuum-Bagging-Film.pdf" },
  { matKey: "PEEL-PLY", label: "PP180 peel ply", aliases: ["peel ply", "pp180"],
    doc: "docs/datasheets/EC-TDS-PP180-Peel-Ply.pdf" },
  { matKey: "AIRTAC", label: "Airtac 2 spray adhesive", aliases: ["airtac"],
    doc: "docs/datasheets/airtac2imp.pdf",
    sds: "docs/datasheets/airtac2spray.pdf" },
  { matKey: "F5-WAX", label: "Formula Five mold release wax", aliases: ["mold release wax", "formula five mold release"],
    doc: "docs/datasheets/FORMULA-FIVE-Mold-Release-Wax.pdf",
    sds: "docs/datasheets/SDS-F5MRW-5.3-en-NA-2025-01-28.pdf" },
  { matKey: "CLEAN-N-GLAZE", label: "Formula Five Clean 'N Glaze", aliases: ["n glaze"],
    doc: "docs/datasheets/FORMULA-FIVE-Clean-N-Glaze.pdf",
    sds: "docs/datasheets/SDS-CG-5.3-en-NA-2025-01-28.pdf" },
  { matKey: "PARTALL-10", label: "Partall Film #10 PVA release", aliases: ["partall"],
    doc: "docs/datasheets/PARTALL-Film-10.pdf",
    sds: "docs/datasheets/SDS-PF10-5.5-en-NA-2025-01-28.pdf" },
  { matKey: "DP420", label: "3M DP420 epoxy adhesive", aliases: ["dp420", "dp 420"],
    doc: "docs/datasheets/3m-scotch-weld-epoxy-adhesive-dp420-black.pdf" },
  { matKey: "URE-BOND-90", label: "Ure-Bond 90 urethane adhesive", aliases: ["ure-bond", "ure bond"],
    doc: "docs/datasheets/URE_BOND_90_TB.pdf",
    sds: "docs/datasheets/1386A_2-1386B_2.pdf" },
  /* No datasheets bundled for these — the alias rows exist so the containers
     still group and count under one key. Specific concentrations above the
     generic isopropyl row, first match wins. */
  { matKey: "IPA-91", label: "Isopropyl alcohol 91%", aliases: ["91% isopropyl"] },
  { matKey: "IPA-70", label: "Isopropyl rubbing alcohol 70%", aliases: ["rubbing alcohol"] },
  { matKey: "IPA", label: "Isopropyl alcohol", aliases: ["isopropyl", "2-propanol"] },
  { matKey: "ACETONE", label: "Acetone", aliases: ["acetone"] },
  { matKey: "BONDO", label: "Bondo body filler", aliases: ["bondo"] },
  { matKey: "FREKOTE", label: "Frekote 700-NC release agent", aliases: ["frekote"] },
  { matKey: "PUMP-OIL", label: "Vacuum pump oil", aliases: ["vacuum pump oil"] },
  { matKey: "WEST-404", label: "West System 404 high-density filler", aliases: ["404 high-density", "404 high density"] },
];

/* name → MATERIALS entry, or null. Case-blind substring over the alias list,
   in table order. */
function matForName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const m of MATERIALS) {
    if ((m.aliases || []).some(a => n.includes(a))) return m;
  }
  return null;
}
function matByKey(matKey) {
  const k = String(matKey || "").trim();
  return k ? MATERIALS.find(m => m.matKey === k) || null : null;
}
/* The entry for a lot record: its matKey first, its name as the fallback —
   so an un-backfilled record still gets its datasheet link. */
function matForLot(o) {
  return matByKey(o.matKey) || matForName(o.name);
}

/* Table hygiene, asserted by tools/test_app.mjs the way resinTableProblems
   is: broken paths and shadowed aliases must fail a test, not a person at
   the shelf. `manifestSrcs` is injected by the test (the app itself never
   needs the check). */
function materialsTableProblems(manifestSrcs) {
  const out = [];
  const seen = new Set();
  for (const m of MATERIALS) {
    if (!m.matKey || seen.has(m.matKey)) out.push(`${m.matKey || "(blank)"}: missing or duplicate matKey`);
    seen.add(m.matKey);
    if (!(m.aliases || []).length) out.push(`${m.matKey}: no aliases — unreachable`);
    for (const p of [m.doc, m.sds].filter(Boolean)) {
      if (!manifestSrcs.includes(p)) out.push(`${m.matKey}: ${p} is not in docs/manifest.json`);
    }
    if ((m.ratio || m.shelfLifeMonths) && !m.src) out.push(`${m.matKey}: a number with no datasheet citation`);
    if ((m.ratio || m.shelfLifeMonths) && !m.doc) out.push(`${m.matKey}: a number with no datasheet to open`);
  }
  return out;
}

/* ---------- the backfill ----------
 *
 * "Link materials" on the Materials list: propose a matKey for every record
 * that has none and whose name an alias recognises — the 50 EH&S-imported
 * containers being the case in hand. Confirm-first like the mold import:
 * a list, ticked by default, nothing written until the button. Fills BLANKS
 * only: a matKey somebody typed is a decision. Where the table knows a shelf
 * life and the record has a received date but no expiry, the expiry is
 * offered too, stamped expirySource "shelf-life table" — the enum value that
 * has existed since the field did, finally with a table behind it. */
let MAT_LINK = [];

function matAddMonths(iso, months) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1 + months, +m[3]));
  return d.toISOString().slice(0, 10);
}
function matLinkExpiry(o, mat) {
  if (o.expiresOn || !o.receivedOn || !mat.shelfLifeMonths) return "";
  return matAddMonths(o.receivedOn, mat.shelfLifeMonths);
}

function openMatLink() {
  MAT_LINK = (DB.lots || [])
    .filter(o => !String(o.matKey || "").trim())
    .map(o => ({ o, mat: matForName(o.name), take: true }))
    .filter(x => x.mat);
  if (!MAT_LINK.length) { toast("Nothing to link — every record has a material type, or no name matches the table.", "info"); return; }
  openModal(matLinkHtml());
}

function matLinkHtml() {
  const n = MAT_LINK.filter(x => x.take).length;
  return `<h2>Link materials</h2>
  <p class="muted tny">These records have no material type, and their names match the materials table.
    Linking sets <b>matKey</b> — which is what the reorder engine and the grouped views count by —
    and, where the table knows a shelf life and the record has a received date but no expiry,
    fills the expiry from it. Nothing already filled in is touched.</p>
  <div class="lblist">
    ${MAT_LINK.map((x, i) => `<label class="chk">
      <input type="checkbox" ${x.take ? "checked" : ""} onchange="MAT_LINK[${i}].take=this.checked;matLinkRefresh()">
      <b>${esc(x.o.name || x.o.id)}</b> <span class="muted tny">${esc(x.o.id)}</span>
      <span class="tny">→ ${esc(x.mat.matKey)}</span>
      ${matLinkExpiry(x.o, x.mat) ? `<span class="tny muted">· expiry ${esc(matLinkExpiry(x.o, x.mat))}</span>` : ""}
    </label>`).join("")}
  </div>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${n ? "" : "disabled"} onclick="runMatLink()">Link ${n} record${n === 1 ? "" : "s"}</button>
  </div>`;
}
function matLinkRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = matLinkHtml();
}

function runMatLink() {
  const take = MAT_LINK.filter(x => x.take);
  closeModal();
  let linked = 0, dated = 0;
  for (const { o, mat } of take) {
    o.matKey = mat.matKey;
    save("lots", o, "matKey");
    const exp = matLinkExpiry(o, mat);
    if (exp) {
      o.expiresOn = exp;
      o.expirySource = "shelf-life table";
      save("lots", o, "expiresOn");
      save("lots", o, "expirySource");
      dated++;
    }
    linked++;
  }
  MAT_LINK = [];
  toast(`${linked} record${linked === 1 ? "" : "s"} linked${dated ? `, ${dated} expiry date${dated === 1 ? "" : "s"} filled from shelf life` : ""}.`);
  render();
}

/* The read-only strip a lot's detail page and a group row draw from. */
function matInfoHtml(entry, opts) {
  if (!entry) return "";
  const lite = !!(opts && opts.lite);   // a group row wants the ratio and the sheet, not the whole card
  const rule = !lite && typeof restockRuleFor === "function" ? restockRuleFor(entry.matKey) : null;
  const bits = [
    entry.ratio ? `<span class="tny">mix ${esc(entry.ratio)}</span>` : "",
    !lite && entry.shelfLifeMonths ? `<span class="tny muted">${entry.shelfLifeMonths}-month shelf life</span>` : "",
    rule ? `<span class="tny muted">reorder at ${rule.minCount} ${esc(rule.unit)}</span>` : "",
    entry.doc ? `<button class="sm ib no-print" onclick="event.stopPropagation();openDatasheet('${esc(entry.doc)}')">TDS</button>` : "",
    !lite && entry.sds ? `<button class="sm ib no-print" onclick="event.stopPropagation();openDatasheet('${esc(entry.sds)}')">SDS</button>` : "",
  ].filter(Boolean);
  if (!bits.length) return "";
  return `<span class="matinfo" ${entry.src ? `title="${esc(entry.src)}"` : ""}>${bits.join("")}</span>`;
}
