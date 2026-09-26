import { createMiddleware } from "hono/factory"

import { connect } from "@workspace/db"

import { apiError } from "./api-error.js"
import { createAuth } from "./auth.js"

import type { AppEnv } from "./app-env.js"

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const { db } = connect(c.env.HYPERDRIVE.connectionString)
  c.set("db", db)
  c.set("auth", createAuth(c.env, db))
  await next()
})

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({
    headers: c.req.raw.headers,
  })
  if (!session) {
    return apiError(c, 401, "unauthenticated", "Sign in to continue.")
  }
  c.set("userId", session.user.id)
  await next()
})
