interface PermissionActions {
  connection: "read"
  captures: "create"
  captureSettings: "read" | "write"
  stored: "list" | "index" | "delete"
}

export type PermissionRequirement = Record<string, string[]>

// What a device token may do. Keep this narrow: it can add captures and manage its own
// capture settings, but it can never read item content, ask questions or touch API keys.
export const extensionPermissions: {
  [Resource in keyof PermissionActions]: PermissionActions[Resource][]
} = {
  connection: ["read"],
  captures: ["create"],
  captureSettings: ["read", "write"],
  stored: ["list", "index", "delete"],
}

export function needs<Resource extends keyof PermissionActions>(
  resource: Resource,
  action: PermissionActions[Resource]
): PermissionRequirement {
  return { [resource]: [action] }
}
