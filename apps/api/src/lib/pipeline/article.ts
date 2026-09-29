import { createJina, JinaError } from "@workspace/ai"

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

// Ladder: markdown response, then parsed HTML, then the reader API on the user's
// optional key. A page still walled after all three is kept partial, never invented.
export async function extractArticle({
  sourceUrl,
  note,
  readerKey = null,
  fetchPage = fetch,
}: ArticleRequest): Promise<ArticleExtraction> {
  let response: Response
  try {
    response = await fetchSafe(sourceUrl, fetchPage)
  } catch {
    throw new PipelineFailure(
      "processing_error",
      "The page could not be fetched. Retry later.",
      false
    )
  }

  if (!response.ok && response.status !== 401 && response.status !== 403) {
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
  const blocked =
    !response.ok || blockedWords.test([title, description, text].join(" "))
  if (!blocked) {
    return {
      text: assemble([note, sourceUrl, title, description, text]),
      quality: "full",
    }
  }

  const viaReader = await readWithReader(sourceUrl, readerKey, fetchPage)
  if (viaReader) {
    return {
      text: assemble([
        note,
        sourceUrl,
        viaReader.title || title,
        viaReader.description || description,
        viaReader.content,
      ]),
      quality: "full",
    }
  }

  return {
    text: assemble([note, sourceUrl, title, description]),
    quality: "partial",
  }
}

async function readWithReader(
  sourceUrl: string,
  readerKey: string | null,
  fetchPage: typeof fetch
) {
  if (!readerKey) return null
  try {
    const article = await createJina({
      apiKey: readerKey,
      fetch: fetchPage,
    }).read(sourceUrl)
    return article.content.trim() ? article : null
  } catch (error) {
    // A reader that is down or rejects the key leaves the item partial and retryable,
    // rather than failing a capture that already has a title to show.
    if (error instanceof JinaError) return null
    throw error
  }
}
