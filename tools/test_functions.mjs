/* test_functions.mjs — the Cloud Functions in 06 Composites App/functions/,
 * run in plain Node with Firebase and the Anthropic client stubbed.
 *
 * WHY STUBS. The real thing needs a deployed function, a secret and a paid
 * model call, none of which belong in a suite that runs on every release.
 * What CAN go wrong locally is the part this file checks: who gets in, which
 * Storage paths and file types are refused, the daily cap, what is sent to the
 * model, and how its answer (or refusal, or truncation) is turned into lines.
 * The SDK's real error classes are used, so the instanceof chain in callHaiku()
 * is exercised for real.
 *
 *   node tools/test_functions.mjs
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FN = path.join(here, "..", "06 Composites App", "functions", "index.js");
const req = createRequire(FN);

if (!existsSync(path.join(path.dirname(FN), "node_modules", "@anthropic-ai", "sdk"))) {
  console.log("SKIP test_functions: functions/node_modules is missing. Run `npm ci` in 06 Composites App/functions/ to test parseReceipt.");
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "  — " + detail : "")); }
};

/* ---------- stubs ---------- */
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const state = {
  roster: new Set(["member@berkeley.edu"]),
  usage: new Map(),
  files: new Map(),
  reply: null,      // what messages.create resolves to
  throwErr: null,   // what messages.create throws
  sent: [],         // every request body
};

const RealSdk = req("@anthropic-ai/sdk");
class FakeAnthropic {
  constructor() {
    this.messages = {
      create: async (body) => {
        state.sent.push(body);
        if (state.throwErr) throw state.throwErr;
        return state.reply;
      },
    };
  }
}
for (const k of ["RateLimitError", "APIConnectionError", "APIError"]) FakeAnthropic[k] = RealSdk[k];
const sdkErr = (cls, status) => Object.assign(Object.create(RealSdk[cls].prototype), { status, message: cls });

/* One flat document store. Roster docs are answered from state.roster;
   everything else (aiUsage/*, config/ai) lives in state.docs, and set() with
   merge understands the increment sentinel the way Firestore does. */
state.docs = state.usage; // aiUsage day docs, month docs and config/ai share it
const INC = Symbol("inc");
const mergeInto = (p, v) => {
  const cur = { ...(state.docs.get(p) || {}) };
  for (const [k, x] of Object.entries(v)) cur[k] = x && x[INC] !== undefined ? (Number(cur[k]) || 0) + x[INC] : x;
  state.docs.set(p, cur);
};
const firestore = {
  doc: (p) => ({
    _p: p,
    get: async () => p.startsWith("roster/")
      ? { exists: state.roster.has(p.slice(7)) }
      : { exists: state.docs.has(p), data: () => state.docs.get(p) },
    set: async (v) => mergeInto(p, v),
  }),
  runTransaction: async (fn) => fn({
    get: async (ref) => ({ exists: state.docs.has(ref._p), data: () => state.docs.get(ref._p) }),
    set: (ref, v) => mergeInto(ref._p, v),
  }),
};
const admin = {
  initializeApp() {},
  firestore: Object.assign(() => firestore, { FieldValue: { serverTimestamp: () => "ts", increment: (n) => ({ [INC]: n }) } }),
  storage: () => ({
    bucket: () => ({
      file: (p) => ({
        getMetadata: async () => {
          if (!state.files.has(p)) throw new Error("404");
          return [state.files.get(p).meta];
        },
        download: async () => [Buffer.from("bytes")],
      }),
    }),
  }),
};

