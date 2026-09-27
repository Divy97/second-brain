# Workflows + Queues item pipeline: step semantics, idempotent creation, local dev, tests

Research date: 2026-09-27. Extends [04-workers-vitest-pool-hyperdrive-wrangler.md](./04-workers-vitest-pool-hyperdrive-wrangler.md) sections 1.6, 1.7, 4.1, 4.2 (basic signatures, fixtures and helper lists are there and not repeated here).

Sources: developers.cloudflare.com (fetched as `index.md`), `cloudflare/workers-sdk` at `main` commit `8dc53aec` (2026-09-26), GitHub issues on `cloudflare/workers-sdk`. Where a claim comes from reading source rather than docs, it says **(source)**. Where it is my inference, it says **(inference)**.

Target: `apps/api`, wrangler 4.141, `compatibility_date: 2026-09-08`, `nodejs_compat`, queue `second-brain-items` (`max_retries: 3`), Workflow binding `PROCESS_ITEM_WORKFLOW` → `ProcessItemWorkflow`, `@cloudflare/vitest-plugin` 1.2.8 + vitest 4.1.

## TL;DR / decisions that matter

1. **Step defaults:** `retries: { limit: 5, delay: 10000, backoff: "exponential" }`, `timeout: "10 minutes"` (per attempt). Local emulator uses a 1000 ms default delay, not 10000 (source). Set config explicitly on every OpenRouter step.
2. **Failure surfaces to `run()`.** When a step exhausts retries, or throws `NonRetryableError`, the error is thrown out of `await step.do(...)`. `try/catch` in `run()` → `step.do("mark item failed")` → re-throw works. If nothing catches it, the instance ends `errored`.
3. **`NonRetryableError`** comes from `"cloudflare:workflows"`. On our compat date (≥ 2026-05-14) its message and name survive (`workflows_preserve_non_retryable_error_message` is on by default). Use it for 401/402/400 from OpenRouter (missing or invalid key, no credit).
4. **`create({ id })` throws on a duplicate id** that is still within retention. Local message: `(instance.already_exists) Workflow instance with id "<id>" already exists` (source). **`createBatch` does not throw.** It skips existing ids and leaves them out of the result. A queue consumer that runs at least once should call `createBatch([{ id, params }])`, or catch the duplicate error, so a redelivered message is harmless.
5. **Instance ids:** ≤ 100 chars, `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$`. A UUID is valid. Ids are unique for the whole retention window (Free 3 days, Paid 30 days, configurable lower). To reprocess an item, either `instance.restart()` the old instance or create a new id such as `${itemId}-${runNumber}`. Store the current instance id on the item row.
6. **Step result limit: 1 MiB per non-stream result.** Embedding vectors should be written to Postgres inside the embed/index step. Return only ids or counts.
7. **Hyperdrive in Workflows:** open a new connection inside each `step.do()` and never reuse it across steps (Rules of Workflows).
8. **CPU per step: Free 10 ms, Paid 30 s by default (up to 5 min via `limits.cpu_ms`).** Wall time per step is unlimited, and I/O does not count. Free also caps subrequests at 50. Chunking on Free is a real risk. Plan needs confirming.
9. **Local dev:** `wrangler dev` runs Workflows (emulated engine) and Queues (Miniflare broker) in-process. Workflow state is kept under `.wrangler/state/v3/workflows`. Queue messages sit in memory in the broker (source). Batch timeout falls back to Miniflare's 1 s and batch size to 5 when the config leaves them unset (source).
10. **Tests:** `createMessageBatch` + `getQueueResult` exercise the consumer. `introspectWorkflow` runs the real workflow code to completion (`disableRetryDelays` removes backoff waits, but the retries still happen). The workflow class runs in the same isolate and Vite module graph as the tests (source), so global fetch mocking should reach step code. The officially demonstrated mocking tool is MSW `@msw/cloudflare`. Neither mocking path is shown in docs for workflow steps, so verify it with a spike test.
11. **Save path latency:** `send()` resolves "when the message is confirmed to be written to disk". No latency figure is documented. Do `await env.ITEMS_QUEUE.send()` in the request, not `waitUntil`, because inside `waitUntil` any send error is silently ignored.

---

## 1. `step.do` semantics

### 1.1 Config shape and defaults

