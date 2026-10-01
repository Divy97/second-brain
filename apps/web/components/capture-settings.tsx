"use client"

import {
  GlobeIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useState } from "react"
import useSWR from "swr"

import {
  captureSettingsPath,
  fetchCaptureSettings,
  saveCaptureSettings,
  type CaptureSettings as CaptureSettingsType,
} from "@/lib/capture-settings-api"
import { describeApiError } from "@/lib/describe-api-error"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

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
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <GlobeIcon size={24} className="text-primary" aria-hidden />
        <h2 className="font-heading text-xl tracking-tight">
          Capture Settings
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Control how the browser extension captures pages. These settings apply
        to all connected devices.
      </p>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading settings"
          aria-busy
          className="animate-pulse space-y-3"
        >
          <div className="h-32 rounded-xl bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
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
        <>
          <Card>
            <CardHeader>
              <CardTitle>Passive Capture</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="passive-enabled">
                    Record pages as you browse
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically save pages you spend time reading
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="passive-enabled"
                  checked={data.passiveEnabled}
                  onChange={(e) => {
                    void updateSettings({ passiveEnabled: e.target.checked })
                  }}
                  disabled={saving}
                  className="size-5 accent-primary"
                />
              </div>

              {data.passiveEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="passive-paused">Paused</Label>
                      <p className="text-xs text-muted-foreground">
                        Temporarily stop recording
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      id="passive-paused"
                      checked={data.paused}
                      onChange={(e) => {
                        void updateSettings({ paused: e.target.checked })
                      }}
                      disabled={saving}
                      className="size-5 accent-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="passive-mode">
                      When a page is captured
                    </Label>
                    <select
                      id="passive-mode"
                      value={data.passiveMode}
                      onChange={(e) => {
                        void updateSettings({
                          passiveMode: e.target.value as "index" | "store",
                        })
                      }}
                      disabled={saving}
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    >
                      <option value="store">Store for later review</option>
                      <option value="index">Index immediately</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {data.passiveMode === "store"
                        ? "Stored pages appear in your Stored list. Index them later to make them searchable."
                        : "Pages are immediately searchable in Ask. This uses more of your daily allowance."}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blocklist</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Sites that are never captured. Add banking, email, or other
                sensitive sites here.
              </p>

              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="example.com"
                  value={newBlocklistEntry}
                  onChange={(e) => {
                    setNewBlocklistEntry(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addBlocklistEntry()
                    }
                  }}
                  disabled={saving}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={addBlocklistEntry}
                  disabled={saving || !newBlocklistEntry.trim()}
                  aria-label="Add to blocklist"
                >
                  <PlusIcon aria-hidden />
                </Button>
              </div>

              {data.blocklist.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {data.blocklist.map((hostname) => (
                    <li
                      key={hostname}
                      className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                    >
                      {hostname}
                      <button
                        onClick={() => {
                          removeBlocklistEntry(hostname)
                        }}
                        disabled={saving}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                        aria-label={`Remove ${hostname}`}
                      >
                        <TrashIcon size={14} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {data.blocklist.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  No sites blocked. Default sensitive sites (banking, email) are
                  always skipped.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
