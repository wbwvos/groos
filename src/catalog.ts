import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import type { Recipe, RecipeIngredient } from './picnic.ts'

export const CATALOG_PATH = resolve(import.meta.dirname, '../data/recipe-catalog.json')

export interface CatalogEntry {
  id: string
  name: string
  categories: string[]
  cookingTime?: string | null   // undefined = details not fetched; null = no cooking time available
  ingredients?: RecipeIngredient[]
  fetchedAt?: number
  lastUsedAt?: number           // last time added to basket via add_recipe_to_basket
}

export interface RecipeCatalog {
  schemaVersion: 1
  indexRefreshedAt: number | null
  weeklyRefreshedAt: number | null
  entries: Record<string, CatalogEntry>
}

function emptyCatalog(): RecipeCatalog {
  return { schemaVersion: 1, indexRefreshedAt: null, weeklyRefreshedAt: null, entries: {} }
}

export function loadCatalog(): RecipeCatalog {
  try {
    const raw = readFileSync(CATALOG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed.schemaVersion !== 1) return emptyCatalog()
    return parsed as RecipeCatalog
  } catch {
    return emptyCatalog()
  }
}

export function saveCatalog(catalog: RecipeCatalog): void {
  mkdirSync(dirname(CATALOG_PATH), { recursive: true })
  writeFileSync(CATALOG_PATH, JSON.stringify(catalog), 'utf8')
}

/** Add or update a Tier-1 (index-only) entry. Never overwrites existing Tier-2 data. */
export function upsertIndex(catalog: RecipeCatalog, id: string, name: string, category: string): void {
  const existing = catalog.entries[id]
  if (existing) {
    if (!existing.categories.includes(category)) existing.categories.push(category)
    // Only update name if: no Tier-2 details yet AND new name is non-empty and better
    const canUpdateName = existing.ingredients === undefined
    const betterName = name && name.split(' ').length > (existing.name?.split(' ').length ?? 0)
    if (canUpdateName && betterName) existing.name = name
  } else {
    catalog.entries[id] = { id, name, categories: [category] }
  }
}

/** Save full recipe details (Tier-2). Merges categories from existing entry. */
export function upsertDetail(catalog: RecipeCatalog, recipe: Recipe, category?: string): void {
  const existing = catalog.entries[recipe.id]
  const categories = existing?.categories ?? []
  if (category && !categories.includes(category)) categories.push(category)
  catalog.entries[recipe.id] = {
    id: recipe.id,
    name: recipe.name,
    categories,
    cookingTime: recipe.cookingTime,
    ingredients: recipe.ingredients,
    fetchedAt: Date.now(),
  }
}

export function catalogEntryToRecipe(entry: CatalogEntry): Recipe {
  return {
    id: entry.id,
    name: entry.name,
    cookingTime: entry.cookingTime ?? null,
    ingredients: entry.ingredients ?? [],
  }
}

export interface SearchOptions {
  query?: string
  category?: string
  limit?: number
}

export function searchCatalog(catalog: RecipeCatalog, opts: SearchOptions): CatalogEntry[] {
  const { query, category, limit = 20 } = opts
  const queryLower = query?.toLowerCase()
  const categoryLower = category?.toLowerCase()

  let results = Object.values(catalog.entries).filter(entry => {
    if (queryLower && !entry.name.toLowerCase().includes(queryLower)) return false
    if (categoryLower && !entry.categories.some(c => c.toLowerCase().includes(categoryLower))) return false
    return true
  })

  // Tier-2 entries (with ingredients) first, then alphabetical
  results.sort((a, b) => {
    const aHasDetails = a.ingredients !== undefined ? 0 : 1
    const bHasDetails = b.ingredients !== undefined ? 0 : 1
    if (aHasDetails !== bHasDetails) return aHasDetails - bHasDetails
    return a.name.localeCompare(b.name, 'nl')
  })

  return results.slice(0, limit)
}

/**
 * Clean an accessibilityLabel to extract just the recipe name.
 *
 * Category pages: "Recipe name, N uur, X min"  → "Recipe name"
 * List pages:     "Tagline Recipe name gerecht voor N personen X Bereidingstijd." → "Recipe name"
 */
function cleanAccessibilityLabel(raw: string): string {
  // Strip "gerecht voor N personen X Bereidingstijd." suffix (list/detail pages)
  let name = raw.replace(/\s+gerecht voor \d+ personen.*$/i, '')
  // Strip ", [N] uur[, X min]" suffix (category pages: "Recipe name, 0 uur, 15 min" or "Recipe name, uur")
  name = name.replace(/,\s*\d*\s*uur,?\s*(\d+\s*min\s*)?$/i, '')
             .replace(/,\s*\d+\s*min\s*$/i, '')
  return name.trim()
}

/**
 * Extract recipe IDs and names from a Picnic page JSON string.
 *
 * Strategy:
 * 1. Find each `recipe_id` occurrence
 * 2. Within the next 1500 chars, look for `accessibilityLabel` (contains "Name, N uur, X min")
 * 3. Strip the cooking-time suffix to get the clean recipe name
 */
export function extractRecipeStubs(pageJson: string): Array<{ id: string; name: string }> {
  const stubs = new Map<string, string>()

  for (const idMatch of pageJson.matchAll(/"recipe_id"\s*:\s*"([^"]+)"/g)) {
    const id = idMatch[1]
    if (stubs.has(id)) continue

    // Search for accessibilityLabel within 1500 chars after the recipe_id
    const window = pageJson.slice(idMatch.index!, idMatch.index! + 1500)
    const alMatch = window.match(/"accessibilityLabel"\s*:\s*"([^"]+)"/)
    if (alMatch) {
      stubs.set(id, cleanAccessibilityLabel(alMatch[1]))
    } else {
      stubs.set(id, '')
    }
  }

  return [...stubs.entries()].map(([id, name]) => ({ id, name }))
}