Types (verbatim, [Workers API](https://developers.cloudflare.com/workflows/build/workers-api/#workflowstepconfig)):

```ts
export type WorkflowDelayFunction = (
  input: WorkflowDynamicDelayContext // { ctx: WorkflowStepContext; error: Error }
) => string | number | Promise<string | number>

export type WorkflowStepConfig = {
  retries?: {
    limit: number
    delay: string | number | WorkflowDelayFunction
    backoff?: WorkflowBackoff // "constant" | "linear" | "exponential"
  }
  timeout?: string | number
}
```

Defaults (verbatim, [Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#retry-steps)):

```ts
const defaultConfig: WorkflowStepConfig = {
  retries: { limit: 5, delay: 10000, backoff: "exponential" },
  timeout: "10 minutes",
}
```

- `limit` counts retries, not attempts. `limit: 10` means 11 attempts. The maximum is 10,000 retries per step ([same page](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#retry-steps), [Limits](https://developers.cloudflare.com/workflows/reference/limits/)).
- The timeout applies per attempt ("the timeout is set per attempt"). The docs recommend keeping it at 30 minutes or less ([Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#limit-timeouts-to-30-minutes-or-less)).
- A partial `retries` object is merged over the defaults (source: `context.ts` spreads `...defaultConfig.retries, ...stepConfig.retries`).
- **Local vs docs discrepancy:** the local engine default is `delay: 1000` (`workflows-shared/src/context.ts` `defaultConfig`, and `lib/delay.ts` `DEFAULT_RETRY_DELAY_MS = 1000`). The docs say 10000 for production. Set `delay` explicitly and the two behave the same.
- A dynamic delay function receives `{ ctx, error }`, with `ctx.attempt` 1-indexed. It is useful for OpenRouter 429s ([Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#set-a-dynamic-retry-delay)). If the delay function itself throws, the retry becomes a non-retryable failure (source: `NonRetryableDelayError` in `context.ts`).
- The step callback receives `ctx: WorkflowStepContext = { step: { name, count }, attempt, config }` ([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/#workflowstepcontext)). Step name is up to 256 chars. Names must be deterministic because they are the cache key ([Rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#name-steps-deterministically)).

### 1.2 What a step may return

- "Any structured-cloneable type can be serialized, as long it is no longer than 1 MB." `Function`, `Symbol` and circular references throw ([Workers API, Returning state](https://developers.cloudflare.com/workflows/build/workers-api/#step)).
- Limit: **1 MiB (2^20 bytes) per non-stream step result**. Instance state: 100 MB on Free, 1 GB on Paid. A larger binary can be returned as a fresh `ReadableStream<Uint8Array>` ([Limits](https://developers.cloudflare.com/workflows/reference/limits/)). "If your step returns structured data exceeding this limit, the step will fail" ([Rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#keep-non-stream-step-return-values-under-1-mib)).
- Locally, a non-serialisable return aborts the instance: `The execution of the Workflow instance was terminated, as the step "<name>" returned a value which is not serialisable` (source: `context.ts`).
- **Implication (inference):** 1536-dim float vectors are about 12 KB each as structured-clone doubles, so around 80 chunks would reach 1 MiB. `embed` and `index` should persist to Postgres inside the step and return `{ chunkCount }`. `enrich` and `chunk` outputs (title, summary, chunk texts) are fine for normal items but could exceed 1 MiB for very long transcripts. Persist chunks in the `chunk` step and return ids.

### 1.3 Non-retryable errors

```ts
import { NonRetryableError } from "cloudflare:workflows"
throw new NonRetryableError(
  "event.payload.data did not contain the expected payload"
)
```

- Constructor: `new NonRetryableError(message: string, name?: string)` ([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/#nonretryableerror)).
- It "stops step retries, propagating the error to the top level (the run function). Any error not handled at this top level will cause the Workflow instance to fail." ([same](https://developers.cloudflare.com/workflows/build/workers-api/#nonretryableerror)). An unhandled one means "the Workflow instance itself will fail immediately, no further steps will be invoked, and the Workflow will not be retried" ([Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#force-a-workflow-instance-to-fail)).
- Message preservation: the compat flag `workflows_preserve_non_retryable_error_message` has been **default since 2026-05-14**. Before it, the message was replaced by `"The execution of the Workflow instance was terminated, as a step threw an NonRetryableError and it was not handled"` ([Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)). Our date is 2026-09-08, so messages are preserved.
- Detection locally is by `error.name === "NonRetryableError"` or a message starting with `"NonRetryableError"` (source: `context.ts`). A subclass that keeps `name` works too.
- Open feature request: structured metadata on `NonRetryableError` ([workers-sdk#15583](https://github.com/cloudflare/workers-sdk/issues/15583), open). Only `message` and `name` survive.

### 1.4 "Mark item failed" when retries are exhausted

"Any uncaught exceptions that propagate to the top level, or any steps that reach their retry limit, will cause the Workflow to end execution in an `Errored` state. […] To allow the Workflow to continue its execution, surround the intended steps that are allowed to fail with a `try...catch` block." Verbatim example ([Sleeping and retrying, Catch Workflow errors](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#catch-workflow-errors)):

```ts
try {
  await step.do("non-retryable-task", async () => {
    throw new NonRetryableError("oh no")
  })
} catch (e) {
  console.log(`Step failed: ${e.message}`)
  await step.do("clean-up-task", async () => {
    // Clean up code here
  })
}
```

- Source confirms that on exhaustion the final error is stored and thrown out of `step.do` (`throw finalError`), and a NonRetryableError is re-thrown (`throw error`). Both are catchable in `run()`.
- If you catch and do not re-throw, the instance ends **`complete`**, not `errored` (inference from the docs sentence "the Workflow will not fail and will continue"). Recommended pattern: catch → `await step.do("mark item failed", …)` (idempotent `UPDATE items SET status='failed' …`) → re-throw so dashboards and metrics show `errored`.
- Alternative: **rollback handlers**. `step.do(name, [config,] callback, { rollback, rollbackConfig })` registers compensation that runs "in reverse step-start order" when the Workflow later fails. A failed step that registered rollback also runs its own, with `output: undefined` ([Sleeping and retrying, Register rollback handlers](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/#register-rollback-handlers), [Workers API, Rollback options](https://developers.cloudflare.com/workflows/build/workers-api/#rollback-options)). They are meant for per-step undo. For one "mark failed" write, `try/catch` in `run()` is simpler and does not depend on which step failed. `terminate({ rollback: true })` runs rollbacks, while plain `terminate()` and `delete()` do not ([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/#terminate)).
- Rules that matter for our steps ([Rules of Workflows](https://developers.cloudflare.com/workflows/build/rules-of-workflows/)): steps must be idempotent (a retry can follow a committed but failed request). Put no side effects outside `step.do`, since "the Workflow engine may restart while an instance is running". Always `await` steps.

## 2. Creating instances

### 2.1 `create`

- `create(options?: WorkflowInstanceCreateOptions): Promise<WorkflowInstance>`. The id is auto-generated if omitted. A user id can be up to 100 characters ([Workers API, create](https://developers.cloudflare.com/workflows/build/workers-api/#create)).
- Pattern `^[a-zA-Z0-9_][a-zA-Z0-9-_]*$`, max 100 chars ([Limits](https://developers.cloudflare.com/workflows/reference/limits/) footnote 9). Source matches: `lib/validators.ts` `ALLOWED_STRING_ID_PATTERN`, `MAX_WORKFLOW_INSTANCE_ID_LENGTH = 100`. An invalid id throws `WorkflowError: Workflow instance has invalid id` locally (source: `binding.ts`).
- **Duplicate id:** "Throws an error if the provided ID is already used by an existing instance that has not yet passed its retention limit. To re-run a workflow with the same ID, you can `restart` the existing instance." ([Workers API, create](https://developers.cloudflare.com/workflows/build/workers-api/#create))
  - Local error (source, `workflows-shared/src/lib/errors.ts`): `new WorkflowError("(instance.already_exists) Workflow instance with id \"<id>\" already exists")`, with `name = "WorkflowError"`. The production message is not documented. Match on `instance.already_exists` or `already exists`, and confirm against production.
  - Local race (source comment, `binding.ts`): "duplicate creates racing ahead of that commit can all resolve successfully; the engine's init() guards make the extra dispatch a no-op, so the race cannot double-execute the workflow body."
- The creation rate limit is 100/s per workflow on Paid and 100/s on Free. Exceeding it returns HTTP 429 ([Limits](https://developers.cloudflare.com/workflows/reference/limits/)).
- `params` is JSON and becomes `event.payload`. The event payload is ≤ 1 MiB. A type parameter does not validate the payload, so validate it yourself, for example with zod ([Workers API](https://developers.cloudflare.com/workflows/build/workers-api/#create)).

### 2.2 `createBatch`

- Up to 100 instances per call. "Unlike `create`, this operation is idempotent and will not fail if an ID is already in use. If an existing instance with the same ID is still within its retention limit, it will be skipped and excluded from the returned array." ([Workers API, createBatch](https://developers.cloudflare.com/workflows/build/workers-api/#createbatch))
- **Fit for our consumer:** one `createBatch` call per queue batch, `batch.messages.map(m => ({ id: m.body.itemId, params: { itemId } }))`, then `batch.ackAll()`. A redelivered message is a no-op. It also stays inside the creation-rate limit ([Rules, Batch multiple Workflow invocations](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#batch-multiple-workflow-invocations)).

### 2.3 Re-running an item

- "Instance IDs are unique per Workflow […] even after completion." The docs suggest a composite id or a random id stored in your DB ([Rules, Instance IDs are unique](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#instance-ids-are-unique)).
- `instance.restart()` "will immediately cancel any in-progress steps, erase any intermediate state, and treat the Workflow as if it was run for the first time" ([Trigger Workflows, Restart](https://developers.cloudflare.com/workflows/build/trigger-workflows/#restart-a-workflow)). `restart({ from: { name, count?, type? } })` reuses cached results of earlier steps and throws if the step is not in history ([Workers API, restart](https://developers.cloudflare.com/workflows/build/workers-api/#restart)). Restarts count against the creation rate ([Limits](https://developers.cloudflare.com/workflows/reference/limits/) footnote 6).
- Retention: completed/terminated/errored state is kept 3 days on Free and 30 days on Paid. You can shorten it with `default_retention: { success_retention, error_retention }` on the binding, or `retention: { successRetention, errorRetention }` per `create` ([Workers API, Default instance retention](https://developers.cloudflare.com/workflows/build/workers-api/#default-instance-retention), [WorkflowInstanceCreateOptions](https://developers.cloudflare.com/workflows/build/workers-api/#workflowinstancecreateoptions)). An id becomes reusable only after retention expires, or after `instance.delete()` / `deleteBatch()`.
- **Two options for "retry this item" (inference):**
  - (a) id = `itemId`, and retry means `get(itemId).restart()`. Simple, but a retry older than the retention window gets "instance does not exist", and a reprocess after retention needs `create` again.
  - (b) id = `${itemId}-${runNumber}` (a UUID is 36 chars, so this fits in 100), with `workflow_instance_id` stored on the item row. Every run gets its own history.
  - (b) is the documented recommendation ([Rules](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#instance-ids-are-unique)).

## 3. Queue consumer semantics

- `ack()` stops redelivery of that message even if the handler later throws. `retry({ delaySeconds })` is a negative acknowledgement. `ackAll()` "has the same behaviour as a consumer Worker that successfully returns". The first call wins (`ack` then `retry` → ack), and per-message calls win over batch calls ([Batching, Retries and Delays](https://developers.cloudflare.com/queues/configuration/batching-retries/#explicit-acknowledgement-and-retries)).
- **Handler throws:** "When a single message within a batch fails to be delivered, the entire batch is retried, unless you have explicitly acknowledged a message" ([same, Delivery failure](https://developers.cloudflare.com/queues/configuration/batching-retries/#delivery-failure)).
- `max_retries` defaults to 3 (limit 100, per [Queues limits](https://developers.cloudflare.com/queues/platform/limits/)). After it is reached, messages "will be deleted from the queue, or if a dead-letter queue (DLQ) is configured, written to the DLQ instead" ([same](https://developers.cloudflare.com/queues/configuration/batching-retries/#delivery-failure)). The DLQ is configured with `dead_letter_queue` on the consumer. A DLQ with no consumer keeps messages 4 days ([Dead Letter Queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)).
- Retry delays go up to 24 h. They can be set per message, per batch, or as consumer `retry_delay`. `msg.attempts` starts at 1 ([Batching, Retries and Delays](https://developers.cloudflare.com/queues/configuration/batching-retries/#delay-on-retry)).
- Delivery is **at least once** ([How Queues works](https://developers.cloudflare.com/queues/reference/how-queues-works/#consumers), [Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)). Hence `createBatch`, or a caught duplicate error, in §2.2.
- Batch defaults are `max_batch_size` 10 (max 100) and `max_batch_timeout` 5 s (0–60 s) ([Batching](https://developers.cloudflare.com/queues/configuration/batching-retries/#batch-settings)). Consumer wall time is 15 min and CPU 30 s by default ([Queues limits](https://developers.cloudflare.com/queues/platform/limits/)).
- **Division of retries (inference):** the queue's `max_retries: 3` only covers failure to _start_ the workflow. Enrich, embed and the rest retry inside the Workflow. Queue retries exhausted without a DLQ means the message is dropped silently and the item sits in `pending` for good. Either add a DLQ, or have the consumer mark the item failed when `msg.attempts > max_retries` before acking.

### 3.1 Local `wrangler dev` (same Worker is producer and consumer)

- Docs: Queues run locally via Miniflare. "When the producer Worker sends messages to the queue, the consumer Worker will automatically be invoked to handle them." Consumer concurrency is not supported locally, and `--remote` is unsupported ([Queues local development](https://developers.cloudflare.com/queues/configuration/local-development/)).
- Source (`packages/miniflare/src/workers/queues/broker.worker.ts`):
  - `DEFAULT_BATCH_SIZE = 5`, `DEFAULT_BATCH_TIMEOUT = 1` (second), `DEFAULT_RETRIES = 2`. Wrangler passes `max_batch_size` / `max_batch_timeout` / `max_retries` / `dead_letter_queue` / `retry_delay` straight through and leaves unset fields `undefined` (`packages/wrangler/src/dev/miniflare/index.ts` `queueConsumerEntry`). So an unset field falls back to **Miniflare's** defaults: 1 s timeout, batch 5, **2 retries (production default is 3)**. We set `max_retries: 3`, so that one matches. Set `max_batch_timeout` explicitly too.
  - With a partial batch, the local flush fires after `max_batch_timeout` seconds, and immediately when the batch is full. Expected local latency from send to consumer is therefore about `max_batch_timeout`.
  - Pending messages live in an in-memory array on the broker Durable Object (`readonly #messages: QueueMessage[] = []`). They do **not** survive a `wrangler dev` restart (inference from source).
  - Locally, a message that exhausts retries logs `Dropped message "<id>" … after N failed attempts!`, or is moved to the DLQ if one is configured.

## 4. Workflows in local dev

- `wrangler dev` runs "an emulated version of Workflows". `wrangler workflows … --local` (wrangler ≥ 4.79) and Local Explorer at `http://localhost:8787/cdn-cgi/local/explorer` (wrangler ≥ 4.82.1) list, trigger, inspect, pause, restart and delete instances. Known issue: no remote bindings and no `wrangler dev --remote` ([Workflows local development](https://developers.cloudflare.com/workflows/build/local-development/)).
- Persistence (source): the Miniflare workflows plugin stores Durable Object state in `getPersistPath("workflows", …)`, which is `<persist root>/workflows`. Wrangler's persist root is `.wrangler/state` + `v3` (`packages/wrangler/src/dev/get-local-persistence-path.ts`, `dev/miniflare/index.ts`), giving **`.wrangler/state/v3/workflows`**. It survives restarts, so a local duplicate `create({ id })` also fails across restarts until you delete the instance or clear state.
- Open local-emulator issues relevant to long dev sessions:
  - [#15788](https://github.com/cloudflare/workers-sdk/issues/15788): completed steps leave timeout timers active and exhaust workerd's 10,000-timer quota.
  - [#15809](https://github.com/cloudflare/workers-sdk/issues/15809): completed instances keep file handles open until workerd crashes with "Too many open files".
  - [#15832](https://github.com/cloudflare/workers-sdk/issues/15832): bulk introspection opens resources for every instance.
  - [#15138](https://github.com/cloudflare/workers-sdk/issues/15138): local `deleteBatch()` always reports success.
  - All were open on 2026-09-27. Mitigation: restart `wrangler dev`, or clear `.wrangler/state/v3/workflows`, when many instances build up.
- **Bindings and fetch:** "You can also access bindings […] via `this.env` within your Workflow" ([Get started guide](https://developers.cloudflare.com/workflows/get-started/guide/)). Workflows make subrequests with `fetch` (limit table and examples in [Limits](https://developers.cloudflare.com/workflows/reference/limits/#increasing-workflow-subrequest-limits)). **Hyperdrive:** "create a new connection inside each `step.do()` and run your queries in that same step. Do not reuse a Hyperdrive-backed connection across steps." ([Rules, Avoid doing side effects outside of a step.do](https://developers.cloudflare.com/workflows/build/rules-of-workflows/#avoid-doing-side-effects-outside-of-a-stepdo))
- **Limits** ([Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)):

|                              | Workers Free                      | Workers Paid                                      |
| ---------------------------- | --------------------------------- | ------------------------------------------------- |
| CPU per step                 | **10 ms**                         | 30 s default, up to 5 min (`limits.cpu_ms`)       |
| Wall clock per step          | unlimited                         | unlimited                                         |
| Subrequests per instance     | **50**/request                    | 10,000 default, up to 10 M (`limits.subrequests`) |
| Steps per workflow           | 1,024                             | 10,000 (up to 25,000)                             |
| Concurrent running instances | 100                               | 50,000                                            |
| Executions                   | 100,000/day (shared with Workers) | unlimited                                         |
| Completed-state retention    | 3 days                            | 30 days                                           |

Only `running` instances count toward concurrency. Instances that are sleeping or waiting to retry do not. An exceeded CPU limit throws `Error: Worker exceeded CPU time limit.` ([Limits](https://developers.cloudflare.com/workflows/reference/limits/)).

## 5. Testing with `@cloudflare/vitest-plugin`

### 5.1 Queue consumer

`createMessageBatch` + `createExecutionContext` + `worker.queue(...)` + `getQueueResult` is the documented unit path (verbatim fixture in doc 04 §1.6). Each message must carry `{ id, timestamp, attempts, body }` ([cloudflare-test.d.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/types/cloudflare-test.d.ts)). `getQueueResult` "gets the acknowledged/retry state of messages in the `MessageBatch`, and waits for all `ExecutionContext#waitUntil()`ed `Promise`s to settle" and returns `{ outcome, ackAll, retryBatch: { retry, delaySeconds? }, explicitAcks, retryMessages }` ([Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)). If the consumer calls `env.PROCESS_ITEM_WORKFLOW.createBatch`, pair it with `introspectWorkflow(env.PROCESS_ITEM_WORKFLOW)`, which captures "all instances created after it is initialized" ([Test APIs, Workflows](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/#workflows)).

### 5.2 Running the real workflow to completion

Unmocked steps run their real implementation. `modify`/`modifyAll` only changes the steps you target. The official fixture mixes one mocked step with real ones and asserts `getOutput()` ([fixtures/vitest-plugin-examples/workflows/test/integration.test.ts](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-plugin-examples/workflows/test/integration.test.ts)):

```ts
await using introspector = await introspectWorkflow(env.MODERATOR)
await introspector.modifyAll(async (m) => {
  await m.disableSleeps()
  await m.mockStepResult({ name: STEP_NAME }, mockResult)
})
await exports.default.fetch(`https://mock-worker.local/moderate`)
const instances = await introspector.get()
expect(instances.length).toBe(1)
const instance = instances[0]
await expect(instance.waitForStatus(STATUS_COMPLETE)).resolves.not.toThrow()
expect(await instance.getOutput()).toEqual({ status: "auto_approved" })
```

Modifiers relevant to us (verbatim, [Test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/#workflows)):

- `disableRetryDelays(steps?)`: "Disables retry backoff delays, causing retry attempts of a failing `step.do()` to execute immediately without waiting. The retries still happen — only the delay between them is removed."
- `mockStepError(step, error, times?)`: "If `times` is omitted, the step will error on every attempt, making the Workflow instance fail." This is the tool for testing the "mark item failed" path, as `waitForStatus("errored")` plus `getError()` → `{ name, message }`.
- `forceStepTimeout(step, times?)` produces an error message containing `"Execution timed out"`.
- Isolation: "introspectors should be disposed at the end of each test" (`await using` or `dispose()`). Otherwise "the instance's state will persist across subsequent tests."
- Because of the duplicate-id rule (§2.1), each test should use a fresh `itemId`. Mocks survive `restart()` (fixture comment: "Mocks survive instace restart").

### 5.3 Fetch mocking inside steps

- The Workflow class is wrapped by `createWorkflowEntrypointWrapper` and imported through the same Vite module runner as the tests, inside the runner Durable Object (`importModule` → `runInRunnerObject(() => __vitest_mocker__.moduleRunner.import(specifier))`). Source: [packages/vitest-plugin/src/worker/entrypoints.ts](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/src/worker/entrypoints.ts). Step callbacks therefore run in the test isolate, so `globalThis.fetch` patches and `vi.mock` of our OpenRouter client module **should** apply (inference). Docs show no example of this.
- The documented mocking tool is MSW via `@msw/cloudflare` (`setupNetwork()`, `network.enable()` in `beforeAll`). The fixture proves that handlers registered in the runner "also intercept requests dispatched through `exports.default.fetch(...)` into a separate request I/O context" ([fixtures/vitest-plugin-examples/request-mocking/README.md](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-plugin-examples/request-mocking/README.md), `test/setup.ts`, `test/exports.test.ts`). A workflow step is another such I/O context, so the same mechanism is the best candidate (inference).
- **Cleanest seam (inference):** inject the OpenRouter client (for example, a module the test `vi.mock`s), or `mockStepResult` the network-bound steps, and keep one spike test proving MSW or `vi.spyOn(globalThis, "fetch")` reaches a real step.

### 5.4 Workflows + Hyperdrive in the pool

No docs page or open issue ties Workflows to Hyperdrive in the Vitest pool (issue searches on `cloudflare/workers-sdk` for "workflows hyperdrive", "introspectWorkflow" and "Hyperdrive vitest" returned nothing relevant). The Vitest known-issues page has no Workflows/Hyperdrive entry (doc 04 §1.8). Hyperdrive setup for tests is in doc 04 §1.5.

## 6. Save-path latency

- `send()`: "When the promise resolves, the message is confirmed to be written to disk" ([Queues JavaScript APIs](https://developers.cloudflare.com/queues/configuration/javascript-apis/#producer)). **No producer latency number is published** in the Queues docs (searched `queues/llms-full.txt` for "latency"; only batching and delivery-guarantee trade-offs are discussed).
- `ctx.waitUntil(send)` would return faster, but "because `waitUntil()` is non-blocking, any errors raised from the `send()` or `sendBatch()` methods on a queue will be implicitly ignored" ([How Queues works, Producers](https://developers.cloudflare.com/queues/reference/how-queues-works/#producers)). `waitUntil` also extends execution by at most 30 s after the response ([Workflows limits, wall time table](https://developers.cloudflare.com/workflows/reference/limits/#wall-time-limits-by-invocation-type)).
- Recommendation (inference): `await env.ITEMS_QUEUE.send({ itemId })` after the `INSERT` commits, and return 201 with status `pending`. If `send` throws (for example `Too Many Requests` over 5,000 msg/s, per [Queues limits](https://developers.cloudflare.com/queues/platform/limits/)), respond 5xx or mark the item for a later sweep. Measure p95 in production. The docs provide no figure to design against.

## Open items / uncertainties

1. **Production text of the duplicate-id error** from `create()` is not documented. Only the local `(instance.already_exists) …` text is known from source. `createBatch` sidesteps this.
2. **Local default retry delay is 1000 ms vs the documented 10000 ms.** Set `delay` explicitly.
3. **Fetch mocking inside workflow steps** (MSW or `vi.spyOn(globalThis, "fetch")`) is inferred from source, not documented. It needs a spike test before relying on it.
4. **Which Workers plan?** Free gives 10 ms CPU per step and 50 subrequests, which is likely too tight for chunking and embedding large items. Needs a founder/owner decision before the spec fixes limits.
5. **Local queue messages are in memory** (source). Messages pending when `wrangler dev` restarts are lost. This matters for dev only.
6. **Queue-level failure handling:** with `max_retries: 3` and no DLQ, a message whose workflow creation keeps failing is dropped silently. Decide between a DLQ and "mark failed at the last attempt" in the consumer.
7. **Open local-emulator issues** (#15788 timers, #15809 file handles) may show up in long dev sessions or large test suites.
8. **Whether caught-and-rethrown errors after a "mark failed" step keep their original message** in production `instance.status().error` was not verified. The local engine stores `finalError` (source).
