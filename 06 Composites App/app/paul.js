"use strict";
/* paul.js — "Ask Paul", the chat.
 *
 * THE NAME is a team joke: Paul from Easy Composites as the composites oracle
 * everybody wishes they could ask. The avatar is an original cartoon shop tech
 * (safety glasses, gloves, a mixing cup), deliberately NOT a likeness of the
 * real Paul and carrying no Easy Composites branding. The name is the joke.
 *
 * WHAT ANSWERS. askPaul (functions/index.js), which can only read the app's
 * own records and the standards and datasheets the app ships, cites every
 * fact, and labels anything from general knowledge. It writes nothing.
 *
 * A PANEL, NOT A MODAL (Simon, 2026-10-09: "if you click on a source, you
 * should be able to go back to that chat"). It is a third column of #app on a
 * wide screen, so a source opens in the page beside the conversation. On a
 * phone it is a full-screen sheet that steps aside when a source opens, and
 * the floating Paul button brings the same conversation back. The thread is
 * kept in sessionStorage, so it survives a reload of the tab and nothing else.
 *
 * WHAT YOU SEE WHILE IT WORKS is true: one line per tool call as the function
 * makes it ("Opening WO-SN6-003"), and the model's own thinking summary as it
 * streams. Both fold away under "Show how Paul worked it out" once the answer
 * lands. The answer and its sources are separate blocks; inline numbers in
 * the answer point into the sources list.
 *
 * Everything the model writes is escaped before anything else, so it can
 * never become markup. Only **bold** and the server's [[n]] markers are
 * turned into tags, after escaping.
 */

const PAUL_GENERAL = "General composites knowledge, not from the app:";
const PAUL_STORE = "feb-paul:thread";
let PAUL = paulLoad();

function paulLoad() {
  const fresh = { turns: [], draft: "", busy: false, open: false, aboutOff: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(PAUL_STORE) || "null");
    if (saved && Array.isArray(saved.turns)) fresh.turns = saved.turns.filter(t => t && t.q && (t.answer || t.error));
  } catch (e) { /* private window, blocked storage: start empty */ }
  return fresh;
}
function paulSave() {
  try {
    const turns = PAUL.turns.filter(t => !t.pending).slice(-20)
      .map(t => ({ q: t.q, about: t.about, answer: t.answer, sources: t.sources, error: t.error, steps: t.steps, thinking: t.thinking }));
    sessionStorage.setItem(PAUL_STORE, JSON.stringify({ turns }));
  } catch (e) { /* not worth a toast */ }
}

/* ---------- the avatar ----------
   One SVG, two sizes. The parts that move are classed so CSS can animate
   them only while .paul-busy is on an ancestor: the head bobs, the stir stick
   goes round the cup, the glasses catch the light. Reduced motion stills all
   of it through the app's global rule. */
function paulAvatar(size) {
  return `<svg class="paul-av" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" class="paul-av-bg"/>
    <g class="paul-av-head">
      <path d="M14 58c2-11 9-16 18-16s16 5 18 16" class="paul-av-shirt"/>
      <circle cx="32" cy="28" r="14" class="paul-av-skin"/>
      <path d="M18 25c0-10 7-15 14-15s14 5 14 15c-3-4-8-6-14-6s-11 2-14 6z" class="paul-av-hair"/>
      <g class="paul-av-specs">
        <rect x="19.5" y="25" width="10.5" height="7" rx="3"/>
        <rect x="34" y="25" width="10.5" height="7" rx="3"/>
        <path d="M30 28h4"/>
      </g>
      <path class="paul-av-glint" d="M21 26.5l3 0"/>
      <g class="paul-av-eyes"><circle cx="25" cy="28.6" r="1.4"/><circle cx="39.2" cy="28.6" r="1.4"/></g>
      <path d="M27 36c2.6 2.2 7.4 2.2 10 0" class="paul-av-smile"/>
    </g>
    <g>
      <path d="M44 47h11l-1.6 12h-7.8z" class="paul-av-cupbody"/>
      <path d="M45 50h9" class="paul-av-resin"/>
      <path d="M49.5 38l1.2 13" class="paul-av-stick"/>
    </g>
  </svg>`;
}

