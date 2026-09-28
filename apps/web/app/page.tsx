import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { LandingRedirect } from "@/components/landing-redirect"
import { PublicHeader } from "@/components/public-header"
import { Wordmark } from "@/components/wordmark"

const signup = "/sign-up"

export default function LandingPage() {
  return (
    <main className="overflow-hidden">
      <LandingRedirect />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <PublicHeader />

        <section className="grid items-center gap-9 py-10 sm:py-14 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1fr_0.95fr] lg:gap-12 lg:py-16">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-butter px-3 py-1.5 text-xs font-bold tracking-wide uppercase">
              For the beautifully forgetful{" "}
              <SparkleIcon weight="fill" aria-hidden />
            </p>
            <h1 className="font-heading text-[clamp(2.6rem,8vw,4.75rem)] leading-[1.05] tracking-tight">
              Make room
              <br />
              for <em className="text-coral-ink">more.</em>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Drop a thought here. Find it when it matters. Your second brain
              remembers the little things so you can live the big ones.
            </p>
            <Link
              href={signup}
              className="mt-6 inline-flex items-center gap-3 rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground transition-transform hover:-translate-y-1"
            >
              Start remembering <ArrowRightIcon aria-hidden />
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Your own OpenRouter key. Your notes, your call.
            </p>
          </div>
          <div
            className="relative min-h-96 lg:min-h-[500px]"
            aria-label="A note becoming an answer"
          >
            <div className="absolute inset-[7%_4%_4%_8%] rotate-[5deg] rounded-[3rem] bg-lilac" />
            <div className="absolute inset-[16%_14%_12%_0] -rotate-[5deg] rounded-[3rem] bg-coral" />
            <div className="float-note absolute top-[7%] left-[6%] w-[82%] max-w-md rounded-2xl bg-card p-5 shadow-[0_20px_50px_#533c5120] sm:p-7">
              <p className="mb-5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                A thought, saved
              </p>
              <p className="font-heading text-xl leading-tight sm:text-2xl">
                The little bookshop in Lisbon with the yellow door.
              </p>
              <div className="mt-6 flex items-center justify-between border-t pt-3 text-sm">
                <span className="rounded-full bg-mint px-3 py-1 font-medium">
                  Travel
                </span>
                <span className="text-muted-foreground">Just now</span>
              </div>
            </div>
            <div className="absolute right-0 bottom-[7%] w-[86%] max-w-md rotate-[3deg] rounded-2xl bg-primary p-5 text-primary-foreground shadow-[0_20px_50px_#533c5130] sm:p-7">
              <p className="mb-4 text-sm text-primary-foreground">
                Where was that bookshop?
              </p>
              <p className="font-heading text-xl leading-tight sm:text-2xl">
                “The little bookshop in Lisbon with the yellow door.”
              </p>
              <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-butter px-3 py-1.5 text-xs font-semibold text-foreground sm:text-sm">
                From your travel note <ArrowUpRightIcon aria-hidden />
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-butter py-14 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-7 px-5 sm:px-8 lg:grid-cols-2 lg:gap-12">
          <h2 className="max-w-xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Too many tabs open in your head?
          </h2>
          <div className="max-w-lg text-base leading-relaxed">
            <p>
              Save the half formed thought. The exact words someone said. The
              plan you might need next month. Ask later and get the source, not
              a vague guess.
            </p>
            <p className="mt-6 text-sm font-semibold tracking-widest uppercase">
              Capture now. Connect later.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 lg:grid-cols-3">
        <div className="rounded-2xl bg-lilac p-7 lg:col-span-2 lg:p-9">
          <span className="text-3xl">✳</span>
          <h2 className="mt-7 max-w-xl font-heading text-3xl leading-tight sm:text-4xl">
            The messy version is welcome.
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            No folders to maintain. Just type a note and let it find its place.
          </p>
        </div>
        <div className="rounded-2xl bg-mint p-7 lg:p-9">
          <span className="text-3xl">↗</span>
          <h2 className="mt-7 font-heading text-3xl leading-tight">
            Ask what you forgot.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Get an answer linked to the note it came from.
          </p>
        </div>
      </section>

      <section className="bg-primary px-5 py-16 text-center text-primary-foreground sm:px-8 sm:py-20">
        <p className="mb-5 text-sm font-semibold tracking-[0.15em] text-butter uppercase">
          A little less mental clutter
        </p>
        <h2 className="mx-auto max-w-3xl font-heading text-3xl leading-tight sm:text-4xl lg:text-5xl">
          Your brain has better things to do.
        </h2>
        <Link
          href={signup}
          className="mt-7 inline-flex items-center gap-3 rounded-full bg-coral px-5 py-3 font-semibold text-foreground transition-transform hover:-translate-y-1"
        >
          Start remembering <ArrowRightIcon aria-hidden />
        </Link>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8">
        <Wordmark />
        <p>Keep the good stuff close.</p>
      </footer>
    </main>
  )
}