function stub(id, exports) {
  const resolved = req.resolve(id);
  req.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub("firebase-functions/v2/https", { onCall: (_opts, handler) => handler, HttpsError });
stub("firebase-functions/params", { defineSecret: () => ({ value: () => "sk-test" }) });
stub("firebase-admin", admin);
stub("@anthropic-ai/sdk", FakeAnthropic);

const { parseReceipt } = req(FN);

const member = { auth: { token: { email: "member@berkeley.edu" } } };
const call = async (data, who = member) => {
  try { return { ok: true, out: await parseReceipt({ ...who, data }) }; }
  catch (e) { return { ok: false, code: e.code, msg: e.message }; }
};
const reply = (obj, stop = "end_turn") => ({
  stop_reason: stop, usage: { input_tokens: 1500, output_tokens: 200 },
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }],
});
const PHOTO = "budget/abc-123/1700-receipt.jpg";
const PDF = "budget/abc-123/1700-invoice.pdf";
state.files.set(PHOTO, { meta: { contentType: "image/jpeg", size: 200000 } });
state.files.set(PDF, { meta: { contentType: "application/pdf", size: 90000 } });
state.files.set("budget/abc-123/big.jpg", { meta: { contentType: "image/jpeg", size: 11 * 1024 * 1024 } });
state.files.set("budget/abc-123/notes.txt", { meta: { contentType: "text/plain", size: 10 } });

/* ---------- gate ---------- */
console.log("gate");
let r = await call({ path: PHOTO }, { auth: null });
ok("signed out is refused", r.code === "unauthenticated", JSON.stringify(r));
r = await call({ path: PHOTO }, { auth: { token: { email: "stranger@gmail.com" } } });
ok("off the roster is refused", r.code === "permission-denied", JSON.stringify(r));
for (const bad of ["documents/x.pdf", "budget/abc/../roster", "budget/a/b/c.jpg", "", "budget/a b/c.jpg"]) {
  r = await call({ path: bad });
  ok(`path refused: ${JSON.stringify(bad)}`, r.code === "invalid-argument", JSON.stringify(r));
}
r = await call({ path: "budget/abc-123/missing.jpg" });
ok("missing file is not-found", r.code === "not-found", JSON.stringify(r));
r = await call({ path: "budget/abc-123/big.jpg" });
ok("over 10 MiB refused", r.code === "invalid-argument", JSON.stringify(r));
r = await call({ path: "budget/abc-123/notes.txt" });
ok("non-image non-PDF refused", r.code === "invalid-argument", JSON.stringify(r));
ok("nothing sent to the model yet", state.sent.length === 0, String(state.sent.length));
ok("refusals before the model cost no quota", state.docs.size === 0, String([...state.docs.keys()]));

/* ---------- happy path ---------- */
console.log("parse");
state.reply = reply({
  lines: [
    { desc: "  Peel ply 60in  ", qty: "2 yd", total: "$41.90" },
    { desc: "", qty: "1", total: "3.00" },
    { desc: "Shipping", qty: "1", total: "12.5" },
  ],
  vendor: "McMaster-Carr",
  receiptTotal: "$54.40",
});
r = await call({ path: PHOTO });
ok("photo parses", r.ok, JSON.stringify(r));
ok("blank desc dropped, rest kept", r.out && r.out.lines.length === 2, JSON.stringify(r.out));
ok("desc trimmed", r.out && r.out.lines[0].desc === "Peel ply 60in");
ok("qty/total stripped to digits", r.out && r.out.lines[0].qty === "2" && r.out.lines[0].total === "41.90", JSON.stringify(r.out && r.out.lines[0]));
ok("vendor and total passed", r.out && r.out.vendor === "McMaster-Carr" && r.out.receiptTotal === "54.40");
const body = state.sent.at(-1);
ok("model is claude-haiku-5-5", body.model === "claude-haiku-5-5", body.model);
ok("effort is low", body.output_config && body.output_config.effort === "low");
ok("structured output schema sent", body.output_config.format.type === "json_schema" && body.output_config.format.schema.additionalProperties === false);
ok("no thinking param (adaptive default)", !("thinking" in body));
ok("photo sent as image block", body.messages[0].content[0].type === "image");

r = await call({ path: PDF });
ok("PDF parses", r.ok, JSON.stringify(r));
ok("PDF sent as document block", state.sent.at(-1).messages[0].content[0].type === "document");

