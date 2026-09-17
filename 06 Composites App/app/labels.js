/* labels.js — printed identity for physical things.
 *
 * WHY THIS EXISTS
 * The SN5 part tracker had no ID column, so a part's *name string* was its
 * primary key, and the strings didn't even agree between sheets (STERING COVER
 * in one, STEERING COVER in the other). Molds sat in the RFS container for
 * weeks with nobody sure whose they were (PP-10). Seventeen tensile CSVs
 * identify a specimen by a trailing integer in the filename and nothing else.
 *
 * So: every physical thing gets a 4x1 inch label carrying its ID, its name,
 * the fact that actually identifies it (the layup stack for a part, the
 * sealing record for a mold), and a QR that resolves to the record.
 *
 * THE ONE NUMBER THIS FILE IS BUILT AROUND: 29.
 * HTTPS://FEB-COMPOSITES.WEB.APP/Q/MOLD-SN6-004 is 45 characters. Encoded as
 * BYTES that needs QR version 4 (33 modules). Encoded as ALPHANUMERIC it fits
 * version 3 (29 modules) *and* has room for error-correction level Q, 25%
 * recovery, instead of M's 15%. Same physical size, a whole ECC level better,
 * for free — which on a label that gets resin and mold release on it is the
 * whole argument.
 *
 * That is why every URL here is UPPERCASE. QR alphanumeric mode covers only
 * 0-9 A-Z space $ % * + - . / : — no lowercase, no # ? = & _. One lowercase
 * letter silently costs a version and an ECC level. Scheme and host are
 * case-insensitive per RFC 3986 and our IDs are already uppercase, so nothing
 * is lost. tools/test_qr.mjs asserts getModuleCount() === 29 exactly, so the
 * day someone adds ?utm= or switches to a #hash route, the suite says so.
 *
 * And note: qrcode-generator does NOT auto-detect alphanumeric mode. addData()
 * defaults to Byte. We pass 'Alphanumeric' explicitly, after validating the
 * charset ourselves, because the library's own error for a bad character is
 * literally `undefined`.
 */

/* ---------- the URL ---------- */

const SCAN_HOST = "HTTPS://FEB-COMPOSITES.WEB.APP";
const SCAN_PATH = "/Q/";
// QR alphanumeric charset, ISO/IEC 18004 table 5. Anything outside this drops
// the encoder into byte mode.
const QR_ALNUM = /^[0-9A-Z $%*+\-./:]*$/;

/* THE CHARACTER BUDGET, which is a hard constraint on the ID grammar and not
 * just a property of this file.
 *
 * QR version 3 at ECC Q holds 47 alphanumeric characters. The host is 30 and
 * "/Q/" is 3, so an ID has 14 characters before the code jumps to version 4.
 *
 *   47 - 30 - 3 = 14
 *
 * MOLD-SN6-004 is 12, and every other prefix in the grammar is shorter.
 *
 * THIS USED TO SAY COUPONS COULD NEVER CARRY A QR, and that was a fact about
 * one SPELLING of a coupon rather than about coupons. When a coupon was a
 * substring of a panel — PNL-SN6-006-C03, fifteen characters — it was one over
 * budget, so coupon labels were text-only on 12mm tape. A coupon is now a
 * first-class record in the `rnd` collection: CPN-SN6-042 is eleven characters,
 * shorter than a mold, and it carries a QR like everything else. A study,
 * RDS-SN6-004, is eleven too — it labels the bag or tray the coupons live in,
 * which is a physical object somebody picks up months later.
 *
 * The rule the budget expresses did not move; what changed is which ids satisfy
 * it. tools/test_qr.mjs keeps the 15-character form as a counterfactual, so the
 * cliff stays proven rather than assumed, and still says so the day someone
 * adds a longer prefix instead of every label quietly getting denser.
 */
const QR_ID_BUDGET = 47 - SCAN_HOST.length - SCAN_PATH.length;   // = 14

function scanUrl(id) { return SCAN_HOST + SCAN_PATH + String(id || "").toUpperCase(); }
function fitsQrBudget(id) { return String(id || "").length <= QR_ID_BUDGET; }

/* ---------- QR ---------- */

// Below this the code stops being readable by a phone and starts being
// decoration. 29 modules + 8 of quiet zone = 37; at 14mm that's 0.38mm per
// module, already under the 0.4mm floor. A too-small QR looks perfectly fine
// on screen and simply does not scan in the world, which is why this is a
// throw and not a console.warn.
const QR_MIN_MM = 14;

/* One QR as a self-contained inline <svg>.
 *
 * Self-contained matters: print.js sheetFileHtml() copies innerHTML and inlines
 * only CSS, so a saved label sheet on a phone at RFS with no wifi has no
 * vendor/qrcode.min.js next to it. Nothing here may be a <script>, an <image>,
 * or an xlink:href.
 *
 * One merged <path>, not N <rect>s: a 29x29 grid as rects is ~420 elements per
 * label, so a 20-up sheet is 8,400 DOM nodes and a saved file in the megabytes.
 * Run-length-merging horizontal runs gets one label to about 2KB.
 *
 * The quiet zone lives INSIDE the viewBox. Printers clip to the element box, so
 * a quiet zone implemented as a CSS margin disappears in the saved file, and a
 * QR with no quiet zone is the most common home-made-label failure there is.
 */
function qrSvg(text, sizeMm, cls) {
  const t = String(text || "");
  if (!QR_ALNUM.test(t)) {
    throw new Error(`qrSvg: "${t}" has characters outside QR alphanumeric mode. ` +
      `Uppercase it, and drop any # ? = & _ — see the header of labels.js.`);
  }
  if (!(sizeMm >= QR_MIN_MM)) {
    throw new Error(`qrSvg: ${sizeMm}mm is below the ${QR_MIN_MM}mm floor; the code would not scan.`);
  }
  if (typeof qrcode !== "function") throw new Error("qrSvg: vendor/qrcode.min.js not loaded.");

  const q = qrcode(0, "Q");          // 0 = auto version, Q = 25% recovery
  q.addData(t, "Alphanumeric");
  q.make();

  const n = q.getModuleCount();
  const QUIET = 4;                   // modules, per ISO/IEC 18004
  const box = n + QUIET * 2;

  // Merge horizontal runs of dark modules into one path segment each.
  let d = "";
  for (let r = 0; r < n; r++) {
    let run = 0;
    for (let c = 0; c <= n; c++) {
      const dark = c < n && q.isDark(r, c);
      if (dark) { run++; continue; }
      if (run) { d += `M${c - run + QUIET} ${r + QUIET}h${run}v1h-${run}z`; run = 0; }
    }
  }

  // xmlns is not needed for inline SVG (the HTML parser implies it) but IS
  // needed the moment the markup leaves an HTML document: pasted into a data
  // URL, saved as a .svg, or handed to a print shop. 34 bytes to make the code
  // a portable artefact instead of a fragment.
  return `<svg xmlns="http://www.w3.org/2000/svg" class="lbl-qr${cls ? " " + cls : ""}" ` +
    `width="${sizeMm}mm" height="${sizeMm}mm" ` +
    `viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="scan code for ${esc(t)}"><rect width="${box}" height="${box}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`;
}

/* ---------- what the label says ---------- */

/* The public projection: the ONLY fields an unauthenticated scanner may see.
 *
 * Shared with the label renderer on purpose, so the printed label and the
 * public scan card can never disagree about what an object is. It is also the
 * security boundary — Firestore rules cannot filter fields, only whole
 * documents, so this function is what keeps layup stacks and people's names off
 * a public URL. firestore.rules mirrors this list in a hasOnly() clause; if you
 * add a key here, add it there too or the write is rejected.
 *
 * Never add: any human name or email, layupStack/steps/qualityChecks/bom,
 * anything from budget, any firebasestorage.googleapis.com URL (a download URL
 * is a bearer credential and works regardless of storage.rules), or unbounded
 * free text like comments.
 */
