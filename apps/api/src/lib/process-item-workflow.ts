import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"

import { connect, type PipelineJob } from "@workspace/db"

import { pipelineStep } from "./config.js"
import {
  PipelineFailure,
  processItem,
  type ProcessItemOutcome,
  type StepRunner,
} from "./pipeline/index.js"

export type ProcessItemParams = PipelineJob

export function workflowInstanceId(job: PipelineJob): string {
  return `${job.itemId}-${job.run}`
}

export class ProcessItemWorkflow extends WorkflowEntrypoint<
  Env,
  ProcessItemParams
> {
  async run(
    event: WorkflowEvent<ProcessItemParams>,
    step: WorkflowStep
  ): Promise<ProcessItemOutcome> {
    const runStep: StepRunner = (name, callback) =>
      step.do(name, pipelineStep, async () => {
        try {
          return await callback()
        } catch (error) {
          if (error instanceof PipelineFailure && error.permanent) {
            throw new NonRetryableError(error.message)
          }
          throw error
        }
      })
    const env = this.env
    const outcome = await processItem(
      { env, openDb: () => connect(env.HYPERDRIVE.connectionString).db },
      event.payload,
      runStep
    )
    // The item is already marked failed; failing the instance keeps Workflow status honest.
    // Only steps retry, so a plain error here ends the instance as errored.
    if (outcome.outcome === "failed") {
      throw new Error(`item ${event.payload.itemId} failed: ${outcome.reason}`)
    }
    return outcome
  }
}
