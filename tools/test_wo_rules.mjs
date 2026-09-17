#!/usr/bin/env node
/* Firestore security-rules tests for 06 Composites App/firestore.rules.
   Runs against the Firestore emulator via its REST API, with unsigned JWTs
   (the emulator accepts them — same trick @firebase/rules-unit-testing uses).
   Run from "06 Composites App/":
     firebase emulators:exec --only firestore --project demo-feb-work-orders \
       "node '../tools/test_wo_rules.mjs'"                                    */

const PID = "demo-feb-work-orders";
const BASE = `http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents`;

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString("base64url"); }
function token(email, uid) {
  const now = Math.floor(Date.now() / 1000);
  return b64url({ alg: "none", typ: "JWT" }) + "." + b64url({
    sub: uid, user_id: uid, email, email_verified: true,
    aud: PID, iss: `https://securetoken.google.com/${PID}`,
    iat: now, exp: now + 3600, auth_time: now,
    firebase: { sign_in_provider: "password", identities: { email: [email] } },
  }) + ".";
}
const AUTH = {
  owner: "Bearer owner", // emulator admin bypass, for seeding
  lead: "Bearer " + token("lead@feb.test", "uid-lead"),
  member: "Bearer " + token("member@feb.test", "uid-member"),
  rando: "Bearer " + token("rando@feb.test", "uid-rando"),
  none: null,
};

async function req(as, method, path, fields, mask) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH[as]) headers.Authorization = AUTH[as];
  // A mask makes PATCH a partial update (like updateDoc) instead of a full
  // replace, so roster self-edit tests only touch the field they send.
  const qs = mask ? "?" + mask.map(f => "updateMask.fieldPaths=" + f).join("&") : "";
  const res = await fetch(BASE + path + qs, {
    method, headers, body: fields ? JSON.stringify({ fields }) : undefined,
  });
  return res.status;
}
const S = (v) => ({ stringValue: v });
const N = (v) => ({ integerValue: String(v) });

