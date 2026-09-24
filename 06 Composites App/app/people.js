"use strict";
/* people.js — the People tab.
   Team directory: everyone on the roster with their photo, role, email, and
   what they're currently on the hook for (parts / projects / work orders),
   pulled live. Leads can bump a role or remove someone from the roster
   (rosterDel in core.js — the Roster screen is gone since v4.4.1,
   and the firestore rules enforce lead-only server-side); you set your own
   photo from the topbar. Trainings are granted and revoked here too — the
   built-in catalog (TRAININGS) lives in workorders.js next to the step
   templates that reference it, and leads extend it through config/trainings
   (openTrainingCatalog below; trainingById/allTrainings are the one way
   anything reads it).

   Two views behind a seg toggle (view.pplView, falsy = list): the LIST is
   the directory — who is this person, what are they on; the MATRIX is the
   planning read — who can we send to the infusion tonight, which trainings
   are thin. List stays the default because it is the daily question. */

// Records currently assigned to a given person (by email / name match).
function assignmentsFor(email) {
  const name = (userByEmail(email) || {}).name || email;
  const mine = (val) => {
    const vals = Array.isArray(val) ? val : [val];
    return vals.some(v => { v = String(v || "").toLowerCase(); return v === email.toLowerCase() || v === name.toLowerCase() || v === name.toLowerCase().split(" ")[0]; });
  };
  const me = String(email || "").toLowerCase();
  const eng = (r) => ENG_KEYS.some(k => personRef(r, k).email === me);
  const parts = DB.parts.filter(p => !["Layup Complete", "Polished"].includes(p.layupProgress) && eng(p));
  /* Open issues only. This column answers "what is this person on the hook
     for", and since the project tracker was shelved the answer is the runs
     they are holding up — a project ticket nobody can navigate to is not an
     obligation, it is history. The parentId test that used to keep sub-tickets
     out is gone with them: an issue is never a sub-ticket. */
  const projects = DB.projects.filter(p => isIssue(p) && !["Done", "Cancelled"].includes(projStatus(p)) && mine(p.assignees || []));
  const wos = DB.workOrders.filter(w => w.status !== "Complete" && eng(w));
  return { parts, projects, wos };
}

/* A person's trainings as capsule pills. Deliberately NOT the .pill status
   shape or colors — a green "INF" next to a green "Complete" would read as a
   status. Provenance rides in the tooltip; the per-person modal shows it in
   full for touch. Every held id renders through trainingById, so a custom or
   even an unknown id still shows something rather than vanishing. */
function trainingPills(u) {
  const held = Object.keys(u.trainings || {});
  if (!held.length) return '<span class="muted tny">none yet</span>';
  return held.map(id => {
    const t = trainingById(id);
    const g = u.trainings[id] || {};
    const tip = `${t.name}${t.archived ? " (archived)" : ""} — granted by ${userName(g.by)}${g.at ? ", " + String(g.at).slice(0, 10) : ""}`;
    return `<span class="tpill" title="${esc(tip)}">${esc(t.code)}</span>`;
  }).join("");
}

