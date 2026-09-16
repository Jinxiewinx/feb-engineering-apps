"use strict";
/* documents.js — the Documents tab.
   The team shelf (pinned links), member uploads, and whatever
   tools/gen_docs_manifest.py bundles into docs/manifest.json. PDFs open in an
   in-app viewer, markdown renders in-app, printables open as HTML.

   What is advertised here is decided by UNLISTED in
   tools/gen_docs_manifest.py, not by anything in this file. Everything is
   copied into docs/ and served either way: resins.js deep-links six datasheet
   PDFs by path, and an issued standard has to stay retrievable under CS-000,
   so unlisting removes the manifest entry and never the bytes.

   As of 2026-08-26 that is the CS standards and Shop Printables. The
   datasheets were unlisted on 2026-08-18 and are listed again.

   Nothing below hardcodes what may exist. A document carrying any category,
   including one of the unlisted ones, still renders under it; that is what
   keeps old uploads and a future re-listing working without a code change. */

let DOCS_MANIFEST = null;   // null=unloaded, []=loaded
let DOCS_LOADING = false;
let openDoc = null;         // { title, kind, src, docx }
const MD_CACHE = {};

function loadManifest() {
  if (DOCS_LOADING) return;
  DOCS_LOADING = true;
  fetch("docs/manifest.json")
    .then(r => r.json())
    .then(m => { DOCS_MANIFEST = Array.isArray(m) ? m : []; render(); })
    /* Stay unloaded rather than caching an empty shelf: the dashboard's
       launchpad now triggers this load too, possibly offline at the field
       station, and a failed first fetch must not lock the Documents tab (and
       the shelf counts) empty for the whole session. Callers only invoke
       this while DOCS_MANIFEST is null, so the retry is one fetch per
       render, driven by the user. */
    .catch(() => { DOCS_LOADING = false; });
}

function openDocument(src) {
  openDoc = (DOCS_MANIFEST || []).find(d => d.src === src) || null;
  if (openDoc && openDoc.kind === "md" && !MD_CACHE[openDoc.src]) {
    fetch(openDoc.src).then(r => r.text()).then(t => {
      /* Image paths in the markdown are relative to the markdown file
         (figures/x.png), but the rendered HTML resolves against the page.
         Prefix them with the doc's own directory before rendering. */
      const base = openDoc.src.replace(/[^/]*$/, "");
      t = t.replace(/(!\[[^\]]*\]\()(?!(?:https?:)?\/)/g, `$1${base}`);
      MD_CACHE[openDoc.src] = mdToHtml(t); render();
    }).catch(() => { MD_CACHE[openDoc.src] = "<p class='muted'>Could not load.</p>"; render(); });
  }
  render();
}
function closeDocument() { openDoc = null; render(); }
function fmtKB(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }

