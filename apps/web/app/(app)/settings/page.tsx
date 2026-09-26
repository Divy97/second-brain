import { OpenRouterKeySettings } from "@/components/openrouter-key-settings"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      <OpenRouterKeySettings />
    </div>
  )
}
