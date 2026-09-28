import Link from "next/link"

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 font-sans text-base font-bold tracking-tight whitespace-nowrap text-foreground"
    >
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-coral text-lg leading-none text-foreground"
      >
        ✳
      </span>
      second brain
    </Link>
  )
}
