import type * as MainModule from "./src/index.js"

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof MainModule
    }
  }
  interface Env {
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
  }
}
