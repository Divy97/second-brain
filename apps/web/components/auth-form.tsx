"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type SubmitEvent } from "react"

import { authClient, describeAuthError } from "@/lib/auth-client"
import { formText } from "@/lib/form-text"
import { safeNextPath } from "@/lib/safe-next-path"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

type Mode = "sign-in" | "sign-up"

const textByMode: Record<
  Mode,
  {
    title: string
    submit: string
    pending: string
    switchPrompt: string
    switchLabel: string
    switchHref: string
  }
> = {
  "sign-in": {
    title: "Sign in",
    submit: "Sign in",
    pending: "Signing in",
    switchPrompt: "New here?",
    switchLabel: "Create an account",
    switchHref: "/sign-up",
  },
  "sign-up": {
    title: "Create your account",
    submit: "Create account",
    pending: "Creating account",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/sign-in",
  },
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get("next"))
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const text = textByMode[mode]
  const { data: session } = authClient.useSession()

  useEffect(() => {
    if (session) router.replace(next)
  }, [session, next, router])

  async function submit(form: HTMLFormElement) {
    const email = formText(form, "email").trim()
    const password = formText(form, "password")
    setPending(true)
    setError(null)
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            password,
            name: email.split("@")[0] ?? email,
          })
        : await authClient.signIn.email({ email, password })
    if (result.error) {
      setError(describeAuthError(result.error))
      setPending(false)
    }
  }

  const switchHref =
    next === "/"
      ? text.switchHref
      : `${text.switchHref}?next=${encodeURIComponent(next)}`

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-medium tracking-tight">{text.title}</h1>
      <form
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-10 text-base md:h-9 md:text-sm"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              minLength={mode === "sign-up" ? 8 : undefined}
              required
              className="h-10 text-base md:h-9 md:text-sm"
            />
            {mode === "sign-up" && (
              <FieldDescription>At least 8 characters.</FieldDescription>
            )}
          </Field>
        </FieldGroup>
        {error && (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={pending} className="h-10">
          {pending ? text.pending : text.submit}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {text.switchPrompt}{" "}
        <Link
          href={switchHref}
          className="text-foreground underline underline-offset-4"
        >
          {text.switchLabel}
        </Link>
      </p>
    </div>
  )
}
