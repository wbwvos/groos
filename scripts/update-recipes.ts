/**
 * Picnic Recipe Catalog Updater
 *
 * Fetches all recipe IDs + names from Picnic and updates data/recipe-catalog.json.
 * Does NOT fetch full recipe details (ingredients) — those are loaded on demand.
 *
 * Usage: npm run update-recipes
 */

import { createPicnicService } from '../src/picnic.ts'
import { loadCatalog, saveCatalog, upsertIndex, extractRecipeStubs } from '../src/catalog.ts'

const picnic = createPicnicService()
const client = (picnic as any).client

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchPageStubs(pageId: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const page = await client.app.getPage(pageId)
    return extractRecipeStubs(JSON.stringify(page))
  } catch (err) {
    console.log(`  ✗ ${pageId}: ${String(err).split('\n')[0]}`)
    return []
  }
}

async function main() {
  console.log('\n=== Picnic Recipe Catalog Update ===\n')

  await picnic.login()
  console.log('Ingelogd.\n')

  const catalog = loadCatalog()
  const before = Object.keys(catalog.entries).length

  // ── 1. Segment pages (THIS_WEEK, NEW, SAVED) ──────────────────────────────
  console.log('[ Segment pages ]')
  for (const segType of ['THIS_WEEK_RECIPES', 'NEW_RECIPES', 'SAVED_RECIPES']) {
    const stubs = await fetchPageStubs(`see-more-recipes-page?segmentType=${segType}`)
    stubs.forEach(s => upsertIndex(catalog, s.id, s.name, segType))
    console.log(`  ✓ ${segType}: ${stubs.length} recepten`)
    await sleep(200)
  }

  // ── 2. Cookbook (user's personal saved recipes) ────────────────────────────
  console.log('\n[ Cookbook ]')
  const cookbookStubs = await fetchPageStubs('cookbook-page')
  cookbookStubs.forEach(s => upsertIndex(catalog, s.id, s.name, 'cookbook'))
  console.log(`  ✓ cookbook-page: ${cookbookStubs.length} recepten`)
  await sleep(200)

  // ── 3. Category tree pages ──────────────────────────────────────────────��──
  // Extract category page IDs dynamically from the cookbook-page deep links
  console.log('\n[ Categorie pages ]')
  const cookbookPage = await client.app.getPage('cookbook-page').catch(() => null)
  const cookbookJson = cookbookPage ? JSON.stringify(cookbookPage) : ''
  const dynamicCats = [...new Set(
    [...cookbookJson.matchAll(/id=(recipe[_-]cat[^",'\;\\]+)/g)].map(m => m[1])
  )]

  // Fallback to known list if dynamic extraction fails
  const knownCats = [
    'recipe_cattree_20minuten', 'recipe_cattree_weinigsnijwerk', 'recipe_cattree_eenpans',
    'recipe-cattree-thema-kids', 'recipe_cattree_it_pasta', 'recipe-cattree-ravioli',
    'recipe-cattree-pasta-gnocchi-orzo', 'recipe_cattree_lasagne', 'recipe_cattree_oos_noedels',
    'recipe_cattree_oos_rijst', 'recipe_cattree_it_risotto', 'recipe-cattree-type-gerecht-curry',
    'recipe_cattree_mid_granen', 'recipe_cattree_hol_stamppot', 'recipe_cattree_hol_AGV',
    'recipe_cattree_mex_wraps', 'recipe_cattree_platbrood', 'recipe_cattree_it_pizza',
    'recipe_cattree_burgers', 'recipe_cattree_oven_schotel', 'recipe-cattree-traybakes',
    'recipe_cattree_plaattaart', 'recipe_cattree_oven_quiche', 'recipe_cattree_airfryer',
    'recipe_cattree_soep', 'recipe-cattree-type-gerecht-salades', 'recipe_cattree_vega',
    'recipe_cattree_vegan', 'recipe_cattree_groente', 'recipe_cattree_koolhydraatarm',
    'recipe_cattree_calorieen', 'recipe_cattree_zwanger', 'recipe_cattree_ontbijt',
    'recipe_cattree_brunch', 'recipe-cattree-momenten-borrel', 'recipe-cattree-momenten-zoet',
    'recipe_cattree_drankjes', 'recipe_cattree_bbq', 'recipe-cattree-momenten-feest',
    'recipe-cattree-budget', 'recipe_cattree_seizoen', 'recipe_cattree_basisrecepten',
    'recipe_cattree_verspakketten', 'recipe-cattree-jamie-oliver', 'recipe-cattree-eefkooktzo',
    'recipe_cattree_24kitchen',
  ]

  const catPages = dynamicCats.length > 10 ? dynamicCats : knownCats
  console.log(`  Fetching ${catPages.length} categorie pages...`)

  let catSuccess = 0
  for (const pageId of catPages) {
    const stubs = await fetchPageStubs(pageId)
    if (stubs.length > 0) {
      stubs.forEach(s => upsertIndex(catalog, s.id, s.name, pageId))
      process.stdout.write(`  ✓ ${pageId.replace('recipe_cattree_', '').replace('recipe-cattree-', '')}: ${stubs.length}\n`)
      catSuccess++
    }
    await sleep(200)
  }
  console.log(`  ${catSuccess}/${catPages.length} categorie pages geslaagd`)

  // ── 4. Save ────────────────────────────────────────────────────────────────
  catalog.indexRefreshedAt = Date.now()
  saveCatalog(catalog)

  const after = Object.keys(catalog.entries).length
  const nieuw = after - before
  console.log(`\n✓ Klaar! ${after} recepten in catalogus (${nieuw} nieuw, ${before} al aanwezig)`)
  console.log(`  Opgeslagen in data/recipe-catalog.json`)
}

main().catch(err => { console.error(String(err)); process.exit(1) })