/* ---------- open, close, the floating button ---------- */
function openPaul(opts) {
  if (!aiOn()) { toast("AI features are switched off by a lead.", "info"); return; }
  PAUL.open = true;
  if (opts && typeof opts.ask === "string") PAUL.draft = opts.ask;
  paulMount();
  paulRender();
  paulFocus();
}
function closePaul() {
  PAUL.open = false;
  paulMount();
}
function togglePaul() { PAUL.open ? closePaul() : openPaul(); }
/* The panel and the button are two fixed elements in index.html; this only
   shows, hides and fills them. Called from render() via paulSync too, so the
   button tracks the AI switch and the "looking at" chip tracks navigation. */
function paulMount() {
  if (typeof document === "undefined" || !document.body) return;
  document.body.classList.toggle("paul-open", !!PAUL.open && aiOn());
  const fab = document.getElementById("paul-fab");
  if (fab) {
    const show = !PAUL.open && aiOn() && PAUL.turns.length > 0;
    fab.hidden = !show;
    fab.classList.toggle("paul-busy", !!PAUL.busy);
    if (show) fab.innerHTML = paulAvatar(44) + (PAUL.busy ? `<span class="paul-fab-dot"></span>` : "");
  }
}
function paulSync() {
  if (PAUL.open && !aiOn()) PAUL.open = false;
  paulMount();
  const about = document.getElementById && document.getElementById("paul-about");
  if (about) about.innerHTML = paulAboutHtml();
}
function paulFocus() {
  const el = document.getElementById && document.getElementById("paul-q");
  if (el && el.focus) el.focus();
}

/* ---------- what's on screen ---------- */
function paulAbout() {
  if (PAUL.aboutOff) return "";
  return view && view.mode === "detail" && view.id && /^[A-Z]{1,6}-[A-Z0-9-]+$/i.test(view.id) ? String(view.id).toUpperCase() : "";
}
function paulAboutHtml() {
  const id = paulAbout();
  if (id) return `<span class="chip paul-aboutchip" title="Paul will start from this record">Looking at ${esc(id)}
    <button class="link" aria-label="Don't use this record" onclick="PAUL.aboutOff=true;paulSync()">×</button></span>`;
  return PAUL.aboutOff && view && view.mode === "detail" && view.id
    ? `<button class="link tny" onclick="PAUL.aboutOff=false;paulSync()">Ask about ${esc(view.id)}</button>` : "";
}

function paulRender() {
  const el = document.getElementById && document.getElementById("paul");
  if (!el) return;
  el.innerHTML = `
    <div class="paul-head ${PAUL.busy ? "paul-busy" : ""}">
      ${paulAvatar(36)}
      <div class="paul-title"><b>Paul</b><span class="muted tny">${PAUL.busy ? "working it out…" : "composites help"}</span></div>
      ${PAUL.turns.length ? `<button class="sm" onclick="paulClear()" title="Start a new conversation">New chat</button>` : ""}
      <button class="icon-btn" aria-label="Close Paul" onclick="closePaul()">${icon("x", 18)}</button>
    </div>
    <div class="paul-thread" id="paul-thread">
      ${PAUL.turns.length ? PAUL.turns.map((t, i) => paulTurnHtml(t, i)).join("") : paulEmptyHtml()}
    </div>
    <div class="paul-compose">
      <div id="paul-about" class="paul-about">${paulAboutHtml()}</div>
      <div class="paul-inputrow">
        <textarea id="paul-q" rows="1" maxlength="1000" placeholder="Ask Paul…" aria-label="Ask Paul"
          oninput="PAUL.draft=this.value;paulGrow(this)" onkeydown="paulKey(event)" ${PAUL.busy ? "disabled" : ""}>${esc(PAUL.draft)}</textarea>
        <button class="primary paul-send" aria-label="Send" onclick="paulAsk()" ${PAUL.busy ? "disabled" : ""}>${icon("chevronRight", 18)}</button>
      </div>
    </div>`;
  paulScroll();
}
function paulGrow(ta) {
  if (!ta || !ta.style) return;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight || 0, 140) + "px";
}
function paulScroll() {
  const th = document.getElementById && document.getElementById("paul-thread");
  if (th) th.scrollTop = th.scrollHeight || 0;
}

