import { createOpenRouter, type OpenRouter } from "@workspace/ai"
import {
  claimItemRun,
  findNeighbourTags,
  findSimilarFacts,
  loadExtractedText,
  markItemFailed,
  saveFactChanges,
  saveProcessedItem,
  saveExtractedText,
  type Database,
  type Enrichment,
  type FailureReason,
  type PipelineJob,
} from "@workspace/db"

import {
  embeddingDimensions,
  embeddingModel,
  chatModel,
  enrichment as enrichmentLimits,
} from "../config.js"
import { extractArticle } from "./article.js"
import { chunkText } from "./chunk-text.js"
import { enrichNote } from "./enrich.js"
import { extractFacts, reconcileFact, shouldExtractFacts } from "./facts.js"
import {
  describeFailure,
  PipelineFailure,
  toPipelineFailure,
} from "./failures.js"
import { extractMedia } from "./media.js"
import { parseMediaLink } from "../media-url.js"
import { resolveOptionalKey, resolveUserKey } from "../user-keys/index.js"

// Step results are persisted by the Workflow engine, so they must be serialisable.
export type StepRunner = <T extends Rpc.Serializable<T>>(
  name: string,
  callback: () => Promise<T>
) => Promise<T>

export type ProcessItemOutcome =
  | { outcome: "ready"; chunkCount: number }
  | { outcome: "failed"; reason: FailureReason }
  | { outcome: "skipped" }

export interface PipelineContext {
  env: Env
  fetchPage?: typeof fetch
  // Called once per step: Hyperdrive wants a fresh connection inside every Workflow step.
  // Clients are not closed; the runtime reclaims them when the invocation ends.
  openDb: () => Database
}

async function inStep<T>(
  context: PipelineContext,
  work: (db: Database) => Promise<T>
): Promise<T> {
  try {
    return await work(context.openDb())
  } catch (error) {
    throw toPipelineFailure(error)
  }
}

