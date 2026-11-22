import { describe, expect, it } from 'vitest'
import { UserFacingError } from '../core/errors'
import { firebaseErrorMessage } from './errors'

describe('Firebase errors at the user boundary', () => {
  it.each(['permission-denied', 'firestore/permission-denied', 'storage/unauthorized', 'functions/permission-denied'])(
    'explains ownership failures without exposing %s or private SDK details', code => {
      const message = firebaseErrorMessage({ code, message: 'users/private-id/path token=secret' }, 'sync')
      expect(message).toContain('yetkin yok')
      expect(message).not.toContain(code)
      expect(message).not.toMatch(/private-id|secret|users\//)
    },
  )
  it.each(['unauthenticated', 'auth/user-token-expired', 'auth/invalid-user-token', 'storage/unauthenticated'])(
    'offers a new session after %s', code => expect(firebaseErrorMessage({ code })).toContain('yeniden giriş'),
  )
  it('asks the user to check the connection when sync is unavailable', () => {
    expect(firebaseErrorMessage({ code: 'unavailable' }, 'sync')).toContain('İnternet bağlantını kontrol edip yeniden dene')
    expect(firebaseErrorMessage({ code: 'auth/network-request-failed' }, 'auth')).toContain('İnternet bağlantısı')
  })
  it('never exposes unknown SDK errors, thrown strings, nested errors or object metadata', () => {
    for (const error of [new Error('FirebaseError: private path'), 'raw secret', { code: 'storage/new-code', message: 'secret' }, { cause: new Error('secret') }, null]) {
      expect(firebaseErrorMessage(error, 'sync')).toBe('Eşitleme tamamlanamadı. Bağlantını kontrol edip yeniden dene.')
    }
  })
  it('preserves only explicitly application-authored recovery instructions', () => {
    expect(firebaseErrorMessage(new UserFacingError('Diğer Mizan sekmelerini kapatıp yeniden dene.'))).toBe('Diğer Mizan sekmelerini kapatıp yeniden dene.')
    expect(firebaseErrorMessage(new Error('Diğer Mizan sekmelerini kapatıp yeniden dene.'))).toBe('İşlem tamamlanamadı. Yeniden dene.')
  })
  it('does not reveal whether an email address exists', () => {
    expect(firebaseErrorMessage({ code: 'auth/user-not-found' }, 'auth')).toBe(firebaseErrorMessage({ code: 'auth/wrong-password' }, 'auth'))
  })
})
