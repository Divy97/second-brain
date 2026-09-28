import { Wordmark } from "@/components/wordmark"

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-7xl gap-8 px-5 py-6 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-20">
      <div className="flex flex-col gap-8 lg:gap-24">
        <Wordmark />
        <div>
          <p className="mb-5 w-fit rotate-[-3deg] rounded-full bg-butter px-4 py-2 text-xs font-bold tracking-widest uppercase">
            Welcome in
          </p>
          <h2 className="max-w-xl font-heading text-3xl leading-[1.05] tracking-tight sm:text-7xl">
            A softer place for your{" "}
            <em className="text-coral-ink">thoughts.</em>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground lg:mt-6 lg:text-lg">
            Save what matters now. Find it exactly when you need it.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md rounded-[2rem] bg-card p-7 shadow-[0_20px_70px_#533c5112] sm:p-10">
        {children}
      </div>
    </main>
  )
}
