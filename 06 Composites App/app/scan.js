"use strict";
/* scan.js — pointing the phone at a label, inside the app.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 * The primary way to scan a label is the phone's own camera app: it reads
 * /Q/<ID>, opens q.html, and that page works signed-out with no signal. This
 * file is the other half — scanning while you are already IN the app, so a
 * two-step action can be done with two scans and no typing:
 *
 *     scan the mold  ->  Move  ->  scan the shelf  ->  done
 *
 * That is PP-10's fix. CS-011 §7.3 says the location field "can't yet enforce
 * the storage map... type the real location string consistently until it can";
 * BIN records plus this make it a controlled value picked by pointing a camera
 * at a shelf, which is the version people will actually do with resin on their
 * hands.
 *
 * TWO KINDS OF CODE. FEB's own QR labels carry /Q/<ID> and route by prefix.
 * Chemical containers carry the UC EH&S tag instead (RSS Chemicals — campus
 * mandate, and the team will not double-sticker a carton), which is an opaque
 * serial with no prefix to route on. So every scan resolves through a chain:
 * FEB grammar first, then ehsResolve (core.js) mapping the tag to the lot or
 * BIN wearing it. Callers keep receiving FEB ids either way — accept() and
 * onCode() never see a raw tag. A tag NO record wears goes to opts.onUnknown
 * when the caller provides it (scanToOpen offers to log the container), and
 * to a state-line rejection when it does not.
 *
 * ON THE MISSING LIBRARY: Chrome and Android expose BarcodeDetector natively;
 * Safari does not. The old stance ("the phone's own camera app reads the QR
 * and lands on q.html, so vendor nothing") fails for EH&S tags — their codes
 * open nothing of ours, and some are 1-D barcodes a camera app won't treat as
 * a link. So scan-fallback.js lazy-loads a vendored zxing-wasm decoder and
 * installs it AS window.BarcodeDetector, only on browsers without the native
 * one; everything below the feature-detect is identical on both paths. If
 * that load fails, the typed box is still there.
 */

function scanSupported() {
  const det = typeof window !== "undefined" &&
    ("BarcodeDetector" in window ||
     (typeof ZX_FALLBACK !== "undefined" && ZX_FALLBACK.state !== "failed"));
  return !!(det && typeof navigator !== "undefined" && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function");
}

let SCAN = { stream: null, raf: 0, onCode: null, running: false,
             sticky: false, count: 0, lastId: "", lastAt: 0 };

/* opts: { title, hint, accept(id) -> bool, onCode(id), sticky, onUnknown(code) } */
async function openScan(opts) {
  SCAN.onCode = opts.onCode;
  SCAN.onUnknown = opts.onUnknown || null;
  SCAN.accept = opts.accept || (() => true);
  /* sticky: keep the camera running and take code after code.
     Every original caller was one-shot — scan a thing, open it — so accepting
     a code tore the whole modal down. invMoveHere is not one-shot: its hint
     literally says "scan the label on each thing you are putting on this
     shelf", and it was paying a fresh getUserMedia and a camera warm-up per
     item, which is most of a second each, on a phone, with gloves on. */
  SCAN.sticky = !!opts.sticky;
  SCAN.count = 0;
  SCAN.lastId = "";
  SCAN.lastAt = 0;
  const can = scanSupported();

  openModal(`
    <h2>${esc(opts.title || "Scan a label")}</h2>
    <p class="muted">${esc(opts.hint || "Point the camera at the QR code on the label.")}</p>
    ${can ? `<div class="scanbox"><video id="scan-video" playsinline muted></video><div class="scanret"></div></div>
             <div id="scan-state" class="muted tny" style="margin-top:6px">Starting the camera…</div>` : ""}
    <div class="field"><label for="scan-manual">${can ? "…or type the code" : "Type the code from the label"}</label>
      <input id="scan-manual" ${can ? "" : "autofocus"} placeholder="e.g. MOLD-SN6-004"
             autocapitalize="characters" autocomplete="off" spellcheck="false"
             onkeydown="if(event.key==='Enter')scanManual()"></div>
    ${can ? "" : `<p class="gate"><span class="gi">!</span><span>This browser can't open a camera for scanning.
      Type the code from the label instead — or scan an FEB QR with your phone's own camera app, which opens the
      public page for that record.</span></p>`}
    <div class="foot">
      <button onclick="closeScan()">Cancel</button>
      <button class="primary" onclick="scanManual()">Use this code</button>
    </div>
  `);

  if (!can) return;
  try {
    /* iPhones take this branch: the polyfill fetches once (1MB of wasm,
       cached after), and while it does the state line says so. On failure
       the modal quietly becomes what it always was on iOS — a typed box. */
    if (typeof scanFallbackNeeded === "function" && scanFallbackNeeded()) {
      setScanState("Loading the scanner… first time takes a few seconds.");
      const loaded = await loadScanFallback();
      if (!loaded) { setScanState("Couldn't load the scanner here. Type the code instead."); return; }
    }
    // facingMode "environment" is the back camera. On a laptop there is only
    // one and the constraint is ignored rather than failing.
    SCAN.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
    const v = document.getElementById("scan-video");
    if (!v) { stopScan(); return; }          // modal closed while we were asking
    v.srcObject = SCAN.stream;
    await v.play();
    setScanState("Looking for a code…");
    SCAN.running = true;
    /* qr_code is FEB's own labels. The rest are for UC EH&S tags, and the
       one that actually reads them is DATA_MATRIX: a photo of a physical RSS
       sticker (2026-08-29) settles a question that used to be a guess here.
       The tag is a Data Matrix square, "RSS" printed beside it, the 24-char
       serial spelled out underneath in groups of four (CA00 0000 0000 0000
       0024 3EF0) and the last twelve repeated up the right edge. It is not
       QR and it is not linear, which is what this comment used to assume.

       The linear formats STAY. One photo is one sheet of tags, not a survey
       of every container on RFS's shelves, and a sticker applied years ago
       under a different contract is exactly the thing that would not scan.
       An unsupported format in this list is ignored, not an error, so the
       cost of keeping them is decode time on the zxing path, not breakage —
       drop them only when someone has actually walked the shelves. */
    tickScan(new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "code_93", "data_matrix"] }), v);
  } catch (e) {
    setScanState("Couldn't open the camera. Type the code instead.");
  }
}

