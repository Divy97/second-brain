import { Hono, type Context } from "hono"
import { cors } from "hono/cors"

import { connect } from "@workspace/db"

import { healthRoutes } from "./lib/health.js"
import { deletePendingFiles } from "./lib/items/delete-files.js"
import { itemRoutes } from "./lib/items/index.js"
import { itemsQueueConsumer } from "./lib/items-queue.js"
import { type ProcessItemParams } from "./lib/process-item-workflow.js"
import { requestContext, requireUser } from "./lib/request-context.js"
import { threadRoutes } from "./lib/threads/index.js"
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
app.route("/items", itemRoutes)
app.route("/threads", threadRoutes)

export default {
  fetch: app.fetch,
  queue: itemsQueueConsumer,
  scheduled: async (_event, env) => {
    const connection = connect(env.HYPERDRIVE.connectionString)
    try {
      await deletePendingFiles(connection.db, env.ITEM_FILES)
    } finally {
      await connection.close()
    }
  },
} satisfies ExportedHandler<Env, ProcessItemParams>