function renderPeople() {
  // Only an email is a person: a record id left in view.id by another tab
  // (anything that sets view.tab without going through setTab) is not one.
  if (view.mode === "detail" && String(view.id || "").includes("@")) return renderPerson(view.id);
  const users = usersSorted();
  const rows = users.filter(u => {
    const q = (view.q || "").toLowerCase();
    if (q && !(u.name || "").toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    return !view.fTrain || (u.trainings && u.trainings[view.fTrain]);
  });
  const mtx = view.pplView === "matrix";
  // The review is a lead's tool; anybody else asking for it gets the list.
  const unl = view.pplView === "unlinked" && isLead();
  const U = isLead() ? unlinkedScan() : null;
  const nU = U ? U.groups.length + (U.auto.length ? 1 : 0) : 0;
  const archived = allTrainings(true).filter(t => t.archived);
  if (unl) return `
  <div class="filters no-print">
    <button class="ib" onclick="view.pplView='list';render()">List</button>
    <button class="ib" onclick="view.pplView='matrix';render()">Matrix</button>
    <button class="ib primary">Unlinked${nU ? ` (${nU})` : ""}</button>
  </div>
  ${renderUnlinked(U)}`;
  return `
  <div class="filters no-print">
    <button class="ib ${mtx ? "" : "primary"}" ${mtx ? `onclick="view.pplView='list';render()"` : ""}>List</button>
    <button class="ib ${mtx ? "primary" : ""}" ${mtx ? "" : `onclick="view.pplView='matrix';render()"`}>Matrix</button>
    ${isLead() ? `<button class="ib" onclick="view.pplView='unlinked';render()" title="Typed names that aren't linked to anyone on the roster">Unlinked${nU ? ` (${nU})` : ""}</button>` : ""}
    <input id="searchbox" placeholder="search name / email…" value="${esc(view.q)}" oninput="searchInput(this)">
    <select onchange="view.fTrain=this.value;render()" title="Show only people who hold a training">
      <option value="">qualified for…</option>
      ${allTrainings().map(t => `<option value="${esc(t.id)}" ${view.fTrain === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
    </select>
    ${isLead() ? `<button onclick="openTrainingSession()">＋ Record training session</button>
    <button class="ib" title="Edit the training catalog" onclick="openTrainingCatalog()">${icon("edit", 14)} Catalog</button>` : ""}
    ${mtx && archived.length ? `<label class="tny" style="align-self:center"><input type="checkbox" ${view.pplArch ? "checked" : ""} onchange="view.pplArch=this.checked;render()"> show archived</label>` : ""}
    ${!mtx && isLead() ? pickBar("people", { all: rows.filter(u => u.email !== myEmail()).map(u => u.email), onDelete: "deletePickedPeople()", deleteLabel: "Remove", hint: "Select several people to remove them from the roster" }) : ""}
    <span class="muted" style="align-self:center">${users.length} people on the roster</span>
  </div>
  ${rows.length === 0 ? `<div class="card">${view.fTrain ? "Nobody holds " + esc(trainingById(view.fTrain).name) + " yet." : "No one on the roster yet."}</div>`
    : mtx ? renderPeopleMatrix(rows) : renderPeopleList(rows)}`;
}

function renderPeopleList(rows) {
  return `
  <table class="list dash">
    <tr>${pickOn("people") ? "<th></th>" : ""}<th>Person</th><th>Role</th><th>Trainings</th><th>Assignments</th></tr>
    ${rows.map(u => {
      const a = assignmentsFor(u.email);
      const me = u.email === myEmail();
      const picking = pickOn("people");
      return `<tr class="${pickIs("people", u.email) ? "picked" : ""}"${picking && !me ? ` onclick="togglePick('people','${esc(u.email)}')"` : ""}>
        ${picking ? `<td class="pickcell">${me ? "" : pickBox("people", u.email)}</td>` : ""}
        <td><div style="display:flex;align-items:center;gap:8px">${avatar(u.email, 26)}
          <div><div class="pname">${picking ? esc(u.name || u.email) : `<button type="button" class="plink" data-email="${esc(u.email)}" data-open="person/${esc(encodeURIComponent(u.email))}" onclick="event.stopPropagation();openPerson(this.dataset.email)">${esc(u.name || u.email)}</button>`}${me ? ' <span class="muted tny">(you)</span>' : ""}</div>
          <div class="muted tny">${esc(userHandle(u.email))}</div></div></div></td>
        <td>${isLead() && !me && !picking
          ? `<select onchange="setRole('${esc(u.email)}',this.value)"><option ${u.role === "member" ? "selected" : ""}>member</option><option ${u.role === "lead" ? "selected" : ""}>lead</option></select>
             <button class="sm danger no-print" onclick="rosterDel('${esc(u.email)}')">Remove</button>`
          : `<span class="pill">${esc(displayRole(u))}</span>`}
          ${me ? ` <button class="sm" onclick="setMyAvatar()">Set photo</button> <button class="sm" onclick="openChangeName()">Change name</button>` : ""}
          ${me && isLead() ? `<label class="tny muted" style="display:block;margin-top:4px" title="Only what the pill says changes. You keep every lead permission."><input type="checkbox" ${u.showAs === "member" ? "checked" : ""} onchange="setMyShowAs(this.checked)"> show me as member</label>` : ""}</td>
        <td><div class="trwrap">${trainingPills(u)}
          ${isLead() ? `<button class="ib sm no-print" title="Edit ${esc(u.name || u.email)}'s trainings" aria-label="Edit ${esc(u.name || u.email)}'s trainings" onclick="openPersonTrainings('${esc(u.email)}')">${icon("edit", 13)}</button>` : ""}</div></td>
        <td>${a.parts.length + a.projects.length + a.wos.length === 0 ? '<span class="muted tny">no open assignments</span>' : `
          ${a.projects.map(p => chip("projects", p.id, p.title || p.id)).join(" ")}
          ${a.parts.map(p => chip("parts", p.id, p.partName || p.id)).join(" ")}
          ${a.wos.map(w => chip("workOrders", w.id, w.id)).join(" ")}`}</td>
      </tr>`;
    }).join("")}
  </table>`;
}

/* ---------- one person's page ----------
   #/person/<email>. Everything the app knows that person did or holds, read
   off DB in one pass through the same resolver the fields use, so a record
   shows up here exactly when its chip would link here. Somebody removed from
   the roster still gets a page: their records still name them. */
function personRecords(email) {
  email = String(email || "").trim().toLowerCase();
  const hit = (r, k, src) => personRef(r, k, src).email === email;
  const roles = (r) => ENG_KEYS.filter(k => hit(r, k)).map(k => k === "moldEngineer" ? "ME" : "RE");
  const buys = (DB.budget || []).filter(b => hit(b, "purchaser"))
    .sort((a, b) => String(b.dateOrdered || "").localeCompare(String(a.dateOrdered || "")));
  const unpaid = buys.filter(b => !(typeof buyReimbursed === "function" && buyReimbursed(b)) && num(b.cost));
  const owed = unpaid.reduce((s, b) => s + num(b.cost), 0);
  const parts = (DB.parts || []).map(p => ({ p, roles: roles(p) })).filter(x => x.roles.length);
  const wos = (DB.workOrders || []).map(w => ({ w, roles: roles(w) })).filter(x => x.roles.length);
  const issues = (DB.projects || []).filter(p => (typeof isIssue !== "function" || isIssue(p))
    && !["Done", "Cancelled"].includes(typeof projStatus === "function" ? projStatus(p) : p.status)
    && (p.assignees || []).some(a => String(a).toLowerCase() === email));
  const buyoffs = [];
  (DB.workOrders || []).forEach(w => (w.steps || []).forEach(s => {
    const b = s && s.buyoff;
    if (b && String(b.email || "").toLowerCase() === email) buyoffs.push({ w, s, when: b.time || b.date || "" });
  }));
  buyoffs.sort((a, b) => String(b.when).localeCompare(String(a.when)));
  const molds = (DB.molds || []).filter(m => hit(m, "sealedBy"));
  const bins = (DB.items || []).filter(o => o.cls === "BIN" && hit(o, "walkedBy"));
  const studies = (DB.rnd || []).filter(s => s.cls === "RDS" && s.defaults && hit(s, "by", s.defaults));
  const any = !!(buys.length || parts.length || wos.length || issues.length || buyoffs.length || molds.length || bins.length || studies.length);
  return { email, buys, unpaid, owed, parts, wos, issues, buyoffs, molds, bins, studies, any };
}

function personBackBtn() {
  const prev = navPeek();
  const label = !prev || prev.tab === "people" ? "All people"
    : (() => {
        const rec = prev.id ? recById(prev.tab === "workorders" ? "workOrders" : prev.tab, prev.id) : null;
        const t = TABS.find(t => t.id === prev.tab);
        const name = rec ? (rec.title || rec.partName || rec.item || rec.name || rec.id) : (prev.id || (t ? t.label : prev.tab));
        return "Back to " + String(name).slice(0, 28);
      })();
  return `<button class="ib" title="${esc(label)}" onclick="navBack({tab:'people',mode:'list',id:null})">${icon("chevronLeft", 16)} ${esc(label)}</button>`;
}

function renderPerson(email) {
  email = String(email || "").toLowerCase();
  const u = userByEmail(email);
  const R = personRecords(email);
  const me = email === myEmail().toLowerCase();
  // A name for somebody off the roster: whatever their records last called them.
  const offName = !u && (R.buys[0] ? personName(R.buys[0], "purchaser")
    : R.buyoffs[0] ? R.buyoffs[0].s.buyoff.name : "") || email;
  const name = u ? (u.name || email) : offName;
  const sec = (title, n, body, empty) => `<div class="card psec">
    <h3>${esc(title)}${n ? ` <span class="muted tny">${n}</span>` : ""}</h3>
    ${n ? body : `<p class="muted tny">${esc(empty)}</p>`}</div>`;

  const openParts = R.parts.filter(x => !partDone(x.p)), doneParts = R.parts.filter(x => partDone(x.p));
  const openWos = R.wos.filter(x => x.w.status !== "Complete"), doneWos = R.wos.filter(x => x.w.status === "Complete");
  // The role rides inside the chip: beside it, a 40px phone chip pushed the
  // two-letter tag onto a line of its own.
  const engRow = (coll, rec, roles, label) => `<div class="prow">${chip(coll, rec.id, `${label} · ${roles.join("+")}`)}</div>`;
  const eng = [
    ...openParts.map(x => engRow("parts", x.p, x.roles, x.p.partName || x.p.id)),
    ...openWos.map(x => engRow("workOrders", x.w, x.roles, `${x.w.id} ${x.w.partName || ""}`.trim())),
  ].join("");
  const engDone = doneParts.length + doneWos.length;
  const engBody = `${eng || '<p class="muted tny">Nothing open.</p>'}
    ${engDone ? `<details class="pfold"><summary class="tny muted">${engDone} finished</summary>
      ${doneParts.map(x => engRow("parts", x.p, x.roles, x.p.partName || x.p.id)).join("")}
      ${doneWos.map(x => engRow("workOrders", x.w, x.roles, `${x.w.id} ${x.w.partName || ""}`.trim())).join("")}</details>` : ""}`;

  // Money is visible to any member on the Budget tab already; a per-person
  // owed total is a new summary, and a guest has no business with it.
  const money = fb.guest ? "" : sec("Purchases", R.buys.length, `
    ${R.owed > 0.005 ? `<div class="powed">Waiting on reimbursement <b>$${R.owed.toFixed(2)}</b>
      <span class="muted tny">across ${plural(R.unpaid.length, "purchase", "purchases")}</span></div>` : `<div class="muted tny">Nothing waiting on reimbursement.</div>`}
    ${R.buys.slice(0, 25).map(b => `<div class="prow pbuy">${chip("budget", b.id, b.item || b.id)}
      <span class="pbuy-amt">${esc(b.cost ? "$" + num(b.cost).toFixed(2) : "")}</span>
      <span class="pill ${typeof buyStatusClass === "function" ? buyStatusClass(reimbStatus(b)) : ""}">${esc(typeof reimbStatus === "function" ? reimbStatus(b) : "")}</span></div>`).join("")}${R.buys.length > 25 ? `<p class="muted tny">and ${R.buys.length - 25} more on the Budget tab.</p>` : ""}`,
    "No purchases.");

  const buyoffs = sec("Recent buy-offs", R.buyoffs.length, R.buyoffs.slice(0, 15).map(x =>
    `<div class="prow">${chip("workOrders", x.w.id, x.w.id)} <span>${esc(x.s.title || "")}</span>
      <span class="muted tny">${esc(String(x.s.buyoff.date || x.when).slice(0, 10))}</span></div>`).join(""), "No buy-offs yet.");

  // Shop records route by their id prefix (a BIN lives on Inventory, not a
  // tab named after its collection), so these go through tabForId.
  const idChip = (id, label) => `<button type="button" class="chip" data-open="${esc(id)}"
    onclick="event.stopPropagation();openRecord(tabForId(this.dataset.open) || 'people', this.dataset.open)">${esc(label || id)}</button>`;
  const other = [
    ...R.molds.map(m => `<div class="prow">${idChip(m.id, m.name || m.id)} <span class="tny muted">sealed</span></div>`),
    ...R.bins.map(o => `<div class="prow">${idChip(o.id, o.name || o.id)} <span class="tny muted">bin confirmed</span></div>`),
    ...R.studies.map(s => `<div class="prow">${idChip(s.id, s.name || s.id)} <span class="tny muted">laid up</span></div>`),
  ];

  return `
  <div class="toolbar no-print">${personBackBtn()}</div>
  <div class="card phead">
    ${avatar(u || { email, name }, 56)}
    <div class="phead-txt">
      <h2>${esc(name)}${me ? ' <span class="muted tny">(you)</span>' : ""}</h2>
      <div class="muted tny">${u ? `<span class="pill">${esc(displayRole(u))}</span> ${esc(userHandle(email))}` : "No longer on the roster"}</div>
      ${u ? `<div class="trwrap" style="margin-top:6px"><span class="tny muted">Trainings</span> ${trainingPills(u)}
        ${isLead() ? `<button class="ib sm no-print" title="Edit ${esc(name)}'s trainings" onclick="openPersonTrainings(this.dataset.email)" data-email="${esc(email)}">${icon("edit", 13)}</button>` : ""}</div>` : ""}
    </div>
  </div>
  <div class="persgrid">
    ${sec("Engineering", R.parts.length + R.wos.length, engBody, "Not an engineer on any part or run.")}
    ${sec("Open issues", R.issues.length, R.issues.map(p => `<div class="prow">${chip("projects", p.id, p.title || p.id)}</div>`).join(""), "No open issues assigned.")}
    ${money}
    ${buyoffs}
    ${other.length ? sec("Also on record", other.length, other.join(""), "") : ""}
  </div>`;
}

/* ---------- unlinked names (leads) ----------
   Every record whose person field holds text and no email: the SN5 import's
   first names, and everything typed before the pickers existed. Two piles.
   "auto" is what personRef already resolves without argument (exact email,
   one full name, a first name only one account has; never a bare first name
   on a retro record), so the screen shows the right person today and the
   button only stores that answer. "groups" is the rest, one row per distinct
   text per kind of field, for a lead to say who it is or that it is somebody
   not on the app. Nothing here ever changes the name text or overwrites an
   email or "ext" already stored, so running it twice writes nothing. */
function personFieldRecs(f) {
  return (DB[f.coll] || []).filter(r => (f.coll !== "items" || r.cls === "BIN") && (f.coll !== "rnd" || r.cls === "RDS"));
}
function personFieldSrc(f, rec) { return f.path ? (rec[f.path] || null) : rec; }
function unlinkedScan() {
  const auto = [], groups = new Map();
  for (const f of PERSON_FIELDS) for (const rec of personFieldRecs(f)) {
    const src = personFieldSrc(f, rec);
    if (!src || String(src[f.key + "Email"] || "").trim()) continue;
    const ref = personRef(rec, f.key, src);
    if (ref.kind === "inferred") { auto.push({ f, rec, email: ref.email }); continue; }
    if (ref.kind !== "unlinked") continue;
    const k = f.fam + "|" + ref.name.toLowerCase();
    const g = groups.get(k) || { fam: f.fam, name: ref.name, items: [] };
    g.items.push({ f, rec });
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  // Who it might be, to put first in the list: the ambiguous candidates, or
  // on a retro record the one person the first-name rule would have picked.
  list.forEach(g => { const m = rosterMatch(g.name); g.maybe = !m ? [] : m.email ? [m.email] : m.ambiguous; });
  return { auto, groups: list };
}
function linkPatch(f, rec, email) {
  return { coll: f.coll, id: rec.id, fields: { [(f.path ? f.path + "." : "") + f.key + "Email"]: email } };
}
function linkLocal(f, rec, email) {
  if (f.path) rec[f.path] = { ...(rec[f.path] || {}), [f.key + "Email"]: email };
  else rec[f.key + "Email"] = email;
}
async function linkWrite(pairs, email) {
  const items = pairs.map(x => linkPatch(x.f, x.rec, x.email || email));
  try {
    await fb.patchMany(items);
    pairs.forEach(x => linkLocal(x.f, x.rec, x.email || email));
    return true;
  } catch (e) { toast("Couldn't link those: " + e.message, "error"); return false; }
}
async function linkUnambiguous() {
  if (!isLead() || guestBlocked()) return;
  const { auto } = unlinkedScan();
  if (!auto.length) return;
  const ok = await confirmAsync(`Store the person on ${plural(auto.length, "record", "records")} whose name already matches exactly one person on the roster? The names stay as typed; this only records who they are.`,
    { ok: "Link them", danger: false });
  if (!ok) return;
  if (await linkWrite(auto)) { toast(`Linked ${plural(auto.length, "record", "records")}.`); render(); }
}
async function linkGroupAt(i, notOnApp) {
  if (!isLead() || guestBlocked()) return;
  const g = (window.__unlinked || [])[i];
  if (!g) return;
  const sel = document.getElementById("ul-sel-" + i);
  const email = notOnApp ? PERSON_EXT : String((sel && sel.value) || "").toLowerCase();
  if (!email) { toast("Pick who this is first.", "info"); return; }
  if (await linkWrite(g.items, email)) {
    toast(notOnApp ? `"${g.name}" marked as not on the app.` : `"${g.name}" linked to ${userName(email)} on ${plural(g.items.length, "record", "records")}.`);
    render();
  }
}
function unlinkedRecChip(rec) {
  const label = rec.item || rec.partName || rec.name || rec.id;
  return `<button type="button" class="chip" data-open="${esc(rec.id)}"
    onclick="event.stopPropagation();openRecord(tabForId(this.dataset.open) || 'people', this.dataset.open)">${esc(label)}</button>`;
}
function renderUnlinked(U) {
  window.__unlinked = U.groups;
  const users = usersSorted();
  const where = (g) => {
    const n = new Map();
    g.items.forEach(x => n.set(x.f.label, (n.get(x.f.label) || 0) + 1));
    return [...n.entries()].map(([l, c]) => `${l} ×${c}`).join(", ");
  };
  const autoCard = U.auto.length ? `<div class="card">
    <h3 style="margin-top:0">${plural(U.auto.length, "record", "records")} can link themselves</h3>
    <p class="muted tny">Each of these names matches exactly one person on the roster (an exact email, a full name, or a
      first name nobody else has), and the app already shows them as that person. Linking stores the answer so it holds
      even if somebody else with that first name joins later.</p>
    <button class="primary" onclick="linkUnambiguous()">Link ${plural(U.auto.length, "record", "records")}</button></div>` : "";
  if (!U.groups.length) return autoCard + `<div class="card"><p class="muted">${U.auto.length ? "Nothing else needs a person." : "Every name in the app is linked to somebody, or marked as not on the app."}</p></div>`;
  return autoCard + `<div class="card">
    <h3 style="margin-top:0">${plural(U.groups.length, "name", "names")} nobody could match</h3>
    <p class="muted tny">Typed names that fit nobody on the roster, or fit more than one person. Pick who each one is, or
      mark it as somebody not on the app. It applies to every record with that exact name in that kind of field.
      Retro SN5 records never link on a first name alone, since last season's Nick may not be this season's.</p>
    <div class="ulist">${U.groups.map((g, i) => {
      const maybe = g.maybe.filter(e => userByEmail(e));
      const rest = users.filter(u => !maybe.includes(u.email));
      return `<div class="ulrow">
        <div class="ulname"><span class="pchip ext"><span>${esc(g.name)}</span></span>
          <div class="tny muted">${esc(where(g))}</div></div>
        <div class="ulrecs">${g.items.slice(0, 4).map(x => unlinkedRecChip(x.rec)).join(" ")}${g.items.length > 4 ? ` <span class="tny muted">+${g.items.length - 4}</span>` : ""}</div>
        <div class="ulact">
          <select id="ul-sel-${i}" aria-label="Who is this">
            <option value="">Who is this?</option>
            ${maybe.length ? `<optgroup label="Could be">${maybe.map(e => `<option value="${esc(e)}">${esc(userName(e))}</option>`).join("")}</optgroup>` : ""}
            <optgroup label="Everyone">${rest.map(u => `<option value="${esc(u.email)}">${esc(u.name || u.email)}</option>`).join("")}</optgroup>
          </select>
          <button class="sm primary" onclick="linkGroupAt(${i})">Link</button>
          <button class="sm" onclick="linkGroupAt(${i}, true)">Not on the app</button>
        </div></div>`;
    }).join("")}</div></div>`;
}

/* The matrix: rows = people (the search and qualified-for filter still filter
   ROWS — you toggled to the matrix to see every column, so the filter
   highlights its column instead of hiding the rest), columns = the catalog.
   Coverage counts under each code are over the FULL roster, never the
   filtered rows: they read as an integrity stat and a searchbox must not be
   able to falsify one. Archived columns appear only behind the explicit
   checkbox, dimmed, and never grant — a lead can still revoke there.
   Lead cells are buttons straight onto togglePersonTraining (the same write
   path as the modals); members get inert cells with provenance in the title.
   The wrapper owns the horizontal scroll (the page must never scroll
   sideways) and the person column is sticky so names survive the scroll. */
function renderPeopleMatrix(rows) {
  const cols = allTrainings().concat(view.pplArch ? allTrainings(true).filter(t => t.archived) : []);
  const total = usersSorted().length;
  if (!cols.length) return `<div class="card">No trainings in the catalog yet.</div>`;
  const anyGrant = usersSorted().some(u => Object.keys(u.trainings || {}).length);
  return `<div class="card"><div class="mtxwrap">
  <table class="list dash mtx">
    <tr><th class="mtxperson">Person</th>
      ${cols.map(t => `<th class="${t.archived ? "mtxcol-arch" : ""} ${view.fTrain === t.id ? "mtxcol-hi" : ""}"
        title="${esc(t.name)}${t.cs ? " · " + esc(t.cs) : ""}${t.archived ? " · archived" : ""}">
        <span class="tpill">${esc(t.code)}</span>
        <div class="tny muted">${qualifiedFor(t.id).length}/${total}</div></th>`).join("")}</tr>
    ${rows.map(u => {
      const me = u.email === myEmail();
      return `<tr>
        <td class="mtxperson"><div style="display:flex;align-items:center;gap:8px">${avatar(u.email, 22)}
          <span class="pname">${esc(u.name || u.email)}${me ? ' <span class="muted tny">(you)</span>' : ""}</span></div></td>
        ${cols.map(t => {
          const g = (u.trainings || {})[t.id];
          const tip = g ? `${esc(t.name)} — granted by ${esc(userName(g.by))}${g.at ? ", " + esc(String(g.at).slice(0, 10)) : ""}${isLead() ? " — click to revoke" : ""}`
            : t.archived ? `${esc(t.name)} is archived — no new grants`
              : `not certified${isLead() ? " — click to certify" : ""}`;
          const cls = `mtxcell ${g ? "granted" : ""} ${t.archived ? "mtxcol-arch" : ""} ${view.fTrain === t.id ? "mtxcol-hi" : ""}`;
          // Grant affordance is gated on !archived; a granted cell in an
          // archived column stays revocable so archiving can never trap data.
          if (isLead() && (g || !t.archived)) {
            // The affordance is a pill, not a bare glyph: a dashed ＋ capsule
            // reads as "somewhere a grant goes", the filled ✓ capsule as the
            // grant itself (Simon: the bare ＋ was too subtle).
            return `<td class="${view.fTrain === t.id ? "mtxcol-hi" : ""} ${t.archived ? "mtxcol-arch" : ""}"><button type="button" class="${cls}" title="${tip}"
              aria-label="${esc(u.name || u.email)} — ${esc(t.name)}"
              onclick="togglePersonTraining('${esc(u.email)}','${esc(t.id)}',${g ? "false" : "true"})">${g ? '<span class="tpill mtx-yes">✓</span>' : '<span class="tpill mtx-add">＋</span>'}</button></td>`;
          }
          return `<td class="mtxro ${view.fTrain === t.id ? "mtxcol-hi" : ""} ${t.archived ? "mtxcol-arch" : ""}" title="${tip}">${g ? '<span class="ok">✓</span>' : '<span class="muted">·</span>'}</td>`;
        }).join("")}
      </tr>`;
    }).join("")}
  </table></div>
  ${!anyGrant ? `<div class="muted tny" style="margin-top:6px">No trainings granted yet${isLead() ? " — click a cell to certify someone." : "."}</div>` : ""}
  </div>`;
}

/* ---------- granting trainings (leads) ----------
   Two surfaces for one write path (three, counting the matrix cells). The
   session modal is the real event — one training, several people certified
   at once after a training night. The per-person modal is for corrections
   and revokes. All go through fb.rosterGrant/rosterRevoke (dot-path writes
   on the roster doc; the rules already reject a member writing trainings on
   their own doc). */
function openPersonTrainings(email) {
  const u = userByEmail(email);
  if (!u) return;
  const rows = allTrainings().map(t => {
    const g = (u.trainings || {})[t.id];
    return `<label class="trrow">
      <input type="checkbox" ${g ? "checked" : ""} onchange="togglePersonTraining('${esc(email)}','${esc(t.id)}',this.checked)">
      <span><b>${esc(t.name)}</b> <span class="tpill">${esc(t.code)}</span>
        ${g ? `<br><span class="muted tny">granted by ${esc(userName(g.by))}${g.at ? ", " + esc(String(g.at).slice(0, 10)) : ""}</span>` : ""}</span>
    </label>`;
  }).join("");
  openModal(`
    <h2>${esc(u.name || email)} — trainings</h2>
    <p class="muted">Each change saves as you make it. Unchecking revokes.</p>
    ${rows}
    <div class="foot"><button onclick="closeModal()">Done</button></div>
  `);
}
async function togglePersonTraining(email, id, on) {
  try {
    if (on) await fb.rosterGrant(email, id);
    else await fb.rosterRevoke(email, id);
    toast(`${userName(email)} ${on ? "certified for" : "no longer holds"} ${trainingById(id).name}.`);
  } catch (e) { toast("Couldn't update training: " + e.message, "error"); render(); }
}
function openTrainingSession() {
  pickerInit("ts", usersSorted().map(u => ({ value: u.email, label: u.name || u.email, sublabel: u.email, avatarEmail: u.email })), []);
  openModal(`
    <h2>Record a training session</h2>
    <p class="muted">One training, everyone who was there. Each person's record notes who granted it and when.</p>
    <div class="field"><label for="ts-training">Training</label>
      <select id="ts-training">${allTrainings().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Who was trained</label>${pickerField("ts")}</div>
    <div class="foot">
      <button onclick="closeModal()">Cancel</button>
      <button class="primary" onclick="saveTrainingSession()">Certify</button>
    </div>
  `);
}
async function saveTrainingSession() {
  const sel = document.getElementById("ts-training");
  const id = sel ? sel.value : "";
  const people = pickerValues("ts");
  if (!id || !people.length) { toast("Pick the training and at least one person.", "error"); return; }
  closeModal();
  try {
    for (const email of people) await fb.rosterGrant(email, id);
    toast(`${people.length} ${people.length === 1 ? "person" : "people"} certified for ${trainingById(id).name}.`);
  } catch (e) { toast("Couldn't record the session: " + e.message, "error"); }
}

function setRole(email, role) {
  const u = userByEmail(email);
  fb.rosterSet(email, (u && u.name) || email, role).then(() => toast(userName(email) + " is now " + role + ".")).catch(e => toast("Couldn't change role: " + e.message, "error"));
}

/* ---------- the catalog editor (leads) ----------
   Writes config/trainings whole-map through fb.setConfig, the resin-hold
   shape. Ids are minted here once (slug of the name, suffixed on collision)
   and never shown for editing. Codes are required, ≤4 chars, and unique
   case-insensitively across unarchived entries — two columns both reading
   "INF" would make the matrix unreadable. Customs archive and restore;
   built-ins rename only. */
function trSlug(name) {
  let base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "training";
  let id = base, n = 2;
  while (Object.prototype.hasOwnProperty.call(TRAININGS, id) || (window.TRAINING_OVERRIDES || {})[id]) id = base + "-" + (n++);
  return id;
}
function trCodeSuggest(name) {
  return String(name).replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
}
function trCodeTaken(code, exceptId) {
  const c = String(code).trim().toUpperCase();
  return allTrainings(true).some(t => !t.archived && t.id !== exceptId && t.code.toUpperCase() === c);
}
async function trSaveOverride(id, entry) {
  const next = { ...(window.TRAINING_OVERRIDES || {}), [id]: entry };
  await fb.setConfig("trainings", next);
  window.TRAINING_OVERRIDES = next;
}
function openTrainingCatalog() {
  if (!isLead()) return;
  const rows = allTrainings(true).map(t => `
    <tr class="${t.archived ? "mtxcol-arch" : ""}">
      <td>${esc(t.name)}${t.builtin ? ' <span class="muted tny">built-in</span>' : ""}${t.archived ? ' <span class="muted tny">archived</span>' : ""}</td>
      <td><span class="tpill">${esc(t.code)}</span></td>
      <td>${t.cs ? esc(t.cs) : '<span class="muted tny">—</span>'}</td>
      <td>${qualifiedFor(t.id).length}</td>
      <td class="rowact"><button class="sm" onclick="openTrainingEdit('${esc(t.id)}')">Edit</button>
        ${t.builtin ? "" : t.archived
          ? `<button class="sm" onclick="setTrainingArchived('${esc(t.id)}',false)">Restore</button>`
          : `<button class="sm" onclick="setTrainingArchived('${esc(t.id)}',true)">Archive</button>`}</td>
    </tr>`).join("");
  openModal(`
    <h2>Training catalog</h2>
    <p class="muted">Renames reach every pill, gate and matrix header at once. Nothing is ever deleted —
      archiving hides a training from new grants while everyone who holds it keeps it.
      A new training gates no steps until a step template references it.</p>
    <table class="sub"><thead><tr><th>Training</th><th>Code</th><th>CS standard</th><th>Holds it</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>
    <h3>Add a training</h3>
    <div class="field"><label for="tc-name">Name</label><input id="tc-name" placeholder="e.g. Trimming and finishing" oninput="const c=document.getElementById('tc-code'); if(c && !c.dataset.touched) c.value=trCodeSuggest(this.value)"></div>
    <div class="row2">
      <div class="field"><label for="tc-code">Code (pill, ≤4 chars)</label><input id="tc-code" maxlength="4" oninput="this.dataset.touched=1" style="text-transform:uppercase"></div>
      <div class="field"><label for="tc-cs">CS standard (optional)</label><input id="tc-cs" placeholder="CS-009"></div>
    </div>
    <div class="foot">
      <button onclick="closeModal()">Close</button>
      <button class="primary" onclick="submitTrainingAdd()">Add training</button>
    </div>
  `);
}
async function submitTrainingAdd() {
  const name = (document.getElementById("tc-name") || {}).value || "";
  const code = ((document.getElementById("tc-code") || {}).value || "").trim().toUpperCase();
  const cs = ((document.getElementById("tc-cs") || {}).value || "").trim();
  if (!name.trim()) { toast("Name the training.", "error"); return; }
  if (!code) { toast("Give it a short code — the pills and matrix headers need one.", "error"); return; }
  if (trCodeTaken(code, null)) { toast(`The code ${code} is taken — two identical column headers would be unreadable.`, "error"); return; }
  const id = trSlug(name);
  try {
    await trSaveOverride(id, { name: name.trim(), code, cs: cs || null, archived: false, addedBy: myEmail(), addedAt: new Date().toISOString() });
    toast(`${name.trim()} is in the catalog.`);
    openTrainingCatalog(); render();
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}
function openTrainingEdit(id) {
  if (!isLead()) return;
  const t = trainingById(id);
  const overridden = !!((window.TRAINING_OVERRIDES || {})[id]) && t.builtin;
  openModal(`
    <h2>${esc(t.name)}</h2>
    ${t.builtin ? '<p class="muted tny">Built-in: the id and its step-template references live in code; the name, code and CS link are yours.</p>' : ""}
    <div class="field"><label for="te-name">Name</label><input id="te-name" value="${esc(t.name)}"></div>
    <div class="row2">
      <div class="field"><label for="te-code">Code</label><input id="te-code" maxlength="4" value="${esc(t.code)}" style="text-transform:uppercase"></div>
      <div class="field"><label for="te-cs">CS standard</label><input id="te-cs" value="${esc(t.cs || "")}" placeholder="CS-009"></div>
    </div>
    <div class="foot">
      ${overridden ? `<button class="danger" onclick="revertTrainingOverride('${esc(id)}')">Revert to built-in</button>` : ""}
      <button onclick="openTrainingCatalog()">Back</button>
      <button class="primary" onclick="submitTrainingEdit('${esc(id)}')">Save</button>
    </div>
  `);
}
async function submitTrainingEdit(id) {
  const t = trainingById(id);
  const name = ((document.getElementById("te-name") || {}).value || "").trim();
  const code = ((document.getElementById("te-code") || {}).value || "").trim().toUpperCase();
  const cs = ((document.getElementById("te-cs") || {}).value || "").trim();
  if (!name) { toast("A training needs a name.", "error"); return; }
  if (!code) { toast("A training needs a code.", "error"); return; }
  if (trCodeTaken(code, id)) { toast(`The code ${code} is taken.`, "error"); return; }
  const prev = (window.TRAINING_OVERRIDES || {})[id];
  const keep = prev && typeof prev === "object" ? prev : {};
  try {
    await trSaveOverride(id, { ...keep, name, code, cs: cs || null, archived: t.builtin ? false : (t.archived || false) });
    toast(`${name} saved.`);
    openTrainingCatalog(); render();
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}
/* Revert writes null rather than deleting the key: setConfig merges, and a
   merge cannot remove a field. trainingById treats a null override as absent. */
async function revertTrainingOverride(id) {
  try {
    await trSaveOverride(id, null);
    toast("Back to the built-in name.");
    openTrainingCatalog(); render();
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}
async function setTrainingArchived(id, on) {
  const t = trainingById(id);
  if (t.builtin) return; // step templates reference these in code
  const prev = (window.TRAINING_OVERRIDES || {})[id];
  const keep = prev && typeof prev === "object" ? prev : { name: t.name, code: t.code, cs: t.cs };
  try {
    await trSaveOverride(id, { ...keep, archived: !!on });
    toast(on ? `${t.name} archived — existing grants stay on the record.` : `${t.name} restored.`);
    openTrainingCatalog(); render();
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}
