import { WarningCircleIcon } from "@phosphor-icons/react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"

export function CaptureError({
  id,
  message,
}: {
  id?: string
  message: string
}) {
  return (
    <Alert variant="destructive" id={id}>
      <WarningCircleIcon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
