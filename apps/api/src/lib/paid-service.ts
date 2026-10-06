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

// Reel audio is the same vendor as the transcript service, so it shares the key and
// differs only in what it is allowed to spend. See ADR-0009.
const secretNames = {
  transcript: "TRANSCRIPT_API_KEY",
  reader: "READER_API_KEY",
  reel_audio: "TRANSCRIPT_API_KEY",
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
    spend: async () => {
      try {
        return await spendPaidLookup(db, {
          userId,
          service,
          day: utcDay(now()),
          limit: allowanceFor(userId, service),
        })
      } catch (error) {
        // Bookkeeping we cannot write is an outage to log, not a capture to lose: the
        // lookup is refused so nothing is spent unaccounted for, and the item saves
        // partial like any other refused lookup (ADR-0006).
        console.error("paid lookup accounting failed", service, error)
        return false
      }
    },
  }
}
