# Hybrid retrieval in Postgres: filtered HNSW, `simple` FTS, RRF, Drizzle

Researched 2026-09-27 against primary sources: pgvector README/CHANGELOG/source at tag `v0.8.6`, PostgreSQL 17 docs and `REL_17_STABLE` source, Cloudflare Hyperdrive docs, Cormack/Clarke/Büttcher (SIGIR 2009), Elastic/OpenSearch/Azure AI Search docs, and the installed `drizzle-orm@0.45.3` and `postgres@3.4.9` sources in `node_modules`. Claims marked **[verified locally]** were run against the repo's `pgvector/pgvector:0.8.6-pg17` container (PostgreSQL 17.11, `datctype = en_US.utf8`); the runs used read-only SELECTs or temp tables in rolled-back transactions. This is input for discussion, not a set of decisions.

Builds on `05-drizzle-pgvector-hyperdrive.md` and does not repeat it. That note already covers operators, HNSW build defaults, the general rule that the index needs `ORDER BY … LIMIT`, Hyperdrive transaction-mode pooling, `websearch_to_tsquery` syntax, the `ts_rank` normalization bitmask, and the Supabase RRF SQL.

---

## Q1. pgvector 0.8.6: filtered HNSW queries

### Query form that uses the index

> "The query needs to have an `ORDER BY` and `LIMIT`, and the `ORDER BY` must be the result of a distance operator (not an expression) in ascending order."
> — https://github.com/pgvector/pgvector/blob/v0.8.6/README.md#why-isnt-a-query-using-an-index

```sql
-- index
ORDER BY embedding <=> '[3,1,2]' LIMIT 5;
-- no index
ORDER BY 1 - (embedding <=> '[3,1,2]') DESC LIMIT 5;
```

Our shape. **[verified locally]**: the planner uses `Index Scan using …_embedding_idx` with `Order By: (embedding <=> …)` as the outer side of a `Nested Loop`, and the `items` predicates are applied as a `Filter` on the inner `items_pkey` lookup (plan in the appendix):

```sql
SELECT c.id, c.item_id, c.embedding <=> $1::vector AS distance
FROM chunks c
JOIN items i ON i.id = c.item_id
WHERE i.user_id = $2 AND i.deleted_at IS NULL AND i.status = 'ready'
  AND ($3::timestamptz IS NULL OR i.captured_at >= $3)
  AND ($4::timestamptz IS NULL OR i.captured_at <  $4)
  AND ($5::text IS NULL OR i.kind = $5)
ORDER BY c.embedding <=> $1::vector
LIMIT 20;
```

Compute similarity outside the `ORDER BY` (the select list or app code), never inside it.

### Filtering is post-filtering: fewer than k rows

> "With approximate indexes, filtering is applied _after_ the index is scanned. If a condition matches 10% of rows, with HNSW and the default `hnsw.ef_search` of 40, only 4 rows will match on average. For more rows, enable iterative index scans…"
> — README, "Filtering"

> "Results are limited by the size of the dynamic candidate list (`hnsw.ef_search`), which is 40 by default. There may be even less results due to dead tuples or filtering conditions in the query."
> — README, "Why are there less results for a query after adding an HNSW index?"

A join filter counts as a filtering condition here. **[verified locally]** 20,000 chunks with 64 dimensions and HNSW cosine, a `user_id` filter matching about 2% of rows, `LIMIT 20`:

| `hnsw.iterative_scan` | rows returned |
| --------------------- | ------------- |
| `off` (default)       | **2**         |
| `strict_order`        | 20            |
| `relaxed_order`       | 20            |

**Without iterative scans, a user whose share of the table is small gets an almost empty vector list.** This is the main multi-user risk.

README, "Multitenancy": "sharing an approximate index between tenants means vectors from one tenant can affect recall (and speed) for other tenants. For tenant isolation, use list partitioning or separate tables." For a filter column, the README also suggests "creating an index on the filter column. This can provide fast, exact nearest neighbor search in many cases". The planner can then choose `items(user_id)` → chunks by `item_id` → exact sort. It picks this on cost. It gives perfect recall.