// Bundled manifest docs + live uploaded docs (DB.documents), unified shape.
function allDocs() {
  const bundled = (DOCS_MANIFEST || []).map(d => ({ ...d, uploaded: false }));
  const up = (DB.documents || []).map(d => ({
    category: d.category || "Uploads", title: d.title || d.name, kind: d.kind,
    src: d.url, size: d.size, uploaded: true, id: d.id, by: d.by,
    // Carried through so the shelf can be rendered separately above and
    // filtered out of the category listing, and so the viewer knows this is a
    // link to somewhere else rather than a file we host.
    pinned: !!d.pinned, embedUrl: d.embedUrl || "", note: d.note || "",
  }));
  return bundled.concat(up);
}
function renderDocuments() {
  if (DOCS_MANIFEST === null) { loadManifest(); return `<div class="card">Loading documents…</div>`; }
  if (openDoc) return renderDocViewer();

  const q = (view.q || "").toLowerCase();
  // The shelf renders itself above, so it is filtered out of the category
  // listing below rather than appearing in both places.
  const all = allDocs().filter(d => !d.pinned);
  const shelf = (DB.documents || []).filter(d => d.pinned)
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }));
  // Derived, never hardcoded, so a new kind (a bundled doc's "html"/"md",
  // say) shows up in the filter automatically instead of going stale —
  // same technique the category list below already uses.
  const kinds = [...new Set(all.map(d => d.kind || "file"))].sort();
  const docs = all
    .filter(d => !view.fSub || (d.kind || "file") === view.fSub)
    .filter(d => !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
  /* The leading names are an ORDER, not a whitelist: they put the familiar
     sections at the top when they have contents. Every category actually
     present is appended, so an upload filed under a category nobody listed
     here still gets its own section rather than vanishing. Empty sections
     render nothing (see the early return below), so listing a name costs
     nothing when there is none of it. */
  const cats = ["Guides", "Uploads", ...new Set(all.map(d => d.category))]
    .filter((c, i, a) => a.indexOf(c) === i);
  return `
  <div class="toolbar no-print">
    ${pickOn("documents") ? "" : `<button class="primary" onclick="uploadDocument()">+ Upload document</button>
    <button onclick="openDocLinkModal({ coll: 'documents' })">+ Pin a link</button>`}
    ${isLead() ? pickBar("documents", { all: docs.filter(d => d.uploaded).map(d => d.id), onDelete: "deletePickedDocuments()", hint: "Select several uploads to delete them; the bundled guides cannot be deleted" }) : ""}
  </div>
  <!-- The shelf answers the question the Slack history keeps asking: the master
       tracker, the meeting deck and the training doc were each re-pasted months
       apart because a link in a channel is findable for about a day. Pinned to
       the top of the tab because being one click from anywhere is the entire
       point of it. -->
  <div class="card">
    <h3>Team shelf${shelf.length ? ` <span class="muted" style="text-transform:none">— the links everyone asks for</span>` : ""}</h3>
    ${shelf.length
      ? docLinkList(shelf, { onRemove: "removeShelfDoc" })
      : `<div class="muted">Nothing pinned yet. <b>+ Pin a link</b> for the documents people keep asking for — the master tracker, the weekly meeting deck, the ShopSabre training.</div>`}
  </div>
  <div class="filters no-print">
    <select onchange="view.fSub=this.value;render()">
      <option value="">All types</option>
      ${kinds.map(k => `<option value="${esc(k)}" ${view.fSub === k ? "selected" : ""}>${esc(k.toUpperCase())}</option>`).join("")}
    </select>
    <input id="searchbox" placeholder="search documents…" value="${esc(view.q || "")}" oninput="searchInput(this)">
    <span class="muted" style="align-self:center">${docs.length} of ${all.length} documents</span>
  </div>
  ${all.length === 0 ? `<div class="card">No documents yet — <b>Upload document</b>, or <b>+ Pin a link</b> for the ones people keep asking for.</div>` : ""}
  ${cats.map(cat => {
    /* localeCompare, not the manifest's order, which is ASCII: uppercase sorts
       before lowercase, so "WestSystems" landed above "airtac2imp" and three
       datasheets sat below a Z. Case- and accent-insensitive so a reader can
       find a name where they expect it. */
    const list = docs.filter(d => d.category === cat)
      .sort((a, b) => (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base", numeric: true }));
    if (!list.length) return "";
    return `<div class="card">
      <h3>${esc(cat)} <span class="muted">(${list.length})</span></h3>
      <div class="doclist">
        ${/* Two things this row learned from the phone audit.

              The title span carries .dl-t, the same truncating cell
              docLinkRow() uses. Without it the span has no min-width:0, so a
              document nobody renamed — title is the raw Drive URL — made the
              row 630px wide and the whole tab scrolled sideways.

              The size shows only when there IS one. A linked Google Doc is not
              a file this app hosts, so it has no bytes, and "0 KB" beside a
              document that opens perfectly reads as a broken upload. It also
              cost the title about 45px of a 393px row, which is roughly what
              the truncated datasheet names were short of. */""}
        ${list.map(d => `<div class="docrow ${d.uploaded && pickIs("documents", d.id) ? "picked" : ""}" onclick="${d.uploaded ? pickClick("documents", d.id, `openDocFromRow('${esc(d.src)}','up')`) : `openDocFromRow('${esc(d.src)}','')`}">
          ${d.uploaded ? pickBox("documents", d.id) : ""}<span class="di">${icon(d.kind === "html" ? "print" : (d.kind || "").startsWith("image") ? "image" : "file", 18)}</span>
          <span class="dl-t">${esc(d.title)}${d.uploaded ? ` <span class="muted tny">· ${esc(d.by || "")}</span>` : ""}</span>
          <span class="dsz">${(d.kind || "file").toUpperCase()}${d.size ? ` · ${fmtKB(d.size)}` : ""}${d.uploaded && isLead() ? ` <button class="danger ib" title="Delete" onclick="event.stopPropagation();delDocument('${d.id}')">${icon("trash", 14)}</button>` : ""}</span>
        </div>`).join("")}
      </div>
    </div>`;
  }).join("")}`;
}

