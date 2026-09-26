# OpenRouter API research for `packages/ai`

Date: 2026-09-27. Sources: openrouter.ai/docs only (rendered pages and their raw `.md` / OpenAPI mirrors), plus live probes of `https://openrouter.ai/api/v1/models` and `/api/v1/key` with no key / an invalid key. Every claim carries its URL. Anything I could not confirm from a primary source is marked **UNCERTAIN**.

Context: `packages/ai` runs in a Cloudflare Worker, calls OpenRouter with a per-user key via plain `fetch`, and needs (a) chat completions with JSON-schema structured output and (b) embeddings.

---

## 0. TL;DR for the implementer

| Need                         | Answer                                                                                                                                                              | Source                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Chat endpoint                | `POST https://openrouter.ai/api/v1/chat/completions`                                                                                                                | [overview](https://openrouter.ai/docs/api-reference/overview)                                                         |
| Embeddings endpoint          | `POST https://openrouter.ai/api/v1/embeddings`                                                                                                                      | [embeddings](https://openrouter.ai/docs/api-reference/embeddings)                                                     |
| Key check                    | `GET https://openrouter.ai/api/v1/key` (works with any normal key; `/api/v1/auth/key` also answers 401 today, so it still resolves)                                 | [get-current-api-key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), live probe          |
| Models list                  | `GET https://openrouter.ai/api/v1/models` (`?output_modalities=embeddings` for embedding models, `?supported_parameters=structured_outputs` for JSON-schema models) | [get-models](https://openrouter.ai/docs/api/api-reference/models/get-models)                                          |
| Structured output            | `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` plus `provider: { require_parameters: true }`                               | [structured-outputs](https://openrouter.ai/docs/guides/features/structured-outputs.md)                                |
| Embedding `dimensions`       | Documented in the OpenAPI schema (`integer, minimum 1`). Works for Matryoshka-capable models (OpenAI text-embedding-3, Gemini Embedding 2, Voyage 4)                | [submit-an-embedding-request](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request.md) |
| Cohere embed-multilingual-v3 | **Not listed on OpenRouter** (0 Cohere entries in the 37 embedding models returned today)                                                                           | live probe                                                                                                            |
| 401 body on bad key          | `{"error":{"message":"User not found.","code":401}}`                                                                                                                | live probe                                                                                                            |
| Retry headers                | `Retry-After` on 429 / 503 / some 402; `X-RateLimit-Limit/Remaining/Reset` on platform 429s                                                                         | [limits](https://openrouter.ai/docs/api_reference/limits.md)                                                          |
| Cost in response             | `usage.cost` is always returned now; `usage: { include: true }` is deprecated/no-op                                                                                 | [usage-accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting.md)                            |

---

## 1. Chat completions

### 1.1 Endpoint and headers

`POST https://openrouter.ai/api/v1/chat/completions`
Source: https://openrouter.ai/docs/api-reference/overview

Headers (from the authentication page, https://openrouter.ai/docs/api_reference/authentication.md, lines 72-73 of the raw markdown):

```
Authorization: Bearer <OPENROUTER_API_KEY>          # required
Content-Type: application/json                      # required
HTTP-Referer: <YOUR_SITE_URL>        # Optional. Site URL for rankings on openrouter.ai.
X-OpenRouter-Title: <YOUR_SITE_NAME> # Optional. Site title for rankings on openrouter.ai.
```

Naming note: the docs now canonically use `X-OpenRouter-Title`. The overview page states it "also accepts `X-Title`" (https://openrouter.ai/docs/api_reference/overview.md). Either works; use `X-OpenRouter-Title` to match current docs.

Optional: `X-OpenRouter-Metadata: enabled` — "Opt-in to surface routing metadata on the response" (adds `openrouter_metadata: { requested, strategy, summary }` to the body). Source: https://openrouter.ai/docs/api-reference/chat-completion

### 1.2 Request body (relevant subset)

From the `Request` TypeScript type at https://openrouter.ai/docs/api_reference/overview.md:

```typescript
type Request = {
  messages?: Message[]
  prompt?: string
  model?: string
  response_format?: ResponseFormat
  stop?: string | string[]
  stream?: boolean
  plugins?: Plugin[]
  max_tokens?: number
  temperature?: number
  tools?: Tool[]
  tool_choice?: ToolChoice
  seed?: number
  top_p?: number
  top_k?: number
  frequency_penalty?: number
  presence_penalty?: number
  repetition_penalty?: number
  logit_bias?: { [key: number]: number }
  top_logprobs: number
  min_p?: number
  top_a?: number
  prediction?: { type: "content"; content: string }
  models?: string[]
  route?: "fallback"
  provider?: ProviderPreferences
  user?: string
  debug?: { echo_upstream_body?: boolean }
}
```

OpenAPI-level details (https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md):

- `messages` — required. `model` — "Model identifier (e.g., `openai/gpt-4`)"; if omitted the account's default model is used.
- `max_tokens` — "Maximum tokens (deprecated, use max_completion_tokens). Note: some providers enforce a minimum of 16." `max_completion_tokens` — "Maximum tokens in completion". Both `integer | null`. Send `max_tokens` for now (every model's `supported_parameters` list contains it; `max_completion_tokens` only on some endpoints, e.g. Azure gpt-4o-mini — see live probe in 4.3). **UNCERTAIN**: whether OpenRouter translates `max_completion_tokens` for providers that only list `max_tokens`. Safer to send `max_tokens`.
- `temperature` — number, range 0-2, default 1.0 (https://openrouter.ai/docs/api_reference/parameters.md).
- `stop` — "Stop sequences (up to 4)".
- `seed` — "Random seed for deterministic outputs"; parameters page: "If specified, the inferencing will sample deterministically, such that repeated requests with the same seed and parameters should return the same result." Determinism not guaranteed for some models.
- `models` — `ChatModelNames`: "Models to use for completion", example `["openai/gpt-4", "openai/gpt-4o"]`.
- `route` — `DeprecatedRoute`: "**DEPRECATED** Use providers.sort.partition instead. Backwards-compatible alias for providers.sort.partition. Accepts legacy values: "fallback" (maps to "model"), "sort" (maps to "none")." Do not send `route`.
- `session_id` (string, max 256) — sticky routing key to the same provider for cache hits. Optional; not needed for one-shot extraction.
- `stream_options.include_usage` — "Deprecated: This field has no effect. Full usage details are always included."
- Parameter omission rule: "When a sampling parameter is absent from your request, OpenRouter omits it upstream rather than substituting a hardcoded value, so the provider applies its own default." (https://openrouter.ai/docs/api_reference/parameters.md)
- Unsupported parameters are silently dropped unless `provider.require_parameters` is true (see 1.4).

### 1.3 `response_format` / structured outputs

OpenAPI discriminator (`create-a-chat-completion.md`): `response_format.type` is one of `text | json_object | json_schema | grammar | python`.

`ChatFormatJsonSchemaConfig` (required: `type`, `json_schema`) and `ChatJsonSchemaConfig`:

```yaml
ChatJsonSchemaConfig:
  description: JSON Schema configuration object
  properties:
    description:
      description: Schema description for the model
      type: string
    name:
      description: Schema name (a-z, A-Z, 0-9, underscores, dashes, max 64 chars)
      maxLength: 64
      type: string
    schema:
      description: JSON Schema object
      type: object
    strict:
      description: Enable strict schema adherence
      example: false
      type: [boolean, "null"]
```

Source: https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion.md

Canonical example from the guide (https://openrouter.ai/docs/guides/features/structured-outputs.md):

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City or location name"
          },
          "temperature": {
            "type": "number",
            "description": "Temperature in Celsius"
          },
          "conditions": { "type": "string" }
        },
        "required": ["location", "temperature", "conditions"],
        "additionalProperties": false
      }
    }
  }
}
```

Which models support it — verbatim from the guide:

> Structured outputs are supported by select models. You can find a list of models that support structured outputs on the models page (https://openrouter.ai/models?order=newest&supported_parameters=structured_outputs).
>
> Support is determined per endpoint, not just per model: the same model may be served by multiple providers, and only some of those providers may support structured outputs. Endpoint support can also change over time. To see which providers support structured outputs for a specific model, check the `structured_outputs` parameter in the Providers section of the model's page.

Guaranteeing routing to a supporting endpoint — verbatim:

> 1. Check the model's supported parameters on the models page
> 2. Set `require_parameters: true` in your provider preferences
> 3. Include `response_format` and set `type: json_schema` in the required parameters

Best practices — verbatim:

> 1. **Include descriptions**: Add clear descriptions to your schema properties to guide the model
> 2. **Use strict mode**: Set `strict: true` so that providers with a native strict mode enforce your schema exactly. Enforcement varies by provider: some guarantee schema-conforming output, while others translate your schema into their own structured-output format or treat it as a strong hint, so exact compliance is not guaranteed on every endpoint. Strict modes may also restrict which JSON Schema features you can use. See the provider's documentation for details

Streaming + structured outputs: supported; output streams as "valid partial JSON that, when complete, forms a valid response matching your schema." (rendered page https://openrouter.ai/docs/features/structured-outputs)

Errors: "Unsupported model: Request fails with support error. Invalid schema: Model returns JSON Schema validation error." (same page). Exact error `code`/`error_type` for these is **UNCERTAIN** (not enumerated in the docs).

Response Healing plugin (https://openrouter.ai/docs/guides/features/plugins/response-healing.md): add `"plugins": [{ "id": "response-healing" }]`; "Response Healing only applies to non-streaming requests"; pairs with `json_schema` or `json_object`; fixes missing brackets, trailing commas, unquoted keys, markdown wrappers; "Some malformed JSON responses may still be unrepairable" (notably `max_tokens` truncation). Cost: not stated — **UNCERTAIN**.

Implication for us: always validate the parsed JSON against the schema ourselves (e.g. zod) regardless of `strict`. Provider adherence is not a guarantee.

### 1.4 `provider` routing options relevant to structured outputs

From https://openrouter.ai/docs/guides/routing/provider-selection.md and the OpenAPI `ProviderPreferences`:

| Field                | Type                                                        | Default | Doc text                                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require_parameters` | boolean                                                     | false   | "Whether to filter providers to only those that support the parameters you've provided. If this setting is omitted or set to false, then providers will receive only the parameters they support, and ignore the rest." |
| `allow_fallbacks`    | boolean                                                     | true    | "Whether to allow backup providers when the primary is unavailable."                                                                                                                                                    |
| `order`              | string[]                                                    | -       | "List of provider slugs to try in order"                                                                                                                                                                                |
| `only` / `ignore`    | string[]                                                    | -       | allow-list / skip-list of provider slugs                                                                                                                                                                                |
| `data_collection`    | "allow" \| "deny"                                           | "allow" | filter by data-retention policy                                                                                                                                                                                         |
| `zdr`                | boolean                                                     | -       | "Restrict routing to only ZDR endpoints"                                                                                                                                                                                |
| `sort`               | "price" \| "throughput" \| "latency" \| `{ by, partition }` | -       | "Sort providers by price, throughput, or latency." When set, load balancing is disabled.                                                                                                                                |
| `max_price`          | object                                                      | -       | cap per-token price                                                                                                                                                                                                     |
| `quantizations`      | string[]                                                    | -       | filter by quantization                                                                                                                                                                                                  |

Example from the docs:

```json
{
  "provider": { "require_parameters": true },
  "response_format": { "type": "json_object" }
}
```

Nuance (rendered page https://openrouter.ai/docs/features/provider-routing): "certain parameters (`tools`, `response_format`, `verbosity`) function as soft preferences even when false—the system prefers supporting providers but won't remove models entirely if none support the feature." So without `require_parameters: true`, `response_format` is a preference, not a filter. Set it to `true`.

Recommended request for extraction:

```json
{
  "model": "<primary>",
  "models": ["<primary>", "<fallback>"],
  "messages": [...],
  "temperature": 0,
  "max_tokens": 2048,
  "response_format": { "type": "json_schema", "json_schema": { "name": "...", "strict": true, "schema": {...} } },
  "provider": { "require_parameters": true },
  "plugins": [{ "id": "response-healing" }]
}
```

(Composition is mine; each field is documented above. `temperature: 0` for extraction is a general practice, not an OpenRouter recommendation — the docs only say lower values are "more predictable".)

### 1.5 Response shape

From https://openrouter.ai/docs/api_reference/overview.md:

```typescript
type Response = {
  id: string
  choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[]
  created: number
  model: string // the model actually used (matters with `models` fallback)
  object: "chat.completion" | "chat.completion.chunk"
  system_fingerprint?: string
  usage?: ResponseUsage
}

type ResponseUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens: number
    cache_write_tokens?: number
    audio_tokens?: number
    video_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
    audio_tokens?: number
    image_tokens?: number
  }
  cost?: number // credits (USD)
  is_byok?: boolean
  cost_details?: {
    upstream_inference_cost?: number
    upstream_inference_prompt_cost: number
    upstream_inference_completions_cost: number
    server_tool_cost?: number | null
  }
  server_tool_use?: { web_search_requests?: number }
}
```

Non-streaming choice: `choices[0].message.content: string | null`, `choices[0].message.role: 'assistant'`, `choices[0].finish_reason` normalized to `'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error'`, plus `native_finish_reason` (raw provider value). Source: https://openrouter.ai/docs/api-reference/overview

Example (https://openrouter.ai/docs/api-reference/chat-completion):

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "openai/gpt-4",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Response text" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 25, "completion_tokens": 10, "total_tokens": 35 }
}
```

Usage accounting (https://openrouter.ai/docs/cookbook/administration/usage-accounting.md): `usage: { include: true }` "is now deprecated and has no effect"; "Full usage details are now always included automatically in every response." For streams: "This information is included in the last SSE message". So `usage.cost` is available for per-user cost display with no extra flag.

Guard: `finish_reason === "length"` means the JSON was truncated by `max_tokens` — treat as failure, do not parse.

### 1.6 Error shape and HTTP codes

Shape (https://openrouter.ai/docs/api_reference/errors-and-debugging.md):

```typescript
type ErrorResponse = {
  error: {
    code: number // matches HTTP status for pre-request failures
    message: string
    metadata?: Record<string, unknown>
  }
}
```

Live probe (invalid key, 2026-09-27), both `/api/v1/key` and `/api/v1/chat/completions`:

```
HTTP 401
{"error":{"message":"User not found.","code":401}}
```

No `Authorization` header at all on `/api/v1/key`: `{"error":{"message":"No cookie auth credentials found","code":401}}`.

Status table (https://openrouter.ai/docs/api-reference/errors and errors-and-debugging.md):

| Code      | Meaning                                                                                                 | `error.metadata.error_type` examples | Retry?                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| 400       | Bad request / invalid params; also `context_length_exceeded`, `max_tokens_exceeded`, `invalid_request`  |                                      | No                                                                             |
| 401       | "Invalid/expired credentials" — `authentication`                                                        |                                      | No; fix key                                                                    |
| 402       | Insufficient credits — `payment_required`; check `error.metadata.limit_source`                          |                                      | Only if `limit_source === "openrouter_in_flight_budget"` (honor `Retry-After`) |
| 403       | Permission denied / guardrail / moderation — `permission_denied`, `content_policy_violation`, `refusal` |                                      | No                                                                             |
| 404       | `not_found`; also auto-router "No models match your request and model restrictions"                     |                                      | No                                                                             |
| 408       | Request timeout                                                                                         |                                      | Retry after delay                                                              |
| 413       | `payload_too_large`                                                                                     |                                      | No                                                                             |
| 429       | Rate limited — `rate_limit_exceeded`                                                                    |                                      | Yes; honor `Retry-After`, exponential backoff                                  |
| 502       | Model unavailable / invalid provider response — `provider_unavailable`                                  |                                      | Yes; OpenRouter may already have tried a fallback                              |
| 503       | No available provider matching criteria — `provider_overloaded`                                         |                                      | Yes after `Retry-After`                                                        |
| 504       | `timeout`                                                                                               |                                      | Retry with backoff                                                             |
| 524 / 529 | Infrastructure timeout / provider overloaded (listed on the embeddings endpoint)                        |                                      | Retry                                                                          |

402 `limit_source` values (https://openrouter.ai/docs/api_reference/limits.md): `openrouter_in_flight_budget` (requests still settling; wait for `Retry-After`), `openrouter_key_limit` (per-key cap exhausted), `openrouter_credits` (balance insufficient or single request too expensive — reduce `max_tokens` or add credits). Note the rendered limits page also names `in_flight_budget_exhausted` and `weight_exceeds_budget`; **UNCERTAIN** whether those are `limit_source` values or a different field. Match on both.

Moderation metadata (403): `{ reasons: string[]; flagged_input: string; provider_name: string; model_slug: string }`.

Mid-generation errors: "Once the provider accepts a streaming request, HTTP `200 OK` is committed." Non-streaming: "Check for `error` field even on `200` status". Streaming: an SSE chunk with top-level `error` and `choices[0].finish_reason: "error"` terminates the stream. "If an attempt fails before any tokens reach you, OpenRouter automatically tries a backup provider." Source: https://openrouter.ai/docs/api-reference/errors

Advice from the docs: "Always inspect `error.metadata.error_type` to determine error category and retry strategy" rather than HTTP status alone.

### 1.7 Rate-limit headers

From https://openrouter.ai/docs/api_reference/limits.md:

- On `429` from OpenRouter platform limits (not provider-side): `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- `Retry-After: <seconds>` on `429`, `503`, and `402` when `limit_source` is `openrouter_in_flight_budget`. "when all attempted providers returned a retry hint".
- Free-variant models (`:free`): 20 RPM; 50 RPD if < 10 credits ever purchased, 1,000 RPD if >= 10. Paid models have no documented fixed RPM; limits are credit-based ("the estimated token cost up front ... the input tokens, plus the completion tokens allowed by `max_tokens`" is held in an in-flight budget). Keep `max_tokens` realistic — it inflates the held amount.
- No `x-openrouter-*` rate-limit headers are documented. The only `X-OpenRouter-*` headers in the docs are the request headers `X-OpenRouter-Title` and `X-OpenRouter-Metadata`.

---

## 2. Embeddings

### 2.1 Endpoint and request body

`POST https://openrouter.ai/api/v1/embeddings`, same `Authorization: Bearer` header. No streaming.
Source: https://openrouter.ai/docs/api-reference/embeddings

OpenAPI request schema (verbatim, https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request.md). Required: `input`, `model`.

```yaml
properties:
  dimensions:
    description: The number of dimensions for the output embeddings
    example: 1536
    minimum: 1
    type: integer
  encoding_format:
    description: The format of the output embeddings
    enum: [float, base64]
    example: float
    type: string
  input:
    anyOf:
      - { type: string, minLength: 1 }
      - { type: array, items: { type: string, minLength: 1 } }
      - { type: array, items: { type: number } } # token ids
      - { type: array, items: { type: array, items: { type: number } } }
      - { type: array, items: { type: object, required: [content], ... } } # multimodal content parts
    description: Text, token, or multimodal input(s) to embed
  input_type:
    description: The type of input (e.g. search_query, search_document)
    example: search_query
    type: string
  model:
    description: The model to use for embeddings
    example: openai/text-embedding-3-small
    type: string
  provider:
    $ref: ProviderPreferences # order, allow_fallbacks, data_collection, only, ignore, max_price ...
  session_id: { type: string, maxLength: 256 }
  user: { type: string } # A unique identifier for the end-user
```

Example request from the spec:

```json
{
  "input": "The quick brown fox jumps over the lazy dog",
  "model": "openai/text-embedding-3-small",
  "dimensions": 1536
}
```

`dimensions` (Matryoshka) is therefore a first-class documented parameter. The OpenRouter blog states it works with "OpenAI Text Embedding 3 Small, Gemini Embedding 2, and Voyage 4 Large" and warns "If you built the index with a non-default dimension, include the same dimensions value when embedding queries" (https://openrouter.ai/blog/insights/best-embedding-models-2026/ — blog, not docs; treat as secondary). **UNCERTAIN**: behaviour when `dimensions` is sent to a model that does not support it (ignored vs 400). The models list does not expose per-model `dimensions` support (`supported_parameters` is `[]` for every embedding model today — see 2.3). Test per model before relying on it.

`input_type` (`search_query` / `search_document`) is the asymmetric-retrieval hint used by Cohere/Voyage/NVIDIA-style models. **UNCERTAIN** which OpenRouter-listed models honor it; docs give no per-model matrix.

### 2.2 Response shape

Verbatim from the same spec:

| Field                 | Type                 | Description                                                                                        |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `object`              | `"list"`             |                                                                                                    |
| `id`                  | string               | "Unique identifier for the embeddings response"                                                    |
| `model`               | string               | "The model used for embeddings"                                                                    |
| `data[].object`       | `"embedding"`        |                                                                                                    |
| `data[].embedding`    | `number[] \| string` | "Embedding vector as an array of floats or a base64 string"                                        |
| `data[].index`        | integer              | "Index of the embedding in the input list"                                                         |
| `usage.prompt_tokens` | integer              | "Number of tokens in the input"                                                                    |
| `usage.total_tokens`  | integer              | "Total number of tokens used"                                                                      |
| `usage.cost`          | number               | "Cost of the request in credits"                                                                   |
| `usage.cost_details`  | object               | `upstream_inference_prompt_cost`, `upstream_inference_completions_cost`, `upstream_inference_cost` |

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.0023064255, -0.009327292, 0.015797347],
      "index": 0
    }
  ],
  "model": "openai/text-embedding-3-small",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

Error codes listed on the endpoint: 400, 401, 402, 403, 404, 408, 413, 429, 500, 502, 503, 524, 529.

Rendered-page notes (https://openrouter.ai/docs/api-reference/embeddings): "No streaming support", "Token limits per model (truncation/rejection on exceed)", "Language support varies by model". Whether over-length input is truncated or rejected is per-model — **UNCERTAIN**; chunk to well under `context_length` ourselves.

### 2.3 Embedding models listed today (live `GET /api/v1/models?output_modalities=embeddings`, 2026-09-27)

37 models returned (the sibling `GET /api/v1/embeddings/models` returned 33 — **UNCERTAIN** why they differ; the `/models` filter is the one documented at https://openrouter.ai/docs/api/api-reference/models/get-models). `context_length` = max input tokens. Prices are `pricing.prompt` in USD per token (x1e6 = per million). Dimensions come from the model `description` field or the collections page (https://openrouter.ai/collections/embedding-models); where neither states it, marked "not stated".

| Model id                                                                                                                                                                                                                                                                                                                                                                                           | Max input tokens | $/M tokens   | Dimensions                                                                  | Multilingual (per description)                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `openai/text-embedding-3-small` (+`:batch` at half price)                                                                                                                                                                                                                                                                                                                                          | 8,192            | 0.02         | not stated (OpenAI default 1536; `dimensions` documented example uses 1536) | "improved ... version of the ada model"            |
| `openai/text-embedding-3-large` (+`:batch`)                                                                                                                                                                                                                                                                                                                                                        | 8,192            | 0.13         | not stated (OpenAI default 3072)                                            | "for both english and non-english tasks"           |
| `openai/text-embedding-ada-002` (+`:batch`)                                                                                                                                                                                                                                                                                                                                                        | 8,192            | 0.10         | not stated                                                                  | legacy                                             |
| `google/gemini-embedding-2` (+`:batch` 0.10, `-preview`)                                                                                                                                                                                                                                                                                                                                           | 8,192            | 0.20         | 128-3,072 flexible (recommended 768/1536/3072)                              | multimodal text+image                              |
| `google/gemini-embedding-001`                                                                                                                                                                                                                                                                                                                                                                      | 20,000           | 0.15         | not stated                                                                  | yes (collections page)                             |
| `qwen/qwen3-embedding-8b`                                                                                                                                                                                                                                                                                                                                                                          | 32,768           | 0.01         | not stated                                                                  | "exceptional multilingual capabilities, long-text" |
| `qwen/qwen3-embedding-4b`                                                                                                                                                                                                                                                                                                                                                                          | 32,768           | 0.02         | not stated                                                                  | same series                                        |
| `voyageai/voyage-4-large`                                                                                                                                                                                                                                                                                                                                                                          | 32,000           | 0.12         | 2048/1024/512/256 (Matryoshka)                                              | "general-purpose and multilingual"                 |
| `voyageai/voyage-4`                                                                                                                                                                                                                                                                                                                                                                                | 32,000           | 0.06         | 2048/1024/512/256                                                           | "general-purpose (including multilingual)"         |
| `voyageai/voyage-4-lite`                                                                                                                                                                                                                                                                                                                                                                           | 32,000           | 0.02         | 2048/1024/512/256                                                           | not stated                                         |
| `voyageai/voyage-code-4`                                                                                                                                                                                                                                                                                                                                                                           | 32,000           | 0.12         | 2048/1024/512/256                                                           | code                                               |
| `voyageai/voyage-multimodal-3.5`                                                                                                                                                                                                                                                                                                                                                                   | 32,000           | 0.12         | not stated                                                                  | multimodal                                         |
| `baai/bge-m3`                                                                                                                                                                                                                                                                                                                                                                                      | 8,194            | 0.01         | 1024                                                                        | "multilingual retrieval"                           |
| `intfloat/multilingual-e5-large`                                                                                                                                                                                                                                                                                                                                                                   | 512              | 0.01         | 1024                                                                        | "over 90 languages"                                |
| `mistralai/mistral-embed-2312`                                                                                                                                                                                                                                                                                                                                                                     | 8,192            | 0.10         | 1024                                                                        | not stated                                         |
| `mistralai/codestral-embed-2505`                                                                                                                                                                                                                                                                                                                                                                   | 8,192            | 0.15         | not stated                                                                  | code                                               |
| `perplexity/pplx-embed-v1-4b` / `-0.6b`                                                                                                                                                                                                                                                                                                                                                            | 32,000           | 0.03 / 0.004 | not stated                                                                  | not stated                                         |
| `nvidia/nemotron-3-embed-1b:free`                                                                                                                                                                                                                                                                                                                                                                  | 32,768           | 0            | not stated                                                                  | not stated                                         |
| `nvidia/llama-nemotron-embed-vl-1b-v2:free`                                                                                                                                                                                                                                                                                                                                                        | 131,072          | 0            | not stated                                                                  | multimodal                                         |
| `liquid/lfm-2.5-embedding-350m:free`                                                                                                                                                                                                                                                                                                                                                               | 512              | 0            | 1024                                                                        | not stated; "may be retained and used to train"    |
| English-only 512-token small models: `thenlper/gte-base` (768), `thenlper/gte-large` (1024), `intfloat/e5-base-v2` (768), `intfloat/e5-large-v2` (1024), `baai/bge-base-en-v1.5` (768), `baai/bge-large-en-v1.5` (1024), `sentence-transformers/all-minilm-l6-v2` (384), `all-minilm-l12-v2` (384), `paraphrase-minilm-l6-v2` (384), `all-mpnet-base-v2` (768), `multi-qa-mpnet-base-dot-v1` (768) | 512              | 0.005-0.01   | as listed                                                                   | English                                            |

Not on OpenRouter today: **Cohere `embed-multilingual-v3` / `embed-v4` (no `cohere/` embedding ids at all)**, **`voyage-multilingual-2`** (Voyage's current multilingual story on OpenRouter is `voyage-4*`), **`qwen/qwen3-embedding-0.6b`** (only 4b/8b), and no Jina models. If the spec assumed Cohere multilingual, it needs a swap — candidates with stated multilingual support and a `dimensions` knob: `voyageai/voyage-4` (32k ctx, $0.06/M) or `google/gemini-embedding-2` (8k ctx, $0.20/M); cheapest multilingual without a dimensions knob: `qwen/qwen3-embedding-8b` ($0.01/M, 32k ctx) or `baai/bge-m3` ($0.01/M, 8k, 1024-d).

Every embedding model's `supported_parameters` is `[]` and `top_provider.max_completion_tokens` is populated with a nonsense value (e.g. 7372 for an 8192-ctx model) — ignore both fields for embeddings.

---

## 3. Auth check / key info

`GET https://openrouter.ai/api/v1/key` with `Authorization: Bearer <key>`.
Source: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key and https://openrouter.ai/docs/api_reference/limits.md

"The endpoint doesn't require a management key like other key management endpoints do—it works with any valid API key to fetch the details of that specific key's current status." (search summary of the same page). Live probe confirms `/api/v1/auth/key` also returns 401 (not 404) without a key, so the legacy path still resolves; the documented path is `/api/v1/key` — use that.

Documented response (limits.md TypeScript type):

```typescript
type Key = {
  data: {
    label: string
    limit: number | null // spending limit in USD
    limit_reset: string | null // e.g. "monthly"
    limit_remaining: number | null // remaining budget in USD
    include_byok_in_limit: boolean
    usage: number // total credits consumed, USD
    usage_daily: number
    usage_weekly: number
    usage_monthly: number
    byok_usage: number
    byok_usage_daily: number
    byok_usage_weekly: number
    byok_usage_monthly: number
    is_free_tier: boolean
    free_model_daily_requests: {
      used: number
      limit: number
      remaining: number
    }
  }
}
```

The API-reference page's example adds: `allowed_data_regions: string[]`, `expires_at: string | null`, `is_management_key`, `is_provisioning_key`, `creator_user_id`, `organization_id`, `workspace_id`, and `rate_limit: { interval, requests, note: "This field is deprecated and safe to ignore." }`.

Errors: 401 "Missing Authentication header" (docs) / `{"error":{"message":"User not found.","code":401}}` (live, invalid key).

Note: this endpoint reports per-key `limit`/`limit_remaining`, not the account's credit balance. A key with `limit: null` can still 402 when the account balance is zero. For a "key rejected" UX: 401 -> "invalid key"; 200 with `limit_remaining === 0` -> "key spending cap reached"; a later 402 on a real call -> "out of credits" (branch on `limit_source`). A cheap live call is the only way to detect zero balance up front — **UNCERTAIN** whether a credits endpoint is exposed to normal (non-management) keys; `/api/v1/credits` exists in the docs but the auth requirement is not verified here.

---

## 4. Models listing

### 4.1 Endpoint

`GET https://openrouter.ai/api/v1/models`. The docs mark it as Bearer-authenticated, but the live probe returned the full list with no header. Query params: `category`, `supported_parameters` ("Filter models by supported parameter (comma-separated)"), `output_modalities` ("text, image, embeddings, audio, video, rerank, decisions, speech, transcription" or "all"), `sort`, `offset`, `limit` (default 500, max 1000). Response root: `{ data: Model[], total_count, links: { next } }`.
Source: https://openrouter.ai/docs/api/api-reference/models/get-models

### 4.2 Model object fields (relevant subset)

```json
{
  "id": "string",
  "canonical_slug": "string",
  "name": "string",
  "context_length": "integer | null",
  "architecture": { "modality": "text->text", "input_modalities": ["text"], "output_modalities": ["text"], "tokenizer": "GPT", "instruct_type": null },
  "pricing": {
    "prompt": "string (USD per token)", "completion": "string", "request": "string", "image": "string",
    "input_cache_read": "string", "input_cache_write": "string", "internal_reasoning": "string", "web_search": "string",
    "discount": "number (0-1)", "overrides": []
  },
  "top_provider": { "context_length": "integer | null", "max_completion_tokens": "integer | null", "is_moderated": "boolean" },
  "per_request_limits": { "prompt_tokens": "number", "completion_tokens": "number" } | null,
  "supported_parameters": ["temperature", "top_p", "max_tokens", "tools", "response_format", "structured_outputs", ...],
  "default_parameters": { "temperature": "number | null", ... } | null,
  "links": { "details": "/api/v1/models/{author}/{slug}/endpoints" }
}
```

Pricing is a string in USD per token; `"0"` = free; `"-1"` observed live for router pseudo-models — treat non-positive as "unknown/free".

### 4.3 Checking structured-output support

Two distinct parameter names appear in `supported_parameters`: `response_format` (JSON mode) and `structured_outputs` (JSON-schema). Live example, `openai/gpt-4o-mini`:

```json
"supported_parameters": ["frequency_penalty","logit_bias","logprobs","max_completion_tokens","max_tokens","prediction","presence_penalty","response_format","seed","stop","structured_outputs","temperature","tool_choice","tools","top_logprobs","top_p","web_search_options"]
```

Server-side filter: `GET /api/v1/models?supported_parameters=structured_outputs`. Because support is per endpoint, the authoritative check is `GET /api/v1/models/{author}/{slug}/endpoints`, which returns `data.endpoints[].supported_parameters` per provider (live example: Azure gpt-4o-mini lists `max_completion_tokens` but not `max_tokens`/`tools`; OpenAI lists `max_tokens`, `tools`). Combine with `provider.require_parameters: true` so the router only picks endpoints that list every parameter you send.

There is also a `GET /api/v1/parameters/{author}/{slug}` endpoint documented (https://openrouter.ai/docs/api/api-reference/parameters/get-parameters) — its response shape was not fetched; **UNCERTAIN**.

---

## 5. Best practices that the docs actually state

- **Retries**: no OpenRouter-wide retry policy is documented. Per error type (errors-and-debugging.md): 429 -> respect `Retry-After`, exponential backoff; 503 -> short delay then retry; 502 -> OpenRouter may already have auto-retried a fallback; 504 -> backoff; 402 with `openrouter_in_flight_budget` -> read `Retry-After`, wait, retry; 401 -> do not retry; 400 `context_length_exceeded` -> do not retry. Note: "SDKs ... respect this automatically except for `402`—catch that error, read the header, and retry explicitly." With raw `fetch` we handle all of them.
- **Timeouts**: not documented for non-streaming. For streaming the docs send `: OPENROUTER PROCESSING` SSE comments as keep-alives and say to use `AbortController` to cancel; "For non-streaming requests or unsupported providers, the model will continue processing and you will be billed for the complete response." (https://openrouter.ai/docs/api-reference/streaming). For a Worker, set our own `AbortSignal.timeout()` and accept that aborted non-stream calls are still billed.
- **`max_tokens`**: bounded by context minus prompt; "some providers enforce a minimum of 16"; also used to compute the in-flight credit hold, so do not set it absurdly high. For reasoning models it "covers both reasoning and visible output tokens combined on most providers" (parameters page).
- **`temperature: 0`**: not an OpenRouter recommendation; docs only define range 0-2, default 1.0, "Lower values lead to more predictable and typical responses". `seed` exists but "Determinism not guaranteed for some models".
- **`models` fallback array** (https://openrouter.ai/docs/guides/routing/model-fallbacks.md): tried in order on "Context length validation errors", "Moderation flags for filtered models", "Rate-limiting", "Downtime", 5xx. "Requests are priced using the model that was ultimately used, which will be returned in the `model` attribute of the response body." Example: `{"models": ["~anthropic/claude-sonnet-latest", "gryphe/mythomax-l2-13b"], "messages": [...]}`. The Anthropic-Messages-style `fallbacks` cap of 3 entries applies only to `/api/v1/messages`; no cap is documented for `models` on chat completions — **UNCERTAIN**.
- **Provider-level fallback** is automatic ("When an error occurs in an upstream provider, we can recover by routing to another healthy provider, if your request filters allow it." https://openrouter.ai/docs/guides/best-practices/uptime-optimization.md). `allow_fallbacks: false` disables it.
- **Latency** (https://openrouter.ai/docs/guides/best-practices/latency-and-performance.md): explicitly mentions "Edge computing using Cloudflare Workers to stay as close as possible to your application"; `provider.sort.partition: "none"` with multiple `models` routes "to the fastest available endpoint across all candidates, rather than exhausting Model A's providers first"; `preferred_max_latency` / `preferred_min_throughput` exist on `provider` for bounding tail latency.
- **Errors on 200**: always check the body for a top-level `error` even on HTTP 200 (non-streaming) — generation-time failures are reported that way.

---

## 6. Open questions to resolve before coding

1. Which chat model(s) we standardise on — verify `structured_outputs` per endpoint via `/models/{slug}/endpoints` for each candidate.
2. Which embedding model replaces Cohere multilingual (it is not on OpenRouter). Decide between `voyageai/voyage-4` (Matryoshka, 32k) and `qwen/qwen3-embedding-8b` (cheapest, 32k, no `dimensions` knob confirmed).
3. Empirically confirm `dimensions` behaviour on the chosen embedding model (ignored vs 400 when unsupported).
4. Whether to probe balance up-front (cheap real call) or rely on 402 handling at first use.