/* ---------- model outcomes ---------- */
console.log("model outcomes");
state.reply = reply("{}", "refusal");
r = await call({ path: PHOTO });
ok("refusal -> failed-precondition", r.code === "failed-precondition", JSON.stringify(r));
state.reply = reply('{"lines":[{"desc":"x"', "max_tokens");
r = await call({ path: PHOTO });
ok("max_tokens -> out-of-range", r.code === "out-of-range", JSON.stringify(r));
state.reply = reply("not json");
r = await call({ path: PHOTO });
ok("unparseable answer -> internal", r.code === "internal", JSON.stringify(r));
state.throwErr = sdkErr("RateLimitError", 429);
r = await call({ path: PHOTO });
ok("429 -> resource-exhausted", r.code === "resource-exhausted" && /busy/.test(r.msg), JSON.stringify(r));
state.throwErr = sdkErr("APIConnectionError", undefined);
r = await call({ path: PHOTO });
ok("network -> unavailable", r.code === "unavailable", JSON.stringify(r));
state.throwErr = sdkErr("APIError", 500);
r = await call({ path: PHOTO });
ok("other API error -> internal", r.code === "internal" && /500/.test(r.msg), JSON.stringify(r));
state.throwErr = null;

/* ---------- daily cap ---------- */
console.log("daily cap");
const dayKey = [...state.docs.keys()].find(k => /^aiUsage\/member@/.test(k)) || "";
ok("usage doc keyed email_day", /^aiUsage\/member@berkeley\.edu_\d{4}-\d{2}-\d{2}$/.test(dayKey), dayKey);
ok("counted under the photo job", Number(state.docs.get(dayKey).photo) >= 1, JSON.stringify(state.docs.get(dayKey)));
state.docs.set(dayKey, { photo: 49 });
state.reply = reply({ lines: [], vendor: "", receiptTotal: "" });
r = await call({ path: PHOTO });
ok("50th call allowed", r.ok, JSON.stringify(r));
let before = state.sent.length;
r = await call({ path: PHOTO });
ok("51st call refused", r.code === "resource-exhausted" && /Daily limit of 50 reads/.test(r.msg), JSON.stringify(r));
ok("refused call never reaches the model", state.sent.length === before);
state.docs.set(dayKey, { photo: 0, ask: 30 });
r = await call({ path: PHOTO });
ok("a full Ask count does not block photos", r.ok, JSON.stringify(r));

/* ---------- spend ---------- */
console.log("monthly spend");
const monthKey = [...state.docs.keys()].find(k => /^aiUsage\/month_\d{4}-\d{2}$/.test(k)) || "";
const m = state.docs.get(monthKey) || {};
ok("month doc tallies real usage", m.calls >= 1 && m.inTok >= 1500 && m.outTok >= 200, JSON.stringify(m));
const perCall = 1500 * 0.10 / 1e6 + 200 * 0.50 / 1e6;
ok("dollars at Haiku 5.5 rates", Math.abs(m.usd - m.calls * perCall) < 1e-9, `${m.usd} vs ${m.calls * perCall}`);
ok("spend mirrored onto config/ai for leads", Math.abs((state.docs.get("config/ai") || {})[`spend_${monthKey.slice(-7)}`] - m.usd) < 1e-9, JSON.stringify(state.docs.get("config/ai")));
ok("spend split by job", Math.abs(m.by_parseReceipt - m.usd) < 1e-9);

/* ---------- kill switch and budget ---------- */
console.log("off switch and budget");
state.docs.set(dayKey, {});
mergeInto("config/ai", { enabled: false });
before = state.sent.length;
r = await call({ path: PHOTO });
ok("off switch refuses", r.code === "failed-precondition" && /switched off by a lead/.test(r.msg), JSON.stringify(r));
ok("and nothing reaches the model or the counters", state.sent.length === before && !state.docs.get(dayKey).photo);
mergeInto("config/ai", { enabled: true });
r = await call({ path: PHOTO });
ok("back on, works again", r.ok, JSON.stringify(r));
state.docs.set(monthKey, { ...state.docs.get(monthKey), usd: 80 });
before = state.sent.length;
r = await call({ path: PHOTO });
ok("$80 in a month refuses", r.code === "resource-exhausted" && /budget for this month/.test(r.msg), JSON.stringify(r));
ok("before any model call", state.sent.length === before);
state.docs.set(monthKey, { ...state.docs.get(monthKey), usd: 79.99 });
r = await call({ path: PHOTO });
ok("just under still works", r.ok, JSON.stringify(r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
