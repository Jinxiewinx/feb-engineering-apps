/* indexer.js — turn a Fluent report PDF into a comparable structure.

   Fluent exports these reports through Chromium, and every export has the same
   shape: a title page, setup tables, then Plots, Contours and Vectors sections
   made of named panels. That regularity is the whole reason automatic comparison
   is possible, and this file is where it gets read out.

   Two things make a panel findable:

   1. Panel titles are set noticeably larger than body text and sit hard against
      the left margin. In the sample every one lands at 26.8125 pt with x < 80,
      so a tolerance band around that separates titles from everything else
      without parsing layout.
   2. Panels sit on a uniform vertical pitch and flow continuously down the
      document, which means a panel can begin near the bottom of one page and
      finish on the next. Nothing here may assume a panel lives on one page.

   Because of (2) everything is expressed in STRIP coordinates: pages stacked
   end to end into one tall column, y measured from the top of page 1. A panel is
   then just a window into the strip, and rendering it is a crop that may span two
   page canvases. Vector plots, raster contours and vector fields all work the
   same way under this model.

   The pitch is measured from the document rather than hardcoded, so a re-styled
   export changes the numbers without breaking the reader. */

export const TITLE_PT_MIN = 24;      // a panel title is at least this tall
export const TITLE_PT_MAX = 30;      // and no taller than this
export const TITLE_X_MAX = 90;       // and starts at the left margin
export const SECTIONS = ["Plots", "Contours", "Vectors"];

/* Panels only exist inside the comparable sections. Headings before the first
   one are the setup tables (System Information, Geometry and Mesh, and so on):
   worth indexing for search and navigation, not worth diffing as images. */
function classify(heading, firstSectionY) {
  if (SECTIONS.includes(heading.name)) return "section";
  return heading.absY < firstSectionY ? "setup" : "panel";
}

/* pdf.js reports text with a bottom-left origin and a baseline y. Everything
   else in this app is top-left, so convert once, here. */
function toTopLeft(item, pageHeight) {
  const h = item.height || Math.hypot(item.transform[2], item.transform[3]);
  const baseline = item.transform[5];
  return { x: item.transform[4], yTop: pageHeight - baseline - h, h };
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Build the whole index for one document. `doc` is a pdf.js PDFDocumentProxy. */
export async function indexDocument(doc, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const pages = [];
  const headings = [];
  const text = [];
  let absY = 0;

  /* Ask the worker for every page's text a few at a time rather than one
     round trip after another: the worker parses while the main thread waits,
     so keeping several requests in flight is most of the win. The pages are
     then walked in order, exactly as before. */
  const fetched = new Array(doc.numPages);
  let nextPage = 1, got = 0;
  const pool = Array.from({ length: Math.min(opts.concurrency || 6, doc.numPages) }, async () => {
    while (nextPage <= doc.numPages) {
      const p = nextPage++;
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      page.cleanup();
      fetched[p - 1] = { vp, content };
      onProgress(++got, doc.numPages);
    }
  });
  await Promise.all(pool);

  for (let p = 1; p <= doc.numPages; p++) {
    const { vp, content } = fetched[p - 1];
    pages.push({ index: p, width: vp.width, height: vp.height, absY });

    const words = [];
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      words.push(item.str);
      const { x, yTop, h } = toTopLeft(item, vp.height);
      if (h >= TITLE_PT_MIN && h <= TITLE_PT_MAX && x <= TITLE_X_MAX) {
        headings.push({ name: item.str.trim(), page: p, pageY: yTop, absY: absY + yTop, h });
      }
    }
    text.push({ page: p, text: words.join(" ") });

    absY += vp.height;
  }

  headings.sort((a, b) => a.absY - b.absY);

  /* Merge titles that got split into separate text items ("Geometry" "and"
     "Mesh" arrive as three runs on the same line). Same line means same absY
     within a point or so. */
  const merged = [];
  for (const h of headings) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.absY - h.absY) < 2 && h.page === prev.page) prev.name += " " + h.name;
    else merged.push({ ...h });
  }

  const firstSection = merged.find(h => SECTIONS.includes(h.name));
  const firstSectionY = firstSection ? firstSection.absY : Infinity;
  for (const h of merged) h.kind = classify(h, firstSectionY);

  const panels = merged.filter(h => h.kind === "panel");

  /* Panel height comes from the spacing the document actually uses, so this
     survives a re-styled export. Consecutive panels within a section give the
     pitch; the median ignores the gaps where a section changes. */
  const gaps = [];
  for (let i = 1; i < panels.length; i++) {
    const d = panels[i].absY - panels[i - 1].absY;
    if (d > 50 && d < 1500) gaps.push(d);
  }
  const pitch = median(gaps) || 502.5;

  /* Track the section each panel belongs to, and give every panel a stable id.
     Names repeat across documents, which is exactly what makes them matchable. */
  let section = null;
  const sectionOf = {};
  for (const h of merged) {
    if (h.kind === "section") section = h.name;
    else if (h.kind === "panel") sectionOf[h.absY] = section;
  }

  const stripHeight = absY;

  /* A panel runs until the next panel, or the next section heading, whichever
     comes first. Do NOT just use the pitch: when Chromium inserts a page break
     it pushes the plot down, so those panels genuinely occupy more of the strip
     than the typical spacing suggests. 28 of the 58 panels in the sample are
     like that, by up to 152 pt, and assuming the pitch cropped every one of
     them.

     The cap matters at a section boundary, where the "next thing" is a heading
     pages away and the gap is nearly all trailing whitespace (one measures
     1053 pt). The largest genuine extent seen is 654 pt, so 1.6x the pitch
     leaves clear headroom while keeping those panes from becoming mostly
     empty. */
  const MAX_EXTENT = pitch * 1.6;
  const stops = [...panels.map(p => p.absY), ...merged.filter(h => h.kind === "section").map(h => h.absY)]
    .sort((a, b) => a - b);

  const out = panels.map((p, i) => {
    const next = stops.find(y => y > p.absY + 1);
    const extent = (next == null ? stripHeight : next) - p.absY;
    return {
      id: `${sectionOf[p.absY] || "?"}/${p.name}`,
      name: p.name,
      section: sectionOf[p.absY] || null,
      page: p.page,
      pageY: p.pageY,
      absY: p.absY,
      height: Math.max(pitch * 0.6, Math.min(extent, MAX_EXTENT, stripHeight - p.absY)),
      extent,                      // what the layout actually allots, before the cap
      order: i,
    };
  });

  return {
    numPages: doc.numPages,
    pages,
    stripHeight,
    pitch,
    sections: merged.filter(h => h.kind === "section").map(h => ({ name: h.name, absY: h.absY, page: h.page })),
    setup: merged.filter(h => h.kind === "setup").map(h => ({ name: h.name, absY: h.absY, page: h.page })),
    panels: out,
    text,
  };
}

