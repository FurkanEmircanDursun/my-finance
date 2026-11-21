import { describe, expect, it } from 'vitest'
import { cacheUpdatePolicy, compareVersions, dismissSoftUpdate, parseUpdatePolicy, readCachedUpdatePolicy, resolveUpdateUrl, safeUpdateUrl, softUpdateDismissed, updateDecision, UPDATE_CACHE_KEY } from './updatesPolicy'

const config = { min_required_version: '2.4.0', latest_version: '2.6.0', update_url: 'https://play.google.com/store/apps/details?id=com.faraday.followfinance', update_message: 'Daha akıcı bir Mizan.' }
function storage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('release version and update policy', () => {
  it('compares numeric components rather than strings', () => {
    expect(compareVersions('2.10.0', '2.9.9')).toBe(1)
    expect(compareVersions('2.5.0', '3.0.0')).toBe(-1)
    expect(compareVersions('2.5.0+android.4005', '2.5.0')).toBe(0)
  })
  it('orders prerelease identifiers correctly', () => {
    expect(compareVersions('3.0.0-rc.9', '3.0.0-rc.10')).toBe(-1)
    expect(compareVersions('3.0.0-rc.1', '3.0.0')).toBe(-1)
    expect(compareVersions('3.0.0-alpha', '3.0.0-alpha.1')).toBe(-1)
    expect(compareVersions('3.0.0-1', '3.0.0-beta')).toBe(-1)
  })
  it.each(['2.5', '2.05.0', 'v2.5.0', '2.5.0-01', '2.5.0.', '99999999999999999999999.0.0'])('rejects ambiguous or unsafe version %s', value => {
    expect(compareVersions(value, '2.5.0')).toBeNull()
  })
  it('distinguishes mandatory, optional, current and newer installed versions', () => {
    const policy = parseUpdatePolicy(config)
    expect(updateDecision('2.3.9', policy)).toBe('hard')
    expect(updateDecision('2.4.0', policy)).toBe('soft')
    expect(updateDecision('2.6.0', policy)).toBe('none')
    expect(updateDecision('3.0.0', policy)).toBe('none')
    expect(updateDecision(null, policy)).toBe('none')
  })
  it('does not accept contradictory minimum/latest versions or a missing update destination', () => {
    expect(parseUpdatePolicy({ ...config, min_required_version: '3.0.0' })).toBeNull()
    expect(parseUpdatePolicy({ ...config, update_url: '' })).toBeNull()
    expect(parseUpdatePolicy({ ...config, latest_version: 'latest' })).toBeNull()
  })
  it('accepts an explicit disabled policy without a destination', () => {
    const policy = parseUpdatePolicy({ min_required_version: '0.0.0', latest_version: '0.0.0', update_url: '' })
    expect(policy).not.toBeNull()
    expect(updateDecision('2.5.0', policy)).toBe('none')
  })
  it('keeps remote messages as bounded plain text', () => {
    expect(parseUpdatePolicy({ ...config, update_message: ' x '.repeat(600) })?.message).toHaveLength(500)
    expect(parseUpdatePolicy({ ...config, update_message: undefined })?.message).toBe('')
  })
})

