import { OpenRouterKeySettings } from "@/components/openrouter-key-settings"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <h1 className="font-heading text-5xl tracking-tight sm:text-6xl">
        Settings
      </h1>
      <OpenRouterKeySettings />
    </div>
  )
}
