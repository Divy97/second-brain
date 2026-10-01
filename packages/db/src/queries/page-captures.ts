import { sql } from "drizzle-orm"

import { generateId, itemCaptures, items } from "../schema.js"
import { toCapturedItem, type CaptureRow } from "./capture-row.js"

import type { CapturedItem } from "./item-types.js"
import type { Database } from "../database.js"

// A page the browser extension read: its text arrives with the capture, so the pipeline never
// fetches the URL. A repeat capture refreshes a Stored or failed item and promotes it when the
// capture is to be indexed; an item already queued, processing or ready is left alone.
export async function capturePageItem(
  db: Database,
  input: {
    userId: string
    sourceUrl: string
    title: string | null
    text: string
    contentHash: string
    indexNow: boolean
  }
): Promise<CapturedItem> {
  const status = input.indexNow ? "pending" : "stored"
  const [row] = await db.execute<CaptureRow>(sql`
    with upserted as (
      insert into ${items} (id, user_id, type, status, content_hash, raw_text, source_url, title, client_text, capture_quality)
      values (${generateId()}, ${input.userId}, 'url', ${status}, ${input.contentHash}, ${input.text}, ${input.sourceUrl}, ${input.title}, true, 'full')
      on conflict (user_id, content_hash) where deleted_at is null do update
        set captured_at = now(), updated_at = now(),
          raw_text = case when ${items.status} in ('stored', 'failed') then ${input.text} else ${items.rawText} end,
          title = case when ${items.status} in ('stored', 'failed') then ${input.title} else ${items.title} end,
          client_text = ${items.clientText} or ${items.status} in ('stored', 'failed'),
          capture_quality = case when ${items.status} in ('stored', 'failed') then 'full'::capture_quality else ${items.captureQuality} end,
          partial_reason = case when ${items.status} in ('stored', 'failed') then null else ${items.partialReason} end,
          pipeline_run = case when ${input.indexNow} and ${items.status} in ('stored', 'failed') then ${items.pipelineRun} + 1 else ${items.pipelineRun} end,
          status = case when ${input.indexNow} and ${items.status} in ('stored', 'failed') then 'pending'::item_status else ${items.status} end
      returning id, type, status, capture_quality, kind, title, raw_text, captured_at, pipeline_run as run, (xmax = 0) as created
    ), capture as (
      insert into ${itemCaptures} (id, item_id, captured_at)
      select ${generateId()}, id, captured_at from upserted
    )
    select * from upserted
  `)
  if (!row) throw new Error("capture did not return a row")
  return toCapturedItem(row)
}
