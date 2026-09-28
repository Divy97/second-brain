import { Wordmark } from "@/components/wordmark"

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-[100dvh]">
      <header className="mx-auto flex h-16 max-w-6xl items-center px-5 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-12">
        <div className="max-w-md">
          <p className="mb-4 w-fit rounded-full bg-butter px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
            Welcome in
          </p>
          <h2 className="font-heading text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            A softer place for your{" "}
            <em className="text-coral-ink">thoughts.</em>
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground lg:mt-5 lg:text-base">
            Save what matters now. Find it exactly when you need it.
          </p>
        </div>
        <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-[0_16px_40px_#533c5110] sm:p-8 lg:justify-self-end">
          {children}
        </div>
      </main>
    </div>
  )
}
