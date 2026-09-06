/**
 * The app lock never stores the PIN itself — only a salted SHA-256 hash, the
 * same way a real login would. This matters more than usual here: the hash
 * lives in `Settings`, which is exactly what cloud sync pushes to Firestore
 * (see `firebase/sync.ts`) — a plain-text PIN would otherwise leave the
 * house the moment sync is turned on.
 */

export const PIN_LENGTH = 4

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hashPin(pin: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${pin}`)
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === expectedHash
}
