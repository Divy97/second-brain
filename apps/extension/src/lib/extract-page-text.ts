// Runs inside the page through scripting.executeScript, so it is serialised on its own:
// it cannot reference anything outside this function.
export function extractPageText(): string {
  const clone = document.body.cloneNode(true) as HTMLElement

  const noise = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "[aria-hidden='true']",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    ".ad",
    ".advertisement",
    ".sidebar",
    ".comments",
  ]
  for (const selector of noise) {
    for (const element of clone.querySelectorAll(selector)) element.remove()
  }

  const main =
    clone.querySelector("main") ??
    clone.querySelector("article") ??
    clone.querySelector("[role='main']") ??
    clone

  return (main.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100_000)
}
