import { WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"

import { ApiError } from "@/lib/api"
import { describeApiError } from "@/lib/describe-api-error"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

const keyErrors = new Set([
  "missing_key",
  "invalid_key",
  "insufficient_credits",
])

export function AskError({ error }: { error: unknown }) {
  const needsKey = error instanceof ApiError && keyErrors.has(error.code)
  return (
    <Alert variant="destructive">
      <WarningCircleIcon aria-hidden />
      <AlertDescription className="flex flex-col gap-3">
        <p>{describeApiError(error)}</p>
        {needsKey && (
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href="/settings">Open settings</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
