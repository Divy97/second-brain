"use client"

import {
  MicrophoneIcon,
  StopIcon,
  UploadSimpleIcon,
  WaveformIcon,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"

import { CaptureError } from "@/components/capture-error"
import { CaptureFooter } from "@/components/capture-footer"
import { CaptureTileContent, captureTileClass } from "@/components/capture-tile"
import { FilePickerTile } from "@/components/file-picker-tile"
import { SelectedFile } from "@/components/selected-file"
import { describeApiError } from "@/lib/describe-api-error"
import { saveAudio, type ItemSummary } from "@/lib/items-api"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const MAX_AUDIO_SIZE = 25 * 1024 * 1024

export function AudioCapture({
  onSaved,
  onRecordingChange,
}: {
  onSaved: (item: ItemSummary) => Promise<void>
  onRecordingChange: (recording: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
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

  useEffect(() => {
    onRecordingChange(recording)
    if (!recording) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [recording, onRecordingChange])

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
      setElapsedSeconds(0)
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
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-label={recording ? "Stop recording" : "Record audio"}
          onClick={recording ? stopRecording : () => void startRecording()}
          disabled={pending || finishing}
          className={cn(
            captureTileClass,
            recording &&
              "border-solid border-coral bg-coral/10 hover:bg-coral/15"
          )}
        >
          <CaptureTileContent
            icon={recording ? StopIcon : MicrophoneIcon}
            label={recording ? "Stop recording" : "Record audio"}
            tone={recording ? "live" : "calm"}
            hint={
              recording ? (
                <>
                  <span role="status" className="text-coral-ink">
                    Recording…
                  </span>{" "}
                  <span className="font-mono tabular-nums">
                    {formatElapsed(elapsedSeconds)}
                  </span>
                </>
              ) : (
                "Use your microphone"
              )
            }
          />
        </button>
        <FilePickerTile
          icon={UploadSimpleIcon}
          label="Upload audio"
          hint="MP3, M4A, WAV, WebM, or OGG"
          accept="audio/wav,audio/webm,audio/mpeg,audio/mp4,audio/ogg,.m4a,.mp3"
          disabled={recording || finishing || pending}
          onFile={(selected) => {
            setFile(selected.size <= MAX_AUDIO_SIZE ? selected : null)
            setError(
              selected.size > MAX_AUDIO_SIZE
                ? "Audio files can be at most 25 MB."
                : null
            )
          }}
        />
      </div>
      {file && (
        <SelectedFile
          file={file}
          icon={WaveformIcon}
          disabled={pending}
          onRemove={() => {
            setFile(null)
          }}
        />
      )}
      {error && <CaptureError message={error} />}
      <CaptureFooter hint="Up to 25 MB">
        <Button
          type="button"
          disabled={!file || pending || recording}
          onClick={() => void save()}
        >
          {pending ? "Saving" : "Save audio"}
        </Button>
      </CaptureFooter>
    </div>
  )
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}