/* R&D, asked in a way that survives this file being loaded ALONE.
   test_qr.mjs runs labels.js in a bare sandbox with only `esc` and `qrcode`,
   and its header says that is deliberate: anything more and the QR arithmetic
   starts depending on core.js's whole surface. So this is guarded exactly the
   way pubProjection already guards DB a few lines down. Loaded on its own, a
   label simply cannot know about a flag that lives on records it was not
   given — and the geometry it IS there to check is unaffected. */
function lblIsRnd(coll, o) { return typeof recIsRnd === "function" ? recIsRnd(coll, o) : false; }

/* The R&D bench's four accessors, guarded exactly the way lblIsRnd is and for
   the same reason: tools/test_qr.mjs loads THIS FILE ALONE in a sandbox holding
   only esc() and qrcode(), deliberately, so the geometry it checks cannot drift
   behind a dependency. A label asked to render a coupon in that sandbox simply
   cannot know what study holds it — and the geometry it is there to check does
   not depend on knowing. Unguarded, every one of these is a ReferenceError that
   fails the QR suite rather than the thing the suite is about. */
function lblStudyOf(o) { return typeof rdStudyOf === "function" ? rdStudyOf(o) : null; }
function lblStudyName(o) { const s = lblStudyOf(o); return s ? (s.name || s.id || "") : ""; }
function lblEff(o, k) { return typeof rdEff === "function" ? rdEff(o, k) : (o[k] ?? ""); }
function lblStudyMat(s, k) { return s && s.defaults ? (s.defaults[k] ?? "") : ""; }
function lblCouponCount(s) { return typeof rdCouponsDeep === "function" ? rdCouponsDeep(s.id).length : 0; }
/* A NAME, not an email. The R&D records store `createdBy` and `by` as email
   addresses because that is what myEmail() returns and what the rules check,
   but "ANA@BERKELEY.EDU" on a 7pt line is both uglier and less useful than
   "ANA RIVERA" to somebody holding the bag. Guarded like the rest: with core.js
   absent this degrades to the raw value rather than throwing.

   This is a printed, team-facing label. The PUBLIC nameplate is pubProjection,
   which carries no person at all — see the never-add list on it. */
function lblWho(v) {
  const s = String(v || "");
  return typeof userName === "function" && s.includes("@") ? userName(s) : s;
}

function pubProjection(coll, o) {
  if (!o || !o.id) return null;
  const cls = labelClass(coll, o);
  if (!cls) return null;                       // tickets, budget, docs: not physical
  return {
    id: o.id,
    cls,
    name: o.partName || o.name || o.label || "",
    status: pubStatus(coll, o),
    /* Resolve a BIN- id to the shelf's NAME: the public nameplate a scanned
       mold shows should say "Resin shelf A", not "BIN-SN6-002". Falls back to
       the raw value for legacy free text or an unknown id. */
    location: (() => {
      const v = o.location || o.moldLocation || "";
      if (String(v).startsWith("BIN-")) {
        const b = (typeof DB === "object" && (DB.items || []).find(x => x.id === v)) || null;
        return b && b.name ? b.name : v;
      }
      return v;
    })(),
    wo: o.workOrderId || o.wo || (coll === "workOrders" ? o.id : "") || "",
    rev: o.revision || o.rev || "",
    /* R&D rides `note` rather than a new key, and that is a DEPLOYMENT decision
       rather than a tidiness one. `note` is already in firestore.rules'
       hasOnly() list and has been the empty string on every document ever
       written, so this ships with the app and nothing else has to be true at the
       same time.
       A new key would need the rules deployed FIRST, and getting that order
       wrong is silent and total: pubProjection() emits every key on every write,
       so one key the deployed rules do not accept rejects EVERY nameplate in the
       app, not just R&D ones — and pubSync() reduces that to a console.warn on
       purpose ("a mirror failure must never surface as a save failure"). The
       symptom is nothing at all, for as long as it takes somebody to scan a
       label and notice a stale answer.
       A fixed sentence, not user text, so the "no unbounded free text" rule
       above still holds. */
    note: lblIsRnd(coll, o) ? "R&D build — a real part, not a season deliverable." : "",
    updatedAt: o.updatedAt || ""
  };
}

// The class word. Mandatory on every label and always larger than the code,
// because "PART P-SN6-007" and "TICKET PROJ-SN6-007" can never be confused at
// 7pt on a greasy label while the bare codes can.
function labelClass(coll, o) {
  const byColl = { workOrders: "WORK ORDER", parts: "PART", stock: "BOARD", molds: "MOLD" };
  if (coll === "items" || coll === "lots") {
    // The class word is what stops "PART P-SN6-007" being read as
    // "TICKET PROJ-SN6-007" on a greasy label, so a record with no cls gets no
    // label rather than a blank one.
    const words = { PNL: "TEST PANEL", JIG: "JIG", BIN: "STORAGE", FAB: "FABRIC", RSN: "RESIN", CON: "CONSUMABLE" };
    return words[o.cls] || (o.cls ? String(o.cls).toUpperCase() : null);
  }
  /* The R&D bench. A STUDY is physical after all — it is the bag, the tray or
     the box the coupons live in, and that is the thing somebody picks up off a
     shelf in March wondering what it was. The first cut of this returned null
     for a study on the grounds that "a folder is not a physical object", which
     was wrong about how coupons are actually stored.

     Same no-cls-no-label rule as items and lots, for the same reason: the class
     word is what stops CPN being read as CON at 7pt with mould release on it,
     and COUPON versus CONSUMABLE are not confusable where the codes are. */
  if (coll === "rnd") {
    const words = { RDS: "STUDY", CPN: "COUPON" };
    return words[o.cls] || null;
  }
  return byColl[coll] || null;
}

function pubStatus(coll, o) {
  if (coll === "parts") return o.layupProgress || o.moldProgress || "";
  return o.status || o.stage || "";
}
// The stage word on a scanned mold is the single most useful fact after its
// name: "Ready for layup" versus "Machined" is the whole question someone is
// standing in front of it asking.

/* ---------- one label ---------- */

/* 101.6 x 25.4 mm (Avery 5161), which is also a 24mm tape label to within
 * 1.4mm — so one layout drives both the sheet path we have today and the
 * thermal path after the printer arrives. The fallback is the same design on
 * worse stock, not a degraded design.
 *
 * THE NAME LEADS (2026-08-13). The label's primary use is being READ; the QR
 * is secondary (Simon's words). The old layout put the 16pt ID first and gave
 * the name whatever was left of one shared line — about 13 characters, so
 * "FLAMMABLES CABINET" printed as "FLAMMABLES CA…". Now the name is the top
 * row at the largest size that fits, wrapping to two lines when it must
 * (nameTier below), and the ID is a 9.5pt row of its own beneath it.
 *
 * Vertical budget: 25.4mm less 2mm margin top and bottom = 21.4mm. One-line
 * name: 5.4 (14pt) + 4.0 (id) + 3.6 (key) + 2.9 + 2.9 = 18.8mm. Two-line
 * name: the mid row merges into the footer (Simon's pick: drop the least
 * useful row rather than shrink everything), 10.1 (2 x 13pt) + 4.0 + 3.6 +
 * 2.9 = 20.6mm. Still no room for a masthead bar; FEB stays a 6.5pt tag.
 *
 * The key row is the one this whole system exists for. On a part or panel it
 * is the layup stack in CS-002 shorthand ("6X 195 TWILL + .125 NOMEX"), which
 * is the literal question PP-09 records nobody being able to answer. On a
 * mold it is the sealing record. Bold at 8.5pt for that reason, and it is
 * never the row that gets merged away.
 */

