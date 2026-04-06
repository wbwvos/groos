import 'dotenv/config'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'
import { createPicnicService } from './picnic.js'
import { loadStaples, loadMeals, loadHousehold, saveStaples } from './config.js'

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
      return results.slice(0, limit).map(p =>
        `ID: ${p.id} | €${(p.price / 100).toFixed(2)} | ${p.name}${p.unitQuantity ? ` [${p.unitQuantity}]` : ''}`
      ).join('\n')
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
      const items: Array<{ id: string; name: string; qty: number; price: number }> = []
      for (const line of (basket as any).items ?? []) {
        for (const article of line.items ?? []) {
          const qty = article.decorators?.find((d: any) => d.type === 'QUANTITY')?.quantity ?? 1
          items.push({ id: article.id ?? '?', name: article.name, qty, price: article.price })
        }
      }
      if (items.length === 0) return 'Mandje is leeg.'
      const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
      const lines = items.map(i => `ID: ${i.id} | ${i.qty}x ${i.name.padEnd(40)} €${(i.price / 100).toFixed(2)}`)
      lines.push('─'.repeat(70))
      lines.push(`Totaal: €${(total / 100).toFixed(2)}`)
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
      const [minimum, basket] = await Promise.all([picnic.getMinimumOrderValue(), picnic.getBasket()])
      const items: Array<{ price: number; qty: number }> = []
      for (const line of (basket as any).items ?? []) {
        for (const article of line.items ?? []) {
          const qty = article.decorators?.find((d: any) => d.type === 'QUANTITY')?.quantity ?? 1
          items.push({ price: article.price, qty })
        }
      }
      const total = items.reduce((sum, i) => sum + i.price * i.qty, 0)
      const eligible = total >= minimum
      return [
        `Minimumbedrag: €${(minimum / 100).toFixed(2)}`,
        `Mandje totaal: €${(total / 100).toFixed(2)}`,
        eligible ? '✓ Minimum gehaald — bestelling kan geplaatst worden.' : `✗ Nog €${((minimum - total) / 100).toFixed(2)} nodig om het minimum te halen.`,
      ].join('\n')
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
      return slots.map((s, i) =>
        `${i}: ${s.slot_id} | ${s.window_start} – ${s.window_end}`
      ).join('\n')
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
  description: `Haal de weekplanning op: vaste boodschappen met productnamen en verpakkingseenheden, bekende maaltijden als inspiratie, en het huishouden. Gebruik deze info om hoeveelheden te controleren op redelijkheid voor het huishouden (bijv. 6x "1 kilo" bananen is te veel voor 2 personen) en om maaltijdsuggesties te doen voordat je iets toevoegt aan het mandje.`,
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const [staples, knownMeals, household] = await Promise.all([loadStaples(), loadMeals(), loadHousehold()])

      const lines: string[] = []

      lines.push(`Huishouden: ${household.adults} volwassene(n), ${household.children} kind(eren)\n`)

      lines.push('Vaste boodschappen (uit config):')
      for (const staple of staples) {
        const results = await picnic.search(staple.name)
        if (results.length > 0) {
          const p = results[0]
          lines.push(`  ${staple.name} → ${p.id} | ${p.name}${p.unitQuantity ? ` [${p.unitQuantity}]` : ''} | €${(p.price / 100).toFixed(2)} | geconfigureerd aantal: ${staple.quantity}`)
        } else {
          lines.push(`  ${staple.name} → niet gevonden`)
        }
      }

      lines.push('\nBekende maaltijden (voor suggesties):')
      knownMeals.forEach(m => lines.push(`  - ${m}`))

      lines.push('\nGebruik add_to_basket om de goedgekeurde hoeveelheden toe te voegen.')
      return lines.join('\n')
    } catch (err) {
      return `Fout bij ophalen weekplanning: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'manage_staples',
  description: 'Voeg, verwijder of wijzig vaste wekelijkse boodschappen. Dit persists in config/staples.yaml.',
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
        if (!quantity) return `Aantal is verplicht bij toevoegen. Voorbeeld: name="havermelk", quantity=2`
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
        if (!quantity) return `Aantal is verplicht bij wijzigen. Voorbeeld: name="havermelk", quantity=3`
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
  name: 'get_weekly_recipes',
  description: 'Haal de wekelijks uitgelichte recepten van Picnic op',
  parameters: z.object({}),
  execute: async () => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const recipes = await picnic.getWeeklyRecipes()
      if (recipes.length === 0) return 'Geen recepten gevonden deze week.'
      return recipes.map(r =>
        `ID: ${r.id} | ${r.name}${r.cookingTime ? ` (${r.cookingTime})` : ''} | ${r.productIds.length} ingrediënten`
      ).join('\n')
    } catch (err) {
      return `Fout bij ophalen recepten: ${String(err)}`
    }
  }
})

mcp.addTool({
  name: 'add_recipe_to_basket',
  description: 'Voeg alle ingrediënten van een Picnic recept toe aan het mandje',
  parameters: z.object({
    recipe_id: z.string().describe('Recept ID uit get_weekly_recipes'),
  }),
  execute: async ({ recipe_id }) => {
    try {
      const authErr = authGuard(); if (authErr) return authErr
      const recipes = await picnic.getWeeklyRecipes()
      const recipe = recipes.find(r => r.id === recipe_id)
      if (!recipe) return `Recept ${recipe_id} niet gevonden. Gebruik get_weekly_recipes voor de huidige lijst.`

      const log: string[] = [`Ingrediënten toevoegen voor: ${recipe.name}`]
      let added = 0
      for (const productId of recipe.productIds) {
        try {
          await picnic.addToBasket(productId, 1)
          log.push(`✓ ${productId}`)
          added++
        } catch (err) {
          log.push(`✗ ${productId}: ${String(err)}`)
        }
      }
      log.push(`\n${added}/${recipe.productIds.length} ingrediënten toegevoegd.`)

      if (recipe.unavailable.length > 0) {
        log.push('\nNiet beschikbaar — mogelijke alternatieven:')
        for (const u of recipe.unavailable) {
          log.push(`\n✗ ${u.name}`)
          if (u.alternatives.length > 0) {
            u.alternatives.forEach(a =>
              log.push(`  → ${a.id} | €${(a.price / 100).toFixed(2)} | ${a.name}${a.unitQuantity ? ` [${a.unitQuantity}]` : ''}`)
            )
          } else {
            log.push('  (geen alternatieven gevonden)')
          }
        }
      }

      return log.join('\n')
    } catch (err) {
      return `Fout bij toevoegen recept: ${String(err)}`
    }
  }
})

mcp.start({ transportType: 'stdio' })
