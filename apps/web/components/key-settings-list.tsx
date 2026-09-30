"use client"

import { InfoIcon, WarningCircleIcon } from "@phosphor-icons/react"
import useSWR from "swr"

import { ApiKeySettings } from "@/components/api-key-settings"
import { describeApiError } from "@/lib/describe-api-error"
import {
  fetchKeySettings,
  keySettingsPath,
  type KeyProvider,
  type KeySettings,
} from "@/lib/keys-api"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

const providers: KeyProvider[] = ["openrouter"]

export function KeySettingsList() {
  const { data, error, isLoading, mutate } = useSWR<KeySettings, Error>(
    keySettingsPath,
    fetchKeySettings
  )

  return (
    <div className="flex flex-col gap-10">
      <Alert className="max-w-[65ch]">
        <InfoIcon aria-hidden />
        <AlertDescription className="text-sm leading-relaxed">
          Your notes, questions and saved links are processed with your
          OpenRouter account. When you save a video link, or a page that blocks
          normal reading, its address is also sent to our transcript and
          page-reading providers, Supadata and Jina.
        </AlertDescription>
      </Alert>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading settings"
          aria-busy
          className="animate-pulse space-y-5"
        >
          <div className="h-8 w-48 rounded-lg bg-muted" />
          <div className="h-10 max-w-lg rounded-lg bg-muted" />
          <div className="space-y-4 rounded-2xl bg-card p-7">
            <div className="h-5 w-20 rounded bg-muted" />
            <div className="h-11 rounded-lg bg-muted" />
            <div className="h-11 w-28 rounded-full bg-muted" />
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{describeApiError(error)}</AlertDescription>
        </Alert>
      )}

      {data &&
        providers.map((provider) => (
          <ApiKeySettings
            key={provider}
            provider={provider}
            status={data[provider]}
            onChange={(settings) => mutate(settings, { revalidate: false })}
          />
        ))}
    </div>
  )
}
