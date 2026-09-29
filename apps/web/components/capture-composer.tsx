"use client"

import {
  FilePdfIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  NotePencilIcon,
  type Icon,
} from "@phosphor-icons/react"
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { AudioCapture } from "@/components/audio-capture"
import { CaptureBox } from "@/components/capture-box"
import { ImageCapture } from "@/components/image-capture"
import { PdfCapture } from "@/components/pdf-capture"
import { UrlCapture } from "@/components/url-capture"
import { cn } from "@workspace/ui/lib/utils"

import type { ItemSummary } from "@/lib/items-api"

type CaptureMode = "note" | "voice" | "photo" | "pdf" | "link"

const captureModes: { id: CaptureMode; label: string; icon: Icon }[] = [
  { id: "note", label: "Note", icon: NotePencilIcon },
  { id: "voice", label: "Voice", icon: MicrophoneIcon },
  { id: "photo", label: "Photo", icon: ImageIcon },
  { id: "pdf", label: "PDF", icon: FilePdfIcon },
  { id: "link", label: "Link", icon: LinkIcon },
]

export function CaptureComposer({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [activeMode, setActiveMode] = useState<CaptureMode>("note")
  const [recording, setRecording] = useState(false)
  const tabRefs = useRef(new Map<CaptureMode, HTMLButtonElement>())

  function focusModeAt(index: number) {
    const mode = captureModes.at(index % captureModes.length)
    if (!mode) return
    setActiveMode(mode.id)
    tabRefs.current.get(mode.id)?.focus()
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = captureModes.findIndex((mode) => mode.id === activeMode)
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: captureModes.length - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    focusModeAt(target)
  }

  const panels: Record<CaptureMode, ReactNode> = {
    note: <CaptureBox onSaved={onSaved} />,
    voice: <AudioCapture onSaved={onSaved} onRecordingChange={setRecording} />,
    photo: <ImageCapture onSaved={onSaved} />,
    pdf: <PdfCapture onSaved={onSaved} />,
    link: <UrlCapture onSaved={onSaved} />,
  }

  return (
    <section
      aria-label="Capture"
      className="flex flex-col gap-4 rounded-xl border bg-card p-3 shadow-[0_24px_60px_-32px_rgb(83_60_81/0.35)] sm:p-4"
    >
      <div
        role="tablist"
        aria-label="What are you saving?"
        onKeyDown={onTabKeyDown}
        className="grid grid-cols-5 gap-1 rounded-full bg-muted p-1"
      >
        {captureModes.map((mode) => {
          const selected = mode.id === activeMode
          const live = mode.id === "voice" && recording
          return (
            <button
              key={mode.id}
              ref={(node) => {
                if (node) tabRefs.current.set(mode.id, node)
                else tabRefs.current.delete(mode.id)
              }}
              type="button"
              role="tab"
              id={`capture-tab-${mode.id}`}
              aria-selected={selected}
              aria-controls={`capture-panel-${mode.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setActiveMode(mode.id)
              }}
              className={cn(
                "relative flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold text-muted-foreground transition-[background-color,color,box-shadow] duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                selected &&
                  "bg-card text-foreground shadow-[0_2px_8px_-2px_rgb(83_60_81/0.25)]"
              )}
            >
              <mode.icon
                className="hidden size-4 min-[420px]:block"
                weight={selected ? "bold" : "regular"}
                aria-hidden
              />
              {mode.label}
              {live && (
                <span className="absolute top-1.5 right-2 size-2 animate-pulse rounded-full bg-coral-ink">
                  <span className="sr-only">(recording)</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
      {captureModes.map((mode) => (
        <div
          key={mode.id}
          role="tabpanel"
          id={`capture-panel-${mode.id}`}
          aria-labelledby={`capture-tab-${mode.id}`}
          hidden={mode.id !== activeMode}
          className="flex min-h-64 flex-col px-2 pb-2 sm:px-3"
        >
          {panels[mode.id]}
        </div>
      ))}
    </section>
  )
}
