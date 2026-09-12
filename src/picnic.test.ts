import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fs so no real .picnic-session file interferes
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

// Mock picnic-api before importing our wrapper
vi.mock('picnic-api', () => {
  const MockPicnicClient = vi.fn(function (this: any) {
    this.sendRequest = vi.fn().mockResolvedValue(undefined)
    this.auth = {
      login: vi.fn().mockResolvedValue({ authKey: 'test-auth-key' }),
    }
    this.catalog = {
      search: vi.fn().mockResolvedValue([
        { id: 'abc123', name: 'Oatly Havermelk', display_price: 199 }
      ]),
    }
    this.app = {
      getPage: vi.fn(),
    }
    this.cart = {
      getCart: vi.fn().mockResolvedValue({ items: [] }),
      addProductToCart: vi.fn().mockResolvedValue(undefined),
      getDeliverySlots: vi.fn().mockResolvedValue({
        delivery_slots: [
          { slot_id: 'slot1', window_start: '2026-04-06T09:00:00', window_end: '2026-04-06T11:00:00' }
        ]
      }),
      setDeliverySlot: vi.fn().mockResolvedValue(undefined),
    }
  })
  return { default: MockPicnicClient }
})

import { PicnicService } from './picnic.js'

describe('PicnicService', () => {
  let service: PicnicService

  beforeEach(() => {
    service = new PicnicService('test@test.nl', 'wachtwoord')
  })

  it('calls auth.login with correct credentials', async () => {
    await service.login()
    expect((service as any).client.auth.login).toHaveBeenCalledWith('test@test.nl', 'wachtwoord')
  })

  it('can search for products', async () => {
    await service.login()
    const results = await service.search('havermelk')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Oatly Havermelk')
    expect(results[0].id).toBe('abc123')
  })

  it('can get basket', async () => {
    await service.login()
    const basket = await service.getBasket()
    expect(basket).toHaveProperty('items')
  })

  it('can add product to basket', async () => {
    await service.login()
    await expect(service.addToBasket('abc123', 2)).resolves.not.toThrow()
  })

  it('can get delivery slots', async () => {
    await service.login()
    const slots = await service.getDeliverySlots()
    expect(slots).toHaveLength(1)
    expect(slots[0]).toHaveProperty('slot_id')
    expect(slots[0]).toHaveProperty('window_start')
  })

  describe('fetchRecipeDetail', () => {
    /** Mirrors the real page: tagline and description sit next to the HEADLINE1 title. */
    function recipePage(title: string) {
      return {
        body: {
          children: [
            { markdown: title, numberOfLines: 1, textType: 'HEADLINE1', type: 'RICH_TEXT' },
            { markdown: 'Familiefavoriet', type: 'RICH_TEXT' },
            { markdown: title, textAttributes: { size: 28 }, type: 'RICH_TEXT' },
            { markdown: 'Heerlijk romig en boordevol groenten. Een nieuwe favoriet!', type: 'RICH_TEXT' },
            { markdown: '25 min', type: 'RICH_TEXT' },
          ],
        },
      }
    }

    it('takes the title from the HEADLINE1 node, not the description', async () => {
      await service.login()
      ;(service as any).client.app.getPage.mockResolvedValue(recipePage('Pasta-pestoschotel met kipgehakt'))
      const recipe = await service.fetchRecipeDetail('r1')
      expect(recipe.name).toBe('Pasta-pestoschotel met kipgehakt')
    })

    it('keeps short titles that the old word-count heuristic skipped', async () => {
      await service.login()
      ;(service as any).client.app.getPage.mockResolvedValue(recipePage('Quiche caprese'))
      const recipe = await service.fetchRecipeDetail('r2')
      expect(recipe.name).toBe('Quiche caprese')
    })

    it('falls back to a markdown string when no headline is present', async () => {
      await service.login()
      ;(service as any).client.app.getPage.mockResolvedValue({
        body: { children: [{ markdown: 'Mie met ketjapballetjes', type: 'RICH_TEXT' }] },
      })
      const recipe = await service.fetchRecipeDetail('r3')
      expect(recipe.name).toBe('Mie met ketjapballetjes')
    })

    it('falls back to the id when the page has no usable text', async () => {
      await service.login()
      ;(service as any).client.app.getPage.mockResolvedValue({ body: { children: [] } })
      const recipe = await service.fetchRecipeDetail('r4')
      expect(recipe.name).toBe('r4')
    })
  })
})
