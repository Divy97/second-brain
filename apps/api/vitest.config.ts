import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest(({ inject }) => ({
      wrangler: { configPath: "./wrangler.jsonc" },
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
          AUTH_CLIENT_IP_HEADER: "x-test-client-ip",
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
