"use strict";
/* The repo's one backend: a callable that reads a receipt (photo or PDF) and
 * proposes budget line items.
 *
 * WHY A FUNCTION AT ALL. The app is static hosting; parsing needs an
 * Anthropic API key, and a key readable by ~30 rotating students in a
 * Firestore config doc is an open spend faucet (the Slack-webhook precedent
 * does not transfer: a leaked webhook posts noise, a leaked API key spends
 * money). The key lives in a Functions secret, server-side only.
 *
 * WHY IT'S SAFE TO BE DUMB. The client treats the response as a PREFILL of
 * the manual line editor: every cell stays editable, nothing auto-saves,
 * and a failure just leaves the editor empty. So this function has no
 * retries of its own and no state beyond a daily counter, and the feature
 * still works when it is down.
 *
 * ONE CALLABLE PER JOB. callHaiku() is shared, but it is never exported as a
 * general "ask Claude" endpoint. Each callable fixes its own prompt, its own
 * output schema and the one Storage prefix it may read, so a roster member
 * can spend the key on receipts and on nothing else.
 *
 * Deploy (from 06 Composites App/):
 *   firebase functions:secrets:set ANTHROPIC_API_KEY
 *   firebase deploy --only functions
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Haiku 5.5 at low effort: a receipt is a few lines of OCR-adjacent
// extraction, not an essay. About 2k tokens a read, a few hundredths of a
// cent. Thinking is left at the model's default (adaptive); at low effort it
// barely thinks, and turning it off is not an option worth the 400s.
const MODEL = "claude-haiku-5-5";
const EFFORT = "low";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // storage.rules sizeOk() caps uploads at 10 MiB

// Per person per UTC day, per kind of job. Normal use is a handful; these are
// a ceiling on a stuck loop or a leaked session, not a ration. The photo jobs
// (receipt, packing slip, container label) share one count.
const DAILY_CAPS = { photo: 50, ask: 30 };

// The team's monthly ceiling. Simon's Max plan carries $100 a month of API
// credit; refusing at $80 leaves room for calls already in flight and for
// running the eval. Cost is computed from real usage at Haiku 5.5's rates for
// prompts under 100k tokens (every prompt here is), with cache reads and
// writes billed as plain input: an overestimate, which is the safe direction.
const MONTHLY_BUDGET_USD = 80;
const USD_PER_TOKEN = { input: 0.10 / 1e6, output: 0.50 / 1e6 };
const month = () => new Date().toISOString().slice(0, 7);

/* Signed in AND on the roster: the same gate as firestore.rules onRoster(). */
async function requireRoster(req) {
  const email = req.auth && req.auth.token && req.auth.token.email;
  if (!email) throw new HttpsError("unauthenticated", "Sign in first.");
  const roster = await admin.firestore().doc(`roster/${email}`).get();
  if (!roster.exists) throw new HttpsError("permission-denied", "Not on the roster.");
  return email;
}

/* The lead's off switch and the monthly ceiling, checked before anything is
 * fetched or counted. config/ai is lead-written ({ enabled }) and roster-read;
 * a missing doc means on. The month's spend is read from aiUsage, which has no
 * match in firestore.rules, so clients can neither read nor reset it. */
async function requireAiOn() {
  const db = admin.firestore();
  const [cfg, spend] = await Promise.all([
    db.doc("config/ai").get(),
    db.doc(`aiUsage/month_${month()}`).get(),
  ]);
  if (cfg.exists && cfg.data().enabled === false) {
    throw new HttpsError("failed-precondition", "AI features are switched off by a lead.");
  }
  if (spend.exists && Number(spend.data().usd || 0) >= MONTHLY_BUDGET_USD) {
    throw new HttpsError("resource-exhausted", "The team's AI budget for this month is used up. It's back on the 1st.");
  }
}

/* Count this call against the person's day for one kind of job, refusing past
 * that job's cap. One doc per person per day, one counter field per job. */
