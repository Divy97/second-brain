import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FilePdfIcon,
  ImageIcon,
  LinkIcon,
  MicrophoneIcon,
  NotePencilIcon,
  QuotesIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"
import Link from "next/link"

import { LandingRedirect } from "@/components/landing-redirect"
import { PublicHeader } from "@/components/public-header"
import { Wordmark } from "@/components/wordmark"

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
      "Save articles and video links with their extracted text or transcript.",
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
            <p className="mb-6 flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-coral-ink uppercase">
              <SparkleIcon size={18} weight="fill" aria-hidden /> For the
              beautifully forgetful
            </p>
            <h1 className="max-w-xl text-[clamp(2.8rem,6vw,4.75rem)] leading-[1.06] tracking-[-0.055em]">
              Make room
              <br />
              for <span className="text-coral-ink">more.</span>
            </h1>
            <p className="mt-6 max-w-sm text-lg leading-relaxed text-muted-foreground">
              Notes, voice, photos, PDFs, links. One place to keep them. A
              better way to remember.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/sign-up"
                className="marketing-cta inline-flex items-center gap-4 rounded-full bg-primary px-6 py-3.5 font-semibold text-primary-foreground"
              >
                Start remembering <ArrowRightIcon aria-hidden />
              </Link>
              <a
                href="#possibilities"
                className="inline-flex items-center gap-1.5 py-3 text-sm font-semibold underline decoration-border underline-offset-4 hover:decoration-current"
              >
                Take a look <ArrowUpRightIcon aria-hidden />
              </a>
            </div>
          </div>
          <figure className="product-preview relative min-w-0">
            <div
              className="absolute -inset-4 -rotate-3 rounded-[2rem] bg-coral/25 sm:-inset-6"
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card shadow-[0_24px_70px_-24px_rgb(83_60_81/0.3)]">
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
