import { apiRequest } from "@/lib/api"

export interface StoredItem {
  id: string
  url: string | null
  host: string
  title: string | null
  capturedAt: string
  status: string
}

export interface StoredItemsPage {
  items: StoredItem[]
  waiting: number
  nextCursor: string | null
}

export const storedPath = "/stored"

export const fetchStoredItems = (cursor?: string) =>
  apiRequest<StoredItemsPage>(
    `${storedPath}${cursor ? `?cursor=${cursor}` : ""}`
  )

export const indexStoredItem = (id: string) =>
  apiRequest<{ id: string; status: string }>(`${storedPath}/${id}/index`, {
    method: "POST",
  })

export const indexManyStoredItems = (ids: string[]) =>
  apiRequest<{ queued: number }>(`${storedPath}/index`, {
    method: "POST",
    json: { ids },
  })

export const deleteStoredItem = (id: string) =>
  apiRequest<null>(`${storedPath}/${id}`, { method: "DELETE" })
