/* menu.js — the small popovers that replace the browser's prompt() and
   confirm(): a menu of actions, a one-line text field, and a yes/no. Each is
   anchored to the button that opened it, closes on Escape or a click
   outside, and gives focus back to that button. One at a time.

   The old ⋯ was a prompt() asking you to TYPE "rename", "note" or "delete".
   Native dialogs also freeze the page, which is why the note asked after an
   upload held up every file behind it. */

import { el, esc } from "./util.js";

let open = null;   // { node, anchor, done }

function close(value) {
  if (!open) return;
  const { node, anchor, done } = open;
  open = null;
  node.classList.add("out");
  setTimeout(() => node.remove(), 120);
  removeEventListener("pointerdown", outside, true);
  removeEventListener("keydown", onKey, true);
  if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
  done(value);
}
function outside(e) { if (open && !open.node.contains(e.target) && !(open.anchor && open.anchor.contains(e.target))) close(null); }
function onKey(e) {
  if (!open) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); return; }
  if (open.node.classList.contains("popmenu") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    e.preventDefault();
    const items = [...open.node.querySelectorAll("button:not([disabled])")];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
}

/* Put `node` next to `anchor`, below it if there is room, else above; kept
   on screen. No anchor (a keyboard shortcut, a test): centred near the top. */
function place(node, anchor) {
  document.body.appendChild(node);
  const w = node.offsetWidth, h = node.offsetHeight, vw = innerWidth, vh = innerHeight, m = 8;
  let x, y;
  if (anchor && anchor.isConnected) {
    const r = anchor.getBoundingClientRect();
    x = Math.min(Math.max(m, r.right - w), vw - w - m);
    y = r.bottom + 6 + h > vh - m ? Math.max(m, r.top - 6 - h) : r.bottom + 6;
  } else { x = (vw - w) / 2; y = Math.min(120, vh / 4); }
  node.style.left = Math.round(x) + "px";
  node.style.top = Math.round(y) + "px";
}

function show(node, anchor) {
  close(null);
  return new Promise(done => {
    open = { node, anchor, done };
    place(node, anchor);
    addEventListener("pointerdown", outside, true);
    addEventListener("keydown", onKey, true);
  });
}

/* items: [{ label, hint?, danger?, run }] or "-" for a rule. Resolves once an
   item has been picked (its run() is called) or the menu is dismissed. */
export async function menu(anchor, items, title, body) {
  const node = el("div", "pop popmenu");
  node.setAttribute("role", "menu");
  if (title) node.appendChild(el("div", "pop-title", esc(title)));
  if (body) node.appendChild(body);
  const runs = [];
  for (const it of items) {
    if (it === "-") { node.appendChild(el("div", "pop-rule")); continue; }
    const b = el("button", "pop-item" + (it.danger ? " danger" : ""), `<span>${esc(it.label)}</span>${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ""}`);
    b.type = "button"; b.setAttribute("role", "menuitem");
    b.onclick = () => close(runs.indexOf(it.run));
    runs.push(it.run);
    node.appendChild(b);
  }
  const p = show(node, anchor);
  node.querySelector("button")?.focus({ preventScroll: true });
  const i = await p;
  if (i != null && i >= 0) await runs[i]();
}

/* A one-line field. Resolves to the trimmed text, or null if dismissed. An
   empty string is a real answer (clearing a note). */
export function ask(anchor, { title, value = "", placeholder = "", ok = "Save", max = 500, hint } = {}) {
  const node = el("form", "pop popask");
  node.innerHTML = `<label class="pop-title">${esc(title || "")}</label>
    <input maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(value)}">
    ${hint ? `<div class="pop-hint">${esc(hint)}</div>` : ""}
    <div class="pop-acts"><button type="button" class="ghost">Cancel</button><button type="submit" class="primary">${esc(ok)}</button></div>`;
  const input = node.querySelector("input");
  node.querySelector("label").htmlFor = input.id = "pop-in";
  node.onsubmit = (e) => { e.preventDefault(); close(input.value.trim()); };
  node.querySelector("button.ghost").onclick = () => close(null);
  const p = show(node, anchor);
  input.focus({ preventScroll: true }); input.select();
  return p;
}

/* Yes or no. Resolves true only on the confirm button. */
export function confirmPop(anchor, { title, text = "", ok = "Delete", danger = true } = {}) {
  const node = el("div", "pop popask");
  node.setAttribute("role", "alertdialog");
  node.innerHTML = `<div class="pop-title">${esc(title || "")}</div>${text ? `<div class="pop-hint">${esc(text)}</div>` : ""}
    <div class="pop-acts"><button type="button" class="ghost">Cancel</button><button type="button" class="${danger ? "danger" : "primary"}">${esc(ok)}</button></div>`;
  const [no, yes] = node.querySelectorAll(".pop-acts button");
  no.onclick = () => close(false);
  yes.onclick = () => close(true);
  const p = show(node, anchor);
  yes.focus({ preventScroll: true });
  return p.then(v => v === true);
}

export function closePop() { close(null); }
export function popOpen() { return !!open; }
