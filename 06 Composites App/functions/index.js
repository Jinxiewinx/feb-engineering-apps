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

/* One request to the model, with the SDK's errors turned into HttpsErrors a
 * toast can show, and the call's real usage logged and added to the month.
 * Every model call in this file goes through here, so the budget sees all of
 * them. */
async function modelCall(body, label) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 1, timeout: 45_000 });
  let msg;
  try {
    msg = await client.messages.create({ model: MODEL, ...body });
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
  return msg;
}

/* One structured-output call to Haiku. Returns the parsed object or throws an
 * HttpsError whose message the client can put straight in a toast. */
async function callHaiku({ content, schema, maxTokens = 2048, label }) {
  const msg = await modelCall({
    max_tokens: maxTokens,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  }, label);

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

/* ---------------- photo jobs: packing slip, container label ----------------
 * Same shape as parseReceipt: a Storage path the client just uploaded, one
 * fixed prompt and schema, a sanitised answer that only ever prefills
 * something a person reviews. The client deletes the photo afterwards; it was
 * only ever input. */

const isoDate = (v) => {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d) || d.toISOString().slice(0, 10) !== m[0] ? "" : m[0];
};
const text = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

async function photoJob(req, { pathRe, pathMsg, label, schema, prompt, maxTokens }) {
  const email = await requireRoster(req);
  await requireAiOn();
  const path = String((req.data && req.data.path) || "");
  if (!pathRe.test(path)) throw new HttpsError("invalid-argument", pathMsg);
  const block = await storageBlock(path);
  await chargeDaily(email, "photo");
  return callHaiku({ label, schema, maxTokens, content: [block, { type: "text", text: prompt }] });
}

const SLIP_SCHEMA = {
  type: "object",
  properties: {
    supplier: { type: "string", description: "Who shipped it, empty if not shown" },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "What the item is, as printed, shortened to what a person would call it" },
          qty: { type: "string", description: "Quantity shipped (not ordered or backordered), digits only, 1 if not shown" },
          vendorLot: { type: "string", description: "Lot or batch number printed for this line, empty if none" },
          expiresOn: { type: "string", description: "Expiry date for this line as YYYY-MM-DD, empty if none" },
        },
        required: ["name", "qty", "vendorLot", "expiresOn"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplier", "rows"],
  additionalProperties: false,
};
const SLIP_PROMPT =
  "Read this packing slip or delivery note. One entry in rows per shipped line item. " +
  "Use the shipped quantity, not ordered or backordered; skip lines with nothing shipped. " +
  "Only fill vendorLot and expiresOn when they are printed for that line. " +
  "An expiry printed as month and year only (09/2027, SEP 2027) means the last day of that month. " +
  "If a value is unreadable, use an empty string rather than guessing.";

exports.parsePackingSlip = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    const parsed = await photoJob(req, {
      // receiving/{batch}/{file}: the desk uploads here, reads, and deletes.
      pathRe: /^receiving\/[A-Za-z0-9-]+\/[^/]+$/, pathMsg: "Not a receiving upload path.",
      label: "parsePackingSlip", schema: SLIP_SCHEMA, prompt: SLIP_PROMPT, maxTokens: 3072,
    });
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).slice(0, 60).map((r) => ({
      name: text(r.name, 200),
      qty: digits(r.qty, 8),
      vendorLot: text(r.vendorLot, 60),
      expiresOn: isoDate(r.expiresOn),
    })).filter((r) => r.name);
    return { supplier: text(parsed.supplier, 100), rows };
  }
);

/* The material is a suggestion from the team's own table, never a free
 * string: the client sends the keys it knows (materials.js MATERIALS), they
 * become an enum in the schema, and "" means none of them. The keys are
 * client-supplied, so they are checked hard before they reach a prompt. */
const LABEL_PROMPT =
  "Read this container label (resin, hardener, adhesive or other shop chemical). " +
  "name: the product as printed. vendorLot: the lot or batch number. expiresOn: the expiry or use-by date as YYYY-MM-DD; " +
  "a month and year only (09/2027) means the last day of that month; if only a manufacture date and shelf life are printed, leave it empty. " +
  "matKey: the one material from the list that this container is, or empty if it is none of them or you are unsure. " +
  "If a value is unreadable, use an empty string rather than guessing.";