function setScanState(s) { const el = document.getElementById("scan-state"); if (el) el.textContent = s; }

async function tickScan(det, video) {
  if (!SCAN.running) return;
  try {
    const hits = await det.detect(video);
    for (const h of hits) {
      const id = scanResolve(h.rawValue);
      /* The detector re-reads the same code on every frame while the label is
         still in view, which does not matter when accepting closes the camera
         and matters enormously when it does not: one label would fire sixty
         moves a second. Ignore a repeat of the code we just took until it has
         been out of frame for a moment. */
      if (id && SCAN.sticky && id === SCAN.lastId && Date.now() - SCAN.lastAt < 2500) continue;
      if (id && SCAN.accept(id)) { acceptScan(id); if (!SCAN.sticky) return; continue; }
      if (id) { setScanState(`${id} isn't the right kind of code for this.`); continue; }
      const code = scanEhsCode(h.rawValue);
      if (!code) continue;
      /* A readable code that no record wears. One-shot callers who said they
         can do something with that (scanToOpen offers the receiving desk) get
         it and the modal closes. A STICKY caller with onUnknown takes code
         after code without closing — that is the receiving desk scanning the
         tags on a three-jug line — with the same held-in-frame debounce the
         resolved path uses, keyed "u:" so a code and an id can never collide.
         Sticky flows withOUT onUnknown just say so and keep the camera up:
         a pile of moves should not be derailed into an enrolment dialog. */
      if (SCAN.onUnknown) {
        if (!SCAN.sticky) { const fn = SCAN.onUnknown; closeScan(); fn(code); return; }
        const k = "u:" + code;
        if (k === SCAN.lastId && Date.now() - SCAN.lastAt < 2500) continue;
        SCAN.lastId = k; SCAN.lastAt = Date.now(); SCAN.count++;
        SCAN.onUnknown(code);
        setScanState(`${code} — ${SCAN.count} scanned. Keep going, or Done.`);
        continue;
      }
      setScanState(`${code} isn't on any record yet — log it at the receiving desk first.`);
    }
  } catch { /* a dropped frame is not an error worth reporting */ }
  SCAN.raf = requestAnimationFrame(() => tickScan(det, video));
}

/* The resolution chain every scan and every retype goes through: FEB's own
   grammar first, then the EH&S tag registry. Returns an FEB id or "".

   The EH&S half goes through ehsResolveTyped, which accepts the LABEL'S EDGE
   PRINT as well as the whole code — a UC tag reprints its last twelve
   characters rotated down the right edge, and that strip is what is still
   readable on a jug whose face is scuffed or whose label is wrapped round the
   neck. Somebody reading a container out loud reads those twelve. A tail
   matching two records is not resolved here; scanManual says so in words,
   because picking one would open the wrong jug. */