/* Re-lay the document in CONTENT space, dropping each page's print margins so
   pages abut their ink rather than their paper edges.

   The reason is the convergence plots: Chromium breaks a page in the middle of
   one, so the bottom margin of the upper page and the top margin of the lower
   page meet as a white band straight through the plot. In paper space that band
   is real, so the plot renders split and the content crop mistakes the band for
   the gap under the title. Collapsing the margins makes a seam-spanning plot one
   continuous image and removes the false gap.

   Kept as a separate pure step, fed measured margins, so indexDocument stays
   text-only and node-testable while the margin measurement (which needs a
   canvas) lives in the browser. `margins[i]` is { top, bottom } in page points
   for page i; a missing entry means no trim, so the app still works if
   measurement fails.

   Paper-space fields are preserved with a `paper` prefix for reference; absY and
   height are replaced with content-space values, since that is what every
   consumer now reads. */
export function withContentSpace(index, margins = []) {
  const pages = index.pages.map((p, i) => {
    const m = margins[i] || { top: 0, bottom: 0 };
    const cTop = Math.max(0, m.top || 0);
    const cBottom = Math.min(p.height, p.height - (m.bottom || 0));
    const cHeight = Math.max(1, cBottom - cTop);
    return { ...p, cTop, cBottom, cHeight };
  });
  let cy = 0;
  for (const p of pages) { p.cy = cy; cy += p.cHeight; }
  const contentHeight = cy;

  // Paper (page, pageY) -> content-space y.
  const toContent = (pageNum, pageY) => {
    const p = pages[pageNum - 1];
    if (!p) return pageY;
    const clamped = Math.max(p.cTop, Math.min(p.cBottom, pageY));
    return p.cy + (clamped - p.cTop);
  };

  const remap = (h) => ({ ...h, paperAbsY: h.absY, absY: toContent(h.page, h.pageY) });
  const sections = index.sections.map(remap);
  const setup = index.setup.map(remap);

  // Panel extents recomputed against the content-space stops.
  const panelsC = index.panels.map(remap).sort((a, b) => a.absY - b.absY);
  const stops = [...panelsC.map(p => p.absY), ...sections.map(s => s.absY)].sort((a, b) => a - b);
  const MAX_EXTENT = index.pitch * 1.6;

  const panels = panelsC.map((p, i) => {
    const next = stops.find(y => y > p.absY + 1);
    const extent = (next == null ? contentHeight : next) - p.absY;
    return {
      ...p,
      paperHeight: p.height,
      height: Math.max(index.pitch * 0.5, Math.min(extent, MAX_EXTENT, contentHeight - p.absY)),
      extent,
      order: i,
    };
  });

  return { ...index, pages, contentHeight, stripHeight: contentHeight, sections, setup, panels };
}

/* Match panels across documents. Name is the primary key, because that is what
   makes two reports comparable at all. Position is the fallback for a panel that
   was renamed or added, so a mismatch degrades to "line them up by order"
   instead of dropping the panel. */
export function matchPanels(indexes) {
  if (!indexes.length) return [];
  const rows = [];
  const seen = new Set();

  for (const p of indexes[0].panels) {
    const row = { id: p.id, name: p.name, section: p.section, cells: [p] };
    for (let d = 1; d < indexes.length; d++) {
      row.cells.push(indexes[d].panels.find(q => q.id === p.id) || null);
    }
    rows.push(row);
    seen.add(p.id);
  }

  // Panels present in later documents but not the first still deserve a row.
  for (let d = 1; d < indexes.length; d++) {
    for (const p of indexes[d].panels) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const cells = indexes.map((ix, i) => (i === d ? p : ix.panels.find(q => q.id === p.id) || null));
      rows.push({ id: p.id, name: p.name, section: p.section, cells });
    }
  }

  rows.sort((a, b) => {
    const av = a.cells.find(Boolean), bv = b.cells.find(Boolean);
    return (av ? av.order : 0) - (bv ? bv.order : 0);
  });
  return rows;
}