function uploadDocument() {
  // What an uploader may file something under. Deliberately no longer offers
  // Datasheets or Standards: those are bundled from the repo, not uploaded,
  // and both are unlisted as of 2026-08-18.
  const cats = ["Guides", "Uploads"];
  openModal(`
    <h2>Upload document</h2>
    <div class="field"><label>Title</label><input id="ud-title" placeholder="Document name"></div>
    <div class="field"><label>Category</label><select id="ud-cat">${cats.map(c => `<option ${c === "Uploads" ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>File</label><input id="ud-file" type="file" accept="application/pdf,image/*,.doc,.docx,.txt,.csv"></div>
    <div class="foot"><button onclick="closeModal()">Cancel</button><button class="primary" onclick="submitDocument()">Upload</button></div>
  `);
}
async function submitDocument() {
  const title = document.getElementById("ud-title").value.trim();
  const cat = document.getElementById("ud-cat").value;
  const f = document.getElementById("ud-file").files[0];
  if (!f) { toast("Pick a file first.", "error"); return; }
  const id = await allocId("documents");
  if (!id) return;
  try {
    const rec = await fb.upload(`documents/${id}-${f.name}`, f);
    const kind = rec.type === "application/pdf" ? "pdf" : (rec.type || "").startsWith("image/") ? "image" : "file";
    const d = { id, title: title || f.name, category: cat, kind, url: rec.url, path: rec.path, size: rec.size, by: myEmail(), ts: new Date().toISOString() };
    DB.documents.push(d); save("documents", d);
    closeModal(); toast("Document uploaded.");
  } catch (e) { toast("Upload failed: " + e.message, "error"); }
}
function delDocument(id) { documentsBulkDelete([id]); }
/* Uploads only: the bundled guides and datasheets ship with the app and have
   no record to delete, which is why the picker never offers them a box. */
function documentsBulkDelete(ids) {
  if (!isLead()) { toast("Only a lead can delete documents.", "error"); return; }
  const set = new Set(ids || []);
  const docs = (DB.documents || []).filter(d => set.has(d.id));
  if (!docs.length) { toast("Nothing selected.", "info"); return; }
  const what = docs.length === 1 ? (docs[0].title || docs[0].name || docs[0].id) : plural(docs.length, "document");
  bulkDeleteRecords({
    message: `Delete ${what} for everyone? ${docs.length === 1 ? "The file goes" : "The files go"} with ${docs.length === 1 ? "it" : "them"}.`,
    items: docs.map(d => ({ coll: "documents", id: d.id })),
    files: docs.map(d => d.path),
    done: `${what} deleted`,
    after: () => { const gone = new Set(docs.map(d => d.id)); DB.documents = (DB.documents || []).filter(d => !gone.has(d.id)); },
  });
}
function deletePickedDocuments() { documentsBulkDelete(pickedIds("documents")); }
// Uploaded docs carry a full URL as src; bundled ones a relative path.
function openDocFromRow(src, up) {
  if (up) {
    const d = (DB.documents || []).find(x => x.url === src);
    openDoc = d ? { title: d.title, kind: d.kind, src: d.url } : null;
    render();
  } else openDocument(src);
}

function renderDocViewer() {
  const d = openDoc;
  const dl = d.docx ? ` · <a href="${esc(d.docx)}" download>download .docx</a>` : "";
  const kindNote = d.pinned ? ` · ${esc(gdocKind(d.kind).label)}` : "";
  let body;
  /* A pinned Google link is not a file we host: `src` points at Google. Show
     the same embed the inline preview uses, and say what a blank frame means,
     because a cross-origin iframe gives us no way to detect one. */
  if (d.pinned) {
    body = d.embedUrl
      ? `<iframe class="docview" src="${esc(d.embedUrl)}" title="${esc(d.title)}"></iframe>
         <p class="muted tny">Blank? You are probably signed into a different Google account, or you do not have access.</p>`
      : `<div class="card">This one opens in Google. <a href="${esc(d.src)}" target="_blank" rel="noopener">Open it</a>.</div>`;
  } else if (d.kind === "pdf" || d.kind === "html") {
    body = `<iframe class="docview" src="${esc(d.src)}" title="${esc(d.title)}"></iframe>`;
  } else if (d.kind === "image") {
    // data-lb-src, not .prose: this is a full-page preview rather than a photo
    // in a thread, but clicking it should still zoom and offer a download
    // rather than being the one image in the app that does nothing.
    // role/tabindex as well as the click target: a mouse-only zoom is the thing
    // this app's own rule about touch and keyboard affordances forbids.
    body = `<div class="card" style="text-align:center"><img src="${esc(d.src)}" alt="${esc(d.title)}"
      data-lb-src="${esc(d.src)}" data-lb-name="${esc(d.title)}"
      role="button" tabindex="0" aria-label="Open ${esc(d.title)} full screen"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox(this)}"
      style="max-width:100%;border-radius:6px;cursor:zoom-in"></div>`;
  } else if (d.kind === "md") {
    body = `<div class="prose card">${MD_CACHE[d.src] || "Loading…"}</div>`;
  } else {
    body = `<div class="card">This file type doesn't preview in-browser. <a href="${esc(d.src)}" target="_blank" rel="noopener" download>Download it</a>.</div>`;
  }
  return `
  <div class="toolbar no-print">
    <button class="ib" onclick="closeDocument()">${icon("chevronLeft",16)} All documents</button>
    <a href="${esc(d.src)}" target="_blank" rel="noopener"><button>Open in new tab</button></a>
    <span class="muted" style="align-self:center">${esc(d.title)}${kindNote}${dl}</span>
  </div>
  ${body}`;
}

