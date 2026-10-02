import type { Profile, Settings } from '../domain/types'

/**
 * Defaults live apart from the reducer so the modules the reducer itself imports
 * — backup and restore — can read them without importing it back.
 */

export const defaultProfile: Profile = {
  monthlyIncome: 0,
  spendingLimit: 0,
  currentBalance: 0,
  budgets: [],
  goal: null,
}

export const defaultSettings: Settings = {
  theme: 'system',
  useLocalOcr: false,
  ocrEndpoint: 'http://127.0.0.1:8005/api/ocr',
  periodGrouping: null,
  lockPinHash: null,
  lockPinSalt: null,
  onboardingSeen: false,
}
