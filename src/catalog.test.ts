import { describe, it, expect } from 'vitest'
import {
  extractRecipeStubs,
  searchCatalog,
  upsertIndex,
  upsertDetail,
  catalogEntryToRecipe,
} from './catalog.js'
import type { RecipeCatalog } from './catalog.js'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal page JSON that mimics a category page listing */
const CATEGORY_PAGE_FIXTURE = JSON.stringify({
  sections: [
    {
      items: [
        {
          recipe_id: "abc123",
          analytics: { recipe_id: "abc123" },
          accessibilityLabel: "Pasta carbonara, 0 uur, 20 min",
        },
        {
          recipe_id: "def456",
          analytics: { recipe_id: "def456" },
          accessibilityLabel: "Baked feta pasta, uur",
        },
        {
          recipe_id: "ghi789",
          analytics: { recipe_id: "ghi789" },
          accessibilityLabel: "Tandoori kip met rijst gerecht voor 4 personen 35 min Bereidingstijd.",
        },
        {
          recipe_id: "jkl012",
          analytics: { recipe_id: "jkl012" },
          accessibilityLabel: "Aziatische noedels met groenten, 1 uur, 15 min",
        },
      ]
    }
  ]
})

function emptyCatalog(): RecipeCatalog {
  return { schemaVersion: 1, indexRefreshedAt: null, weeklyRefreshedAt: null, entries: {} }
}

// ── extractRecipeStubs ────────────────────────────────────────────────────────

describe('extractRecipeStubs', () => {
  it('extracts recipe IDs from page JSON', () => {
    const stubs = extractRecipeStubs(CATEGORY_PAGE_FIXTURE)
    expect(stubs.map(s => s.id)).toContain('abc123')
    expect(stubs.map(s => s.id)).toContain('def456')
    expect(stubs).toHaveLength(4)
  })

  it('strips ", N uur, X min" cooking time suffix', () => {
    const stubs = extractRecipeStubs(CATEGORY_PAGE_FIXTURE)
    const pasta = stubs.find(s => s.id === 'abc123')
    expect(pasta?.name).toBe('Pasta carbonara')
  })

  it('strips ", uur" suffix without preceding digit (e.g. "Baked feta pasta, uur")', () => {
    const stubs = extractRecipeStubs(CATEGORY_PAGE_FIXTURE)
    const baked = stubs.find(s => s.id === 'def456')
    expect(baked?.name).toBe('Baked feta pasta')
  })

  it('strips "gerecht voor N personen..." suffix from list-style labels', () => {
    const stubs = extractRecipeStubs(CATEGORY_PAGE_FIXTURE)
    const tandoori = stubs.find(s => s.id === 'ghi789')
    expect(tandoori?.name).toBe('Tandoori kip met rijst')
  })

  it('strips ", N uur, X min" with hours > 0', () => {
    const stubs = extractRecipeStubs(CATEGORY_PAGE_FIXTURE)
    const noodles = stubs.find(s => s.id === 'jkl012')
    expect(noodles?.name).toBe('Aziatische noedels met groenten')
  })

  it('deduplicates repeated recipe IDs', () => {
    const json = JSON.stringify({
      a: { recipe_id: "dup001", accessibilityLabel: "Stamppot, 0 uur" },
      b: { recipe_id: "dup001", accessibilityLabel: "Stamppot, 0 uur" },
    })
    const stubs = extractRecipeStubs(json)
    expect(stubs.filter(s => s.id === 'dup001')).toHaveLength(1)
  })

  it('returns empty name when no accessibilityLabel found', () => {
    const json = JSON.stringify({ recipe_id: "orphan", someOtherField: "value" })
    const stubs = extractRecipeStubs(json)
    const orphan = stubs.find(s => s.id === 'orphan')
    expect(orphan?.name).toBe('')
  })
})

// ── upsertIndex ───────────────────────────────────────────────────────────────

