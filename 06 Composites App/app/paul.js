"use strict";
/* paul.js — "Ask Paul", the question box.
 *
 * THE NAME is a team joke: Paul from Easy Composites as the composites oracle
 * everybody wishes they could ask. It is a name and nothing more. The answers
 * come from askPaul (functions/index.js), which can only read the app's own
 * records and the standards and datasheets the app ships, cites every fact,
 * and labels anything it says from general knowledge. The sheet says so in one
 * line and says it isn't Easy Composites.
 *
 * WHAT IT IS NOT. It writes nothing, and nothing here is stored: the thread
 * lives in this tab and is gone on reload. A source chip opens the record or
 * the PDF the answer came from, which is the point of having sources at all,
 * so the person can check rather than trust.
 */

let PAUL = { turns: [], draft: "", busy: false };
const PAUL_GENERAL = "General composites knowledge, not from the app:";

function openPaul() {
  if (!aiOn()) { toast("AI features are switched off by a lead.", "info"); return; }
  openModal(paulHtml(), { wide: true });
  paulFocus();
}
function paulFocus() {
  const el = typeof document !== "undefined" && document.getElementById && document.getElementById("paul-q");
  if (el && el.focus) el.focus();
}

function paulHtml() {
  return `<h2 style="display:flex;align-items:center;gap:8px">${icon("message", 20)} Ask Paul</h2>
    <p class="muted tny">Answers from this app's records, the CS standards and the material datasheets, with the
      source for each fact. Anything from general knowledge is labelled. Paul is a team in-joke, not Easy Composites.</p>
    <div class="paul-thread" id="paul-thread">${PAUL.turns.map(paulTurnHtml).join("") || paulEmptyHtml()}</div>
    <div class="paul-ask">
      <textarea id="paul-q" rows="2" maxlength="1000" placeholder="Which IN2 lots expire this month? What does CS-006 say about degassing?"
        oninput="PAUL.draft=this.value" onkeydown="paulKey(event)" ${PAUL.busy ? "disabled" : ""}>${esc(PAUL.draft)}</textarea>
      <div class="row" style="justify-content:space-between;align-items:center;gap:8px;margin-top:6px">
        <span class="muted tny">${PAUL.turns.length ? `<button class="link" onclick="paulClear()">Start over</button>` : "Enter to ask, Shift+Enter for a new line"}</span>
        <button class="primary" onclick="paulAsk()" ${PAUL.busy ? "disabled" : ""}>${PAUL.busy ? "Thinking…" : "Ask"}</button>
      </div>
    </div>`;
}
function paulEmptyHtml() {
  return `<div class="muted tny">Try: "Where is the diffuser mold?" · "What's blocking WO-SN6-003?" · "What gloves for XCR?"</div>`;
}

/* An answer is plain text with [[n]] markers pointing into its sources. The
   text is escaped first, so nothing the model writes can become markup; only
   the markers turn into chips, and only for sources the server vouched for. */
function paulAnswerHtml(t) {
  const chip = (i) => {
    const s = t.sources && t.sources[i];
    return s ? `<button class="chip paul-cite" onclick="paulOpenSource(${PAUL.turns.indexOf(t)},${i})" title="${esc(paulSourceTitle(s))}">${i + 1}</button>` : "";
  };
  const fmt = (txt) => esc(txt).replace(/\[\[(\d+)\]\]/g, (m, n) => chip(Number(n))).replace(/\n/g, "<br>");
  const k = t.answer.indexOf(PAUL_GENERAL);
  if (k < 0) return fmt(t.answer);
  const before = t.answer.slice(0, k).trim(), after = t.answer.slice(k + PAUL_GENERAL.length).trim();
  return `${before ? fmt(before) + "<br>" : ""}<div class="paul-gen"><span class="pill">General knowledge, not from the app</span><br>${fmt(after)}</div>`;
}
function paulSourceTitle(s) {
  return s.type === "doc" ? `${s.title}, ${s.section}` : `${s.ref}${s.title ? " · " + s.title : ""}`;
}
function paulTurnHtml(t) {
  const srcs = (t.sources || []).map((s, i) =>
    `<button class="chip" onclick="paulOpenSource(${PAUL.turns.indexOf(t)},${i})">${i + 1} · ${esc(paulSourceTitle(s))}</button>`).join("");
  return `<div class="paul-turn">
    <div class="paul-q">${esc(t.q)}</div>
    <div class="paul-a">${t.pending ? `<span class="muted">Paul is looking…</span>`
      : t.error ? `<span class="muted">${esc(t.error)}</span>` : paulAnswerHtml(t)}</div>
    ${srcs ? `<div class="paul-srcs">${srcs}</div>` : ""}
  </div>`;
}

function paulKey(e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); paulAsk(); }
}
function paulRepaint() {
  if (document.getElementById && document.getElementById("paul-thread")) openModal(paulHtml(), { wide: true });
}

async function paulAsk() {
  const q = String(PAUL.draft || "").trim();
  if (!q || PAUL.busy) return;
  const history = PAUL.turns.filter(t => t.answer).slice(-6)
    .map(t => ({ q: t.q, a: t.answer.replace(/\[\[\d+\]\]/g, "").trim() }));
  const turn = { q, pending: true };
  PAUL.turns.push(turn);
  PAUL.draft = ""; PAUL.busy = true;
  paulRepaint();
  try {
    const out = await fb.call("askPaul", { question: q, history });
    turn.answer = String(out && out.answer || "");
    turn.sources = (out && out.sources) || [];
  } catch (e) {
    turn.error = aiErrorText(e, "Paul isn't available right now. Try again in a minute.");
  } finally {
    turn.pending = false; PAUL.busy = false;
    paulRepaint(); paulFocus();
  }
}
function paulClear() { PAUL = { turns: [], draft: "", busy: false }; paulRepaint(); paulFocus(); }

/* A record opens where the app would open it from search; a document opens in
   the PDF viewer. The thread survives (it's module state), so reopening Ask
   Paul comes back to the same conversation. */
function paulOpenSource(ti, si) {
  const t = PAUL.turns[ti], s = t && t.sources && t.sources[si];
  if (!s) return;
  closeModal();
  if (s.type === "doc") {
    if (typeof openFilePreview === "function") openFilePreview(s.src, `${s.title}, ${s.section}`);
    else window.open(s.src, "_blank", "noopener");
    return;
  }
  const tab = tabForId(s.ref);
  if (tab) openRecord(tab, s.ref);
  else toast(`Couldn't open ${s.ref} from here. Search for it with ⌘K.`, "info");
}
