"use strict";
/* paul.js — "Ask Paul", the chat.
 *
 * THE NAME is a team joke: Paul from Easy Composites as the composites oracle
 * everybody wishes they could ask. The default avatar is an original cartoon
 * shop tech (safety glasses, gloves, a mixing cup). A lead can swap in a
 * picture from the ⋯ menu (Simon, 2026-10-09: the app is internal and the
 * joke is understood); that photo is uploaded to the team's Storage, never
 * committed, because the repo and the hosted files are public. Either way
 * the model never claims to be him or to speak for Easy Composites.
 *
 * WHAT ANSWERS. askPaul (functions/index.js), which can only read the app's
 * own records and the standards and datasheets the app ships, cites every
 * fact, and labels anything from general knowledge. It writes nothing.
 *
 * A PANEL, NOT A MODAL (Simon, 2026-10-09: "if you click on a source, you
 * should be able to go back to that chat"). It is a third column of #app on a
 * wide screen, so a source opens in the page beside the conversation. On a
 * phone it is a full-screen sheet that steps aside when a source opens, and
 * the floating Paul button brings the same conversation back.
 *
 * CONVERSATIONS ARE KEPT (2026-10-10, Simon: "make Paul remember
 * conversations ... keep conversations in app"). Each chat lives in
 * Firestore at paulUsers/{email}/chats/{chatId}, private to its owner, and
 * askPaul appends to it, so Chats shows them on any device. The id is made
 * here, before the first question, and the open chat is watched: if a phone
 * drops the stream mid-answer, the answer still lands and shows up when the
 * snapshot does. sessionStorage only caches the open thread for a fast
 * reload. paulRemember keeps a few notes about the person, which they see
 * and can delete under "What Paul remembers".
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
const PAUL_WEB = "From the web, not from the app:";
const PAUL_STORE = "feb-paul:thread";
const PAUL_INTRO = "Hi, I'm Paul, from Easy Composites!";
const STEVE_INTRO = "Hi, I'm Steve, from Fibreglast!";
/* Two helpers share this panel (Simon, 2026-10-10). Paul answers. Steve,
   "from Fibreglast", is the team's other joke: always a bit wrong, always
   selling something from the Fibreglast store. The server keeps him away from
   numbers people act on; here every Steve answer carries a fixed "Steve is
   always wrong" label (not model text) and an Ask Paul instead button. Each
   helper keeps his own open chat; the switch swaps them. */
const PAUL_WHO = {
  paul: { name: "Paul", sub: "composites help", intro: PAUL_INTRO },
  steve: { name: "Steve", sub: "always wrong, always selling", intro: STEVE_INTRO },
};
const paulWho = () => (PAUL.agent === "steve" ? "steve" : "paul");
let PAUL = paulLoad();