exports.readContainerLabel = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 60, memory: "512MiB" },
  async (req) => {
    const mats = (Array.isArray(req.data && req.data.materials) ? req.data.materials : [])
      .slice(0, 100)
      .map((m) => ({ key: text(m && m.matKey, 40), label: text(m && m.label, 80) }))
      .filter((m) => /^[A-Z0-9][A-Z0-9-]*$/.test(m.key));
    const keys = [...new Set(mats.map((m) => m.key))];
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        vendorLot: { type: "string" },
        expiresOn: { type: "string" },
        matKey: { type: "string", enum: ["", ...keys] },
      },
      required: ["name", "vendorLot", "expiresOn", "matKey"],
      additionalProperties: false,
    };
    const list = mats.map((m) => `${m.key}: ${m.label.replace(/[^\w\s%'#.,()/-]/g, "")}`).join("\n");
    const parsed = await photoJob(req, {
      // lots/{id}/{file}: the lot page uploads here, reads, and deletes.
      pathRe: /^lots\/[A-Za-z0-9-]+\/[^/]+$/, pathMsg: "Not a lot upload path.",
      label: "readContainerLabel", schema, maxTokens: 1024,
      prompt: LABEL_PROMPT + (list ? "\n\nMaterials:\n" + list : ""),
    });
    return {
      name: text(parsed.name, 200),
      vendorLot: text(parsed.vendorLot, 60),
      expiresOn: isoDate(parsed.expiresOn),
      matKey: keys.includes(parsed.matKey) ? parsed.matKey : "",
    };
  }
);


/* ---------------- askPaul: questions about the team's composites work ----------------
 * "Paul" is a team in-joke (the Easy Composites presenter as the ideal
 * composites oracle). The name is the whole joke: the model never claims to
 * be him, never imitates him, and never speaks for Easy Composites.
 *
 * WHY THIS IS NOT THE "GENERAL ENDPOINT" THE RULE FORBIDS. The server decides
 * what Paul can see: four read-only tools over context.js (app records and
 * the shipped standards/datasheets), nothing else. It writes nothing. The
 * system prompt keeps it to FEB composites, and the daily cap and monthly
 * ceiling bound the spend whatever is typed.
 *
 * CITATIONS ARE CHECKED, NOT TRUSTED. Paul writes [ref] after a fact. Every
 * ref the tools returned this question is collected; a [ref] in the answer
 * that is not in that set is removed before the answer leaves the function,
 * so a made-up id can never become a link that looks like evidence.
 *
 * GENERAL KNOWLEDGE (Simon, 2026-10-09: "beef up who is talking ... queries
 * not just about the app"). Allowed for general composites questions the
 * documents don't cover, under a fixed label line the client styles, with no
 * chips. Never for FEB-specific facts or for numbers a datasheet should give.
 *
 * Medium effort, unlike the photo jobs: this one reasons over what it found.
 */
const ctx = require("./context.js");
const PAUL_EFFORT = "medium";
const PAUL_MAX_TOOL_ROUNDS = 4;
const GENERAL_LINE = "General composites knowledge, not from the app:";

const PAUL_SYSTEM = `You are "Paul", the composites helper inside FEB Composites, the app Formula Electric at Berkeley's composites team uses to run its shop. The name is a team in-joke about the ideal composites expert. You are not a real person: never claim to be one, never imitate anyone, and never speak for Easy Composites or any other company.

How to answer:
1. Use the tools first. Search the app's records (work orders, parts, molds, material lots, shelves, tooling boards, stack plans, purchases, issues, schedule, R&D) and its documents (FEB's CS standards and the material datasheets) for anything the question touches. Open the most relevant ones before answering. For any "how do I" or "what's the rule" question, always search the documents as well as the records: the team's procedures live in the CS standards.
2. After every fact that came from a tool, put its ref in square brackets exactly as the tool gave it, for example [WO-SN6-003] or [CS-006#12]. Never write a ref the tools did not give you.
3. FEB-specific facts (where something is, its status or stage, who signed what, what is blocking, the team's cure holds, mix ratios, expiry dates, costs) come only from tools. If the tools don't have it, say plainly that you couldn't find it in the app.
4. If the question is general composites knowledge that the app's documents don't cover, you may answer from general knowledge. Start that part with the line "${GENERAL_LINE}" and keep it short. Never use general knowledge for a number that should come from a datasheet or the team's standards (cure times, temperatures, ratios, pot life, shelf life); point to the datasheet instead.
5. For cure holds and mix ratios, quote the source and add that the Resins page in the app holds the number the team enforces.
6. You can only read. Never say you changed, created, moved or signed anything.
7. If the question is not about composites or the team's work, say in one sentence that you only help with FEB composites.

Be brief and plain: a few sentences or a short list, no headings. People read this on a phone at the layup table.`;

const PAUL_TOOLS = [
  {
    name: "search_records",
    description: "Keyword search over the team's records in the app. Returns up to 20 matches with ref, kind, title and a snippet. Use part numbers, ids, material names, people's first names or plain words.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords" },
        kinds: { type: "array", items: { type: "string", enum: ctx.COLLS }, description: "Optional: limit to these collections" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_record",
    description: "Open one record by its ref (id) and read all of it: steps, buy-offs, notes, locations, dates.",
    input_schema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"], additionalProperties: false },
  },
  {
    name: "search_docs",
    description: "Keyword search over FEB's CS standards and the material datasheets (technical and safety data sheets) shipped in the app. Returns up to 6 sections with ref, document title, section and a snippet.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
  },
  {
    name: "read_doc_section",
    description: "Read one document section in full by its ref, e.g. CS-006#12.",
    input_schema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"], additionalProperties: false },
  },
];