/* ---------- minimal, safe markdown → HTML (for our CS docs) ---------- */
function mdInline(s) {
  s = esc(s)
    /* Images before links, or the link rule eats the [alt](src) half and
       leaves a stray "!". Relative paths only get through if they are plain
       file paths (no scheme, no leading slash): the CS figures are
       docs/standards/figures/*.png after the base-path rewrite below. */
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, u) =>
      /^(https?:\/\/|[\w][\w./ -]*$)/.test(u.trim())
        ? `<figure class="mdfig"><img src="${u.trim()}" alt="${alt}">${alt ? `<figcaption>${alt}</figcaption>` : ""}</figure>`
        : alt)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) =>
      /^(https?:|\/|#|mailto:)/i.test(u.trim()) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>` : esc(t));
  return s;
}
function mdToHtml(md) {
  const lines = String(md).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0, inList = null;
  function closeList() { if (inList) { out.push(`</${inList}>`); inList = null; } }
  while (i < lines.length) {
    let line = lines[i];
    // table: header row + separator row of ---
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const cell = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const head = cell(line);
      out.push('<table><thead><tr>' + head.map(h => `<th>${mdInline(h)}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        out.push("<tr>" + cell(lines[i]).map(c => `<td>${mdInline(c)}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${mdInline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*>\s?/.test(line)) { closeList(); out.push(`<blockquote>${mdInline(line.replace(/^\s*>\s?/, ""))}</blockquote>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { closeList(); out.push("<hr>"); i++; continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (inList && inList !== want) closeList();
      if (!inList) { inList = want; out.push(`<${want}>`); }
      out.push(`<li>${mdInline((ul || ol)[1])}</li>`); i++; continue;
    }
    if (/^\s*$/.test(line)) { closeList(); i++; continue; }
    closeList(); out.push(`<p>${mdInline(line)}</p>`); i++;
  }
  closeList();
  return out.join("\n");
}

/* Unpinning. Distinct from delDocument() because there is no Storage object
   behind a link — the document lives in Google and is not ours to delete. The
   wording says so, since "delete" on a row that represents someone's Drive file
   is a genuinely alarming thing to click. */
function removeShelfDoc(id) {
  const d = (DB.documents || []).find(x => x.id === id);
  if (!d) return;
  confirmModal(`Unpin ${d.title ? `"${d.title}"` : "this link"} from the team shelf for everyone? The document in Google is untouched.`, () => {
    del("documents", id);
    DB.documents = DB.documents.filter(x => x.id !== id);
    render();
  });
}
