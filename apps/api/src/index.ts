import { Hono } from "hono"

import { healthRoutes } from "./lib/health.js"
import { itemsQueueConsumer } from "./lib/items-queue.js"
import { type ProcessItemParams } from "./lib/process-item-workflow.js"

export { ProcessItemWorkflow } from "./lib/process-item-workflow.js"
export type { ProcessItemParams }

const app = new Hono<{ Bindings: Env }>()

app.route("/health", healthRoutes)

export default {
  fetch: app.fetch,
  queue: itemsQueueConsumer,
} satisfies ExportedHandler<Env, ProcessItemParams>
