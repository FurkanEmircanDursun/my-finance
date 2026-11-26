import { describe, expect, it } from 'vitest'
import { CATEGORIES, SORTED_CATEGORIES, sortCategoriesTr } from './categories'

describe('categories Turkish alphabetical sorting', () => {
  it('sorts categories A-Z in Turkish locale while keeping Diğer at the end', () => {
    expect(SORTED_CATEGORIES).toHaveLength(CATEGORIES.length)
    expect(SORTED_CATEGORIES[SORTED_CATEGORIES.length - 1].id).toBe('other')

    const nonOther = SORTED_CATEGORIES.slice(0, -1)
    for (let i = 1; i < nonOther.length; i++) {
      expect(nonOther[i - 1].label.localeCompare(nonOther[i].label, 'tr')).toBeLessThanOrEqual(0)
    }

    // Verify Turkish-specific ordering spots
    const labels = nonOther.map((c) => c.label)
    expect(labels[0]).toBe('Abonelik & Dijital')
    expect(labels.indexOf('Eğitim & Kitap')).toBeLessThan(labels.indexOf('Eğlence & Kültür'))
    expect(labels.indexOf('Ödül & İade')).toBeGreaterThan(labels.indexOf('Nakit Avans'))
    expect(labels.indexOf('Sağlık')).toBeLessThan(labels.indexOf('Seyahat & Konaklama'))
    expect(labels[labels.length - 1]).toBe('Yeme & İçme')
  })

  it('sorts arbitrary subsets with sortCategoriesTr and preserves Diğer last', () => {
    const subset = sortCategoriesTr([
      { id: 'other', label: 'Diğer' },
      { id: 'dining', label: 'Yeme & İçme' },
      { id: 'bills', label: 'Fatura & Telekom' },
      { id: 'education', label: 'Eğitim & Kitap' },
      { id: 'transport', label: 'Ulaşım & Akaryakıt' },
    ])
    expect(subset.map((x) => x.label)).toEqual([
      'Eğitim & Kitap',
      'Fatura & Telekom',
      'Ulaşım & Akaryakıt',
      'Yeme & İçme',
      'Diğer',
    ])
  })
})
