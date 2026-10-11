#!/usr/bin/env python3
"""Traceability audit for the SN6 Resources program (effectiveness test 5).

Asserts:
 1. Every PP-01..PP-10 in pain-points.md has a traceability-table row naming
    an owning deliverable (a CS-xxx or the WO system).
 2. Every CS doc cites at least one PP-xx, SN5 source doc, or datasheet.
 3. Every csRef / standardsRefs in the retro work orders resolves to a real CS doc.
 4. Every datasheet file cited in CS References tables exists in 03 Datasheets/.
 5. CS-INDEX rows match the actual CS source files (IDs and titles).

Document lints (added 2026-10-10 for the documentation overhaul; rules in
02 CS Standards/STYLE.md §4-§6). WARN by default, FAIL under --strict:
 6. Header Revision and Status agree with the CS-INDEX row (status compared by
    keyword: Draft / Released / Under Revision / Retired). A blank Approver
    row is never Released.
 7. Revision history letters run A, B, C... in order; the last row's letter
    is the header Revision and its date is the Effective date.
 8. A standard whose body changed since the base ref (the newest v* tag, or
    --base REF) also bumped its Revision, unless src/rev-exemptions.txt
    excuses it ("CS-006 C  path fix after the folder renumbering").
 9. Em dashes in prose (headers, tables and the H1 excluded). Always a
    warning: Simon's own text keeps its em dashes.
10. Quick references (src/QR-*.md): Parent resolves to a standard and a
    section, "Checked against" names the parent's current Rev, and Covers
    names files that exist.
11. Every "CS-0xx §n.n" in the standards, quick references and the app's
    code resolves to a heading (or to a numbered step of one).
12. Every figure a document references exists, and its PNG was rendered
    from the current SVG (figures/.hashes.json, written by render_figures).

Exit 0 = all pass; prints a report either way.
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CS_DIR = ROOT / "02 CS Standards" / "src"
PP = (ROOT / "01 Pain Points and Improvements" / "src" / "pain-points.md").read_text(encoding="utf-8")
DS_DIR = ROOT / "03 Datasheets"

fails = []
warns = []
STRICT = "--strict" in sys.argv


def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok:
        fails.append(msg)


def lint(ok, msg):
    """A document lint: a warning until --strict makes it a failure."""
    if ok:
        return
    if STRICT:
        print("FAIL " + msg)
        fails.append(msg)
    else:
        print("WARN " + msg)
        warns.append(msg)


# 1. PP coverage in traceability table
trace = PP.split("## 5. Traceability")[1].split("## 6.")[0]
for i in range(1, 11):
    pp = f"PP-{i:02d}"
    row = next((l for l in trace.splitlines() if l.strip().startswith(f"| {pp}")), "")
    check(bool(row) and ("CS-" in row or "WO system" in row),
          f"{pp} has a traceability row with an owning deliverable")

# 2. every CS doc cites a PP / SN5 source / datasheet
cs_files = sorted(CS_DIR.glob("CS-*.md"))
cs_ids = set()
for f in cs_files:
    t = f.read_text(encoding="utf-8")
    m = re.match(r"CS-(\d{3})", f.name)
    if m:
        cs_ids.add(f"CS-{m.group(1)}")
    if f.name == "CS-INDEX.md":
        continue
    cited = bool(re.search(r"PP-\d{2}", t) or "SN5 Composites/" in t or "03 Datasheets/" in t)
    check(cited, f"{f.name} cites at least one PP / SN5 doc / datasheet")

# 3. WO refs resolve
wos = json.loads((ROOT / "06 Composites App" / "data" / "sn5-work-orders.json").read_text(encoding="utf-8"))
bad_refs = set()
for w in wos:
    for ref in w.get("standardsRefs", []):
        if ref not in cs_ids:
            bad_refs.add(ref)
    for s in w.get("steps", []):
        r = s.get("csRef", "")
        if r and r.split("/")[0] not in cs_ids:
            bad_refs.add(r)
check(not bad_refs, f"all WO standards/step refs resolve to real CS docs {sorted(bad_refs) if bad_refs else ''}")
check(len(wos) == 26, f"retro WO count == 26 (got {len(wos)})")

# 4. cited datasheet files exist
missing = set()
for f in cs_files:
    for m in re.finditer(r"03 Datasheets/([\w .\-'&]+\.pdf)", f.read_text(encoding="utf-8")):
        if not (DS_DIR / m.group(1)).exists():
            missing.add(m.group(1))
check(not missing, f"all cited datasheet PDFs exist {sorted(missing) if missing else ''}")

# 5. CS-INDEX rows match files
index = (CS_DIR / "CS-INDEX.md").read_text(encoding="utf-8")
for f in cs_files:
    if f.name == "CS-INDEX.md":
        continue
    doc_id = f.name[:-3]
    title = f.read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
    title_body = title.split(" ", 1)[1]
    row = next((l for l in index.splitlines() if l.strip().startswith(f"| {doc_id} ")), "")
    check(bool(row) and title_body.split(" (")[0] in row,
          f"CS-INDEX row matches {doc_id} ({title_body[:40]}…)")

# ---------------------------------------------------------------------------
# Document lints (6-12)

def header_field(text, name):
    m = re.search(rf"^\|\s*\*\*{re.escape(name)}\*\*\s*\|\s*(.*?)\s*\|\s*$", text, re.M)
    return m.group(1).strip() if m else None


def status_kw(s):
    s = (s or "").lower()
    for kw in ("under revision", "retired", "released", "draft"):
        if kw in s:
            return kw
    return s


def history_rows(text):
    part = text.split("**Revision history**", 1)
    if len(part) < 2:
        return []
    rows = []
    for line in part[1].splitlines():
        if line.startswith("---") or line.startswith("## "):
            break
        m = re.match(r"^\|\s*([A-Z])\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|", line)
        if m:
            rows.append((m.group(1), m.group(2)))
    return rows


def body_of(text):
    """Everything from the first numbered section on: the part a revision
    bump is about. The header tables are bookkeeping."""
    m = re.search(r"^## 1\.", text, re.M)
    return text[m.start():] if m else text


def headings(text):
    """{"7.2": [step texts...]} for every numbered ##/### heading."""
    out, cur = {}, None
    for line in text.splitlines():
        h = re.match(r"^#{2,4}\s+(\d+(?:\.\d+)*)\.?\s", line)
        if h:
            cur = h.group(1)
            out[cur] = []
            continue
        if cur and re.match(r"^\d+\.\s", line):
            out[cur].append(line)
    return out


