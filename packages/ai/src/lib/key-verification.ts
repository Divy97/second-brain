export type KeyVerification =
  | { valid: true; limitRemaining: number | null }
  | { valid: false; reason: "invalid_key" }
