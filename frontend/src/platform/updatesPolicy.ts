export interface UpdatePolicy {
  minRequiredVersion: string
  latestVersion: string
  minRequiredVersionAndroid?: string
  latestVersionAndroid?: string
  minRequiredVersionIos?: string
  latestVersionIos?: string
  updateUrl: string
  updateUrlAndroid: string
  updateUrlIos: string
  message: string
}

export type UpdateDecision = 'none' | 'soft' | 'hard'
export type UpdatePlatform = 'web' | 'android' | 'ios'
export const UPDATE_CACHE_KEY = 'mizan.update-policy.v1'
export const UPDATE_DISMISS_KEY = 'mizan.update-dismissed.v1'

interface Version { numbers: number[]; prerelease: string[] }

function version(value: unknown): Version | null {
  if (typeof value !== 'string' || value.length > 100) return null
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value)
  if (!match) return null
  const numbers = match.slice(1, 4).map(Number)
  const prerelease = match[4]?.split('.') ?? []
  if (numbers.some(number => !Number.isSafeInteger(number)) || prerelease.some(part => /^0\d+$/.test(part))) return null
  return { numbers, prerelease }
}

/** Semantic versions compare numerically, including release candidates and build metadata. */
export function compareVersions(left: string, right: string): number | null {
  const a = version(left), b = version(right)
  if (!a || !b) return null
  for (let i = 0; i < 3; i++) if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] < b.numbers[i] ? -1 : 1
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const x = a.prerelease[i], y = b.prerelease[i]
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1
    if (x === y) continue
    const xNumeric = /^\d+$/.test(x), yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (x.length !== y.length) return x.length < y.length ? -1 : 1
      return x < y ? -1 : 1
    }
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Reject script/data URLs, credentials, insecure transports and unrelated market intents. */
export function safeUpdateUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020]/.test(value)) return null
  try {
    const url = new URL(value)
    if (url.username || url.password) return null
    if (url.protocol === 'https:' && url.hostname && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.href
    if (url.protocol === 'market:' && url.hostname === 'details' && url.searchParams.get('id') === 'com.faraday.followfinance') return url.href
  } catch { return null }
  return null
}

function optionalVersion(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return compareVersions(trimmed, trimmed) === null ? null : trimmed
}

/** A malformed remote policy must never lock a person out of their local records. */
export function parseUpdatePolicy(raw: Record<string, unknown>): UpdatePolicy | null {
  const minimum = raw.min_required_version
  const latest = raw.latest_version
  if (typeof minimum !== 'string' || typeof latest !== 'string') return null
  const order = compareVersions(minimum, latest)
  if (order === null || order > 0) return null
  const minAndroid = optionalVersion(raw.min_required_version_android)
  const latestAndroid = optionalVersion(raw.latest_version_android)
  const minIos = optionalVersion(raw.min_required_version_ios)
  const latestIos = optionalVersion(raw.latest_version_ios)
  if (minAndroid === null || latestAndroid === null || minIos === null || latestIos === null) return null
  const disabled = minimum === '0.0.0' && latest === '0.0.0' && !minAndroid && !latestAndroid && !minIos && !latestIos
  const updateUrl = safeUpdateUrl(raw.update_url)
  const updateUrlAndroid = safeUpdateUrl(raw.update_url_android)
  const iosCandidate = safeUpdateUrl(raw.update_url_ios)
  const updateUrlIos = iosCandidate?.startsWith('https:') ? iosCandidate : null
  if (!updateUrl && !updateUrlAndroid && !updateUrlIos && !disabled) return null
  return {
    minRequiredVersion: minimum,
    latestVersion: latest,
    ...(minAndroid ? { minRequiredVersionAndroid: minAndroid } : {}),
    ...(latestAndroid ? { latestVersionAndroid: latestAndroid } : {}),
    ...(minIos ? { minRequiredVersionIos: minIos } : {}),
    ...(latestIos ? { latestVersionIos: latestIos } : {}),
    updateUrl: updateUrl ?? '',
    updateUrlAndroid: updateUrlAndroid ?? '',
    updateUrlIos: updateUrlIos ?? '',
    message: typeof raw.update_message === 'string' ? raw.update_message.trim().slice(0, 500) : '',
  }
}

