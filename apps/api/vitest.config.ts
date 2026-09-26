import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest(({ inject }) => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        hyperdrives: { HYPERDRIVE: inject("databaseUrl") },
        bindings: {
          BETTER_AUTH_SECRET: inject("betterAuthSecret"),
          KEY_ENCRYPTION_SECRET: inject("keyEncryptionSecret"),
          AUTH_RATE_LIMIT: "off",
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
  },
})
