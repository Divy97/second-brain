import { Wordmark } from "@/components/wordmark"

export default function ExtensionLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 py-8 sm:px-8">
        {children}
      </main>
    </div>
  )
}
