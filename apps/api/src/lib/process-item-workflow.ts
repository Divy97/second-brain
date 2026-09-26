import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"

export interface ProcessItemParams {
  itemId: string
}

export class ProcessItemWorkflow extends WorkflowEntrypoint<
  Env,
  ProcessItemParams
> {
  run(
    _event: WorkflowEvent<ProcessItemParams>,
    _step: WorkflowStep
  ): Promise<void> {
    return Promise.reject(
      new Error("processItem is implemented in a later ticket")
    )
  }
}
