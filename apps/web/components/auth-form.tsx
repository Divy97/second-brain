"use client"

import { WarningCircleIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type SubmitEvent } from "react"

import { PasswordInput } from "@/components/password-input"
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
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" })
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
    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              password,
              name: email.split("@")[0] ?? email,
            })
          : await authClient.signIn.email({ email, password })
      if (result.error) setError(describeAuthError(result.error))
    } catch {
      setError("Could not connect. Try again.")
    } finally {
      setPending(false)
    }
  }

  const switchHref =
    next === "/home"
      ? text.switchHref
      : `${text.switchHref}?next=${encodeURIComponent(next)}`

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-tight">{text.title}</h1>
      <form
        onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
        className="flex flex-col gap-5"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email" className="w-full justify-between">
              Email{" "}
              <span
                aria-hidden
                className="text-xs font-normal text-muted-foreground"
              >
                Required
              </span>
            </FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onInvalid={(event) => {
                event.preventDefault()
                const missing = event.currentTarget.validity.valueMissing
                setFieldErrors((current) => ({
                  ...current,
                  email: missing
                    ? "Enter your email address."
                    : "Enter a valid email address.",
                }))
              }}
              onInput={() => {
                setFieldErrors((current) => ({ ...current, email: "" }))
              }}
              required
            />
            {fieldErrors.email && (
              <FieldDescription
                id="email-error"
                role="alert"
                className="text-destructive"
              >
                {fieldErrors.email}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="password" className="w-full justify-between">
              Password{" "}
              <span
                aria-hidden
                className="text-xs font-normal text-muted-foreground"
              >
                Required
              </span>
            </FieldLabel>
            <PasswordInput
              id="password"
              name="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              minLength={mode === "sign-up" ? 8 : undefined}
              maxLength={mode === "sign-up" ? 128 : undefined}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={
                fieldErrors.password
                  ? "password-error"
                  : mode === "sign-up"
                    ? "password-hint"
                    : undefined
              }
              onInvalid={(event) => {
                event.preventDefault()
                const tooShort = event.currentTarget.validity.tooShort
                setFieldErrors((current) => ({
                  ...current,
                  password: tooShort
                    ? "Use at least 8 characters."
                    : "Enter your password.",
                }))
              }}
              onInput={() => {
                setFieldErrors((current) => ({ ...current, password: "" }))
              }}
              required
            />
            {fieldErrors.password ? (
              <FieldDescription
                id="password-error"
                role="alert"
                className="text-destructive"
              >
                {fieldErrors.password}
              </FieldDescription>
            ) : mode === "sign-up" ? (
              <FieldDescription id="password-hint">
                At least 8 characters.
              </FieldDescription>
            ) : null}
          </Field>
        </FieldGroup>
        {error && (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" disabled={pending}>
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
