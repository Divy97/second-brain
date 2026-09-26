"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

export function ItemActions({
  pending,
  onEdit,
  onDelete,
}: {
  pending: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-6">
      {confirmingDelete ? (
        <>
          <p className="text-sm">Delete this note?</p>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setConfirmingDelete(false)
              }}
            >
              Keep note
            </Button>
            <Button variant="destructive" disabled={pending} onClick={onDelete}>
              {pending ? "Deleting" : "Delete note"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="destructive"
            className="ml-auto"
            onClick={() => {
              setConfirmingDelete(true)
            }}
          >
            Delete
          </Button>
        </>
      )}
    </div>
  )
}
