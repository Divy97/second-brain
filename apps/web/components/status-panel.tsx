import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react/dist/ssr"

import { apiBaseUrl, fetchHealth } from "@/lib/api"

interface RowProps {
  label: string
  ok: boolean
  detail: string
}

function Row({ label, ok, detail }: RowProps) {
  const Icon = ok ? CheckCircleIcon : XCircleIcon
  return (
    <div className="flex items-start gap-3 py-4">
      <Icon
        weight="fill"
        className={
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
        }
        size={20}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs break-all text-muted-foreground">
          {detail}
        </span>
      </div>
      <span className="sr-only">{ok ? "healthy" : "failing"}</span>
    </div>
  )
}

export async function StatusPanel() {
  const result = await fetchHealth()

  if (!result.reachable) {
    return (
      <div className="divide-y divide-border">
        <Row label="API" ok={false} detail={`${apiBaseUrl}: ${result.error}`} />
        <Row label="Database" ok={false} detail="unknown, API unreachable" />
      </div>
    )
  }

  const { health } = result
  const database = health.database
  return (
    <div className="divide-y divide-border">
      <Row
        label="API"
        ok={health.ok}
        detail={`${apiBaseUrl}, version ${health.version}`}
      />
      <Row
        label="Database"
        ok={database.ok}
        detail={
          database.ok
            ? `Postgres ${database.serverVersion}, pgvector ${database.pgvectorVersion}, ${database.latencyMs} ms`
            : database.error
        }
      />
    </div>
  )
}

export function StatusPanelSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy>
      {["API", "Database"].map((label) => (
        <div key={label} className="flex items-start gap-3 py-4">
          <div className="size-5 animate-pulse bg-muted" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-20 animate-pulse bg-muted" />
            <div className="h-3 w-56 animate-pulse bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
