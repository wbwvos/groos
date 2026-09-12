import { readFile, writeFile, mkdir, copyFile, access } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import yaml from 'js-yaml'
import { z } from 'zod'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Shipped defaults, committed to the repo. Read-only at runtime. */
const templateDir = resolve(__dirname, '../config')

/**
 * Where this user's own staples, meals and household live.
 * Deliberately outside the checkout: manage_staples writes to these files, and
 * a tool that dirties the working tree on every grocery run is a nuisance. It
 * also keeps one person's shopping list out of a shared repo.
 */
export function userConfigDir(): string {
  if (process.env.GROOS_CONFIG_DIR) return resolve(process.env.GROOS_CONFIG_DIR)
  if (process.env.XDG_CONFIG_HOME) return resolve(process.env.XDG_CONFIG_HOME, 'groos')
  return resolve(homedir(), '.config', 'groos')
}

/** Path to a user config file, seeded from its template on first use. */
async function configFile(name: string): Promise<string> {
  const target = resolve(userConfigDir(), `${name}.yaml`)
  try {
    await access(target)
  } catch {
    await mkdir(dirname(target), { recursive: true })
    await copyFile(resolve(templateDir, `${name}.example.yaml`), target)
  }
  return target
}

// StapleSchema is used only for its inferred Staple type; actual parsing happens in parseStapleString
const StapleSchema = z.object({ name: z.string(), quantity: z.number() })
const StaplesConfigSchema = z.object({ staples: z.array(z.string()) })
const MealsConfigSchema = z.object({ meals: z.array(z.object({ naam: z.string() })) })
const HouseholdSchema = z.object({ household: z.object({ adults: z.number(), children: z.number(), budget_preference: z.enum(['huismerk', 'premium', 'geen']).default('geen') }) })

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
  const raw = await readFile(await configFile('staples'), 'utf8')
  const parsed = StaplesConfigSchema.parse(yaml.load(raw))
  return parsed.staples.map(parseStapleString)
}

export async function loadHousehold(): Promise<Household> {
  const raw = await readFile(await configFile('household'), 'utf8')
  return HouseholdSchema.parse(yaml.load(raw)).household
}

export async function loadMeals(): Promise<string[]> {
  const raw = await readFile(await configFile('meals'), 'utf8')
  const parsed = MealsConfigSchema.parse(yaml.load(raw))
  return parsed.meals.map(m => m.naam)
}

export async function saveStaples(staples: Staple[]): Promise<void> {
  const lines = staples.map(s => `  - ${s.quantity}x ${s.name}`)
  const content = `staples:\n${lines.join('\n')}\n`
  await writeFile(await configFile('staples'), content, 'utf8')
}
