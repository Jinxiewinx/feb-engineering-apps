-- Pandoc filter for the in-app PDFs of the CS standards and quick references.
-- In the source markdown a ">" blockquote is a CAUTION callout (CS-Template,
-- STYLE.md §3). build_docx.py already renders it that way; pandoc's PDF
-- showed it as plain indented text, so a caution looked like a quote.
-- This prefixes the first paragraph with a bold "CAUTION:" and keeps the
-- indent. Words, not the warning-sign glyph: Latin Modern has no such glyph.
function BlockQuote(el)
  local first = el.content[1]
  if first and (first.t == "Para" or first.t == "Plain") then
    table.insert(first.content, 1, pandoc.Space())
    table.insert(first.content, 1, pandoc.Strong({ pandoc.Str("CAUTION:") }))
  end
  return el
end
