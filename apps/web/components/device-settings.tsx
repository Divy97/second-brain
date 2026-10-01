"use client"

import {
  DevicesIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useState } from "react"
import useSWR from "swr"

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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

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
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <DevicesIcon size={24} className="text-primary" aria-hidden />
        <h2 className="font-heading text-xl tracking-tight">
          Connected Devices
        </h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Browser extensions connected to your Second Brain. Disconnect a device
        if you no longer use it or if it was lost.
      </p>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading devices"
          aria-busy
          className="animate-pulse space-y-3"
        >
          <div className="h-20 rounded-xl bg-muted" />
          <div className="h-20 rounded-xl bg-muted" />
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
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No devices connected. Install the browser extension to start.
          </CardContent>
        </Card>
      )}

      {data && devices.length > 0 && (
        <div className="flex flex-col gap-3">
          {devices.map((device) => (
            <Card key={device.id} size="sm">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{device.name ?? "Unknown device"}</CardTitle>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => {
                    void handleRevoke(device)
                  }}
                  disabled={revoking === device.id}
                  aria-label={`Disconnect ${device.name}`}
                >
                  {revoking === device.id ? (
                    "Disconnecting…"
                  ) : (
                    <>
                      <TrashIcon aria-hidden />
                      Disconnect
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex gap-1.5">
                    <dt>Connected:</dt>
                    <dd>{formatRelativeDate(new Date(device.createdAt))}</dd>
                  </div>
                  {device.lastRequest && (
                    <div className="flex gap-1.5">
                      <dt>Last used:</dt>
                      <dd>
                        {formatRelativeDate(new Date(device.lastRequest))}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
