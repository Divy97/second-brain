import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  manifest: ({ manifestVersion }) => ({
    name: "Second Brain",
    description: "Save anything. Then just ask.",
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "alarms",
      "contextMenus",
    ],
    host_permissions: [],
    optional_permissions:
      manifestVersion === 2
        ? ["webNavigation", "http://*/*", "https://*/*"]
        : ["webNavigation"],
    ...(manifestVersion === 3
      ? { optional_host_permissions: ["http://*/*", "https://*/*"] }
      : {}),
    browser_specific_settings: {
      gecko: {
        id: "second-brain@divy.dev",
        data_collection_permissions: {
          required: ["websiteContent"],
          optional: ["browsingActivity"],
        },
      },
    },
    incognito: "not_allowed",
    action: {
      default_popup: "popup.html",
    },
    commands: {
      "save-page": {
        suggested_key: {
          default: "Alt+S",
          mac: "Alt+S",
        },
        description: "Save the current page",
      },
    },
  }),
})