async function openRouterFor(
  db: Database,
  env: Env,
  userId: string
): Promise<OpenRouter> {
  const key = await resolveUserKey(db, env, userId, "openrouter")
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
  context: PipelineContext,
  job: PipelineJob,
  runStep: StepRunner
): Promise<ProcessItemOutcome> {
  const { env } = context
  try {
    const claimed = await runStep("claim", () =>
      inStep(context, (db) => claimItemRun(db, job))
    )
    if (!claimed) return { outcome: "skipped" }

    if (claimed.type === "voice" && !claimed.rawText) {
      const extracted = await runStep("extract audio", () =>
        inStep(context, async (db) => {
          if (!claimed.fileKey || !claimed.fileName || !claimed.mimeType) {
            throw new PipelineFailure(
              "processing_error",
              "Audio file is missing.",
              true
            )
          }
          const object = await env.ITEM_FILES.get(claimed.fileKey)
          if (!object) {
            throw new PipelineFailure(
              "processing_error",
              "Audio file is missing.",
              true
            )
          }
          const openRouter = await openRouterFor(db, env, claimed.userId)
          const file = new File(
            [await object.arrayBuffer()],
            claimed.fileName,
            {
              type: claimed.mimeType,
            }
          )
          const transcript = await openRouter.transcribe(file)
          return saveExtractedText(db, job, transcript)
        })
      )
      if (!extracted) return { outcome: "skipped" }
    }

    if (claimed.type === "image" && !claimed.rawText) {
      const extracted = await runStep("extract image", () =>
        inStep(context, async (db) => {
          if (!claimed.fileKey || !claimed.mimeType) {
            throw new PipelineFailure(
              "processing_error",
              "Image file is missing.",
              true
            )
          }
          const object = await env.ITEM_FILES.get(claimed.fileKey)
          if (!object) {
            throw new PipelineFailure(
              "processing_error",
              "Image file is missing.",
              true
            )
          }
          const openRouter = await openRouterFor(db, env, claimed.userId)
          const { visibleText, description } = await openRouter.extractImage(
            new Uint8Array(await object.arrayBuffer()),
            claimed.mimeType,
            chatModel
          )
          return saveExtractedText(
            db,
            job,
            [visibleText.trim(), description.trim()]
              .filter(Boolean)
              .join("\n\n")
          )
        })
      )
      if (!extracted) return { outcome: "skipped" }
    }

    if (claimed.type === "pdf" && !claimed.rawText) {
      const extracted = await runStep("extract pdf", () =>
        inStep(context, async (db) => {
          if (!claimed.fileKey || !claimed.fileName || !claimed.mimeType) {
            throw new PipelineFailure(
              "processing_error",
              "PDF file is missing.",
              true
            )
          }
          const object = await env.ITEM_FILES.get(claimed.fileKey)
          if (!object) {
            throw new PipelineFailure(
              "processing_error",
              "PDF file is missing.",
              true
            )
          }
          const openRouter = await openRouterFor(db, env, claimed.userId)
          const text = await openRouter.extractPdf(
            new File([await object.arrayBuffer()], claimed.fileName, {
              type: claimed.mimeType,
            }),
            chatModel
          )
          return saveExtractedText(db, job, text)
        })
      )
      if (!extracted) return { outcome: "skipped" }
    }

    if (claimed.type === "url" && claimed.captureQuality === null) {
      const extracted = await runStep("extract url", () =>
        inStep(context, async (db) => {
          if (!claimed.sourceUrl) {
            throw new PipelineFailure(
              "processing_error",
              "Article URL is missing.",
              true
            )
          }
          const link = parseMediaLink(claimed.sourceUrl)
          const fromUrl = link
            ? await extractMedia({
                link,
                note: claimed.sourceNote,
                youtubeApiKey: env.YOUTUBE_API_KEY || null,
                transcriptKey: await resolveOptionalKey(
                  db,
                  env,
                  claimed.userId,
                  "transcript"
                ),
                fetchPage: context.fetchPage,
              })
            : await extractArticle({
                sourceUrl: claimed.sourceUrl,
                note: claimed.sourceNote,
                readerKey: await resolveOptionalKey(
                  db,
                  env,
                  claimed.userId,
                  "reader"
                ),
                fetchPage: context.fetchPage,
              })
          return saveExtractedText(db, job, fromUrl.text, fromUrl.quality)
        })
      )
      if (!extracted) return { outcome: "skipped" }
    }

    const enrichment = await runStep("enrich", () =>
      inStep(context, async (db) => {
        const openRouter = await openRouterFor(db, env, claimed.userId)
        const rawText =
          claimed.type === "voice" ||
          claimed.type === "image" ||
          claimed.type === "pdf" ||
          claimed.type === "url"
            ? await loadExtractedText(db, job)
            : claimed.rawText
        if (!rawText) {
          throw new PipelineFailure(
            "processing_error",
            "Transcript is empty.",
            true
          )
        }
        const [opening = rawText] = chunkText(rawText)
        const [noteEmbedding = []] = await embed(openRouter, [opening])
        const neighbourTags = await findNeighbourTags(db, {
          userId: claimed.userId,
          excludeItemId: job.itemId,
          embedding: noteEmbedding,
          embeddingModel,
          limit: enrichmentLimits.neighbourCount,
        })
        return enrichNote(openRouter, { note: rawText, neighbourTags })
      })
    )

    const indexed = await runStep("index", () =>
      inStep(context, async (db) => {
        const openRouter = await openRouterFor(db, env, claimed.userId)
        const factTexts = shouldExtractFacts({
          type: claimed.type,
          kind: enrichment.kind,
        })
          ? await extractFacts(openRouter, enrichment.cleanText)
          : []
        const factEmbeddings =
          factTexts.length > 0 ? await embed(openRouter, factTexts) : []
        const factChanges = []
        for (const [index, fact] of factTexts.entries()) {
          const embedding = factEmbeddings[index] ?? []
          const existing = await findSimilarFacts(db, {
            userId: claimed.userId,
            embedding,
            embeddingModel,
            limit: 10,
          })
          const decision = await reconcileFact(openRouter, { fact, existing })
          factChanges.push({
            text: fact,
            embedding,
            action: decision.action,
            existingFactId: decision.existingFactId,
          })
        }
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
        if (saved) {
          await saveFactChanges(db, {
            userId: claimed.userId,
            sourceItemId: job.itemId,
            changes: factChanges,
            embeddingModel,
            embeddingDimensions,
          })
        }
        return { saved, chunkCount: chunks.length }
      })
    )
    return indexed.saved
      ? { outcome: "ready", chunkCount: indexed.chunkCount }
      : { outcome: "skipped" }
  } catch (error) {
    const failure = describeFailure(error)
    await runStep("mark failed", () =>
      inStep(context, (db) => markItemFailed(db, job, failure))
    )
    return { outcome: "failed", reason: failure.reason }
  }
}
