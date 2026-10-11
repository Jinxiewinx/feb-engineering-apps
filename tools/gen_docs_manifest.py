#!/usr/bin/env python3
"""Bundle the team's reference docs into the app so the Documents tab can open
them in-browser. Copies into `06 Composites App/app/docs/` and writes manifest.json.

- Datasheets (public manufacturer PDFs)  -> docs/datasheets/*.pdf   (kind: pdf)
- CS standards (our markdown + built docx) -> docs/standards/*        (kind: md, with docx download)
- Pain points (markdown + docx)            -> docs/standards/         (kind: md)
- Printables                               -> docs/printables.html    (kind: html)

Re-run any time the source docs change. Safe to re-run (overwrites).

NOTE: everything here is always COPIED into docs/; UNLISTED below decides what
is advertised in the Documents tab. The files have to keep existing either way,
because other parts of the app deep-link them by path.

  2026-08-18  datasheets and CS standards unlisted, at Simon's request.
  2026-08-26  datasheets listed again, at Simon's request. Shop Printables
              unlisted the same day. Standards stay unlisted.
  2026-10-10  quick references (src/QR-*.md) join the standards: copied and
              rendered to PDF so Paul's source chips open them, and unlisted
              like the standards. A PDF that fails to render now fails the
              run instead of silently shipping the raw markdown.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path

RES = Path(__file__).resolve().parent.parent          # SN6 Resources/
APP = RES / "06 Composites App" / "app"
DOCS = APP / "docs"

for sub in ("datasheets", "standards"):
    (DOCS / sub).mkdir(parents=True, exist_ok=True)

manifest = []

# Categories that are copied into docs/ but NOT advertised in the app.
#
# Unlisted rather than deleted, and the distinction matters: resins.js
# hardcodes six `docs/datasheets/*.pdf` paths for its TDS citations, and CS-000
# requires a standard to stay retrievable once it has been issued. Removing the
# files would break the first and violate the second, so the manifest entry is
# what goes — the bytes stay exactly where they were.
#
# Add or remove a category name to change what the tab shows; nothing else
# needs changing.
#
# "Guides" is only ever Shop Printables (section 4 below). If a second guide is
# ever added it will be unlisted too, silently — split the category before
# adding one, rather than wondering later why it never appeared.
UNLISTED = {"Standards", "Quick reference", "Guides"}


def add(entry):
    """Copy always, list only if the category is not unlisted."""
    if entry["category"] not in UNLISTED:
        manifest.append(entry)


def title_from_md(md_path):
    for line in md_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return md_path.stem


def prettify(fn):
    s = re.sub(r"[-_]+", " ", Path(fn).stem)
    return re.sub(r"\s+", " ", s).strip()


# Reproducible PDFs: without these every rebuild stamps a new creation date
# into every PDF, so an unchanged standard shows up as a changed file and the
# corpus freshness check cannot tell real edits from churn.
PDF_ENV = dict(os.environ, SOURCE_DATE_EPOCH="1767225600", FORCE_SOURCE_DATE="1")
pdf_failures = []


def _pin_pdf_id(pdf_path):
    """xdvipdfmx derives the trailer /ID from pandoc's random temp directory,
    so even with the dates pinned two builds differ in 32 hex digits. Replace
    it with a hash of the content (same length, so the xref offsets hold)."""
    import hashlib
    b = pdf_path.read_bytes()
    pat = re.compile(rb"/ID\[<([0-9a-fA-F]{32})><([0-9a-fA-F]{32})>\]")
    zeroed = pat.sub(b"/ID[<" + b"0" * 32 + b"><" + b"0" * 32 + b">]", b)
    h = hashlib.md5(zeroed).hexdigest().encode()
    pdf_path.write_bytes(pat.sub(b"/ID[<" + h + b"><" + h + b">]", b))


def md_to_pdf(md_path, pdf_path):
    """Render a CS/QR/pain-points markdown to PDF via pandoc + xelatex (has the
    Unicode glyphs §/≤/° our docs use). Returns True on success. A failure is
    recorded in pdf_failures and fails the run at the end: falling back to the
    markdown used to leave the previous PDF on disk, which the corpus then
    kept pointing at, so a broken build looked like a stale-but-fine one."""
    # xelatex's default (Latin Modern) has the §/≤/°/→ glyphs our docs use; don't
    # override the font (Helvetica lacks the arrows).
    last = ["empty PDF"]
    for engine in ("xelatex", "pdflatex"):
        try:
            subprocess.run(
                ["pandoc", str(md_path), "-o", str(pdf_path),
                 f"--pdf-engine={engine}", "-V", "geometry:margin=1in",
                 # figures are named relative to the markdown (figures/*.png);
                 # pandoc resolves them against the CWD unless told otherwise
                 "--resource-path", str(md_path.parent),
                 "-V", "colorlinks=true"],
                check=True, capture_output=True, timeout=120, env=PDF_ENV)
            if pdf_path.exists() and pdf_path.stat().st_size > 0:
                _pin_pdf_id(pdf_path)
                return True
        except Exception as e:
            err = getattr(e, "stderr", b"") or str(e).encode()
            last = err.decode(errors="ignore").strip().splitlines()[-1:] or [""]
            continue
    pdf_failures.append(f"{md_path.name}: {last[0]}")
    return False


# 1. Datasheets (PDF)
ds_dir = RES / "03 Datasheets"
for pdf in sorted(ds_dir.glob("*.pdf")):
    dst = DOCS / "datasheets" / pdf.name
    shutil.copy2(pdf, dst)
    add({"category": "Datasheets", "title": prettify(pdf.name),
         "kind": "pdf", "src": f"docs/datasheets/{pdf.name}",
         "size": dst.stat().st_size})

# 2. CS Standards — render to PDF (open in-app like datasheets), keep md as a
#    fallback + docx for download.
cs_src = RES / "02 CS Standards" / "src"
cs_docx_dir = RES / "02 CS Standards"
n_pdf = 0
# The figures the standards embed ride along, so the app's markdown fallback
# can resolve the same relative paths the source markdown uses.
fig_src = cs_src / "figures"
if fig_src.exists():
    fig_dst = DOCS / "standards" / "figures"
    fig_dst.mkdir(parents=True, exist_ok=True)
    for png in sorted(fig_src.glob("*.png")):
        shutil.copy2(png, fig_dst / png.name)
for md in sorted(cs_src.glob("CS-*.md")) + sorted(cs_src.glob("QR-*.md")):
    shutil.copy2(md, DOCS / "standards" / md.name)
    category = "Quick reference" if md.name.startswith("QR-") else "Standards"
    entry = {"category": category, "title": title_from_md(md), "kind": "md",
             "src": f"docs/standards/{md.name}", "size": md.stat().st_size}
    pdf = DOCS / "standards" / (md.stem + ".pdf")
    if md_to_pdf(md, pdf):
        n_pdf += 1
        entry.update(kind="pdf", src=f"docs/standards/{pdf.name}", size=pdf.stat().st_size)
    csid = md.stem  # e.g. CS-004
    # The docx build names its output "<H1>.docx", so pick by that exact name
    # first: a title change leaves the old docx behind, and a bare glob could
    # grab it.
    exact = cs_docx_dir / (re.sub(r"[/:]", "-", title_from_md(md)) + ".docx")
    docx = exact if exact.exists() else next((d for d in sorted(cs_docx_dir.glob(f"{csid} *.docx"))), None)
    if docx:
        shutil.copy2(docx, DOCS / "standards" / docx.name)
        entry["docx"] = f"docs/standards/{docx.name}"
    add(entry)

# 3. Pain points
pp_md = RES / "01 Pain Points and Improvements" / "src" / "pain-points.md"
if pp_md.exists():
    shutil.copy2(pp_md, DOCS / "standards" / pp_md.name)
    entry = {"category": "Standards", "title": "SN5 Pain Points & Improvements",
             "kind": "md", "src": f"docs/standards/{pp_md.name}", "size": pp_md.stat().st_size}
    pp_pdf = DOCS / "standards" / "pain-points.pdf"
    if md_to_pdf(pp_md, pp_pdf):
        n_pdf += 1
        entry.update(kind="pdf", src=f"docs/standards/{pp_pdf.name}", size=pp_pdf.stat().st_size)
    pp_docx = next((RES / "01 Pain Points and Improvements").glob("*.docx"), None)
    if pp_docx:
        shutil.copy2(pp_docx, DOCS / "standards" / pp_docx.name)
        entry["docx"] = f"docs/standards/{pp_docx.name}"
    add(entry)

# 4. Printables (HTML)
# Through add(), not straight onto the manifest: this used to bypass UNLISTED
# entirely, so "stop showing it" had no switch and meant deleting the block.
pr = RES / "04 Printables" / "printables.html"
if pr.exists():
    shutil.copy2(pr, DOCS / "printables.html")
    add({"category": "Guides", "title": "Shop Printables",
         "kind": "html", "src": "docs/printables.html",
         "size": pr.stat().st_size})

# stable order: category then title
order = {"Datasheets": 0, "Standards": 1, "Quick reference": 2, "Guides": 3}
manifest.sort(key=lambda m: (order.get(m["category"], 9), m["title"]))
(DOCS / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8", newline="\n")

by_cat = {}
for m in manifest:
    by_cat[m["category"]] = by_cat.get(m["category"], 0) + 1
total = sum(m["size"] for m in manifest)
print(f"docs manifest: {len(manifest)} docs -> app/docs/  ({total/1e6:.1f} MB); {n_pdf} standards rendered to PDF")
for c, n in by_cat.items():
    print(f"  {c}: {n}")

if pdf_failures:
    print("PDF render FAILED for:", file=sys.stderr)
    for f in pdf_failures:
        print("  " + f, file=sys.stderr)
    sys.exit(1)
