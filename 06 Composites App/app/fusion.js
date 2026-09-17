"use strict";
/* fusion.js — the Fusion add-in's side of the app.

   The FEBPlanStock add-in (10 Fusion Add-in/FEBPlanStock/) opens this app in
   a Fusion palette, exports the selected mold body as a millimetre STL and
   hands it in here. Everything after that is the ordinary mold modal and
   submitMold(): the same ids from the same counter, the same records, the
   same mesh upload. When the plan is saved, the layers go back to Fusion,
   which draws one semi-transparent box per blank.

   Inert everywhere else. Fusion injects a global `adsk` object into palette
   pages about a second after the page runs (measured in the S4 spike), so
   the bridge polls for it briefly at boot and does nothing if it never comes.
   A browser never has it, so a browser never sees any of this.

   READINESS. A mesh can arrive before the palette is signed in, or before
   the rack has synced, because the add-in sends it as soon as the page is
   alive. On a fresh machine that is exactly what happens (2026-09-07, a
   member's Windows install: the modal opened over the sign-in card and, with
   no stock loaded yet, refused every density). So the mesh is HELD here
   until canEdit() is true and the stock collection has arrived, and the
   modal opens by itself at that moment. Until then the add-in is told what
   the page is waiting on ("state"), and if it holds the shared team
   account's credentials it signs the page in ("signin"). A member never has
   to type anything in the palette.

   The contract, JSON strings both ways:
     page -> Fusion  "loaded"        { version, state }        the bridge is alive
     page -> Fusion  "state"         { state, guest, roster, stockSynced, ready, signedInAs }
     Fusion -> page  "mold"          { stl (base64 binary STL, mm), body, fusion:{…}, frame?, addinVersion? }
     page -> Fusion  "mold-held"     { bytes, waitingOn }     held until ready
     page -> Fusion  "mold-received" { bytes, name }          the modal is open with it
     page -> Fusion  "mold-failed"   { error }
     Fusion -> page  "signin"        { user, password }       shared team account
     page -> Fusion  "signin-failed" { error }
     page -> Fusion  "plan"          { planId, moldId, name, frame, layers:[{index,z0,z1,thickness,section,blanks}] }
     page -> Fusion  "cancel"        {}                       the modal was closed without a plan
     Fusion -> page  "ping"          anything                 answered with "pong"
   `fusion` is the document identity that gets stamped on the mold record:
   { urn, versionId, versionNumber, project, folder, document, body, webUrl,
     exportedAt, exportedBy }.

   FRAME. A mold is not always modelled bottom-down: a split mold is often
   drawn on its side. The add-in lets the member pick the face that is the
   bottom, lays the mesh flat on it before exporting, and sends the matrix it
   used as `frame: { matrix:[16, row-major, mm, model -> planning], bottom:
   { how:"face", normal, point, area } }`. The plan stores that frame, the
   stock STL export runs the blocks back through its inverse so they land on
   the model, and "plan" carries it back so the add-in draws the boxes in the
   model's own orientation. No frame means the model's Z was up already. */

/* Set while a Fusion-supplied mesh is in the modal; submitMold() stamps it on
   the mold and fusionPlanSaved() clears it. A global so submitMold can stay
   ignorant of where the STL came from. */
let FUSION_CTX = null;
let FUSION_READY = false;        // the adsk bridge object was found
let FUSION_PENDING = null;       // a "mold" payload waiting for the app to be ready
let FUSION_STOCK_SYNCED = false; // onFbData("stock") has fired at least once
let FUSION_SIGNIN_BUSY = false;  // a "signin" is in flight; ignore repeats
let FUSION_LAST_STATE = "";      // last "state" message sent, to send only changes
let FUSION_ADDIN_VERSION = "";   // reported by the add-in on the "mold" message
let FUSION_STALE_WARNED = false; // the out-of-date nudge is shown once per page

/* The oldest add-in build this app still works with, and where to get a newer
   one. Raise MIN_ADDIN_VERSION when a change here needs a matching change in
   FEBPlanStock.py, not on every add-in release: every bump makes somebody
   reinstall. An add-in older than 1.1.0 sends no version at all, which is the
   same signal, so a missing version counts as stale. */
const MIN_ADDIN_VERSION = "4.8.0";
const ADDIN_RELEASE_URL = "https://github.com/Jinxiewinx/feb-engineering-apps/releases/latest";

const FUSION_POLL_MS = 100, FUSION_POLL_FOR_MS = 6000;

function fusionHost() { return typeof window !== "undefined" && window.adsk && typeof window.adsk.fusionSendData === "function"; }

/* Tell the add-in something. Fire-and-forget; the add-in never needs a reply
   from the page for anything it cannot recover from. */