async function chargeDaily(email, job) {
  const cap = DAILY_CAPS[job];
  const day = new Date().toISOString().slice(0, 10);
  const ref = admin.firestore().doc(`aiUsage/${email}_${day}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const n = (snap.exists && Number(snap.data()[job])) || 0;
    if (n >= cap) {
      const what = job === "ask" ? "questions" : "reads";
      throw new HttpsError("resource-exhausted", `Daily limit of ${cap} ${what} reached. It resets tomorrow.`);
    }
    tx.set(ref, { [job]: n + 1, email, day, at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

/* Add one call's real token usage to the month. The running dollar figure is
 * mirrored onto config/ai as spend_<yyyy-mm> so a lead can see it in the ⋯
 * menu; that doc is roster-readable and a spend total is not a secret. Never
 * throws: a failed tally must not fail a call that already succeeded. */
async function recordSpend(usage, label) {
  const u = usage || {};
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const outTok = u.output_tokens || 0;
  const usd = inTok * USD_PER_TOKEN.input + outTok * USD_PER_TOKEN.output;
  const inc = admin.firestore.FieldValue.increment;
  const m = month();
  try {
    await Promise.all([
      admin.firestore().doc(`aiUsage/month_${m}`).set({ usd: inc(usd), inTok: inc(inTok), outTok: inc(outTok), calls: inc(1), [`by_${label}`]: inc(usd) }, { merge: true }),
      admin.firestore().doc("config/ai").set({ [`spend_${m}`]: inc(usd) }, { merge: true }),
    ]);
  } catch (e) { console.error("recordSpend failed", e && e.message); }
}

/* Fetch one Storage object for the model: an image or a PDF under the size
 * cap, as a content block. Anything else is refused rather than sent. */
async function storageBlock(path) {
  const file = admin.storage().bucket().file(path);
  const [meta] = await file.getMetadata().catch(() => {
    throw new HttpsError("not-found", "No file at that path.");
  });
  const type = String(meta.contentType || "");
  if (Number(meta.size || 0) > MAX_FILE_BYTES) {
    throw new HttpsError("invalid-argument", "File is over 10 MiB.");
  }
  const isImage = /^image\/(jpeg|png|gif|webp)$/.test(type);
  if (!isImage && type !== "application/pdf") {
    throw new HttpsError("invalid-argument", "Needs a JPEG, PNG, WebP or PDF.");
  }
  const [bytes] = await file.download();
  const source = { type: "base64", media_type: type, data: bytes.toString("base64") };
  return isImage ? { type: "image", source } : { type: "document", source };
}

/* One structured-output call to Haiku. Returns the parsed object or throws an
 * HttpsError whose message the client can put straight in a toast. */
async function callHaiku({ content, schema, maxTokens = 2048, label }) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 1, timeout: 45_000 });
  let msg;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    // Most specific first. APIConnectionError is a subclass of APIError in
    // the JS SDK, so it has to be checked before it.
    if (e instanceof Anthropic.RateLimitError) {
      throw new HttpsError("resource-exhausted", "The model is busy right now. Try again in a minute.");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new HttpsError("unavailable", "Couldn't reach the model. Try again in a minute.");
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`${label}: API ${e.status}`, e.message);
      throw new HttpsError("internal", `Model call failed (${e.status || "?"}).`);
    }
    throw e;
  }

  const u = msg.usage || {};
  console.log(`${label}: in=${u.input_tokens} out=${u.output_tokens} stop=${msg.stop_reason}`);
  await recordSpend(u, label);

  if (msg.stop_reason === "refusal") {
    throw new HttpsError("failed-precondition", "The model declined to read this file. Type the lines in.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new HttpsError("out-of-range", "Too many lines to read in one go. Type the rest in.");
  }
  const text = ((msg.content || []).find((c) => c.type === "text") || {}).text || "";
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new HttpsError("internal", "Couldn't read the model's answer as line items.");
  }
}

const digits = (v, n) => String(v == null ? "" : v).replace(/[^\d.]/g, "").slice(0, n);

/* ---------------- parseReceipt ---------------- */

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          desc: { type: "string", description: "Short item name as a person would say it" },
          qty: { type: "string", description: "Count purchased, digits only, 1 if not shown" },
          total: { type: "string", description: "Line total in dollars, digits and decimal point only" },
        },
        required: ["desc", "qty", "total"],
        additionalProperties: false,
      },
    },
    vendor: { type: "string", description: "Store or supplier name, empty if not shown" },
    receiptTotal: { type: "string", description: "Grand total in dollars, empty if not shown" },
  },
  required: ["lines", "vendor", "receiptTotal"],
  additionalProperties: false,
};

const RECEIPT_PROMPT =
  "Read this purchase receipt or invoice. One entry in lines per purchased item. " +
  "Skip tax, subtotal and payment rows, but include shipping as its own line if charged. " +
  "If a value is unreadable, use an empty string rather than guessing.";

exports.parseReceipt = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    const email = await requireRoster(req);
    await requireAiOn();

    // Only budget receipts. The path shape is budget/{buyId}/{file}, written
    // by attachReceipt(); anything else is refused rather than fetched.
    const path = String((req.data && req.data.path) || "");
    if (!/^budget\/[A-Za-z0-9-]+\/[^/]+$/.test(path)) {
      throw new HttpsError("invalid-argument", "Not a budget receipt path.");
    }

    const block = await storageBlock(path);
    await chargeDaily(email, "photo");
    const parsed = await callHaiku({
      label: "parseReceipt",
      schema: RECEIPT_SCHEMA,
      content: [block, { type: "text", text: RECEIPT_PROMPT }],
    });

    const lines = (Array.isArray(parsed.lines) ? parsed.lines : []).slice(0, 50).map((l) => ({
      desc: String(l.desc || "").trim().slice(0, 200),
      qty: digits(l.qty, 10),
      total: digits(l.total, 12),
    })).filter((l) => l.desc);

    return {
      lines,
      vendor: String(parsed.vendor || "").trim().slice(0, 100),
      receiptTotal: digits(parsed.receiptTotal, 12),
    };
  }
);
