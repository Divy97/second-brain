"use client"

import { CameraIcon, ImageIcon, WarningCircleIcon } from "@phosphor-icons/react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { saveImage, type ItemSummary } from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

const MAX_IMAGE_SIZE = 10 * 1024 * 1024

export function ImageCapture({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  function replaceFile(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = next ? URL.createObjectURL(next) : null
    setPreview(previewRef.current)
    setFile(next)
  }

  function choose(selected: File | undefined) {
    if (!selected) return
    if (selected.size > MAX_IMAGE_SIZE) {
      replaceFile(null)
      setError("Photos can be at most 10 MB.")
      return
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      replaceFile(null)
      setError("Choose a JPEG, PNG, or WebP photo.")
      return
    }
    replaceFile(selected)
    setError(null)
  }

  async function save() {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const item = await saveImage(file)
      replaceFile(null)
      await onSaved(item)
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      className="rounded-xl bg-card px-5 py-4 sm:px-6"
      aria-label="Photo capture"
    >
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-5 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted">
          <ImageIcon aria-hidden /> Upload photo
          <input
            type="file"
            className="sr-only"
            aria-label="Upload photo"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={(event) => {
              choose(event.target.files?.[0])
              event.target.value = ""
            }}
          />
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-5 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted">
          <CameraIcon aria-hidden /> Take photo
          <input
            type="file"
            className="sr-only"
            aria-label="Take photo"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={pending}
            onChange={(event) => {
              choose(event.target.files?.[0])
              event.target.value = ""
            }}
          />
        </label>
      </div>
      {file && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-4">
          {preview && (
            <Image
              unoptimized
              src={preview}
              width={96}
              height={96}
              alt="Photo preview"
              className="size-24 rounded-lg object-cover"
            />
          )}
          <p className="min-w-0 flex-1 truncate text-sm">{file.name}</p>
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving" : "Save photo"}
          </Button>
        </div>
      )}
      {error && (
        <Alert variant="destructive" className="mt-4">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}
