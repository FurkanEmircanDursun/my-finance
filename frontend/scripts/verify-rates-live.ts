import { refreshAssetRates } from '../src/platform/rates'

const snapshot = await refreshAssetRates(true)
const quotes = Object.values(snapshot.quotes)
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  instruments: quotes.map(value => ({ instrument: value!.instrument, source: value!.source, kind: value!.kind, asOf: new Date(value!.asOf).toISOString(), tryPerUnit: value!.tryPerUnit })),
  warning: snapshot.warning,
}, null, 2))
if (quotes.length !== 5) throw new Error('All five asset quotes must be available for this live provider check')
