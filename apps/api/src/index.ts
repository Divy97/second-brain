import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { Hono } from "hono"

import { health } from "./lib/health.js"

export interface ProcessItemParams {
  itemId: string
}

const app = new Hono<{ Bindings: Env }>()

app.route("/health", health)

export class ProcessItemWorkflow extends WorkflowEntrypoint<
  Env,
  ProcessItemParams
> {
  run(
    _event: WorkflowEvent<ProcessItemParams>,
    _step: WorkflowStep
  ): Promise<void> {
    return Promise.reject(
      new Error("processItem is implemented in a later ticket")
    )
  }
}

export default {
  fetch: app.fetch,
  queue(batch) {
    for (const message of batch.messages) {
      message.retry()
    }
  },
} satisfies ExportedHandler<Env, ProcessItemParams>
