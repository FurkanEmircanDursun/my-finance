import { useCallback, useEffect, useState } from 'react'

const KEY = 'my-finance:private'

/**
 * "Hide the numbers" — the toggle every banking app puts next to the balance.
 *
 * It is not the PIN lock's job. The lock answers "someone else picked up my
 * phone"; this answers "someone is sitting next to me", which is the far more
 * common one and the reason a finance app is awkward to open in public at all.
 *
 * The implementation is a single attribute on `<html>`. Every figure in the app
 * already carries the `.num` class for tabular alignment, so the stylesheet
 * blurs them all at once (see `styles/index.css`) and not one component has to
 * know the mode exists.
 *
 * Kept in `localStorage` rather than in `Settings`, deliberately: settings sync
 * to the cloud, and whether this device is in a crowded place is not a fact
 * about the account.
 */
export function usePrivacy(): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'on'
    } catch {
      // Private windows and locked-down browsers throw on access rather than
      // returning null. Visible is the right default when we cannot know.
      return false
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (on) root.setAttribute('data-private', 'on')
    else root.removeAttribute('data-private')

    try {
      if (on) localStorage.setItem(KEY, 'on')
      else localStorage.removeItem(KEY)
    } catch {
      // Persisting is a convenience; the mode still works for this session.
    }
  }, [on])

  return [on, useCallback(() => setOn((v) => !v), [])]
}