/* Which size/line-count the name prints at. Pure and deterministic (char
 * count, not measurement) for the same reason labelLines uppercases in JS:
 * the width must not lie at layout time. Thresholds assume the NARROW text
 * track — the 5522 stock's 27mm QR leaves ~68mm — so both stocks fit; at
 * ~0.236mm per pt per Arial-Bold-uppercase glyph that is 20 chars at 14pt,
 * 22/line at 13pt, 26/line at 11pt, 32/line at 9pt, 36/line at 8pt. Beyond
 * two 8pt lines (72 chars) the clamp ellipsis finally wins — nothing the
 * team names comes close (worst real name: 55). */
function nameTier(name, narrow) {
  const n = String(name || "").length;
  /* NARROW is the DK-1201 die-cut roll: 86.6mm of printable length against the
     101.6mm every other stock gives, so the text track drops from ~68mm to
     ~60mm and each tier has to fire about 12% earlier. The continuous rolls
     (DK-2210 at 29mm, DK-2205 at 62mm) are cut AT 101.6mm and use the wide
     thresholds unchanged — which is the whole reason they are the recommended
     media and the die-cut roll is only the hedge. */
  const T = narrow ? [18, 39, 46, 56] : [20, 44, 52, 64];
  if (n <= T[0]) return { cls: "n1", merge: false };   // 14pt, one line
  if (n <= T[1]) return { cls: "n2a", merge: true };   // 13pt, two lines
  if (n <= T[2]) return { cls: "n2b", merge: true };   // 11pt, two lines
  if (n <= T[3]) return { cls: "n2c", merge: true };   // 9pt, two lines
  return { cls: "n2d", merge: true };                  // 8pt, two lines, may clip
}

/* A record's label: project it, resolve the per-class lines, hand both to
 * labelMarkup. The markup itself lives in exactly one place so the record path
 * and the custom-label path cannot drift apart — the same reason labelBtn() is
 * one function for six call sites.
 */
function labelHtml(coll, o, opts) {
  opts = opts || {};
  const p = pubProjection(coll, o);
  if (!p) return "";
  const L = labelLines(coll, o, p);
  return labelMarkup({
    name: L.name, id: o.id, cls: p.cls, key: L.key, mid: L.mid, foot: L.foot,
    rnd: lblIsRnd(coll, o),
    /* No QR when the caller says so, or when the ID is too long to stay at
       version 3 (see the budget at the top of this file). Silently dropping to
       a denser code would be worse: the label would look identical and scan
       worse. */
    qr: (opts.noQr || !fitsQrBudget(o.id)) ? "" : scanUrl(o.id)
  }, opts);
}

/* THE MARKUP, given lines that are already resolved. Knows nothing about
 * collections, DB or the public projection — which is exactly what lets a
 * custom label with no record behind it render through this same function and
 * come out looking like every other label in the shed.
 *
 * L = { name, id, cls, key, mid, foot, rnd, qr }, all optional. `qr` is the
 * TEXT to encode, not a flag: the caller decides what a code means, this
 * decides how big it is.
 *
 * The ID row is dropped outright when there is no id, rather than emitted
 * empty. .lbl-r2/.lbl-r3 already collapse when blank (print.css) but .lbl-rid
 * cannot — it is a flex row holding a span, so :empty never fires on it and a
 * custom label would print a blank 9.5pt gap where an ID would be.
 *
 * opts: { qrMm, narrow }. narrow goes straight to nameTier.
 */
function labelMarkup(L, opts) {
  opts = opts || {};
  L = L || {};
  const t = nameTier(L.name, opts.narrow);
  const qr = L.qr ? qrSvg(L.qr, opts.qrMm || 21.4) : "";
  const foot = t.merge ? [L.mid, L.foot].filter(Boolean).join(" · ") : L.foot;

  return `<div class="lbl" data-id="${esc(L.id || "")}" data-cls="${esc(L.cls || "")}">
    <div class="lbl-txt">
      <div class="lbl-name ${t.cls}">${esc(L.name)}</div>
      ${/* R&D goes on the ID row and nowhere else. The vertical budget above is
            spent, so this had to cost zero millimetres — and it does: the tag is
            smaller than the row it sits in, so the row cannot grow (the sums are
            in print.css beside .lbl-rnd).
            The ID row is also the only row on this label whose CONTENT IS
            LENGTH-CAPPED — 14 characters, enforced by fitsQrBudget — so it is
            the one place a mark can be put and proven never to truncate. The
            name clamps, the key row and the footer ellipsis, and the mid row is
            deleted outright whenever the name needs two lines.
            Deliberately NOT a class word: labelClass()'s list maps one-to-one
            onto id prefixes and already contains TEST PANEL for PNL, so "R&D
            PART" would immediately raise "is an R&D test panel an R&D part or a
            test panel?". R&D is an adjective on a class, so it prints as its own
            tag. */""}
      ${L.id ? `<div class="lbl-rid"><span>${esc(L.id)}</span>${L.rnd ? '<span class="lbl-rnd">R&amp;D</span>' : ""}</div>` : ""}
      <div class="lbl-r2">${esc(L.key)}</div>
      ${t.merge ? "" : `<div class="lbl-r3">${esc(L.mid)}</div>`}
      <div class="lbl-r4"><span>${esc(foot)}</span><span class="lbl-feb">FEB</span></div>
    </div>
    <div class="lbl-code">${qr}</div>
  </div>`;
}

/* The stack, in the ~40 characters line 3 affords.
 *
 * `stackNote` on the retro SN5 work orders is prose, not a stack: it reads
 * `tracker shorthand: "195 88 .125 NOMEX" — ply order/orientations not recorded
 * (retro)`. Printed whole it fills the most valuable line on the label with the
 * word "shorthand" and truncates before the part anyone needs. The useful
 * content is the quoted fragment, so take that when it is there.
 *
 * Failing that, build from the real plies and collapse runs: five plies of
 * 195 twill print as "5X 195 TWILL", which is the CS-002 shorthand the team
 * already writes by hand.
 */
function stackLine(o) {
  const quoted = String(o.stackNote || "").match(/"([^"]+)"/);
  if (quoted) return quoted[1].toUpperCase();

  const plies = (o.layupStack || []).map(l => String(l.material || "").trim()).filter(Boolean);
  if (plies.length) {
    const runs = [];
    for (const m of plies) {
      const last = runs[runs.length - 1];
      if (last && last.m === m) last.n++; else runs.push({ m, n: 1 });
    }
    return runs.map(r => (r.n > 1 ? `${r.n}X ` : "") + r.m).join(" + ").toUpperCase();
  }
  return String(o.stackNote || "").toUpperCase();
}

