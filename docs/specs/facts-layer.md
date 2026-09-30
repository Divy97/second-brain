# Facts Layer

Issue: #56

## Scope

Extract facts only from the user's own words: text/voice notes classified as `thought`, `fact`, `meeting`, or `quote`. Store each fact with source-item provenance, embedding, full-text index, and validity window.

## Acceptance

- Pipeline extracts atomic facts after enrichment.
- Each new fact is reconciled against nearest valid facts with `ADD`, `UPDATE`, `DELETE`, or `NOOP`.
- `UPDATE` and `DELETE` invalidate old facts with `valid_to`; facts are not physically deleted.
- Ask retrieval searches valid facts alongside chunks and cites the source item.
- Deleted or non-ready source items hide their facts.
