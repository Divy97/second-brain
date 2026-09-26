import { HomeFeed } from "@/components/home-feed"

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Home</h1>
      <HomeFeed />
    </div>
  )
}