std_files = [f for f in cs_files if f.name != "CS-INDEX.md"]
texts = {f.stem: f.read_text(encoding="utf-8") for f in std_files}
qr_files = sorted(CS_DIR.glob("QR-*.md"))
qr_texts = {f.stem: f.read_text(encoding="utf-8") for f in qr_files}

# 6 + 7. header, INDEX, history
for doc, t in texts.items():
    rev = header_field(t, "Revision")
    status = header_field(t, "Status")
    eff = header_field(t, "Effective date")
    row = next((l for l in index.splitlines() if l.strip().startswith(f"| {doc} ")), "")
    cells = [c.strip() for c in row.strip().strip("|").split("|")] if row else []
    if len(cells) >= 4:
        lint(cells[2] == rev, f"{doc}: header Rev {rev} matches CS-INDEX Rev {cells[2]}")
        lint(status_kw(cells[3]) == status_kw(status),
             f"{doc}: header status ({status_kw(status)}) matches CS-INDEX ({status_kw(cells[3])})")
    approver = re.search(r"^\|\s*Approver[^|]*\|\s*([^|]*)\|", t, re.M)
    lint(not (status_kw(status) == "released" and approver and not approver.group(1).strip()),
         f"{doc}: not Released with a blank Approver row (CS-000 §4)")
    rows = history_rows(t)
    letters = [r[0] for r in rows]
    lint(letters == [chr(ord("A") + i) for i in range(len(letters))] and bool(letters),
         f"{doc}: revision history runs A, B, C... in order (got {''.join(letters)})")
    if rows:
        lint(rows[-1][0] == rev, f"{doc}: last history row ({rows[-1][0]}) is the header Revision ({rev})")
        lint(rows[-1][1] == eff, f"{doc}: last history row date ({rows[-1][1]}) is the Effective date ({eff})")

# 8. body changed without a bump
base = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--base=")), None)
if not base:
    tags = subprocess.run(["git", "tag", "-l", "v*", "--sort=-v:refname"], cwd=ROOT,
                          capture_output=True, text=True).stdout.split()
    base = tags[0] if tags else "HEAD"
exempt_file = CS_DIR / "rev-exemptions.txt"
exempt = set()
if exempt_file.exists():
    for line in exempt_file.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(CS-\d{3})\s+([A-Z])\b", line.strip())
        if m:
            exempt.add((m.group(1), m.group(2)))
