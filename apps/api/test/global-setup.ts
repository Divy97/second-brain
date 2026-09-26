import { createFreshDatabase } from "@workspace/db/migrate"

import type { TestProject } from "vitest/node"

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://postgres:postgres@localhost:5432/postgres"

export default async function setup(project: TestProject): Promise<void> {
  const databaseUrl = await createFreshDatabase(
    adminUrl,
    "second_brain_api_test"
  )
  project.provide("databaseUrl", databaseUrl)
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
  }
}
