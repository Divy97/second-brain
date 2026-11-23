export async function requestPassivePermissions(): Promise<boolean> {
  return browser.permissions.request({
    permissions: ["webNavigation"],
    origins: ["http://*/*", "https://*/*"],
  })
}

export async function hasPassivePermissions(): Promise<boolean> {
  return browser.permissions.contains({
    permissions: ["webNavigation"],
    origins: ["http://*/*", "https://*/*"],
  })
}
