"use client"

import { FilePdfIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { savePdf, type ItemSummary } from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
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

  function choose(selected: File | undefined) {
    if (!selected) return
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
    <section
      className="rounded-xl bg-card px-5 py-4 sm:px-6"
      aria-label="PDF capture"
    >
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-5 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted">
        <FilePdfIcon aria-hidden /> Upload PDF
        <input
          type="file"
          className="sr-only"
          aria-label="Upload PDF"
          accept="application/pdf,.pdf"
          disabled={pending}
          onChange={(event) => {
            choose(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </label>
      {file && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="min-w-0 truncate text-sm">{file.name}</p>
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving" : "Save PDF"}
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
