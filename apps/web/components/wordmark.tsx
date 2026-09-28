import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

export function Wordmark({
  href,
  className,
}: {
  href: string
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-display text-xl leading-none font-extrabold tracking-[-0.04em] lowercase",
        className
      )}
    >
      second brain
    </Link>
  )
}
