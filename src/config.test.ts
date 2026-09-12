import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadStaples, loadMeals, loadHousehold, parseStapleString, saveStaples, userConfigDir } from './config.js'

// Point config at a throwaway directory so the suite never reads or overwrites
// the real user config, which manage_staples also writes to.
let tempConfigDir: string

beforeAll(() => {
  tempConfigDir = mkdtempSync(join(tmpdir(), 'groos-config-'))
  process.env.GROOS_CONFIG_DIR = tempConfigDir
})

afterAll(() => {
  rmSync(tempConfigDir, { recursive: true, force: true })
  delete process.env.GROOS_CONFIG_DIR
})

describe('userConfigDir', () => {
  it('honours GROOS_CONFIG_DIR', () => {
    expect(userConfigDir()).toBe(tempConfigDir)
  })
})

describe('seeding from templates', () => {
  it('creates staples.yaml from the shipped template on first read', async () => {
    const target = join(tempConfigDir, 'staples.yaml')
    rmSync(target, { force: true })
    expect(existsSync(target)).toBe(false)
    const staples = await loadStaples()
    expect(existsSync(target)).toBe(true)
    expect(staples.length).toBeGreaterThan(0)
  })

  it('seeds meals and household too', async () => {
    await loadMeals()
    await loadHousehold()
    expect(existsSync(join(tempConfigDir, 'meals.yaml'))).toBe(true)
    expect(existsSync(join(tempConfigDir, 'household.yaml'))).toBe(true)
  })

  it('does not overwrite a file that already exists', async () => {
    await saveStaples([{ name: 'eigen keuze', quantity: 7 }])
    const reloaded = await loadStaples()
    expect(reloaded).toEqual([{ name: 'eigen keuze', quantity: 7 }])
  })
})

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

describe('parseStapleString', () => {
  it('parses items with quantity prefix', () => {
    const result = parseStapleString('2x havermelk')
    expect(result).toEqual({ quantity: 2, name: 'havermelk' })
  })

  it('parses items with quantity prefix and spaces', () => {
    const result = parseStapleString('3x  rode  appels')
    expect(result).toEqual({ quantity: 3, name: 'rode  appels' })
  })

  it('defaults to quantity 1 for items without prefix', () => {
    const result = parseStapleString('bananen')
    expect(result).toEqual({ quantity: 1, name: 'bananen' })
  })

  it('handles multi-digit quantities', () => {
    const result = parseStapleString('12x eieren')
    expect(result).toEqual({ quantity: 12, name: 'eieren' })
  })

  it('trims whitespace in fallback branch', () => {
    const result = parseStapleString('  bananen  ')
    expect(result).toEqual({ quantity: 1, name: 'bananen' })
  })

  it('throws an error for malformed Nx prefix (no space)', () => {
    expect(() => parseStapleString('2xhavermelk')).toThrow(
      'Ongeldig staples formaat: "2xhavermelk". Gebruik "2x havermelk" of "havermelk".'
    )
  })
})

describe('saveStaples roundtrip', () => {
  let original: Awaited<ReturnType<typeof loadStaples>>

  beforeEach(async () => { original = await loadStaples() })
  afterEach(async () => { await saveStaples(original) })

  it('saves staples and loads them back unchanged', async () => {
    const testStaples = [
      { name: 'havermelk', quantity: 3 },
      { name: 'bananen', quantity: 2 },
      { name: 'eieren', quantity: 1 },
    ]
    await saveStaples(testStaples)
    const loaded = await loadStaples()
    expect(loaded).toEqual(testStaples)
  })
})
