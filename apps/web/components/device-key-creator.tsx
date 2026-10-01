"use client"

import {
  CheckIcon,
  CopyIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useState, type SubmitEvent } from "react"

import { describeApiError } from "@/lib/describe-api-error"
import { mintDevice } from "@/lib/devices-api"
import { formText } from "@/lib/form-text"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

type Step =
  { name: "idle" } | { name: "naming" } | { name: "created"; key: string }

interface DeviceKeyCreatorProps {
  onCreated: () => Promise<unknown>
}

export function DeviceKeyCreator({ onCreated }: DeviceKeyCreatorProps) {
  const [step, setStep] = useState<Step>({ name: "idle" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  async function create(form: HTMLFormElement) {
    setPending(true)
    setError(null)
    try {
      const device = await mintDevice(formText(form, "label").trim())
      setStep({ name: "created", key: device.key })
    } catch (caught) {
      setError(describeApiError(caught))
    } finally {
      setPending(false)
    }
  }

  async function copy(key: string) {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(key)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  async function finish() {
    setStep({ name: "idle" })
    setCopied(false)
    setCopyFailed(false)
    await onCreated()
  }

  if (step.name === "idle") {
    return (
      <div>
        <Button
          variant="outline"
          onClick={() => {
            setStep({ name: "naming" })
          }}
        >
          <PlusIcon aria-hidden />
          Create device key
        </Button>
      </div>
    )
  }

  if (step.name === "naming") {
    return (
      <form
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault()
          void create(event.currentTarget)
        }}
        className="flex flex-col gap-4 rounded-2xl bg-card p-5 sm:p-7"
      >
        <Field>
          <FieldLabel htmlFor="device-label">Device name</FieldLabel>
          <Input
            id="device-label"
            name="label"
            maxLength={80}
            autoComplete="off"
            placeholder="Chrome on MacBook"
            aria-describedby="device-label-help"
          />
          <FieldDescription id="device-label-help">
            Optional. Helps you tell your browsers apart in this list.
          </FieldDescription>
        </Field>
        {error && (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Creating key" : "Create key"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={() => {
              setStep({ name: "idle" })
              setError(null)
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 sm:p-7">
      <Field>
        <FieldLabel htmlFor="device-key">Your device key</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="device-key"
            readOnly
            value={step.key}
            spellCheck={false}
            className="font-mono"
            onFocus={(event) => {
              event.currentTarget.select()
            }}
          />
          <Button
            variant="outline"
            aria-label="Copy key"
            onClick={() => {
              void copy(step.key)
            }}
          >
            {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <FieldDescription>
          Paste it into the extension popup. This key won&apos;t be shown again,
          so copy it now. Anyone holding it can add captures to your Second
          Brain until you disconnect the device.
        </FieldDescription>
      </Field>
      {copyFailed && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>
            Copying failed. Select the key above and copy it by hand.
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button
          size="lg"
          onClick={() => {
            void finish()
          }}
        >
          Done
        </Button>
      </div>
    </div>
  )
}