function fusionSend(action, data) {
  if (!fusionHost()) return false;
  try { window.adsk.fusionSendData(action, JSON.stringify(data || {})); } catch (e) { /* palette gone */ }
  return true;
}

/* What the app is, right now, for the purpose of taking a mold: signed in as
   a roster member with the rack loaded. A guest is "ready" to fb.js and can
   write nothing, so canEdit() is the test, not fb.state. */
function fusionAppState() {
  const st = window.fb ? fb.state : "loading";
  const can = typeof canEdit === "function" ? canEdit() : false;
  return {
    state: st, guest: !!(window.fb && fb.guest), roster: !!(window.fb && fb.roster),
    stockSynced: FUSION_STOCK_SYNCED, ready: can && FUSION_STOCK_SYNCED,
    signedInAs: (window.fb && fb.user && fb.user.email) || "",
  };
}

/* Called from the boot path. Polls because the bridge lands late; stops on its
   own so a browser tab pays 60 cheap checks and nothing else. */
function fusionBridgeInit() {
  if (typeof window === "undefined") return;
  window.fusionJavaScriptHandler = { handle: fusionHandle };
  const t0 = Date.now();
  const tick = () => {
    if (fusionHost()) {
      FUSION_READY = true;
      const root = document.documentElement;
      if (root && root.classList) root.classList.add("in-fusion");
      fusionSend("loaded", { version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "", ...fusionAppState() });
      FUSION_LAST_STATE = "";
      fusionStateChanged();
      return;
    }
    if (Date.now() - t0 < FUSION_POLL_FOR_MS) setTimeout(tick, FUSION_POLL_MS);
  };
  tick();
}

/* core.js calls this from onFbChange and from onFbData("stock"). It reports
   the state to the add-in when it changes, and opens a held mesh the moment
   the app can take it. Cheap and idempotent, so it can be called often. */
function fusionStateChanged(coll) {
  if (coll === "stock") FUSION_STOCK_SYNCED = true;
  if (!FUSION_READY) return;
  const s = fusionAppState();
  const key = JSON.stringify(s);
  if (key !== FUSION_LAST_STATE) { FUSION_LAST_STATE = key; fusionSend("state", s); }
  if (FUSION_PENDING && s.ready) {
    const p = FUSION_PENDING; FUSION_PENDING = null;
    try { fusionOpenMold(p); }
    catch (e) { toast(`Fusion handed over something this app could not read: ${e.message}`, "error"); fusionSend("mold-failed", { error: e.message }); }
  }
}

/* What a held mesh is waiting on, in words the add-in can show. */
function fusionWaitingOn(s) {
  if (s.state === "loading") return "the app to connect";
  if (s.state === "signedout") return "a sign-in";
  if (s.state === "pending") return "the account to join the roster";
  if (s.guest) return "a real sign-in (guests cannot create molds)";
  if (!s.stockSynced) return "the rack to load";
  return "nothing";
}

/* Python -> page. Fusion delivers the return string back to the add-in as an
   HTMLEvent with action "response", so return something non-empty: an empty
   string is how Fusion signals failure. The page also answers explicitly with
   its own message, because that "response" event proved unreliable. */
/* Nudge a member running an add-in older than this app expects. Once per page,
   and never fatal: an old add-in usually still plans a mold, it just misses
   whatever the newer one learned to send. */
function fusionCheckAddinVersion(v) {
  FUSION_ADDIN_VERSION = String(v || "");
  if (FUSION_STALE_WARNED) return false;
  if (FUSION_ADDIN_VERSION && !versionNewer(MIN_ADDIN_VERSION, FUSION_ADDIN_VERSION)) return false;
  FUSION_STALE_WARNED = true;
  const have = FUSION_ADDIN_VERSION || "older than 1.1.0";
  // toast() takes no duration and has no warning level, so this rides the error
  // styling, which is the one that stays up long enough to read.
  toast(`This machine's Fusion add-in is ${have} and the app expects ${MIN_ADDIN_VERSION}. Reinstall it from Plan from Fusion on the Molds tab.`, "error");
  return true;
}

function fusionHandle(action, data) {
  try {
    if (action === "mold") {
      const payload = JSON.parse(data || "{}");
      if (!payload || !payload.stl) throw new Error("no STL in the message");
      fusionCheckAddinVersion(payload.addinVersion);
      const s = fusionAppState();
      if (!s.ready) {
        // Hold it. A second mesh before the first opened replaces it: the
        // member ran Plan stock again, and the later body is the one they mean.
        FUSION_PENDING = payload;
        const why = fusionWaitingOn(s);
        fusionSend("mold-held", { bytes: Math.floor(String(payload.stl).length * 3 / 4), waitingOn: why });
        if (s.state !== "loading") toast(`A mold from Fusion is waiting on ${why}.`, "info");
        return "held";
      }
      fusionOpenMold(payload);
      return "ok";
    }
    if (action === "signin") { fusionSignIn(JSON.parse(data || "{}")); return "ok"; }
    if (action === "ping") { fusionSend("pong", { data }); return "pong"; }
  } catch (e) {
    toast(`Fusion handed over something this app could not read: ${e.message}`, "error");
    fusionSend("mold-failed", { error: e.message });
    return "error " + e.message;
  }
  return "unhandled " + action;
}

