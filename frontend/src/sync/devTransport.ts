import { MemoryCloud } from './memoryTransport'
import type { CommitOp } from './transport'

/**
 * A cloud that lives in the tab session for developing the interface on a machine
 * with `VITE_SYNC_TRANSPORT=memory npm run dev`. Persists its in-memory docs in
 * `sessionStorage` so navigating to static pages (`/privacy.html`, `/account-deletion.html`)
 * or reloading the tab preserves the active session state during development.
 */
const SESSION_KEY = 'mizan:dev-memory-cloud:v1'
let cloud: MemoryCloud | null = null

function opKey(op: CommitOp): string {
  return op.kind === 'settings' ? 'settings' : `${op.kind}:${op.id}`
}

function loadPersistedCloud(): MemoryCloud {
  const instance = new MemoryCloud()
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CommitOp[]>
      for (const [uid, ops] of Object.entries(parsed)) {
        if (Array.isArray(ops) && ops.length > 0) {
          instance.apply(uid, ops)
        }
      }
    }
  } catch {
    // Ignore corrupt dev session cache
  }

  const origApply = instance.apply.bind(instance)
  instance.apply = (uid: string, ops: CommitOp[]) => {
    origApply(uid, ops)
    try {
      if (typeof sessionStorage === 'undefined') return
      const existingRaw = sessionStorage.getItem(SESSION_KEY)
      const all: Record<string, CommitOp[]> = existingRaw
        ? (JSON.parse(existingRaw) as Record<string, CommitOp[]>)
        : {}
      const byKey = new Map<string, CommitOp>()
      for (const prev of all[uid] ?? []) byKey.set(opKey(prev), prev)
      for (const next of ops) byKey.set(opKey(next), next)
      all[uid] = Array.from(byKey.values())
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(all))
    } catch {
      // Ignore storage quota errors in dev
    }
  }

  return instance
}

export function devTransport() {
  cloud ??= loadPersistedCloud()
  return cloud.device('this-tab')
}
