import { createMiddleware } from "hono/factory"

export const noStore = createMiddleware(async (c, next) => {
  await next()
  if (!c.res.headers.has("cache-control")) {
    c.header("cache-control", "no-store")
  }
})
