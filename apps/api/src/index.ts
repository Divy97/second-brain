import { Hono, type Context } from "hono"
import { cors } from "hono/cors"

import { healthRoutes } from "./lib/health.js"
import { itemsQueueConsumer } from "./lib/items-queue.js"
import { type ProcessItemParams } from "./lib/process-item-workflow.js"
import { requestContext, requireUser } from "./lib/request-context.js"
import { userKeyRoutes } from "./lib/user-keys/index.js"

import type { AppEnv } from "./lib/app-env.js"

export { ProcessItemWorkflow } from "./lib/process-item-workflow.js"
export type { ProcessItemParams }

const app = new Hono<AppEnv>()

app.use(
  "*",
  cors({
    origin: (origin, c: Context<AppEnv>) =>
      origin === c.env.WEB_ORIGIN ? origin : null,
    credentials: true,
  })
)
app.route("/health", healthRoutes)
app.use("*", requestContext)
app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw))
app.use("*", requireUser)
app.route("/keys", userKeyRoutes)

export default {
  fetch: app.fetch,
  queue: itemsQueueConsumer,
} satisfies ExportedHandler<Env, ProcessItemParams>