describe('upsertIndex', () => {
  it('creates a new entry', () => {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta carbonara', 'pasta')
    expect(catalog.entries['r1']).toMatchObject({ id: 'r1', name: 'Pasta carbonara', categories: ['pasta'] })
  })

  it('adds category to existing entry without overwriting', () => {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta', 'pasta')
    upsertIndex(catalog, 'r1', 'Pasta', 'vega')
    expect(catalog.entries['r1'].categories).toContain('pasta')
    expect(catalog.entries['r1'].categories).toContain('vega')
  })

  it('does not duplicate categories', () => {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta', 'pasta')
    upsertIndex(catalog, 'r1', 'Pasta', 'pasta')
    expect(catalog.entries['r1'].categories).toHaveLength(1)
  })

  it('updates name if new name has more words (Tier-1 only)', () => {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta', 'pasta')          // 1 word
    upsertIndex(catalog, 'r1', 'Pasta carbonara met spek', 'pasta')  // 4 words — better
    expect(catalog.entries['r1'].name).toBe('Pasta carbonara met spek')
  })

  it('does NOT overwrite Tier-2 name with index name', () => {
    const catalog = emptyCatalog()
    // Tier-2 entry from fetchRecipeDetail (has ingredients)
    catalog.entries['r1'] = {
      id: 'r1',
      name: 'Pasta carbonara origineel recept',
      categories: ['pasta'],
      cookingTime: '20 min',
      ingredients: [],
      fetchedAt: Date.now(),
    }
    // Index upsert tries to update name
    upsertIndex(catalog, 'r1', 'Pasta carbonara origineel recept Nieuw', 'pasta')
    expect(catalog.entries['r1'].name).toBe('Pasta carbonara origineel recept')
  })
})

// ── upsertDetail ──────────────────────────────────────────────────────────────

describe('upsertDetail', () => {
  it('writes full Tier-2 data', () => {
    const catalog = emptyCatalog()
    upsertDetail(catalog, { id: 'r1', name: 'Pasta', cookingTime: '20 min', ingredients: [] })
    expect(catalog.entries['r1'].ingredients).toEqual([])
    expect(catalog.entries['r1'].cookingTime).toBe('20 min')
  })

  it('merges categories from existing Tier-1 entry', () => {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta', 'pasta')
    upsertDetail(catalog, { id: 'r1', name: 'Pasta', cookingTime: null, ingredients: [] }, 'THIS_WEEK')
    expect(catalog.entries['r1'].categories).toContain('pasta')
    expect(catalog.entries['r1'].categories).toContain('THIS_WEEK')
  })
})

// ── searchCatalog ─────────────────────────────────────────────────────────────

describe('searchCatalog', () => {
  function makeTestCatalog(): RecipeCatalog {
    const catalog = emptyCatalog()
    upsertIndex(catalog, 'r1', 'Pasta carbonara', 'pasta')
    upsertIndex(catalog, 'r2', 'Pasta bolognese', 'pasta')
    upsertIndex(catalog, 'r3', 'Tandoori kip', 'kip')
    upsertIndex(catalog, 'r4', 'Vegetarische lasagne', 'vega')
    // r1 gets Tier-2 details
    upsertDetail(catalog, { id: 'r1', name: 'Pasta carbonara', cookingTime: '20 min', ingredients: [] })
    return catalog
  }

  it('returns all entries when no filter given', () => {
    const catalog = makeTestCatalog()
    const results = searchCatalog(catalog, {})
    expect(results).toHaveLength(4)
  })

  it('filters by name query (case-insensitive)', () => {
    const catalog = makeTestCatalog()
    const results = searchCatalog(catalog, { query: 'pasta' })
    expect(results).toHaveLength(2)
    expect(results.every(r => r.name.toLowerCase().includes('pasta'))).toBe(true)
  })

  it('filters by category substring', () => {
    const catalog = makeTestCatalog()
    const results = searchCatalog(catalog, { category: 'vega' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('r4')
  })

  it('respects limit', () => {
    const catalog = makeTestCatalog()
    const results = searchCatalog(catalog, { limit: 2 })
    expect(results).toHaveLength(2)
  })

  it('places Tier-2 entries (with ingredients) before Tier-1', () => {
    const catalog = makeTestCatalog()
    const results = searchCatalog(catalog, { query: 'pasta' })
    // r1 has ingredients, r2 doesn't → r1 should be first
    expect(results[0].id).toBe('r1')
  })
})

// ── catalogEntryToRecipe ──────────────────────────────────────────────────────

describe('catalogEntryToRecipe', () => {
  it('converts a Tier-2 entry to Recipe', () => {
    const entry = {
      id: 'r1', name: 'Pasta', categories: ['pasta'],
      cookingTime: '20 min',
      ingredients: [{ sellingUnitId: 's123', ingredientId: 'abc', ingredientType: 'CORE' as const, price: 199 }],
    }
    const recipe = catalogEntryToRecipe(entry)
    expect(recipe.id).toBe('r1')
    expect(recipe.ingredients).toHaveLength(1)
    expect(recipe.cookingTime).toBe('20 min')
  })

  it('uses null cookingTime when undefined', () => {
    const entry = { id: 'r1', name: 'Pasta', categories: [], cookingTime: undefined }
    const recipe = catalogEntryToRecipe(entry)
    expect(recipe.cookingTime).toBeNull()
  })
})
