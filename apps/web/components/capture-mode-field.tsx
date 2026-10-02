import { Label } from "@workspace/ui/components/label"

import type { CaptureSettings } from "@/lib/capture-settings-api"

type PassiveMode = CaptureSettings["passiveMode"]

const options: { value: PassiveMode; label: string }[] = [
  { value: "store", label: "Store for later" },
  { value: "index", label: "Index immediately" },
]

const explanations: Record<PassiveMode, string> = {
  store:
    "Stored pages appear in your Stored list. Index them later to make them searchable.",
  index:
    "Pages are immediately searchable in Ask. This uses more of your daily allowance.",
}

interface CaptureModeFieldProps {
  value: PassiveMode
  disabled: boolean
  onChange: (mode: PassiveMode) => void
}

export function CaptureModeField({
  value,
  disabled,
  onChange,
}: CaptureModeFieldProps) {
  return (
    <div
      role="radiogroup"
      aria-labelledby="capture-mode-label"
      className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0"
    >
      <Label id="capture-mode-label" className="text-base font-medium">
        When a page is captured
      </Label>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 sm:inline-grid sm:self-start">
        {options.map((option) => (
          <label
            key={option.value}
            className="relative flex h-10 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50 sm:px-5"
          >
            <input
              type="radio"
              name="passive-mode"
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => {
                onChange(option.value)
              }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {explanations[value]}
      </p>
    </div>
  )
}
