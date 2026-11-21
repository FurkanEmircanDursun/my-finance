import { useEffect, useMemo } from 'react'
import type { AssetQuotes } from '../domain/assets'
import { createAssetValuation, upsertAssetValuation } from '../domain/assetsHistory'
import { useStore } from '../store/AppStore'

/** Persist observed portfolio values without fetching prices or fabricating history. */
export function useAssetValuationCapture(quotes: AssetQuotes): void {
  const { state, dispatch } = useStore()
  const holdings = state.profile.assets
  const history = state.profile.assetValuations
  const candidate = useMemo(() => createAssetValuation(holdings ?? [], quotes), [holdings, quotes])
  useEffect(() => {
    if (!state.hydrated || !candidate || (!holdings?.length && !history?.some(item => item.origin === 'quotes'))) return
    const existing = history ?? []
    const next = upsertAssetValuation(existing, candidate)
    if (next !== existing) dispatch({ type: 'setProfile', profile: { assetValuations: next } })
  }, [state.hydrated, holdings, history, candidate, dispatch])
}
