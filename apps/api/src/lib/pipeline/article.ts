import { createJina, JinaError, type JinaArticle } from "@workspace/ai"

import { safeArticleUrl } from "../article-url.js"
import { PipelineFailure } from "./failures.js"

export interface ArticleExtraction {
  text: string
  quality: "full" | "partial"
}

export interface ArticleRequest {
  sourceUrl: string
  note: string | null
  readerKey?: string | null
  fetchPage?: typeof fetch
}

const blockedWords =
  /\b(log in|login|sign in|subscribe|members only|paywall)\b/i

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function assemble(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n")
}

async function parseHtml(response: Response) {
  let title = ""
  let description = ""
  let article = ""
  let body = ""
  let inArticle = false
  const parsed = new HTMLRewriter()
    .on("title", {
      text(text) {
        title += text.text
      },
    })
    .on('meta[name="description"], meta[property="og:description"]', {
      element(element) {
        description ||= element.getAttribute("content") ?? ""
      },
    })
    .on("article", {
      element() {
        inArticle = true
      },
      text(text) {
        article += ` ${text.text}`
      },
    })
    .on("article *", {
      text(text) {
        article += ` ${text.text}`
      },
    })
    .on("body *", {
      text(text) {
        if (!inArticle) body += ` ${text.text}`
      },
    })
    .transform(response)
  await parsed.arrayBuffer()
  return {
    title: compact(title),
    description: compact(description),
    text: compact(article || body),
  }
}

async function fetchSafe(
  sourceUrl: string,
  fetchPage: typeof fetch
): Promise<Response> {
  let url = sourceUrl
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetchPage(url, {
      headers: { accept: "text/markdown,text/html,text/plain;q=0.8" },
      redirect: "manual",
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get("location")
    if (!location) return response
    const next = safeArticleUrl(new URL(location, url).toString())
    if (!next) {
      throw new PipelineFailure(
        "processing_error",
        "The page redirected to an unsafe URL.",
        true
      )
    }
    url = next
  }
  throw new PipelineFailure(
    "processing_error",
    "The page redirected too many times.",
    false
  )
}

// spec.md §4.1 step 3 (Browser Run for JS-rendered pages) is not built yet, so the
// ladder runs fetch, then parsed HTML, then the reader API. A page still walled after
// those is kept partial: title and note only, never invented article text.
export async function extractArticle({
  sourceUrl,
  note,
  readerKey = null,
  fetchPage = fetch,
}: ArticleRequest): Promise<ArticleExtraction> {
  const read = (): Promise<JinaArticle | null> =>
    readWithReader(sourceUrl, readerKey, fetchPage)

  let response: Response | null = null
  try {
    response = await fetchSafe(sourceUrl, fetchPage)
  } catch (error) {
    if (error instanceof PipelineFailure) throw error
  }

  // A wall the fetch could not get past at all still has the reader as a way through,
  // so the key is consulted before the capture is called unfetchable.
  if (!response || (!response.ok && !isWall(response.status))) {
    const rescued = await read()
    if (rescued) return fullFromReader(note, sourceUrl, rescued)
    throw new PipelineFailure(
      "processing_error",
      "The page could not be fetched. Retry later.",
      false
    )
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (/text\/(markdown|plain)/i.test(contentType)) {
    return {
      text: assemble([note, sourceUrl, await response.text()]),
      quality: "full",
    }
  }

  const { title, description, text } = await parseHtml(response)
  if (response.ok && !blockedWords.test([title, description, text].join(" "))) {
    return {
      text: assemble([note, sourceUrl, title, description, text]),
      quality: "full",
    }
  }

  const viaReader = await read()
  if (viaReader) {
    return fullFromReader(note, sourceUrl, viaReader, title, description)
  }

  return {
    text: assemble([note, sourceUrl, title, description]),
    quality: "partial",
  }
}

const isWall = (status: number) => status === 401 || status === 403

function fullFromReader(
  note: string | null,
  sourceUrl: string,
  article: JinaArticle,
  title = "",
  description = ""
): ArticleExtraction {
  return {
    text: assemble([
      note,
      sourceUrl,
      article.title || title,
      article.description || description,
      article.content,
    ]),
    quality: "full",
  }
}

async function readWithReader(
  sourceUrl: string,
  readerKey: string | null,
  fetchPage: typeof fetch
): Promise<JinaArticle | null> {
  if (!readerKey) return null
  try {
    const article = await createJina({
      apiKey: readerKey,
      fetch: fetchPage,
    }).read(sourceUrl)
    return article.content.trim() ? article : null
  } catch (error) {
    // A rejected key is the user's to fix, so it surfaces as a retryable failure.
    // A reader that is merely down leaves the item partial instead.
    if (error instanceof JinaError) {
      if (error.status === 401) {
        throw new PipelineFailure(
          "invalid_key",
          "The reader key was rejected. Update it in settings and retry.",
          true
        )
      }
      return null
    }
    throw error
  }
}