function scanResolve(raw) {
  const id = idFromScan(raw);
  if (id) return id;
  const hit = typeof ehsResolveTyped === "function" ? ehsResolveTyped(scanEhsCode(raw)) : null;
  return hit && hit.id ? hit.id : "";
}

/* What an EH&S tag reads as. This only peels a URL wrapper (in case a newer QR
   tag encodes a link the way ours do) and hands the rest to ehsNorm — the
   grammar checking lives in ehsShape and is advisory, so nothing is rejected
   here for being the wrong length. An FEB-shaped code is refused: FAB-SN6-001
   typed here is a failed FEB lookup, not a plausible UC serial. */
function scanEhsCode(raw) {
  let v = String(raw || "").trim();
  const m = v.match(/^[A-Za-z]+:\/\/[^/]+\/(.*)$/);
  if (m) v = m[1].split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
  const code = typeof ehsNorm === "function" ? ehsNorm(v) : "";
  if (/^[A-Z]+-SN\d+-\d+/.test(code)) return "";
  /* And a word is a word: "hello" typed into the box should read as not-a-code,
     not as an unknown tag. Every barcode serial anyone has seen has digits. */
  return code.length >= 4 && /\d/.test(code) ? code : "";
}

/* A scanned value is a whole URL (HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004)
   but a typed one is usually the bare code, and somebody will paste either.
   Accept both, plus the lowercase and the separator-stripped forms, because a
   code read off a scuffed label gets retyped by hand. */
