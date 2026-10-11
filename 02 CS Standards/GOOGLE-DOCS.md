# The standards on Google Docs (historical)

**Retired 2026-10-10.** Simon dropped Google Docs as the editing surface: the
markdown in `src/` is canonical again, and the Drive copies below are left
as they are, frozen at the August revisions. Nobody edited them after
2026-09-03, so nothing needed syncing back. Do not edit them and do not
re-import into them; edit `src/*.md` and follow `STYLE.md`. The rest of this
file is kept as the record of what was there.


As of 2026-08-29 the CS standards live as Google Docs in Simon's Drive, in a
folder at his My Drive root, and **that is where the team edits them from now
on** (his call, this date). Uploaded from the Rev-current markdown via Drive's
markdown import; figures are embedded in each Doc (Drive fetched them from the
live app host at import time), so the Docs are self-contained.

Folder: **CS Standards** — https://drive.google.com/drive/folders/1tkD4LdUlk4jq5bMKYQegSa1wYk52CcfL

| Doc | Rev at upload | Google Doc ID |
|---|---|---|
| CS-000 Documentation Standards, Template & Revision Process | C | `1J2wJlA3pkHFi_-U0v8qE_MDsaT-A81J5wFg1UToVP7A` |
| CS-001 Part, Mold & Material Labeling | F | `12uwnWFodClF54yFZiQGgdK6F6bTLR1oe4ltuz9SP_bs` |
| CS-002 Layup Schedule Specification & Recording | E | `1enB6xj1ckJw7xVuGOGzLaF0AAloGctxl49vMbp4tteA` |
| CS-003 Mold Design & Manufacturing | D | `1Ek_gJPlOd0ZkPoP36Dywvyu6bHMLCuCVEskim6mSocc` |
| CS-004 Mold Sealing, Release & Surface Prep | D | `1o4229Tf0nLXsJt30dNbtusu7i49Cs0wDal79-p1j45g` |
| CS-005 CNC Machining of Tooling Board (ShopSabre) | E | `1kNS7fH0AD9whatG-EU-FeMoaBtn_rZXAOsvLtjIVqvg` |
| CS-006 Resin Infusion | C | `1jiak6PFBfCwMYQw3BPh48pFjXI2NWSMBH0NocxlVBIg` |
| CS-007 Wet Layup & Vacuum Bagging | C | `1ZXEhcTHVer8kPLRrDQa4LsI9NBhDjdz6im2bqslBci0` |
| CS-008 Resins, Mixing & Cure Schedules | D | `16z73DhhlBbfwCx2UVrJMzv4bQJZmA1ftiR5vDC0q1fw` |
| CS-009 Trimming, Sanding & Finishing | C | `17dNVY0uiMBPBiCSPs4iZXu9T7zDHuNQb1ZN6OZGF3so` |
| CS-010 CF Grounding & Electrical Bonding | C | `1lSWJ1pglxJ3jd5s9wi__YNuYmLWmoyx3nSwoJIzCePY` |
| CS-011 Inventory, Storage & Transport | D | `1awvXtYcept9sXTE3h23Yf2fVFovuta2e-Tfs7fHWMus` |
| CS-012 Purchasing & Reimbursement | F | `15tG_DB032LMWDuAETWABhMbsZzgF4pUJxzAeDhgOg-M` |
| CS-013 Work Orders & Part Traceability | F | `11zt1hgKyjZezSEhq5Z88kk2cIaVc86S5QwfILCbqps8` |
| CS-INDEX — Composites Standards Master List | G | `1EfvSzxUHV6Rxpg2g9K5mP4-qUioCvh8pnKKktl7qn8o` |
| CS-Template | — | `1cyg5az-SOovY0j8PCEbCBbVxhzWHEdK8B8uvfiJPldw` |

**2026-09-02: ten Docs re-imported, new IDs.** The folder renumbering
changed `04 Datasheets/` to `03 Datasheets/` and `03 App/` to
`06 Composites App/` inside CS-000, 002, 003, 004, 006, 007, 008, 009, 011 and
013. The Drive connector cannot edit a Doc's text in place and the gcloud
token lacks the Docs API scope, so those ten were re-imported from the
corrected markdown (no rev bump: a path fix rides free, Simon's call) and the
old copies trashed. None had been edited since the 2026-08-29 upload, so no
content was lost. Their IDs above are the new ones; the other six are
unchanged. Same mechanism next time: a Doc that needs a repo-side fix is
re-imported, not patched, until something can call the Docs API.

## What this changes

The Docs are the **editing surface**. The markdown in `src/` is still what
builds everything the app serves: the in-app PDFs, the QR-linked copies under
`docs/standards/`, the .docx files, and what `check_traceability.py` audits.
So after edits land in a Doc, a session syncs them back: read the Doc (Drive
connector, IDs above), apply the change to `src/*.md` with a revision bump per
CS-000 §7.2, rebuild (`build_docx.py --all`, `gen_docs_manifest.py`), and push.
Until a sync happens, the Doc is ahead of the app copies, which is fine for
prose and wrong for numbers; sync promptly when a number changes.

Figures are embedded pixels in the Docs, not live links. When a figure's SVG
is re-rendered, re-import the affected standard (or swap the image in the Doc
by hand) or the Doc keeps the old drawing.
