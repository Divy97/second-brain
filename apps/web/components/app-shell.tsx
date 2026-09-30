"use client"

import {
  HouseIcon,
  ChatCircleDotsIcon,
  GearSixIcon,
  SignOutIcon,
} from "@phosphor-icons/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"

import { PageSkeleton } from "@/components/page-skeleton"
import { Wordmark } from "@/components/wordmark"
import { authClient } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

const navigation = [
  { href: "/home", label: "Home", icon: HouseIcon },
  { href: "/threads", label: "Ask", icon: ChatCircleDotsIcon },
  { href: "/settings", label: "Settings", icon: GearSixIcon },
]

function isCurrentRoute(href: string, pathname: string) {
  return href === "/home"
    ? pathname === "/home" || pathname.startsWith("/items/")
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, isPending } = authClient.useSession()
  const signingOut = useRef(false)

  useEffect(() => {
    if (isPending || session) return
    router.replace(
      signingOut.current
        ? "/sign-in"
        : `/sign-in?next=${encodeURIComponent(pathname)}`
    )
  }, [isPending, session, pathname, router])

  async function signOut() {
    signingOut.current = true
    await authClient.signOut()
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center gap-3 px-5 sm:grid-cols-[1fr_auto_1fr] sm:px-8">
          <Wordmark href="/home" />
          <nav
            className="hidden items-center gap-2 rounded-full bg-secondary p-1.5 sm:flex"
            aria-label="Main"
          >
            {navigation.map(({ href, label, icon: Icon }) => {
              const current = isCurrentRoute(href, pathname)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-card",
                    current &&
                      "bg-primary text-primary-foreground hover:bg-primary"
                  )}
                >
                  <Icon size={18} aria-hidden />
                  {label}
                </Link>
              )
            })}
          </nav>
          <div className="flex size-10 items-center justify-center justify-self-end">
            {session && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Sign out ${session.user.email}`}
                title="Sign out"
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
      <main className="mx-auto w-full max-w-7xl px-5 py-7 pb-28 sm:px-8 sm:py-10">
        {session ? children : <PageSkeleton pathname={pathname} />}
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border bg-card px-3 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] sm:hidden"
        aria-label="Main mobile"
      >
        {navigation.map(({ href, label, icon: Icon }) => {
          const current = isCurrentRoute(href, pathname)
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold",
                current && "bg-primary text-primary-foreground"
              )}
            >
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
