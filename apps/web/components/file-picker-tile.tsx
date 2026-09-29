"use client"

import { useState } from "react"

import { CaptureTileContent, captureTileClass } from "@/components/capture-tile"
import { cn } from "@workspace/ui/lib/utils"

import type { Icon } from "@phosphor-icons/react"

export function FilePickerTile({
  icon,
  label,
  hint,
  accept,
  capture,
  disabled,
  className,
  onFile,
}: {
  icon: Icon
  label: string
  hint: string
  accept: string
  capture?: "environment"
  disabled?: boolean
  className?: string
  onFile: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  return (
    <label
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (disabled) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => {
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const dropped = event.dataTransfer.files[0]
        if (!disabled && dropped) onFile(dropped)
      }}
      className={cn(
        captureTileClass,
        "data-dragging:border-primary data-dragging:bg-accent/60",
        className
      )}
    >
      <CaptureTileContent icon={icon} label={label} hint={hint} />
      <input
        type="file"
        className="sr-only"
        aria-label={label}
        accept={accept}
        capture={capture}
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.files?.[0]
          event.target.value = ""
          if (selected) onFile(selected)
        }}
      />
    </label>
  )
}
