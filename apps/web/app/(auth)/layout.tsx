import { Wordmark } from "@/components/wordmark"

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col px-4 pt-16 pb-12 md:pt-24">
      <Wordmark href="/" className="mb-12 self-start" />
      {children}
    </main>
  )
}