/** Resolves effective minimum and latest versions for a platform, applying optional per-platform overrides. */
export function resolvePolicyVersions(
  policy: UpdatePolicy,
  platform: UpdatePlatform,
): { minRequiredVersion: string; latestVersion: string } | null {
  const minRequiredVersion =
    platform === 'android'
      ? (policy.minRequiredVersionAndroid || policy.minRequiredVersion)
      : platform === 'ios'
        ? (policy.minRequiredVersionIos || policy.minRequiredVersion)
        : policy.minRequiredVersion
  const latestVersion =
    platform === 'android'
      ? (policy.latestVersionAndroid || policy.latestVersion)
      : platform === 'ios'
        ? (policy.latestVersionIos || policy.latestVersion)
        : policy.latestVersion
  const order = compareVersions(minRequiredVersion, latestVersion)
  if (order === null || order > 0) return null
  return { minRequiredVersion, latestVersion }
}

/** An empty native destination disables native prompts until a usable link is configured. */
export function resolveUpdateUrl(policy: UpdatePolicy, platform: UpdatePlatform): string | null {
  if (platform === 'web') return policy.updateUrl.startsWith('https:') ? policy.updateUrl : null
  const dedicated = platform === 'android' ? policy.updateUrlAndroid : policy.updateUrlIos
  if (dedicated) return dedicated
  const fallback = safeUpdateUrl(policy.updateUrl)
  if (!fallback) return null
  const url = new URL(fallback)
  if (platform === 'android' && (url.protocol === 'market:' || (url.hostname === 'play.google.com' && url.pathname === '/store/apps/details' && url.searchParams.get('id') === 'com.faraday.followfinance'))) return fallback
  if (platform === 'ios' && ['apps.apple.com', 'testflight.apple.com'].includes(url.hostname)) return fallback
  return null
}

export function updateDecision(currentVersion: string | null, policy: UpdatePolicy | null, platform: UpdatePlatform = 'web'): UpdateDecision {
  if (!currentVersion || !policy || !resolveUpdateUrl(policy, platform)) return 'none'
  const versions = resolvePolicyVersions(policy, platform)
  if (!versions) return 'none'
  const minimum = compareVersions(currentVersion, versions.minRequiredVersion)
  const latest = compareVersions(currentVersion, versions.latestVersion)
  if (minimum === null || latest === null) return 'none'
  if (minimum < 0) return 'hard'
  return latest < 0 ? 'soft' : 'none'
}

export function readCachedUpdatePolicy(storage: Pick<Storage, 'getItem'>): UpdatePolicy | null {
  try {
    const record: unknown = JSON.parse(storage.getItem(UPDATE_CACHE_KEY) ?? 'null')
    if (!record || typeof record !== 'object') return null
    const cached = record as { schema?: unknown; policy?: unknown }
    if (cached.schema !== 1 || !cached.policy || typeof cached.policy !== 'object') return null
    const policy = cached.policy as Partial<UpdatePolicy>
    return parseUpdatePolicy({
      min_required_version: policy.minRequiredVersion,
      latest_version: policy.latestVersion,
      min_required_version_android: policy.minRequiredVersionAndroid,
      latest_version_android: policy.latestVersionAndroid,
      min_required_version_ios: policy.minRequiredVersionIos,
      latest_version_ios: policy.latestVersionIos,
      update_url: policy.updateUrl,
      update_url_android: policy.updateUrlAndroid,
      update_url_ios: policy.updateUrlIos,
      update_message: policy.message,
    })
  } catch { return null }
}

export function cacheUpdatePolicy(storage: Pick<Storage, 'setItem'>, policy: UpdatePolicy): void {
  try { storage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ schema: 1, policy })) } catch { /* Remote Config keeps its own IndexedDB cache too. */ }
}

export function softUpdateDismissed(storage: Pick<Storage, 'getItem'>, latestVersion: string, now = Date.now()): boolean {
  try {
    const value = JSON.parse(storage.getItem(UPDATE_DISMISS_KEY) ?? 'null') as { version?: unknown; until?: unknown } | null
    return value?.version === latestVersion && typeof value.until === 'number' && value.until > now && value.until <= now + 24 * 60 * 60 * 1000
  } catch { return false }
}

export function dismissSoftUpdate(storage: Pick<Storage, 'setItem'>, latestVersion: string, now = Date.now()): void {
  try { storage.setItem(UPDATE_DISMISS_KEY, JSON.stringify({ version: latestVersion, until: now + 24 * 60 * 60 * 1000 })) } catch { /* Dismissal still works in component state. */ }
}
