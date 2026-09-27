import { WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import type { FailureReason } from "@/lib/items-api"

const titleByReason: Record<FailureReason, string> = {
  missing_key: "No OpenRouter key",
  invalid_key: "OpenRouter rejected your key",
  insufficient_credits: "Your OpenRouter credits ran out",
  model_error: "The model could not process this note",
  processing_error: "Processing failed",
}

const actionByReason: Record<FailureReason, string> = {
  missing_key: "Add your OpenRouter key in settings, then retry.",
  invalid_key: "Replace your OpenRouter key in settings, then retry.",
  insufficient_credits: "Add credits on OpenRouter, then retry.",
  model_error: "Retry to process it again.",
  processing_error: "Retry to process it again.",
}

const keyReasons = new Set<FailureReason>([
  "missing_key",
  "invalid_key",
  "insufficient_credits",
])

export function ItemFailure({
  reason,
  error,
  pending,
  onRetry,
}: {
  reason: FailureReason | null
  error: string | null
  pending: boolean
  onRetry: () => void
}) {
  const known = reason ?? "processing_error"
  return (
    <Alert variant="destructive">
      <WarningCircleIcon aria-hidden />
      <AlertTitle>{titleByReason[known]}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {!keyReasons.has(known) && error && (
          <p className="break-words">{error}</p>
        )}
        <p>Your note is saved. {actionByReason[known]}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onRetry}
          >
            {pending ? "Retrying" : "Retry"}
          </Button>
          {keyReasons.has(known) && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings">Open settings</Link>
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
