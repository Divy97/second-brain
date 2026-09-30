"use client"

import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useState, type SubmitEvent } from "react"

import { PasswordInput } from "@/components/password-input"
import { describeApiError } from "@/lib/describe-api-error"
import { formText } from "@/lib/form-text"
import { keyProviderCopy } from "@/lib/key-providers"
import {
  removeKey,
  saveKey,
  type KeyProvider,
  type KeySettings,
  type KeyStatus,
} from "@/lib/keys-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"

interface ApiKeySettingsProps {
  provider: KeyProvider
  status: KeyStatus
  onChange: (settings: KeySettings) => Promise<unknown>
}

export function ApiKeySettings({
  provider,
  status,
  onChange,
}: ApiKeySettingsProps) {
  const copy = keyProviderCopy[provider]
  const [editing, setEditing] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fieldId = `${provider}-key`
  const showForm = !status.set || editing

  async function applyKeyChange(action: () => Promise<KeySettings>) {
    setPending(true)
    setActionError(null)
    try {
      await onChange(await action())
      setEditing(false)
      setConfirmingRemove(false)
      return true
    } catch (caught) {
      setActionError(describeApiError(caught))
      return false
    } finally {
      setPending(false)
    }
  }

  async function submit(form: HTMLFormElement) {
    const key = formText(form, "key").trim()
    if (!key) {
      setActionError(copy.emptyKeyError)
      return
    }
    if (await applyKeyChange(() => saveKey(provider, key))) form.reset()
  }

  return (
    <section
      className="flex flex-col gap-5"
      aria-labelledby={`${provider}-heading`}
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${provider}-heading`} className="font-heading text-2xl">
          {copy.heading}
        </h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          {copy.purpose}
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 sm:p-7">
        {status.set && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircleIcon
                weight="fill"
                className="text-primary"
                aria-hidden
              />
              <span>
                Key set, ending in{" "}
                <span className="font-mono">{status.last4}</span>
              </span>
            </p>
            {!editing && !confirmingRemove && (
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(true)
                  }}
                >
                  Replace
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmingRemove(true)
                  }}
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        )}

        {confirmingRemove && (
          <div className="flex flex-wrap items-center gap-3 border p-3">
            <p className="text-sm">{copy.removeWarning}</p>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setConfirmingRemove(false)
                }}
              >
                Keep key
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  void applyKeyChange(() => removeKey(provider))
                }}
              >
                {pending ? "Removing" : "Remove key"}
              </Button>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
              event.preventDefault()
              void submit(event.currentTarget)
            }}
            className="flex flex-col gap-4"
          >
            <Field>
              <FieldLabel htmlFor={fieldId} className="w-full justify-between">
                {status.set ? "New API key" : "API key"}
                <span
                  aria-hidden
                  className="text-xs font-normal text-muted-foreground"
                >
                  Required
                </span>
              </FieldLabel>
              <PasswordInput
                id={fieldId}
                name="key"
                autoComplete="off"
                spellCheck={false}
                placeholder={copy.placeholder}
                className="font-mono"
                required
                aria-invalid={!!actionError}
                aria-describedby={
                  actionError ? `${fieldId}-error` : `${fieldId}-help`
                }
                onInvalid={(event) => {
                  event.preventDefault()
                  setActionError(copy.emptyKeyError)
                }}
                onInput={() => {
                  setActionError(null)
                }}
              />
              <FieldDescription id={`${fieldId}-help`}>
                Checked with the provider before saving. Stored encrypted and
                never shown again.
              </FieldDescription>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Checking key" : "Save key"}
              </Button>
              {status.set && (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  disabled={pending}
                  onClick={() => {
                    setEditing(false)
                    setActionError(null)
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        {actionError && (
          <Alert id={`${fieldId}-error`} variant="destructive">
            <WarningCircleIcon aria-hidden />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
      </div>
    </section>
  )
}