function paulEmptyHtml() {
  const tries = ["Where is the diffuser mold?", "Which IN2 lots expire soonest?", "What does CS-006 say about the drop test?", "What gloves for XCR?"];
  return `<div class="paul-empty">
    ${paulAvatar(72)}
    <p>Ask me about molds, parts, work orders, lots, the standards or the datasheets.</p>
    <div class="paul-tries">${tries.map(q => `<button class="chip" onclick="PAUL.draft=${esc(JSON.stringify(q))};paulAsk()">${esc(q)}</button>`).join("")}</div>
  </div>`;
}

/* One exchange: the question on the right, Paul on the left. */
function paulTurnHtml(t, i) {
  return `<div class="paul-msg paul-me"><div class="paul-bubble">${esc(t.q)}${t.about ? `<div class="paul-meta">about ${esc(t.about)}</div>` : ""}</div></div>
    <div class="paul-msg paul-him ${t.pending ? "paul-busy" : ""}">
      ${paulAvatar(28)}
      <div class="paul-body" ${t.pending ? 'id="paul-live"' : ""}>${paulReplyHtml(t, i)}</div>
    </div>`;
}
function paulReplyHtml(t, i) {
  if (t.pending) return paulWorkHtml(t, true);
  if (t.error) return `<div class="paul-bubble paul-err">${esc(t.error)}</div>`;
  const worked = (t.steps && t.steps.length) || t.thinking;
  return `${worked ? `<details class="paul-work"><summary>Show how Paul worked it out</summary>${paulWorkHtml(t, false)}</details>` : ""}
    <div class="paul-bubble">${paulAnswerHtml(t, i)}</div>
    ${paulSourcesHtml(t, i)}`;
}
/* The live view while the answer is coming, and the same thing folded away
   after. Steps are what the function actually did; thinking is the model's
   own summary. Neither is decoration. */
function paulWorkHtml(t, live) {
  const steps = t.steps || [];
  const think = String(t.thinking || "").trim();
  return `<div class="paul-steps">
      ${steps.map((s, k) => `<div class="paul-step ${live && k === steps.length - 1 ? "now" : "done"}">${live && k === steps.length - 1 ? "◌" : "✓"} ${esc(s)}</div>`).join("")}
      ${live && !steps.length ? `<div class="paul-step now">◌ Thinking</div>` : ""}
    </div>
    ${think ? `<div class="paul-think">${esc(live && think.length > 600 ? "…" + think.slice(-600) : think)}</div>` : ""}`;
}

