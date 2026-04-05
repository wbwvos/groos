import PicnicClient from 'picnic-api'
import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const SESSION_FILE = resolve(process.cwd(), '.picnic-session')

function loadAuthKey(): string | undefined {
  if (existsSync(SESSION_FILE)) {
    try { return readFileSync(SESSION_FILE, 'utf8').trim() } catch { /* ignore */ }
  }
}

function saveAuthKey(key: string) {
  writeFileSync(SESSION_FILE, key, 'utf8')
}

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
    const savedKey = loadAuthKey()
    this.client = new PicnicClient(savedKey ? { authKey: savedKey } : undefined)
    this.username = username
    this.password = password
  }

  async login(): Promise<void> {
    if (loadAuthKey()) return // sessie nog geldig
    const result = await this.client.auth.login(this.username, this.password)
    saveAuthKey(result.authKey)
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

  async request2FA(): Promise<void> {
    await this.client.auth.generate2FACode('SMS')
  }

  async verify2FA(code: string): Promise<void> {
    const result = await this.client.auth.verify2FACode(code)
    saveAuthKey(result.authKey)
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
