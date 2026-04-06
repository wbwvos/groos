import { describe, it, expect } from 'vitest'
import { loadStaples, loadMeals, parseStapleString, saveStaples } from './config.js'

describe('loadStaples', () => {
  it('returns an array of staple items', async () => {
    const staples = await loadStaples()
    expect(Array.isArray(staples)).toBe(true)
    expect(staples.length).toBeGreaterThan(0)
    expect(staples[0]).toHaveProperty('name')
    expect(staples[0]).toHaveProperty('quantity')
  })
})

describe('loadMeals', () => {
  it('returns an array of meal names', async () => {
    const meals = await loadMeals()
    expect(Array.isArray(meals)).toBe(true)
    expect(meals.length).toBeGreaterThan(0)
    expect(typeof meals[0]).toBe('string')
  })
})

describe('parseStapleString', () => {
  it('parses items with quantity prefix', () => {
    const result = parseStapleString('2x havermelk')
    expect(result).toEqual({ quantity: 2, name: 'havermelk' })
  })

  it('parses items with quantity prefix and spaces', () => {
    const result = parseStapleString('3x  rode  appels')
    expect(result).toEqual({ quantity: 3, name: 'rode  appels' })
  })

  it('defaults to quantity 1 for items without prefix', () => {
    const result = parseStapleString('bananen')
    expect(result).toEqual({ quantity: 1, name: 'bananen' })
  })

  it('handles multi-digit quantities', () => {
    const result = parseStapleString('12x eieren')
    expect(result).toEqual({ quantity: 12, name: 'eieren' })
  })

  it('trims whitespace in fallback branch', () => {
    const result = parseStapleString('  bananen  ')
    expect(result).toEqual({ quantity: 1, name: 'bananen' })
  })

  it('throws an error for malformed Nx prefix (no space)', () => {
    expect(() => parseStapleString('2xhavermelk')).toThrow(
      'Ongeldig staples formaat: "2xhavermelk". Gebruik "2x havermelk" of "havermelk".'
    )
  })
})

describe('saveStaples roundtrip', () => {
  it('saves staples and loads them back unchanged', async () => {
    const original = await loadStaples()
    const testStaples = [
      { name: 'havermelk', quantity: 3 },
      { name: 'bananen', quantity: 2 },
      { name: 'eieren', quantity: 1 },
    ]
    await saveStaples(testStaples)
    const loaded = await loadStaples()
    expect(loaded).toEqual(testStaples)
    // Restore original
    await saveStaples(original)
  })
})