function paulLoad() {
  const fresh = { turns: [], draft: "", busy: false, open: false, aboutOff: false, chatId: "", view: "chat", chats: null, notes: null, agent: "paul", stash: {} };
  const clean = (turns) => (Array.isArray(turns) ? turns : []).filter(t => t && t.q && (t.answer || t.error));
  try {
    const saved = JSON.parse(sessionStorage.getItem(PAUL_STORE) || "null");
    if (saved && Array.isArray(saved.turns)) fresh.turns = clean(saved.turns);
    if (saved && typeof saved.chatId === "string") fresh.chatId = saved.chatId;
    if (saved && saved.agent === "steve") fresh.agent = "steve";
    if (saved && saved.stash && typeof saved.stash === "object") {
      for (const k of ["paul", "steve"]) if (saved.stash[k]) fresh.stash[k] = { chatId: String(saved.stash[k].chatId || ""), turns: clean(saved.stash[k].turns) };
    }
  } catch (e) { /* private window, blocked storage: start empty */ }
  return fresh;
}
function paulSave() {
  try {
    const turns = PAUL.turns.filter(t => !t.pending).slice(-20)
      .map(t => ({ q: t.q, qid: t.qid, about: t.about, answer: t.answer, sources: t.sources, error: t.error, steps: t.steps, thinking: t.thinking }));
    const stash = {};
    for (const [k, v] of Object.entries(PAUL.stash || {})) stash[k] = { chatId: v.chatId || "", turns: (v.turns || []).filter(t => !t.pending).slice(-20).map(t => ({ q: t.q, qid: t.qid, answer: t.answer, sources: t.sources, error: t.error })) };
    sessionStorage.setItem(PAUL_STORE, JSON.stringify({ chatId: PAUL.chatId || "", turns, agent: paulWho(), stash }));
  } catch (e) { /* not worth a toast */ }
}
function paulNewId() {
  const a = new Uint8Array(10);
  (window.crypto || globalThis.crypto).getRandomValues(a);
  return Array.from(a, b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/* ---------- saved chats ----------
   One listener on the open chat. Its turns are merged into PAUL.turns by
   qid, in place, so an answer that arrives by snapshot (the stream dropped,
   or the chat was continued on another device) fills the same turn the
   person is looking at. Turns still pending or errored here that the doc
   doesn't have yet stay at the end. */
let PAUL_WATCH = { id: "", off: null };
function paulWatch() {
  // Watched while the panel is open, and while an answer is still owed to a
  // turn whose stream dropped (the phone sheet may be stepped aside).
  const owed = PAUL.turns.some(t => t.pending || t.recovering);
  const id = (PAUL.open || owed) && PAUL.chatId && window.fb && fb.paulChatWatch && fb.user ? PAUL.chatId : "";
  if (id === PAUL_WATCH.id) return;
  if (PAUL_WATCH.off) PAUL_WATCH.off();
  PAUL_WATCH = { id, off: id ? fb.paulChatWatch(id, d => paulMerge(id, d)) : null };
}
function paulMerge(id, d) {
  if (id !== PAUL.chatId || !d || !Array.isArray(d.turns)) return;
  const byQid = new Map(PAUL.turns.filter(t => t.qid).map(t => [t.qid, t]));
  const inDoc = new Set();
  const merged = d.turns.map(x => {
    if (x.qid) inDoc.add(x.qid);
    const t = x.qid && byQid.get(x.qid);
    if (!t) return { q: x.q, qid: x.qid, about: x.about, answer: x.answer, sources: x.sources || [] };
    if (!t.answer || t.error) Object.assign(t, { answer: x.answer, sources: x.sources || [], error: "", recovering: false });
    return t;
  });
  const rest = PAUL.turns.filter(t => !(t.qid && inDoc.has(t.qid)));
  const before = JSON.stringify(PAUL.turns.map(t => [t.qid, !!t.answer, !!t.error]));
  PAUL.turns = [...merged, ...rest];
  if (JSON.stringify(PAUL.turns.map(t => [t.qid, !!t.answer, !!t.error])) !== before) { paulSave(); paulMount(); paulRender(); }
}
/* Swap helpers. The one you leave keeps his open chat in PAUL.stash. */
function paulSwitch(agent) {
  agent = agent === "steve" ? "steve" : "paul";
  if (PAUL.busy || agent === paulWho()) { if (PAUL.view === "list") paulShowChats(false); return; }
  PAUL.stash = { ...(PAUL.stash || {}), [paulWho()]: { chatId: PAUL.chatId, turns: PAUL.turns } };
  const next = PAUL.stash[agent] || { chatId: "", turns: [] };
  PAUL.agent = agent; PAUL.chatId = next.chatId; PAUL.turns = next.turns;
  PAUL.view = "chat";
  paulSave(); paulMount(); paulRender(); paulFocus();
}
/* "Ask Paul instead" under Steve, "What would Steve say?" under Paul: the
   same question, to the other one, in his open chat. */
function paulAskOther(i) {
  const t = PAUL.turns[i];
  if (!t || PAUL.busy) return;
  paulSwitch(paulWho() === "steve" ? "paul" : "steve");
  PAUL.draft = t.q;
  return paulAsk();
}
let PAUL_LIST_OFF = null, PAUL_MEM_OFF = null;
function paulShowChats(on) {
  PAUL.view = on ? "list" : "chat";
  if (on && window.fb && fb.paulChatsWatch && !PAUL_LIST_OFF) {
    PAUL_LIST_OFF = fb.paulChatsWatch(list => { PAUL.chats = list; if (PAUL.view === "list") paulRender(); });
    PAUL_MEM_OFF = fb.paulMemoryWatch(notes => { PAUL.notes = notes; if (PAUL.view === "list") paulRender(); });
  }
  if (!on) {
    if (PAUL_LIST_OFF) PAUL_LIST_OFF(); if (PAUL_MEM_OFF) PAUL_MEM_OFF();
    PAUL_LIST_OFF = PAUL_MEM_OFF = null;
  }
  paulRender();
  if (!on) paulFocus();
}
function paulOpenChat(id) {
  const c = (PAUL.chats || []).find(x => x.id === id);
  if (PAUL.busy) return;
  if (c && (c.agent || "paul") !== paulWho()) paulSwitch(c.agent || "paul");
  PAUL.chatId = id;
  PAUL.turns = c && Array.isArray(c.turns) ? c.turns.map(x => ({ q: x.q, qid: x.qid, about: x.about, answer: x.answer, sources: x.sources || [] })) : [];
  paulSave();
  paulShowChats(false);
  if (!PAUL.open) openPaul();
  paulWatch();
}
async function paulDeleteChat(id) {
  const ok = await confirmAsync("Delete this chat? It can't be brought back.", { ok: "Delete", danger: true });
  if (!ok) return;
  try { await fb.paulChatDelete(id); } catch (e) { toast("Couldn't delete that chat. " + (e.message || ""), "error"); return; }
  if (id === PAUL.chatId) { PAUL.chatId = ""; PAUL.turns = []; paulSave(); }
  PAUL.chats = (PAUL.chats || []).filter(x => x.id !== id);
  paulRender();
}
async function paulForget(noteId) {
  const all = PAUL.notes || [];
  if (noteId === "*" && !(await confirmAsync("Forget everything Paul remembers about you?", { ok: "Forget all", danger: true }))) return;
  const next = noteId === "*" ? [] : all.filter(n => n.id !== noteId);
  try { await fb.paulNotesSet(next); PAUL.notes = next; paulRender(); }
  catch (e) { toast("Couldn't change Paul's notes. " + (e.message || ""), "error"); }
}
function paulWhen(v) {
  const d = v && typeof v.toDate === "function" ? v.toDate() : v ? new Date(v) : null;
  if (!d || isNaN(d)) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  return days < 1 ? "today" : days < 2 ? "yesterday" : days < 7 ? days + " days ago" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function paulChatsHtml() {
  const notes = PAUL.notes, chats = PAUL.chats;
  return `<div class="paul-list">
    <div class="paul-list-h">What Paul remembers</div>
    ${notes == null ? `<div class="muted tny">Loading…</div>`
      : notes.length ? `<ul class="paul-notes">${notes.map(n => `<li><span>${esc(n.text)}</span>
          <button class="icon-btn" aria-label="Forget this" title="Forget this" onclick="paulForget(${esc(JSON.stringify(n.id))})">${icon("x", 14)}</button></li>`).join("")}</ul>
          <button class="link tny" onclick="paulForget('*')">Forget everything</button>`
      : `<div class="muted tny">Nothing yet. Paul picks up things worth keeping as you chat (what you're working on, how you like answers), and you can delete any of them here.</div>`}
    <div class="paul-list-h">Your chats</div>
    ${chats == null ? `<div class="muted tny">Loading…</div>`
      : chats.length ? chats.map(c => `<div class="paul-chatrow ${c.id === PAUL.chatId ? "on" : ""}">
          <button class="paul-chatopen" onclick="paulOpenChat(${esc(JSON.stringify(c.id))})">
            <span class="paul-chat-t">${paulAvatar(18, c.agent === "steve" ? "steve" : "paul")} ${esc(c.title || "Chat")}</span>
            <span class="muted tny">${esc(paulWhen(c.updatedAt))} · ${(c.turns || []).length} ${(c.turns || []).length === 1 ? "question" : "questions"}</span>
          </button>
          <button class="icon-btn" aria-label="Delete chat" title="Delete chat" onclick="paulDeleteChat(${esc(JSON.stringify(c.id))})">${icon("trash", 15)}</button>
        </div>`).join("")
      : `<div class="muted tny">No saved chats yet.</div>`}
    <p class="muted tny paul-private">Your chats and these notes are private to you. Leads can't read them.</p>
  </div>`;
}

/* ---------- the avatar ----------
   One SVG, two sizes. The parts that move are classed so CSS can animate
   them only while .paul-busy is on an ancestor: the head bobs, the stir stick
   goes round the cup, the glasses catch the light. Reduced motion stills all
   of it through the app's global rule. */
function paulAvatar(size, who) {
  if ((who || paulWho()) === "steve") return steveAvatar(size);
  /* A lead can give Paul a picture (⋯ → Paul's picture). It lives in the
     team's Storage, never in this public repo, and only its address is in
     config/ai, which guests cannot read. The same motion applies: the frame
     bobs and a gold ring pulses while he works. */
  const photo = window.AI_CFG && window.AI_CFG.paulPhoto;
  if (photo) return `<span class="paul-av paul-photo" style="width:${size}px;height:${size}px"><img src="${esc(photo)}" alt="" draggable="false"></span>`;
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

/* Steve: an original cartoon, not anyone real. Trucker cap, big grin, a
   Fibreglast-orange shopping bag. Same parts move as Paul's while he works. */
function steveAvatar(size) {
  return `<svg class="paul-av steve-av" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" class="steve-av-bg"/>
    <g class="paul-av-head">
      <path d="M14 58c2-11 9-16 18-16s16 5 18 16" class="steve-av-shirt"/>
      <circle cx="32" cy="29" r="14" class="paul-av-skin"/>
      <path d="M17 24c1-9 8-13 15-13s14 4 15 13z" class="steve-av-cap"/>
      <path d="M30 24h22c0 2-2 3-4 3H30z" class="steve-av-cap"/>
      <rect x="27" y="14" width="10" height="5" rx="1.5" class="steve-av-patch"/>
      <g class="paul-av-eyes"><circle cx="26" cy="29.5" r="1.5"/><circle cx="38" cy="29.5" r="1.5"/></g>
      <path d="M24.5 35c3.5 4.6 11.5 4.6 15 0z" class="steve-av-grin"/>
    </g>
    <g>
      <path d="M43 46h13l-1.5 13h-10z" class="steve-av-bag"/>
      <path d="M46 46c0-4 7-4 7 0" class="steve-av-handle"/>
    </g>
  </svg>`;
}

/* Lead-only, from ⋯. The photo is downscaled on the way up (fb.upload), the
   old one is deleted once the new pointer is saved, and Remove goes back to
   the cartoon. */
function setPaulPhoto() {
  if (!isLead()) { toast("Only a lead can change Paul's picture.", "error"); return; }
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    const old = window.AI_CFG && window.AI_CFG.paulPhotoPath;
    try {
      const up = await fb.upload(`paul/${Date.now()}-${(f.name || "paul.jpg").replace(/[^\w.-]+/g, "-")}`, f, { maxDim: 360 });
      await fb.setConfig("ai", { paulPhoto: up.url, paulPhotoPath: up.path });
      if (old && old !== up.path) fb.deleteFile(old);
      toast("Paul has his picture.");
    } catch (e) { toast("Couldn't set Paul's picture: " + ((e && e.message) || e), "error"); }
  };
  inp.click();
}
async function clearPaulPhoto() {
  if (!isLead()) return;
  const old = window.AI_CFG && window.AI_CFG.paulPhotoPath;
  try {
    await fb.setConfig("ai", { paulPhoto: "", paulPhotoPath: "" });
    if (old) fb.deleteFile(old);
    toast("Paul is back to the cartoon.");
  } catch (e) { toast("Couldn't change Paul's picture: " + ((e && e.message) || e), "error"); }
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
  const open = !!PAUL.open && aiOn();
  document.body.classList.toggle("paul-open", open);
  if (typeof window.__paulBindVV === "function") window.__paulBindVV();
  paulViewport();
  paulWatch();
  /* On a laptop under 1400px, Paul's column plus the full sidebar squeezed a
     record page to a sliver (seen on the molds split). While he is open the
     sidebar takes its icon rail; the person's own rail setting (railOn, in
     localStorage) is never touched, and closing Paul puts back whatever it
     was. */
  const de = document.documentElement;
  if (de && de.classList && typeof railOn === "function") {
    const w = typeof window !== "undefined" ? window.innerWidth || 0 : 0;
    const squeeze = open && w > 900 && w < 1400;
    const want = railOn() || squeeze;
    if (de.classList.contains("rail") !== want) {
      de.classList.toggle("rail", want);
      if (typeof window.dispatchEvent === "function" && typeof Event === "function") window.dispatchEvent(new Event("resize"));
    }
  }
  const fab = document.getElementById("paul-fab");
  if (fab) {
    const show = !PAUL.open && aiOn() && PAUL.turns.length > 0;
    fab.hidden = !show;
    fab.classList.toggle("paul-busy", !!PAUL.busy);
    if (show) fab.innerHTML = paulAvatar(44) + (PAUL.busy ? `<span class="paul-fab-dot"></span>` : "");
  }
}
let PAUL_PHOTO_SHOWN = null;
function paulSync() {
  if (PAUL.open && !aiOn()) PAUL.open = false;
  paulMount();
  // A lead just set or removed the picture: redraw the open panel to match.
  const photo = (window.AI_CFG && window.AI_CFG.paulPhoto) || "";
  if (PAUL.open && photo !== PAUL_PHOTO_SHOWN && !PAUL.busy) { PAUL_PHOTO_SHOWN = photo; paulRender(); }
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

/* The text box is built once and then left alone. Rebuilding it (as every
   render used to) took focus away mid-conversation, and on a phone losing
   focus drops the keyboard: every question sent closed it (Simon,
   2026-10-09, "broken on mobile with the keyboard"). So a render redraws the
   header, the thread and the "looking at" chip, and only flips the send
   button; the box keeps its focus, its caret and whatever is typed in it. */
function paulHeadHtml() {
  return `<div class="paul-head ${PAUL.busy ? "paul-busy" : ""}">
      ${paulAvatar(36)}
      <div class="paul-title"><b>${PAUL_WHO[paulWho()].name}</b><span class="muted tny">${PAUL.busy ? "working it out…" : PAUL_WHO[paulWho()].sub}</span></div>
      <div class="paul-switch" role="group" aria-label="Who to ask">
        ${["paul", "steve"].map(a => `<button class="${a === paulWho() ? "on" : ""}" aria-pressed="${a === paulWho()}" onclick="paulSwitch('${a}')" ${PAUL.busy ? "disabled" : ""}>${PAUL_WHO[a].name}</button>`).join("")}
      </div>
      ${PAUL.view === "list" ? `<button class="sm" onclick="paulShowChats(false)">Back</button>`
        : `<button class="sm" onclick="paulShowChats(true)" title="Your saved chats and what Paul remembers">Chats</button>`}
      ${PAUL.turns.length || PAUL.view === "list" ? `<button class="sm paul-new" onclick="paulClear()" title="Start a new conversation" aria-label="New chat">${icon("plus", 15)}<span class="paul-btxt">New chat</span></button>` : ""}
      <button class="icon-btn" aria-label="Close Paul" onclick="closePaul()">${icon("x", 18)}</button>
    </div>`;
}
function paulRender() {
  const el = document.getElementById && document.getElementById("paul");
  if (!el) return;
  PAUL_PHOTO_SHOWN = (window.AI_CFG && window.AI_CFG.paulPhoto) || "";
  paulWatch();
  const thread = PAUL.view === "list" ? paulChatsHtml() : PAUL.turns.length ? PAUL.turns.map((t, i) => paulTurnHtml(t, i)).join("") : paulEmptyHtml();
  const box = document.getElementById("paul-q");
  const built = !!(box && el.contains && el.contains(box) && document.getElementById("paul-headwrap"));
  if (built) {
    document.getElementById("paul-headwrap").innerHTML = paulHeadHtml();
    document.getElementById("paul-thread").innerHTML = thread;
    const about = document.getElementById("paul-about");
    if (about) about.innerHTML = paulAboutHtml();
    const send = el.querySelector && el.querySelector(".paul-send");
    if (send) send.disabled = !!PAUL.busy;
    if (box.placeholder !== undefined) box.placeholder = `Ask ${PAUL_WHO[paulWho()].name}…`;
    const compose = el.querySelector && el.querySelector(".paul-compose");
    if (compose) compose.hidden = PAUL.view === "list";
  } else {
    el.innerHTML = `
    <div id="paul-headwrap">${paulHeadHtml()}</div>
    <div class="paul-thread" id="paul-thread">${thread}</div>
    <div class="paul-compose" ${PAUL.view === "list" ? "hidden" : ""}>
      <div id="paul-about" class="paul-about">${paulAboutHtml()}</div>
      <div class="paul-inputrow">
        <textarea id="paul-q" rows="1" maxlength="4000" placeholder="Ask ${PAUL_WHO[paulWho()].name}…" aria-label="Ask ${PAUL_WHO[paulWho()].name}" enterkeyhint="send"
          oninput="PAUL.draft=this.value;paulGrow(this)" onkeydown="paulKey(event)" onfocus="paulViewport()">${esc(PAUL.draft)}</textarea>
        <button class="primary paul-send" aria-label="Send" onclick="paulAsk()" ${PAUL.busy ? "disabled" : ""}>${icon("chevronRight", 18)}</button>
      </div>
    </div>`;
  }
  paulScroll();
}

/* ---------- the phone keyboard ----------
   On a phone the sheet is fixed to the screen, and a keyboard does two
   different things depending on the phone. Android shrinks the page, which
   CSS handles. iOS leaves the page full height, shrinks only the VISUAL
   viewport and pans it up to show the text box, which pushed Paul's header
   off the top. So on a narrow screen the sheet is sized and placed to the
   visual viewport (--paul-top / --paul-h), it drops the home-indicator
   padding while the keyboard is up (.paul-kb), and the thread snaps back to
   its latest message. tools/test_paul_mobile.mjs simulates both phones. */
function paulViewport() {
  const el = document.getElementById && document.getElementById("paul");
  if (!el || !el.style) return;
  const narrow = typeof isNarrowViewport === "function" && isNarrowViewport();
  const vv = window.visualViewport;
  if (!PAUL.open || !narrow || !vv) {
    el.style.removeProperty && (el.style.removeProperty("--paul-top"), el.style.removeProperty("--paul-h"));
    if (document.body) document.body.classList.remove("paul-kb");
    return;
  }
  el.style.setProperty("--paul-top", Math.round(vv.offsetTop || 0) + "px");
  el.style.setProperty("--paul-h", Math.round(vv.height) + "px");
  const kb = (window.innerHeight || vv.height) - vv.height > 120 || vv.height < (window.screen && screen.height ? screen.height * 0.75 : 0);
  if (document.body) document.body.classList.toggle("paul-kb", !!kb && document.activeElement === document.getElementById("paul-q"));
  paulScroll();
}
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("resize", () => { if (PAUL.open) paulViewport(); });
  /* Bound at first use, not at load: a test (and an iOS quirk or two) can
     swap visualViewport out after the page has started. */
  let bound = null;
  const bindVV = () => {
    const vv = window.visualViewport;
    if (!vv || vv === bound || !vv.addEventListener) return;
    bound = vv;
    vv.addEventListener("resize", () => { if (PAUL.open) paulViewport(); });
    vv.addEventListener("scroll", () => { if (PAUL.open) paulViewport(); });
  };
  bindVV();
  window.__paulBindVV = bindVV;
}
function paulGrow(ta) {
  if (!ta || !ta.style) return;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight || 0, 140) + "px";
}
function paulScroll() {
  if (PAUL.view === "list") return;
  const th = document.getElementById && document.getElementById("paul-thread");
  if (th) th.scrollTop = th.scrollHeight || 0;
}

function paulEmptyHtml() {
  const steve = paulWho() === "steve";
  const tries = steve ? ["How do I stop dry spots?", "Best way to seal a mold?", "What should I buy for the diffuser?"]
    : ["Where is the diffuser mold?", "Which IN2 lots expire soonest?", "What does CS-006 say about the drop test?", "What gloves for XCR?"];
  return `<div class="paul-empty">
    ${paulAvatar(72)}
    <p><b>${esc(PAUL_WHO[paulWho()].intro)}</b></p>
    <p>${steve ? "I'm always wrong, but I've got a product for that. For anything you'll actually do at the table, ask Paul."
      : "Ask me about molds, parts, work orders, lots, the standards or the datasheets. I remember our chats, and you can find them under Chats."}</p>
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
  if (t.error) return `<div class="paul-bubble paul-err">${esc(t.error)}</div>
    <button class="sm paul-retry" onclick="paulRetry(${i})">Try again</button>`;
  const worked = (t.steps && t.steps.length) || t.thinking;
  const steve = paulWho() === "steve";
  return `${worked ? `<details class="paul-work"><summary>Show how ${PAUL_WHO[paulWho()].name} worked it out</summary>${paulWorkHtml(t, false)}</details>` : ""}
    ${steve ? `<span class="pill steve-pill">Steve is always wrong</span>` : ""}
    <div class="paul-bubble">${paulAnswerHtml(t, i)}</div>
    ${paulSourcesHtml(t, i)}
    ${steve ? `<button class="sm paul-other" onclick="paulAskOther(${i})">Ask Paul instead</button>`
      : `<button class="link tny paul-other" onclick="paulAskOther(${i})">What would Steve say?</button>`}`;
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
  /* Anything not from the app sits under its own pill: general knowledge, or
     the web (with the pages it came from in the sources list). The server's
     fixed label lines mark where each part starts. */
  const marks = [[PAUL_GENERAL, "General knowledge, not from the app"], [PAUL_WEB, "From the web, not from the app"]];
  const a = String(t.answer || "");
  const cuts = marks.map(([line, pill]) => ({ at: a.indexOf(line), line, pill })).filter(c => c.at >= 0).sort((x, y) => x.at - y.at);
  if (!cuts.length) return fmt(a);
  let html = cuts[0].at > 0 ? fmt(a.slice(0, cuts[0].at).trim()) : "";
  cuts.forEach((c, n) => {
    const end = n + 1 < cuts.length ? cuts[n + 1].at : a.length;
    html += `<div class="paul-gen"><span class="pill">${c.pill}</span><div>${fmt(a.slice(c.at + c.line.length, end).trim())}</div></div>`;
  });
  return html;
}
function paulSourceTitle(s) {
  if (s.type === "doc") return `${s.title}, ${s.section}`;
  if (s.type === "product") return `${s.title} at Fibreglast`;
  if (s.type === "chat") return `Earlier chat · ${s.title || ""}`;
  if (s.type === "web") return `${s.site || "web"} · ${s.title || s.ref}`;
  return `${paulRefLabel(s.ref)}${s.title && s.title !== paulRefLabel(s.ref) ? " · " + s.title : ""}`;
}
/* Reference refs read better without their prefix: "Nick", not PERSON:Nick. */
function paulRefLabel(ref) {
  const r = String(ref || "");
  if (r === "OVERVIEW") return "Dashboard counts";
  if (r === "SEASON") return "Season";
  if (r === "BUDGET-GOALS") return "Budget goals";
  return r.replace(/^(PERSON|RESIN|MAT|RESTOCK):/, "");
}
function paulSourcesHtml(t, i) {
  const src = t.sources || [];
  if (!src.length) return "";
  return `<div class="paul-sources">
    <div class="paul-sources-h">Sources</div>
    ${src.map((s, n) => `<button class="paul-src" onclick="paulOpenSource(${i},${n})">
      <span class="paul-src-n">${n + 1}</span>
      <span class="paul-src-t">${s.type === "web"
        ? `${icon("externalLink", 13)} <b>${esc(s.site || "web")}</b><span class="muted"> · ${esc(s.title || s.ref)}</span><span class="muted tny"> web</span>`
        : s.type === "doc"
        ? `${icon("file", 13)} ${esc(s.title)}<span class="muted"> · ${esc(s.section)}</span>`
        : s.type === "product"
        ? `${icon("externalLink", 13)} <b>${esc(s.title)}</b><span class="muted">${s.price != null ? ` · $${esc(Number(s.price).toFixed(2))}` : ""} at Fibreglast</span>${s.checked ? `<span class="muted tny"> price checked ${esc(s.checked)}</span>` : ""}`
        : s.type === "chat"
        ? `${icon("message", 13)} ${esc(s.title || "Earlier chat")}<span class="muted tny"> earlier chat</span>`
        : `<b>${esc(paulRefLabel(s.ref))}</b>${s.title && s.title !== paulRefLabel(s.ref) ? `<span class="muted"> · ${esc(s.title)}</span>` : ""}${s.kind && !String(s.title || "").toLowerCase().includes(s.kind) ? `<span class="muted tny"> ${esc(s.kind)}</span>` : ""}`}</span>
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
  if (!PAUL.chatId) PAUL.chatId = paulNewId();
  const chatId = PAUL.chatId;
  const turn = { q, qid: paulNewId(), about, pending: true, steps: [], thinking: "" };
  PAUL.view = "chat";
  PAUL.turns.push(turn);
  PAUL.draft = ""; PAUL.busy = true;
  const box = document.getElementById && document.getElementById("paul-q");
  if (box) { box.value = ""; paulGrow(box); }
  if (!PAUL.open) PAUL.open = true;
  paulMount(); paulRender();
  const onChunk = (c) => {
    if (!c) return;
    if (c.type === "step") turn.steps.push(String(c.text || ""));
    else if (c.type === "thinking") turn.thinking += String(c.text || "");
    paulLive(turn);
  };
  try {
    const data = { question: q, history, about, save: true, chatId, qid: turn.qid, agent: paulWho() };
    const out = fb.callStream ? await fb.callStream("askPaul", data, onChunk, PAUL_CALL_OPTS) : await fb.call("askPaul", data, PAUL_CALL_OPTS);
    turn.answer = String((out && out.answer) || "");
    turn.sources = (out && out.sources) || [];
  } catch (e) {
    if (turn.answer) return;   // the saved chat already delivered it
    turn.error = paulErrorText(e).replace(/^Paul /, PAUL_WHO[paulWho()].name + " ");
    /* The question reached the server; its answer may still land in the
       saved chat. The watch on the chat fills this turn in if it does. */
    turn.recovering = /Lost the connection|too long/.test(turn.error);
    if (turn.recovering) turn.error += " If Paul finishes anyway, his answer will appear here.";
  } finally {
    turn.pending = false; PAUL.busy = false;
    paulSave(); paulMount(); paulRender(); paulFocus();
  }
}
/* The function may take up to 180s; the SDK's own default (70s) would give
   up first and call a slow answer an error. */
const PAUL_CALL_OPTS = { timeout: 190000 };
/* Every failure used to read "Paul isn't available", whatever it was, so the
   one real cause (an empty last round on long questions, 2026-10-10) looked
   like an outage. Each code now says what happened. */
function paulErrorText(e) {
  const code = String(e && e.code || "").replace(/^functions\//, "");
  if (code === "deadline-exceeded") return "That one took Paul too long. Try asking it in two parts.";
  if (code === "internal" && e.message && e.message !== "internal" && e.message !== "INTERNAL") return e.message;
  if (["cancelled", "unknown", "unavailable"].includes(code) && !(e && e.message && /paul|model/i.test(e.message))) {
    return "Lost the connection before Paul finished. Check your signal and try again.";
  }
  return aiErrorText(e, "Paul isn't available right now. Try again in a minute.");
}
/* An errored turn asks again: the failed turn goes, its question comes back. */
function paulRetry(i) {
  const t = PAUL.turns[i];
  if (!t || PAUL.busy) return;
  PAUL.turns.splice(i, 1);
  PAUL.draft = t.q;
  return paulAsk();
}
function paulClear() {
  PAUL = { ...PAUL, turns: [], draft: "", busy: false, chatId: "", view: "chat" };
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
  /* A web page opens in a new browser tab and the chat stays exactly where
     it is; everything else is inside the app. */
  if (s.type === "web") { if (/^https?:\/\//i.test(s.ref)) window.open(s.ref, "_blank", "noopener,noreferrer"); return; }
  if (s.type === "product") { if (/^https:\/\/www\.fibreglast\.com\/products\//.test(s.url || "")) window.open(s.url, "_blank", "noopener,noreferrer"); return; }
  if (s.type === "chat" || String(s.ref || "").startsWith("CHAT:")) {
    const id = String(s.ref).slice(5);
    if (window.fb && fb.paulChatWatch && !(PAUL.chats || []).some(c => c.id === id)) {
      // Not in the list yet: open it and let the watch fill it in.
      PAUL.chatId = id; PAUL.turns = []; paulSave(); paulShowChats(false);
    } else paulOpenChat(id);
    return;
  }
  if (typeof isNarrowViewport === "function" && isNarrowViewport()) closePaul();
  const ref = String(s.ref || "");
  if (ref.startsWith("PERSON:")) {
    const name = ref.slice(7).toLowerCase();
    const u = (DB.users || []).find(x => String(x.name || "").toLowerCase() === name);
    if (u && typeof openPerson === "function") openPerson(u.email); else setTab("people");
    return;
  }
  if ((ref.startsWith("RESIN:") || ref.startsWith("MAT:")) && s.src) {
    if (typeof openFilePreview === "function") openFilePreview(s.src, s.title || ref);
    return;
  }
  const page = ref.startsWith("RESTOCK:") || ref.startsWith("MAT:") ? "inventory"
    : ref === "SEASON" ? "season" : ref === "BUDGET-GOALS" ? "budget" : ref === "OVERVIEW" ? "dashboard" : ref.startsWith("RESIN:") ? "workorders" : "";
  if (page) { setTab(page); return; }
  if (s.type === "doc") {
    if (typeof openFilePreview === "function") openFilePreview(s.src, `${s.title}, ${s.section}`);
    else window.open(s.src, "_blank", "noopener");
    return;
  }
  const tab = tabForId(s.ref);
  if (tab) openRecord(tab, s.ref);
  else toast(`Couldn't open ${s.ref} from here. Search for it with ⌘K.`, "info");
}
