import type { Database } from "@workspace/db"

const tables = [
  "users",
  "sessions",
  "accounts",
  "verifications",
  "user_keys",
  "items",
  "item_captures",
  "file_deletions",
  "chunks",
  "facts",
  "entities",
  "item_entities",
  "threads",
  "messages",
]
const pageSize = 500

function dayPrefix(date: Date): string {
  return `backups/${date.toISOString().slice(0, 10)}`
}

export function shouldRunNightlyBackup(event: ScheduledController): boolean {
  if (event.cron === "0 2 * * *") return true
  return new Date(event.scheduledTime).getUTCHours() === 2
}

export async function backupDatabase(
  db: Database,
  bucket: R2Bucket,
  prefix: string
): Promise<void> {
  for (const table of tables) {
    let page = 0
    for (;;) {
      const rows = await db.execute<{ rows: unknown[] }>(
        `select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) as rows from (select * from ${table} order by 1 limit ${pageSize} offset ${page * pageSize}) row`
      )
      const pageRows = rows[0]?.rows ?? []
      await bucket.put(
        `${prefix}/db/${table}/${page.toString().padStart(6, "0")}.json`,
        JSON.stringify(pageRows)
      )
      if (pageRows.length < pageSize) break
      page += 1
    }
  }
}

export async function backupR2Files(
  source: R2Bucket,
  destination: R2Bucket,
  prefix: string
): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await source.list({ cursor })
    for (const entry of page.objects) {
      const object = await source.get(entry.key)
      if (!object) continue
      await destination.put(`${prefix}/r2/${entry.key}`, object.body)
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}

export async function runNightlyBackup(
  db: Database,
  itemFiles: R2Bucket,
  backups: R2Bucket,
  date: Date
): Promise<void> {
  const prefix = dayPrefix(date)
  await backupDatabase(db, backups, prefix)
  await backupR2Files(itemFiles, backups, prefix)
}
