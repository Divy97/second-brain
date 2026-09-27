import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"

import { pipelineStep } from "./config.js"
import {
  PipelineFailure,
  processItem,
  type ProcessItemOutcome,
  type StepRunner,
} from "./pipeline/index.js"

import type { PipelineJob } from "@workspace/db"

export type ProcessItemParams = PipelineJob

export function workflowInstanceId(job: PipelineJob): string {
  return `${job.itemId}-${job.run}`
}

export class ProcessItemWorkflow extends WorkflowEntrypoint<
  Env,
  ProcessItemParams
> {
  run(
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
    return processItem(this.env, event.payload, runStep)
  }
}
