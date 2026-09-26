const FORMAT_VERSION = "v1"
const IV_BYTES = 12

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

async function importSecret(secret: string): Promise<CryptoKey> {
  const raw = base64ToBytes(secret)
  if (raw.byteLength !== 32) {
    throw new Error("KEY_ENCRYPTION_SECRET must be 32 bytes, base64-encoded")
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

// The owning user id is authenticated data: a ciphertext copied to another user's row
// fails to decrypt instead of leaking that user's key.
export async function encryptApiKey(
  secret: string,
  plaintext: string,
  userId: string
): Promise<string> {
  const key = await importSecret(secret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) },
      key,
      new TextEncoder().encode(plaintext)
    )
  )
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  sealed.set(iv)
  sealed.set(ciphertext, IV_BYTES)
  return `${FORMAT_VERSION}:${bytesToBase64(sealed)}`
}

export async function decryptApiKey(
  secret: string,
  stored: string,
  userId: string
): Promise<string> {
  const [version, payload] = stored.split(":")
  if (version !== FORMAT_VERSION || !payload) {
    throw new Error("unsupported encrypted key format")
  }
  const sealed = base64ToBytes(payload)
  const key = await importSecret(secret)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: sealed.slice(0, IV_BYTES),
      additionalData: new TextEncoder().encode(userId),
    },
    key,
    sealed.slice(IV_BYTES)
  )
  return new TextDecoder().decode(plaintext)
}
