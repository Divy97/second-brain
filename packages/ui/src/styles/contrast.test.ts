import { readFileSync } from "node:fs"

import { expect, test } from "vitest"

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8")

function channel(value: string, index: number) {
  const component = parseInt(value.slice(index, index + 2), 16) / 255
  return component <= 0.04045
    ? component / 12.92
    : ((component + 0.055) / 1.055) ** 2.4
}

function color(name: string): [number, number, number] {
  const value = new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(css)?.[1]
  if (!value) throw new Error(`Missing color: ${name}`)
  return [channel(value, 1), channel(value, 3), channel(value, 5)]
}

function luminance(name: string) {
  const [red, green, blue] = color(name)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test("body and accent text stay readable on the palette", () => {
  for (const background of [
    "background",
    "card",
    "color-butter",
    "color-lilac",
    "color-mint",
  ]) {
    expect(contrast("muted-foreground", background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast("color-coral-ink", background)).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrast("foreground", "color-coral")).toBeGreaterThanOrEqual(4.5)
  expect(contrast("primary-foreground", "primary")).toBeGreaterThanOrEqual(4.5)
})
