/* util.js — DOM helpers shared by every module. Lives apart from core.js so
   shell.js can use them without importing core.js (which imports shell.js). */
export const $ = s => document.querySelector(s);
export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
/* A toast. Errors stay until dismissed: an error that fades before anyone
   reads it was the old behaviour. opts.action = { label, run } adds a button
   (Undo); opts.ms sets how long a non-error stays. Returns { close }. */
export function toast(msg, kind, opts = {}) {
  const k = kind === "err" ? "err" : kind === "ok" ? "ok" : "info";
  const t = el("div", "toast " + k);
  t.setAttribute("role", k === "err" ? "alert" : "status");
  t.appendChild(el("span", "toast-msg", esc(msg)));
  let timer = 0;
  const close = () => { clearTimeout(timer); if (!t.isConnected) return; t.classList.add("hide"); setTimeout(() => t.remove(), 250); };
  if (opts.action) {
    const b = el("button", "toast-act", esc(opts.action.label));
    b.type = "button";
    b.onclick = () => { close(); opts.action.run(); };
    t.appendChild(b);
  }
  const x = el("button", "toast-x", "✕");
  x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.onclick = close;
  t.appendChild(x);
  $("#toasts").appendChild(t);
  if (k !== "err" || opts.ms) timer = setTimeout(close, opts.ms || (opts.action ? 6000 : 3200));
  return { close };
}
export const fmtMB = b => (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/* "29 Mar", the composites app's short date. */
export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export const fmtN = (v, digits = 0) => v == null || !isFinite(v) ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
