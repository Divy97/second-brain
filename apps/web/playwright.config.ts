import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun run dev",
    env: {
      NEXT_PUBLIC_GOOGLE_SIGN_IN: "on",
      NEXT_PUBLIC_EXTENSION_PUBLISHED: "true",
    },
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
