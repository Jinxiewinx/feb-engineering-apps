# Steve's notes

Steve is the app's joke helper "from Fibreglast". He is always a little wrong
and always has a product for it. This folder holds his private material.
None of it is a FEB document, a standard or a source for anything (STYLE.md
§7; CS-000).

## Why it sits here

The folder is outside `app/`, so Firebase hosting never serves it, and outside
`app/docs/`, so `tools/build_ai_corpus.mjs` never reads it. Paul must never
find one of Steve's notes, and a member must never open one as if it were a
rule. Keep it that way: don't move these files into `app/` or `functions/`
by hand, and don't point the corpus build at this folder.

## The files

| File | What it is | How it is used |
|---|---|---|
| `fibreglast-lines.md` | Steve's talking points, a `##` section per product family, each naming real catalog handles and ending with the line he never crosses | Read by a Steve-only search tool (`search_steve_notes`, register R-STV-06). Paul never gets this tool |
| `upsell-map.md` | For each shop topic: the catalog categories he may push, the handles he likes, and his "Never" lines. Grounding and PPE say "ask Paul" | Read by the same Steve-only tool |
| `catalog-categories.json` | The ordered rules that give each catalog product a `cat` (first match wins, fallback `other`) | Applied offline to `functions/steve_catalog.json` by `tools/build_steve_kb.mjs`, not at request time. Steve's search drops `safety-ppe` and `solvents-catalysts` (acetone, MEKP, thinners, reducers, SurfaSolve) always, and `gelcoat-colour` unless the question asks for gel coat, colour or RAL (R-STV-02, R-STV-03). `searchCatalog` in `functions/context.js` does not read `cat` yet, so this drop is still to be wired |

`search_steve_notes` reads `fibreglast-lines.md` and `upsell-map.md` and
nothing else, through `functions/steve_kb.json`: `tools/build_steve_kb.mjs`
splits the two files at their `##` headings into sections `STEVE-1`,
`STEVE-2` and so on, and writes the categorised catalog in the same run.
After editing anything in this folder, rebuild and commit both outputs:

```bash
node tools/build_steve_kb.mjs          # from the repo root
node tools/build_steve_kb.mjs --check  # what release.mjs runs; exits 1 if stale
```

The section refs are never citable. The server keeps them out of the set of
refs Steve may cite, so a `[STEVE-3]` in his answer is dropped like a made-up
id. This README and the JSON carry section marks, register IDs and
code, and Steve's material has to stay free of numbers, so neither one may be
added to what the tool reads.

## Rules for editing

- No numbers: no ratios, times, temperatures, pressures, percentages,
  quantities, grits or ply counts. The server strips them from his answers
  anyway.
- No safety or PPE content, nothing about grounding, chemical storage, CNC
  operation, exotherm or waste. Those topics deflect to Paul.
- His wrongness is technique opinions and buying more than the job needs,
  never advice that could hurt someone or ruin a part or mold.
- Every product is a handle that exists in `functions/steve_catalog.json`.
  Check after editing:

  ```bash
  cd "06 Composites App"
  node -e 'const c=new Set(require("./functions/steve_catalog.json").products.map(p=>p.handle));for(const f of ["steve/fibreglast-lines.md","steve/upsell-map.md"])for(const m of require("fs").readFileSync(f,"utf8").matchAll(/`FG:([^`]+)`/g))if(!c.has(m[1]))console.log(f,"missing",m[1])'
  ```

- Never disparage Fibreglast or its products, and never write as if Steve
  speaks for them. The joke is Steve.
