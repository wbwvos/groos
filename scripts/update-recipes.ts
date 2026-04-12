/**
 * Picnic Recipe Catalog Updater
 *
 * Refreshes the full catalog index from Picnic (all category pages).
 * Does NOT fetch full recipe details (ingredients) — those are loaded on demand.
 *
 * Usage: npm run update-recipes
 */

import { createPicnicService } from '../src/picnic.ts'
import { loadCatalog, saveCatalog } from '../src/catalog.ts'

const picnic = createPicnicService()

async function main() {
  console.log('\n=== Picnic Recipe Catalog Update ===\n')

  await picnic.login()
  console.log('Ingelogd.\n')

  const catalog = loadCatalog()
  const before = Object.keys(catalog.entries).length

  await picnic.refreshCatalogIndex(catalog, msg => console.log(`  ✓ ${msg}`))
  saveCatalog(catalog)

  const after = Object.keys(catalog.entries).length
  const nieuw = after - before
  console.log(`\n✓ Klaar! ${after} recepten in catalogus (${nieuw} nieuw, ${before} al aanwezig)`)
  console.log(`  Opgeslagen in data/recipe-catalog.json`)
}

main().catch(err => { console.error(String(err)); process.exit(1) })
