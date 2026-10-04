import { Geist, JetBrains_Mono } from "next/font/google"

import "@workspace/ui/globals.css"

const body = Geist({ subsets: ["latin"], variable: "--font-body" })
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" })

const siteUrl = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL)
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : new URL("http://localhost:3000")

const title = "Second Brain"
const description = "A place for everything you want to remember."

export const metadata = {
  metadataBase: siteUrl,
  title: { default: title, template: "%s | Second Brain" },
  description,
  openGraph: {
    title,
    description,
    url: "/",
    siteName: title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable}`}>
      <body>{children}</body>
    </html>
  )
}
