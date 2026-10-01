// What a device token may do. Keep this narrow: it can add captures and manage its own
// capture settings, but it can never read item content, ask questions or touch API keys.
export const extensionPermissions = {
  connection: ["read"],
  captures: ["create"],
  captureSettings: ["read", "write"],
  stored: ["list", "index", "delete"],
} satisfies Record<string, string[]>

export type ExtensionPermissions = Record<string, string[]>
