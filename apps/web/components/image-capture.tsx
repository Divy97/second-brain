"use client"

import { CameraIcon, ImageIcon } from "@phosphor-icons/react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { CaptureError } from "@/components/capture-error"
import { CaptureFooter } from "@/components/capture-footer"
import { FilePickerTile } from "@/components/file-picker-tile"
import { SelectedFile } from "@/components/selected-file"
import { describeApiError } from "@/lib/describe-api-error"
import { saveImage, type ItemSummary } from "@/lib/items-api"
import { Button } from "@workspace/ui/components/button"

const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const PHOTO_TYPES = "image/jpeg,image/png,image/webp"

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

  function choose(selected: File) {
    if (selected.size > MAX_IMAGE_SIZE) {
      replaceFile(null)
      setError("Photos can be at most 10 MB.")
      return
    }
    if (!PHOTO_TYPES.split(",").includes(selected.type)) {
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
    <div className="flex flex-1 flex-col gap-4">
      {file ? (
        <SelectedFile
          file={file}
          icon={ImageIcon}
          disabled={pending}
          onRemove={() => {
            replaceFile(null)
          }}
          thumbnail={
            preview && (
              <Image
                unoptimized
                src={preview}
                width={112}
                height={112}
                alt="Photo preview"
                className="size-28 shrink-0 rounded-md object-cover"
              />
            )
          }
        />
      ) : (
        <div className="grid gap-3 pointer-coarse:grid-cols-2">
          <FilePickerTile
            icon={ImageIcon}
            label="Upload photo"
            hint="Drop an image here or choose one"
            accept={PHOTO_TYPES}
            disabled={pending}
            onFile={choose}
          />
          <FilePickerTile
            icon={CameraIcon}
            label="Take photo"
            hint="Use your camera"
            accept={PHOTO_TYPES}
            capture="environment"
            disabled={pending}
            className="hidden pointer-coarse:flex"
            onFile={choose}
          />
        </div>
      )}
      {error && <CaptureError message={error} />}
      <CaptureFooter hint="JPEG, PNG, or WebP up to 10 MB">
        <Button
          type="button"
          disabled={!file || pending}
          onClick={() => void save()}
        >
          {pending ? "Saving" : "Save photo"}
        </Button>
      </CaptureFooter>
    </div>
  )
}
