import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const stylesheet = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8"
)

interface Oklch { lightness: number; chroma: number; hue: number }

function readThemeTokens(selector: string): Map<string, Oklch> {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(stylesheet)
  if (!block?.[1]) throw new Error(`No ${selector} block in globals.css`)
  const tokens = new Map<string, Oklch>()
  for (const match of block[1].matchAll(
    /--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g
  )) {
    const [, name, lightness, chroma, hue] = match
    if (!name || !lightness || !chroma || !hue) continue
    tokens.set(name, {
      lightness: Number(lightness),
      chroma: Number(chroma),
      hue: Number(hue),
    })
  }
  return tokens
}

function relativeLuminance({ lightness, chroma, hue }: Oklch): number {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel))
  const red = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const green = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const blue = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrastRatio(first: Oklch, second: Oklch): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

const textPairs: [foreground: string, background: string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["brand-foreground", "brand"],
  ["brand-ink", "background"],
  ["brand-ink", "card"],
  ["destructive", "background"],
  ["destructive", "card"],
]

const nonTextPairs: [element: string, background: string][] = [
  ["ring", "background"],
  ["ring", "card"],
  ["brand-edge", "background"],
]

describe.each([
  ["light", ":root"],
  ["dark", "\\.dark"],
])("%s theme tokens", (_theme, selector) => {
  const tokens = readThemeTokens(selector)
  const token = (name: string) => {
    const value = tokens.get(name)
    if (!value) throw new Error(`Token --${name} is missing`)
    return value
  }

  it.each(textPairs)(
    "%s on %s meets WCAG AA for text (4.5:1)",
    (foreground, background) => {
      expect(
        contrastRatio(token(foreground), token(background))
      ).toBeGreaterThanOrEqual(4.5)
    }
  )

  it.each(nonTextPairs)(
    "%s against %s meets WCAG AA for UI components (3:1)",
    (element, background) => {
      expect(
        contrastRatio(token(element), token(background))
      ).toBeGreaterThanOrEqual(3)
    }
  )

  it("uses no pure black or pure white", () => {
    for (const [name, value] of tokens) {
      expect(value.lightness, `--${name}`).toBeGreaterThan(0)
      expect(value.lightness, `--${name}`).toBeLessThan(1)
    }
  })
})
