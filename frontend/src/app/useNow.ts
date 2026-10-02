import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every `everyMs` — so "3 dk önce" keeps counting
 * while a sheet stays open instead of freezing at whatever it said on arrival.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(timer)
  }, [everyMs])
  return now
}
