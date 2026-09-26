import { createFreshDatabase } from "@workspace/db/migrate"

import type { TestProject } from "vitest/node"

export default async function setup(project: TestProject): Promise<void> {
  const databaseUrl = await createFreshDatabase("second_brain_api_test")
  project.provide("databaseUrl", databaseUrl)
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
