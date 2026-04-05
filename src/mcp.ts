import 'dotenv/config'
import { FastMCP } from 'fastmcp'
import { z } from 'zod'
import { createPicnicService } from './picnic.js'
import { loadStaples, loadMeals } from './config.js'
import { suggestMeals } from './meals.js'

const mcp = new FastMCP({ name: 'groos', version: '0.1.0' })
const picnic = createPicnicService()

// Login bij opstarten
await picnic.login()

mcp.addTool({
  name: 'search_product',
  description: 'Zoek producten in Picnic op naam',
  parameters: z.object({
    query: z.string().describe('Zoekterm, bijv. "havermelk"'),
  }),
  execute: async ({ query }) => {
    const results = await picnic.search(query)
    if (results.length === 0) return 'Geen producten gevonden.'
    return results.slice(0, 8).map(p =>
      `ID: ${p.id} | €${(p.price / 100).toFixed(2)} | ${p.name}`
    ).join('\n')
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
    await picnic.addToBasket(product_id, quantity)
    return `${quantity}x product ${product_id} toegevoegd aan mandje.`
  }
})

mcp.addTool({
  name: 'get_basket',
  description: 'Bekijk de huidige inhoud van het Picnic mandje',
  parameters: z.object({}),
  execute: async () => {
    const basket = await picnic.getBasket()
    return JSON.stringify(basket, null, 2)
  }
})

mcp.addTool({
  name: 'get_delivery_slots',
  description: 'Bekijk beschikbare bezorgtijden bij Picnic',
  parameters: z.object({}),
  execute: async () => {
    const slots = await picnic.getDeliverySlots()
    if (slots.length === 0) return 'Geen bezorgtijden beschikbaar.'
    return slots.map((s, i) =>
      `${i}: ${s.slot_id} | ${s.window_start} – ${s.window_end}`
    ).join('\n')
  }
})

mcp.addTool({
  name: 'set_delivery_slot',
  description: 'Stel een bezorgtijd in',
  parameters: z.object({
    slot_id: z.string().describe('Slot ID uit get_delivery_slots'),
  }),
  execute: async ({ slot_id }) => {
    await picnic.setDeliverySlot(slot_id)
    return `Bezorgtijd ingesteld: ${slot_id}`
  }
})

mcp.addTool({
  name: 'fill_weekly_basket',
  description: 'Vul het mandje automatisch: vaste boodschappen + Claude maaltijdsuggesties',
  parameters: z.object({
    meal_count: z.number().int().min(1).max(5).default(3).describe('Aantal avondmaaltijden'),
  }),
  execute: async ({ meal_count }) => {
    const [staples, knownMeals] = await Promise.all([loadStaples(), loadMeals()])
    const suggestedMeals = await suggestMeals(knownMeals, meal_count)

    const log: string[] = []
    log.push(`Voorgestelde maaltijden deze week:\n${suggestedMeals.map(m => `- ${m}`).join('\n')}\n`)

    // Voeg vaste boodschappen toe
    log.push('Vaste boodschappen toevoegen...')
    for (const staple of staples) {
      const results = await picnic.search(staple.name)
      if (results.length > 0) {
        await picnic.addToBasket(results[0].id, staple.quantity)
        log.push(`✓ ${staple.quantity}x ${results[0].name}`)
      } else {
        log.push(`✗ Niet gevonden: ${staple.name}`)
      }
    }

    log.push('\nMandje gevuld! Open Picnic om te controleren en te bestellen.')
    return log.join('\n')
  }
})

mcp.start({ transportType: 'stdio' })