for f in std_files:
    rel = f.relative_to(ROOT).as_posix()
    old = subprocess.run(["git", "show", f"{base}:{rel}"], cwd=ROOT, capture_output=True, text=True)
    if old.returncode != 0:
        continue  # new since the base: nothing to compare against
    rev_now, rev_then = header_field(texts[f.stem], "Revision"), header_field(old.stdout, "Revision")
    changed = body_of(old.stdout) != body_of(texts[f.stem])
    lint(not changed or rev_now != rev_then or (f.stem, rev_now) in exempt,
         f"{f.stem}: body changed since {base} without a revision bump (Rev {rev_now})")

# 9. em dashes in prose
for doc, t in {**texts, **qr_texts}.items():
    n = sum(l.count("\u2014") for l in body_of(t).splitlines() if not l.lstrip().startswith(("|", "#")))
    if n:
        print(f"WARN {doc}: {n} em dash(es) in prose (STYLE.md §2; Simon's own text may keep them)")

# 10. quick references
for doc, t in qr_texts.items():
    parent = header_field(t, "Parent")
    checked = header_field(t, "Checked against")
    covers = header_field(t, "Covers")
    if covers:
        for path in re.findall(r"`([^`]+)`", covers) or [covers]:
            lint((ROOT / "06 Composites App" / path).exists() or (ROOT / path).exists(),
                 f"{doc}: Covers names a file that exists ({path})")
        continue
    m = re.match(r"(CS-\d{3})\s*§\s*([\d.]+)", parent or "")
    lint(bool(m), f"{doc}: header names a Parent like 'CS-008 §5.1' (got {parent!r})")
    if not m:
        continue
    pdoc, psec = m.group(1), m.group(2).rstrip(".")
    lint(pdoc in texts and psec in headings(texts.get(pdoc, "")),
         f"{doc}: Parent {pdoc} §{psec} resolves to a heading")
    prev = header_field(texts.get(pdoc, ""), "Revision")
    cm = re.match(r"(CS-\d{3})\s+Rev\s+([A-Z])", checked or "")
    lint(bool(cm) and cm.group(1) == pdoc and cm.group(2) == prev,
         f"{doc}: checked against {checked!r}, parent is now {pdoc} Rev {prev}")

# 11. section cross-references
heads = {doc: headings(t) for doc, t in texts.items()}
ref_files = std_files + qr_files + sorted((ROOT / "06 Composites App" / "app").glob("*.js")) \
    + sorted((ROOT / "06 Composites App" / "functions").glob("*.js"))
bad = {}
for f in ref_files:
    for m in re.finditer(r"(CS-\d{3}) §(\d+(?:\.\d+)*)", f.read_text(encoding="utf-8", errors="ignore")):
        doc, sec = m.group(1), m.group(2)
        h = heads.get(doc)
        if h is None:
            ok = False
        elif sec in h:
            ok = True
        else:
            # §7.1.6 = step 6 of §7.1
            parent_sec, _, step = sec.rpartition(".")
            ok = bool(parent_sec) and parent_sec in h and step.isdigit() and int(step) <= len(h[parent_sec])
        if not ok:
            bad.setdefault(f"{doc} §{sec}", set()).add(f.name)
for ref, where in sorted(bad.items()):
    lint(False, f"cross-reference {ref} does not resolve (in {', '.join(sorted(where))})")
if not bad:
    print("PASS every CS-0xx §n.n reference resolves")

# 12. figures exist and are current
FIG = CS_DIR / "figures"
hashes = json.loads((FIG / ".hashes.json").read_text()) if (FIG / ".hashes.json").exists() else {}
for doc, t in {**texts, **qr_texts}.items():
    for png in re.findall(r"\]\(figures/([^)]+\.png)\)", t):
        lint((FIG / png).exists(), f"{doc}: figure {png} exists")
        svg = FIG / png.replace(".png", ".svg")
        if svg.exists():
            digest = hashlib.sha256(svg.read_text(encoding="utf-8").encode()).hexdigest()
            lint(hashes.get(png) == digest, f"{doc}: {png} was rendered from the current SVG (run node tools/render_figures.mjs)")

print()
if warns:
    print(f"{len(warns)} document lint warning(s); --strict makes them failures")
if fails:
    print(f"{len(fails)} FAILURES")
    sys.exit(1)
print("ALL TRACEABILITY CHECKS PASS")
