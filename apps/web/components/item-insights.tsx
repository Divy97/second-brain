import { Badge } from "@workspace/ui/components/badge"

import type { ItemDetail } from "@/lib/items-api"

const languageNames = new Intl.DisplayNames(undefined, { type: "language" })

function languageName(code: string): string {
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

function differsBeyondWhitespace(a: string, b: string): boolean {
  return collapseWhitespace(a) !== collapseWhitespace(b)
}

export function ItemInsights({ item }: { item: ItemDetail }) {
  if (item.summary === null) return null
  return (
    <div className="flex flex-col gap-8">
      <section
        className="flex flex-col gap-2"
        aria-labelledby="summary-heading"
      >
        <h2 id="summary-heading" className="text-sm font-medium">
          Summary
        </h2>
        <p className="max-w-[65ch] text-base leading-relaxed md:text-sm">
          {item.summary}
        </p>
      </section>

      {item.cleanText &&
        differsBeyondWhitespace(item.cleanText, item.rawText) && (
          <section
            className="flex flex-col gap-2"
            aria-labelledby="clean-heading"
          >
            <h2 id="clean-heading" className="text-sm font-medium">
              Cleaned text
            </h2>
            <p className="text-base leading-relaxed break-words whitespace-pre-wrap md:text-sm">
              {item.cleanText}
            </p>
            <p className="text-xs text-muted-foreground">
              Dictation and typing errors corrected for search. Your original is
              kept above.
            </p>
          </section>
        )}

      <dl className="grid grid-cols-1 gap-x-8 gap-y-5 text-sm sm:grid-cols-[max-content_1fr]">
        {item.language && (
          <>
            <dt className="text-muted-foreground">Language</dt>
            <dd>{languageName(item.language)}</dd>
          </>
        )}
        {item.tags.length > 0 && (
          <>
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </dd>
          </>
        )}
        {item.entities.length > 0 && (
          <>
            <dt className="text-muted-foreground">Mentions</dt>
            <dd className="flex flex-wrap gap-x-4 gap-y-1">
              {item.entities.map((entity) => (
                <span key={`${entity.type}:${entity.name}`}>
                  {entity.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    {entity.type}
                  </span>
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
