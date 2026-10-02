"use client"

import { TrashIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { useState } from "react"
import useSWR from "swr"

import { DeviceKeyCreator } from "@/components/device-key-creator"
import { describeApiError } from "@/lib/describe-api-error"
import {
  devicesPath,
  fetchDevices,
  revokeDevice,
  type Device,
  type DevicesResponse,
} from "@/lib/devices-api"
import { formatRelativeDate } from "@/lib/format-date"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function DeviceSettings() {
  const { data, error, isLoading, mutate } = useSWR<DevicesResponse, Error>(
    devicesPath,
    fetchDevices
  )
  const [revoking, setRevoking] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const devices = data?.apiKeys ?? []

  async function handleRevoke(device: Device) {
    setRevoking(device.id)
    setRevokeError(null)

    try {
      await revokeDevice(device.id)
      await mutate()
    } catch (err) {
      setRevokeError(
        err instanceof Error ? describeApiError(err) : "Failed to disconnect"
      )
    } finally {
      setRevoking(null)
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="devices-heading">
      <div className="flex flex-col gap-2">
        <h2 id="devices-heading" className="font-heading text-2xl">
          Connected Devices
        </h2>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Browser extensions connected to your Second Brain. Create a key for
          each browser or profile, and disconnect a device if you no longer use
          it or it was lost.
        </p>
      </div>

      <div>
        <DeviceKeyCreator onCreated={mutate} />
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading devices"
          aria-busy
          className="animate-pulse space-y-4 rounded-2xl bg-card p-5 sm:p-7"
        >
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-10 rounded-lg bg-muted" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{describeApiError(error)}</AlertDescription>
        </Alert>
      )}

      {revokeError && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{revokeError}</AlertDescription>
        </Alert>
      )}

      {data && devices.length === 0 && (
        <p className="rounded-2xl bg-card p-5 text-sm leading-relaxed text-muted-foreground sm:p-7">
          No devices connected. Create a device key and paste it into the
          extension.
        </p>
      )}

      {data && devices.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-2xl bg-card p-5 sm:p-7">
          {devices.map((device) => {
            const name = device.name ?? "Unknown device"
            return (
              <li
                key={device.id}
                className="flex flex-col items-start gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-base font-medium break-words">{name}</p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Connected {formatRelativeDate(new Date(device.createdAt))}
                    </span>
                    <span>
                      {device.lastRequest
                        ? `Last used ${formatRelativeDate(new Date(device.lastRequest))}`
                        : "Never used"}
                    </span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 max-sm:-ml-4"
                  onClick={() => {
                    void handleRevoke(device)
                  }}
                  disabled={revoking === device.id}
                  aria-label={`Disconnect ${name}`}
                >
                  {revoking === device.id ? (
                    "Disconnecting"
                  ) : (
                    <>
                      <TrashIcon aria-hidden />
                      Disconnect
                    </>
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
