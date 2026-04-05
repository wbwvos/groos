import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock picnic-api before importing our wrapper
vi.mock('picnic-api', () => {
  const MockPicnicClient = vi.fn(function (this: any) {
    this.auth = {
      login: vi.fn().mockResolvedValue(undefined),
    }
    this.catalog = {
      search: vi.fn().mockResolvedValue([
        { id: 'abc123', name: 'Oatly Havermelk', display_price: 199 }
      ]),
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
})