/* Runs one tool. `seen` collects every ref a tool handed back this question:
 * the citation check below accepts those and nothing else. */
function runTool(name, input, records, seen) {
  const i = input || {};
  if (name === "search_records") {
    const hits = ctx.searchRecords(records, i.query, i.kinds);
    hits.forEach((h) => seen.set(h.ref, { type: "record", ref: h.ref, kind: h.kind, title: h.title }));
    return hits.length ? hits : { result: "No matching records." };
  }
  if (name === "get_record") {
    const r = ctx.getRecord(records, i.ref);
    if (!r) return { result: `No record ${String(i.ref || "").slice(0, 40)}.` };
    seen.set(r.ref, { type: "record", ref: r.ref, kind: r.kind, title: r.title });
    return r;
  }
  if (name === "search_docs") {
    const hits = ctx.searchDocs(i.query);
    hits.forEach((h) => seen.set(h.ref, ctx.docSource(h.ref)));
    return hits.length ? hits : { result: "No matching document sections." };
  }
  if (name === "read_doc_section") {
    const s = ctx.readDocSection(i.ref);
    if (!s) return { result: `No section ${String(i.ref || "").slice(0, 40)}.` };
    seen.set(s.ref, ctx.docSource(s.ref));
    return s;
  }
  return { result: "Unknown tool." };
}

/* Brackets in the answer become numbered markers [[n]] pointing into
 * `sources`; a bracket naming anything the tools did not return is removed. */
function checkCitations(text, seen) {
  const sources = [], index = new Map();
  const lower = new Map([...seen.keys()].map((k) => [k.toLowerCase(), k]));
  const out = text.replace(/\s?\[([^\[\]\n]{2,60})\]/g, (m, inner) => {
    const refs = inner.split(/[,;]\s*/).map((x) => lower.get(x.trim().toLowerCase())).filter(Boolean);
    if (!refs.length) return "";
    return " " + refs.map((ref) => {
      if (!index.has(ref)) { index.set(ref, sources.length); sources.push(seen.get(ref)); }
      return `[[${index.get(ref)}]]`;
    }).join("");
  });
  return { answer: out.trim(), sources };
}

exports.askPaul = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: "us-central1", timeoutSeconds: 120, memory: "512MiB" },
  async (req) => {
    const email = await requireRoster(req);
    await requireAiOn();
    const q = String((req.data && req.data.question) || "").trim();
    if (!q) throw new HttpsError("invalid-argument", "Ask Paul something.");
    if (q.length > 1000) throw new HttpsError("invalid-argument", "That's a long one. Keep it under 1,000 characters.");
    await chargeDaily(email, "ask");

    // Earlier turns from this tab, as plain text (no thinking blocks, no tool
    // traffic), capped at six. The client keeps them; nothing is stored here.
    const history = (Array.isArray(req.data.history) ? req.data.history : []).slice(-6).flatMap((t) => {
      const hq = String((t && t.q) || "").slice(0, 1000).trim(), ha = String((t && t.a) || "").slice(0, 3000).trim();
      return hq && ha ? [{ role: "user", content: hq }, { role: "assistant", content: ha }] : [];
    });
    const messages = [...history, { role: "user", content: q }];

    const records = await ctx.loadRecords(admin.firestore());
    const seen = new Map();
    let msg;
    for (let round = 0; ; round++) {
      const last = round >= PAUL_MAX_TOOL_ROUNDS;
      msg = await modelCall({
        max_tokens: 8000,
        system: PAUL_SYSTEM,
        tools: PAUL_TOOLS,
        // Past the round limit the model must answer with what it has.
        tool_choice: { type: last ? "none" : "auto" },
        output_config: { effort: PAUL_EFFORT },
        messages,
      }, "askPaul");
      if (msg.stop_reason === "refusal") {
        throw new HttpsError("failed-precondition", "Paul won't answer that one.");
      }
      if (msg.stop_reason !== "tool_use" || last) break;
      // The assistant turn goes back unchanged (thinking blocks included), then
      // every tool result in one user message.
      messages.push({ role: "assistant", content: msg.content });
      const results = msg.content.filter((b) => b.type === "tool_use").map((b) => ({
        type: "tool_result", tool_use_id: b.id,
        content: JSON.stringify(runTool(b.name, b.input, records, seen)).slice(0, 20000),
      }));
      messages.push({ role: "user", content: results });
    }

    const text = (msg.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw new HttpsError("internal", "Paul didn't come up with an answer. Try asking it another way.");
    const { answer, sources } = checkCitations(text, seen);
    return { answer, sources: sources.filter(Boolean), general: answer.includes(GENERAL_LINE), generalLine: GENERAL_LINE };
  }
);