describe('update destination and durable offline policy', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', 'http://example.com/update', 'https://user:password@example.com', 'https://localhost/update', 'file:///new.apk', 'market://details?id=other.package', 'https://example.com/ new.apk'])('rejects unsafe destination %s', value => {
    expect(safeUpdateUrl(value)).toBeNull()
  })
  it('permits verified HTTPS routes and this installed package market route', () => {
    expect(safeUpdateUrl(config.update_url)).toBe(config.update_url)
    expect(safeUpdateUrl('market://details?id=com.faraday.followfinance')).toBe('market://details?id=com.faraday.followfinance')
  })
  it('retains a known hard policy across a restart without network access', () => {
    const local = storage()
    const policy = parseUpdatePolicy(config)!
    cacheUpdatePolicy(local, policy)
    expect(updateDecision('2.3.0', readCachedUpdatePolicy(local))).toBe('hard')
  })
  it('fails open for a malformed or poisoned local cache', () => {
    const local = storage()
    local.setItem(UPDATE_CACHE_KEY, '{')
    expect(readCachedUpdatePolicy(local)).toBeNull()
    local.setItem(UPDATE_CACHE_KEY, JSON.stringify({ schema: 1, policy: { minRequiredVersion: '99.0.0', latestVersion: '99.0.0', updateUrl: 'javascript:alert(1)' } }))
    expect(readCachedUpdatePolicy(local)).toBeNull()
  })
  it('postpones only the same optional release for 24 hours, never mandatory policy', () => {
    const local = storage(), now = 1000000
    dismissSoftUpdate(local, '2.6.0', now)
    expect(softUpdateDismissed(local, '2.6.0', now + 1)).toBe(true)
    expect(softUpdateDismissed(local, '2.7.0', now + 1)).toBe(false)
    expect(softUpdateDismissed(local, '2.6.0', now + 24 * 60 * 60 * 1000)).toBe(false)
    expect(updateDecision('2.3.0', parseUpdatePolicy(config))).toBe('hard')
  })
  it('keeps native usable while store links are empty and the general URL only updates the web app', () => {
    const policy = parseUpdatePolicy({ ...config, update_url: 'https://my-finance-webapp-fd.web.app', update_url_android: '', update_url_ios: '' })!
    expect(updateDecision('2.3.0', policy, 'web')).toBe('hard')
    expect(updateDecision('2.3.0', policy, 'android')).toBe('none')
    expect(updateDecision('2.3.0', policy, 'ios')).toBe('none')
    expect(resolveUpdateUrl(policy, 'android')).toBeNull()
  })
  it('resolves independent native URLs without crossing platforms', () => {
    const policy = parseUpdatePolicy({ ...config, update_url: 'https://mizan.test/web', update_url_android: 'https://mizan.test/release.apk', update_url_ios: 'https://apps.apple.com/tr/app/id123456789' })!
    expect(resolveUpdateUrl(policy, 'android')).toBe('https://mizan.test/release.apk')
    expect(resolveUpdateUrl(policy, 'ios')).toBe('https://apps.apple.com/tr/app/id123456789')
    expect(resolveUpdateUrl(policy, 'web')).toBe('https://mizan.test/web')
    expect(updateDecision('2.4.0', policy, 'android')).toBe('soft')
    expect(updateDecision('2.3.0', policy, 'ios')).toBe('hard')
  })
  it('supports legacy market/store links only for their intended platform', () => {
    const play = parseUpdatePolicy(config)!
    expect(resolveUpdateUrl(play, 'android')).toBe(config.update_url)
    expect(resolveUpdateUrl(play, 'ios')).toBeNull()
    const apple = parseUpdatePolicy({ ...config, update_url: 'https://apps.apple.com/tr/app/id123456789' })!
    expect(resolveUpdateUrl(apple, 'ios')).toContain('apps.apple.com')
    expect(resolveUpdateUrl(apple, 'android')).toBeNull()
    const market = parseUpdatePolicy({ ...config, update_url: 'market://details?id=com.faraday.followfinance' })!
    expect(resolveUpdateUrl(market, 'android')).toContain('market:')
    expect(resolveUpdateUrl(market, 'web')).toBeNull()
    expect(resolveUpdateUrl(market, 'ios')).toBeNull()
  })
  it('drops unsafe dedicated URLs without forcing an unusable native update', () => {
    const policy = parseUpdatePolicy({ ...config, update_url: 'https://mizan.test/web', update_url_android: 'javascript:alert(1)', update_url_ios: 'market://details?id=com.faraday.followfinance' })!
    expect(updateDecision('2.0.0', policy, 'android')).toBe('none')
    expect(updateDecision('2.0.0', policy, 'ios')).toBe('none')
  })
  it('reads a legacy cache without platform fields while retaining safe fallback rules', () => {
    const local = storage()
    local.setItem(UPDATE_CACHE_KEY, JSON.stringify({ schema: 1, policy: { minRequiredVersion: '2.4.0', latestVersion: '2.6.0', updateUrl: 'https://mizan.test/web', message: '' } }))
    const policy = readCachedUpdatePolicy(local)!
    expect(updateDecision('2.3.0', policy, 'web')).toBe('hard')
    expect(updateDecision('2.3.0', policy, 'android')).toBe('none')
  })
})
