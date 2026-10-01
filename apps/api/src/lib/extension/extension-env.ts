import type { AppEnv } from "../app-env.js"

export interface ExtensionEnv extends AppEnv {
  Variables: AppEnv["Variables"] & { deviceLabel: string }
}
