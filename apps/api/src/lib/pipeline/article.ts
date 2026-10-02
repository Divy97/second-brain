import { createJina, JinaError, type JinaArticle } from "@workspace/ai"

import { assemble, type Extraction } from "./extraction.js"
import { safeArticleUrl } from "../article-url.js"
import { PipelineFailure } from "./failures.js"

import type { OperatorService } from "../paid-service.js"

export interface ArticleRequest {
  sourceUrl: string
  note: string | null
  readerService?: OperatorService | null
  fetchPage?: typeof fetch
  renderPage?: (url: string) => Promise<string | null>
}

const blockedWords =
  /\b(log in|login|sign in|subscribe|members only|paywall)\b/i

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  })
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

export async function extractArticle({
  sourceUrl,
  note,
  readerService = null,
  fetchPage = fetch,
  renderPage,
}: ArticleRequest): Promise<Extraction> {
  const refused = { byAllowance: false }
  const read = async (): Promise<JinaArticle | null> => {
    if (!readerService) return null
    if (!(await readerService.spend())) {
      refused.byAllowance = true
      return null
    }
    return readWithReader(sourceUrl, readerService.apiKey, fetchPage)
  }
  // renderPage never throws past its own boundary (browserRenderPage guarantees this);
  // a null result (not configured, or any failure) is the only outcome to handle here.
  const render = (): Promise<string | null> =>
    renderPage ? renderPage(sourceUrl) : Promise.resolve(null)

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

  const parsed = await parseHtml(response)
  if (response.ok && !isThin(parsed)) {
    return {
      text: assemble([
        note,
        sourceUrl,
        parsed.title,
        parsed.description,
        parsed.text,
      ]),
      quality: "full",
    }
  }

  const rendered = await render()
  const viaRender = rendered ? await parseHtml(htmlResponse(rendered)) : null
  if (viaRender && !isThin(viaRender)) {
    return {
      text: assemble([
        note,
        sourceUrl,
        viaRender.title,
        viaRender.description,
        viaRender.text,
      ]),
      quality: "full",
    }
  }
  // The render attempt (even if still thin) can carry a better title/description than
  // the original fetch, so later fallbacks prefer whichever parse has one.
  const best = viaRender ?? parsed

  const viaReader = await read()
  if (viaReader) {
    return fullFromReader(
      note,
      sourceUrl,
      viaReader,
      best.title,
      best.description
    )
  }

  return {
    text: assemble([note, sourceUrl, best.title, best.description]),
    quality: "partial",
    ...(refused.byAllowance
      ? { partialReason: "allowance_used" as const }
      : {}),
  }
}

const isWall = (status: number) => status === 401 || status === 403

// Empty text catches a JS single-page app that rendered nothing server-side, even
// with no blocked wording; a page can be thin for either reason.
function isThin({
  title,
  description,
  text,
}: {
  title: string
  description: string
  text: string
}): boolean {
  return (
    text.trim().length === 0 ||
    blockedWords.test([title, description, text].join(" "))
  )
}

function fullFromReader(
  note: string | null,
  sourceUrl: string,
  article: JinaArticle,
  title = "",
  description = ""
): Extraction {
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
  apiKey: string,
  fetchPage: typeof fetch
): Promise<JinaArticle | null> {
  try {
    const article = await createJina({
      apiKey,
      fetch: fetchPage,
    }).read(sourceUrl)
    return article.content.trim() ? article : null
  } catch (error) {
    if (error instanceof JinaError) {
      console.error("reader service failed", error.status)
      return null
    }
    throw error
  }
}
