"use client"

import { KeyIcon } from "@phosphor-icons/react"
import Link from "next/link"
import useSWR from "swr"

import { fetchKeySettings, keySettingsPath } from "@/lib/keys-api"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

export function KeyReminder() {
  const { data } = useSWR(keySettingsPath, fetchKeySettings)
  if (!data || data.openrouter.set) return null
  return (
    <Alert className="max-w-2xl">
      <KeyIcon aria-hidden />
      <AlertTitle>Add your OpenRouter key</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>
          Notes are saved without it, but they are not processed or searchable
          until a key is set.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings">Open settings</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
