import { readFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configDir = resolve(__dirname, '../config')

const StapleSchema = z.object({ name: z.string(), quantity: z.number() })
const StaplesConfigSchema = z.object({ staples: z.array(StapleSchema) })
const MealsConfigSchema = z.object({ meals: z.array(z.object({ naam: z.string() })) })
const HouseholdSchema = z.object({ household: z.object({ adults: z.number(), children: z.number() }) })

export type Staple = z.infer<typeof StapleSchema>
export type Household = z.infer<typeof HouseholdSchema>['household']

export async function loadStaples(): Promise<Staple[]> {
  const raw = await readFile(resolve(configDir, 'staples.yaml'), 'utf8')
  const parsed = StaplesConfigSchema.parse(yaml.load(raw))
  return parsed.staples
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
