"use client"

import {
  CheckCircleIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useState, type SubmitEvent } from "react"
import useSWR from "swr"

import {
  ApiError,
  fetchKeySettings,
  keySettingsPath,
  removeOpenRouterKey,
  saveOpenRouterKey,
  type KeySettings,
} from "@/lib/api"
import { formText } from "@/lib/form-text"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The API could not be reached. Check your connection and try again."
}

export function OpenRouterKeySettings() {
  const { data, error, isLoading, mutate } = useSWR<KeySettings, Error>(
    keySettingsPath,
    fetchKeySettings
  )
  const [editing, setEditing] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<KeySettings>) {
    setPending(true)
    setActionError(null)
    try {
      await mutate(await action(), { revalidate: false })
      setEditing(false)
      setConfirmingRemove(false)
      return true
    } catch (caught) {
      setActionError(errorMessage(caught))
      return false
    } finally {
      setPending(false)
    }
  }

  async function save(form: HTMLFormElement) {
    const key = formText(form, "key").trim()
    if (!key) {
      setActionError("Paste your OpenRouter API key first.")
      return
    }
    if (await run(() => saveOpenRouterKey(key))) form.reset()
  }

  const status = data?.openrouter
  const showForm = status && (!status.set || editing)

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="openrouter-heading"
    >
      <div className="flex flex-col gap-2">
        <h2 id="openrouter-heading" className="text-base font-medium">
          OpenRouter key
        </h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Enrichment, search and answers run on your own OpenRouter account and
          are billed to it.
        </p>
      </div>

      <Alert>
        <InfoIcon aria-hidden />
        <AlertDescription className="text-sm leading-relaxed">
          Your notes and questions are sent to third-party model providers
          through OpenRouter, using this key. Only add a key if you are
          comfortable with that.
        </AlertDescription>
      </Alert>

      {isLoading && (
        <div className="h-16 w-full animate-pulse bg-muted" aria-busy />
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {status && (
        <div className="flex flex-col gap-4 border-t pt-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {status.set ? (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircleIcon
                  weight="fill"
                  className="text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <span>
                  Key set, ending in{" "}
                  <span className="font-mono">{status.last4}</span>
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No key set</p>
            )}
            {status.set && !editing && !confirmingRemove && (
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

          {confirmingRemove && (
            <div className="flex flex-wrap items-center gap-3 border p-3">
              <p className="text-sm">
                Remove the key? Processing and asking stop until you add one.
              </p>
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
                    void run(removeOpenRouterKey)
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
                void save(event.currentTarget)
              }}
              className="flex flex-col gap-4"
            >
              <Field>
                <FieldLabel htmlFor="openrouter-key">
                  {status.set ? "New API key" : "API key"}
                </FieldLabel>
                <Input
                  id="openrouter-key"
                  name="key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-or-v1-..."
                  className="h-10 font-mono text-base md:h-9 md:text-sm"
                />
                <FieldDescription>
                  Checked with OpenRouter before saving. Stored encrypted and
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
            <Alert variant="destructive">
              <WarningCircleIcon aria-hidden />
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  )
}