function paulAnswerHtml(t, i) {
  const cite = (n) => {
    const s = t.sources && t.sources[n];
    return s ? `<button class="paul-cite" onclick="paulOpenSource(${i},${n})" title="${esc(paulSourceTitle(s))}">${n + 1}</button>` : "";
  };
  const fmt = (txt) => esc(txt)
    .replace(/\*\*([^*\n]{1,200})\*\*/g, "<b>$1</b>")
    .replace(/\s?\[\[(\d+)\]\]/g, (m, n) => cite(Number(n)))
    .replace(/\n/g, "<br>");
  const a = String(t.answer || "");
  const k = a.indexOf(PAUL_GENERAL);
  if (k < 0) return fmt(a);
  const before = a.slice(0, k).trim(), after = a.slice(k + PAUL_GENERAL.length).trim();
  return `${before ? fmt(before) : ""}<div class="paul-gen"><span class="pill">General knowledge, not from the app</span><div>${fmt(after)}</div></div>`;
}
function paulSourceTitle(s) {
  return s.type === "doc" ? `${s.title}, ${s.section}` : `${s.ref}${s.title ? " · " + s.title : ""}`;
}
function paulSourcesHtml(t, i) {
  const src = t.sources || [];
  if (!src.length) return "";
  return `<div class="paul-sources">
    <div class="paul-sources-h">Sources</div>
    ${src.map((s, n) => `<button class="paul-src" onclick="paulOpenSource(${i},${n})">
      <span class="paul-src-n">${n + 1}</span>
      <span class="paul-src-t">${s.type === "doc"
        ? `${icon("file", 13)} ${esc(s.title)}<span class="muted"> · ${esc(s.section)}</span>`
        : `<b>${esc(s.ref)}</b>${s.title ? `<span class="muted"> · ${esc(s.title)}</span>` : ""}${s.kind && !String(s.title || "").toLowerCase().includes(s.kind) ? `<span class="muted tny"> ${esc(s.kind)}</span>` : ""}`}</span>
    </button>`).join("")}
  </div>`;
}

/* ---------- asking ---------- */
function paulKey(e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); paulAsk(); }
}
function paulLive(turn) {
  const el = document.getElementById && document.getElementById("paul-live");
  if (el) { el.innerHTML = paulWorkHtml(turn, true); paulScroll(); }
}

async function paulAsk() {
  const q = String(PAUL.draft || "").trim();
  if (!q || PAUL.busy) return;
  const history = PAUL.turns.filter(t => t.answer).slice(-6)
    .map(t => ({ q: t.q, a: String(t.answer).replace(/\s?\[\[\d+\]\]/g, "").trim() }));
  const about = paulAbout();
  const turn = { q, about, pending: true, steps: [], thinking: "" };
  PAUL.turns.push(turn);
  PAUL.draft = ""; PAUL.busy = true;
  if (!PAUL.open) PAUL.open = true;
  paulMount(); paulRender();
  const onChunk = (c) => {
    if (!c) return;
    if (c.type === "step") turn.steps.push(String(c.text || ""));
    else if (c.type === "thinking") turn.thinking += String(c.text || "");
    paulLive(turn);
  };
  try {
    const data = { question: q, history, about };
    const out = fb.callStream ? await fb.callStream("askPaul", data, onChunk) : await fb.call("askPaul", data);
    turn.answer = String((out && out.answer) || "");
    turn.sources = (out && out.sources) || [];
  } catch (e) {
    turn.error = aiErrorText(e, "Paul isn't available right now. Try again in a minute.");
  } finally {
    turn.pending = false; PAUL.busy = false;
    paulSave(); paulMount(); paulRender(); paulFocus();
  }
}
function paulClear() {
  PAUL = { ...PAUL, turns: [], draft: "", busy: false };
  paulSave(); paulMount(); paulRender(); paulFocus();
}
/* From ⌘K: the search box's text becomes the question. */
function paulAskFromSearch(q) {
  closeModal();
  openPaul({ ask: q });
  paulAsk();
}

/* A record opens where search would open it; a document opens in the PDF
   viewer. On a phone the sheet steps aside so you can see it, and the
   floating button (same conversation) brings it back. On a wide screen it
   stays where it is, beside the page. */
function paulOpenSource(ti, si) {
  const t = PAUL.turns[ti], s = t && t.sources && t.sources[si];
  if (!s) return;
  if (typeof isNarrowViewport === "function" && isNarrowViewport()) closePaul();
  if (s.type === "doc") {
    if (typeof openFilePreview === "function") openFilePreview(s.src, `${s.title}, ${s.section}`);
    else window.open(s.src, "_blank", "noopener");
    return;
  }
  const tab = tabForId(s.ref);
  if (tab) openRecord(tab, s.ref);
  else toast(`Couldn't open ${s.ref} from here. Search for it with ⌘K.`, "info");
}
