import { ThreadView } from "@/components/thread-view"

export const metadata = { title: "Question" }

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ThreadView id={id} />
}
