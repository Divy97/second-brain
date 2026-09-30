import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

function Line({ className }: { className: string }) {
  return <div className={cn("rounded-lg bg-foreground/10", className)} />
}

export function CollectionSkeleton({ rows = false }: { rows?: boolean }) {
  return (
    <div
      role="status"
      aria-label={rows ? "Loading questions" : "Loading notes"}
      aria-busy
      className={cn(
        "grid animate-pulse gap-5",
        !rows && "sm:grid-cols-2 lg:grid-cols-3"
      )}
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          aria-hidden
          className={cn(
            "rounded-2xl bg-card p-5",
            rows
              ? "flex items-center justify-between gap-4"
              : "flex min-h-48 flex-col justify-between"
          )}
        >
          <Line className={rows ? "h-5 w-1/2" : "h-5 w-16"} />
          {!rows && (
            <div className="space-y-2 py-5">
              <Line className="h-6 w-5/6" />
              <Line className="h-6 w-2/3" />
            </div>
          )}
          <Line className={rows ? "h-3 w-16" : "h-4 w-full"} />
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton({ pathname }: { pathname: string }) {
  const home = pathname === "/home"
  const questions = pathname === "/threads"
  const conversation = pathname.startsWith("/threads/")
  if (conversation)
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-48 sm:pb-32">
        <Link
          href="/threads"
          className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden />
          All questions
        </Link>
        <div
          role="status"
          aria-label="Loading conversation"
          aria-busy
          className="flex animate-pulse flex-col gap-8"
        >
          <div
            aria-hidden
            className="w-3/4 self-end rounded-[1.5rem] rounded-br-sm bg-lilac px-5 py-4"
          >
            <Line className="h-6 w-full" />
          </div>
          <div
            aria-hidden
            className="space-y-5 rounded-[1.75rem] bg-card p-6 sm:p-8"
          >
            <Line className="h-6 w-full" />
            <Line className="h-6 w-5/6" />
            <Line className="h-6 w-2/3" />
            <div className="h-20 w-1/2 rounded-2xl bg-butter" />
          </div>
          <div
            aria-hidden
            className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] border-t bg-background px-5 py-3 sm:bottom-0 sm:px-8"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              <Line className="h-4 w-32" />
              <Line className="h-11 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  if (pathname === "/settings")
    return (
      <div
        role="status"
        aria-label="Loading settings"
        aria-busy
        className="mx-auto flex max-w-3xl animate-pulse flex-col gap-7"
      >
        <Line className="h-10 w-40" />
        <div aria-hidden className="space-y-3 rounded-xl border p-4">
          <Line className="h-4 w-full" />
          <Line className="h-4 w-full" />
          <Line className="h-4 w-2/3" />
        </div>
        <div aria-hidden className="mt-3 space-y-5">
          <Line className="h-8 w-48" />
          <Line className="h-10 w-full" />
          <div className="space-y-4 rounded-2xl bg-card p-7">
            <Line className="h-5 w-20" />
            <Line className="h-11 w-full" />
            <Line className="h-11 w-28" />
          </div>
        </div>
      </div>
    )
  return (
    <div
      role="status"
      aria-label="Loading page"
      aria-busy
      className={cn(
        "mx-auto flex animate-pulse flex-col gap-8",
        !home && "max-w-4xl"
      )}
    >
      {pathname.startsWith("/items/") && (
        <Link
          href="/home"
          className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden />
          All notes
        </Link>
      )}
      <div
        aria-hidden
        className={cn(
          "grid gap-8",
          home && "lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-10",
          questions && "rounded-2xl bg-mint px-5 py-12 text-center"
        )}
      >
        <div
          className={cn("space-y-5", questions && "mx-auto w-full max-w-xl")}
        >
          <Line className="h-5 w-32" />
          <Line className="h-12 w-4/5" />
          <Line className="h-5 w-full" />
          <Line className="h-5 w-2/3" />
          {home && <Line className="h-5 w-40" />}
        </div>
        {(home || questions) && (
          <div
            className={cn(
              "rounded-xl border bg-card p-5",
              home ? "h-[348px]" : "mx-auto h-16 w-full max-w-xl"
            )}
          >
            <Line className="h-11 w-full" />
            {home && <Line className="mt-8 h-32 w-full" />}
          </div>
        )}
      </div>
      {home || questions ? (
        <>
          <Line className="mt-2 h-9 w-64" />
          <CollectionSkeleton rows={questions} />
        </>
      ) : (
        <div
          aria-hidden
          className={cn(
            "space-y-5 rounded-2xl p-7 sm:p-10",
            pathname.startsWith("/items/") ? "bg-butter" : "bg-card"
          )}
        >
          <Line className="h-6 w-1/3" />
          <Line className="h-5 w-full" />
          <Line className="h-5 w-full" />
          <Line className="h-5 w-3/4" />
        </div>
      )}
    </div>
  )
}
