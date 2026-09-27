import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
  introspectWorkflow,
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import worker from "../src/index.js"
import { request, saveOpenRouterKey, signUp } from "./support/http.js"
import {
  stubOpenRouter,
  type OpenRouterStub,
} from "./support/openrouter-stub.js"
import { recordQueue, type QueueRecorder } from "./support/pipeline.js"

describe("queue consumer and workflow", () => {
  let openRouter: OpenRouterStub
  let queue: QueueRecorder

  beforeEach(() => {
    openRouter = stubOpenRouter()
    queue = recordQueue()
  })

  afterEach(() => {
    queue.restore()
    openRouter.restore()
  })

  it("starts one workflow per run, even for a redelivered message, and the run makes the note ready", async () => {
    const session = await signUp()
    await saveOpenRouterKey(session)
    const saved = await request("/items", {
      method: "POST",
      session,
      json: { text: "Workflows retry each step on their own" },
    })
    const { id } = await saved.json<{ id: string }>()
    const [job] = queue.messages
    if (!job) throw new Error("nothing was queued")

    await using introspector = await introspectWorkflow(
      env.PROCESS_ITEM_WORKFLOW
    )
    const batch = createMessageBatch("second-brain-items", [
      { id: "m1", timestamp: new Date(), attempts: 1, body: job },
      { id: "m2", timestamp: new Date(), attempts: 1, body: job },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env)
    const result = await getQueueResult(batch, ctx)

    expect(result.explicitAcks.sort()).toEqual(["m1", "m2"])
    const instances = await introspector.get()
    expect(instances).toHaveLength(1)
    await instances[0]?.waitForStatus("complete")
    expect(await instances[0]?.getOutput()).toMatchObject({
      outcome: "ready",
    })
    const item = await request(`/items/${id}`, { session })
    expect((await item.json<{ status: string }>()).status).toBe("ready")
  })

  it("retries a failing step before marking the note failed with the error", async () => {
    const session = await signUp()
    await saveOpenRouterKey(session)
    openRouter.failChat(100, 503)
    const saved = await request("/items", {
      method: "POST",
      session,
      json: { text: "The model is down today" },
    })
    const { id } = await saved.json<{ id: string }>()
    const [job] = queue.messages
    if (!job) throw new Error("nothing was queued")

    await using introspector = await introspectWorkflow(
      env.PROCESS_ITEM_WORKFLOW
    )
    await introspector.modifyAll(async (instance) => {
      await instance.disableRetryDelays()
    })
    const batch = createMessageBatch("second-brain-items", [
      { id: "m1", timestamp: new Date(), attempts: 1, body: job },
    ])
    const ctx = createExecutionContext()
    await worker.queue(batch, env)
    await getQueueResult(batch, ctx)
    const [instance] = await introspector.get()
    await instance?.waitForStatus("errored")

    expect((await instance?.getError())?.message).toContain("model_error")
    expect(openRouter.chatCalls).toHaveLength(4)
    const item = await request(`/items/${id}`, { session })
    expect(await item.json()).toMatchObject({
      status: "failed",
      failureReason: "model_error",
    })
  })
})
