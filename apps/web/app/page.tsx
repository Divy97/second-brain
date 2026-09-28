import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { LandingRedirect } from "@/components/landing-redirect"
import { Wordmark } from "@/components/wordmark"

const signup = "/sign-up"

export default function LandingPage() {
  return (
    <main className="overflow-hidden">
      <LandingRedirect />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Wordmark />
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/sign-in"
              className="text-sm font-medium hover:underline"
            >
              Sign in
            </Link>
            <Link
              href={signup}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Get started <ArrowUpRightIcon aria-hidden />
            </Link>
          </div>
        </header>

        <section className="grid min-h-[min(760px,85dvh)] items-center gap-16 py-16 lg:grid-cols-[1fr_0.95fr] lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-7 inline-flex rotate-[-2deg] items-center gap-2 rounded-full bg-butter px-4 py-2 text-xs font-bold tracking-[0.14em] uppercase">
              For the beautifully forgetful{" "}
              <SparkleIcon weight="fill" aria-hidden />
            </p>
            <h1 className="font-heading text-[clamp(4.3rem,9vw,8.5rem)] leading-[0.88] font-semibold tracking-[-0.075em]">
              Make room
              <br />
              for <em className="font-normal text-coral-ink">more.</em>
            </h1>
            <p className="mt-9 max-w-md text-lg leading-relaxed text-muted-foreground">
              Drop a thought here. Find it when it matters. Your second brain
              remembers the little things so you can live the big ones.
            </p>
            <Link
              href={signup}
              className="mt-9 inline-flex items-center gap-4 rounded-full bg-primary px-7 py-4 font-semibold text-primary-foreground transition-transform hover:-translate-y-1"
            >
              Start remembering <ArrowRightIcon aria-hidden />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              Your own OpenRouter key. Your notes, your call.
            </p>
          </div>
          <div
            className="relative min-h-[520px] lg:min-h-[650px]"
            aria-label="A note becoming an answer"
          >
            <div className="absolute inset-[7%_4%_4%_8%] rotate-[5deg] rounded-[3rem] bg-lilac" />
            <div className="absolute inset-[16%_14%_12%_0] -rotate-[5deg] rounded-[3rem] bg-coral" />
            <div className="float-note absolute top-[7%] left-[6%] w-[82%] max-w-md rounded-[2rem] bg-card p-7 shadow-[0_24px_70px_#533c5124] sm:p-9">
              <p className="mb-8 text-xs font-bold tracking-[0.16em] text-muted-foreground uppercase">
                A thought, saved
              </p>
              <p className="font-heading text-3xl leading-tight">
                The little bookshop in Lisbon with the yellow door.
              </p>
              <div className="mt-9 flex items-center justify-between border-t pt-4 text-sm">
                <span className="rounded-full bg-mint px-3 py-1 font-medium">
                  Travel
                </span>
                <span className="text-muted-foreground">Just now</span>
              </div>
            </div>
            <div className="absolute right-0 bottom-[7%] w-[86%] max-w-md rotate-[3deg] rounded-[2rem] bg-primary p-7 text-primary-foreground shadow-[0_24px_70px_#533c5133] sm:p-9">
              <p className="mb-6 text-sm opacity-75">
                Where was that bookshop?
              </p>
              <p className="font-heading text-3xl leading-tight">
                “The little bookshop in Lisbon with the yellow door.”
              </p>
              <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-butter px-4 py-2 text-sm font-semibold text-foreground">
                From your travel note <ArrowUpRightIcon aria-hidden />
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-butter py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:items-end">
          <h2 className="max-w-xl font-heading text-5xl leading-[1.05] tracking-tight sm:text-7xl">
            Too many tabs open in your head?
          </h2>
          <div className="max-w-lg text-lg leading-relaxed">
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

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-24 sm:px-8 lg:grid-cols-3">
        <div className="rounded-[2rem] bg-lilac p-8 lg:col-span-2 lg:p-12">
          <span className="text-5xl">✳</span>
          <h2 className="mt-12 max-w-xl font-heading text-4xl leading-tight sm:text-5xl">
            The messy version is welcome.
          </h2>
          <p className="mt-5 max-w-md text-muted-foreground">
            No folders to maintain. Just type a note and let it find its place.
          </p>
        </div>
        <div className="rounded-[2rem] bg-mint p-8 lg:p-12">
          <span className="text-5xl">↗</span>
          <h2 className="mt-12 font-heading text-4xl leading-tight">
            Ask what you forgot.
          </h2>
          <p className="mt-5 text-muted-foreground">
            Get an answer linked to the note it came from.
          </p>
        </div>
      </section>

      <section className="bg-primary px-5 py-24 text-center text-primary-foreground sm:px-8 sm:py-32">
        <p className="mb-5 text-sm font-semibold tracking-[0.15em] text-butter uppercase">
          A little less mental clutter
        </p>
        <h2 className="mx-auto max-w-3xl font-heading text-5xl leading-tight sm:text-7xl">
          Your brain has better things to do.
        </h2>
        <Link
          href={signup}
          className="mt-10 inline-flex items-center gap-3 rounded-full bg-coral px-7 py-4 font-semibold text-foreground transition-transform hover:-translate-y-1"
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
