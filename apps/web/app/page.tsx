import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  DeviceMobileIcon,
  FilePdfIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  NotePencilIcon,
  QuotesIcon,
  ShareNetworkIcon,
  SparkleIcon,
  ScribbleLoopIcon,
  ShootingStarIcon,
  TerminalWindowIcon,
  YoutubeLogoIcon,
  InstagramLogoIcon,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"
import Link from "next/link"

import { LandingRedirect } from "@/components/landing-redirect"
import { PublicHeader } from "@/components/public-header"
import { VideoMemoryDemo } from "@/components/video-memory-demo"
import { Wordmark } from "@/components/wordmark"
import { chromeWebStoreUrl, extensionPublished } from "@/lib/extension-store"

import type { Icon as IconType } from "@phosphor-icons/react"

const formats = [
  {
    name: "Notes",
    icon: NotePencilIcon,
    detail: "Half an idea. A whole plan. Write it as it comes.",
  },
  {
    name: "Voice",
    icon: MicrophoneIcon,
    detail: "Say it before it slips away. Keep the recording and transcript.",
  },
  {
    name: "Photos",
    icon: ImageIcon,
    detail:
      "A whiteboard, a receipt, a page. Give the words in your photos a home.",
  },
  {
    name: "PDFs",
    icon: FilePdfIcon,
    detail: "Keep the document. Find the details inside it.",
  },
  {
    name: "Links",
    icon: LinkIcon,
    detail:
      "Articles, YouTube videos, Instagram Reels. Save the link and keep the useful context.",
  },
]

const roadmap: {
  title: string
  detail: string
  tint: string
  icon: IconType | null
  mark: string | null
}[] = [
  {
    title: "Import from ChatGPT & Claude",
    detail: "Bring your past conversations in as searchable context.",
    tint: "bg-butter",
    icon: null,
    mark: "/claude-logo.svg",
  },
  {
    title: "Context from Claude Code & Codex",
    detail: "Pull context straight from your coding agent sessions.",
    tint: "bg-mint",
    icon: TerminalWindowIcon,
    mark: null,
  },
  {
    title: "Connections between your notes",
    detail: "See how a new idea relates to what you’ve already saved.",
    tint: "bg-lilac",
    icon: ShareNetworkIcon,
    mark: null,
  },
  {
    title: "A Second Brain for your phone",
    detail: "Capture and ask questions on the go, not just at your desk.",
    tint: "bg-accent",
    icon: DeviceMobileIcon,
    mark: null,
  },
]

