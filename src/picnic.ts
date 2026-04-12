import PicnicClient from 'picnic-api'
import dotenv from 'dotenv'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { type RecipeCatalog, upsertIndex, upsertDetail, catalogEntryToRecipe, extractRecipeStubs } from './catalog.js'

dotenv.config({ path: resolve(import.meta.dirname, '../.env') })

const SESSION_FILE = resolve(import.meta.dirname, '../.picnic-session')

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
  decorators?: any[]
}

export interface DeliverySlot {
  slot_id: string
  window_start: string
  window_end: string
  slot_characteristics?: string[]
  is_green?: boolean
}

export type IngredientType = 'CORE' | 'CUPBOARD' | 'VARIATION'

export interface RecipeIngredient {
  sellingUnitId: string
  ingredientId: string
  ingredientType: IngredientType
  price: number
}

export interface Recipe {
  id: string
  name: string
  cookingTime: string | null
  ingredients: RecipeIngredient[]
}

export class PicnicService {
  private client: InstanceType<typeof PicnicClient>
  private username: string
  private password: string

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
      decorators: item.decorators ?? [],
    }))
  }

  async getBasket(): Promise<Awaited<ReturnType<typeof this.client.cart.getCart>>> {
    return this.client.cart.getCart()
  }

  async addToBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.cart.addProductToCart(productId, quantity)
  }

  async assignSellingGroupToBasket(
    sellingGroupId: string,
    ingredientIds: string[],
    portions: number = 4,
  ): Promise<void> {
    await (this.client as any).sendRequest(
      'POST',
      '/pages/task/assign-selling-group-to-basket',
      {
        payload: {
          day_offset: 999,
          portions,
          selected_components_ids: ingredientIds,
          selling_group_id: sellingGroupId,
        },
      },
      true,
    )
  }

  async removeFromBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.cart.removeProductFromCart(productId, quantity)
  }

  async getDeliverySlots(): Promise<DeliverySlot[]> {
    const [response, greenIds] = await Promise.all([
      this.client.cart.getDeliverySlots(),
      this.getGreenSlotIds(),
    ])
    return (response.delivery_slots ?? []).map((slot: any) => ({
      slot_id: slot.slot_id,
      window_start: slot.window_start,
      window_end: slot.window_end,
      slot_characteristics: slot.slot_characteristics ?? [],
      is_green: greenIds.has(slot.slot_id),
    }))
  }

  private async getGreenSlotIds(): Promise<Set<string>> {
    try {
      const page: any = await this.client.app.getPage('slot-selector-root')
      const pageJson = JSON.stringify(page)
      const matches = pageJson.matchAll(/"is_green_slot":true[^}]{0,200}"slot_id":"([^"]+)"/g)
      return new Set([...matches].map(m => m[1]))
    } catch {
      return new Set()
    }
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
    // TODO: Picnic requires a payment step (iDEAL for first order, direct debit after) before
    // confirmOrder can be called. The checkout flow creates a numeric order_id via a payment
    // initiation endpoint that is not yet implemented here. Once direct debit is active after
    // the first order, this flow can be revisited.
    // See: https://github.com/wbwvos/groos/issues (checkout flow investigation)
    const cart = await this.client.cart.getCart()
    await this.client.cart.confirmOrder(cart.id)
  }

  async getDeliveryAddress(): Promise<string> {
    try {
      const user = await this.client.user.getUserDetails()
      const a = user.address
      const ext = a.house_number_ext ? ` ${a.house_number_ext}` : ''
      return `${a.street} ${a.house_number}${ext}, ${a.postcode} ${a.city}`
    } catch {
      return '(adres niet beschikbaar)'
    }
  }

  async getWeeklyRecipes(): Promise<Recipe[]> {
    const { loadCatalog, saveCatalog } = await import('./catalog.js')
    const catalog = loadCatalog()
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const stale = !catalog.weeklyRefreshedAt || Date.now() - catalog.weeklyRefreshedAt > WEEK_MS
    if (stale) {
      const recipes = await this.refreshWeeklyRecipes(catalog)
      saveCatalog(catalog)
      return recipes
    }
    const cached = Object.values(catalog.entries)
      .filter(e => e.categories.includes('THIS_WEEK') && e.ingredients !== undefined)
      .map(catalogEntryToRecipe)
    return cached.length > 0 ? cached : this.refreshWeeklyRecipes(catalog).then(async r => {
      saveCatalog(catalog)
      return r
    })
  }

  /** Fetch THIS_WEEK recipes with full details; index NEW + SAVED as Tier-1 only. */
  async refreshWeeklyRecipes(catalog: RecipeCatalog): Promise<Recipe[]> {
    // Clear old THIS_WEEK tags so stale entries don't linger
    for (const entry of Object.values(catalog.entries)) {
      entry.categories = entry.categories.filter(c => c !== 'THIS_WEEK')
    }

    // Fetch THIS_WEEK IDs
    const thisWeekStubs = await this.fetchSegmentStubs('THIS_WEEK_RECIPES')

    // Index NEW and SAVED as Tier-1 (fire-and-forget errors)
    await Promise.allSettled([
      this.fetchSegmentStubs('NEW_RECIPES').then(stubs =>
        stubs.forEach(s => upsertIndex(catalog, s.id, s.name, 'NEW_RECIPES'))
      ),
      this.fetchSegmentStubs('SAVED_RECIPES').then(stubs =>
        stubs.forEach(s => upsertIndex(catalog, s.id, s.name, 'SAVED_RECIPES'))
      ),
    ])

    // Fetch full details for THIS_WEEK recipes
    const recipes: Recipe[] = []
    for (const stub of thisWeekStubs) {
      try {
        let recipe: Recipe
        if (catalog.entries[stub.id]?.ingredients !== undefined) {
          recipe = catalogEntryToRecipe(catalog.entries[stub.id])
        } else {
          recipe = await this.fetchRecipeDetail(stub.id)
        }
        upsertDetail(catalog, recipe, 'THIS_WEEK')
        // Also ensure THIS_WEEK tag is present (upsertDetail may not add it if entry existed)
        if (!catalog.entries[stub.id].categories.includes('THIS_WEEK')) {
          catalog.entries[stub.id].categories.push('THIS_WEEK')
        }
        recipes.push(recipe)
      } catch {
        // Skip recipes that fail to load
      }
    }

    catalog.weeklyRefreshedAt = Date.now()
    return recipes
  }

  /** Fetch recipe IDs + names from a see-more-recipes-page segmentType. */
  private async fetchSegmentStubs(segmentType: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const page: any = await this.client.app.getPage(`see-more-recipes-page?segmentType=${segmentType}`)
      return extractRecipeStubs(JSON.stringify(page))
    } catch {
      return []
    }
  }

  /** Fetch full recipe details (name, cookingTime, ingredients) for a single ID. */
  async fetchRecipeDetail(id: string): Promise<Recipe> {
    const page: any = await this.client.app.getPage(`selling-group-details-page?selling_group_id=${id}`)
    const pageJson = JSON.stringify(page)

    // Recipe name: first long markdown string (>20 chars, not a URL, ≥4 words)
    const markdownMatches = pageJson.matchAll(/"markdown"\s*:\s*"([^"]{20,})"/g)
    const markdownStrings = [...markdownMatches].map(m => m[1].replace(/\\n/g, ' ').trim())
    const name = markdownStrings.find(s => !s.startsWith('http') && !s.includes('\\') && s.length < 100 && s.split(/\s+/).length >= 4) ?? id

    // Cooking time: first "X min" pattern
    const timeMatch = pageJson.match(/"(\d+ min)"/)
    const cookingTime = timeMatch ? timeMatch[1] : null

    // Parse ingredientsState — contains type (CORE/CUPBOARD/VARIATION) per ingredient
    const ingredientsState: any[] | null = this.findIngredientsState(page)
    let ingredients: RecipeIngredient[] = []

    if (ingredientsState) {
      for (const item of ingredientsState) {
        const type: IngredientType = item.ingredientType === 'CUPBOARD' ? 'CUPBOARD'
          : item.ingredientType === 'VARIATION' ? 'VARIATION'
          : 'CORE'
        for (const [sellingUnitId, unit] of Object.entries(item.sellingUnits as Record<string, any>)) {
          ingredients.push({
            sellingUnitId,
            ingredientId: item.ingredientId,
            ingredientType: type,
            price: unit.price ?? 0,
          })
        }
      }
    } else {
      // Fallback: parse sellingUnitIds from JSON
      const suMatch = pageJson.match(/"sellingUnitIds"\s*:\s*\[([^\]]+)\]/)
      if (suMatch) {
        const ids = [...suMatch[1].matchAll(/"(s\d+)"/g)].map(m => m[1])
        ingredients = ids.map(sellingUnitId => ({
          sellingUnitId, ingredientId: '', ingredientType: 'CORE' as IngredientType, price: 0,
        }))
      }
    }

    return { id, name, cookingTime, ingredients }
  }

  /** Get recipe details: from disk cache if available, otherwise fetch from API and cache. */
  async getCatalogRecipeDetail(id: string, catalog: RecipeCatalog): Promise<Recipe> {
    if (catalog.entries[id]?.ingredients !== undefined) {
      return catalogEntryToRecipe(catalog.entries[id])
    }
    const recipe = await this.fetchRecipeDetail(id)
    upsertDetail(catalog, recipe)
    return recipe
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

  private findIngredientsState(obj: any): any[] | null {
    if (!obj || typeof obj !== 'object') return null
    if (Array.isArray(obj.ingredientsState) && obj.ingredientsState.length > 0) return obj.ingredientsState
    for (const v of Object.values(obj)) {
      const result = this.findIngredientsState(v)
      if (result) return result
    }
    return null
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
