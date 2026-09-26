import type { Auth } from "./auth.js"
import type { Database } from "@workspace/db"

export interface AppEnv {
  Bindings: Env
  Variables: {
    db: Database
    auth: Auth
    userId: string
  }
}
