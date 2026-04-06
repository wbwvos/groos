import { readFile, writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../config')

// StapleSchema is used only for its inferred Staple type; actual parsing happens in parseStapleString
const StapleSchema = z.object({ name: z.string(), quantity: z.number() })
const StaplesConfigSchema = z.object({ staples: z.array(z.string()) })
const MealsConfigSchema = z.object({ meals: z.array(z.object({ naam: z.string() })) })
const HouseholdSchema = z.object({ household: z.object({ adults: z.number(), children: z.number() }) })

export type Staple = z.infer<typeof StapleSchema>
export type Household = z.infer<typeof HouseholdSchema>['household']

export function parseStapleString(item: string): Staple {
  // Guard for malformed Nx prefix (no space)
  if (/^\d+x\S/.test(item)) {
    throw new Error(`Ongeldig staples formaat: "${item}". Gebruik "2x havermelk" of "havermelk".`)
  }

  const match = item.match(/^(\d+)x\s+(.+)$/)
  if (match) {
    return { quantity: parseInt(match[1], 10), name: match[2] }
  }
  return { quantity: 1, name: item.trim() }
}

export async function loadStaples(): Promise<Staple[]> {
  const raw = await readFile(resolve(configDir, 'staples.yaml'), 'utf8')
  const parsed = StaplesConfigSchema.parse(yaml.load(raw))
  return parsed.staples.map(parseStapleString)
}

export async function loadHousehold(): Promise<Household> {
  const raw = await readFile(resolve(configDir, 'household.yaml'), 'utf8')
  return HouseholdSchema.parse(yaml.load(raw)).household
}

export async function loadMeals(): Promise<string[]> {
  const raw = await readFile(resolve(configDir, 'meals.yaml'), 'utf8')
  const parsed = MealsConfigSchema.parse(yaml.load(raw))
  return parsed.meals.map(m => m.naam)
}

export async function saveStaples(staples: Staple[]): Promise<void> {
  const lines = staples.map(s => `  - ${s.quantity}x ${s.name}`)
  const content = `staples:\n${lines.join('\n')}\n`
  await writeFile(resolve(configDir, 'staples.yaml'), content, 'utf8')
}