let pass = 0, fail = 0;
async function expect(status, as, method, path, fields, mask) {
  const got = await req(as, method, path, fields, mask);
  const ok = got === status;
  ok ? pass++ : fail++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${as.padEnd(6)} ${method.padEnd(6)} ${path}  → ${got} (want ${status})`);
}

// seed roster as admin
await expect(200, "owner", "PATCH", "/roster/lead@feb.test", { name: S("Lead"), role: S("lead") });
await expect(200, "owner", "PATCH", "/roster/member@feb.test", { name: S("Member"), role: S("member") });

console.log("unauthenticated:");
await expect(403, "none", "GET", "/workOrders/WO-T-001");
await expect(403, "none", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001") });

console.log("authenticated but not on roster:");
await expect(403, "rando", "GET", "/workOrders/WO-T-001");
await expect(403, "rando", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001") });
await expect(403, "rando", "GET", "/roster/rando@feb.test");
await expect(403, "rando", "PATCH", "/roster/rando@feb.test", { name: S("Sneaky"), role: S("lead") });

console.log("member:");
await expect(200, "member", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001"), partName: S("test part") });
await expect(200, "member", "GET", "/workOrders/WO-T-001");
await expect(200, "member", "PATCH", "/workOrders/WO-T-001", { id: S("WO-T-001"), partName: S("edited") });
await expect(200, "member", "GET", "/roster/lead@feb.test");
await expect(403, "member", "DELETE", "/workOrders/WO-T-001");
await expect(403, "member", "PATCH", "/roster/friend@feb.test", { name: S("Friend"), role: S("member") });
await expect(403, "member", "DELETE", "/roster/lead@feb.test");

console.log("new collections (member CRUD, lead-only delete — inventory excepted):");
/* molds/items/lots joined this list on 2026-08-03 with printed labels. They
   carry the same access shape as everything else — a public scan reads the
   separate `pub` mirror, never these — and that separation is exactly what the
   `rando` line below is checking. items and lots left the lead-only-delete
   club on 2026-08-28 (any member deletes inventory — Simon's call for the
   Select… mass-delete); their delete coverage lives in the inventory block
   further down. */
for (const coll of ["parts", "projects", "schedule", "budget", "stock", "stackplans",
                    "molds", "items", "lots", "rnd"]) {
  const anyDelete = coll === "items" || coll === "lots";
  await expect(200, "member", "PATCH", `/${coll}/X-001`, { id: S("X-001"), name: S("t") });
  await expect(200, "member", "GET", `/${coll}/X-001`);
  if (!anyDelete) await expect(403, "member", "DELETE", `/${coll}/X-001`);
  await expect(403, "rando", "GET", `/${coll}/X-001`);
  await expect(200, "lead", "DELETE", `/${coll}/X-001`);
}

console.log("documents (member upload/edit, lead-only delete):");
await expect(200, "member", "PATCH", "/documents/D1", { id: S("D1"), title: S("guide") });
await expect(200, "member", "PATCH", "/documents/D1", { id: S("D1"), title: S("guide v2") });
await expect(200, "member", "GET", "/documents/D1");
await expect(403, "rando", "GET", "/documents/D1");
await expect(403, "member", "DELETE", "/documents/D1");
await expect(200, "lead", "DELETE", "/documents/D1");

console.log("notifications (create by roster, read scoped to `to`):");
await expect(200, "owner", "PATCH", "/notifications/NL", { to: S("lead@feb.test"), text: S("for lead") });
await expect(200, "owner", "PATCH", "/notifications/NM", { to: S("member@feb.test"), text: S("for member") });
await expect(200, "member", "PATCH", "/notifications/NX", { to: S("lead@feb.test"), from: S("member@feb.test"), text: S("member creates a ping from self") });
await expect(403, "member", "PATCH", "/notifications/NF", { to: S("lead@feb.test"), from: S("someone@else.test"), text: S("forged from") }); // can't forge `from`
await expect(200, "member", "GET", "/notifications/NM");           // my own
await expect(403, "member", "GET", "/notifications/NL");           // addressed to someone else
await expect(200, "member", "PATCH", "/notifications/NM", { to: S("member@feb.test"), read: { booleanValue: true } }, ["read"]); // mark my own read
await expect(403, "member", "PATCH", "/notifications/NL", { read: { booleanValue: true } }, ["read"]); // can't touch others'
await expect(403, "rando", "GET", "/notifications/NM");

console.log("config (roster read, lead-only write — a webhook URL is a live credential):");
await expect(403, "member", "PATCH", "/config/slack", { webhookUrl: S("https://hooks.slack.test/x") });
await expect(200, "lead", "PATCH", "/config/slack", { webhookUrl: S("https://hooks.slack.test/x") });
await expect(200, "member", "GET", "/config/slack"); // any roster member reads — the client needs it at runtime
await expect(403, "rando", "GET", "/config/slack");
await expect(403, "none", "GET", "/config/slack");

console.log("config/trainings (the lead-editable catalog rides the same config rule):");
const trCat = { trimming: { mapValue: { fields: { name: S("Trimming and finishing"), code: S("TRIM") } } } };
await expect(403, "member", "PATCH", "/config/trainings", trCat);
await expect(200, "lead", "PATCH", "/config/trainings", trCat);
await expect(200, "member", "GET", "/config/trainings"); // every client folds it over the const catalog

console.log("per-collection counters (forward-only, block reservation capped):");
await expect(200, "member", "PATCH", "/meta/parts", { next: N(2) });      // create
await expect(200, "member", "PATCH", "/meta/parts", { next: N(3) });      // increment ok
await expect(403, "member", "PATCH", "/meta/parts", { next: N(1) });      // rewind blocked
await expect(403, "member", "PATCH", "/meta/parts", { next: N(3) });      // standing still blocked
await expect(200, "member", "PATCH", "/meta/workOrders", { next: N(2) }); // independent counter
/* Reserving a block for a batch receive. The counter may now jump forward,
   which is what turns 200 sequential transactions into one — but only within
   the cap, and only forwards. Uniqueness never depended on the step size,
   only on the direction. */
await expect(200, "member", "PATCH", "/meta/lots", { next: N(51) });      // fresh counter, one block
await expect(200, "member", "PATCH", "/meta/lots", { next: N(101) });     // +50 exactly: the ceiling
await expect(403, "member", "PATCH", "/meta/lots", { next: N(152) });     // +51: over the ceiling
await expect(403, "member", "PATCH", "/meta/lots", { next: N(100) });     // still cannot rewind
/* A counter write carries a counter and nothing else. */
await expect(403, "member", "PATCH", "/meta/lots", { next: N(102), note: S("hi") });
/* And it is an integer. A float compares equal to its int in rules, so
   without the "is int" clause the counter could silently drift to 101.5. */
await expect(403, "member", "PATCH", "/meta/lots", { next: { doubleValue: 105.5 } });

console.log("inventory deletes are open to any member; the rest of the app is not:");
/* items and lots went from isLead()||mine() to onRoster() on 2026-08-28 —
   Simon's call for the Select…/mass-delete: shop consumables are shared
   property, and "only whoever logged the jug can delete it" made cleanup
   after the EH&S import a lead-only chore. stock keeps the undo shape
   (isLead()||mine()); molds and parts stay lead-only.

   That was before the app soft-deleted. See just below: the member-facing
   action is now the tombstone, and DELETE became the purge. */
await expect(200, "owner", "PATCH", "/lots/FAB-SN6-900", { id: S("FAB-SN6-900"), cls: S("FAB"), createdBy: S("member@feb.test") });
await expect(200, "owner", "PATCH", "/lots/FAB-SN6-901", { id: S("FAB-SN6-901"), cls: S("FAB"), createdBy: S("lead@feb.test") });
await expect(200, "owner", "PATCH", "/lots/FAB-SN6-902", { id: S("FAB-SN6-902"), cls: S("FAB") }); // predates createdBy
/* SEPTEMBER 2026: a member clears a shelf through the TOMBSTONE, which is an
   update and which they still have on anybody's record. DELETE now means
   emptying the bin — the one irreversible step, and the one that takes the
   Storage objects with it — so it is a lead's on these two as well. Simon's
   2026-08-28 point still holds: cleanup is not a lead chore, and it is not. */
await expect(403, "member", "DELETE", "/lots/FAB-SN6-901");   // someone else's
await expect(403, "member", "DELETE", "/lots/FAB-SN6-902");   // no createdBy
await expect(403, "member", "DELETE", "/lots/FAB-SN6-900");   // even my own
await expect(200, "lead", "DELETE", "/lots/FAB-SN6-900");     // the lead empties it
await expect(200, "owner", "PATCH", "/items/JIG-SN6-900", { id: S("JIG-SN6-900"), cls: S("JIG"), createdBy: S("lead@feb.test") });
await expect(403, "member", "DELETE", "/items/JIG-SN6-900");
await expect(200, "lead", "DELETE", "/items/JIG-SN6-900");
/* stock keeps the undo rule: your own mistake, or a lead. undoCuts() deletes
   the offcuts it created, which is exactly the mine() case. */
await expect(200, "owner", "PATCH", "/stock/BRD-SN6-900", { id: S("BRD-SN6-900"), createdBy: S("member@feb.test") });
await expect(200, "owner", "PATCH", "/stock/BRD-SN6-901", { id: S("BRD-SN6-901"), createdBy: S("lead@feb.test") });
await expect(403, "member", "DELETE", "/stock/BRD-SN6-901");  // someone else's board: refused
await expect(200, "member", "DELETE", "/stock/BRD-SN6-900");  // my own: allowed
await expect(200, "lead",   "DELETE", "/stock/BRD-SN6-901");
/* rnd keeps the undo shape too, and NOT the wider onRoster() its multi-class
   siblings items and lots were opened to. A coupon is somebody's experiment and
   its result is data, which is the opposite of a shared jug of resin — but the
   bulk-create Undo still has to be able to delete what it just made, or it is a
   button that lies: the rows vanish locally, the server refuses, and the next
   snapshot puts them back. */
await expect(200, "owner", "PATCH", "/rnd/CPN-SN6-900", { id: S("CPN-SN6-900"), cls: S("CPN"), createdBy: S("member@feb.test") });
await expect(200, "owner", "PATCH", "/rnd/CPN-SN6-901", { id: S("CPN-SN6-901"), cls: S("CPN"), createdBy: S("lead@feb.test") });
await expect(403, "member", "DELETE", "/rnd/CPN-SN6-901");  // someone else's coupon: refused
await expect(200, "member", "DELETE", "/rnd/CPN-SN6-900");  // the one Undo just created: allowed
await expect(200, "lead",   "DELETE", "/rnd/CPN-SN6-901");
/* A study is the same rule — it is the thing that holds the experiment. */
await expect(200, "owner", "PATCH", "/rnd/RDS-SN6-900", { id: S("RDS-SN6-900"), cls: S("RDS"), createdBy: S("member@feb.test") });
await expect(200, "member", "DELETE", "/rnd/RDS-SN6-900");

/* Collections that have no undo keep the old rule. */
await expect(200, "owner", "PATCH", "/parts/P-SN6-900", { id: S("P-SN6-900"), createdBy: S("member@feb.test") });
await expect(403, "member", "DELETE", "/parts/P-SN6-900");

console.log("roster self-edit (avatar/name only, never role):");
await expect(200, "member", "PATCH", "/roster/member@feb.test", { avatar: S("http://x/a.jpg") }, ["avatar"]); // own avatar ok
await expect(200, "member", "PATCH", "/roster/member@feb.test", { name: S("Member Renamed") }, ["name"]);   // own name ok
await expect(403, "member", "PATCH", "/roster/member@feb.test", { role: S("lead") }, ["role"]);             // self-promote blocked
await expect(403, "member", "PATCH", "/roster/lead@feb.test", { avatar: S("http://x/b.jpg") }, ["avatar"]); // someone else's doc blocked
await expect(200, "lead", "PATCH", "/roster/member@feb.test", { avatar: S("http://x/c.jpg") }, ["avatar"]); // lead can edit anyone

console.log("trainings (the one server-side property the buyoff gate relies on):");
const trGrant = { trainings: { mapValue: { fields: { infusion: { mapValue: { fields: { by: S("member@feb.test"), at: S("2026-08-15T00:00:00Z") } } } } } } };
await expect(403, "member", "PATCH", "/roster/member@feb.test", trGrant, ["trainings.infusion"]); // self-grant blocked
await expect(200, "lead", "PATCH", "/roster/member@feb.test", trGrant, ["trainings.infusion"]);   // a lead grants

console.log("lead:");
await expect(200, "lead", "PATCH", "/roster/new@feb.test", { name: S("New"), role: S("member") });
await expect(200, "lead", "DELETE", "/roster/new@feb.test");
await expect(200, "lead", "DELETE", "/workOrders/WO-T-001");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
