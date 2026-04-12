import { FastMCP } from 'fastmcp'
import { z } from 'zod'
import { createPicnicService } from './picnic.js'
import { loadStaples, loadMeals, loadHousehold, saveStaples } from './config.js'
import { loadCatalog, saveCatalog, searchCatalog, catalogEntryToRecipe } from './catalog.js'

const mcp = new FastMCP({ name: 'groos', version: '0.1.0' })
const picnic = createPicnicService()

// Login bij opstarten — server blijft draaien zodat Claude Code een leesbare foutmelding ziet
let setupError: string | null = null
try {
  await picnic.login()
} catch (err) {
  const msg = String(err)
  if (msg.toLowerCase().includes('second factor') || msg.toLowerCase().includes('2fa') || msg.toLowerCase().includes('verification')) {
    setupError = `⚠️ Picnic 2FA vereist. Voer éénmalig uit in de terminal:\n\n  npm run cli 2fa-request\n  npm run cli 2fa-verify <SMS-code>\n\nHerstart daarna de MCP server in Claude Code.`
  } else {
    setupError = `⚠️ Picnic login mislukt: ${msg}\n\nControleer PICNIC_USERNAME en PICNIC_PASSWORD in je .env bestand.`
  }
}

function authGuard(): string | null { return setupError }

function parseBasketItems(basket: any): Array<{ id: string; name: string; qty: number; price: number }> {
  const items: Array<{ id: string; name: string; qty: number; price: number }> = []
  for (const line of basket?.items ?? []) {
    for (const article of line.items ?? []) {
      const qty = article.decorators?.find((d: any) => d.type === 'QUANTITY')?.quantity ?? 1
      items.push({ id: article.id ?? '?', name: article.name ?? '', qty, price: article.price })
    }
  }
  return items
}

