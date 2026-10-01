import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  manifest: {
    name: "Second Brain",
    description: "Save anything. Then just ask.",
    permissions: ["activeTab", "storage", "alarms", "contextMenus"],
    host_permissions: [],
    optional_host_permissions: ["<all_urls>"],
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
  },
})
