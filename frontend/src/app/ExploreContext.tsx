import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const ExploreContext = createContext<{ exploring: boolean; setExploring: (value: boolean) => void; stopExplore: () => void } | null>(null)

/** Shared UI state: opening a real-data workflow always leaves the read-only sample. */
export function ExploreProvider({ children }: { children: ReactNode }) {
  const [exploring, setExploring] = useState(() => {
    try { return sessionStorage.getItem('my-finance:explore') === 'on' } catch { return false }
  })
  useEffect(() => { try { sessionStorage.removeItem('my-finance:explore') } catch { /* Optional discovery preference. */ } }, [])
  const stopExplore = useCallback(() => setExploring(false), [])
  const value = useMemo(() => ({ exploring, setExploring, stopExplore }), [exploring, stopExplore])
  return <ExploreContext.Provider value={value}>{children}</ExploreContext.Provider>
}

export function useExplore() {
  const context = useContext(ExploreContext)
  if (!context) throw new Error('useExplore requires ExploreProvider')
  return context
}