// Per-class content. Everything is already uppercase on the label, so these
// build plain strings and the CSS does no text-transform (transform would lie
// about the width at layout time and overflow: hidden would clip the wrong
// amount).
function labelLines(coll, o, p) {
  const j = (...a) => a.filter(x => x !== "" && x != null).join(" · ");
  const up = s => String(s || "").toUpperCase();

  if (coll === "molds") {
    return {
      name: up(o.name || o.partName),
      key: j(o.sealedDate ? `SEALED ${o.sealedDate}` : "", o.sealedBy ? up(o.sealedBy) : "",
             o.uses != null ? `USES ${String(o.uses).padStart(2, "0")}` : "", o.rev ? `REV ${up(o.rev)}` : ""),
      mid: j(o.density ? `${canonDensity(o.density) ?? o.density} PCF` : "", up(o.layers), up(o.sealingType)),
      // Short because it competes with board and location for one 7pt line, and
      // the full rule lives in CS-001. "40MM" is the number someone needs while
      // holding a roll of tacky tape; the reasoning is not.
      foot: j(up(o.board), up(o.location), "KEEP-OUT 40MM")
    };
  }
  if (coll === "parts" || (coll === "items" && (o.cls === "CP" || o.cls === "PNL"))) {
    return {
      name: up(o.partName || o.name),
      key: up(o.layupSchedule || o.stack || ""),                 // the PP-09 answer
      mid: j(up(o.layupType || o.process), up(o.mold || o.moldRef), up(o.workOrderId || o.wo)),
      foot: j(o.laidOn ? `LAID ${o.laidOn}` : "", up(o.by), o.weightG ? `${o.weightG}G` : "", up(o.subteam))
    };
  }
  if (coll === "rnd") {
    /* A STUDY labels the bag. What you need while holding it in March is what
       the test was and how many pieces should be inside — a count that does not
       match what is in the bag is itself information. */
    if (o.cls === "RDS") {
      const n = lblCouponCount(o);
      return {
        name: up(o.name),
        key: j(up(lblStudyMat(o, "stack")), n ? `${n} COUPON${n === 1 ? "" : "S"}` : ""),
        mid: j(up(lblStudyMat(o, "fabricLots")), up(lblStudyMat(o, "resinLot"))),
        foot: j(o.createdOn ? `MADE ${o.createdOn}` : "", up(lblWho(o.createdBy)), up(o.status)),
      };
    }
    /* A COUPON leads with its STUDY, not its own number. In a tray of forty
       from three studies, "C03" identifies nothing — and nameTier drops to two
       lines past 20 characters, which is exactly what a study name plus a
       coupon number costs and what that ladder is there for. */
    return {
      name: up(j(lblStudyName(o), o.label)),
      key: up(lblEff(o, "stack")),                      // the PP-09 answer, same as a panel
      mid: j(up(lblEff(o, "fabricLots")), up(lblEff(o, "resinLot"))),
      foot: j(o.laidOn ? `LAID ${o.laidOn}` : "", up(lblWho(lblEff(o, "by"))), up(o.status)),
    };
  }
  if (coll === "lots") {
    return {
      name: up(o.name || o.material),
      key: j(up(o.ratio), up(o.role)),
      mid: j(o.vendorLot ? `LOT ${up(o.vendorLot)}` : "", o.openedOn ? `OPENED ${o.openedOn}` : ""),
      foot: j(o.receivedOn ? `RECD ${o.receivedOn}` : "", o.expiresOn ? `EXP ${o.expiresOn}` : "", up(o.location))
    };
  }
  if (coll === "items" && o.cls === "BIN") {
    /* The front-edge shelf label CS-001 §7.10 asks for. Before this branch a
       BIN fell through to the board layout and printed mostly blank lines. */
    return {
      name: up(o.name),
      key: "STORAGE",
      mid: j(up(o.site), up(o.locKind), o.flam === "Yes" ? "FLAMMABLES OK" : ""),
      foot: o.walkedAt ? `CONTENTS CONFIRMED ${o.walkedAt}` : "SCAN TO SEE CONTENTS"
    };
  }
  if (coll === "workOrders") {
    return {
      name: up(o.partName),
      key: stackLine(o),
      // humanProcess() turns MoldInfusion into "Mold infusion". Without it the
      // label prints the raw enum, which is how the seed data reads.
      mid: j(up(typeof humanProcess === "function" ? humanProcess(o.processType) : o.processType),
             up(o.mold && o.mold.moldId), o.revision ? `REV ${up(o.revision)}` : ""),
      foot: j(o.createdDate ? `OPENED ${o.createdDate}` : "", up(o.subteam), up(o.status))
    };
  }
  // stock (BRD) and anything else: dimensions are the identity. A real board
  // stores each dimension as {value, unit} (stock.js stores as-entered); the
  // raw object printed "[object Object]" on the label, which the old flat-
  // number test fixture could not see. Formatted here rather than through
  // stock.js's fmtDim, because test_labels mounts this file without stock.js.
  const dim = d => d == null ? ""
    : typeof d === "object" ? `${Math.round((d.value || 0) * 1000) / 1000}${d.unit === "mm" ? "MM" : "″"}`
    : String(d);
  return {
    name: up(o.label || o.name || p.cls),
    key: o.density ? `${canonDensity(o.density) ?? o.density} PCF` : "",
    mid: j(o.len && o.wid ? `${dim(o.len)} X ${dim(o.wid)} X ${dim(o.thk) || "?"}` : "", o.qty ? `QTY ${o.qty}` : ""),
    foot: j(up(o.origin || o.originLegacy), up(o.location || o.label))
  };
}

/* ---------- a sheet of them ---------- */

/* Avery 5161: 1 x 4 in, 20 per sheet, 2 columns x 10 rows.
 * Avery 5522 WeatherProof polyester: 1-1/3 x 4 in, 14 per sheet, 2 x 7.
 *
 * Deliberately does NOT use print.js's fitSheetHtml(), LAYOUTS or MAX_PAGES.
 * Those exist to squeeze a work order into two pages via a nine-rung layout
 * ladder and mean nothing for a fixed grid. This calls mountSheet() directly,
 * the same way drawings.js does for multi-page drawings.
 */
const LABEL_GRIDS = {
  "5161": { cols: 2, rows: 10, w: 4, h: 1, left: 0.15625, top: 0.5, pitchX: 4.1875, pitchY: 1, name: "Avery 5161 · 1 x 4 in · 20 up" },
  "5522": { cols: 2, rows: 7, w: 4, h: 1 + 1 / 3, left: 0.15625, top: 0.5, pitchX: 4.1875, pitchY: 1 + 1 / 3, name: "Avery 5522 WeatherProof · 1-1/3 x 4 in · 14 up" }
};

/* ---------- the roll printer ----------
 *
 * A Brother QL on the shed wifi, printing ONE label when somebody needs one.
 * The Avery path stays exactly as it is: twenty labels a page is the right tool
 * for seeding an inventory, and it is the path that works with no hardware at
 * all. What it is bad at is the steady state, where printing a
 * single label costs a whole sheet unless somebody tracks which cells are used.
 *
 * WHY THE GEOMETRY DOES NOT CHANGE. On a QL the roll's width is fixed and runs
 * ACROSS the print head; the length along the feed is whatever you cut. A 29mm
 * continuous roll therefore gives ~27mm of printable height — and cut at
 * 101.6mm it is the Avery 5161 cell to within a millimetre. That is the same
 * arithmetic the header of this file already ran against 24mm tape, so
 * nameTier, the 21.4mm QR and the 18.8/20.6mm vertical budget all carry over
 * untouched. This is not a coincidence; it is why 4 x 1 in was chosen.
 *
 * DK-1201 die-cut is the hedge, and the ONLY media here that needs new work:
 * 86.6mm of printable length instead of 101.6 costs about 12% of the text
 * track, which is what nameTier's `narrow` argument is for. Buy it only if iOS
 * turns out to refuse a custom page length on continuous stock.
 *
 * 62mm rolls are deliberately absent. On a QL the tape width IS the label
 * height, so 62mm stock gives a 101.6 x 59mm label — not a bigger version of
 * this design but a different one, and a shelf front edge wants a narrow strip
 * anyway. When somebody actually needs one, it gets designed.
 */
