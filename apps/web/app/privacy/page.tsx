import { PublicHeader } from "@/components/public-header"
import { Wordmark } from "@/components/wordmark"

export const metadata = { title: "Privacy Policy" }

const LAST_UPDATED = "October 2, 2026"

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 sm:px-8">
      <PublicHeader />
      <article className="mx-auto max-w-2xl py-14 sm:py-20">
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated {LAST_UPDATED}.
        </p>

        <div className="mt-10 flex flex-col gap-8 leading-relaxed text-foreground">
          <section>
            <p>
              Second Brain is a personal project: a place to save notes, links
              and files, and later ask questions about what you’ve saved. This
              page covers the web app and the Second Brain browser extension.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">What the extension sends</h2>
            <p>
              The browser extension only acts when you click{" "}
              <strong>Save this page</strong>, use its keyboard shortcut, or
              choose its right-click menu item. At that moment, and only then,
              it sends the current tab’s URL, title and visible page text to
              Second Brain over HTTPS, authenticated with a device key you
              create yourself in Settings. The extension does not watch, record
              or read any page you haven’t explicitly chosen to save.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">What the web app stores</h2>
            <p>
              Your account is identified by one email address (from a password
              sign-in or Google). Everything you save, the notes, links, files,
              voice recordings and photos, is stored in your account so you can
              search it and ask questions about it later.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">
              Processing and third parties
            </h2>
            <p>
              Your notes, questions and saved links are processed using your own
              OpenRouter account and API key, which you provide in Settings;
              that usage is billed to your OpenRouter account, not to us. When
              you save a video link, or a page that blocks normal reading, its
              address is also sent to our transcript and page-reading providers,
              Supadata and Jina, so the content can be extracted. We do not sell
              your data, and we do not use it for advertising.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">
              Your control over your data
            </h2>
            <p>
              You can disconnect a browser or device at any time from Connected
              Devices in Settings, which immediately stops that device key from
              working. You can remove your OpenRouter key at any time. Account
              deletion isn’t self-serve yet; email us at the address below and
              we’ll delete your account and saved data.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">Security</h2>
            <p>
              Device keys and API keys are stored hashed or encrypted at rest,
              not in plain text. All traffic between the extension, the web app
              and our servers runs over HTTPS.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">Children</h2>
            <p>
              Second Brain is not directed at children, and we don’t knowingly
              collect data from anyone under 13.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">Changes to this policy</h2>
            <p>
              If this policy changes in a way that affects what we collect or
              how we use it, we’ll update this page and change the date above.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-xl">Contact</h2>
            <p>
              Questions about this policy, or a request to delete your account:{" "}
              <a href="mailto:divyparekh1810@gmail.com" className="underline">
                divyparekh1810@gmail.com
              </a>
            </p>
          </section>
        </div>
      </article>
      <footer className="flex flex-wrap items-center justify-between gap-6 py-10 text-sm text-muted-foreground">
        <Wordmark />
        <p>Keep the good stuff close.</p>
      </footer>
    </main>
  )
}
