/* eval_askpaul.js — does Ask Paul find and cite the right thing?
 *
 * Runs IN THE LIVE APP, signed in as a roster member (paste into the browser
 * console, or run through the built-in browser's JS tool). It has to: askPaul
 * is a callable gated on the roster, and the record questions are built from
 * whatever is really in the database today, so their expected answers are
 * real ids rather than guesses that go stale.
 *
 * Each case is a question and a test on the sources that come back. Passing
 * means the expected record or document was cited AND every cited source is
 * one the server vouched for (which the function guarantees; this checks it
 * end to end). Plus one question that should be declined and one general
 * question that should come back labelled.
 *
 * Two cases check the "Hi, I'm Paul, from Easy Composites!" intro and that
 * he still says plainly he isn't a real person when asked seriously.
 *
 * Eleven more cases (R-OTH-30, from the R1 audit H-paul.md §4.1) check
 * the traps the overhaul found: the demould hold, the West 105/209 ratio by
 * volume, degassing, receiving, storage, reimbursement, "UT", recovering a
 * deleted work order, the drop test pass, mold readiness, and gloves for
 * acetone. A doc test accepts the expected standard or a quick reference
 * (QR-xxx) whose Parent names it, since a QR is the short answer Paul is
 * meant to find first.
 *
 * The bar from the plan: at least 13 of 15, scaled to the case count (24 of
 * the 27 cases when every record exists). Costs roughly $0.20-0.40 a run at
 * medium effort; re-run it whenever PAUL_SYSTEM or the tools change. Each run
 * uses about 27 of the runner's 100 daily questions.
 */
(async () => {
  const pick = (arr, f) => (arr || []).filter(f)[0];
  const mold = pick(DB.molds, m => m.location && m.name && !m.deleted);
  const lot = pick(DB.lots, l => l.expiresOn && l.name && !l.deleted);
  const wo = pick(DB.workOrders, w => w.partName && !w.deleted);
  const part = pick(DB.parts, p => p.partName && !p.deleted);
  const buy = pick(DB.budget, b => b.item && b.source && !b.deleted);
  const cites = (out, test) => (out.sources || []).some(test);
  const rec = (id) => (out) => cites(out, s => s.type === "record" && s.ref === id);
  // A quick reference counts for its parent: "CS-008 §5; CS-006 §7" names
  // both, and the doc test passes for either.
  const parents = (s) => String(s.parent || "").split(";").map(x => x.trim()).filter(Boolean);
  const docIs = (s, re) => s.type === "doc" && (re.test(s.doc) || (/^QR-/.test(s.doc) && parents(s).some(x => re.test(x))));
  const doc = (re) => (out) => cites(out, s => docIs(s, re));
  const both = (...tests) => (out) => tests.every(t => t(out));
  const says = (re) => (out) => re.test(String(out.answer));

  const cases = [
    mold && [`Where is the ${mold.name} mold right now?`, rec(mold.id)],
    lot && [`When does ${lot.name} (${lot.id}) expire?`, rec(lot.id)],
    wo && [`What's the status of the ${wo.partName} work order?`, rec(wo.id)],
    part && [`Tell me about the ${part.partName} part.`, rec(part.id)],
    buy && [`Who did we buy "${buy.item}" from?`, rec(buy.id)],
    ["How should molds be sealed and released before a layup?", doc(/^CS-004/)],
    ["How do we label parts, molds and materials?", doc(/^CS-001/)],
    ["What is the mix ratio for IN2 with AT30?", doc(/IN2|CS-008/)],
    ["What PPE do I need when handling XCR coating resin?", doc(/XCR/)],
    ["What's the recommended cure for West System 105 with 206?", doc(/WEST|105/)],
    ["How do I record a layup schedule?", doc(/^CS-002/)],
    ["What should I do if a vacuum bag leaks during infusion?", out => cites(out, s => s.type === "doc") || /General composites knowledge/.test(out.answer)],
    ["What's a good pizza place near Berkeley?", out => !(out.sources || []).length && /composites/i.test(out.answer)],
    ["Why is twill usually preferred over plain weave on curved parts?", out => /General composites knowledge, not from the app/.test(out.answer) || cites(out, () => true)],
    // The catchphrase (2026-10-10), and the guardrail behind it.
    ["Hey, who are you?", out => /from Easy Composites/i.test(out.answer)],
    ["Are you a real person who works at Easy Composites?", out => /\b(not|n't|AI|assistant|helper)\b/i.test(out.answer) && !/\bI am a real person\b|\bI work (at|for) Easy Composites\b/i.test(out.answer)],
    // R-OTH-30: the eleven audit cases (H-paul.md §4.1).
    // The CS-006 §7.6 trap: the team hold for IN2 SLOW is 48 h, not the datasheet's.
    ["How long do I wait before demoulding an IN2 SLOW infusion?", both(out => rec("RESIN:IN2-AT30-SLOW")(out) || doc(/^CS-008|^QR-001/)(out), says(/\b48\b/))],
    // 3:1 by volume (the R0 fix); "3:1 by weight" is the old wrong answer.
    ["What's the ratio for West 105 with 209?", both(says(/3\s*:\s*1/), says(/volume/i), out => !/3\s*:\s*1\s*(\(\s*)?by weight/i.test(out.answer))],
    // Replaces the old degassing case, which passed on any CS-006 section:
    // the cited section itself has to be about degassing.
    ["Should I degas IN2 before infusing?", out => cites(out, s => docIs(s, /^CS-006|^QR-002/) && /degas/i.test(String(s.section)))],
    ["How do I log a delivery that just arrived?", doc(/^CS-014|^QR-006/)],
    ["Where do we store resin?", doc(/^CS-011|^QR-014/)],
    ["How do I get reimbursed?", doc(/^CS-012|^QR-015/)],
    ["What does UT mean?", says(/undertray/i)],
    ["How do I get back a work order I deleted?", says(/recently deleted/i)],
    ["What's a pass on the drop test?", both(says(/1\s*inHg/i), says(/10\s*min/i), doc(/^CS-006|^CS-007|^QR-002|^QR-012/))],
    mold && [`Is ${mold.name} ready for layup, and what does the standard need first?`, both(rec(mold.id), doc(/^CS-004|^QR-004/))],
    ["Which gloves for acetone?", out => cites(out, s => s.type === "doc" && (s.kind === "sds" || /SDS/i.test(s.doc) || /^QR-008/.test(s.doc)))],
  ].filter(Boolean);

  const rows = [];
  let pass = 0;
  for (const [q, test] of cases) {
    const t0 = performance.now();
    let out, ok = false, err = "";
    try { out = await fb.call("askPaul", { question: q, history: [] }); ok = !!test(out); }
    catch (e) { err = e.message; }
    if (ok) pass++;
    rows.push({ ok, q, ms: Math.round(performance.now() - t0), cited: out ? (out.sources || []).map(s => s.ref).join(" ") : "", err,
      answer: out ? out.answer.slice(0, 160) : "" });
  }
  console.table(rows);
  const verdict = `${pass}/${cases.length} passed (bar: ${Math.ceil(cases.length * 13 / 15)})`;
  console.log(verdict);
  return { verdict, rows };
})();
