import { Suspense } from "react"

import { ExtensionApproval } from "@/components/extension-approval"

export const metadata = { title: "Connect Extension" }

export default function ExtensionAuthorizePage() {
  return (
    <Suspense>
      <ExtensionApproval />
    </Suspense>
  )
}
