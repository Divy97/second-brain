import { connect, markItemFailed } from "@workspace/db"

import {
  workflowInstanceId,
  type ProcessItemParams,
} from "./process-item-workflow.js"

const MAX_ATTEMPTS = 3

// createBatch skips instance ids that already exist, so a redelivered message, or a
// repeat capture of a pending item, never starts a second run.
export async function itemsQueueConsumer(
  batch: MessageBatch<ProcessItemParams>,
  env: Env
): Promise<void> {
  try {
    await env.PROCESS_ITEM_WORKFLOW.createBatch(
      batch.messages.map((message) => ({
        id: workflowInstanceId(message.body),
        params: message.body,
      }))
    )
    batch.ackAll()
  } catch (error) {
    const { db } = connect(env.HYPERDRIVE.connectionString)
    for (const message of batch.messages) {
      if (message.attempts >= MAX_ATTEMPTS) {
        await markItemFailed(db, message.body, {
          reason: "processing_error",
          error: "Processing could not be started. Retry the note.",
        })
        message.ack()
      } else {
        message.retry({ delaySeconds: 10 * message.attempts })
      }
    }
    console.error("starting item workflows failed", error)
  }
}
