#!/usr/bin/env node
/* Storage-rules SMOKE test for 06 Composites App/storage.rules against the Storage
   emulator. Scope note: the emulator's rules-enforced upload endpoint (/v0)
   doesn't set request.resource.contentType on a simple upload, so the *allow*
   cases (which gate on contentType) can't be asserted here without the full
   resumable protocol — those are exercised by the app's Firebase SDK in prod.
   What this proves cleanly is the security boundary that matters: sign-in is
   required, and writes outside the nine allowed path trees (avatars/, projects/,
   parts/, molds/, items/, lots/, documents/, budget/, stackplans/) are denied.

   Because no allow case is assertable here, a tree that is MISSING from the
   rules looks identical to a tree that is present: both refuse this endpoint's
   simple upload. That is exactly how molds/, items/ and lots/ went a season
   without a rule while the app uploaded to them. So this file also reads
   storage.rules off disk and asserts each tree has a match block at all —
   crude, but it is the only thing here that would have caught it.

   Run from "06 Composites App/":
     firebase emulators:exec --only auth,storage --project demo-feb-work-orders \
       "node '../tools/test_storage_rules.mjs'"                                */

import { readFileSync } from "node:fs";

const PID = "demo-feb-work-orders";
const BUCKET = `${PID}.appspot.com`;
const STORAGE = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`;

/* An ANONYMOUS session, which is what "view as guest" mints. The auth emulator
   speaks the same endpoint as signUp, minus the credentials. */
async function signUpAnon() {
  const r = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("auth emulator anonymous signUp failed");
  return j.idToken;
}
async function signUp(email) {
  const r = await fetch(AUTH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "password123", returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("auth emulator signUp failed");
  return j.idToken;
}
async function write(token, path) {
  const headers = { "Content-Type": "application/pdf" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(`${STORAGE}?name=${encodeURIComponent(path)}`, { method: "POST", headers, body: Buffer.alloc(8, 1) });
  return res.status;
}

const token = await signUp("smoke@feb.test");
const anon = await signUpAnon();
let pass = 0, fail = 0;
async function denied(label, tok, path) {
  const s = await write(tok, path);
  const ok = s === 403;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${label}  → ${s} (want 403)`);
}

/* ---------- the guest ----------
   THE HOLE THIS CLOSES IS ON WRITE, AND IT IS WORTH SAYING WHY THE READ SIDE IS
   NOT THE SCARY ONE. fb.upload() returns getDownloadURL() and every caller
   stores that token URL on the record — and a download-token URL bypasses these
   rules entirely. So an attachment reachable through a record a guest can read
   is fetchable whatever this file says; the RECORD read is the real boundary,
   which is why "allow read: if signedIn()" is left exactly as it was.

   What genuinely opened the moment anonymous auth was switched on is write:
   signedIn() is satisfied by an anonymous session, so every one of these trees
   would have accepted 10 MB — 50 MB for CAD — from anyone on the internet, with
   no rules change and nothing in the app to notice it. accountOf() is the same
   condition these rules always MEANT. */
console.log("storage boundary — a guest may not write anywhere:");
await denied("anonymous write to documents/", anon, "documents/x.pdf");
await denied("anonymous write to projects/", anon, "projects/P-1/x.pdf");
await denied("anonymous write to parts/", anon, "parts/P-SN6-001/photo.jpg");
await denied("anonymous write to molds/", anon, "molds/MOLD-SN6-001/datum.pdf");
await denied("anonymous write to items/", anon, "items/ITEM-SN6-001/photo.jpg");
await denied("anonymous write to lots/", anon, "lots/LOT-SN6-001/photo.jpg");
await denied("anonymous write to budget/", anon, "budget/BUY-1/receipt.jpg");
await denied("anonymous write to stackplans/", anon, "stackplans/STK-1/mesh.stl");
await denied("anonymous write to its OWN avatar path", anon, "avatars/uid-guest");

console.log("storage boundary (deny-critical):");
await denied("unauthenticated write to documents/", null, "documents/x.pdf");
await denied("unauthenticated write to projects/", null, "projects/P-1/x.pdf");
await denied("unauthenticated write to avatars/", null, "avatars/someuid");
await denied("unauthenticated write to budget/", null, "budget/BUY-1/receipt.jpg");
await denied("unauthenticated write to stackplans/", null, "stackplans/STK-1/mesh.stl");
// Added with the rich composer on parts: there was no parts/ rule at all, and
// the file ends in "no rule = deny", so a photo in a part comment failed
// silently at upload. The tree exists now, and must still be roster-gated.
await denied("unauthenticated write to parts/", null, "parts/P-SN6-001/photo.jpg");
/* molds/, items/ and lots/ arrived in September 2026 for the same reason
   parts/ did, one tab later: renderShopDetail wires richField's upload to
   `${coll}/${id}/...` and there was no rule, so a pasted photo failed at
   upload with a toast that read like bad wifi. A mold's datum cut plans live
   in molds/ too. All three must still be roster-gated. */
await denied("unauthenticated write to molds/", null, "molds/MOLD-SN6-001/datum.pdf");
await denied("unauthenticated write to items/", null, "items/ITEM-SN6-001/photo.jpg");
await denied("unauthenticated write to lots/", null, "lots/LOT-SN6-001/photo.jpg");
// The mold mesh behind the Stock tab's 3D view. Its rule accepts only
// model/stl and application/octet-stream, so this PDF-typed write must be
// refused even though the path itself is allowed — the one contentType case
// this endpoint CAN assert, since here the wrong type is what's being tested
// rather than the right one (see the scope note at the top).
await denied("authed write of a non-STL content type to stackplans/", token, "stackplans/STK-1/mesh.stl");
await denied("authed write to an unmatched path", token, "secret/x.pdf");
/* cadOk() (August 2026) widened projects/ and parts/ to take native CAD by
   FILENAME as well as content type. The thing to prove is that naming a file
   .step does not by itself open a door: the extension only ever relaxes the
   type check INSIDE the two trees that were already writable, never the path
   check that decides which trees exist at all. */
await denied("a .step name does not open an unmatched path", token, "secret/mold.step");
await denied("a .step name does not open the bucket root", token, "mold.step");
await denied("a .step name does not open someone else's avatar", token, "avatars/not-my-uid.step");
await denied("CAD by name is still denied where the tree itself is denied", token, "cad/MOLD.STEP");
await denied("authed write to bucket root", token, "rootfile.pdf");

/* ---------- the trees exist at all ----------
   Source-level, because the emulator cannot tell a denied path from an absent
   one (see the scope note). Every tree the app writes to must have a match
   block; addRecordFiles(coll, id, tree) and richField's upload path are the
   two places that pick one. */
const RULES = readFileSync(new URL("../06 Composites App/storage.rules", import.meta.url), "utf8");
function hasTree(tree) {
  const ok = new RegExp(`match /${tree}/\\{`).test(RULES);
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  storage.rules declares ${tree}/`);
}
console.log("\nevery tree the app uploads to has a rule:");
["avatars", "projects", "parts", "molds", "items", "lots", "documents", "budget", "stackplans"].forEach(hasTree);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