const LABEL_ROLLS = {
  dk2210: { wMm: 101.6, hMm: 25.4, qrMm: 21.4, page: "roll2210",
            name: "Brother DK-2210 · 29 mm continuous · cut at 101.6 mm" },
  dk1201: { wMm: 86.6, hMm: 26.4, qrMm: 21.4, narrow: true, page: "roll1201",
            name: "Brother DK-1201 · 29 x 90 mm die-cut" }
};

function isRollMedia(k) { return !!LABEL_ROLLS[k]; }
function labelMediaKnown(k) { return !!(LABEL_GRIDS[k] || LABEL_ROLLS[k]); }
function labelMediaName(k) {
  const m = LABEL_GRIDS[k] || LABEL_ROLLS[k];
  return m ? m.name : "";
}
// Sheets first, then rolls: the order a person picking stock thinks in, and it
// keeps the historical default at the top of every select.
function labelMediaOptions() {
  return Object.keys(LABEL_GRIDS).map(k => [k, LABEL_GRIDS[k].name, "sheet"])
    .concat(Object.keys(LABEL_ROLLS).map(k => [k, LABEL_ROLLS[k].name, "roll"]));
}

/* THE MEDIA PREFERENCE, per device.
 *
 * The shed iPad is set to the roll once and every Label button in the app
 * honours it; somebody printing a seeding sheet from a laptop at home is
 * unaffected. That is localStorage and not Firestore for the reason core.js
 * gives about drafts — a private per-browser thing has no business syncing to
 * the team database — and because "which printer is in front of me" is a fact
 * about the device, not about the team.
 *
 * config/labels is only the fallback for a device nobody has set, so a new
 * phone at the bench gets the right media without anyone configuring it. It is
 * read DEFENSIVELY on purpose: config keys are lead-write / roster-read and
 * config/labels is not on the guest allowlist in firestore.rules, so a
 * signed-out reader is denied it. A preference lookup must never be the reason
 * a label fails to preview, so every path here falls back to the Avery sheet.
 */
/* A LEXICAL binding and not window.LABEL_MEDIA_TEAM, which is what every other
   config cache in the app uses (window.RESTOCK_OVERRIDES and friends). Those
   live in files that only ever load in a browser. This one loads in
   tools/test_qr.mjs's bare vm sandbox, where `window` does not exist and a
   top-level reference to it is a ReferenceError that takes the whole QR suite
   down with it. Same reason lblIsRnd and the R&D accessors above are guarded. */
const LABEL_MEDIA_KEY = "feb-label-media";
let LABEL_MEDIA_TEAM = null;
let labelMediaFetched = false;

function loadLabelMedia() {
  if (labelMediaFetched || typeof window === "undefined" || !window.fb) return;
  if (fb.state !== "ready" || !fb.getConfig) return;
  labelMediaFetched = true;
  fb.getConfig("labels").then(d => {
    if (d && labelMediaKnown(d.media)) { LABEL_MEDIA_TEAM = d.media; render(); }
  }).catch(() => {});
}

function labelMedia() {
  let v = "";
  try { v = localStorage.getItem(LABEL_MEDIA_KEY) || ""; } catch (e) { v = ""; }
  if (!labelMediaKnown(v)) v = labelMediaKnown(LABEL_MEDIA_TEAM) ? LABEL_MEDIA_TEAM : "5161";
  return v;
}

function setLabelMedia(k) {
  if (!labelMediaKnown(k)) return;
  try { localStorage.setItem(LABEL_MEDIA_KEY, k); } catch (e) { /* private mode: this print only */ }
}

/* One label's markup, whatever produced it. `markup` is how a custom label —
   which has no collection and no record — rides the same sheet and roll
   builders as everything else. */
function labelCellHtml(r, opts) {
  if (!r) return "";
  if (r.markup) return r.markup;
  return labelHtml(r.coll, r.o, opts);
}

/* Browsers silently apply "Fit to page" scaling, which shifts every label on
 * the sheet by a few millimetres and ruins registration on $30 polyester. A
 * 100mm bar someone can put a steel rule against is ten seconds and catches it.
 */
function calibrationCellHtml() {
  return `<div class="lbl lbl-cal">
    <div class="lbl-calbar"><span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span>
      <span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span>
      <span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span><span class="lbl-caltick"></span></div>
    <div class="lbl-calnote">MEASURE ME — must be exactly 100 mm.<br>If not, set printer scaling to 100% / Actual Size.</div>
  </div>`;
}

/* recs: [{coll, o}]. skip: leave N cells blank at the start so a part-used
 * sheet gets consumed instead of binned. calibrate: burn one cell on the ruler.
 */
function labelSheetHtml(recs, opts) {
  opts = opts || {};
  const g = LABEL_GRIDS[opts.grid || "5161"];
  const per = g.cols * g.rows;
  const qrMm = opts.grid === "5522" ? 27 : 21.4;

  const cells = [];
  for (let i = 0; i < (opts.skip || 0); i++) cells.push("");
  if (opts.calibrate !== false) cells.push(calibrationCellHtml());
  for (const r of recs) cells.push(labelCellHtml(r, { qrMm }));

  const pages = [];
  for (let i = 0; i < cells.length; i += per) {
    const slice = cells.slice(i, i + per);
    const inner = slice.map((html, k) => {
      const col = k % g.cols, row = Math.floor(k / g.cols);
      const x = g.left + col * g.pitchX, y = g.top + row * g.pitchY;
      return `<div class="label-cell" style="left:${x}in;top:${y}in;width:${g.w}in;height:${g.h}in">${html}</div>`;
    }).join("");
    pages.push(`<div class="ws-page label-sheet" data-grid="${esc(opts.grid || "5161")}">${inner}</div>`);
  }
  // Same .wsheet wrapper print.js uses, so the --hair/--heavy/--shade vars and
  // the box-sizing reset apply here too. .labels only adds the grid geometry.
  return `<div class="wsheet labels">${pages.join("")}</div>`;
}

/* A roll: one page per label, no grid arithmetic, no start-at-cell, no
 * calibration bar. All three are sheet concepts. Start-at-cell exists because
 * an Avery sheet is wasted if you print three labels onto twenty cells, which
 * is the entire problem a roll does not have; and the calibration bar exists
 * because a browser's silent "Fit to page" shifts every cell in a grid, which
 * on a roll shows up as the LABEL itself being the wrong length. So the label
 * is its own ruler here: measure a printed one against a steel rule, which is
 * the check either path wants before a session of printing.
 *
 * The page class is `roll-page` and deliberately NOT `ws-page`. print.js's
 * sheetFileHtml() injects `@media print { .ws-page { padding: 0 0.45in } }`
 * into every SAVED sheet — 0.45in of padding either side of a 101.6mm label
 * leaves nothing. The preview would look right and the saved file, which is the
 * copy that gets printed at the bench with no wifi, would not.
 */
const LABEL_COPIES_MAX = 50;

function labelCopies(v) {
  return Math.max(1, Math.min(LABEL_COPIES_MAX, parseInt(v, 10) || 1));
}

function labelRollHtml(recs, opts) {
  opts = opts || {};
  const key = LABEL_ROLLS[opts.media] ? opts.media : "dk2210";
  const m = LABEL_ROLLS[key];
  const copies = labelCopies(opts.copies);

  const pages = [];
  for (const r of recs) {
    const html = labelCellHtml(r, { qrMm: m.qrMm, narrow: !!m.narrow });
    if (!html) continue;                       // a record with no class word
    for (let i = 0; i < copies; i++) {
      pages.push(`<div class="roll-page" data-media="${esc(key)}">${html}</div>`);
    }
  }
  // Same .wsheet wrapper the sheet path uses, so the --hair/--heavy/--shade
  // vars and the box-sizing reset apply here too.
  return `<div class="wsheet rolls">${pages.join("")}</div>`;
}

