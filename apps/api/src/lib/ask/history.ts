import type { ThreadMessage } from "@workspace/db"

export interface HistoryTurn {
  role: ThreadMessage["role"]
  text: string
  citedItemIds: string[]
}

const hiddenTurn = "[Hidden: this exchange used a note that was since deleted.]"

// Deleted notes must never reach a model again: an answer that cited one, and the
// question it answered, are replaced in follow-up context.
export function toHistory(
  messages: ThreadMessage[],
  liveItemIds: Set<string>
): HistoryTurn[] {
  const hidden = new Set<number>()
  messages.forEach((message, index) => {
    if (message.citedItemIds.some((id) => !liveItemIds.has(id))) {
      hidden.add(index)
      if (messages[index - 1]?.role === "user") hidden.add(index - 1)
    }
  })
  return messages.map((message, index) =>
    hidden.has(index)
      ? { role: message.role, text: hiddenTurn, citedItemIds: [] }
      : {
          role: message.role,
          text: message.text,
          citedItemIds: message.citedItemIds,
        }
  )
}
