import type * as MainModule from "./src/index.js"

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof MainModule
    }
  }
}
