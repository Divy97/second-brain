"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { authClient } from "@/lib/auth-client"

export function LandingRedirect() {
  const router = useRouter()
  const { data: session } = authClient.useSession()
  useEffect(() => {
    if (session) router.replace("/home")
  }, [session, router])
  return null
}
