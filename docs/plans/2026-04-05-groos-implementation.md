# Groos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Picnic grocery automation tool — first as a CLI testbed, then as a FastMCP server for use in Claude Code.

**Architecture:** A TypeScript project with a `picnic.ts` wrapper around the `picnic-api` npm package, a `cli.ts` for manual testing, and a `mcp.ts` FastMCP server that exposes the same functions as Claude-callable tools. Config-driven staples and a meals list feed into Claude API for weekly meal suggestions.

**Tech Stack:** TypeScript, `picnic-api`, `fastmcp`, `@anthropic-ai/sdk`, `js-yaml`, `tsx` (dev runner), `vitest` (tests), `dotenv`

---

## Task 1: Project setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Initialize project**

```bash
cd /home/sledder/projects/groos
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install picnic-api fastmcp @anthropic-ai/sdk js-yaml dotenv zod
npm install -D typescript tsx vitest @types/node @types/js-yaml
```

**Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 4: Update `package.json` scripts**

Replace the `scripts` section with:
```json
{
  "type": "module",
  "scripts": {
    "cli": "tsx src/cli.ts",
    "mcp": "tsx src/mcp.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 5: Create `.env.example`**

```bash
PICNIC_USERNAME=jouw@email.nl
PICNIC_PASSWORD=jouwwachtwoord
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 6: Create `.gitignore`**

```
node_modules/
dist/
.env
```

**Step 7: Create config files**

Create `config/staples.yaml`:
```yaml
staples:
  - name: havermelk
    quantity: 2
  - name: havermout
    quantity: 1
  - name: bananen
    quantity: 6
  - name: appels
    quantity: 4
  - name: chips
    quantity: 1
```

Create `config/meals.yaml`:
```yaml
meals:
  - naam: pasta carbonara
  - naam: rijst met groenten en tofu
  - naam: wraps met kip en groenten
  - naam: tomatensoep met brood
  - naam: couscous met geroosterde groenten
```

**Step 8: Commit**

```bash
git init
git add package.json tsconfig.json .env.example .gitignore config/
git commit -m "chore: initial project setup"
```

---

## Task 2: Config loader

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write the failing test**

Create `src/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { loadStaples, loadMeals } from './config.js'

describe('loadStaples', () => {
  it('returns an array of staple items', async () => {
    const staples = await loadStaples()
    expect(Array.isArray(staples)).toBe(true)
    expect(staples.length).toBeGreaterThan(0)
    expect(staples[0]).toHaveProperty('name')
    expect(staples[0]).toHaveProperty('quantity')
  })
})

describe('loadMeals', () => {
  it('returns an array of meal names', async () => {
    const meals = await loadMeals()
    expect(Array.isArray(meals)).toBe(true)
    expect(meals.length).toBeGreaterThan(0)
    expect(typeof meals[0]).toBe('string')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — "Cannot find module './config.js'"

**Step 3: Write minimal implementation**

Create `src/config.ts`:
```typescript
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../config')

interface Staple {
  name: string
  quantity: number
}

interface MealsConfig {
  meals: { naam: string }[]
}

interface StaplesConfig {
  staples: Staple[]
}

export async function loadStaples(): Promise<Staple[]> {
  const raw = readFileSync(resolve(configDir, 'staples.yaml'), 'utf8')
  const parsed = yaml.load(raw) as StaplesConfig
  return parsed.staples
}

export async function loadMeals(): Promise<string[]> {
  const raw = readFileSync(resolve(configDir, 'meals.yaml'), 'utf8')
  const parsed = yaml.load(raw) as MealsConfig
  return parsed.meals.map(m => m.naam)
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: config loader for staples and meals"
```

---

## Task 3: Picnic API wrapper

De `picnic-api` package heeft geen TypeScript types, dus we wikkelen het in een nette wrapper.

**Files:**
- Create: `src/picnic.ts`
- Create: `src/picnic.test.ts`

**Step 1: Check de picnic-api package**

```bash
node -e "import('picnic-api').then(m => console.log(Object.keys(m)))"
```

Verwacht: lijst van exports zoals `PicnicClient` of default export.

De package documentatie: https://www.npmjs.com/package/picnic-api

**Step 2: Write the failing test (met mock)**

Create `src/picnic.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock picnic-api before importing our wrapper
vi.mock('picnic-api', () => ({
  default: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([
      { id: 'abc123', name: 'Oatly Havermelk', price: 199 }
    ]),
    getCart: vi.fn().mockResolvedValue({ items: [] }),
    addProductToCart: vi.fn().mockResolvedValue(undefined),
    getDeliverySlots: vi.fn().mockResolvedValue({
      delivery_slots: [
        { slot_id: 'slot1', window_start: '2026-04-06T09:00:00', window_end: '2026-04-06T11:00:00' }
      ]
    }),
    setDeliverySlot: vi.fn().mockResolvedValue(undefined),
  }))
}))