function idFromScan(raw) {
  let v = String(raw || "").trim().toUpperCase();
  const m = v.match(/\/Q\/([0-9A-Z-]+)/);
  if (m) v = m[1];
  v = v.replace(/^HTTPS?:\/\/[^/]+\//, "").replace(/[^0-9A-Z-]/g, "");
  return /^[A-Z]+-SN\d+-\d+/.test(v) ? v : "";
}

function acceptScan(id) {
  const fn = SCAN.onCode;
  if (SCAN.sticky) {
    SCAN.lastId = id;
    SCAN.lastAt = Date.now();
    SCAN.count++;
    if (fn) fn(id);
    // Said after the callback, so a caller that refuses the code can overwrite
    // this with its own reason rather than being contradicted by it.
    setScanState(`${id} — ${SCAN.count} scanned. Keep going, or Done.`);
    return;
  }
  closeScan();
  if (fn) fn(id);
}

function scanManual() {
  const el = document.getElementById("scan-manual");
  const raw = el ? el.value : "";
  const id = scanResolve(raw);
  if (SCAN.sticky && el) el.value = "";   // ready for the next one
  if (!id) {
    const code = scanEhsCode(raw);
    /* An edge print shared by two containers. Refuse and name them: four more
       characters off the face of the label settles it, and opening the wrong
       jug's record does not. */
    const amb = code && typeof ehsResolveTyped === "function" ? ehsResolveTyped(code) : null;
    if (amb && amb.ambiguous) {
      toast(`${ehsPrinted(code)} is the end of ${amb.ambiguous.length} tags (${amb.ambiguous.map(h => h.id).join(", ")}) — type more of the code.`, "error");
      return;
    }
    if (code && SCAN.onUnknown) {
      if (!SCAN.sticky) { const fn = SCAN.onUnknown; closeScan(); fn(code); return; }
      SCAN.count++;
      SCAN.onUnknown(code);
      setScanState(`${code} — ${SCAN.count} scanned. Keep going, or Done.`);
      return;
    }
    if (code) { toast(`${code} isn't on any record yet — log it at the receiving desk first.`, "error"); return; }
    toast("That doesn't look like a code from a label.", "error");
    return;
  }
  if (!SCAN.accept(id)) { toast(`${id} isn't the right kind of code for this.`, "error"); return; }
  acceptScan(id);
}

function stopScan() {
  SCAN.running = false;
  if (SCAN.raf) cancelAnimationFrame(SCAN.raf);
  SCAN.raf = 0;
  // Releasing every track is what turns the phone's camera light off. Leaving
  // it on after the modal closes reads as the app spying on you.
  if (SCAN.stream) { SCAN.stream.getTracks().forEach(t => t.stop()); SCAN.stream = null; }
}
function closeScan() { stopScan(); closeModal(); }

/* ---------- what a scan is FOR ---------- */

/* Jump to whatever was scanned. The global entry point, from the topbar. */
function scanToOpen() {
  openScan({
    title: "Scan",
    hint: "Point the camera at any label — ours, or the UC EH&S tag on a chemical — to open that record.",
    onCode: id => {
      const tab = tabForId(id);
      const coll = tab ? (TABS.find(t => t.id === tab) || {}).coll : null;
      if (!tab || !coll) { toast(`Don't recognise ${id}.`, "error"); return; }
      if (!recById(coll, id)) { view = { ...view, tab, mode: "list", id: null, q: id }; render(); syncUrl();
        toast(`No record ${id} here — searching for it.`, "error"); return; }
      openRecord(tab, id);
    },
    /* An EH&S tag nobody has logged yet. The person holding the container is
       exactly the person who can enrol it, so offer the receiving desk with
       the code already in the tag cell rather than a dead end. */
    onUnknown: code => {
      if (typeof openReceiving !== "function") { toast(`${code} isn't on any record yet.`, "error"); return; }
      confirmModal(`No record wears EH&S tag ${code} yet. Log the container at the receiving desk?`,
        () => openReceiving({ ehs: code }), { title: "New container", ok: "Log it", danger: false });
    },
  });
}

/* Move something to a storage location by scanning the shelf.
 *
 * The whole point is that neither end is typed. Scan the mold, tap Move, scan
 * the shelf. A BIN record is a shelf with a label on it, so the location field
 * becomes a controlled value instead of the freeform string CS-011 §7.3
 * complains about. */
function quickMove(coll, id) {
  const o = recById(coll, id);
  if (!o) return;
  const bins = (DB.items || []).filter(b => b.cls === "BIN" && b.stage !== "Retired");

  openModal(`
    <h2>Move ${esc(o.name || id)}</h2>
    <p class="muted">Where is it now? Scanning the shelf's own label is faster than typing, and it is the
    thing that makes "where is the seat mold" a lookup instead of a Slack ask.</p>
    <div class="field"><label for="qm-bin">Location</label>
      <select id="qm-bin" autofocus>
        <option value="">—</option>
        ${bins.map(b => `<option value="${esc(b.id)}" ${o.location === b.id ? "selected" : ""}>${esc(b.name || b.id)}</option>`).join("")}
      </select></div>
    ${bins.length ? "" : `<p class="gate"><span class="gi">!</span><span>No storage locations exist yet.
      Add them on the Inventory tab with <b>+ Location</b>, print their labels, and stick one on each shelf.</span></p>`}
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button onclick="quickMoveScan('${esc(coll)}','${esc(id)}')">${icon("search", 15)} Scan the shelf</button>
      <button class="primary" onclick="quickMoveSave('${esc(coll)}','${esc(id)}')">Move it</button>
    </div>
  `);
}
function quickMoveScan(coll, id) {
  openScan({
    title: "Scan the shelf",
    hint: "Point the camera at the storage label where it is going.",
    accept: sid => String(sid).startsWith("BIN-"),
    onCode: sid => setLocation(coll, id, sid),
  });
}
function quickMoveSave(coll, id) {
  const sel = document.getElementById("qm-bin");
  setLocation(coll, id, sel ? sel.value : "");
  closeModal();
}
function setLocation(coll, id, binId) {
  const o = recById(coll, id);
  if (!o) return;
  const field = coll === "parts" ? "moldLocation" : "location";
  o[field] = binId;
  save(coll, o, field);
  const bin = recById("items", binId);
  toast(binId ? `Moved to ${bin ? (bin.name || binId) : binId}.` : "Location cleared.");
  render();
}

/* Advance one stage, with an undo. Going forward is the common case and should
   cost one tap; the app's Parts tab already works this way, and this keeps the
   two consistent rather than inventing a second idiom for the same action. */
let SHOP_UNDO = null;

function quickAdvance(coll, id) {
  const o = recById(coll, id);
  if (!o) return;
  const spec = Object.values(SHOP).find(s => s.coll === coll);
  if (!spec) return;
  const stages = shopClassOf(spec, o).stage || [];
  const i = stages.indexOf(o.stage);
  if (i < 0 || i >= stages.length - 1) { toast("Already at the last stage.", "info"); return; }
  const from = o.stage, to = stages[i + 1];
  o.stage = to;
  save(coll, o, "stage");
  /* One tap, three facts. openedOn and emptiedOn are date fields nobody was
     ever going to type by hand, and "when was this opened" is exactly what a
     shelf-life question needs. The stage transition already knows. */
  const prev = { openedOn: o.openedOn || "", emptiedOn: o.emptiedOn || "", qty: o.qty || "", count: o.count };
  if (coll === "lots") {
    if (to === "Open" && !o.openedOn) { o.openedOn = today(); save(coll, o, "openedOn"); }
    if (to === "Empty") {
      if (!o.emptiedOn) { o.emptiedOn = today(); save(coll, o, "emptiedOn"); }
      if (o.qty !== "Empty") { o.qty = "Empty"; save(coll, o, "qty"); }
      if (o.cls === "CON" && Number(o.count) > 0) { o.count = 0; save(coll, o, "count"); }
    }
  }
  /* Undo BAR, not just a toast, and the same one the Parts tab uses. A toast
     disappears on its own; "I fat-fingered that a minute ago" needs something
     that is still there a minute later. Deliberately the same idiom rather than
     a second one for the same action. */
  SHOP_UNDO = { coll, id, from, to, name: o.name || id, prev };
  toast(`${o.name || id} → ${to}`);
  render();
}
function undoShopStage() {
  const u = SHOP_UNDO; SHOP_UNDO = null;
  if (!u) { render(); return; }
  const o = recById(u.coll, u.id);
  if (!o) { toast("That record is gone — nothing to undo.", "error"); render(); return; }
  o.stage = u.from;
  save(u.coll, o, "stage");
  // Put back everything the advance stamped, not just the stage.
  if (u.prev) for (const k of ["openedOn", "emptiedOn", "qty", "count"]) {
    if (o[k] !== u.prev[k]) { o[k] = u.prev[k]; save(u.coll, o, k); }
  }
  toast(`Undone — ${u.name} back to ${u.from}`);
  render();
}
function dismissShopUndo() { SHOP_UNDO = null; render(); }
function shopUndoBar() {
  const u = SHOP_UNDO;
  if (!u) return "";
  /* Cutting the blanks is the moment offcuts exist and are known — the saw is
     still out and the remnant is in someone's hand. That is "Tooling cut" as
     of September 2026; "Board glued" is kept alongside it because it was the
     only offer for a season and people reach for it there. A dismissible offer
     on the undo bar, never a gate: a prompt that fires where it makes no sense
     is the one people learn to dismiss (same reasoning as lot capture). */
  const offcut = u.coll === "molds" && ["Tooling cut", "Board glued"].includes(u.to)
    ? `<button class="sm" onclick="logOffcutFromMold('${esc(u.id)}')">Log offcuts</button>` : "";
  return `<div class="undobar no-print">
    <span class="ub-i">${icon("check", 15)}</span>
    <span class="ub-t"><b>${esc(u.name)}</b> → <b>${esc(u.to)}</b> (was ${esc(u.from)}) — saved for everyone.</span>
    ${offcut}
    <button class="sm" onclick="undoShopStage()">Undo</button>
    <button class="sm ib" onclick="dismissShopUndo()">${icon("x", 14)}</button>
  </div>`;
}
/* Point the camera at a container's UC tag to fill the record's ehsBarcode
   field — the Edit-mode alternative to retyping a 24-character serial off a
   sticker. The polarity is inverted from every other scan on purpose:
   onUnknown (a tag NO record wears) is the success path and writes through
   updShop, which owns the normalisation, the one-tag-one-container refusal,
   the save and the re-render. onCode firing means scanResolve found the tag
   already on some record — that is the duplicate case, refused by naming the
   wearer, with the same words updShop would use. */
function scanEhsInto(tab) {
  openScan({
    title: "Scan the EH&S tag",
    hint: "Point the camera at the UC barcode sticker on the container or shelf.",
    onUnknown: code => updShop(tab, "ehsBarcode", code),
    onCode: id => {
      if (id === view.id) { toast("That tag is already on this record.", "info"); return; }
      const o = recById("lots", id) || recById("items", id);
      if (o && o.ehsBarcode) {
        toast(`${ehsNorm(o.ehsBarcode)} is already on ${o.name || id} (${id}) — one tag, one container.`, "error");
        return;
      }
      // An FEB id with no tag means the camera read one of OUR QR labels.
      toast(`${id} is an FEB label, not a UC EH&S tag.`, "error");
    },
  });
}

/* Pre-filled leftover-board entry: origin = the mold it came off. A leftover
   is not a separate kind of thing, just a smaller board, so the only thing
   worth prefilling is where it came from — the size is whatever is left, which
   only the person holding it knows. */
function logOffcutFromMold(moldId) {
  if (typeof boardModal !== "function") return;
  boardModal(null, { origin: moldId });
}
