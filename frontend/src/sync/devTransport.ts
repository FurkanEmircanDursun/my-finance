import { MemoryCloud } from './memoryTransport'

/**
 * A cloud that lives in the page, for developing the interface on a machine with
 * no reachable Firestore: `VITE_SYNC_TRANSPORT=memory npm run dev`. It forgets
 * everything on reload. It is only ever imported behind `import.meta.env.DEV`, so
 * it is not in a production build.
 */
let cloud: MemoryCloud | null = null

export function devTransport() {
  cloud ??= new MemoryCloud()
  return cloud.device('this-tab')
}
