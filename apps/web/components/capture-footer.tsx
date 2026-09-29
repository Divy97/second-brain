import type { ReactNode } from "react"

export function CaptureFooter({
  hint,
  children,
}: {
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4">
      <p className="min-w-0 text-xs text-muted-foreground">{hint}</p>
      {children}
    </div>
  )
}
