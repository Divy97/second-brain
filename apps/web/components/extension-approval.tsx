"use client"

import {
  CheckCircleIcon,
  WarningCircleIcon,
  DevicesIcon,
} from "@phosphor-icons/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

import { apiRequest, ApiError } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { describeApiError } from "@/lib/describe-api-error"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

const permissions = [
  "Save pages you visit or capture manually",
  "Manage your capture settings (passive mode, blocklist)",
  "See which pages are stored, waiting to be indexed",
] as const

interface AuthorizeResponse {
  redirectTo: string
}

export function ExtensionApproval() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, isPending } = authClient.useSession()

  const label = searchParams.get("label")
  const codeChallenge = searchParams.get("code_challenge")
  const redirectUri = searchParams.get("redirect_uri")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasRequiredParams = label && codeChallenge && redirectUri
  const isValidChallenge =
    codeChallenge && /^[A-Za-z0-9_-]{43}$/.test(codeChallenge)
  const isValid = hasRequiredParams && isValidChallenge

  useEffect(() => {
    if (isPending) return
    if (!session) {
      const returnUrl = `/extension/authorize?${searchParams.toString()}`
      router.replace(`/sign-in?next=${encodeURIComponent(returnUrl)}`)
    }
  }, [isPending, session, router, searchParams])

  async function handleApprove() {
    if (!isValid) return
    setSubmitting(true)
    setError(null)

    try {
      const response = await apiRequest<AuthorizeResponse>(
        "/extension/authorize",
        {
          method: "POST",
          json: { label, codeChallenge, redirectUri },
        }
      )
      window.location.href = response.redirectTo
    } catch (err) {
      setError(
        err instanceof ApiError
          ? describeApiError(err)
          : "Connection failed. Try again."
      )
      setSubmitting(false)
    }
  }

  function handleCancel() {
    router.push("/home")
  }

  if (isPending || !session) {
    return (
      <div
        role="status"
        aria-label="Loading"
        aria-busy
        className="flex flex-col gap-4"
      >
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (!isValid) {
    return (
      <Alert variant="destructive">
        <WarningCircleIcon aria-hidden />
        <AlertDescription>
          Invalid connection request. The extension may be outdated or the link
          is broken.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <DevicesIcon size={32} className="text-primary" aria-hidden />
        <h1 className="font-heading text-2xl tracking-tight sm:text-3xl">
          Connect Extension
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground">
            This browser extension wants to connect to your Second Brain.
          </p>
          <div className="flex flex-col gap-2">
            <p className="font-medium">It will be able to:</p>
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {permissions.map((permission) => (
                <li key={permission} className="flex items-start gap-2">
                  <CheckCircleIcon
                    size={18}
                    className="mt-0.5 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span>{permission}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            It will <strong>not</strong> be able to read your notes, ask
            questions, or access your API keys.
          </p>
        </CardContent>
        <CardFooter className="flex gap-3">
          <Button
            onClick={() => {
              void handleApprove()
            }}
            disabled={submitting}
          >
            {submitting ? "Connecting…" : "Approve"}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>

      {error && (
        <Alert variant="destructive">
          <WarningCircleIcon aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  )
}
