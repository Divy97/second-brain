export interface ExtractionStub {
  calls: Request[]
  acceptKeys: (keys: string[]) => void
  breakProvider: (provider: "supadata" | "jina") => void
  readerReturns: (url: string, content: string) => void
  restore: () => void
}

const HOSTS = { supadata: "api.supadata.ai", jina: "r.jina.ai" } as const

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

/**
 * Stubs Supadata and Jina Reader. Layers over whatever fetch is already installed,
 * so it composes with stubOpenRouter when created after it and restored before it.
 */
export function stubExtractionProviders(): ExtractionStub {
  const calls: Request[] = []
  const accepted = new Set<string>()
  const broken = new Set<string>()
  const readerContent = new Map<string, string>()
  const innerFetch = globalThis.fetch

  function answerSupadata(outgoing: Request): Response {
    if (broken.has("supadata")) return json(500, { error: "server-error" })
    const key = outgoing.headers.get("x-api-key")
    if (!key || !accepted.has(key)) {
      return json(401, { error: "unauthorized", message: "Unauthorized" })
    }
    return json(200, {
      organizationId: "org-stub",
      plan: "free",
      maxCredits: 100,
      usedCredits: 7,
    })
  }

  function answerJina(outgoing: Request): Response {
    if (broken.has("jina")) return json(503, {})
    const key = outgoing.headers.get("authorization")?.replace(/^Bearer /, "")
    if (!key || !accepted.has(key)) {
      return json(401, {
        code: 401,
        name: "AuthenticationFailedError",
        status: 40102,
        message: "Invalid API key",
      })
    }
    const target = outgoing.url.slice(`https://${HOSTS.jina}/`.length)
    return json(200, {
      code: 200,
      status: 20000,
      data: {
        title: `Reader title for ${target}`,
        description: "",
        url: target,
        content: readerContent.get(target) ?? "",
      },
    })
  }

  // Assigned rather than spied so it layers predictably over stubOpenRouter.
  globalThis.fetch = async (input, init) => {
    const outgoing = new Request(input, init)
    const { hostname } = new URL(outgoing.url)
    if (hostname !== HOSTS.supadata && hostname !== HOSTS.jina) {
      return innerFetch(input, init)
    }
    calls.push(outgoing.clone())
    return hostname === HOSTS.supadata
      ? answerSupadata(outgoing)
      : answerJina(outgoing)
  }

  return {
    calls,
    acceptKeys: (keys) => {
      for (const key of keys) accepted.add(key)
    },
    breakProvider: (provider) => broken.add(provider),
    readerReturns: (url, content) => readerContent.set(url, content),
    restore: () => {
      globalThis.fetch = innerFetch
    },
  }
}

export const testTranscriptKey = "sd_test_transcript_key_9999"
export const testReaderKey = "jina_test_reader_key_8888"
