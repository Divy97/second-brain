import { env } from "cloudflare:workers"
import { vi } from "vitest"

import { testDb } from "./database.js"
import {
  processItem,
  type ProcessItemOutcome,
  type StepRunner,
} from "../../src/lib/pipeline/index.js"

import type { ProcessItemParams } from "../../src/lib/process-item-workflow.js"

const runDirectly: StepRunner = (_name, callback) => callback()

export interface QueueRecorder {
  messages: ProcessItemParams[]
  processAll: () => Promise<ProcessItemOutcome[]>
  processLatest: () => Promise<ProcessItemOutcome>
  restore: () => void
}

// Stands in for the queue consumer: every message POST/PATCH/retry would have queued is
// handed to processItem directly, the way the Workflow does.
export function recordQueue(
  options: {
    fetchPage?: typeof fetch
    env?: Partial<Env>
    now?: () => Date
  } = {}
): QueueRecorder {
  const context = {
    env: { ...env, ...options.env },
    openDb: testDb,
    fetchPage: options.fetchPage,
    now: options.now,
  }
  const messages: ProcessItemParams[] = []
  const spy = vi
    .spyOn(env.ITEMS_QUEUE, "send")
    .mockImplementation(async (body) => {
      messages.push(body as ProcessItemParams)
      return Promise.resolve({ metadata: { metrics: {} } } as never)
    })
  return {
    messages,
    processAll: async () => {
      const pending = messages.splice(0)
      const outcomes: ProcessItemOutcome[] = []
      for (const message of pending)
        outcomes.push(await processItem(context, message, runDirectly))
      return outcomes
    },
    processLatest: async () => {
      const message = messages.at(-1)
      if (!message) throw new Error("nothing was queued")
      messages.length = 0
      return processItem(context, message, runDirectly)
    },
    restore: () => {
      spy.mockRestore()
    },
  }
}
