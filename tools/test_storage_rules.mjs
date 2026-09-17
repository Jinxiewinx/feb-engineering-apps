#!/usr/bin/env node
/* Storage-rules test for 06 Composites App/storage.rules against the Storage
   emulator. It proves sign-in is required, that writes outside the nine allowed
   path trees (avatars/, projects/, parts/, molds/, items/, lots/, documents/,
   budget/, stackplans/) are denied, and that inside them the right content
   types are accepted and the wrong ones refused.

   TWO UPLOAD PROTOCOLS, and which one a case needs is the whole scope note.

   write() posts a SIMPLE upload (/v0/b/<bucket>/o?name=...). It answers "is
   this path writable at all", and that is genuinely all it can answer. The
   emulator's simple-upload handler never reads the request's Content-Type
   header: apis/firebase.js calls uploadService.mediaUpload() with no metadata,
   and StoredFileMetadata then defaults contentType to application/octet-stream.
   So request.resource.contentType is always exactly "application/octet-stream"
   there whatever header you send, and any contentType case routed through
   write() is really testing octet-stream. An earlier revision of this file
   read that as "contentType is unset" and asserted that a PDF-typed write to
   stackplans/ would be refused. It was not refused, because the rule accepts
   octet-stream by design, so that assertion had been asserting nothing about
   PDFs since the day it was added.

   writeTyped() posts a RESUMABLE upload, which carries the type in
   X-Goog-Upload-Header-Content-Type and reaches the rules engine intact. That
   is the protocol the app's own uploads take (fb.upload -> uploadBytes with an
   explicit contentType), so it is both the accurate one and the realistic one,
   and it is what makes the ALLOW cases assertable.

   The allow cases are the ones with a history. A rule that is missing or too
   tight fails CLOSED: the upload is refused, the toast says "Upload failed",
   and it reads as bad wifi rather than as a rule, which is how molds/, items/
   and lots/ went a season without a match block and how a cadOk() regex slip
   would surface as a teammate stuck at RFS. A deny-only suite cannot see any
   of that. The source-level tree check below predates writeTyped() and stays
   anyway: it is the cheaper guard, and it catches a tree whose match block is
   present but misspelled.

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
  return j;
}
/* A SIMPLE upload. Path-boundary cases only: per the scope note, the content
   type the emulator shows the rules engine here is always octet-stream, so the
   header below is decoration and nothing routed through this may assert on a
   type. */
async function write(token, path) {
  const headers = { "Content-Type": "application/pdf" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(`${STORAGE}?name=${encodeURIComponent(path)}`, { method: "POST", headers, body: Buffer.alloc(8, 1) });
  return res.status;
}

/* A RESUMABLE upload, the only protocol on this endpoint that gets a content
   type as far as request.resource.contentType. Rules are evaluated when the
   session starts and again at finalize, so a refusal can land on either leg;
   return the first non-200 whichever it is. */
async function writeTyped(token, path, contentType, bytes = 8) {
  const auth = { Authorization: "Bearer " + token };
  const start = await fetch(`${STORAGE}?uploadType=resumable&name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start", "X-Goog-Upload-Header-Content-Type": contentType },
    body: JSON.stringify({ name: path, contentType }) });
  if (start.status !== 200) return start.status;
  const url = start.headers.get("x-goog-upload-url") || start.headers.get("location");
  if (!url) throw new Error("resumable start returned no upload URL");
  const fin = await fetch(url, { method: "POST", body: Buffer.alloc(bytes, 1),
    headers: { ...auth, "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" } });
  return fin.status;
}

const account = await signUp("smoke@feb.test");
const token = account.idToken, uid = account.localId;
const anon = await signUpAnon();
let pass = 0, fail = 0;
function record(ok, label, got, want) {
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${label}  → ${got} (want ${want})`);
}
async function denied(label, tok, path) {
  const s = await write(tok, path);
  record(s === 403, label, s, 403);
}
async function deniedType(label, path, contentType) {
  const s = await writeTyped(token, path, contentType);
  record(s === 403, label, s, 403);
}
async function allowedType(label, path, contentType) {
  const s = await writeTyped(token, path, contentType);
  record(s === 200, label, s, 200);
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

/* ---------- content types ----------
   Everything below goes through writeTyped(), because everything below is
   about the type rather than the path. The PDF-to-stackplans case used to sit
   in the deny block above on a simple upload, where it could only ever have
   been reading octet-stream, so it passed the rule honestly and failed the
   assertion. Moved here, it tests what it always claimed to. */
console.log("\nstorage content types — the wrong type is refused on an allowed path:");
await deniedType("a PDF is not an STL (stackplans/)", "stackplans/STK-1/mesh.stl", "application/pdf");
await deniedType("nor is anything renderable (stackplans/)", "stackplans/STK-1/x.html", "text/html");
await deniedType("a receipt must be an image, not a PDF (budget/)", "budget/BUY-1/r.pdf", "application/pdf");
await deniedType("a bare binary needs a CAD name (projects/)", "projects/P-1/notes.txt", "application/octet-stream");
await deniedType("same on a mold, where datum plans land", "molds/MOLD-SN6-001/notes.txt", "application/octet-stream");
await deniedType("an avatar must be an image", `avatars/${uid}`, "application/pdf");

/* The allow side. This is the half a deny-only suite is blind to, and the half
   with the track record: molds/, items/ and lots/ had no rule for a season and
   nothing failed, because a missing rule and a correct rule look the same from
   a deny assertion. cadOk() is the other one storage.rules calls out by name,
   since a lower() or regex slip there refuses a real export at RFS with no
   test to catch it. MOLD.STEP in caps is that exact case. */
console.log("\nstorage content types — the right type is accepted:");
await allowedType("the app's own STL type (stackplans/)", "stackplans/STK-2/mesh.stl", "model/stl");
await allowedType("a browser that fell back to octet-stream (stackplans/)", "stackplans/STK-3/mesh.stl", "application/octet-stream");
await allowedType("CAD named in caps, which is how exports come out", "projects/P-1/MOLD.STEP", "application/octet-stream");
await allowedType("CAD named in lower case", "projects/P-1/mold.step", "application/octet-stream");
await allowedType("CAD on a part, where mold evidence is attached", "parts/P-SN6-001/mold.SLDPRT", "application/octet-stream");
await allowedType("a photo pasted into a part note", "parts/P-SN6-001/photo.jpg", "image/jpeg");
await allowedType("a photo pasted into a mold note", "molds/MOLD-SN6-001/photo.jpg", "image/jpeg");
await allowedType("a mold's datum cut plans as a PDF", "molds/MOLD-SN6-001/datum.pdf", "application/pdf");
await allowedType("a photo pasted into an item note", "items/ITEM-SN6-001/photo.jpg", "image/jpeg");
await allowedType("a photo pasted into a lot note", "lots/LOT-SN6-001/photo.jpg", "image/jpeg");
await allowedType("a PDF in the document library", "documents/spec.pdf", "application/pdf");
await allowedType("a receipt photo", "budget/BUY-1/receipt.jpg", "image/jpeg");
await allowedType("a member's own avatar", `avatars/${uid}`, "image/png");

/* ---------- the trees exist at all ----------
   Source-level, and kept even though the allow cases above now catch a missing
   tree for real: this is the cheap guard, it needs no emulator, and it still
   sees a match block that exists under a misspelled name. Every tree the app
   writes to must have one; addRecordFiles(coll, id, tree) and richField's
   upload path are the two places that pick one. */
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
