export const chromeWebStoreUrl =
  "https://chromewebstore.google.com/detail/ipjneombpgmmjdmcagmgeilmjhlifnfb"

// Set NEXT_PUBLIC_EXTENSION_PUBLISHED=true once the listing has cleared Chrome Web Store
// review and is publicly installable. Unset or anything else keeps the CTA disabled.
export const extensionPublished =
  process.env.NEXT_PUBLIC_EXTENSION_PUBLISHED === "true"
