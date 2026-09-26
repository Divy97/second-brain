"use client"

import { MoonIcon, SignOutIcon, SunIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, type ReactNode } from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const navigation = [
  { href: "/", label: "Home" },
  { href: "/settings", label: "Settings" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        setTheme(isDark ? "light" : "dark")
      }}
    >
      <SunIcon className="hidden dark:block" aria-hidden />
      <MoonIcon className="dark:hidden" aria-hidden />
    </Button>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`)
    }
  }, [isPending, session, pathname, router])

  async function signOut() {
    await authClient.signOut()
    router.replace("/sign-in")
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-4 px-4">
          <Link href="/" className="text-sm font-medium tracking-tight">
            Second Brain
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn(
                  "px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  "aria-[current=page]:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {session && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Sign out ${session.user.email}`}
                title={`Sign out ${session.user.email}`}
                onClick={() => {
                  void signOut()
                }}
              >
                <SignOutIcon aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {session ? children : <ShellSkeleton />}
      </main>
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading">
      <div className="h-6 w-40 animate-pulse bg-muted" />
      <div className="h-4 w-72 max-w-full animate-pulse bg-muted" />
      <div className="h-24 w-full animate-pulse bg-muted" />
    </div>
  )
}
