const FORMAT_VERSION = "v1"
const IV_BYTES = 12
const encoder = new TextEncoder()

const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encoder.encode(text))

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

async function importAesKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

async function importMasterKey(secret: string): Promise<CryptoKey> {
  const raw = base64ToBytes(secret)
  if (raw.byteLength !== 32) {
    throw new Error("KEY_ENCRYPTION_SECRET must be 32 bytes, base64-encoded")
  }
  return importAesKey(raw)
}

async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  associatedData: Uint8Array<ArrayBuffer>
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: associatedData },
      key,
      plaintext
    )
  )
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  sealed.set(iv)
  sealed.set(ciphertext, IV_BYTES)
  return bytesToBase64(sealed)
}

async function open(
  key: CryptoKey,
  sealedBase64: string,
  associatedData: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const sealed = base64ToBytes(sealedBase64)
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: sealed.slice(0, IV_BYTES),
        additionalData: associatedData,
      },
      key,
      sealed.slice(IV_BYTES)
    )
  )
}

// Envelope encryption: each key gets its own data key, wrapped by the master secret, so
// rotating the secret re-wraps data keys instead of touching every API key. The owning
// user id is authenticated data on both layers: a row copied to another user fails to open.
export async function encryptApiKey(
  secret: string,
  plaintext: string,
  userId: string
): Promise<string> {
  const associatedData = utf8(userId)
  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32))
  const wrappedDataKey = await seal(
    await importMasterKey(secret),
    dataKeyBytes,
    associatedData
  )
  const sealedApiKey = await seal(
    await importAesKey(dataKeyBytes),
    utf8(plaintext),
    associatedData
  )
  return `${FORMAT_VERSION}:${wrappedDataKey}:${sealedApiKey}`
}

export async function decryptApiKey(
  secret: string,
  stored: string,
  userId: string
): Promise<string> {
  const [version, wrappedDataKey, sealedApiKey] = stored.split(":")
  if (version !== FORMAT_VERSION || !wrappedDataKey || !sealedApiKey) {
    throw new Error("unsupported encrypted key format")
  }
  const associatedData = utf8(userId)
  const dataKeyBytes = await open(
    await importMasterKey(secret),
    wrappedDataKey,
    associatedData
  )
  const plaintext = await open(
    await importAesKey(dataKeyBytes),
    sealedApiKey,
    associatedData
  )
  return new TextDecoder().decode(plaintext)
}