/* recs: [{coll, o}] or [{markup}]. Media comes from the caller, else the
   device preference — which is what makes every existing Label button print to
   the roll once the shed iPad has been set, with no change at its call site. */
function openLabelPreview(recs, opts) {
  opts = opts || {};
  const media = labelMediaKnown(opts.media) ? opts.media
    : labelMediaKnown(opts.grid) ? opts.grid          // pre-roll callers
      : labelMedia();
  const roll = isRollMedia(media);
  const html = roll
    ? labelRollHtml(recs, Object.assign({}, opts, { media }))
    : labelSheetHtml(recs, Object.assign({}, opts, { grid: media }));
  const n = recs.length * (roll ? labelCopies(opts.copies) : 1);
  mountSheet(html, true, `${n} label${n === 1 ? "" : "s"} · ${labelMediaName(media)}`, `labels-${today()}`);
  /* mountSheet() puts the sheet in #printroot but does NOT reveal it: the
     screen-side switch is `body.previewing #app { display: none }`, and every
     caller adds that class itself (print.js:409 and :422, drawings.js:1188).
     Without this line the sheet mounts correctly, every DOM assertion passes,
     and the user sees the page they were already on. */
  document.body.classList.add("previewing");
}

// One button, four call sites (work orders, parts, stock, molds), so the markup
// can't drift between them.
function labelBtn(coll, id) {
  return `<button class="ib" onclick="printOneLabel('${esc(coll)}','${esc(id)}')" title="Print a 4x1 label">${icon("print", 15)} Label</button>`;
}

function printOneLabel(coll, id) {
  const o = recById(coll, id);
  if (!o) { toast("Record not found.", "error"); return; }
  openLabelPreview([{ coll, o }]);
}

/* ---------- batch: a sheet of labels for a set of records ----------
 *
 * The start-position picker is the feature that pays here. Avery 5161 is 20 up,
 * so printing three labels onto a fresh sheet throws away seventeen. Being able
 * to say "start at cell 8" means a part-used sheet gets finished instead of
 * binned, which roughly halves the real cost per label on the paper path.
 */

// Which collections can produce a label at all, in the order a person would
// think of them. Tickets and budget are absent on purpose: they are not
// physical objects, which is also what keeps PROJ- codes off a label sheet
// where they could be misread as P-.
const LABELABLE = [
  ["molds", "Molds"],
  ["parts", "Parts"],
  ["workOrders", "Work orders"],
  ["stock", "Tooling board"],
  ["items", "Panels & items"],
  ["lots", "Material lots"],
  ["rnd", "R&D studies & coupons"],
];

let LB = { coll: "parts", picked: {}, skip: 0, media: "5161", cal: true, copies: 1 };

/* `ids` preselects a set, for the caller that already knows which records are
   new — the cut commit's undo bar, which is the one moment anybody knows which
   offcuts came off today. Without it you are hunting BRD numbers in a list of
   sixty. */
function openLabelBuilder(coll, ids) {
  // Opens on the device's media, so the shed iPad lands on the roll and a
  // laptop seeding an inventory lands on the sheet, without either having to
  // remember to change it.
  const picked = {};
  (ids || []).forEach(id => { picked[id] = true; });
  LB = { coll: coll || "parts", picked, skip: 0, media: labelMedia(), cal: true, copies: 1 };
  openModal(labelBuilderHtml());
}

function labelBuilderHtml() {
  const avail = LABELABLE.filter(([c]) => (DB[c] || []).length);
  if (!avail.length) return `<h3>Labels</h3><p class="muted">Nothing to label yet.</p>
    <div class="foot"><button onclick="closeModal()">Close</button></div>`;
  if (!avail.some(([c]) => c === LB.coll)) LB.coll = avail[0][0];

  if (!labelMediaKnown(LB.media)) LB.media = "5161";

  const rows = (DB[LB.coll] || []).slice()
    .sort((a, b) => cmpId(a.id, b.id));
  const n = Object.values(LB.picked).filter(Boolean).length;
  const roll = isRollMedia(LB.media);
  const per = roll ? 0 : LABEL_GRIDS[LB.media].cols * LABEL_GRIDS[LB.media].rows;
  const used = roll ? 0 : n + LB.skip + (LB.cal ? 1 : 0);
  const total = roll ? n * labelCopies(LB.copies) : n;

  return `<h3>Print labels</h3>
  <div class="field"><label>What</label>
    <select onchange="LB.coll=this.value;LB.picked={};lbRefresh()">
      ${avail.map(([c, lab]) => `<option value="${c}" ${c === LB.coll ? "selected" : ""}>${esc(lab)} (${(DB[c] || []).length})</option>`).join("")}
    </select></div>
  <div class="field"><label>Media</label>
    <select onchange="LB.media=this.value;lbRefresh()">
      ${labelMediaOptions().map(([k, name]) => `<option value="${k}" ${k === LB.media ? "selected" : ""}>${esc(name)}</option>`).join("")}
    </select></div>
  ${/* Start-at-cell and the calibration bar are SHEET concepts and are hidden
        rather than disabled on a roll, because both answer questions a roll does
        not ask. Start-at-cell exists so a part-used Avery sheet gets finished
        instead of binned; a roll has no cells to waste. The bar catches the
        browser's silent "Fit to page", which on a grid shifts every label and on
        a roll simply makes the label the wrong length — so the label is its own
        ruler and the check moves to measuring one. */""}
  ${roll ? `
  <div class="field"><label>Copies of each</label>
    <input type="number" min="1" max="${LABEL_COPIES_MAX}" value="${labelCopies(LB.copies)}"
      onchange="LB.copies=labelCopies(this.value);lbRefresh()">
    <div class="muted tny">Two is the usual ask at demould — one for the part, one for the bag.</div>
  </div>` : `
  <div class="field"><label>Start at cell</label>
    <input type="number" min="1" max="${per}" value="${LB.skip + 1}"
      onchange="LB.skip=Math.max(0,Math.min(${per - 1},(parseInt(this.value,10)||1)-1));lbRefresh()">
    <div class="muted tny">Leave blank cells at the top so a part-used sheet gets finished instead of binned.</div>
  </div>
  <label class="chk"><input type="checkbox" ${LB.cal ? "checked" : ""} onchange="LB.cal=this.checked;lbRefresh()">
    Include the 100 mm calibration bar <span class="muted tny">(catches the browser's silent "Fit to page" scaling)</span></label>`}
  <div class="lbpick">
    <div class="toolbar no-print" style="margin:6px 0">
      <button class="sm" onclick="lbAll(true)">Select all</button>
      <button class="sm" onclick="lbAll(false)">None</button>
      <span class="muted" style="margin-left:auto;align-self:center">${n} selected · ${roll
        ? `${total} label${total === 1 ? "" : "s"} off the roll`
        : `${Math.ceil(Math.max(used, 1) / per)} sheet${used > per ? "s" : ""}`}</span>
    </div>
    <div class="lblist">${rows.map(o => `<label class="chk"><input type="checkbox" ${LB.picked[o.id] ? "checked" : ""}
      onchange="LB.picked['${esc(o.id)}']=this.checked;lbRefresh()"> <b>${esc(o.id)}</b>
      <span class="muted">${esc(o.partName || o.name || o.label || "")}</span>${rndBadge(recIsRnd(LB.coll, o))}</label>`).join("")}</div>
  </div>
  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" ${n ? "" : "disabled"} onclick="lbPrint()">Preview ${n || ""} label${n === 1 ? "" : "s"}</button>
  </div>`;
}

// Re-render in place. The modal is rebuilt rather than diffed, which is what
// every other picker in the app does; the list is short enough that it is free.
function lbRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = labelBuilderHtml();
}
function lbAll(on) {
  (DB[LB.coll] || []).forEach(o => { LB.picked[o.id] = on; });
  lbRefresh();
}
function lbPrint() {
  const recs = (DB[LB.coll] || [])
    .filter(o => LB.picked[o.id])
    .sort((a, b) => cmpId(a.id, b.id))
    .map(o => ({ coll: LB.coll, o }));
  if (!recs.length) return;
  closeModal();
  openLabelPreview(recs, { skip: LB.skip, media: LB.media, calibrate: LB.cal, copies: LB.copies });
}

/* ---------- a label with nothing behind it ----------
 *
 * Not every label is a record. A shelf edge says SOLVENT CABINET, a bin lid
 * says SCRAP CARBON — KEEP, a jig says DO NOT CUT. Those are real labels with
 * no ID, no QR and no row in Firestore, and until now the only way to make one
 * was a Sharpie, which is how a shed ends up with handwriting nobody can read
 * and no two labels that look alike.
 *
 * It renders through labelMarkup() like everything else, so a custom label is a
 * record label minus the record: same type ladder, same FEB tag, same stock,
 * same printer. What it must never be is a record label that ISN'T one — see
 * clProblem(), which is the only real logic in this section.
 */

let CL = { name: "", id: "", key: "", foot: "", qr: "", media: "", copies: 1 };

const CL_RECENT_KEY = "feb-label-custom";

/* The id grammar the app itself mints (core.js allocId), deliberately loose:
   this is a NET, not a parser.
   It should catch anything a person could mistake for a tracked id, including
   prefixes that do not exist yet, because the failure it guards against is a
   human reading the label and not a machine parsing it. */
const CL_ID_SHAPE = /^[A-Z]+-SN\d+-\d+$/;

function openCustomLabel(seed) {
  CL = Object.assign({ name: "", id: "", key: "", foot: "", qr: "", media: labelMedia(), copies: 1 }, seed || {});
  if (!labelMediaKnown(CL.media)) CL.media = labelMedia();
  openModal(clHtml());
}

/* Everything a custom label is not allowed to be, in the order a person would
 * hit it. Returns a sentence to show, or null.
 *
 * THE ONE THAT MATTERS is the id-shaped second line. This whole subsystem
 * exists because SN5 had no ID column and a part's NAME was its primary key, so
 * the strings disagreed between sheets and seventeen tensile CSVs identify a
 * specimen by a trailing integer and nothing else (the header of this file). A
 * hand-typed label reading MOLD-SN6-011 that no record answers to puts that
 * failure straight back — worse than before, because it now looks official. So
 * a made-up id is refused outright, and a REAL id is refused too and redirected
 * to the record's own Label button, which prints the identifying fact and a QR
 * that resolves rather than four words somebody remembered.
 */
function clProblem() {
  const name = String(CL.name || "").trim();
  const id = String(CL.id || "").trim().toUpperCase();
  const key = String(CL.key || "").trim();
  const foot = String(CL.foot || "").trim();
  if (!name && !id && !key && !foot) return "Type something for the label to say.";

  if (CL_ID_SHAPE.test(id)) {
    if (clFindRecord(id)) {
      return `${id} is a real record. Open it and use its own Label button — that prints the `
        + `identifying fact and a QR that resolves. A typed copy of an id is not the record.`;
    }
    return `${id} looks like a tracked id and nothing in the app answers to it. A label that reads `
      + `like a record but isn't one is the exact failure this system was built to end — create the `
      + `record first, or write something that isn't id-shaped.`;
  }

  return clQrTrouble();
}

