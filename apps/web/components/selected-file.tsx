import { XIcon, type Icon } from "@phosphor-icons/react"

import { formatFileSize } from "@/lib/format-file-size"
import { Button } from "@workspace/ui/components/button"

import type { ReactNode } from "react"

export function SelectedFile({
  file,
  icon: FileIcon,
  thumbnail,
  disabled,
  onRemove,
}: {
  file: File
  icon: Icon
  thumbnail?: ReactNode
  disabled?: boolean
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
      {thumbnail ?? (
        <span className="grid size-14 shrink-0 place-items-center rounded-md bg-card">
          <FileIcon className="size-6" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  )
}
