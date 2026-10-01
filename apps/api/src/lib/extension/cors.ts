import { cors } from "hono/cors"

const extensionOrigin = /^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i

// Extension requests carry a bearer token and never cookies, so any extension origin may call
// these routes: without a valid token there is nothing to reach. Firefox gives every install a
// random origin, so origins cannot be pinned.
export const extensionCors = cors({
  origin: (origin) => (extensionOrigin.test(origin) ? origin : null),
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["authorization", "content-type"],
  maxAge: 600,
})

export function isExtensionPath(path: string): boolean {
  return path.startsWith("/ext/") || path === "/extension/token"
}
