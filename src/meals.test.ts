import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function(this: any) {
    this.messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'pasta bolognese\ngroentecurry\nomelet met groenten' }]
      })
    }
  })
}))

import { suggestMeals } from './meals.js'

describe('suggestMeals', () => {
  it('returns 3 meal suggestions as strings', async () => {
    const knownMeals = ['pasta carbonara', 'rijst met groenten']
    const suggestions = await suggestMeals(knownMeals, 3)
    expect(Array.isArray(suggestions)).toBe(true)
    expect(suggestions).toHaveLength(3)
    suggestions.forEach(s => expect(typeof s).toBe('string'))
  })
})
