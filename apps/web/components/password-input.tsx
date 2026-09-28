"use client"

import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react"
import { useState, type ComponentProps } from "react"

import { Input } from "@workspace/ui/components/input"

export function PasswordInput(
  props: Omit<ComponentProps<typeof Input>, "type">
) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={`pr-12 ${props.className ?? ""}`}
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={props.id}
        onClick={() => {
          setVisible(!visible)
        }}
        className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-xl text-muted-foreground hover:text-foreground"
      >
        {visible ? (
          <EyeSlashIcon size={20} aria-hidden />
        ) : (
          <EyeIcon size={20} aria-hidden />
        )}
      </button>
    </div>
  )
}
