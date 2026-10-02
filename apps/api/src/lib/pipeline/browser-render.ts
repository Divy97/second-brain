// Leaves room under Browser Run's 60s session timeout for the Defuddle-style parse after.
const GOTO_TIMEOUT_MS = 45_000

export function browserRenderPage(
  env: Env
): (url: string) => Promise<string | null> {
  return async (url) => {
    try {
      const response = await env.BROWSER.quickAction("content", {
        url,
        gotoOptions: { timeout: GOTO_TIMEOUT_MS, waitUntil: "networkidle0" },
      })
      if (!response.ok) return null
      const body = await response.json<
        { success: true; result: string } | { success: false }
      >()
      return body.success ? body.result : null
    } catch (error) {
      console.error("browser render failed", error)
      return null
    }
  }
}