### Iterative index scans (0.8.0+): exact semantics

README, "Iterative Index Scans" (verbatim):

- "automatically scan more of the index until enough results are found (or it reaches `hnsw.max_scan_tuples` …)"
- `strict_order`: "ensures results are in the exact order by distance"
- `relaxed_order`: "allows results to be slightly out of order by distance, but provides better recall"
- To get strict order back with relaxed scans, use a materialized CTE:

```sql
WITH relaxed_results AS MATERIALIZED (
    SELECT id, embedding <-> '[1,2,3]' AS distance FROM items WHERE category_id = 123 ORDER BY distance LIMIT 5
) SELECT * FROM relaxed_results ORDER BY distance + 0;
```

"Note: `+ 0` is needed for Postgres 17+". Also: "Place any other filters inside the CTE".

GUC definitions from source (https://github.com/pgvector/pgvector/blob/v0.8.6/src/hnsw.c, lines 93–109; `src/hnsw.h`):

| GUC                        | Type / values                                   | Default   | Range      | Context       |
| -------------------------- | ----------------------------------------------- | --------- | ---------- | ------------- |
| `hnsw.ef_search`           | int                                             | **40**    | 1..1000    | `PGC_USERSET` |
| `hnsw.iterative_scan`      | enum `off` \| `relaxed_order` \| `strict_order` | **`off`** | —          | `PGC_USERSET` |
| `hnsw.max_scan_tuples`     | int                                             | **20000** | 1..INT_MAX | `PGC_USERSET` |
| `hnsw.scan_mem_multiplier` | real (multiple of `work_mem`)                   | **1**     | 1..1000    | `PGC_USERSET` |

- `max_scan_tuples`: "This is approximate and does not affect the initial scan" (source comment and README). README on the memory multiplier: "Try increasing this if increasing `hnsw.max_scan_tuples` does not improve recall".
- `PGC_USERSET` means any role can set these, including a non-superuser managed-Postgres role.
- CHANGELOG 0.8.0: "Added support for iterative index scans", "Improved cost estimation for better index selection when filtering". No 0.8.1–0.8.6 entry changes iterative-scan semantics (https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md).

**Ceiling arithmetic (inference, not from a source):** a user owning a fraction `p` of all chunks yields about `20000 × p` matching tuples before `max_scan_tuples` stops the scan. At `p = 0.1%` that is about 20, which is borderline for `LIMIT 20`. Watch this once per-user share falls toward that level. The levers are raising `max_scan_tuples`/`scan_mem_multiplier`, the partial or partitioned options above, or letting the planner take the exact path.

**Recommendation:** `relaxed_order` for recall. Rank the vector list with `row_number() OVER (ORDER BY distance)` in an outer query over a `MATERIALIZED` CTE; that re-sort is the README's documented fix for relaxed order, and RRF needs correct ranks. Keep `ef_search` at 40 unless evals say otherwise. Candidates per list (20) are below `ef_search`, which is required because the list is capped at `ef_search` when there is no filter.

### Setting GUCs per query under Hyperdrive

Hyperdrive (https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/):

- "operates in transaction mode, where the client that executes the query communicates through a single connection for the duration of a transaction."
- `SET` is supported "within transactions and individual queries". When a connection returns to the pool it is `RESET`.
- "It is not recommended to wrap multiple database operations with a single transaction to maintain the `SET` state. Doing so will affect the performance and scaling of Hyperdrive, as the connection cannot be reused by other Worker isolates."
- Unsupported: SQL-level `PREPARE/DISCARD/DEALLOCATE/EXECUTE`, advisory locks, `LISTEN/NOTIFY`, and "per-session state modifications (except where explicitly documented)" (https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/).

So a short transaction of `set_config` plus the search statement is the documented-compatible pattern. A long-lived session `SET` is not.

Postgres rules that constrain how the transaction is written:

- `SET LOCAL`: "Specifies that the command takes effect for only the current transaction… Issuing this outside of a transaction block emits a warning and otherwise has no effect." (https://www.postgresql.org/docs/17/sql-set.html). **[verified locally via postgres.js]**: outside `sql.begin`, you get `WARNING SET LOCAL can only be used in transaction blocks` and the value is unchanged.
- **`SET` cannot take a bind parameter.** **[verified locally]**: `` tx`SET LOCAL hnsw.ef_search = ${100}` `` fails with `syntax error at or near "$1"`. Drizzle's `sql` template produces exactly that.
- `set_config(setting_name text, new_value text, is_local boolean)`: "If `is_local` is `true`, the new value will only apply during the current transaction… This function corresponds to the SQL command `SET`." (https://www.postgresql.org/docs/17/functions-admin.html). It accepts bind parameters. **[verified locally]**: `` tx`SELECT set_config('hnsw.ef_search', ${'100'}, true)` `` works.

**Use `SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)` inside the transaction**, not `SET LOCAL` with interpolation. If the value is a constant, a literal `SET LOCAL hnsw.iterative_scan = relaxed_order` is also fine.

### When the planner skips the index

- README: "if the table is small, a table scan may be faster." It also explains the cost model: "The planner doesn't consider out-of-line storage in cost estimates". A 1024-dim `vector` is about 4 KB and is TOASTed.
- The result is an exact scan with perfect recall ("By default, pgvector performs exact nearest neighbor search, which provides perfect recall" — README, "Indexing"). Correctness is unaffected; only latency changes. That is fine for a young per-user corpus. Debug with `EXPLAIN (ANALYZE, BUFFERS)` (README, "Querying"). `SET LOCAL enable_seqscan = off` exists to force the index but is a diagnostic, not a production setting.

### Passing the vector from postgres.js

- The pgvector input format is text `'[1,2,3]'` (README "Getting Started"/"Storing").
- postgres.js `inferType` returns OID `0` (unspecified) for a JS string, so the server infers the type (`src/types.js` lines 220–230 in `postgres@3.4.9`). **[verified locally]**: both `${'[1,2,3]'}::vector` and a bare `${'[1,2,4]'}` on the right of `<=>` work. Prefer the explicit `$1::vector` because it is unambiguous and works in `SELECT` lists too.
- **Do not pass a JS `number[]`.** `inferType` for arrays uses the element type, so it is serialised as a Postgres array, not a vector. Drizzle's `cosineDistance(col, number[])` already does `JSON.stringify(value)` (`drizzle-orm/sql/functions/vector.js`). In raw SQL, do the same yourself: `${JSON.stringify(embedding)}::vector`.

---

## Q2. Postgres 17 FTS with `'simple'`

### The four query parsers

From https://www.postgresql.org/docs/17/textsearch-controls.html#TEXTSEARCH-PARSING-QUERIES:

| Function               | Input treated as                                                                                                                    | Operators between words | Safe for raw user text?                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `to_tsquery`           | tsquery syntax: "must consist of single tokens separated by the tsquery operators & (AND), \| (OR), ! (NOT), and <-> (FOLLOWED BY)" | as written              | **No**. "to_tsquery will generate a syntax error for tokens that are not separated by an AND, OR, or FOLLOWED BY operator." |
| `plainto_tsquery`      | plain text; "will not recognize tsquery operators, weight labels, or prefix-match labels"                                           | `&`                     | Yes; punctuation is discarded                                                                                               |
| `phraseto_tsquery`     | plain text                                                                                                                          | `<->` / `<N>`           | Yes                                                                                                                         |
| `websearch_to_tsquery` | web syntax: unquoted → `&`, `"quoted"` → `<->`, `or` → `\|`, `-` → `!`                                                              | `&`                     | **Yes**. "this function will never raise syntax errors, which makes it possible to use raw user-supplied input"             |

**[verified locally]** `websearch_to_tsquery('simple', $$""" )( dummy \\ query <-> it's & | ! :* $$)` returns `'dummy' <-> 'query' <-> 'it' <-> 's'` with no error.

### Three traps specific to our setup

1. **The built-in `simple` configuration has no stop words.** The simple dictionary template "operates by converting the input token to lower case and checking it against a file of stop words" (https://www.postgresql.org/docs/17/textsearch-dictionaries.html#TEXTSEARCH-SIMPLE-DICTIONARY). But the built-in `simple` dictionary has empty `dictinitoption` **[verified locally: `pg_ts_dict`]**, so no stop-word file is used. `websearch_to_tsquery('simple','the a or')` → `'the' & 'a' & 'or'`. A natural-language question under AND semantics requires every word, `what`/`did`/`का`/`है` included, so it matches almost nothing.
2. **Negation-only input is non-indexable and matches everything.** **[verified locally]**: `websearch_to_tsquery('simple','-kafka')` has `querytree(...) = 'T'`, and `'x y'::tsvector @@ it` is `true`. `querytree` "Produces a representation of the indexable portion of a tsquery. A result that is empty or just T indicates a non-indexable query." (https://www.postgresql.org/docs/17/functions-textsearch.html). Such a query cannot use GIN and returns every row. **Guard:** skip the FTS list when `querytree(q) IN ('', 'T')` or `numnode(q) = 0`.
3. **Empty input** produces an empty tsquery with `NOTICE: text-search query doesn't contain lexemes`, and `@@` returns `false`. **[verified locally]** This is harmless, but skip the round-trip.

### OR semantics: documented building blocks

`websearch_to_tsquery` only produces `|` from a literal `or` in the input. There is no "OR mode". These are the documented tools for building an OR query:

- `tsquery || tsquery → tsquery`: "ORs two tsquerys together" (https://www.postgresql.org/docs/17/functions-textsearch.html).
- `tsvector_to_array(tsvector) → text[]`: "Converts a tsvector to an array of lexemes" (same page). This normalises the input with the same parser and dictionary as the documents.
- tsquery literal input: lexemes containing punctuation go in single quotes, and "Embedded quotes and backslashes must be doubled" (https://www.postgresql.org/docs/17/datatype-textsearch.html). `quote_literal()` doubles quotes, which matches that rule.

A parser-normalised OR query built entirely in SQL, with the raw text as a single bind parameter:

```sql
SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery
FROM unnest(tsvector_to_array(to_tsvector('simple', $1))) AS lexeme
```

**[verified locally]** `$$it's कल "Joe" o'neil & | !$$` → `'it' | 'joe' | 'neil' | 'o' | 's' | 'कल'`. Operator characters in the input are dropped by the parser. Empty input gives `NULL`, and `tsv @@ NULL` is not true, so no rows come back. Guard it anyway.

The documentation has no recipe for string-replacing `&` with `|` on the text form of a `websearch_to_tsquery` result. The approach above avoids text surgery and is built only from documented functions and input rules.

**The catch with OR:** "the ranking functions do not use any global information" (textsearch-controls §12.3.3). There is **no IDF**, so with no stop words, `the | kafka` ranks a chunk dense in `the` about as high as one that mentions `kafka`. Postgres gives two ways to add stop words: a custom `simple`-template dictionary with `STOPWORDS = <name>`, which reads `$SHAREDIR/tsearch_data/<name>.stop` (dictionaries page), or filtering in the app. A server-side stop file is not something we can install on managed Postgres (inference; check with the provider). So the choice is:

- **A (recommended):** the query variants are keyword-style strings produced by the rewrite step. Use `websearch_to_tsquery('simple', $variant)` (AND). It is precise, cheap on GIN, and an explicit `or` is still honoured.
- **B:** use the OR builder above on variants, with an app-side stop-word list (English plus Hindi/Hinglish function words) removed before the query is built. Higher recall, but ranking quality depends on that list, and GIN has to union large posting lists for common terms.

Decision needed. It depends on what the rewrite step emits.

### `ts_rank` vs `ts_rank_cd`

- `ts_rank`: "Ranks vectors based on the frequency of their matching lexemes."
- `ts_rank_cd`: cover density (Clarke, Cormack & Tudhope 1999); "the proximity of matching lexemes to each other is taken into consideration". It "requires lexeme positional information… If there are no unstripped lexemes in the input, the result will be zero." Our `tsv` is unstripped `to_tsvector` output.
- Normalization flags are already in 05. For RRF only the **order within one list** matters. Flag `32` (`rank/(rank+1)`) "will not affect the ordering", so it is pointless here. Length normalization (`1` or `2`) does change order across chunks of different lengths. Chunks are roughly uniform in size, so leave it at `0` unless evals show long chunks dominating.
- "Ranking can be expensive since it requires consulting the tsvector of each matching document". The cost scales with the number of matches, which matters more under OR (B) than AND (A).

**Recommendation:** `ts_rank_cd(c.tsv, q)` with a deterministic tiebreak, `ORDER BY rank DESC, c.id`. Many chunks tie on short queries, and RRF needs stable ranks.

### GIN usage

- "GIN indexes are the preferred text search index type… GIN indexes store only the words (lexemes) of tsvector values, and not their weight labels. Thus a table row recheck is needed when using a query that involves weights." (https://www.postgresql.org/docs/17/textsearch-indexes.html)
- We use a stored generated column, so `WHERE c.tsv @@ q` uses the GIN index directly. Nothing has to match an expression-index config (that matching rule applies only to expression indexes: https://www.postgresql.org/docs/17/textsearch-tables.html). The query side must still use `'simple'` explicitly. The 2-arg `websearch_to_tsquery(regconfig, text)` and `to_tsquery(regconfig, text)` are IMMUTABLE; the 1-arg forms are STABLE and depend on `default_text_search_config` **[verified locally: `pg_proc.provolatile`]**.

### Devanagari with the default parser

- There is one built-in parser, `pg_catalog.default`, with 23 token types, including `asciiword` ("Word, all ASCII letters") and `word` ("Word, all letters", e.g. `mañana`). "The parser's notion of a 'letter' is determined by the database's locale setting, specifically `lc_ctype`." (https://www.postgresql.org/docs/17/textsearch-parsers.html)
- Source (`src/backend/tsearch/wparser_def.c`, `REL_17_STABLE`, `p_iswhat`): with a multibyte encoding the parser uses `iswalpha()` and friends under the database locale. **If the locale is C, every non-ASCII character is treated as a letter** (`if (c > 0x7f) return nonascii;`, where `nonascii = 1` for `alpha`/`alnum`).
- **[verified locally, `en_US.utf8`]**: Devanagari words, including vowel signs (matras), anusvara and nukta, come out as single `word` tokens: `'नमस्ते' 'दुनिया' 'हिंदी' 'में' 'पढ़ा' 'मैंने'`. The danda `।`/`॥` and `“ ” —` are treated as separators. Mixed script works too: `कल का meeting-notes` → `'कल' 'का' 'meeting-notes' 'meeting' 'notes'`. `websearch_to_tsquery('simple','हिंदी नोट')` matches.
- **Risk:** under a C / C.UTF-8 `lc_ctype`, non-ASCII punctuation such as `।` and curly quotes would count as letters and stick to adjacent words (per the source; not run here). **Check `datctype` on the production database** and run the same `ts_debug('simple', …)` probe before launch.
- No stemming for Hindi or English in `simple` (05). Hinglish transliteration (`kal` vs `कल`) never matches across scripts. That is a vector-side job, and it is one reason hybrid retrieval exists.

---

## Q3. Reciprocal Rank Fusion

### Formula and k

Cormack, Clarke & Büttcher, SIGIR 2009 (https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf):

> "Given a set D of documents to be ranked and a set of rankings R, each a permutation on 1..|D|, we compute RRFscore(d ∈ D) = Σ_{r∈R} 1 / (k + r(d)) where k = 60 was fixed during a pilot investigation and not altered during subsequent validation."

> "…while highly-ranked documents are more important, the importance of lower-ranked documents does not vanish as it would were, say, an exponential function used. The constant k mitigates the impact of high rankings by outlier systems."

The pilot table showed k = 60 "was near-optimal, but that the choice was not critical" (MAP 0.2145 at k=60 vs 0.2139 at 30, 0.2146 at 70).

- **Ranks start at 1.** The paper uses permutations on `1..|D|`. Elastic: "rank( result(q), d ) is d's rank within the result(q) starting from 1", default `rank_constant` "60" (https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion). OpenSearch: "rank_q(d) is the position of d in the results of query clause q, starting from 1", default 60, valid range `[1, 10000]` (https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/rrf/). Azure: "`1/(rank + k)`… performs best when you set `k` to a small value, such as 60" (https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking).
- **Documents missing from a list contribute 0.** The paper assumes full permutations. Implementations with truncated lists state the rule: OpenSearch says "Query clauses in which d does not appear contribute nothing"; Elastic's pseudocode is `if d in result(q): score += 1.0 / (k + rank(result(q), d))`.

### Multiple lists and duplicates

- Every list counts as its own ranking in `R`. Two or three variants × {vector, FTS} gives 4–6 lists, all fused in one sum. That is the same as Azure fusing "A full-text query, plus two vector queries targeting five vector fields, equals 11 query executions".
- A document that appears in several lists **sums** its contributions. That is the whole mechanism: "documents appearing in the top positions across multiple search methods are likely to be more relevant" (Azure). Inside one list a chunk appears at most once, since each list is a ranking of distinct rows.
- The top score is bounded by the number of lists: Azure says "each query contributing a maximum of approximately `1/k`"; OpenSearch says "The highest score a document can receive is the sum of the query clause weights divided by (rank_constant + 1)". **Do not threshold RRF scores or compare them across questions.** OpenSearch: "Avoid using a min_score threshold… Avoid comparing RRF scores across queries."
- Optional weights exist (OpenSearch `w_q · 1/(k + rank)`; Azure vector weighting). The paper is unweighted. Start unweighted.
- Fusion depth: OpenSearch shows that truncating each list before fusion changes the winner ("The agreement between the two clauses… no longer reaches the fusion step"). Our fixed top-20 per list is the fusion depth. Keep the final context size well below it.

### Ties

**No source defines a tie-breaking rule.** The paper, Elastic, and Azure are silent. OpenSearch only shows an implementation-defined outcome ("both score 1 / (1 + 1) = 0.5, and the tie resolves in favor of document 1"). Ties are common under RRF: any two documents with the same multiset of ranks tie exactly. **Our convention (a design choice, not a cited one):** fused score DESC, then best single rank ASC (lowest rank number in any list), then number of lists containing the doc DESC, then chunk id ASC. This keeps the order deterministic for tests.

### Chunk-level fusion, then item level: max vs sum

No source addresses "RRF at chunk level, then aggregate to parent". The closest authoritative precedent is Elastic's handling of passages (nested vectors):

- "kNN search over nested dense_vectors will always diversify the top results over the top-level document. Meaning, 'k' top-level documents will be returned, scored by their nearest passage vector" (https://www.elastic.co/guide/en/elasticsearch/reference/8.19/knn-search.html#nested-knn-search).
- The nested query's `score_mode`: "Default is `avg`, but **nested knn queries only support `score_mode=max`**". Valid values are `avg | max | min | none | sum` (https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-nested-query).

So the vendor precedent for passage-to-document scoring is **max** (best passage). Elastic applies it per list, before fusion.

**Recommendation:** fuse at chunk level, because chunks are what we hand to the model as context. Then item score = **max** fused chunk score, with the item's chunks kept as supporting passages. `sum` biases toward long items, which have more chunks and so more chances to appear; nothing authoritative supports it for passage scoring. The alternative is Elastic's order (max per list at item level, then RRF across item lists), which is defensible if the answer UI is item-first. Decision needed; the chunk-first order is simpler to test as a pure function.

---

## Q4. Drizzle 0.45.3 + postgres.js 3.4.9: raw SQL, parameters, transactions

### `sql` template and `db.execute`

- `${value}` in `` sql`…` `` becomes a bind parameter (`$1`, `$2`…); `sql.raw()` "bypasses escaping entirely"; `sql.join()` concatenates chunks with a separator; `db.execute(sql\`…\`)` runs raw SQL (https://orm.drizzle.team/docs/sql).
- With postgres-js, `db.execute` returns `RowList<Row[]>`, a plain array of row objects (`drizzle-orm/postgres-js/session.d.ts`, `PostgresJsQueryResultHKT`). The result has no runtime typing, so validate or map at the boundary.
- `db.transaction(async (tx) => { … })` runs on postgres.js `client.begin(...)` (`drizzle-orm/postgres-js/session.js` line 108). postgres.js "will reserve a connection for the transaction… if anything fails `ROLLBACK` will be called" (postgres.js README, "Transactions"). Throwing inside the callback rolls back; return values pass through (https://orm.drizzle.team/docs/transactions). Config `{ accessMode: 'read only' }` is supported and fits search.

Pattern:

```ts
const rows = await db.transaction(
  async (tx) => {
    await tx.execute(
      sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`
    )
    return tx.execute(sql`
      WITH vector_hits AS MATERIALIZED (
        SELECT c.id, c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector AS distance
        FROM chunks c JOIN items i ON i.id = c.item_id
        WHERE i.user_id = ${userId} AND i.deleted_at IS NULL AND i.status = 'ready'
        ORDER BY distance
        LIMIT 20
      )
      SELECT id, row_number() OVER (ORDER BY distance + 0, id) AS rank FROM vector_hits
    `)
  },
  { accessMode: "read only" }
)
```

In the pattern above, `ORDER BY distance` inside the CTE orders by the select-list alias of the `<=>` expression. That is the README's own form (`… AS distance … ORDER BY distance LIMIT 5`), and it uses the index. Confirm it with `EXPLAIN` on the real schema.

### Two driver findings that matter for Hyperdrive

1. **Drizzle ignores `prepare: true` for ordinary queries.** Every postgres-js code path calls `client.unsafe(query, params)` with no options (`session.js` lines 33, 43, 65, 103, 106). postgres.js `unsafe` defaults to `prepare: false` (`src/index.js` line 122; README: "`sql.unsafe` … defaults them to off. If you'd like to re-enable prepared statements, you can pass `{ prepare: true }`"). Open upstream issue: https://github.com/drizzle-team/drizzle-orm/issues/6096 (filed 2026-08-04 against 0.45.2 with Hyperdrive, no response). Two consequences:
   - Hyperdrive: "if you're using `prepare: false`, queries won't be cacheable" (https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/). Cloudflare's Postgres.js example also warns that `sql.unsafe()` queries "will require additional round-trips".
   - postgres.js sends a Describe first for unprepared parameterised queries (`connection.js` line 238: `describeFirst = parameters.length && !q.prepared`). That is an extra round-trip per query.
2. **Hyperdrive caches cacheable reads, and our search reads qualify.** "Hyperdrive automatically caches cacheable read queries", excluding mutations and queries using VOLATILE or STABLE functions. Defaults are `max_age` 60 s and `stale_while_revalidate` 15 s. "Hyperdrive does not invalidate cached results on writes." (https://developers.cloudflare.com/hyperdrive/concepts/query-caching/). Every function in our search SQL is IMMUTABLE **[verified locally: `<=>`→`cosine_distance`, `@@`→`ts_match_vq`, 2-arg `websearch_to_tsquery`/`to_tsquery`, `ts_rank_cd`, `tsvector_to_array`]**. So a _prepared_ search query could return results up to about 75 s stale. A note that just became ready would be missing from search. `set_config` is VOLATILE.

These two findings pull against each other. Today Drizzle's unprepared path means no caching (fresh, one extra round-trip). If search is moved to prepared postgres.js `` sql`…` `` to cut latency, it becomes cacheable and stale. Options: route search through a cache-disabled Hyperdrive binding (`--caching-disabled`, the documented pattern for "fresh-read requirements", same page), or accept the Drizzle path. Whether Hyperdrive caches a read inside an explicit transaction is **not documented**.

### Round-trips in the transaction

In the Drizzle callback, each awaited statement is one round-trip: BEGIN (sent by postgres.js), `set_config`, the search statement, COMMIT. postgres.js can pipeline a transaction when the callback returns an array: `sql.begin(sql => [sql\`…\`, sql\`…\`])`(postgres.js README, "Transactions"). Drizzle's`tx`API does not expose that. Put all lists (every variant × {vector, FTS}) in **one** statement as`UNION ALL`of parenthesised ranked subqueries, each keeping its own`ORDER BY … LIMIT 20`, and fuse in TypeScript. That gives two statements per question regardless of variant count, and keeps fusion a pure, unit-testable function.

---

## Open items / uncertainties

1. **Recall ceiling for small tenants.** `hnsw.max_scan_tuples = 20000` bounds iterative scans. Users with a tiny share of chunks can still get fewer than 20 vector hits. Monitor list sizes. The pgvector levers are raising the GUCs, partial or partitioned indexes, or the planner's exact path. Partitioning is a schema decision, not proposed here.
2. **Relaxed vs strict order.** The recommendation is `relaxed_order` plus a materialized re-sort. The README says relaxed gives "better recall" but gives no numbers. Validate with our evals.
3. **Production `lc_ctype`.** Devanagari tokenises correctly under `en_US.utf8` (verified). Under a C locale, non-ASCII punctuation such as `।` would stick to words (per source, not run). Check `datctype` on the managed DB before launch.
4. **AND vs OR full-text semantics.** This depends on what the query-rewrite step emits. OR without stop words degrades because Postgres ranking has no IDF. Decision needed (A vs B above).
5. **Negation-only / empty FTS queries.** Guard with `querytree`/`numnode`. Otherwise a non-indexable query that matches all rows triggers a sequential scan.
6. **Drizzle #6096.** Drizzle queries are never prepared through postgres.js, which means an extra Describe round-trip and no Hyperdrive caching. It is unfixed upstream. Decide whether search stays on Drizzle `db.execute` or uses the postgres.js tagged template directly.
7. **Hyperdrive cache staleness.** Prepared search reads are cacheable with 60 s + 15 s staleness and no write invalidation. If search moves to prepared statements, use a `--caching-disabled` binding for it. Whether Hyperdrive caches reads inside an explicit transaction is undocumented; test with Hyperdrive, not `wrangler dev` (local dev bypasses Hyperdrive, per 05).
8. **RRF ties and chunk→item aggregation** have no authoritative rule. The tiebreak chain and `max` aggregation are design choices, anchored on Elastic's nested-kNN `max` precedent.
9. **Iterative scans across a join** were verified on synthetic temp tables with 64-dim vectors, not on 1024-dim real data. Re-run `EXPLAIN (ANALYZE, BUFFERS)` on the real schema once there is data, including the `date`/`kind` filters.

---

## Appendix: local verification plan (temp tables, rolled back)

```
Limit
  ->  Nested Loop
        ->  Index Scan using t_chunks_embedding_idx on t_chunks c
              Order By: (embedding <=> '[…]'::vector)
        ->  Memoize
              Cache Key: c.item_id
              ->  Index Scan using t_items_pkey on t_items i
                    Index Cond: (id = c.item_id)
                    Filter: ((deleted_at IS NULL) AND (user_id = 7) AND (status = 'ready'::text))
```
