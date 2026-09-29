"use client"

import {
  MicrophoneIcon,
  StopIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { saveAudio, type ItemSummary } from "@/lib/items-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

const MAX_AUDIO_SIZE = 25 * 1024 * 1024

export function AudioCapture({
  onSaved,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const recordedBytes = useRef(0)
  const tooLarge = useRef(false)
  const recordingFailed = useRef(false)

  useEffect(() => {
    return () => {
      recorder.current?.stop()
      stream.current?.getTracks().forEach((track) => {
        track.stop()
      })
    }
  }, [])

  async function startRecording() {
    if (!("mediaDevices" in navigator) || !("MediaRecorder" in window)) {
      setError(
        "Recording is unavailable in this browser. Upload an audio file instead."
      )
      return
    }
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      stream.current = microphone
      const type = ["audio/webm", "audio/mp4"].find((value) =>
        MediaRecorder.isTypeSupported(value)
      )
      const next = new MediaRecorder(
        microphone,
        type ? { mimeType: type } : undefined
      )
      chunks.current = []
      recordedBytes.current = 0
      tooLarge.current = false
      recordingFailed.current = false
      next.ondataavailable = (event) => {
        recordedBytes.current += event.data.size
        if (recordedBytes.current > MAX_AUDIO_SIZE) {
          tooLarge.current = true
          if (next.state === "recording") next.stop()
          setRecording(false)
          setFinishing(true)
          return
        }
        if (event.data.size) chunks.current.push(event.data)
      }
      next.onstop = () => {
        microphone.getTracks().forEach((track) => {
          track.stop()
        })
        if (recorder.current === next) {
          stream.current = null
          recorder.current = null
        }
        setFinishing(false)
        if (recordingFailed.current) return
        if (tooLarge.current) {
          setError("Recording reached the 25 MB limit. Save a shorter clip.")
          return
        }
        const mimeType = next.mimeType.split(";")[0] ?? "audio/webm"
        const extension = mimeType === "audio/mp4" ? "m4a" : "webm"
        const recorded = new File(chunks.current, `voice-note.${extension}`, {
          type: mimeType,
        })
        if (recorded.size) setFile(recorded)
        else setError("No audio was recorded. Try again.")
      }
      next.addEventListener("error", () => {
        recordingFailed.current = true
        microphone.getTracks().forEach((track) => {
          track.stop()
        })
        setRecording(false)
        setFinishing(true)
        setError("Recording stopped unexpectedly. Try again or upload audio.")
      })
      recorder.current = next
      setFile(null)
      setError(null)
      next.start(1000)
      setRecording(true)
    } catch {
      stream.current?.getTracks().forEach((track) => {
        track.stop()
      })
      setError(
        "Microphone access failed. Allow access or upload an audio file."
      )
    }
  }

  function stopRecording() {
    recorder.current?.stop()
    setRecording(false)
    setFinishing(true)
  }

  async function save() {
    if (!file) return
    setPending(true)
    setError(null)
    try {
      const item = await saveAudio(file)
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
      aria-label="Audio capture"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={recording ? "destructive" : "outline"}
          onClick={recording ? stopRecording : () => void startRecording()}
          disabled={pending || finishing}
        >
          {recording ? (
            <StopIcon aria-hidden />
          ) : (
            <MicrophoneIcon aria-hidden />
          )}
          {recording ? "Stop recording" : "Record audio"}
        </Button>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-input px-5 text-sm font-medium focus-within:ring-2 focus-within:ring-ring hover:bg-muted">
          <UploadSimpleIcon aria-hidden /> Upload audio
          <input
            type="file"
            className="sr-only"
            accept="audio/wav,audio/webm,audio/mpeg,audio/mp4,audio/ogg,.m4a,.mp3"
            disabled={recording || finishing || pending}
            onChange={(event) => {
              const selected = event.target.files?.[0]
              event.target.value = ""
              if (!selected) return
              setFile(selected.size <= MAX_AUDIO_SIZE ? selected : null)
              setError(
                selected.size > MAX_AUDIO_SIZE
                  ? "Audio files can be at most 25 MB."
                  : null
              )
            }}
          />
        </label>
        {recording && (
          <span className="text-sm text-coral-ink" role="status">
            Recording…
          </span>
        )}
      </div>
      {file && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="min-w-0 truncate text-sm">{file.name}</p>
          <Button type="button" disabled={pending} onClick={() => void save()}>
            {pending ? "Saving" : "Save audio"}
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
