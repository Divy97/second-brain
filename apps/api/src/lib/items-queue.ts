import type { ProcessItemParams } from "./process-item-workflow.js"

export function itemsQueueConsumer(
  batch: MessageBatch<ProcessItemParams>
): void {
  for (const message of batch.messages) {
    message.retry()
  }
}