/* Which record, if any, owns an id. Walks DB rather than going through
   ID_TO_COLL so a collection added later is covered without this having to
   remember, and guarded so the file still loads in tools/test_qr.mjs's bare
   sandbox, where there is no DB at all. */
function clFindRecord(id) {
  if (typeof DB !== "object" || !DB || !id) return null;
  const want = String(id).toUpperCase();
  for (const coll of Object.keys(DB)) {
    const arr = DB[coll];
    if (!Array.isArray(arr)) continue;
    const o = arr.find(x => x && String(x.id).toUpperCase() === want);
    if (o) return { coll, o };
  }
  return null;
}

/* Why a QR would not scan, in words, BEFORE it is printed.
 *
 * qrSvg() throws on both of these, and a throw is right for a record label
 * where the input is generated and a bad one is a bug. Here the input is typed
 * by a person, so the same two facts have to arrive as an explanation instead:
 * the charset, because alphanumeric mode is the whole reason our codes stay at
 * 29 modules; and the density, because a long string at a fixed size shrinks
 * the modules until a phone camera cannot resolve them — and nothing about the
 * printed label looks wrong when that happens.
 */
function clQrTrouble() {
  const t = String(CL.qr || "").trim().toUpperCase();
  if (!t) return null;

  const bad = t.split("").filter(c => !QR_ALNUM.test(c));
  if (bad.length) {
    const uniq = bad.filter((c, i) => bad.indexOf(c) === i).slice(0, 6).join(" ");
    return `The code can't carry ${uniq}. QR alphanumeric mode is 0-9 A-Z space and $ % * + - . / : — `
      + `anything else costs a version and an error-correction level.`;
  }
  const mm = clMedia().qrMm || 21.4;
  try {
    const q = qrcode(0, "Q");
    q.addData(t, "Alphanumeric");
    q.make();
    const per = mm / (q.getModuleCount() + 8);      // + 4 modules of quiet zone each side
    if (per < 0.4) {
      return `${t.length} characters makes a ${q.getModuleCount()}-module code, which at ${mm} mm is `
        + `${per.toFixed(2)} mm per module — under the 0.4 mm a phone camera needs. Shorten it.`;
    }
  } catch (e) { return "That text can't be encoded as a QR."; }
  return null;
}

/* Not a problem, but worth saying out loud.
 *
 * The code is uppercased before encoding, which is the whole reason our QRs sit
 * at 29 modules with 25% error recovery instead of 33 with 15% (the header of
 * this file). For plain text that is free. For a URL it is free for the scheme
 * and the host, which RFC 3986 makes case-insensitive, and NOT free for the
 * path — a link to /Docs/Setup.pdf becomes /DOCS/SETUP.PDF and may 404.
 *
 * Said rather than refused, because what people actually put on a shed label is
 * plain text, and rejecting lowercase would make the field useless for the
 * common case in order to protect the rare one.
 */
function clAdvice() {
  const raw = String(CL.qr || "").trim();
  if (!raw || raw === raw.toUpperCase() || clQrTrouble()) return null;
  return /\/\/[^/]+\/./.test(raw)
    ? `The code will read ${raw.toUpperCase()} — uppercase is what keeps it at 29 modules. `
      + `The scheme and host don't care about case; a path might.`
    : `The code will be uppercased, which is what keeps it coarse enough to scan with resin on it.`;
}

// The chosen media's geometry, whichever family it came from.
function clMedia() {
  return LABEL_ROLLS[CL.media] || { qrMm: CL.media === "5522" ? 27 : 21.4, narrow: false };
}

function clMarkup() {
  const m = clMedia();
  return labelMarkup({
    name: String(CL.name || "").toUpperCase(),
    id: String(CL.id || "").trim().toUpperCase(),
    key: String(CL.key || "").toUpperCase(),
    mid: "",
    foot: String(CL.foot || "").toUpperCase(),
    // A code that would not scan is not drawn, so the preview never shows one
    // that the print would drop. clQrTrouble() says why, underneath.
    qr: clQrTrouble() ? "" : String(CL.qr || "").trim().toUpperCase()
  }, { qrMm: m.qrMm, narrow: !!m.narrow });
}

