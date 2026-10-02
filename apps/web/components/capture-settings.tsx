"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import useSWR from "swr"

import { BlocklistEditor } from "@/components/blocklist-editor"
import { CaptureModeField } from "@/components/capture-mode-field"
import { SettingSwitchRow } from "@/components/setting-switch-row"
import {
  captureSettingsPath,
  fetchCaptureSettings,
  saveCaptureSettings,
  type CaptureSettings as CaptureSettingsType,
} from "@/lib/capture-settings-api"
import { describeApiError } from "@/lib/describe-api-error"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

export function CaptureSettings() {
  const { data, error, isLoading, mutate } = useSWR<CaptureSettingsType, Error>(
    captureSettingsPath,
    fetchCaptureSettings
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newBlocklistEntry, setNewBlocklistEntry] = useState("")

  async function updateSettings(updates: Partial<CaptureSettingsType>) {
    if (!data) return
    setSaving(true)
    setSaveError(null)

    const newSettings = { ...data, ...updates }
    try {
      const saved = await saveCaptureSettings(newSettings)
      await mutate(saved, { revalidate: false })
    } catch (err) {
      setSaveError(
        err instanceof Error ? describeApiError(err) : "Failed to save settings"
      )
    } finally {
      setSaving(false)
    }
  }

  function addBlocklistEntry() {
    if (!data || !newBlocklistEntry.trim()) return
    const hostname = newBlocklistEntry.trim().toLowerCase()
    if (data.blocklist.includes(hostname)) {
      setNewBlocklistEntry("")
      return
    }
    void updateSettings({ blocklist: [...data.blocklist, hostname] })
    setNewBlocklistEntry("")
  }

  function removeBlocklistEntry(hostname: string) {
    if (!data) return
    void updateSettings({
      blocklist: data.blocklist.filter((h) => h !== hostname),
    })
  }

  return (
    <section
      className="flex flex-col gap-5"
      aria-labelledby="capture-settings-heading"
    >
      <div className="flex flex-col gap-2">
        <h2 id="capture-settings-heading" className="font-heading text-2xl">
          Capture Settings
        </h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Control how the browser extension captures pages. These settings apply
          to all connected devices.
        </p>
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading settings"
          aria-busy
          className="animate-pulse space-y-5 rounded-2xl bg-card p-5 sm:p-7"
        >
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
          <div className="h-12 rounded-lg bg-muted" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{describeApiError(error)}</AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="flex flex-col divide-y divide-border rounded-2xl bg-card p-5 sm:p-7">
          <SettingSwitchRow
            id="passive-enabled"
            label="Record pages as you browse"
            description="Automatically save pages you spend time reading."
            checked={data.passiveEnabled}
            disabled={saving}
            onCheckedChange={(passiveEnabled) => {
              void updateSettings({ passiveEnabled })
            }}
          />

          {data.passiveEnabled && (
            <>
              <SettingSwitchRow
                id="passive-paused"
                label="Paused"
                description="Temporarily stop recording."
                checked={data.paused}
                disabled={saving}
                onCheckedChange={(paused) => {
                  void updateSettings({ paused })
                }}
              />
              <CaptureModeField
                value={data.passiveMode}
                disabled={saving}
                onChange={(passiveMode) => {
                  void updateSettings({ passiveMode })
                }}
              />
            </>
          )}

          <BlocklistEditor
            entries={data.blocklist}
            draft={newBlocklistEntry}
            disabled={saving}
            onDraftChange={setNewBlocklistEntry}
            onAdd={addBlocklistEntry}
            onRemove={removeBlocklistEntry}
          />
        </div>
      )}
    </section>
  )
}