/* The shared team account, sent by the add-in from its credentials file. The
   page does the sign-in the way the login card does, so persistence and the
   roster check are the app's own. Nothing about the password is kept or
   logged here. A palette that is already signed in as anyone is left alone:
   a member who signed in with their own account keeps their name on the
   mold. */
async function fusionSignIn(cred) {
  const s = fusionAppState();
  if (s.state === "loading" || FUSION_SIGNIN_BUSY) return;
  if (s.state === "ready" && !s.guest) return;          // already someone real
  if (!cred || !cred.user || !cred.password) { fusionSend("signin-failed", { error: "no credentials in the message" }); return; }
  FUSION_SIGNIN_BUSY = true;
  try {
    if (s.guest && window.fb && typeof fb.signOut === "function") await fb.signOut();
    await fb.signIn(loginEmailFor(cred.user), cred.password);
  } catch (e) {
    fusionSend("signin-failed", { error: (e && e.message) || String(e) });
    toast("Fusion's team account could not sign in: " + ((e && e.message) || e), "error");
  } finally {
    FUSION_SIGNIN_BUSY = false;
  }
}

function fusionDecodeStl(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/* The mold modal, with the STL already chosen and the units already right.
   Same MOLD_BUF shape loadSampleMold() fills, so submitMold() needs no case
   for it. The member still sets name, density and board mode themselves:
   those are decisions, and the add-in does not make them. */
function fusionOpenMold(payload) {
  if (!payload || !payload.stl) throw new Error("no STL in the message");
  const buffer = fusionDecodeStl(payload.stl);
  const ctx = payload.fusion || {};
  const body = payload.body || ctx.body || "mold body";
  if (typeof uploadMold !== "function") throw new Error("the Molds section is not loaded");
  view = { ...view, tab: "molds" };
  // Close whatever was open first: closeModal() clears FUSION_CTX, so the
  // context is set only after the mold modal is up.
  if (typeof closeModal === "function") closeModal();
  uploadMold();
  const frame = payload.frame && typeof isRigidMatrix === "function" && isRigidMatrix(payload.frame.matrix)
    ? { matrix: payload.frame.matrix.slice(), bottom: payload.frame.bottom || { how: "face" } }
    : null;
  if (payload.frame && !frame) throw new Error("the bottom-face frame is not a 16-number matrix");
  FUSION_CTX = { ...ctx, body, frame };
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  set("ml-src", "stl");
  if (typeof moldSrcChanged === "function") moldSrcChanged();
  set("ml-unit", "mm");
  const nameEl = document.getElementById("ml-name");
  if (nameEl && !nameEl.value) nameEl.value = ctx.document ? `${ctx.document} · ${body}` : body;
  MOLD_BUF = { buffer, name: `${body}.stl`, size: buffer.byteLength, key: `fusion:${ctx.urn || ""}:${ctx.versionNumber || ""}:${body}:${buffer.byteLength}:${ctx.exportedAt || ""}` };
  MOLD_BODIES = null;
  const prog = document.getElementById("ml-progress");
  if (prog) prog.textContent = `From Fusion: ${body} (${Math.round(buffer.byteLength / 1024)} KB, millimetres). Set the density and press Plan.`;
  // Hide the file and sample pickers: the mesh is already here, and a second
  // file picked now would silently replace the body the member selected.
  for (const id of ["ml-file", "ml-sample"]) {
    const e = document.getElementById(id);
    const f = e && e.closest ? e.closest(".field") : null;
    if (f && f.style) f.style.display = "none"; else if (e && e.style) e.style.display = "none";
  }
  // Say so explicitly as well as through the return value: the add-in shows
  // the member an error if neither arrives.
  fusionSend("mold-received", { bytes: buffer.byteLength, name: MOLD_BUF.name });
}

/* The block submitMold() stamps on the mold. `by` is the app user, which with
   the shared team account is that account; `exportedBy` is the Autodesk user
   who pressed Plan stock, so the mold still says who. */
function fusionStamp() {
  if (!FUSION_CTX) return null;
  const c = FUSION_CTX;
  return {
    urn: c.urn || "", versionId: c.versionId || "", versionNumber: c.versionNumber ?? null,
    project: c.project || "", folder: c.folder || "", document: c.document || "", body: c.body || "",
    webUrl: c.webUrl || "", exportedAt: c.exportedAt || "", exportedBy: c.exportedBy || "", by: myEmail(),
    /* Which way was up. A picked face is recorded by its outward normal in
       the model, so the card can say "bottom is the face facing +Y" and a
       reviewer can find it; no face means the model's Z. */
    bottom: c.frame && c.frame.bottom ? { how: "face", normal: (c.frame.bottom.normal || []).slice(0, 3) } : { how: "z" },
  };
}

/* The model -> planning matrix for the mold in the modal, or null when the
   mesh came in the model's own frame. submitMold() stores it on the plan. */
function fusionFrame() {
  return FUSION_CTX && FUSION_CTX.frame ? { matrix: FUSION_CTX.frame.matrix.slice(), bottom: FUSION_CTX.frame.bottom } : null;
}

/* submitMold() calls this once the plan record is saved. Fusion gets exactly
   what it needs to draw: the plan id (the component's name) and the layers
   with their blanks, in the millimetre frame the plan already stores. */
function fusionPlanSaved(plan, moldId) {
  const wasFusion = !!FUSION_CTX;
  FUSION_CTX = null;
  if (!wasFusion || !fusionHost()) return false;
  return fusionSend("plan", {
    planId: plan.id, moldId: moldId || plan.moldId || "", name: plan.name || "",
    frame: plan.frame || null,
    layers: (plan.layers || []).map(L => ({
      index: L.index, z0: L.z0, z1: L.z1, thickness: L.thickness, section: L.section || 0,
      blanks: (L.blanks || []).map(b => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })),
    })),
  });
}