import { PicnicService } from './picnic.js'

describe('PicnicService', () => {
  let service: PicnicService

  beforeEach(() => {
    service = new PicnicService('test@test.nl', 'wachtwoord')
  })

  it('can search for products', async () => {
    await service.login()
    const results = await service.search('havermelk')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Oatly Havermelk')
    expect(results[0].id).toBe('abc123')
  })

  it('can get basket', async () => {
    await service.login()
    const basket = await service.getBasket()
    expect(basket).toHaveProperty('items')
  })

  it('can add product to basket', async () => {
    await service.login()
    await expect(service.addToBasket('abc123', 2)).resolves.not.toThrow()
  })

  it('can get delivery slots', async () => {
    await service.login()
    const slots = await service.getDeliverySlots()
    expect(slots).toHaveLength(1)
    expect(slots[0]).toHaveProperty('slot_id')
    expect(slots[0]).toHaveProperty('window_start')
  })
})
```

**Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — "Cannot find module './picnic.js'"

**Step 4: Write minimal implementation**

Create `src/picnic.ts`:
```typescript
import PicnicClient from 'picnic-api'
import 'dotenv/config'

export interface Product {
  id: string
  name: string
  price: number
}

export interface DeliverySlot {
  slot_id: string
  window_start: string
  window_end: string
}

export class PicnicService {
  private client: InstanceType<typeof PicnicClient>
  private username: string
  private password: string

  constructor(username: string, password: string) {
    this.client = new PicnicClient()
    this.username = username
    this.password = password
  }

  async login(): Promise<void> {
    await this.client.login(this.username, this.password)
  }

  async search(query: string): Promise<Product[]> {
    const results = await this.client.search(query)
    // picnic-api returns nested structure, flatten to our interface
    const items = results.flatMap((r: any) => r.items ?? [r])
    return items.map((item: any) => ({
      id: item.id,
      name: item.name,
      price: item.display_price ?? item.price ?? 0,
    }))
  }

  async getBasket(): Promise<any> {
    return this.client.getCart()
  }

  async addToBasket(productId: string, quantity: number = 1): Promise<void> {
    await this.client.addProductToCart(productId, quantity)
  }

  async getDeliverySlots(): Promise<DeliverySlot[]> {
    const response = await this.client.getDeliverySlots()
    return response.delivery_slots ?? []
  }

  async setDeliverySlot(slotId: string): Promise<void> {
    await this.client.setDeliverySlot(slotId)
  }
}

export function createPicnicService(): PicnicService {
  const username = process.env.PICNIC_USERNAME
  const password = process.env.PICNIC_PASSWORD
  if (!username || !password) {
    throw new Error('PICNIC_USERNAME en PICNIC_PASSWORD zijn vereist in .env')
  }
  return new PicnicService(username, password)
}
```

**Noot:** De exacte API structuur van `picnic-api` kan afwijken. Als de tests falen door een andere response structuur, pas dan de `search()` methode aan op basis van wat `console.log(results)` teruggeeft.

**Step 5: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 6: Commit**

```bash
git add src/picnic.ts src/picnic.test.ts
git commit -m "feat: Picnic API wrapper with search, basket and delivery slots"
```

---

## Task 4: CLI testbed

**Files:**
- Create: `src/cli.ts`

Geen aparte tests — de CLI is een thin wrapper rond `PicnicService`. We testen handmatig met echte credentials.

**Step 1: Create `src/cli.ts`**

```typescript
import 'dotenv/config'
import { createPicnicService } from './picnic.js'

const [,, command, ...args] = process.argv

