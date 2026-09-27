import { connect, markItemFailed } from "@workspace/db"

import {
  workflowInstanceId,
  type ProcessItemParams,
} from "./process-item-workflow.js"

// Matches max_retries on the consumer in wrangler.jsonc: the first delivery plus retries.
const MAX_DELIVERIES = 1 + 3

// createBatch skips instance ids that already exist, so a redelivered message, or a
// repeat capture of a pending item, never starts a second run. One call per message keeps
// a bad message from failing its neighbours.
export async function itemsQueueConsumer(
  batch: MessageBatch<ProcessItemParams>,
  env: Env
): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      try {
        await env.PROCESS_ITEM_WORKFLOW.createBatch([
          { id: workflowInstanceId(message.body), params: message.body },
        ])
        message.ack()
      } catch (error) {
        console.error("starting item workflow failed", message.body, error)
        if (message.attempts < MAX_DELIVERIES) {
          message.retry({ delaySeconds: 10 * message.attempts })
          return
        }
        const { db } = connect(env.HYPERDRIVE.connectionString)
        await markItemFailed(db, message.body, {
          reason: "processing_error",
          error: "Processing could not be started. Retry the note.",
        })
        message.ack()
      }
    })
  )
}
