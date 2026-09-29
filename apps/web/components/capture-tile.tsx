import type { Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

export const captureTileClass =
  "group flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background/60 px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted focus-within:ring-2 focus-within:ring-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 has-disabled:cursor-not-allowed has-disabled:opacity-60"

export function CaptureTileContent({
  icon: TileIcon,
  label,
  hint,
  tone = "calm",
}: {
  icon: Icon
  label: string
  hint: ReactNode
  tone?: "calm" | "live"
}) {
  return (
    <>
      <span
        className={
          tone === "live"
            ? "grid size-12 place-items-center rounded-full bg-coral text-foreground"
            : "grid size-12 place-items-center rounded-full bg-lilac text-foreground transition-transform group-hover:scale-105"
        }
      >
        <TileIcon className="size-5" weight="bold" aria-hidden />
      </span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </>
  )
}
