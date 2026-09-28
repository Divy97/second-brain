import Link from "next/link"

export function Wordmark({
  href = "/",
  light = false,
}: {
  href?: string
  light?: boolean
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 font-heading text-xl font-bold tracking-tight ${light ? "text-primary-foreground" : "text-foreground"}`}
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full bg-coral text-xl text-foreground"
      >
        ✳
      </span>
      second brain
    </Link>
  )
}
