import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { connect, spendPaidLookup, type Database } from "./index.js"
import { createFreshDatabase } from "./migrate.js"
import { users } from "./schema.js"

let connection: ReturnType<typeof connect>
let db: Database

async function newUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ email: `${crypto.randomUUID()}@example.test`, name: "user" })
    .returning({ id: users.id })
  if (!row) throw new Error("user was not created")
  return row.id
}

beforeAll(async () => {
  connection = connect(await createFreshDatabase("second_brain_lookups_test"))
  db = connection.db
})

afterAll(async () => {
  await connection.close()
})

describe("spendPaidLookup", () => {
  it("allows lookups up to the limit and refuses the rest", async () => {
    const userId = await newUser()
    const day = "2026-10-01"
    const spend = () =>
      spendPaidLookup(db, { userId, service: "transcript", day, limit: 2 })

    expect([
      await spend(),
      await spend(),
      await spend(),
      await spend(),
    ]).toEqual([true, true, false, false])
  })

  it("counts each service separately", async () => {
    const userId = await newUser()
    const day = "2026-10-01"

    await spendPaidLookup(db, { userId, service: "transcript", day, limit: 1 })

    expect(
      await spendPaidLookup(db, {
        userId,
        service: "transcript",
        day,
        limit: 1,
      })
    ).toBe(false)
    expect(
      await spendPaidLookup(db, { userId, service: "reader", day, limit: 1 })
    ).toBe(true)
  })

  it("starts again the next day", async () => {
    const userId = await newUser()
    const limit = 1

    await spendPaidLookup(db, {
      userId,
      service: "reader",
      day: "2026-10-01",
      limit,
    })

    expect(
      await spendPaidLookup(db, {
        userId,
        service: "reader",
        day: "2026-10-01",
        limit,
      })
    ).toBe(false)
    expect(
      await spendPaidLookup(db, {
        userId,
        service: "reader",
        day: "2026-10-02",
        limit,
      })
    ).toBe(true)
  })

  it("keeps every user's allowance separate", async () => {
    const [first, second] = [await newUser(), await newUser()]
    const day = "2026-10-01"

    await spendPaidLookup(db, {
      userId: first,
      service: "reader",
      day,
      limit: 1,
    })

    expect(
      await spendPaidLookup(db, {
        userId: second,
        service: "reader",
        day,
        limit: 1,
      })
    ).toBe(true)
  })

  it("never lets simultaneous lookups exceed the limit", async () => {
    const userId = await newUser()
    const day = "2026-10-01"

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        spendPaidLookup(db, { userId, service: "transcript", day, limit: 3 })
      )
    )

    expect(results.filter(Boolean)).toHaveLength(3)
  })

  it("refuses everything when the limit is zero", async () => {
    const userId = await newUser()

    expect(
      await spendPaidLookup(db, {
        userId,
        service: "reader",
        day: "2026-10-01",
        limit: 0,
      })
    ).toBe(false)
  })
})