export default function LandingPage() {
  return (
    <main className="marketing overflow-clip">
      <LandingRedirect />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <PublicHeader />
        <section className="relative grid gap-10 pt-12 pb-14 sm:pt-16 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-12 lg:pt-20 lg:pb-24">
          <div className="content-enter relative z-10">
            <h1 className="max-w-xl text-[clamp(2.8rem,6vw,4.75rem)] leading-[1.06] tracking-[-0.055em]">
              Save anything.
              <br />
              Then just <span className="text-coral-ink">ask.</span>
            </h1>
            <p className="mt-6 max-w-sm text-lg leading-relaxed text-muted-foreground">
              Save notes, videos, links and files in one place. Ask questions
              about what you’ve saved and get answers linked to your sources.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/sign-up"
                className="marketing-cta inline-flex items-center gap-4 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground"
              >
                Start remembering <ArrowRightIcon aria-hidden />
              </Link>
              <a
                href="#video-memories"
                className="inline-flex items-center gap-1.5 py-3 text-sm font-semibold underline decoration-border underline-offset-4 hover:decoration-current"
              >
                Try a question <ArrowUpRightIcon aria-hidden />
              </a>
            </div>
          </div>
          <figure className="product-preview relative mt-5 min-w-0 lg:mt-0">
            <ScribbleLoopIcon
              weight="thin"
              className="marketing-doodle pointer-events-none absolute -top-12 -right-3 z-10 size-20 text-coral-ink sm:-right-8 sm:size-24"
              aria-hidden
            />
            <ShootingStarIcon
              weight="thin"
              className="marketing-doodle pointer-events-none absolute -bottom-8 -left-4 z-10 size-16 text-coral-ink sm:-left-9 sm:size-24"
              aria-hidden
            />
            <div
              className="absolute -inset-4 -rotate-3 rounded-[2rem] bg-coral/25 sm:-inset-6"
              aria-hidden
            />
            <div className="marketing-preview-frame relative overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-[0_24px_70px_-24px_rgb(83_60_81/0.3)]">
              <div className="flex items-center justify-between border-b px-5 py-3 text-xs text-muted-foreground">
                <span>Your thoughts, in good company.</span>
                <SparkleIcon size={16} aria-hidden />
              </div>
              <Image
                src="/product-home.png"
                alt="Second Brain: capture notes, voice, photos, PDFs and links above a collection of saved memories"
                width={1120}
                height={850}
                sizes="(min-width: 1024px) 650px, 100vw"
                preload
                className="h-auto w-full"
              />
            </div>
            <figcaption className="relative mt-5 text-right text-xs text-muted-foreground">
              A little space for everything you want to keep.
            </figcaption>
          </figure>
        </section>
        <section
          id="video-memories"
          className="relative grid scroll-mt-8 gap-10 border-t border-border py-14 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16"
        >
          <div>
            <div
              className="mb-6 flex items-center gap-4 text-coral-ink"
              aria-label="YouTube and Instagram"
            >
              <YoutubeLogoIcon size={34} weight="duotone" aria-hidden />
              <span className="text-lg" aria-hidden>
                +
              </span>
              <InstagramLogoIcon size={32} weight="duotone" aria-hidden />
            </div>
            <h2 className="max-w-md text-3xl leading-tight tracking-tight sm:text-5xl">
              Your saved videos.
              <br />
              <span className="relative inline-block">
                Finally useful.
                <span
                  aria-hidden
                  className="marketing-underline absolute -bottom-2 left-0 h-3 w-full -rotate-2 rounded-[50%] border-t-[3px] border-coral"
                />
              </span>
            </h2>
            <p className="mt-7 max-w-md leading-relaxed text-muted-foreground">
              The recipe in a Reel. The idea halfway through a video. Bring the
              link here, then find the detail without hunting through your feed.
            </p>
            <dl className="mt-7 space-y-5 text-sm">
              <div>
                <dt className="font-semibold">YouTube videos &amp; Shorts</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">
                  Save video details and available transcripts. Ask about the
                  parts you want to remember.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Instagram Reels &amp; posts</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">
                  Keep captions and post details. Rediscover the recipe,
                  recommendation or idea you saved.
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Available content varies by link. When extraction is limited, your
              link stays saved.
            </p>
          </div>
          <VideoMemoryDemo />
        </section>
        <section
          id="possibilities"
          className="scroll-mt-8 border-t border-border py-14 sm:py-20"
        >
          <div className="max-w-2xl">
            <h2 className="text-3xl leading-tight tracking-tight sm:text-5xl">
              Life doesn’t arrive
              <br />
              in one format.
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
              Neither should your notes. Catch the thought however it arrives.
              Come back to it when you need it.
            </p>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-9 min-[480px]:grid-cols-2 lg:grid-cols-5">
            {formats.map(({ name, icon: Icon, detail }) => (
              <div
                key={name}
                className="format-feature border-t border-primary/20 pt-5"
              >
                <Icon
                  size={30}
                  weight="duotone"
                  className="mb-5 text-coral-ink"
                  aria-hidden
                />
                <h3 className="text-lg">{name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section
          id="extension"
          className="scroll-mt-8 border-t border-border py-14 sm:py-20"
        >
          <div className="grid gap-10 overflow-hidden rounded-[2rem] border border-border bg-card p-8 sm:p-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
            <div>
              <Image
                src="/chrome-logo.svg"
                alt=""
                aria-hidden
                width={32}
                height={32}
              />
              <h2 className="mt-6 text-3xl leading-tight tracking-tight sm:text-5xl">
                Right from your browser.
              </h2>
              <p className="mt-5 max-w-sm leading-relaxed text-muted-foreground">
                A free Second Brain extension for Chrome. Save the page you’re
                reading, then ask about it later.
              </p>
              {extensionPublished ? (
                <a
                  href={chromeWebStoreUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground"
                >
                  Add to Chrome <ArrowUpRightIcon aria-hidden />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="mt-7 inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-muted px-6 py-3.5 font-semibold text-muted-foreground"
                >
                  Coming soon on the Chrome Web Store
                </button>
              )}
            </div>
            <dl className="grid gap-6 border-t border-border pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-16">
              <div>
                <dt className="font-semibold">One click, any page</dt>
                <dd className="mt-1 max-w-sm leading-relaxed text-muted-foreground">
                  Click the toolbar icon, press Alt+S, or right-click the page.
                  It’s saved straight to your Second Brain.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Automatic capture</dt>
                <dd className="mt-1 max-w-sm leading-relaxed text-muted-foreground">
                  Turn it on and it saves the pages you actually spend time
                  reading, off by default and fully in your control.
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <section className="grid gap-8 rounded-[2rem] border border-border bg-card p-6 sm:p-10 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:p-14">
          <div className="flex flex-col justify-center">
            <QuotesIcon
              size={40}
              weight="duotone"
              className="mb-6 text-coral-ink"
              aria-hidden
            />
            <h2 className="max-w-md text-3xl leading-tight tracking-tight sm:text-4xl">
              Answers with
              <br />a paper trail.
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
              Ask a question in your own words. Get an answer linked to your
              saved sources. Follow the thread with another question.
            </p>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
              From “What did I decide?” to “Where did I read that?” Your past
              self has something useful to say.
            </p>
          </div>
          <figure className="min-w-0">
            <Image
              src="/product-answer.png"
              alt="An example conversation answering a question about a saved Lisbon bookshop, with a link to the original note"
              width={800}
              height={700}
              sizes="(min-width: 1024px) 500px, 100vw"
              className="h-auto w-full rounded-xl border border-border"
            />
            <figcaption className="mt-3 text-xs text-muted-foreground">
              An example conversation, grounded in a saved note.
            </figcaption>
          </figure>
        </section>
        <section className="scroll-mt-8 border-t border-border py-14 sm:py-20">
          <h2 className="text-3xl leading-tight tracking-tight sm:text-5xl">
            Coming soon.
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
            What we’re building next.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {roadmap.map(({ title, detail, tint, icon: Icon, mark }, i) => (
              <div
                key={title}
                className={`roadmap-card flex flex-col gap-4 rounded-2xl p-6 ${tint} ${i % 2 ? "roadmap-card-tilt-right" : "roadmap-card-tilt-left"}`}
              >
                {mark ? (
                  <Image
                    src={mark}
                    alt=""
                    aria-hidden
                    width={28}
                    height={28}
                    className="roadmap-icon"
                  />
                ) : (
                  Icon && (
                    <Icon
                      size={28}
                      weight="duotone"
                      className="roadmap-icon text-coral-ink"
                      aria-hidden
                    />
                  )
                )}
                <h3 className="text-lg">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-8 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <h2 className="max-w-sm text-3xl leading-tight tracking-tight sm:text-4xl">
            Less organizing.
            <br />
            More connecting.
          </h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-xl">Save the messy version.</h3>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Keep the original alongside extracted text and insights. Your
                collection stays ready for the next question.
              </p>
            </div>
            <div className="border-t pt-8">
              <h3 className="text-xl">Bring your own AI key.</h3>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Connect your OpenRouter API key in Settings to process captures
                and ask questions. Your AI usage is billed through your
                OpenRouter account.
              </p>
            </div>
          </div>
        </section>
        <section className="relative overflow-hidden rounded-[2rem] bg-accent px-6 py-12 sm:px-12 sm:py-16">
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-3xl leading-tight tracking-tight sm:text-5xl">
              Keep the thought.
              <br />
              Free up the headspace.
            </h2>
            <Link
              href="/sign-up"
              className="marketing-cta mt-7 inline-flex items-center gap-4 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground"
            >
              Start remembering <ArrowRightIcon aria-hidden />
            </Link>
          </div>
          <SparkleIcon
            weight="thin"
            className="absolute -right-10 -bottom-14 size-72 text-coral-ink/15 sm:right-6 sm:size-96"
            aria-hidden
          />
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-6 py-10 text-sm text-muted-foreground">
          <Wordmark />
          <p>Keep the good stuff close.</p>
          <Link href="/sign-in" className="hover:underline">
            Sign in <span aria-hidden>↗</span>
          </Link>
        </footer>
      </div>
    </main>
  )
}
