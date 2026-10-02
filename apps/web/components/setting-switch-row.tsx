import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

interface SettingSwitchRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}

export function SettingSwitchRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SettingSwitchRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-base font-medium">
          {label}
        </Label>
        <p
          id={`${id}-description`}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}
