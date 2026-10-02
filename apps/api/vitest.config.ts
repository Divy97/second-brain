import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest(({ inject }) => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      // BROWSER is "remote" in wrangler.jsonc for local dev (Browser Run has no local
      // simulation); tests never call it for real (see support/pipeline.ts's renderPage
      // default), and connecting remotely would require Cloudflare credentials CI doesn't have.
      remoteBindings: false,
      miniflare: {
        hyperdrives: { HYPERDRIVE: inject("databaseUrl") },
        // Tests drive processItem directly; a queue with no consumer keeps the real
        // consumer from racing them with a background workflow run.
        queueProducers: {
          ITEMS_QUEUE: { queueName: "second-brain-items-unconsumed" },
        },
        bindings: {
          BETTER_AUTH_SECRET: inject("betterAuthSecret"),
          KEY_ENCRYPTION_SECRET: inject("keyEncryptionSecret"),
          YOUTUBE_API_KEY: "test-youtube-key",
          API_ORIGIN: "https://second-brain.test",
          WEB_ORIGIN: "https://second-brain.test",
          AUTH_RATE_LIMIT: "off",
          TRANSCRIPT_API_KEY: "sd_test_transcript_key_9999",
          READER_API_KEY: "jina_test_reader_key_8888",
          AUTH_CLIENT_IP_HEADER: "x-test-client-ip",
          GOOGLE_CLIENT_ID: "test-google-client-id",
          GOOGLE_CLIENT_SECRET: "test-google-client-secret",
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Sign-up and sign-in run real scrypt password hashing; CI runners need the headroom.
    testTimeout: 30_000,
  },
})
