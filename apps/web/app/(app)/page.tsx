import { KeyReminder } from "@/components/key-reminder"

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-medium tracking-tight">Home</h1>
      <KeyReminder />
    </div>
  )
}
