import { ItemView } from "@/components/item-view"

export const metadata = { title: "Note" }

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ItemView id={id} />
}