/* closeModal() tells us when the member backed out, so a stale context cannot
   stamp the next mold made by hand. */
function fusionModalClosed() {
  if (!FUSION_CTX) return;
  FUSION_CTX = null;
  fusionSend("cancel", {});
}

/* ---------- the mold card ---------- */

/* "+Y", "-X", or the raw numbers when the face is not axis-aligned. */
function fusionDirWords(n) {
  if (!Array.isArray(n) || n.length < 3 || !n.every(Number.isFinite)) return "an unknown direction";
  const ax = ["X", "Y", "Z"];
  const i = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
  if (Math.abs(n[i]) > 0.999) return (n[i] > 0 ? "+" : "-") + ax[i];
  return `(${n.map(v => v.toFixed(2)).join(", ")})`;
}

async function fusionCopy(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast("Copied.");
      return;
    }
  } catch (e) { /* fall through */ }
  if (typeof prompt === "function") prompt("Copy the document name:", text);
}

/* Read-only, like the buyRef chip: the block is stamped by the add-in's
   hand-off, never edited by hand, so it is not a schema field. The deep link
   was tried and failed (10 Fusion Add-in/spikes/README.md, S6), which is why
   the link goes to the document's Fusion Team page, where Autodesk's own
   "Open in Fusion" button is. */
function moldFusionSection(m) {
  const f = m && m.fusion;
  if (!f || !(f.document || f.urn)) return "";
  const ver = f.versionNumber != null && f.versionNumber !== "" ? `v${esc(f.versionNumber)}` : "";
  const who = f.exportedBy ? esc(f.exportedBy) + (f.by ? ` <span class="muted">(via ${esc(userHandle(f.by))})</span>` : "") : (f.by ? esc(f.by) : "");
  return `<h3>Fusion</h3>
    <div class="fusionblk">
      <div class="f"><label>Document</label><div class="ro">${esc(f.document || "—")}
        ${f.document ? `<button class="sm ib" title="Copy the document name to find it in Fusion" onclick="fusionCopy('${esc(String(f.document).replace(/\\/g, "\\\\").replace(/'/g, "\\'"))}')">${icon("link", 13)} Copy name</button>` : ""}</div></div>
      <div class="f"><label>Body</label><div class="ro">${esc(f.body || "—")}</div></div>
      <div class="f"><label>Version</label><div class="ro">${ver || "—"}${f.project ? ` · ${esc(f.project)}${f.folder ? " / " + esc(f.folder) : ""}` : ""}</div></div>
      <div class="f"><label>Exported</label><div class="ro">${f.exportedAt ? fmtWhen(f.exportedAt) : "—"}${who ? " by " + who : ""}</div></div>
      ${f.bottom && f.bottom.how === "face" ? `<div class="f"><label>Bottom</label><div class="ro">a picked face, facing ${esc(fusionDirWords(f.bottom.normal))} in the model · the plan is laid flat on it</div></div>` : ""}
      ${f.webUrl && /^https:\/\//.test(f.webUrl) ? `<div class="f"><label></label><div class="ro"><a href="${esc(f.webUrl)}" target="_blank" rel="noopener">${icon("externalLink", 13)} Open in Fusion Team</a></div></div>` : ""}
    </div>`;
}
