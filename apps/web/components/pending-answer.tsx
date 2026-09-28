import { Skeleton } from "@workspace/ui/components/skeleton"

export function PendingAnswer({ question }: { question: string }) {
  return (
    <div className="flex flex-col gap-4" aria-live="polite" aria-busy>
      <p className="self-end bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap">
        {question}
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Searching your notes</p>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}
