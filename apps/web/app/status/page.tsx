import { Suspense } from "react"

import { StatusPanel, StatusPanelSkeleton } from "@/components/status-panel"

export const metadata = { title: "Status" }

export default function StatusPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 px-5 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-4xl tracking-tight">Status</h1>
        <p className="text-sm text-muted-foreground">
          Live check of the API and its database.
        </p>
      </div>
      <Suspense fallback={<StatusPanelSkeleton />}>
        <StatusPanel />
      </Suspense>
    </main>
  )
}
