import type { ThreadMessage } from "@workspace/db"

export interface HistoryTurn {
  role: ThreadMessage["role"]
  text: string
  citedItemIds: string[]
}