/* The preview, at print size. print.css is a plain stylesheet and deliberately
   not wrapped in @media print (DESIGN-NOTES: "so the sheet renders identically
   on screen and on paper"), so .lbl and .roll-page style this for free and what
   is in the modal is the label. */
function clPreviewHtml() {
  const say = clProblem() || clAdvice();
  const key = isRollMedia(CL.media) ? CL.media : "dk2210";
  return `<div class="cl-prev"><div class="wsheet rolls">
      <div class="roll-page" data-media="${esc(key)}">${clMarkup()}</div>
    </div></div>
    <div class="cl-warn muted tny">${say ? esc(say) : "&nbsp;"}</div>`;
}

/* Only the preview repaints while somebody types. Everywhere else in the app a
   picker modal rebuilds itself whole (lbRefresh), which is free when the
   controls are checkboxes and selects; here they are text inputs and a full
   rebuild takes the caret with it on every keystroke. */
function clPreview() {
  const host = document.getElementById("cl-preview");
  if (host) host.innerHTML = clPreviewHtml();
}
function clRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = clHtml();
}

function clHtml() {
  const roll = isRollMedia(CL.media);
  const recent = clRecent();
  return `<h3>Custom label</h3>
  <p class="muted tny">A label with no record behind it — a shelf, a cabinet, a warning.
    Anything the app already tracks should be labelled from its own record instead.</p>

  <div id="cl-preview">${clPreviewHtml()}</div>

  <div class="field"><label>Name</label>
    <input id="cl-name" value="${esc(CL.name)}" autofocus maxlength="72"
      oninput="CL.name=this.value;clPreview()">
    <div class="muted tny">The big line, read from across the shed.</div></div>
  <div class="field"><label>Second line</label>
    <input id="cl-id" value="${esc(CL.id)}" maxlength="24"
      oninput="CL.id=this.value;clPreview()">
    <div class="muted tny">Optional. Where a record's ID would sit — so it can't be one.</div></div>
  <div class="field"><label>Key line</label>
    <input id="cl-key" value="${esc(CL.key)}" maxlength="48"
      oninput="CL.key=this.value;clPreview()">
    <div class="muted tny">Bold. The one fact that matters.</div></div>
  <div class="field"><label>Footer</label>
    <input id="cl-foot" value="${esc(CL.foot)}" maxlength="60"
      oninput="CL.foot=this.value;clPreview()">
    <div class="muted tny">Optional. Smallest line, next to the FEB mark.</div></div>
  <div class="field"><label>QR</label>
    <input id="cl-qr" value="${esc(CL.qr)}" maxlength="200" placeholder="leave blank for no code"
      oninput="CL.qr=this.value;clPreview()">
    <div class="muted tny">Optional. Uppercased when encoded; no ? # &amp; or _.</div></div>

  <div class="field"><label>Media</label>
    <select onchange="CL.media=this.value;clRefresh()">
      ${labelMediaOptions().map(([k, name]) => `<option value="${k}" ${k === CL.media ? "selected" : ""}>${esc(name)}</option>`).join("")}
    </select></div>
  ${roll ? `<div class="field"><label>Copies</label>
    <input type="number" min="1" max="${LABEL_COPIES_MAX}" value="${labelCopies(CL.copies)}"
      onchange="CL.copies=labelCopies(this.value);clPreview()"></div>` : ""}

  ${recent.length ? `<div class="field"><label>Print one again</label>
    <div class="toolbar no-print" style="flex-wrap:wrap;gap:5px">
      ${recent.map((r, i) => `<button class="sm" onclick="clUseRecent(${i})">${esc(String(r.name || r.key || r.foot || "—").slice(0, 22))}</button>`).join("")}
    </div></div>` : ""}

  <div class="foot">
    <button onclick="closeModal()">Cancel</button>
    <button class="primary" onclick="clPrint()">Preview</button>
  </div>`;
}

function clPrint() {
  const problem = clProblem();
  if (problem) { toast(problem, "error"); return; }
  const markup = clMarkup();
  clRemember({ name: CL.name, id: CL.id, key: CL.key, foot: CL.foot, qr: CL.qr });
  closeModal();
  openLabelPreview([{ markup }], { media: CL.media, copies: CL.copies });
}

/* Recents are per device and per browser, like the media preference and for the
   same reason: which labels THIS person reprints is not team data. Ten, because
   the list is a row of buttons in a modal and a longer one stops being faster
   than retyping. */
function clRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(CL_RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch (e) { return []; }
}
function clRemember(entry) {
  const same = x => x && x.name === entry.name && x.id === entry.id
    && x.key === entry.key && x.foot === entry.foot && x.qr === entry.qr;
  const list = [entry].concat(clRecent().filter(x => !same(x))).slice(0, 10);
  try { localStorage.setItem(CL_RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
}
function clUseRecent(i) {
  const r = clRecent()[i];
  if (!r) return;
  CL = Object.assign({}, CL, r);
  clRefresh();
}

// The sibling of labelBtn(): one button, every call site, so the markup can't
// drift between them.
function customLabelBtn() {
  return `<button class="ib" onclick="openCustomLabel()" title="Print a label with typed text">${icon("print", 15)} Custom label</button>`;
}

/* ---------- which printer is in front of you ----------
 *
 * Two settings that look alike and are not. The DEVICE setting is what every
 * Label button in this browser will use, and it is the one that matters day to
 * day. The TEAM default only seeds a device nobody has set, so a phone that
 * walks into the shed for the first time prints to the roll instead of
 * producing an Avery sheet for a printer that isn't there.
 */
function openLabelSetup() { openModal(labelSetupHtml()); }

function labelSetupHtml() {
  const dev = labelMedia();
  const lead = typeof isLead === "function" && isLead();
  const team = LABEL_MEDIA_TEAM;
  return `<h3>Label media</h3>
  <div class="field"><label>This device prints to</label>
    <select onchange="setLabelMedia(this.value);lsRefresh()">
      ${labelMediaOptions().map(([k, name]) => `<option value="${k}" ${k === dev ? "selected" : ""}>${esc(name)}</option>`).join("")}
    </select>
    <div class="muted tny">Every Label button in this browser uses it. Stored on this device only —
      the phone at the bench and a laptop at home can differ, which is the point.</div>
  </div>
  <div class="field"><label>Team default</label>
    ${lead
      ? `<select onchange="saveLabelTeamMedia(this.value)">
           ${labelMediaOptions().map(([k, name]) => `<option value="${k}" ${k === team ? "selected" : ""}>${esc(name)}</option>`).join("")}
         </select>
         <div class="muted tny">What a device that has never been set will use. Does not change anyone's existing choice.</div>`
      : `<div class="muted">${esc(labelMediaName(team) || "not set")} <span class="tny">— leads set this.</span></div>`}
  </div>
  <p class="muted tny">The roll printer is a Brother QL on the shed wifi, discovered by the phone's own
    print dialog (AirPrint), so there is no address to type here — if it doesn't appear in the dialog it
    is off the network, not misconfigured in the app.</p>
  <div class="foot"><button class="primary" onclick="closeModal()">Done</button></div>`;
}

function lsRefresh() {
  const m = document.querySelector("#modal .modal");
  if (m) m.innerHTML = labelSetupHtml();
}

async function saveLabelTeamMedia(k) {
  if (!labelMediaKnown(k)) return;
  try {
    await fb.setConfig("labels", { media: k });
    LABEL_MEDIA_TEAM = k;
    toast(`New devices will default to ${labelMediaName(k)}.`);
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}
