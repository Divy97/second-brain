import { OpenRouterKeySettings } from "@/components/openrouter-key-settings"

export const metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7">
      <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
        Settings
      </h1>
      <OpenRouterKeySettings />
    </div>
  )
}
