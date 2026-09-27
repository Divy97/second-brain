"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { deleteThread } from "@/lib/threads-api"
import { Button } from "@workspace/ui/components/button"

export function DeleteThread({ id }: { id: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setPending(true)
    setError(null)
    try {
      await deleteThread(id)
      router.replace("/threads")
    } catch (caught) {
      setError(describeApiError(caught))
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">Delete this conversation?</p>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setConfirming(false)
              }}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                void remove()
              }}
            >
              {pending ? "Deleting" : "Delete conversation"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="destructive"
          className="self-end"
          onClick={() => {
            setConfirming(true)
          }}
        >
          Delete conversation
        </Button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
