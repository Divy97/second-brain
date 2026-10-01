import { CaptureSettings } from "@/components/capture-settings"
import { DeviceSettings } from "@/components/device-settings"
import { KeySettingsList } from "@/components/key-settings-list"
import { Separator } from "@workspace/ui/components/separator"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
        Settings
      </h1>
      <KeySettingsList />
      <Separator />
      <DeviceSettings />
      <Separator />
      <CaptureSettings />
    </div>
  )
}
