/**
 * FNV-1a, 52-bit safe, returned as base36.
 *
 * Replaces the old `btoa(unescape(encodeURIComponent(...)))` transaction id:
 * `unescape` is deprecated, the result grew with the input, and it threw on
 * some OCR output. This is fixed-width, allocation-free and Unicode-safe.
 */
export function hash(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= c + i
    h2 = Math.imul(h2, 0x85ebca6b)
  }

  const lo = (h1 >>> 0).toString(36)
  const hi = (h2 >>> 0).toString(36)
  return `${hi}${lo}`
}

/** Short random id for entities that are not content-addressed. */
export function uid(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
