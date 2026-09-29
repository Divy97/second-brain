"use client"

import { FilePdfIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { CaptureError } from "@/components/capture-error"
import { CaptureFooter } from "@/components/capture-footer"
import { FilePickerTile } from "@/components/file-picker-tile"
import { SelectedFile } from "@/components/selected-file"
import { describeApiError } from "@/lib/describe-api-error"
import { savePdf, type ItemSummary } from "@/lib/items-api"
import { Button } from "@workspace/ui/components/button"

const MAX_PDF_SIZE = 25 * 1024 * 1024

export function PdfCapture({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function choose(selected: File) {
    if (selected.size > MAX_PDF_SIZE) {
      setFile(null)
      setError("PDFs can be at most 25 MB.")
      return
    }
    if (selected.type !== "application/pdf") {
      setFile(null)
      setError("Choose a PDF file.")
      return
    }
    setFile(selected)
    setError(null)
  }

  async function save() {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const item = await savePdf(file)
      setFile(null)
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
          icon={FilePdfIcon}
          disabled={pending}
          onRemove={() => {
            setFile(null)
          }}
        />
      ) : (
        <FilePickerTile
          icon={FilePdfIcon}
          label="Upload PDF"
          hint="Drop a PDF here or choose one"
          accept="application/pdf,.pdf"
          disabled={pending}
          onFile={choose}
        />
      )}
      {error && <CaptureError message={error} />}
      <CaptureFooter hint="Up to 25 MB. Scanned pages are read too.">
        <Button
          type="button"
          disabled={!file || pending}
          onClick={() => void save()}
        >
          {pending ? "Saving" : "Save PDF"}
        </Button>
      </CaptureFooter>
    </div>
  )
}
