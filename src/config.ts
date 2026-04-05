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

export type Staple = z.infer<typeof StapleSchema>

export async function loadStaples(): Promise<Staple[]> {
  const raw = await readFile(resolve(configDir, 'staples.yaml'), 'utf8')
  const parsed = StaplesConfigSchema.parse(yaml.load(raw))
  return parsed.staples
}

export async function loadMeals(): Promise<string[]> {
  const raw = await readFile(resolve(configDir, 'meals.yaml'), 'utf8')
  const parsed = MealsConfigSchema.parse(yaml.load(raw))
  return parsed.meals.map(m => m.naam)
}
