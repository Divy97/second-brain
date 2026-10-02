import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  manifest: {
    name: "Second Brain",
    description: "Save anything. Then just ask.",
    permissions: ["activeTab", "scripting", "storage", "alarms", "contextMenus"],
    host_permissions: [],
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