mcp.addTool({
  name: 'search_product',
  description: 'Zoek producten in Picnic op naam',
  parameters: z.object({
    query: z.string().describe('Zoekterm, bijv. "havermelk"'),
    limit: z.number().int().min(1).max(20).default(8).describe('Max aantal resultaten'),
  }),
  execute: async ({ query, limit }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const results = await picnic.search(query)
      if (results.length === 0) return 'Geen producten gevonden.'
      return results.slice(0, limit).map(p => {
        const labels: string[] = []
        for (const d of (p.decorators ?? [])) {
          if (d?.type === 'LABEL' && d.text) labels.push(`[${d.text}]`)
          if (d?.type === 'PRICE' && typeof d.display_price === 'number' && d.display_price < p.price) {
            labels.push(`[aanbieding: €${(d.display_price / 100).toFixed(2)}]`)
          }
        }
        const labelStr = labels.length > 0 ? ' ' + labels.join(' ') : ''
        return `ID: ${p.id} | €${(p.price / 100).toFixed(2)} | ${p.name}${p.unitQuantity ? ` [${p.unitQuantity}]` : ''}${labelStr}`
      }).join('\n')
    } catch (err) {
      return `Fout bij zoeken: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'add_to_basket',
  description: 'Voeg een product toe aan het Picnic mandje',
  parameters: z.object({
    product_id: z.string().describe('Product ID uit search_product'),
    quantity: z.number().int().min(1).default(1).describe('Aantal'),
  }),
  execute: async ({ product_id, quantity }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      await picnic.addToBasket(product_id, quantity)
      return `${quantity}x product ${product_id} toegevoegd aan mandje.`
    } catch (err) {
      return `Fout bij toevoegen aan mandje: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'remove_from_basket',
  description: 'Verwijder een product uit het Picnic mandje',
  parameters: z.object({
    product_id: z.string().describe('Product ID'),
    quantity: z.number().int().min(1).default(1).describe('Aantal te verwijderen'),
  }),
  execute: async ({ product_id, quantity }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      await picnic.removeFromBasket(product_id, quantity)
      return `${quantity}x product ${product_id} verwijderd uit mandje.`
    } catch (err) {
      return `Fout bij verwijderen uit mandje: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'get_basket',
  description: 'Bekijk de huidige inhoud van het Picnic mandje als leesbaar overzicht met totaalprijs',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const basket = await picnic.getBasket()
      const items = parseBasketItems(basket)
      if (items.length === 0) return 'Mandje is leeg.'
      const unavailableThreshold = 10000
      const hasUnavailable = items.some(i => i.price >= unavailableThreshold)
      const lines = items.map(i => {
        const line = `ID: ${i.id} | ${i.qty}x ${i.name.padEnd(40)} €${(i.price / 100).toFixed(2)}`
        if (i.price >= unavailableThreshold) {
          return `⚠️ ${line} — NIET BESCHIKBAAR`
        }
        return line
      })
      lines.push('─'.repeat(70))
      const checkoutTotal = basket.checkout_total_price
      const listTotal = basket.total_price
      lines.push(`Totaal: €${(checkoutTotal / 100).toFixed(2)}`)
      if (listTotal > checkoutTotal) {
        lines.push(`💰 Kortingen: -€${((listTotal - checkoutTotal) / 100).toFixed(2)} (lijstprijs €${(listTotal / 100).toFixed(2)})`)
      }
      if (basket.membership_savings > 0) {
        lines.push(`🎟️ Lidmaatschapsvoordeel: -€${(basket.membership_savings / 100).toFixed(2)}`)
      }
      if (hasUnavailable) {
        lines.push('\n⚠️ Niet-beschikbare items gevonden — gebruik search_product om alternatieven te vinden en verwijder met remove_from_basket.')
      }
      return lines.join('\n')
    } catch (err) {
      return `Fout bij ophalen mandje: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'clear_basket',
  description: 'Maakt het volledige Picnic mandje leeg',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      await picnic.clearBasket()
      return 'Mandje is leeggemaakt.'
    } catch (err) {
      return `Fout bij leegmaken mandje: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'check_order_eligibility',
  description: 'Controleer of de bestelling geplaatst kan worden: toont het minimumbedrag, het huidige mandjetotaal, en of het minimum gehaald is. Gebruik dit altijd vóór confirm_order.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const [minimum, basket, address] = await Promise.all([
        picnic.getMinimumOrderValue(),
        picnic.getBasket(),
        picnic.getDeliveryAddress(),
      ])
      const items = parseBasketItems(basket)
      const total = basket.checkout_total_price
      const eligible = total >= minimum
      const unavailableThreshold = 10000
      const unavailableItems = items.filter(i => i.price >= unavailableThreshold)

      const result = [
        `Minimumbedrag: €${(minimum / 100).toFixed(2)}`,
        `Mandje totaal: €${(total / 100).toFixed(2)}`,
        eligible ? '✓ Minimum gehaald — bestelling kan geplaatst worden.' : `✗ Nog €${((minimum - total) / 100).toFixed(2)} nodig om het minimum te halen.`,
        `Bezorgadres: ${address}`,
      ]

      if (unavailableItems.length > 0) {
        result.push('')
        result.push('⚠️ Niet-beschikbare items in mandje:')
        for (const item of unavailableItems) {
          result.push(`- ${item.name} (${item.id}) — verwijder via remove_from_basket en zoek alternatief via search_product`)
        }
      }

      return result.join('\n')
    } catch (err) {
      return `Fout bij controleren bestelling: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'confirm_order',
  description: 'Plaatst de bestelling definitief bij Picnic. ⚠️ ALTIJD eerst check_order_eligibility aanroepen én bevestiging vragen aan de gebruiker voordat je dit tool gebruikt.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      await picnic.confirmOrder()
      return '✓ Bestelling geplaatst! Je ontvangt een bevestiging van Picnic.'
    } catch (err) {
      return `Fout bij plaatsen bestelling: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'get_delivery_slots',
  description: 'Bekijk beschikbare bezorgtijden bij Picnic',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const slots = await picnic.getDeliverySlots()
      if (slots.length === 0) return 'Geen bezorgtijden beschikbaar.'
      return slots.map((s, i) => {
        const greenLabel = s.is_green ? ' 🌱 groenste keuze' : ''
        return `${i}: ${s.slot_id} | ${s.window_start} – ${s.window_end}${greenLabel}`
      }).join('\n')
    } catch (err) {
      return `Fout bij ophalen bezorgtijden: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'set_delivery_slot',
  description: 'Stel een bezorgtijd in',
  parameters: z.object({
    slot_id: z.string().describe('Slot ID uit get_delivery_slots'),
  }),
  execute: async ({ slot_id }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      await picnic.setDeliverySlot(slot_id)
      return `Bezorgtijd ingesteld: ${slot_id}`
    } catch (err) {
      return `Fout bij instellen bezorgtijd: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'get_weekly_plan',
  description: 'Geeft het weekoverzicht: mandjecheck, gezinsinfo, staples met product-IDs, maaltijdsuggesties, basisvoorraadremindar en concrete volgende stappen. Gebruik dit altijd als startpunt van een nieuwe boodschappenronde.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr

      // Load catalog and check refresh TTLs
      const catalog = loadCatalog()
      const now = Date.now()
      const WEEK_MS = 7 * 24 * 60 * 60 * 1000
      const MONTH_MS = 30 * 24 * 60 * 60 * 1000
      const catalogNotes: string[] = []

      // Monthly: full index refresh (fire-and-forget — runs in background)
      const indexStale = !catalog.indexRefreshedAt || now - catalog.indexRefreshedAt > MONTH_MS
      if (indexStale) {
        catalogNotes.push('_Catalogus wordt op de achtergrond vernieuwd (maandelijkse update)._')
        picnic.refreshCatalogIndex(catalog)
          .then(() => saveCatalog(catalog))
          .catch(() => {})
      }

      // Weekly: get fresh THIS_WEEK/NEW/SAVED recipes — also saves to catalog
      const weeklyStale = !catalog.weeklyRefreshedAt || now - catalog.weeklyRefreshedAt > WEEK_MS
      const weeklyRecipes = await picnic.getWeeklyRecipes()
      if (weeklyStale) saveCatalog(catalog)

      // Run remaining operations in parallel
      const [staples, knownMeals, household, basket] = await Promise.all([
        loadStaples(),
        loadMeals(),
        loadHousehold(),
        picnic.getBasket()
      ])

      const lines: string[] = []

      // Date header
      const dateStr = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      lines.push(`## Weekoverzicht – ${dateStr}\n`)

      if (catalogNotes.length > 0) lines.push(catalogNotes.join('\n') + '\n')

      // Basket section
      const basketItems = parseBasketItems(basket)
      const basketTotal = basket.checkout_total_price
      const basketItemCount = basketItems.reduce((sum, i) => sum + i.qty, 0)

      lines.push('### Mandje')
      if (basketItemCount === 0) {
        lines.push('[leeg]\n')
      } else {
        lines.push(`⚠️ Mandje bevat al ${basketItemCount} producten (€${(basketTotal / 100).toFixed(2)}) — gebruik clear_basket om opnieuw te beginnen.\n`)
      }

      // Gezin section
      lines.push('### Gezin')
      lines.push(`- ${household.adults} volwassene(n), ${household.children} kind(eren)`)
      lines.push(`- Budgetvoorkeur: ${household.budget_preference}\n`)

      // Vaste boodschappen section
      lines.push('### Vaste boodschappen')
      const stapleResults = await Promise.all(
        staples.map(async s => {
          const results = await picnic.search(s.name)
          return { staple: s, results }
        })
      )
      for (const { staple, results } of stapleResults) {
        if (results.length > 0) {
          const p = results[0]
          lines.push(`- ${staple.name} → ${p.id} | ${p.name}${p.unitQuantity ? ` [${p.unitQuantity}]` : ''} | €${(p.price / 100).toFixed(2)} | geconfigureerd: ${staple.quantity}x`)
        } else {
          lines.push(`- ${staple.name} → niet gevonden`)
        }
      }
      lines.push('')

      // Weekrecepten section
      lines.push('### Weekrecepten (Picnic uitgelicht)')
      if (weeklyRecipes.length === 0) {
        lines.push('Geen recepten beschikbaar.\n')
      } else {
        weeklyRecipes.forEach(r => {
          const core = r.ingredients.filter(i => i.ingredientType === 'CORE').length
          lines.push(`- ${r.id} | ${r.name}${r.cookingTime ? ` (${r.cookingTime})` : ''} | ${core} ingrediënten`)
        })
        lines.push('')
      }

      // Maaltijden section
      lines.push('### Maaltijden (suggesties)')
      knownMeals.forEach(m => lines.push(`- ${m}`))
      lines.push('')

      // Basisvoorraad section
      lines.push('### Basisvoorraad (check eerst!)')
      lines.push('Zout, peper, olie, bloem, boter, suiker, azijn, knoflook — controleer of dit thuis aanwezig is voor geplande maaltijden.\n')

      // Volgende stappen section
      lines.push('### Volgende stappen')
      lines.push('1. Voeg staples toe via `add_to_basket` (gebruik bovenstaande IDs)')
      lines.push('2. Kies maaltijden via weekrecepten of `search_recipe`, voeg toe via `add_recipe_to_basket`')
      lines.push('3. Controleer mandje met `get_basket`')
      lines.push('4. Controleer minimum bedrag en bezorgadres met `check_order_eligibility`')
      lines.push('5. Bevestig bestelling met `confirm_order`')

      return lines.join('\n')
    } catch (err) {
      return `Fout bij ophalen weekplanning: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'manage_staples',
  description: 'Voeg, verwijder of wijzig vaste wekelijkse boodschappen. Wijzigingen worden opgeslagen in config/staples.yaml.',
  parameters: z.object({
    action: z.enum(['add', 'remove', 'set_quantity']).describe('Actie: add (toevoegen), remove (verwijderen), set_quantity (aantal wijzigen)'),
    name: z.string().describe('Naam van het product, bijv. "havermelk"'),
    quantity: z.number().int().min(1).optional().describe('Aantal (verplicht bij add en set_quantity)'),
  }),
  execute: async ({ action, name, quantity }) => {
    try {
      const staples = await loadStaples()
      const lowerName = name.toLowerCase()

      if (action === 'add') {
        if (quantity === undefined) return `Aantal is verplicht bij toevoegen. Voorbeeld: name="havermelk", quantity=2`
        const exists = staples.some(s => s.name.toLowerCase() === lowerName)
        if (exists) return `'${name}' staat al in de staples. Gebruik set_quantity om het aantal te wijzigen.`
        staples.push({ name, quantity })
        await saveStaples(staples)
      } else if (action === 'remove') {
        const idx = staples.findIndex(s => s.name.toLowerCase() === lowerName)
        if (idx === -1) return `'${name}' niet gevonden in staples.`
        staples.splice(idx, 1)
        await saveStaples(staples)
      } else if (action === 'set_quantity') {
        if (quantity === undefined) return `Aantal is verplicht bij wijzigen. Voorbeeld: name="havermelk", quantity=3`
        const idx = staples.findIndex(s => s.name.toLowerCase() === lowerName)
        if (idx === -1) {
          // Treat as add
          staples.push({ name, quantity })
        } else {
          staples[idx].quantity = quantity
        }
        await saveStaples(staples)
      }

      // Format confirmation message with current staples
      const updated = await loadStaples()
      const lines = [`Staples bijgewerkt:`]
      for (const s of updated) {
        lines.push(`- ${s.quantity}x ${s.name}`)
      }
      return lines.join('\n')
    } catch (err) {
      return `Fout bij beheren staples: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'search_recipe',
  description: 'Zoek recepten in de lokale catalogus op naam of categorie. Geen API call — instant resultaat. Categorieën: pasta, noedels, rijst, stamppot, pizza, burgers, vega, vegan, airfryer, soep, 20minuten, eenpans, budget, en meer. Gebruik get_weekly_recipes voor de huidige weekrecepten met ingrediënten.',
  parameters: z.object({
    query: z.string().optional().describe('Zoekterm in receptnaam, bijv. "kip" of "pasta"'),
    category: z.string().optional().describe('Categorie-substring, bijv. "pasta", "20minuten", "vega", "noedels"'),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  execute: async ({ query, category, limit }) => {
    const catalog = loadCatalog()
    const total = Object.keys(catalog.entries).length
    if (total === 0) {
      return 'Catalogus is leeg. Voer eerst "npm run update-recipes" uit om de catalogus te vullen.'
    }
    const results = searchCatalog(catalog, { query, category, limit })
    if (results.length === 0) {
      return `Geen recepten gevonden${query ? ` voor "${query}"` : ''}${category ? ` in categorie "${category}"` : ''}. (catalogus: ${total} recepten)`
    }
    const lines = results.map(r => {
      const cats = r.categories
        .filter(c => c !== 'THIS_WEEK')
        .map(c => c.replace('recipe_cattree_', '').replace('recipe-cattree-', ''))
        .slice(0, 3)
        .join(', ')
      const detail = r.ingredients !== undefined
        ? `${r.cookingTime ?? '?'}, ${r.ingredients.filter(i => i.ingredientType === 'CORE').length} ingrediënten`
        : 'details nog niet geladen'
      return `ID: ${r.id} | ${r.name} (${detail}) | ${cats}`
    })
    lines.unshift(`${results.length} van ${total} recepten:`)
    return lines.join('\n')
  }
})

mcp.addTool({
  name: 'get_weekly_recipes',
  description: 'Haal de wekelijks uitgelichte recepten van Picnic op',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const recipes = await picnic.getWeeklyRecipes()
      if (recipes.length === 0) return 'Geen recepten gevonden deze week.'
      return recipes.map(r => {
        const core = r.ingredients.filter(i => i.ingredientType === 'CORE').length
        const cupboard = r.ingredients.filter(i => i.ingredientType === 'CUPBOARD').length
        const variation = r.ingredients.filter(i => i.ingredientType === 'VARIATION').length
        const parts = [`${core} ingrediënten`]
        if (cupboard > 0) parts.push(`${cupboard} uit eigen keuken`)
        if (variation > 0) parts.push(`${variation} variatietip`)
        return `ID: ${r.id} | ${r.name}${r.cookingTime ? ` (${r.cookingTime})` : ''} | ${parts.join(', ')}`
      }).join('\n')
    } catch (err) {
      return `Fout bij ophalen recepten: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'add_recipe_to_basket',
  description: 'Voeg alle ingrediënten van een Picnic recept toe aan het mandje. Werkt met elk recept-ID uit get_weekly_recipes of search_recipe.',
  parameters: z.object({
    recipe_id: z.string().describe('Recept ID uit get_weekly_recipes of search_recipe'),
    portions: z.number().int().min(1).max(12).optional().describe('Aantal porties (standaard: 4)'),
  }),
  execute: async ({ recipe_id, portions = 4 }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const catalog = loadCatalog()
      const recipe = await picnic.getCatalogRecipeDetail(recipe_id, catalog)
      saveCatalog(catalog)

      const coreIngredients = recipe.ingredients.filter(i => i.ingredientType === 'CORE')
      const cupboardIngredients = recipe.ingredients.filter(i => i.ingredientType === 'CUPBOARD')
      const variationIngredients = recipe.ingredients.filter(i => i.ingredientType === 'VARIATION')

      // Use the selling group task endpoint — preserves recipe context on the order
      const coreIngredientIds = [...new Set(coreIngredients.map(i => i.ingredientId).filter(Boolean))]
      await picnic.assignSellingGroupToBasket(recipe.id, coreIngredientIds, portions)

      const log: string[] = [
        `✓ ${recipe.name} toegevoegd (${portions} porties, ${coreIngredients.length} ingrediënten)`,
      ]

      if (cupboardIngredients.length > 0) {
        log.push('\nUit eigen keuken (niet toegevoegd — heb je dit waarschijnlijk al):')
        cupboardIngredients.forEach(i => log.push(`  - ${i.sellingUnitId} (€${(i.price / 100).toFixed(2)})`))
      }

      if (variationIngredients.length > 0) {
        log.push('\nVariatietips (optioneel, niet toegevoegd):')
        variationIngredients.forEach(i => log.push(`  - ${i.sellingUnitId} (€${(i.price / 100).toFixed(2)}) — voeg toe via add_to_basket als gewenst`))
      }

      return log.join('\n')
    } catch (err) {
      return `Fout bij toevoegen recept: ${String(err)}`
    }
  }
})

mcp.start({ transportType: 'stdio' })
