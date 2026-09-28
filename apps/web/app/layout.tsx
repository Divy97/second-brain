import { Fraunces, Geist, JetBrains_Mono } from "next/font/google"

import "@workspace/ui/globals.css"

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" })
const body = Geist({ subsets: ["latin"], variable: "--font-body" })
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" })

export const metadata = {
  title: { default: "Second Brain", template: "%s | Second Brain" },
  description: "A place for everything you want to remember.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${code.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
