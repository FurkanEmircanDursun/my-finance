import { useCallback, useEffect, useState } from 'react'

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
 * This temporary screen preference belongs to the active workspace.
 */
export function usePrivacy(): [boolean, () => void] {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (on) root.setAttribute('data-private', 'on')
    else root.removeAttribute('data-private')

    return () => root.removeAttribute('data-private')
  }, [on])

  return [on, useCallback(() => setOn((v) => !v), [])]
}
