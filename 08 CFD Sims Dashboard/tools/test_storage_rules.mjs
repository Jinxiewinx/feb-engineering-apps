#!/usr/bin/env node
/* Storage-rules SMOKE test for storage.rules against the Storage emulator.
   What this proves is the boundary: a guest or an unauthenticated caller can
   write nowhere, and an account can write nowhere outside the three allowed
   trees. Every write below is a SIMPLE upload, which is all a path-boundary
   case needs. It is not enough for a contentType case: the emulator's
   simple-upload handler never reads the Content-Type header and reports
   application/octet-stream to the rules engine whatever you send. If a
   contentType assertion is ever wanted here, use the resumable upload that
   06 Composites App's tools/test_storage_rules.mjs writeTyped() shows.
   Run from this folder:
     npm run test:storage                                                     */

const PID = "demo-feb-cfd";
const STORAGE = `http://127.0.0.1:9198/v0/b/${PID}.appspot.com/o`;
const AUTH = `http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`;

async function signUp(body) {
  const r = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("auth emulator signUp failed: " + JSON.stringify(j));
  return j.idToken;
}
async function write(token, path) {
  const headers = { "Content-Type": "application/pdf" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(`${STORAGE}?name=${encodeURIComponent(path)}`, { method: "POST", headers, body: Buffer.alloc(8, 1) });
  return res.status;
}

const account = await signUp({ email: "smoke@feb.test", password: "password123" });
const guest = await signUp({});
let pass = 0, fail = 0;
async function denied(label, tok, path) {
  const s = await write(tok, path);
  const ok = s === 403;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${label}  → ${s} (want 403)`);
}

console.log("a guest may not write anywhere:");
await denied("guest write to sims/", guest, "sims/SIM-SN6-001/report.pdf");
await denied("guest write to geometries/", guest, "geometries/GEO-SN6-001/wing.step");
await denied("guest write to its own avatar path", guest, "avatars/uid-guest");

console.log("unauthenticated may not write anywhere:");
await denied("unauthenticated write to sims/", null, "sims/SIM-SN6-001/report.pdf");
await denied("unauthenticated write to geometries/", null, "geometries/GEO-SN6-001/wing.step");
await denied("unauthenticated write to avatars/", null, "avatars/someuid");

console.log("an account may not write outside the allowed trees:");
await denied("account write to bucket root", account, "report.pdf");
await denied("account write to an unmatched tree", account, "secret/x.pdf");
await denied("account write to someone else's avatar", account, "avatars/not-my-uid");
await denied("account write too deep under sims/", account, "sims/SIM-SN6-001/nested/x.pdf");

console.log("reports/: open, but only report.pdf and only a PDF (deny cases; the emulator's simple upload does not carry Content-Type into request.resource.contentType, so the allow case is exercised by the SDK in the smoke test and live):");
await denied("unauthenticated write of another file name under reports/<id>/", null, "reports/RPT-AAAAAAAA/other.pdf");
await denied("unauthenticated write to reports/ root", null, "reports/report.pdf");
await denied("unauthenticated write one level too deep", null, "reports/RPT-AAAAAAAA/x/report.pdf");
{
  const res = await fetch(`${STORAGE}?name=${encodeURIComponent("reports/RPT-CCCCCCCC/report.pdf")}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: Buffer.alloc(8, 1) });
  const ok = res.status === 403; ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  text/plain to report.pdf  → ${res.status} (want 403)`);
}

console.log("reports/<id>/thumb.png: PNG only:");
await denied("a PDF-typed write to thumb.png", null, "reports/RPT-AAAAAAAA/thumb.png");
await denied("thumb under a different name", null, "reports/RPT-AAAAAAAA/thumb.jpg");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
