# Supadata and Jina Reader on operator keys: free tiers, prices, terms, sizing

Read 2026-09-30 from vendor pages only. Covers the operator-paid fallbacks in ADR-0006: Supadata `/v1/transcript` (`mode=native`) and `/v1/metadata`, and Jina Reader for bot-walled articles. Builds on `14-byok-key-verification.md`, `15-youtube-ingestion.md`, `16-instagram-ingestion.md`; per-call credit costs established there are re-confirmed, not redone. Anything not on a primary page is marked **unconfirmed**.

Method caveat: pages were read through a summarising fetch tool, so quoted clauses are as returned by that tool, not byte-checked against the raw page. Jina's token price table sits behind the dashboard top-up UI and could not be read.

## Findings

1. **Supadata free plan: 100 credits/month, no card, resets monthly, no rollover, 1 request/second.** [Pricing](https://supadata.ai/pricing)
2. **Supadata cost per call is 1 credit for both of our calls.** `mode=native` transcript = 1 credit (also 1 credit when it returns `206 transcript-unavailable`); `/v1/metadata` = 1 credit on every platform. Status polling is free. [Transcript](https://docs.supadata.ai/get-transcript.md), [Metadata](https://docs.supadata.ai/get-metadata.md)
3. **Cheapest Supadata paid tier is Basic at $5/month, but only billed annually ($60/year), 300 credits.** The cheapest monthly-billed tier is Pro: $17/month, 3,000 credits, 10 req/s. [Pricing](https://supadata.ai/pricing)
4. **Jina Reader works with no key at 20 RPM, IP-based.** A key raises that to 500 RPM and bills output tokens. [Reader](https://jina.ai/reader/), [Rate limits](https://jina.ai/api-dashboard/rate-limit)
5. **Jina: every new key comes with 10M free tokens.** This resolves the open item in doc 14. The page says nothing about it being monthly; it reads as a one-time grant (see section 2). Keys and tokens do not expire. [Reader FAQ](https://jina.ai/reader/)
6. **Jina's paid price per token and package prices are unconfirmed.** The pricing page shows rate-limit tiers only; `jina.ai/pricing` returns 404. [API pricing](https://jina.ai/api-dashboard/pricing/)
7. **Both terms restrict resale, but neither clearly bans serving our own end users through our own key.** Supadata: "Resale, sub-licensing or white-labelling requires prior written consent." Whether a product that funds its users' lookups from one key is "resale" is ambiguous and needs a written answer from Supadata. Jina's terms make the customer liable for end-user activity on its keys; no multi-tenant ban was found.
8. **Supadata credits do not roll over.** Jina tokens do not expire (FAQ) and credits roll over unless an Order Form says otherwise (Terms 6.5).
9. **Free tier covers zero always-maxing Users at every allowance in scope** (100 credits vs 150 to 1,500 worst-case credits per User). See the sizing table.

## 1. Supadata

### Free tier

- Free plan: $0, 100 credits/month, 1 request/second, "no credit card". [Pricing](https://supadata.ai/pricing)
- Reset: monthly, "each month you start with the same amount of credits as your plan". [Pricing](https://supadata.ai/pricing)
- Expiry: credits "do not roll over to the next month". [Pricing](https://supadata.ai/pricing)
- Top-ups are listed for Free and Basic at $10 per 1,000 credits. Whether the Free plan can actually buy them is stated only as a pricing-table row; unconfirmed in practice. [Pricing](https://supadata.ai/pricing)

### Cost per call

| Call                                                          | Credits               | Source                                                   |
| ------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| `/v1/transcript`, `mode=native`, success                      | 1                     | [Transcript](https://docs.supadata.ai/get-transcript.md) |
| `/v1/transcript`, `mode=native`, `206 transcript-unavailable` | 1                     | [Transcript](https://docs.supadata.ai/get-transcript.md) |
| `/v1/metadata`, any platform                                  | 1                     | [Metadata](https://docs.supadata.ai/get-metadata.md)     |
| `mode=generate` or `auto` fallback (not used)                 | 2 per minute of video | [Transcript](https://docs.supadata.ai/get-transcript.md) |
| Job status polling                                            | 0                     | [Transcript](https://docs.supadata.ai/get-transcript.md) |

The pricing page also lists translation at 30 credits/minute and extraction at 5 credits/minute (minimum); neither is used. [Pricing](https://supadata.ai/pricing) Worst case for our calls is 1 credit, so the sizing below uses 1 credit for both.

### Paid tiers

| Plan       | Price                       | Credits/month | Rate limit | Overage        |
| ---------- | --------------------------- | ------------- | ---------- | -------------- |
| Free       | $0                          | 100           | 1/s        | $10 per 1,000  |
| Basic      | $5/mo, annual only ($60/yr) | 300           | 10/s       | $10 per 1,000  |
| Pro        | $17/mo                      | 3,000         | 10/s       | $10 per 1,000  |
| Mega       | $47/mo                      | 30,000        | 50/s       | $10 per 5,000  |
| Giga       | $297/mo                     | 300,000       | 100/s      | $20 per 20,000 |
| Supa       | $897/mo                     | 1,000,000     | 100/s      | $20 per 20,000 |
| Enterprise | custom                      | custom        | custom     | custom         |

Source: [Pricing](https://supadata.ai/pricing). Overage block sizes are read from the pricing table; whether overage is automatic or needs a manual purchase is unconfirmed.

### Throttling

- Out of credits and throttling both return `429 limit-exceeded`, told apart only by `details` (see doc 14). [Errors](https://docs.supadata.ai/errors/limit-exceeded.md)
- Terms: "We may throttle or suspend keys that exceed reasonable request volumes or threaten system stability." "Reasonable" is undefined. [Terms of Service](https://supadata.ai/legal/terms)

## 2. Jina Reader

### Free tier

- No key: allowed. "Reader is free for basic usage: prepend 'https://r.jina.ai/' to your URL." 20 RPM, IP-based. [Reader](https://jina.ai/reader/), [Rate limits](https://jina.ai/api-dashboard/rate-limit)
- Free key: "Every new API key comes with 10M free tokens!" and "New users get an auto-generated API key with free tokens usable across any of our models." [Reader FAQ](https://jina.ai/reader/)
  - Card requirement: not stated on any page read. Unconfirmed. The embeddings page describes the key as auto-generated for new users. [Embeddings](https://jina.ai/embeddings/)
  - One-time versus monthly: the page does not say. Nothing indicates a monthly refill. Treat as one-time; unconfirmed on a primary page.
  - Expiry: "No, our API keys do not have an expiration date." [Reader FAQ](https://jina.ai/reader/)
- Failed requests: "Tokens are not deducted for failed requests." [Reader](https://jina.ai/reader/)

### Rate limits

| Reader key type | RPM   | Source                                                  |
| --------------- | ----- | ------------------------------------------------------- |
| No key          | 20    | [Rate limits](https://jina.ai/api-dashboard/rate-limit) |
| Free key        | 500   | same                                                    |
| Paid key        | 500   | same                                                    |
| Premium key     | 5,000 | same                                                    |

All tiers also have "an IP-based limit of 10,000 requests per 60 seconds". [Reader](https://jina.ai/reader/) Rate limit is per IP or per key. Cloudflare Workers egress IPs are shared, so the 20 RPM anonymous limit would be shared with other tenants; this is inference, not a documented fact.

### Cost per fetch

- Reader bills "the number of tokens in the output response". No per-request minimum was found. [Reader FAQ](https://jina.ai/reader/)
- Tokens per fetch depend on page length. No primary figure exists. Sizing below assumes 10,000 output tokens per article (our assumption, unconfirmed).

### Paid tiers

- Jina has no named monthly plans. It sells token top-ups via Stripe with optional auto top-up; currency varies by location. [API pricing](https://jina.ai/api-dashboard/pricing/)
- Rate tiers are Free, Paid (500 RPM Reader, 2M TPM on embeddings), Premium (5,000 RPM Reader). [Embeddings](https://jina.ai/embeddings/), [Rate limits](https://jina.ai/api-dashboard/rate-limit) How a key is promoted to Paid or Premium (token balance, purchase size) is unconfirmed on a primary page.
- **Cheapest paid entry point, package sizes and price per million tokens: unconfirmed.** A pricing change was announced for 6 May 2025; existing auto-recharge customers keep legacy pricing unless they change settings. [API pricing](https://jina.ai/api-dashboard/pricing/) Third-party sites cite $0.05 per million tokens, but that figure is for embedding models and is not evidence for Reader, so it is not used as fact.

## 3. Terms

### Supadata ([Terms of Service](https://supadata.ai/legal/terms), operator: Dumpling Software UG)

- Licence: "limited, non-exclusive, non-transferable, revocable licence to call the API in accordance with these Terms. Resale, sub-licensing or white-labelling requires prior written consent."
- Keys: "Keep your API credentials confidential. You are liable for all requests made with your key."
- No clause found that addresses end users of a customer's product, or multi-tenant use, in either direction. **Unconfirmed, and ambiguous.** A product that shows Supadata-derived transcripts to many Users on one key is closer to an integration than resale of API access, but the terms do not say so.
- Refunds: monthly plans refundable only if no request was made in the period; annual plans only within 14 days (cooling-off). Matters for Basic, which is annual-only.
- Terms can change by posting an updated version; continued use is acceptance.

### Jina ([Legal](https://jina.ai/legal/); acquired by Elastic, October 2025 per third-party reports, unconfirmed on a Jina page)

- 3.6: "Customer shall be solely responsible for safeguarding its API keys, including preventing unauthorized access and revoking keys that are no longer needed or are suspected to be compromised." The customer is liable for all activity on its keys, including end users.
- 4.2: Jina grants "a non-exclusive, non-sublicensable, non-transferable, revocable and limited right to use such Jina AI IP strictly for the purpose of using the Services agreed in an Order Form."
- 4.3: Jina "claims no rights to such Output and imposes no restrictions on the Customer regarding the use of the Output."
- 4.5: Output must not be used "to develop applications or services that compete with the Services offered by Jina AI." We are a knowledge product, not a reader API, so this should not bite; it is a reason to keep raw Reader output out of any public API we expose.
- 6.5: credits "may roll over unless the Order Form states otherwise"; purchased credits "are not refundable nor exchangeable."
- No explicit multi-tenant or shared-key prohibition was found. **Unconfirmed.** The Terms are written around Order Forms, and whether self-serve dashboard top-ups fall under the same terms is not stated.

Neither vendor was asked. Only a written reply settles the multi-tenant question.

## 4. Sizing

Assumptions:

- Every paid lookup costs 1 Supadata credit (transcript native and metadata are equal, so worst case equals expected).
- 30-day month. "Worst case" is every User hitting the daily cap every day: `30 x allowance`.
- Realistic usage is 25% of the allowance: `0.25 x 30 x allowance = 7.5 x allowance`.
- All lookups are counted as Supadata lookups, which overstates Supadata demand because some lookups will be Jina. The allowance is one pool and the Supadata/Jina split is unknown.
- Cost picks the cheaper of (a) the smallest tier whose included credits cover demand and (b) a smaller tier plus overage, using overage rates from the table above, rounded up to whole blocks. Monthly billing only (Basic excluded).
- Free tier covers `floor(100 / lookups per User per month)` always-maxing Users.

### Supadata, worst case (every User maxes out)

| Allowance/User/day | Lookups/User/month | Users the free tier covers | Credits, 100 Users | Cost, 100 Users                     | Credits, 1,000 Users | Cost, 1,000 Users                                |
| ------------------ | ------------------ | -------------------------- | ------------------ | ----------------------------------- | -------------------- | ------------------------------------------------ |
| 5                  | 30 x 5 = 150       | 100 / 150 = 0.67, so 0     | 15,000             | Mega $47                            | 150,000              | Mega + 24 blocks = $47 + $240 = $287 (Giga $297) |
| 10                 | 30 x 10 = 300      | 100 / 300 = 0.33, so 0     | 30,000             | Mega $47                            | 300,000              | Giga $297                                        |
| 20                 | 30 x 20 = 600      | 100 / 600 = 0.17, so 0     | 60,000             | Mega + 6 blocks = $47 + $60 = $107  | 600,000              | Giga + 15 blocks = $297 + $300 = $597            |
| 50                 | 30 x 50 = 1,500    | 100 / 1,500 = 0.07, so 0   | 150,000            | Mega + 24 blocks = $287 (Giga $297) | 1,500,000            | Supa + 25 blocks = $897 + $500 = $1,397          |

### Supadata, realistic (25% of allowance)

| Allowance/User/day | Lookups/User/month | Credits, 100 Users | Cost, 100 Users                            | Credits, 1,000 Users | Cost, 1,000 Users                   |
| ------------------ | ------------------ | ------------------ | ------------------------------------------ | -------------------- | ----------------------------------- |
| 5                  | 0.25 x 150 = 37.5  | 3,750              | Pro + 1 block = $17 + $10 = $27 (Mega $47) | 37,500               | Mega + 2 blocks = $47 + $20 = $67   |
| 10                 | 0.25 x 300 = 75    | 7,500              | Mega $47                                   | 75,000               | Mega + 9 blocks = $47 + $90 = $137  |
| 20                 | 0.25 x 600 = 150   | 15,000             | Mega $47                                   | 150,000              | Mega + 24 blocks = $287 (Giga $297) |
| 50                 | 0.25 x 1,500 = 375 | 37,500             | Mega + 2 blocks = $67                      | 375,000              | Giga + 4 blocks = $297 + $80 = $377 |

Block arithmetic: Mega blocks are 5,000 credits at $10, so 60,000 - 30,000 = 30,000 over = 6 blocks. Giga/Supa blocks are 20,000 credits at $20, so 600,000 - 300,000 = 300,000 over = 15 blocks. Pro overage is 1,000 credits at $10, so 3,750 - 3,000 = 750 over = 1 block.

The 100-User free-tier column is 0 in every row. Even at the lowest allowance (5/day) one maxing User needs 150 credits against a 100-credit plan. A free tier is viable only for a closed beta with very few active Users. Sustained revenue-free use beyond a handful of Users needs the Mega tier.

### Jina Reader, tokens only

Assumes 10,000 output tokens per fetch and, as an upper bound, that every lookup is a Reader fetch.

| Allowance/User/day | Tokens/User/month (30 x allowance x 10,000) | Users the 10M free grant covers, once | Tokens, 100 Users | Tokens, 1,000 Users |
| ------------------ | ------------------------------------------- | ------------------------------------- | ----------------- | ------------------- |
| 5                  | 1,500,000                                   | 10M / 1.5M = 6.7, so 6                | 150M              | 1.5B                |
| 10                 | 3,000,000                                   | 3.3, so 3                             | 300M              | 3B                  |
| 20                 | 6,000,000                                   | 1.7, so 1                             | 600M              | 6B                  |
| 50                 | 15,000,000                                  | 0.67, so 0                            | 1.5B              | 15B                 |

Realistic (25%) is one quarter of each token figure. No dollar cost is given because the Reader token price is unconfirmed. The 10M grant is one-time per key, so it is a launch buffer, not a monthly allowance. The free allowance is also one per key, and minting more keys to extend it would be gaming the grant; do not plan on it.

Rate-limit check at 1,000 Users, allowance 20: 600 fetches per User per month is far below 500 RPM. A key is required in production because 20 RPM no-key is shared by IP.

## Open questions / risks

1. **Multi-tenant use under one key is unconfirmed for both vendors.** Supadata requires prior written consent for "resale, sub-licensing or white-labelling". Email Supadata with the exact model (operator key, per-User daily cap, results stored per User) and get a written answer before launch. Biggest risk: account suspension would silence every User's fallback at once.
2. **Jina Reader token price is unconfirmed.** The cost column for Jina cannot be filled until someone reads the dashboard top-up UI with a real account. Do this before committing to a budget.
3. **Jina free grant: card requirement and one-time versus monthly are unstated.** Assume one-time, no claim on card.
4. **Supadata Basic is annual-only**, so the cheapest commitment-free tier is Pro at $17. Basic's 300 credits is also below the worst-case need of a single maxing User at allowance 10 or higher (300 per User per month).
5. **Overage mechanics are unconfirmed**: whether Supadata overage bills automatically, caps, or hard-stops at the plan limit. Until known, treat running out as a `429 limit-exceeded` hard stop and alert on `usedCredits` from `/v1/me` (doc 14).
6. **Supadata credits do not roll over**, so a quiet month wastes paid credits. Tier choice should be driven by realistic usage with overage covering spikes, not by worst case.
7. **Per-User allowance does not bound total spend.** The bound is `Users x allowance x 30 x price`. At 1,000 Users and allowance 50 the worst case is about $1,400/month on Supadata alone, before Jina. A global daily or monthly circuit breaker is needed in addition to the per-User cap. Budget sign-off belongs with the founders.
8. **Supadata and Jina pricing pages change without notice** (Supadata terms allow amendment by posting; Jina announced a pricing model change on 6 May 2025). Re-read both before launch.
9. **Shared egress IP**: anonymous Jina calls from Workers share a 20 RPM bucket with other traffic on that IP. Not a fallback to rely on in production; inference, not documented.
10. **No live call was made.** No account or valid key was used; nothing here was observed from an authenticated response.
