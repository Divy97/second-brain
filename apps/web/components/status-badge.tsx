import { Badge } from "@workspace/ui/components/badge"

import type { ItemStatus } from "@/lib/api"

const labelByStatus: Record<ItemStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
}

const variantByStatus = {
  pending: "outline",
  processing: "secondary",
  ready: "ghost",
  failed: "destructive",
} as const

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <Badge variant={variantByStatus[status]} className="font-mono">
      {labelByStatus[status]}
    </Badge>
  )
}
