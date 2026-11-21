import { describe, expect, it } from 'vitest'
import { parseRoute, resolveView, routeHash } from './navigation'

describe('page routes', () => {
  it('keeps settings and cards as independent full-page destinations', () => {
    expect(parseRoute('#/settings')).toEqual({ view: 'settings' })
    expect(parseRoute('#/cards')).toEqual({ view: 'cards' })
    expect(parseRoute('#/assets')).toEqual({ view: 'assets' })
    expect(parseRoute('#/analysis')).toEqual({ view: 'analysis' })
    expect(parseRoute('#/spending')).toEqual({ view: 'spending' })
  })
  it('round trips exact card identities without treating bank labels as IDs', () => {
    const id = 'card / Akbank # 1234'
    expect(parseRoute(routeHash('card-detail', id))).toEqual({ view: 'card-detail', cardId: id })
  })
  it('recovers malformed routes and retains old insight deep links', () => {
    expect(parseRoute('#/cards/%ZZ')).toEqual({ view: 'cards' })
    expect(resolveView('commitments')).toBe('future')
    expect(resolveView('unknown')).toBe('overview')
  })
})
