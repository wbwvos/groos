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
  unitQuantity?: string
}

export interface DeliverySlot {
  slot_id: string
  window_start: string
  window_end: string
}

export interface UnavailableIngredient {
  id: string
  name: string
  alternatives: Product[]
}

export interface Recipe {
  id: string
  name: string
  cookingTime: string | null
  productIds: string[]
  unavailable: UnavailableIngredient[]
}

export class PicnicService {
  private client: InstanceType<typeof PicnicClient>
  private username: string
  private password: string
  private recipesCache: { recipes: Recipe[]; fetchedAt: number } | null = null
  private readonly CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

  constructor(username: string, password: string, countryCode: 'NL' | 'DE' = 'NL') {
    const savedKey = loadAuthKey()
    this.client = new PicnicClient(savedKey ? { authKey: savedKey, countryCode } : { countryCode })
    this.username = username
    this.password = password
  }

  async login(): Promise<void> {
    if (loadAuthKey()) {
      // Validate the saved session with a cheap API call
      try {
        await this.client.user.getUserDetails()
        return // Session still valid
      } catch {
        // Session expired — delete and re-login
        saveAuthKey('')
        this.client = new PicnicClient()
      }
    }
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
      unitQuantity: item.unit_quantity ?? item.unit_quantity_text ?? undefined,
    }))
  }

  async getBasket(): Promise<Awaited<ReturnType<typeof this.client.cart.getCart>>> {
    return this.client.cart.getCart()
  }

  async addToBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.cart.addProductToCart(productId, quantity)
  }

  async removeFromBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.cart.removeProductFromCart(productId, quantity)
  }

  async getDeliverySlots(): Promise<DeliverySlot[]> {
    const response = await this.client.cart.getDeliverySlots()
    return response.delivery_slots ?? []
  }

  async setDeliverySlot(slotId: string): Promise<void> {
    await this.client.cart.setDeliverySlot(slotId)
  }

  async clearBasket(): Promise<void> {
    await this.client.cart.clearCart()
  }

  async getMinimumOrderValue(): Promise<number> {
    const result = await this.client.cart.getMinimumOrderValue()
    return result?.minimum_order_value ?? 0
  }

  async confirmOrder(): Promise<void> {
    const cart = await this.client.cart.getCart()
    await this.client.cart.confirmOrder(cart.id)
  }

  async getWeeklyRecipes(): Promise<Recipe[]> {
    const now = Date.now()
    if (this.recipesCache && now - this.recipesCache.fetchedAt < this.CACHE_TTL_MS) {
      return this.recipesCache.recipes
    }
    const homePage: any = await this.client.app.getPage('home_page_root')
    const homeJson = JSON.stringify(homePage)

    // Extract recipe IDs from Snowplow analytics events
    const recipeIdMatches = homeJson.matchAll(/"recipe_id"\s*:\s*"([^"]+)"/g)
    const recipeIds = [...new Set([...recipeIdMatches].map(m => m[1]))]

    const recipes: Recipe[] = []
    for (const id of recipeIds) {
      try {
        const page: any = await this.client.app.getPage(`selling-group-details-page?selling_group_id=${id}`)
        const pageJson = JSON.stringify(page)

        // Recipe name: first long markdown string (>20 chars, not a URL)
        const markdownMatches = pageJson.matchAll(/"markdown"\s*:\s*"([^"]{20,})"/g)
        const markdownStrings = [...markdownMatches].map(m => m[1].replace(/\\n/g, ' ').trim())
        const name = markdownStrings.find(s => !s.startsWith('http') && !s.includes('\\') && s.length < 100) ?? id

        // Filter category labels: real recipe names have ≥ 4 words
        if (name.split(/\s+/).length < 4) continue

        // Cooking time: first "X min" pattern
        const timeMatch = pageJson.match(/"(\d+ min)"/)
        const cookingTime = timeMatch ? timeMatch[1] : null

        // Build map of {id -> {name, price}} for all selling units in the page
        const unitMap = new Map<string, { name: string; price: number }>()
        const unitMatches = pageJson.matchAll(/"id"\s*:\s*"(s\d+)"[^}]{0,300}"name"\s*:\s*"([^"]+)"[^}]{0,300}"price"\s*:\s*(\d+)/g)
        for (const m of unitMatches) unitMap.set(m[1], { name: m[2], price: parseInt(m[3], 10) })

        // Product IDs: sellingUnitIds arrays (s-format), split into available/unavailable
        const sellingUnitMatches = pageJson.matchAll(/"sellingUnitIds"\s*:\s*\[([^\]]+)\]/g)
        const productIds = new Set<string>()
        const unavailableIds = new Set<string>()
        for (const match of sellingUnitMatches) {
          const ids = match[1].matchAll(/"(s\d+)"/g)
          for (const idMatch of ids) {
            const pid = idMatch[1]
            const unit = unitMap.get(pid)
            if (unit && unit.price >= 10000) {
              unavailableIds.add(pid)
            } else {
              productIds.add(pid)
            }
          }
        }

        // Search alternatives for unavailable ingredients
        const unavailable: UnavailableIngredient[] = []
        for (const pid of unavailableIds) {
          const unit = unitMap.get(pid)
          const ingredientName = unit?.name ?? pid
          try {
            const alts = await this.search(ingredientName)
            const validAlts = alts.filter(a => a.price < 10000).slice(0, 3)
            unavailable.push({ id: pid, name: ingredientName, alternatives: validAlts })
          } catch {
            unavailable.push({ id: pid, name: ingredientName, alternatives: [] })
          }
        }

        recipes.push({ id, name, cookingTime, productIds: [...productIds], unavailable })
      } catch {
        // Skip recipes that fail to load
      }
    }

    this.recipesCache = { recipes, fetchedAt: Date.now() }
    return recipes
  }

  async request2FA(): Promise<void> {
    try {
      await this.client.auth.generate2FACode('SMS')
    } catch (err) {
      // Picnic returns an empty body for 2FA endpoints, causing a JSON parse
      // error even when the request succeeds. Ignore parse errors only.
      if (!String(err).toLowerCase().includes('json') && !String(err).toLowerCase().includes('parse')) {
        throw err
      }
    }
  }

  async verify2FA(code: string): Promise<void> {
    try {
      const result = await this.client.auth.verify2FACode(code)
      saveAuthKey(result.authKey)
    } catch (err) {
      // Same empty-body quirk as request2FA — if the key was updated
      // the session file will be refreshed on next login() call instead.
      if (!String(err).toLowerCase().includes('json') && !String(err).toLowerCase().includes('parse')) {
        throw err
      }
    }
  }
}

export function createPicnicService(): PicnicService {
  const username = process.env.PICNIC_USERNAME
  const password = process.env.PICNIC_PASSWORD
  const countryCode = (process.env.PICNIC_COUNTRY_CODE ?? 'NL') as 'NL' | 'DE'
  if (!username || !password) {
    throw new Error('PICNIC_USERNAME en PICNIC_PASSWORD zijn vereist in .env')
  }
  return new PicnicService(username, password, countryCode)
}
