/* dashboard.js — the landing page: the numbers, how they move by design
   point, the saved views, and every report in the library as a card.

   Written in the composites app's dashboard idiom (dashboard.js there): one
   card surface, Saira module headers with the gold slash, numerals on stat
   tiles, and an empty state that is a sentence carrying a fact rather than a
   hole.

   Drawn once, then patched (2026-09-24). Every snapshot used to replace the
   whole page, every card image included; now each section is replaced only
   when its markup changed, and the report grid is keyed by record id, so a
   new upload adds one card and a note edits one. Cards can be ticked to open
   several in the Viewer at once. */

import { S } from "./core.js";
import { esc, fmtMB, shortDate, fmtN } from "./util.js";
import { headline } from "./extract.js";
import { lineChart } from "./chart.js";
import { icon } from "./shell.js";

/* Reports in design-point order, unnumbered ones last in upload order. */
function ordered(recs) {
  const withDp = recs.filter(r => Number.isInteger(r.dp)).sort((a, b) => a.dp - b.dp || String(a.createdAt).localeCompare(String(b.createdAt)));
  const without = recs.filter(r => !Number.isInteger(r.dp)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return withDp.concat(without);
}
const dpLabel = r => Number.isInteger(r.dp) ? "DP " + r.dp : r.name.length > 8 ? r.name.slice(0, 7) + "…" : r.name;

const visible = () => (S.library || []).filter(r => !S.hidden.has(r.id));

export function renderDashboard() {
  const recs = visible();
  const views = S.views || [];
  const seq = ordered(recs);
  const withNums = seq.filter(r => headline(r.results).downforce != null);
  const latest = withNums[withNums.length - 1] || null;
  const prev = withNums[withNums.length - 2] || null;
  const h = headline(latest && latest.results);
  const hp = headline(prev && prev.results);
  const delta = (a, b, digits) => a == null || b == null ? "" : `<span class="tny">${a - b >= 0 ? "+" : "−"}${fmtN(Math.abs(a - b), digits)} vs ${esc(dpLabel(prev))}</span>`;

  const stats = `<div class="stat-row dstats">
    <div class="stat-tile"><span class="bignum">${h.downforce == null ? "—" : fmtN(h.downforce) + " N"}</span>
      <div class="stat-label">Downforce${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${h.cl != null ? `<div class="tny">Cl ${fmtN(-h.cl, 3)}</div>` : ""}${delta(h.downforce, hp.downforce, 0)}</div>
    <div class="stat-tile"><span class="bignum">${h.drag == null ? "—" : fmtN(h.drag) + " N"}</span>
      <div class="stat-label">Drag${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${h.cd != null ? `<div class="tny">Cd ${fmtN(h.cd, 3)}</div>` : ""}${delta(h.drag, hp.drag, 0)}</div>
    <div class="stat-tile"><span class="bignum">${h.ld == null ? "—" : fmtN(h.ld, 2)}</span>
      <div class="stat-label">L/D${latest ? " · " + esc(dpLabel(latest)) : ""}</div>${delta(h.ld, hp.ld, 2)}</div>
    <div class="stat-tile"><span class="bignum">${recs.length}</span>
      <div class="stat-label">Reports in the library</div><div class="tny">${withNums.length === recs.length ? "all with numbers" : `${recs.length - withNums.length} without numbers yet`}</div></div>
  </div>`;

  const series = key => seq.map(r => { const hh = headline(r.results); return { x: r.dp, label: dpLabel(r), y: hh[key], title: r.name }; });
  const chartCard = (title, key, unit, digits, color) => `<div class="card trend-card">
    <div class="bmod-hd"><span>${esc(title)}</span><span class="gh-n tny">by design point</span></div>
    ${seq.length ? lineChart({ points: series(key), unit, digits, color, id: key }) : `<div class="dlane-empty">No reports yet. The first upload puts a point here.</div>`}
  </div>`;

  const viewsCard = `<div class="card">
    <div class="bmod-hd"><span>Saved views</span><span class="gh-n tny">${views.length || ""}</span></div>
    ${views.length ? `<div class="vlist">${views.map(v => {
      const names = (v.reports || []).map(id => { const r = recs.find(r => r.id === id); return r ? dpLabel(r) : id; });
      return `<div class="vrow">
        <button class="vopen" onclick="cfd.openView('${esc(v.id)}')" title="Open this view">${icon("bookmark", 15)} <b>${esc(v.name)}</b></button>
        <span class="tny">${esc(names.join(" vs "))} · ${shortDate(v.createdAt)}</span>
        <span class="vacts"><button class="icon-btn" title="Rename" aria-label="Rename view" onclick="cfd.renameView('${esc(v.id)}', this)">${icon("edit", 15)}</button>
        <button class="icon-btn" title="Delete" aria-label="Delete view" onclick="cfd.deleteView('${esc(v.id)}', this)">${icon("trash", 15)}</button></span>
      </div>`; }).join("")}</div>`
    : `<div class="dlane-empty">No saved views yet. Open two reports in the Viewer, set up the comparison, and press <b>Save view</b>; it lands here for everyone.</div>`}
  </div>`;

  const cards = recs.length ? `<div class="rgrid" data-lbgroup>${[...seq].reverse().map(reportCard).join("")}</div>`
    : `<div class="card"><div class="dlane-empty">The library is empty. Press <b>Open PDFs</b> and drop a Fluent report; it is uploaded for everyone, its numbers read off the report, and a card appears here.</div></div>`;

  return { stats, trends: `${chartCard("Downforce", "downforce", " N", 0, "var(--accent)")}${chartCard("Drag", "drag", " N", 0, "var(--gold)")}`, viewsCard, count: recs.length, cards };
}

/* Before the first snapshot: the page's shape, not "the library is empty". */
function skeleton() {
  const tile = `<div class="stat-tile"><span class="skel-line big"></span><span class="skel-line short"></span></div>`;
  const card = `<div class="card rcard skel"><div class="rthumb skel-block"></div><span class="skel-line"></span><span class="skel-line short"></span></div>`;
  return `<div class="dboard-cfd" aria-busy="true">
    <div class="stat-row dstats">${tile.repeat(4)}</div>
    <div class="trend-row"><div class="card trend-card skel-block tall"></div><div class="card trend-card skel-block tall"></div></div>
    <div class="bmod-hd rgrid-hd"><span>Reports</span></div>
    <div class="rgrid">${card.repeat(3)}</div>
  </div>`;
}

/* Draw the Dashboard into `main`, reusing what is already there. */
export function paintDashboard(main) {
  if (!S.library && !S.libError) { if (!main.querySelector("[aria-busy]")) main.innerHTML = skeleton(); return; }
  const parts = renderDashboard();
  let root = main.querySelector(".dboard-cfd:not([aria-busy])");
  if (!root) {
    main.innerHTML = `<div class="dboard-cfd">
      <div data-sec="err"></div><div data-sec="stats"></div>
      <div class="trend-row" data-sec="trends"></div>
      <div data-sec="views"></div>
      <div class="bmod-hd rgrid-hd"><span>Reports</span><span class="gh-n tny" data-sec="count"></span>
        <input class="search rfilter" id="rfilter" placeholder="filter reports…  (/)" autocomplete="off" aria-label="Filter reports"></div>
      <div data-sec="cards"></div>
      <div class="selbar" id="selbar" hidden role="region" aria-label="Compare selected reports"></div>
    </div>`;
    root = main.firstElementChild;
    root.querySelector("#rfilter").value = S.dashQuery || "";
    root.querySelector("#rfilter").oninput = (e) => { S.dashQuery = e.target.value; filterCards(root); };
    root.querySelector("#rfilter").onkeydown = (e) => {
      if (e.key === "Escape") { e.target.value = ""; S.dashQuery = ""; filterCards(root); e.target.blur(); }
      if (e.key === "Enter") { const c = root.querySelector(".rcard:not([hidden]) .rcard-acts button"); if (c) c.click(); }
    };
    root.addEventListener("change", (e) => {
      const box = e.target.closest?.(".rsel input");
      if (!box) return;
      const id = box.closest(".rcard").dataset.id;
      if (box.checked) S.sel.add(id); else S.sel.delete(id);
      box.closest(".rcard").classList.toggle("sel", box.checked);
      paintSelbar(root);
    });
    root.addEventListener("pointerenter", (e) => { const c = e.target.closest?.(".rcard"); if (c) window.cfd.prefetch(c.dataset.id); }, true);
  }
  const put = (sec, html) => {
    const n = root.querySelector(`[data-sec="${sec}"]`);
    if (n._html !== html) { n._html = html; n.innerHTML = html; }
  };
  put("err", S.libError ? `<div class="card"><div class="dlane-empty">The library could not be reached: <b>${esc(S.libError)}</b>.</div></div>` : "");
  put("stats", parts.stats);
  put("trends", parts.trends);
  put("views", parts.viewsCard);
  put("count", parts.count ? `${parts.count}, newest design point first` : "");

  // The grid, keyed: only a card whose markup changed is replaced.
  const holder = root.querySelector('[data-sec="cards"]');
  const recs = visible();
  if (!recs.length) { put("cards", parts.cards); }
  else {
    let grid = holder.querySelector(".rgrid");
    if (!grid) { holder._html = null; holder.innerHTML = `<div class="rgrid" data-lbgroup></div>`; grid = holder.firstChild; }
    const have = new Map([...grid.children].map(n => [n.dataset.id, n]));
    const order = [...ordered(recs)].reverse();
    const keep = new Set(order.map(r => r.id));
    for (const [id, n] of have) if (!keep.has(id)) n.remove();
    let prev = null;
    for (const r of order) {
      const html = reportCard(r);
      let n = have.get(r.id);
      if (!n || n._html !== html) {
        const t = document.createElement("template");
        t.innerHTML = html.trim();
        const fresh = t.content.firstElementChild;
        fresh._html = html;
        if (n) n.replaceWith(fresh); n = fresh;
      }
      const want = prev ? prev.nextElementSibling : grid.firstElementChild;
      if (want !== n) grid.insertBefore(n, want);
      prev = n;
    }
  }
  for (const id of [...S.sel]) if (!recs.some(r => r.id === id)) S.sel.delete(id);
  filterCards(root);
  paintSelbar(root);
}

function filterCards(root) {
  const q = (S.dashQuery || "").trim().toLowerCase();
  for (const c of root.querySelectorAll(".rgrid .rcard")) {
    const r = (S.library || []).find(x => x.id === c.dataset.id);
    c.hidden = !!q && !(r && (r.name + " " + (r.note || "") + " " + (Number.isInteger(r.dp) ? "dp " + r.dp : "")).toLowerCase().includes(q));
  }
}

/* The bar that appears once cards are ticked: open them all at once. */
function paintSelbar(root) {
  const bar = root.querySelector("#selbar");
  const n = S.sel.size;
  bar.hidden = n === 0;
  if (!n) return;
  const names = [...S.sel].map(id => (S.library || []).find(r => r.id === id)).filter(Boolean).map(dpLabel);
  bar.innerHTML = `<span><b>${n}</b> selected <span class="tny">${esc(names.join(" · "))}</span></span>
    <button class="primary" id="selgo">${n > 1 ? `Compare ${n} in Viewer` : "Open in Viewer"}</button>
    <button class="ghost" id="selclear">Clear</button>`;
  bar.querySelector("#selgo").onclick = () => { const ids = [...S.sel]; S.sel.clear(); window.cfd.openInViewer(...ids); };
  bar.querySelector("#selclear").onclick = () => {
    S.sel.clear();
    root.querySelectorAll(".rsel input").forEach(b => { b.checked = false; b.closest(".rcard").classList.remove("sel"); });
    paintSelbar(root);
  };
}

function reportCard(r) {
  const h = headline(r.results);
  const open = S.docs.some(d => d.reportId === r.id);
  const thumb = r.thumb && r.thumb.url
    ? `<img class="phimg rthumb" loading="lazy" src="${esc(r.thumb.url)}" data-lb-src="${esc(r.thumb.url)}" data-lb-name="${esc(r.name + " · " + r.thumb.panel)}" alt="${esc(r.thumb.panel)} from ${esc(r.name)}">
       <div class="tny rthumb-cap">${esc(r.thumb.panel)}</div>`
    : `<div class="rthumb rthumb-none tny">No picture yet. Opening the report once renders one.</div>`;
  const m = r.meta || {};
  const sel = S.sel.has(r.id);
  return `<div class="card rcard${open ? " open" : ""}${sel ? " sel" : ""}" data-id="${esc(r.id)}">
    <label class="rsel" title="Select to compare"><input type="checkbox"${sel ? " checked" : ""} aria-label="Select ${esc(r.name)} to compare"></label>
    ${thumb}
    <div class="rcard-hd"><b class="rname" title="${esc(r.name)}">${esc(r.name)}</b>${Number.isInteger(r.dp) ? `<span class="pill">DP ${r.dp}</span>` : ""}</div>
    <div class="tny">${shortDate(r.createdAt)}${m.analyst ? " · " + esc(m.analyst) : ""}${m.cells ? " · " + fmtN(m.cells / 1e6, 1) + " M cells" : ""} · ${fmtMB(r.size)}</div>
    ${r.note ? `<div class="rnote">${esc(r.note)}</div>` : `<button class="link rnote none" onclick="cfd.editNote('${esc(r.id)}', this)">Add a note about this run</button>`}
    <div class="numrow">
      <span><b>${h.downforce == null ? "—" : fmtN(h.downforce) + " N"}</b><span class="tny">downforce</span></span>
      <span><b>${h.drag == null ? "—" : fmtN(h.drag) + " N"}</b><span class="tny">drag</span></span>
      <span><b>${h.ld == null ? "—" : fmtN(h.ld, 2)}</b><span class="tny">L/D</span></span>
      <span><b>${h.cl == null ? "—" : fmtN(-h.cl, 2)}</b><span class="tny">Cl</span></span>
      <span><b>${h.cd == null ? "—" : fmtN(h.cd, 3)}</b><span class="tny">Cd</span></span>
    </div>
    <div class="rcard-acts">
      <button class="${open ? "" : "primary"}" onclick="cfd.openInViewer('${esc(r.id)}')">${open ? "Show in Viewer" : "Open in Viewer"}</button>
      <button class="icon-btn" title="Rename, note or delete" aria-label="More" onclick="cfd.reportMenu('${esc(r.id)}', this)">${icon("more", 18)}</button>
    </div>
  </div>`;
}
