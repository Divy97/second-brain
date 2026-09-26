import Link from "next/link"

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col px-4 pt-16 pb-12 md:pt-24">
      <Link href="/" className="mb-12 text-sm font-medium tracking-tight">
        Second Brain
      </Link>
      {children}
    </main>
  )
}
