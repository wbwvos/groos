/**
 * Zet api-output/*.json om naar een leesbare markdown per endpoint.
 * Gebruik: npx tsx scripts/generate-api-docs.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const OUTPUT_DIR = resolve(import.meta.dirname, '../api-output')
const files = readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.json')).sort().reverse()
if (files.length === 0) { console.error('Geen api-output bestanden gevonden.'); process.exit(1) }

const inputPath = resolve(OUTPUT_DIR, files[0])
console.log('Inlezen:', inputPath)
const data = JSON.parse(readFileSync(inputPath, 'utf8'))

const lines: string[] = []

lines.push(`# Picnic API Documentatie`)
lines.push(``)
lines.push(`Gegenereerd op: ${data.exploredAt}`)
lines.push(`Resultaat: ${data.succeeded}/${data.totalEndpoints} endpoints geslaagd`)
lines.push(``)

// Groepeer per domein
const groups: Record<string, typeof data.results> = {}
for (const result of data.results) {
  const domain = result.endpoint.split('.')[0]
  if (!groups[domain]) groups[domain] = []
  groups[domain].push(result)
}

const domainDescriptions: Record<string, string> = {
  user: 'Gebruikersinformatie, profiel en instellingen.',
  app: 'App-pagina\'s in het Fusion/PML formaat — dit is de interne app-structuur van Picnic. De meeste pagina\'s zijn te groot om volledig te tonen.',
  catalog: 'Producten zoeken, details opvragen en afbeeldingen.',
  cart: 'Winkelmandje: inhoud, bezorgmomenten, minimum bestelbedrag.',
  delivery: 'Bezorghistorie en details van vroegere en huidige bezorgingen.',
  payment: 'Betaalprofiel en wallet transacties.',
  recipe: 'Recepten overzicht en detailpagina\'s.',
}

for (const [domain, results] of Object.entries(groups)) {
  lines.push(`---`)
  lines.push(``)
  lines.push(`## ${domain.toUpperCase()}`)
  lines.push(``)
  if (domainDescriptions[domain]) {
    lines.push(`${domainDescriptions[domain]}`)
    lines.push(``)
  }

  for (const result of results) {
    lines.push(`### \`${result.endpoint}\``)
    lines.push(``)
    lines.push(`**Duur:** ${result.durationMs}ms`)
    if (result.input) {
      lines.push(`**Input:** \`${JSON.stringify(result.input)}\``)
    }
    lines.push(``)

    if (result.error) {
      lines.push(`> ❌ **Fout:** ${result.error.split('\n')[0]}`)
      lines.push(``)
      continue
    }

    const output = result.output
    lines.push(...formatOutput(result.endpoint, output))
    lines.push(``)
  }
}

function formatOutput(endpoint: string, output: unknown): string[] {
  const out: string[] = []

  // Fusion pages: samenvatting
  if (endpoint.startsWith('app.getPage') || endpoint === 'recipe.getRecipesPage') {
    out.push(...summarizeFusionPage(output))
    return out
  }

  // Arrays: toon als tabel of lijst
  if (Array.isArray(output)) {
    out.push(`**${output.length} item(s)**`)
    out.push(``)
    if (output.length === 0) {
      out.push(`*(leeg)*`)
      return out
    }
    // Toon de eerste 3 items volledig
    const preview = output.slice(0, 3)
    out.push('```json')
    out.push(JSON.stringify(preview, null, 2))
    out.push('```')
    if (output.length > 3) {
      out.push(`*... en nog ${output.length - 3} meer*`)
    }
    return out
  }

  // Speciale behandeling per endpoint
  if (endpoint === 'user.getUserDetails') return formatUserDetails(output as any)
  if (endpoint === 'user.getUserInfo') return formatUserInfo(output as any)
  if (endpoint === 'user.getProfileMenu') return formatProfileMenu(output as any)
  if (endpoint === 'cart.getCart') return formatCart(output as any)
  if (endpoint === 'cart.getDeliverySlots') return formatDeliverySlots(output as any)
  if (endpoint === 'cart.getMinimumOrderValue') return formatMinimumOrder(output as any)
  if (endpoint === 'payment.getPaymentProfile') return formatPaymentProfile(output as any)
  if (endpoint.startsWith('payment.getWalletTransactions')) return formatWalletTransactions(output as any)
  if (endpoint === 'app.getBootstrapData') return formatBootstrapData(output as any)
  if (endpoint === 'catalog.getProductDetails') return formatProductDetails(output as any)
  if (endpoint.startsWith('catalog.search')) return formatSearchResults(output as any)
  if (endpoint.startsWith('catalog.getSuggestions')) return formatSuggestions(output as any)
  if (endpoint.startsWith('delivery.getDeliveries')) return formatDeliveries(output as any)
  if (endpoint.startsWith('delivery.getDelivery')) return formatDeliveryDetail(output as any)

  // Fallback: JSON dump (max 50 regels)
  const json = JSON.stringify(output, null, 2).split('\n')
  if (json.length > 60) {
    out.push('```json')
    out.push(json.slice(0, 60).join('\n'))
    out.push(`// ... (${json.length - 60} regels weggelaten)`)
    out.push('```')
  } else {
    out.push('```json')
    out.push(json.join('\n'))
    out.push('```')
  }
  return out
}

function summarizeFusionPage(output: unknown): string[] {
  const out: string[] = []
  const json = JSON.stringify(output ?? {})

  // Top-level structuur
  const topKeys = Object.keys(output as object).join(', ')
  out.push(`**Top-level velden:** \`${topKeys}\``)
  out.push(``)

  // Grootte
  const sizeKb = Math.round(json.length / 1024)
  out.push(`**Grootte:** ~${sizeKb} KB`)
  out.push(``)

  // Component types
  const componentTypes = [...json.matchAll(/"type":"([A-Z_]+)"/g)]
    .map(m => m[1])
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 15)
  if (componentTypes.length > 0) {
    out.push(`**Component types:** ${componentTypes.map(t => `\`${t}\``).join(', ')}`)
    out.push(``)
  }

  // Markdown teksten (titels / labels)
  const markdownTexts = [...json.matchAll(/"markdown":"([^"]{5,80})"/g)]
    .map(m => m[1].replace(/\\n/g, ' ').trim())
    .filter((t, i, arr) => arr.indexOf(t) === i && !t.startsWith('http'))
    .slice(0, 10)
  if (markdownTexts.length > 0) {
    out.push(`**Zichtbare teksten (markdown):**`)
    markdownTexts.forEach(t => out.push(`- ${t}`))
    out.push(``)
  }

  // Product IDs
  const productIds = [...json.matchAll(/"id":"(s\d+)"/g)]
    .map(m => m[1])
    .filter((t, i, arr) => arr.indexOf(t) === i)
  if (productIds.length > 0) {
    out.push(`**Product IDs (${productIds.length} uniek):** ${productIds.slice(0, 10).join(', ')}${productIds.length > 10 ? ', ...' : ''}`)
    out.push(``)
  }

  // Deeplinks / page IDs
  const pageIds = [...json.matchAll(/page;id=([a-z0-9-]+)/g)]
    .map(m => m[1])
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 10)
  if (pageIds.length > 0) {
    out.push(`**Interne page IDs:** ${pageIds.map(p => `\`${p}\``).join(', ')}`)
    out.push(``)
  }

  return out
}

function formatUserDetails(u: any): string[] {
  if (!u) return ['*(geen data)*']
  const addr = u.address
  const addrStr = addr ? `${addr.street} ${addr.house_number}, ${addr.postcode} ${addr.city}` : '(onbekend)'
  return [
    `| Veld | Waarde |`,
    `|------|--------|`,
    `| Naam | ${u.firstname ?? ''} ${u.lastname ?? ''} |`,
    `| Email | ${u.contact_email ?? u.email ?? '(verborgen)'} |`,
    `| Adres | ${addrStr} |`,
    `| Lid sinds | ${u.customer_id ?? '?'} |`,
    ``,
    `<details><summary>Volledige response</summary>`,
    ``,
    '```json',
    JSON.stringify(u, null, 2),
    '```',
    `</details>`,
  ]
}

function formatUserInfo(u: any): string[] {
  if (!u) return ['*(geen data)*']
  const featureCount = Object.keys(u?.features ?? {}).length
  return [
    `**Features:** ${featureCount} feature flags`,
    ``,
    '```json',
    JSON.stringify(u, null, 2).split('\n').slice(0, 40).join('\n'),
    '```',
  ]
}

function formatProfileMenu(p: any): string[] {
  if (!p) return ['*(geen data)*']
  const json = JSON.stringify(p ?? {})
  const sections = [...json.matchAll(/"title":"([^"]+)"/g)].map(m => m[1]).filter((t, i, arr) => arr.indexOf(t) === i)
  return [
    `**Menu secties:** ${sections.map(s => `"${s}"`).join(', ')}`,
    ``,
    `<details><summary>Volledige response</summary>`,
    ``,
    '```json',
    JSON.stringify(p, null, 2),
    '```',
    `</details>`,
  ]
}

function formatCart(cart: any): string[] {
  if (!cart) return ['*(geen data)*']
  const itemCount = cart.total_count ?? 0
  const lines = [
    `| Veld | Waarde |`,
    `|------|--------|`,
    `| Aantal items | ${itemCount} |`,
    `| Totaalprijs | €${((cart.total_price ?? 0) / 100).toFixed(2)} |`,
    `| Checkout totaal | €${((cart.checkout_total_price ?? 0) / 100).toFixed(2)} |`,
    `| Order ID | \`${cart.id ?? '?'}\` |`,
    `| Geselecteerd slot | ${cart.selected_slot?.slot_id ?? '(geen)'} |`,
    ``,
  ]
  if (itemCount === 0) {
    lines.push(`*Mandje was leeg tijdens de API explorer run.*`)
  }
  return lines
}

function formatDeliverySlots(result: any): string[] {
  const slots = result?.delivery_slots ?? []
  const available = slots.filter((s: any) => s.is_available)
  const selected = slots.find((s: any) => s.selected)

  const lines = [
    `**${slots.length} slots totaal, ${available.length} beschikbaar**`,
    ``,
    `**Geselecteerd slot:** ${selected ? `${selected.slot_id} (${selected.window_start} – ${selected.window_end})` : '(geen)'}`,
    ``,
    `> ⚠️ \`slot_characteristics\` is altijd \`[]\` in dit endpoint. Groene slots worden bepaald via \`app.getPage('slot-selector-root')\`.`,
    ``,
    `**Eerste 5 beschikbare slots:**`,
    ``,
    `| slot_id | window_start | window_end | cut_off_time |`,
    `|---------|-------------|------------|--------------|`,
    ...available.slice(0, 5).map((s: any) =>
      `| \`${s.slot_id}\` | ${s.window_start} | ${s.window_end} | ${s.cut_off_time} |`
    ),
  ]
  return lines
}

function formatMinimumOrder(result: any): string[] {
  return [
    `**Minimum bestelbedrag:** €${((result?.minimum_order_value ?? 0) / 100).toFixed(2)}`,
    `**Slot ID:** \`${result?.slot_id ?? '(geen)'}\``,
  ]
}

function formatPaymentProfile(p: any): string[] {
  if (!p) return ['*(geen data)*']
  const lines = [
    `| Veld | Waarde |`,
    `|------|--------|`,
  ]
  for (const [key, val] of Object.entries(p)) {
    lines.push(`| ${key} | ${JSON.stringify(val)} |`)
  }
  return lines
}

function formatWalletTransactions(txs: any[]): string[] {
  if (!Array.isArray(txs) || txs.length === 0) return ['*(geen transacties)*']
  const lines = [
    `**${txs.length} transacties**`,
    ``,
    `| datum | bedrag | type | omschrijving |`,
    `|-------|--------|------|--------------|`,
    ...txs.slice(0, 10).map((t: any) =>
      `| ${t.date ?? t.timestamp ?? '?'} | €${((t.amount ?? 0) / 100).toFixed(2)} | ${t.type ?? '?'} | ${t.description ?? ''} |`
    ),
  ]
  return lines
}

function formatBootstrapData(b: any): string[] {
  if (!b) return ['*(geen data)*']
  const json = JSON.stringify(b ?? {})
  const keys = Object.keys(b).join(', ')
  const featureFlags = b?.feature_toggles ? Object.entries(b.feature_toggles)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .slice(0, 20) : []

  return [
    `**Top-level velden:** ${keys}`,
    ``,
    `**Actieve feature flags (${featureFlags.length}):** ${featureFlags.join(', ')}`,
    ``,
    `**Grootte:** ~${Math.round(json.length / 1024)} KB`,
  ]
}

function formatProductDetails(p: any): string[] {
  if (!p) return ['*(geen data)*']
  const lines = [
    `| Veld | Waarde |`,
    `|------|--------|`,
    `| ID | \`${p.id}\` |`,
    `| Naam | ${p.name} |`,
    `| Merk | ${p.brand ?? '(geen)'} |`,
    `| Eenheidshoeveelheid | ${p.unitQuantity ?? '?'} |`,
    `| Prijs | €${((p.displayPrice ?? 0) / 100).toFixed(2)} |`,
    `| Prijs per eenheid | ${p.unitPrice ?? '?'} |`,
    `| Promotie | ${p.promotion ? `${p.promotion.label} (ID: ${p.promotion.id})` : '(geen)'} |`,
    `| Allergenen | ${(p.allergens ?? []).join(', ') || '(geen)'} |`,
    ``,
    `**Beschrijving:** ${p.description ?? '(geen)'}`,
    ``,
    `**Highlights:**`,
    ...(p.highlights ?? []).map((h: string) => `- ${h}`),
    ``,
    `**Bundles (${(p.bundles ?? []).length}):**`,
    `| bundle_id | quantity | pricePerUnit |`,
    `|-----------|----------|--------------|`,
    ...(p.bundles ?? []).map((b: any) => `| \`${b.id}\` | ${b.quantity} | €${(b.pricePerUnit / 100).toFixed(2)} |`),
  ]
  return lines
}

function formatSearchResults(results: any[]): string[] {
  if (!Array.isArray(results)) return ['*(geen resultaten)*']
  const withDecorators = results.filter(r => r.decorators?.length > 0)
  return [
    `**${results.length} resultaten, ${withDecorators.length} met decorators**`,
    ``,
    `> ℹ️ \`decorators\` is in zoekresultaten altijd leeg. Kortingsinformatie staat in \`catalog.getProductDetails\`.`,
    ``,
    `| ID | Naam | Prijs | Eenheid |`,
    `|----|------|-------|---------|`,
    ...results.slice(0, 10).map((p: any) =>
      `| \`${p.id}\` | ${p.name} | €${((p.display_price ?? 0) / 100).toFixed(2)} | ${p.unit_quantity ?? ''} |`
    ),
    results.length > 10 ? `*... en nog ${results.length - 10} meer*` : '',
  ].filter(l => l !== '')
}

function formatSuggestions(results: any[]): string[] {
  if (!Array.isArray(results)) return ['*(geen suggesties)*']
  return [
    `**${results.length} suggesties:**`,
    ``,
    ...results.slice(0, 15).map((s: any) => `- \`${s.id ?? ''}\` ${s.name ?? s.suggestion ?? JSON.stringify(s)}`),
  ]
}

function formatDeliveries(deliveries: any[]): string[] {
  if (!Array.isArray(deliveries)) return ['*(geen bezorgingen)*']
  if (deliveries.length === 0) return ['*(geen bezorgingen — probeer met filter COMPLETED)*']
  return [
    `**${deliveries.length} bezorgingen:**`,
    ``,
    `| ID | Status | Datum | Totaal |`,
    `|----|--------|-------|--------|`,
    ...deliveries.slice(0, 10).map((d: any) =>
      `| \`${d.id}\` | ${d.status} | ${d.slot?.window_start ?? '?'} | €${((d.total_price ?? 0) / 100).toFixed(2)} |`
    ),
  ]
}

function formatDeliveryDetail(d: any): string[] {
  if (!d) return ['*(geen data)*']
  return [
    `**ID:** \`${d.id}\``,
    `**Status:** ${d.status}`,
    `**Totaal:** €${((d.total_price ?? 0) / 100).toFixed(2)}`,
    ``,
    '```json',
    JSON.stringify(d, null, 2).split('\n').slice(0, 40).join('\n'),
    '```',
  ]
}

// Schrijf output
const outputPath = inputPath.replace('.json', '.md')
writeFileSync(outputPath, lines.join('\n'), 'utf8')
console.log(`✓ Markdown opgeslagen: ${outputPath}`)
console.log(`  ${lines.length} regels`)