async function main() {
  const picnic = createPicnicService()
  await picnic.login()

  switch (command) {
    case 'search': {
      const query = args.join(' ')
      if (!query) { console.error('Gebruik: npm run cli search <zoekterm>'); process.exit(1) }
      const results = await picnic.search(query)
      if (results.length === 0) { console.log('Geen resultaten gevonden.'); break }
      results.slice(0, 10).forEach(p => console.log(`${p.id}  €${(p.price/100).toFixed(2)}  ${p.name}`))
      break
    }

    case 'add': {
      const [productId, qty] = args
      if (!productId) { console.error('Gebruik: npm run cli add <product-id> [aantal]'); process.exit(1) }
      await picnic.addToBasket(productId, qty ? parseInt(qty) : 1)
      console.log(`Toegevoegd: ${productId}`)
      break
    }

    case 'basket': {
      const basket = await picnic.getBasket()
      console.log(JSON.stringify(basket, null, 2))
      break
    }

    case 'delivery': {
      const slots = await picnic.getDeliverySlots()
      if (slots.length === 0) { console.log('Geen bezorgtijden beschikbaar.'); break }
      slots.forEach((s, i) => console.log(`${i}: ${s.slot_id}  ${s.window_start} – ${s.window_end}`))
      break
    }

    case 'set-delivery': {
      const [slotId] = args
      if (!slotId) { console.error('Gebruik: npm run cli set-delivery <slot-id>'); process.exit(1) }
      await picnic.setDeliverySlot(slotId)
      console.log(`Bezorgtijd ingesteld: ${slotId}`)
      break
    }

    default:
      console.log(`Gebruik:
  npm run cli search <zoekterm>
  npm run cli add <product-id> [aantal]
  npm run cli basket
  npm run cli delivery
  npm run cli set-delivery <slot-id>`)
  }
}

main().catch(err => { console.error(err.message); process.exit(1) })
```

**Step 2: Maak een `.env` op basis van `.env.example`**

```bash
cp .env.example .env
# Vul jouw echte Picnic credentials in
```

**Step 3: Test handmatig**

```bash
npm run cli search havermelk
```
Verwacht: lijst van producten met ID, prijs en naam.

```bash
npm run cli basket
```
Verwacht: JSON van huidig mandje.

```bash
npm run cli delivery
```
Verwacht: lijst van beschikbare bezorgtijden.

**Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: CLI testbed for Picnic integration"
```

---

## Task 5: Claude maaltijdsuggesties

**Files:**
- Create: `src/meals.ts`
- Create: `src/meals.test.ts`

**Step 1: Write the failing test**

Create `src/meals.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'pasta bolognese\ngroentecurry\nomelet met groenten' }]
      })
    }
  }))
}))

import { suggestMeals } from './meals.js'

describe('suggestMeals', () => {
  it('returns 3 meal suggestions as strings', async () => {
    const knownMeals = ['pasta carbonara', 'rijst met groenten']
    const suggestions = await suggestMeals(knownMeals, 3)
    expect(Array.isArray(suggestions)).toBe(true)
    expect(suggestions).toHaveLength(3)
    suggestions.forEach(s => expect(typeof s).toBe('string'))
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — "Cannot find module './meals.js'"

**Step 3: Write minimal implementation**

Create `src/meals.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function suggestMeals(knownMeals: string[], count: number = 3): Promise<string[]> {
  const prompt = `Je helpt bij het plannen van weekboodschappen voor twee personen.

Bekende favoriete maaltijden:
${knownMeals.map(m => `- ${m}`).join('\n')}

Stel ${count} avondmaaltijden voor voor deze week. Mix bekende favorieten met 1-2 nieuwe suggesties.
Geef alleen de maaltijdnamen terug, één per regel, zonder nummering of extra uitleg.`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, count)
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/meals.ts src/meals.test.ts
git commit -m "feat: Claude meal suggestions"
```

---

## Task 6: MCP server met FastMCP

**Files:**
- Create: `src/mcp.ts`

Geen unit tests — FastMCP servers test je door ze te registreren in Claude Code en de tools aan te roepen.

**Step 1: Create `src/mcp.ts`**

```typescript
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
      `ID: ${p.id} | €${(p.price/100).toFixed(2)} | ${p.name}`
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

mcp.run({ transport: 'stdio' })
```

**Step 2: Registreer de MCP in Claude Code**

Voeg toe aan `~/.claude/claude_desktop_config.json` (of via `claude mcp add`):

```bash
claude mcp add groos -- tsx /home/sledder/projects/groos/src/mcp.ts
```

Of handmatig in `~/.claude.json` of de Claude Code MCP config:
```json
{
  "mcpServers": {
    "groos": {
      "command": "tsx",
      "args": ["/home/sledder/projects/groos/src/mcp.ts"]
    }
  }
}
```

**Step 3: Test de MCP in Claude Code**

Herstart Claude Code en vraag:
- "Zoek havermelk in Picnic"
- "Vul ons weekmandje"

**Step 4: Commit**

```bash
git add src/mcp.ts
git commit -m "feat: FastMCP server with Picnic tools"
```

---

## Gereed

Na Task 6 heb je een werkende MCP server waarmee je vanuit Claude Code:
- Producten kunt zoeken in Picnic
- Items kunt toevoegen aan het mandje
- Het mandje kunt bekijken
- Bezorgtijden kunt opvragen en instellen
- Het weekmandje automatisch kunt laten vullen met maaltijdsuggesties

**Volgende stap (optioneel):** Vite + React + shadcn UI voor vriendin.
