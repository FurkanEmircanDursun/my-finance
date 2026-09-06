import { describe, expect, it } from 'vitest'
import { hashPin, randomSalt, verifyPin } from './pin'

describe('pin hashing', () => {
  it('verifies the correct PIN against its own hash', async () => {
    const salt = randomSalt()
    const hash = await hashPin('4321', salt)
    expect(await verifyPin('4321', salt, hash)).toBe(true)
  })

  it('rejects a wrong PIN', async () => {
    const salt = randomSalt()
    const hash = await hashPin('4321', salt)
    expect(await verifyPin('0000', salt, hash)).toBe(false)
  })

  it('produces a different hash for the same PIN under a different salt', async () => {
    const a = await hashPin('4321', randomSalt())
    const b = await hashPin('4321', randomSalt())
    expect(a).not.toBe(b)
  })

  it('generates a fresh salt each time', () => {
    expect(randomSalt()).not.toBe(randomSalt())
  })
})
