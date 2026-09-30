"use client"

import { ListIcon, XIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"

import { Wordmark } from "@/components/wordmark"

export function PublicHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="relative z-20 flex h-16 items-center justify-between gap-4">
      <Wordmark />
      <nav className="hidden items-center gap-6 sm:flex" aria-label="Main">
        <Link href="/sign-in" className="text-sm font-medium hover:underline">
          Sign in
        </Link>
        <Link
          href="/sign-up"
          className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Get started
        </Link>
      </nav>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => {
          setOpen(!open)
        }}
        className="grid size-11 place-items-center rounded-full border border-border bg-card sm:hidden"
      >
        {open ? (
          <XIcon size={21} aria-hidden />
        ) : (
          <ListIcon size={21} aria-hidden />
        )}
      </button>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile"
          className="content-enter absolute inset-x-0 top-full grid gap-2 rounded-2xl border border-border bg-card p-3 shadow-md sm:hidden"
        >
          <Link href="/sign-in" className="rounded-xl px-4 py-3 font-medium">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground"
          >
            Get started
          </Link>
        </nav>
      )}
    </header>
  )
}
