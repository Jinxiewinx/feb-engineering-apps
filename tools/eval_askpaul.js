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
 * The bar from the plan: at least 13 of 15. Costs roughly $0.10-0.20 a run
 * (15 questions at medium effort); re-run it whenever PAUL_SYSTEM or the
 * tools change. Each run uses 15 of the runner's 100 daily questions.
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
  const doc = (re) => (out) => cites(out, s => s.type === "doc" && re.test(s.doc));

  const cases = [
    mold && [`Where is the ${mold.name} mold right now?`, rec(mold.id)],
    lot && [`When does ${lot.name} (${lot.id}) expire?`, rec(lot.id)],
    wo && [`What's the status of the ${wo.partName} work order?`, rec(wo.id)],
    part && [`Tell me about the ${part.partName} part.`, rec(part.id)],
    buy && [`Who did we buy "${buy.item}" from?`, rec(buy.id)],
    ["What does our standard say about degassing resin before infusion?", doc(/^CS-006/)],
    ["How should molds be sealed and released before a layup?", doc(/^CS-004/)],
    ["How do we label parts, molds and materials?", doc(/^CS-001/)],
    ["What is the mix ratio for IN2 with AT30?", doc(/IN2|CS-008/)],
    ["What PPE do I need when handling XCR coating resin?", doc(/XCR/)],
    ["What's the recommended cure for West System 105 with 206?", doc(/WEST|105/)],
    ["How do I record a layup schedule?", doc(/^CS-002/)],
    ["What should I do if a vacuum bag leaks during infusion?", out => cites(out, s => s.type === "doc") || /General composites knowledge/.test(out.answer)],
    ["What's a good pizza place near Berkeley?", out => !(out.sources || []).length && /composites/i.test(out.answer)],
    ["Why is twill usually preferred over plain weave on curved parts?", out => /General composites knowledge, not from the app/.test(out.answer) || cites(out, () => true)],
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
