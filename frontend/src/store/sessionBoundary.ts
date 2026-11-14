export interface SessionBoundary {
  suspend(checkpoint: boolean): Promise<void>
  signOut(): Promise<void>
  clearDevice(): Promise<void>
  resume(): void
}

/** No cloud-erasure port exists on a logout or local-device reset. */
export async function leaveSession(boundary: SessionBoundary, clearLocal: boolean): Promise<void> {
  try {
    await boundary.suspend(!clearLocal)
    await boundary.signOut()
    if (clearLocal) await boundary.clearDevice()
  } finally {
    boundary.resume()
  }
}
