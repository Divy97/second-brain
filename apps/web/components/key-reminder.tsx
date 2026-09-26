"use client"

import { KeyIcon } from "@phosphor-icons/react"
import Link from "next/link"
import useSWR from "swr"

import { fetchKeySettings, keySettingsPath } from "@/lib/api"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function KeyReminder() {
  const { data } = useSWR(keySettingsPath, fetchKeySettings)
  if (!data || data.openrouter.set) return null
  return (
    <Alert>
      <KeyIcon aria-hidden />
      <AlertTitle>Add your OpenRouter key</AlertTitle>
      <AlertDescription>
        Notes are saved without it, but they are not processed or searchable
        until a key is set.
      </AlertDescription>
      <AlertAction>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings">Settings</Link>
        </Button>
      </AlertAction>
    </Alert>
  )
}
