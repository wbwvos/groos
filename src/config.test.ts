import { describe, it, expect } from 'vitest'
import { loadStaples, loadMeals } from './config.js'

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
