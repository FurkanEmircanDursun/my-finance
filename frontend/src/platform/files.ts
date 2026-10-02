/**
 * Getting a file out of the app, and one in.
 *
 * Three ways out, in the order they are tried:
 *
 *   share     the system share sheet with the file attached — what a phone user
 *             expects, and the only route that works inside most mobile WebViews
 *   download  an `<a download>` — the desktop browser route
 *   (copy)    the caller offers "panoya kopyala" when neither is possible
 *
 * The Android shell has no filesystem plugin yet (`@capacitor/filesystem` would
 * need a native rebuild), so on a device that refuses both of the first two the
 * person is left with the clipboard — which is why every export screen offers it.
 */

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'

export async function saveTextFile(filename: string, text: string, mime: string): Promise<SaveOutcome> {
  const file = typeof File === 'function' ? new File([text], filename, { type: mime }) : null

  // Only a touch device is sent to the share sheet: on a desktop a download is
  // what is wanted, and some desktop browsers expose `share` without meaning it.
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
  if (file && touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      // Dismissing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }

  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoked later, not at once: some browsers start the download after the
    // click handler returns and find the URL already gone.
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Reads a user-chosen file as text, rejecting anything too large to be a backup. */
export async function readTextFile(file: File, maxBytes = 64 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error('Dosya çok büyük.')
  return file.text()
}
