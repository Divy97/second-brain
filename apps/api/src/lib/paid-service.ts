import { spendPaidLookup, type Database, type PaidService } from "@workspace/db"

import { paidLookupAllowance } from "./config.js"

export interface OperatorService {
  apiKey: string
  spend: () => Promise<boolean>
}

// Read per User so paid plans can later give different Users different limits.
export function allowanceFor(_userId: string, service: PaidService): number {
  return paidLookupAllowance[service]
}

export const utcDay = (date: Date): string => date.toISOString().slice(0, 10)

const secretNames = {
  transcript: "TRANSCRIPT_API_KEY",
  reader: "READER_API_KEY",
} as const

export function operatorService(
  db: Database,
  env: Env,
  userId: string,
  service: PaidService,
  now: () => Date
): OperatorService | null {
  const apiKey = env[secretNames[service]]
  if (!apiKey) return null
  return {
    apiKey,
    spend: () =>
      spendPaidLookup(db, {
        userId,
        service,
        day: utcDay(now()),
        limit: allowanceFor(userId, service),
      }),
  }
}
