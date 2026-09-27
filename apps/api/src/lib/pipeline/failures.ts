import { OpenRouterError } from "@workspace/ai"

import type { FailureReason } from "@workspace/db"

const reasons: FailureReason[] = [
  "missing_key",
  "invalid_key",
  "insufficient_credits",
  "model_error",
  "processing_error",
]

// Crosses the Workflow step boundary, where only an error's message survives, so the
// reason travels as a "reason: detail" prefix.
export class PipelineFailure extends Error {
  readonly reason: FailureReason
  readonly permanent: boolean

  constructor(reason: FailureReason, detail: string, permanent: boolean) {
    super(`${reason}: ${detail}`)
    this.name = "PipelineFailure"
    this.reason = reason
    this.permanent = permanent
  }
}

export function toPipelineFailure(error: unknown): PipelineFailure {
  if (error instanceof PipelineFailure) return error
  if (error instanceof OpenRouterError) {
    switch (error.kind) {
      case "invalid_key":
        return new PipelineFailure("invalid_key", error.message, true)
      case "insufficient_credits":
        return new PipelineFailure("insufficient_credits", error.message, true)
      case "invalid_request":
        return new PipelineFailure("model_error", error.message, true)
      default:
        return new PipelineFailure("model_error", error.message, false)
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return new PipelineFailure("processing_error", message, false)
}

const encodedFailure = new RegExp(
  `^(?:[A-Za-z]+Error: |PipelineFailure: )*(${reasons.join("|")}): ([\\s\\S]*)$`
)

// Retried errors come back out of step.do with their error name prefixed to the message.
export function describeFailure(error: unknown): {
  reason: FailureReason
  error: string
} {
  const message = error instanceof Error ? error.message : String(error)
  const match = encodedFailure.exec(message)
  const reason = reasons.find((candidate) => candidate === match?.[1])
  return reason && match
    ? { reason, error: match[2] ?? "" }
    : { reason: "processing_error", error: message }
}
