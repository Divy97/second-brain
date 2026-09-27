import { createOpenRouter, type OpenRouter } from "@workspace/ai"
import {
  claimItemRun,
  connect,
  findNeighbourTags,
  markItemFailed,
  saveProcessedItem,
  type Database,
  type Enrichment,
  type FailureReason,
  type PipelineJob,
} from "@workspace/db"

import {
  embeddingDimensions,
  embeddingModel,
  enrichment as enrichmentLimits,
} from "../config.js"
import { chunkText } from "./chunk-text.js"
import { enrichNote } from "./enrich.js"
import {
  describeFailure,
  PipelineFailure,
  toPipelineFailure,
} from "./failures.js"
import { resolveOpenRouterKey } from "../user-keys/index.js"

// Step results are persisted by the Workflow engine, so they must be serialisable.
export type StepRunner = <T extends Rpc.Serializable<T>>(
  name: string,
  callback: () => Promise<T>
) => Promise<T>

export const runDirectly: StepRunner = (_name, callback) => callback()

export type ProcessItemOutcome =
  | { outcome: "ready"; chunkCount: number }
  | { outcome: "failed"; reason: FailureReason }
  | { outcome: "skipped" }

// Hyperdrive guidance for Workflows: a fresh connection inside every step, never shared.
async function inStep<T>(
  env: Env,
  work: (db: Database) => Promise<T>
): Promise<T> {
  try {
    return await work(connect(env.HYPERDRIVE.connectionString).db)
  } catch (error) {
    throw toPipelineFailure(error)
  }
}

async function openRouterFor(
  db: Database,
  env: Env,
  userId: string
): Promise<OpenRouter> {
  const key = await resolveOpenRouterKey(db, env, userId)
  if (!key.ok) {
    throw new PipelineFailure(
      "missing_key",
      "No OpenRouter key is saved. Add one in settings.",
      true
    )
  }
  return createOpenRouter({ apiKey: key.apiKey })
}

async function embed(openRouter: OpenRouter, input: string[]) {
  const { embeddings } = await openRouter.embed({
    model: embeddingModel,
    input,
  })
  for (const vector of embeddings) {
    if (vector.length !== embeddingDimensions) {
      throw new PipelineFailure(
        "processing_error",
        `${embeddingModel} returned ${vector.length} dimensions, expected ${embeddingDimensions}`,
        true
      )
    }
  }
  return embeddings
}

function embeddingInput(enrichment: Enrichment, chunk: string): string {
  return `${enrichment.title} — ${enrichment.summary}\n\n${chunk}`
}

function searchText(enrichment: Enrichment, chunk: string): string {
  return [
    chunk,
    enrichment.title,
    ...enrichment.entities.map((entity) => entity.name),
    ...enrichment.tags,
  ].join("\n")
}

export async function processItem(
  env: Env,
  job: PipelineJob,
  runStep: StepRunner = runDirectly
): Promise<ProcessItemOutcome> {
  try {
    const claimed = await runStep("claim", () =>
      inStep(env, (db) => claimItemRun(db, job))
    )
    if (!claimed) return { outcome: "skipped" }

    const enrichment = await runStep("enrich", () =>
      inStep(env, async (db) => {
        const openRouter = await openRouterFor(db, env, claimed.userId)
        const [noteEmbedding = []] = await embed(openRouter, [claimed.rawText])
        const neighbourTags = await findNeighbourTags(db, {
          userId: claimed.userId,
          excludeItemId: job.itemId,
          embedding: noteEmbedding,
          limit: enrichmentLimits.neighbourCount,
        })
        return enrichNote(openRouter, { note: claimed.rawText, neighbourTags })
      })
    )

    const indexed = await runStep("index", () =>
      inStep(env, async (db) => {
        const openRouter = await openRouterFor(db, env, claimed.userId)
        const chunks = chunkText(enrichment.cleanText)
        const embeddings = await embed(
          openRouter,
          chunks.map((chunk) => embeddingInput(enrichment, chunk))
        )
        const saved = await saveProcessedItem(db, job, {
          userId: claimed.userId,
          enrichment,
          chunks: chunks.map((chunk, index) => ({
            text: chunk,
            searchText: searchText(enrichment, chunk),
            embedding: embeddings[index] ?? [],
          })),
          embeddingModel,
          embeddingDimensions,
        })
        return { saved, chunkCount: chunks.length }
      })
    )
    return indexed.saved
      ? { outcome: "ready", chunkCount: indexed.chunkCount }
      : { outcome: "skipped" }
  } catch (error) {
    const failure = describeFailure(error)
    await runStep("mark failed", () =>
      inStep(env, (db) => markItemFailed(db, job, failure))
    )
    return { outcome: "failed", reason: failure.reason }
  }
}
