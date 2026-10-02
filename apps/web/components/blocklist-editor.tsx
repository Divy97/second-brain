import { XIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

interface BlocklistEditorProps {
  entries: string[]
  draft: string
  disabled: boolean
  onDraftChange: (draft: string) => void
  onAdd: () => void
  onRemove: (hostname: string) => void
}

export function BlocklistEditor({
  entries,
  draft,
  disabled,
  onDraftChange,
  onAdd,
  onRemove,
}: BlocklistEditorProps) {
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="blocklist-entry" className="text-base font-medium">
          Blocklist
        </Label>
        <p
          id="blocklist-description"
          className="text-sm leading-relaxed text-muted-foreground"
        >
          Sites that are never captured. Add banking, email, or other sensitive
          sites here.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          id="blocklist-entry"
          type="text"
          placeholder="example.com"
          value={draft}
          aria-describedby="blocklist-description"
          onChange={(event) => {
            onDraftChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              onAdd()
            }
          }}
          disabled={disabled}
        />
        <Button
          variant="outline"
          size="lg"
          onClick={onAdd}
          disabled={disabled || !draft.trim()}
          aria-label="Add to blocklist"
        >
          Add
        </Button>
      </div>

      {entries.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {entries.map((hostname) => (
            <li
              key={hostname}
              className="flex h-9 items-center gap-1 rounded-full bg-secondary pr-1 pl-4 text-sm"
            >
              {hostname}
              <button
                type="button"
                onClick={() => {
                  onRemove(hostname)
                }}
                disabled={disabled}
                className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label={`Remove ${hostname}`}
              >
                <XIcon size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No sites blocked. Default sensitive sites (banking, email) are always
          skipped.
        </p>
      )}
    </div>
  )
}
