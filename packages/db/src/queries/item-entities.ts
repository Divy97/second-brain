import { eq } from "drizzle-orm"

import { entities, itemEntities } from "../schema.js"

import type { Database } from "../database.js"
import type { EntityType, ItemEntity } from "./item-types.js"

export async function listItemEntities(
  db: Database,
  itemId: string
): Promise<ItemEntity[]> {
  const rows = await db
    .select({ name: entities.name, type: entities.type })
    .from(itemEntities)
    .innerJoin(entities, eq(entities.id, itemEntities.entityId))
    .where(eq(itemEntities.itemId, itemId))
    .orderBy(entities.name)
  return rows.map((row) => ({ name: row.name, type: row.type as EntityType }))
}
