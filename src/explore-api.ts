/**
 * Picnic API Explorer
 *
 * Roept alle bekende API endpoints aan en slaat de ruwe output op.
 * Gebruik: npm run explore
 */

import PicnicClient from 'picnic-api'
import dotenv from 'dotenv'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

dotenv.config({ path: resolve(import.meta.dirname, '../.env') })

const SESSION_FILE = resolve(import.meta.dirname, '../.picnic-session')
const OUTPUT_DIR = resolve(import.meta.dirname, '../api-output')

interface CallResult {
  endpoint: string
  input?: unknown
  output?: unknown
  error?: string
  durationMs: number
  timestamp: string
}

async function call(label: string, fn: () => Promise<unknown>, input?: unknown): Promise<CallResult> {
  const start = Date.now()
  const timestamp = new Date().toISOString()
  console.log(`  → ${label}...`)
  try {
    const output = await fn()
    const durationMs = Date.now() - start
    console.log(`    ✓ ${durationMs}ms`)
    return { endpoint: label, input, output, durationMs, timestamp }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const error = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    console.log(`    ✗ ${durationMs}ms — ${error.split('\n')[0]}`)
    return { endpoint: label, input, error, durationMs, timestamp }
  }
}

async function main() {
  const username = process.env.PICNIC_USERNAME
  const password = process.env.PICNIC_PASSWORD
  if (!username || !password) throw new Error('PICNIC_USERNAME en PICNIC_PASSWORD zijn vereist in .env')

  // Login
  let authKey: string | undefined
  if (existsSync(SESSION_FILE)) {
    try { authKey = readFileSync(SESSION_FILE, 'utf8').trim() } catch { /* ignore */ }
  }
  const client = new PicnicClient(authKey ? { authKey, countryCode: 'NL' } : { countryCode: 'NL' })

  console.log('\n=== Picnic API Explorer ===\n')
  console.log('Inloggen...')
  try {
    await client.user.getUserDetails()
    console.log('Sessie nog geldig, doorgaan...\n')
  } catch {
    const result = await client.auth.login(username, password)
    writeFileSync(SESSION_FILE, result.authKey, 'utf8')
    console.log('Nieuw ingelogd.\n')
  }

  const results: CallResult[] = []

  // === USER ===
  console.log('[ user ]')
  results.push(await call('user.getUserDetails', () => client.user.getUserDetails()))
  results.push(await call('user.getUserInfo', () => client.user.getUserInfo()))
  results.push(await call('user.getProfileMenu', () => client.user.getProfileMenu()))
  results.push(await call('user.checkForUpdates', () => client.user.checkForUpdates()))

  // === APP ===
  console.log('\n[ app ]')
  results.push(await call('app.getBootstrapData', () => client.app.getBootstrapData()))

  const appPages = [
    'home_page_root',
    'purchases-page-root',
    'meals-page-root',
    'slot-selector-root',
    'category-tree-root',
    'parcels-overview-page-root',
    'empty-search-page-root',
  ]
  for (const pageId of appPages) {
    results.push(await call(`app.getPage(${pageId})`, () => client.app.getPage(pageId), { pageId }))
  }

  // Search page (needs query param)
  results.push(await call(
    'app.getPage(search-page-results?search_term=melk)',
    () => client.app.getPage('search-page-results?search_term=melk'),
    { pageId: 'search-page-results', search_term: 'melk' }
  ))

  // === CATALOG ===
  console.log('\n[ catalog ]')
  const searchQuery = 'havermelk'
  results.push(await call(
    `catalog.search("${searchQuery}")`,
    () => client.catalog.search(searchQuery),
    { query: searchQuery }
  ))
  results.push(await call(
    `catalog.getSuggestions("${searchQuery}")`,
    () => client.catalog.getSuggestions(searchQuery),
    { query: searchQuery }
  ))

  // Get a product ID from search results for detail calls
  let sampleProductId: string | undefined
  const searchResult = results.find(r => r.endpoint.startsWith('catalog.search'))
  if (searchResult?.output && Array.isArray(searchResult.output) && searchResult.output.length > 0) {
    sampleProductId = (searchResult.output[0] as { id: string }).id
    results.push(await call(
      `catalog.getProductDetails(${sampleProductId})`,
      () => client.catalog.getProductDetails(sampleProductId!),
      { productId: sampleProductId }
    ))
  }

  // === CART ===
  console.log('\n[ cart ]')
  results.push(await call('cart.getCart', () => client.cart.getCart()))
  results.push(await call('cart.getDeliverySlots', () => client.cart.getDeliverySlots()))
  // getMinimumOrderValue vereist een geselecteerd bezorgmoment
  results.push(await call('cart.getMinimumOrderValue', () => client.cart.getMinimumOrderValue()))

  // === DELIVERY ===
  console.log('\n[ delivery ]')
  results.push(await call('delivery.getDeliveries([])', () => client.delivery.getDeliveries([]), { filter: [] }))

  // Als er deliveries zijn, haal de eerste op
  const deliveriesResult = results.find(r => r.endpoint.startsWith('delivery.getDeliveries'))
  const deliveriesArray = deliveriesResult?.output && Array.isArray(deliveriesResult.output) ? deliveriesResult.output : []
  const sampleDeliveryId = deliveriesArray.length > 0
    ? ((deliveriesArray[0] as any).delivery_id ?? (deliveriesArray[0] as any).id)
    : undefined

  if (sampleDeliveryId) {
    results.push(await call(
      `delivery.getDelivery(${sampleDeliveryId})`,
      () => client.delivery.getDelivery(sampleDeliveryId!),
      { deliveryId: sampleDeliveryId }
    ))
    results.push(await call(
      `delivery.getDeliveryPosition(${sampleDeliveryId})`,
      () => client.delivery.getDeliveryPosition(sampleDeliveryId!),
      { deliveryId: sampleDeliveryId }
    ))
    results.push(await call(
      `delivery.getDeliveryScenario(${sampleDeliveryId})`,
      () => client.delivery.getDeliveryScenario(sampleDeliveryId!),
      { deliveryId: sampleDeliveryId }
    ))
  }

  // === PAYMENT ===
  console.log('\n[ payment ]')
  results.push(await call('payment.getPaymentProfile', () => client.payment.getPaymentProfile()))
  results.push(await call('payment.getWalletTransactions(1)', () => client.payment.getWalletTransactions(1), { pageNumber: 1 }))

  // === RECIPE ===
  console.log('\n[ recipe ]')
  results.push(await call('recipe.getRecipesPage', () => client.recipe.getRecipesPage()))

  // === APP: product detail page ===
  if (sampleProductId) {
    console.log('\n[ app (product) ]')
    results.push(await call(
      `app.getPage(product-details-page-root?id=${sampleProductId})`,
      () => client.app.getPage(`product-details-page-root?id=${sampleProductId}`),
      { pageId: 'product-details-page-root', id: sampleProductId }
    ))
  }

  // === Output opslaan ===
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outputPath = resolve(OUTPUT_DIR, `${date}.json`)

  const summary = {
    exploredAt: new Date().toISOString(),
    totalEndpoints: results.length,
    succeeded: results.filter(r => !r.error).length,
    failed: results.filter(r => r.error).length,
    results,
  }

  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8')
  console.log(`\n✓ Output opgeslagen: ${outputPath}`)
  console.log(`  ${summary.succeeded}/${summary.totalEndpoints} endpoints geslaagd`)

  // Toon welke endpoints gefaald zijn
  const failed = results.filter(r => r.error)
  if (failed.length > 0) {
    console.log('\nGefaalde endpoints:')
    failed.forEach(r => console.log(`  ✗ ${r.endpoint}: ${r.error?.split('\n')[0]}`))
  }
}

main().catch(err => { console.error(String(err)); process.exit(1) })
