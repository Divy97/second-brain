import type * as MainModule from "./src/index.js"

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof MainModule
    }
  }
  interface Env {
    TRANSCRIPT_API_KEY?: string
    READER_API_KEY?: string
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
  }
}
