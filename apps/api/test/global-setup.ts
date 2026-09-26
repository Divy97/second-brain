import { randomBytes } from "node:crypto"

import { createFreshDatabase } from "@workspace/db/migrate"

import type { TestProject } from "vitest/node"

export default async function setup(project: TestProject): Promise<void> {
  const databaseUrl = await createFreshDatabase("second_brain_api_test")
  project.provide("databaseUrl", databaseUrl)
  project.provide("betterAuthSecret", randomBytes(32).toString("base64"))
  project.provide("keyEncryptionSecret", randomBytes(32).toString("base64"))
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
    betterAuthSecret: string
    keyEncryptionSecret: string
  }
}
