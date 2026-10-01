import { apiError } from "../api-error.js"

import type { PipelineJob } from "@workspace/db"
import type { Context } from "hono"

function queueUnavailable(c: Context): Response {
  return apiError(
    c,
    503,
    "queue_unavailable",
    "Your capture is saved, but processing could not start. Try again shortly."
  )
}

// Answers 503 when the queue refuses the job: the capture is saved, and saving it again (or
// retrying) re-queues it.
export async function enqueueOrRefuse<E extends { Bindings: Env }>(
  c: Context<E>,
  job: PipelineJob
): Promise<Response | null> {
  try {
    await c.env.ITEMS_QUEUE.send(job)
    return null
  } catch (error) {
    console.error("queue send failed", job.itemId, error)
    return queueUnavailable(c)
  }
}

export async function enqueueAllOrRefuse<E extends { Bindings: Env }>(
  c: Context<E>,
  jobs: PipelineJob[]
): Promise<Response | null> {
  if (jobs.length === 0) return null
  try {
    await c.env.ITEMS_QUEUE.sendBatch(jobs.map((body) => ({ body })))
    return null
  } catch (error) {
    console.error("queue send failed", jobs.length, error)
    return queueUnavailable(c)
  }
}
