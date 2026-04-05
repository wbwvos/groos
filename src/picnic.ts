import PicnicClient from 'picnic-api'
import 'dotenv/config'

export interface Product {
  id: string
  name: string
  price: number
}

export interface DeliverySlot {
  slot_id: string
  window_start: string
  window_end: string
}

export class PicnicService {
  private client: InstanceType<typeof PicnicClient>
  private username: string
  private password: string

  constructor(username: string, password: string) {
    this.client = new PicnicClient()
    this.username = username
    this.password = password
  }

  async login(): Promise<void> {
    await this.client.auth.login(this.username, this.password)
  }

  async search(query: string): Promise<Product[]> {
    // catalog.search() returns SellingUnit[] directly
    const results = await this.client.catalog.search(query)
    return results.map((item: any) => ({
      id: item.id,
      name: item.name,
      price: item.display_price ?? item.price ?? 0,
    }))
  }

  async getBasket(): Promise<Awaited<ReturnType<typeof this.client.cart.getCart>>> {
    return this.client.cart.getCart()
  }

  async addToBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.cart.addProductToCart(productId, quantity)
  }

  async getDeliverySlots(): Promise<DeliverySlot[]> {
    const response = await this.client.cart.getDeliverySlots()
    return response.delivery_slots ?? []
  }

  async setDeliverySlot(slotId: string): Promise<void> {
    await this.client.cart.setDeliverySlot(slotId)
  }
}

export function createPicnicService(): PicnicService {
  const username = process.env.PICNIC_USERNAME
  const password = process.env.PICNIC_PASSWORD
  if (!username || !password) {
    throw new Error('PICNIC_USERNAME en PICNIC_PASSWORD zijn vereist in .env')
  }
  return new PicnicService(username, password)
}
