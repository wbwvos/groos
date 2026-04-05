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
