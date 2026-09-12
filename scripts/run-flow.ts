import 'dotenv/config'
import { loadStaples } from '../src/config.js'
import { createPicnicService } from '../src/picnic.js'

const picnic = createPicnicService()
await picnic.login()

const [action, ...args] = process.argv.slice(2)

if (action === 'staples') {
  const staples = await loadStaples()
  for (const s of staples) {
    const results = await picnic.search(s.name)
    if (results.length > 0) {
      const p = results[0]
      const uq = p.unitQuantity ? ` [${p.unitQuantity}]` : ''
      console.log(`  ${s.name} → ${p.id} | ${p.name}${uq} | €${(p.price / 100).toFixed(2)} | aantal: ${s.quantity}`)
    } else {
      console.log('✗ Niet gevonden:', s.name)
    }
  }
} else if (action === 'recipes') {
  const recipes = await picnic.getWeeklyRecipes()
  recipes.forEach((r, i) => console.log(`${i}: ${r.id} | ${r.name}${r.cookingTime ? ` (${r.cookingTime})` : ''} | ${r.ingredients.length} ingrediënten`))
} else if (action === 'add-recipe') {
  const [id, portionsArg] = args
  const portions = portionsArg ? parseInt(portionsArg, 10) : 4
  const recipes = await picnic.getWeeklyRecipes()
  const recipe = recipes.find(r => r.id === id)
  if (!recipe) { console.log('Recept niet gevonden'); process.exit(1) }

  // Mirrors add_recipe_to_basket: only CORE ingredients go in, via the selling
  // group endpoint so the order keeps its recipe context.
  const core = recipe.ingredients.filter(i => i.ingredientType === 'CORE')
  const ingredientIds = [...new Set(core.map(i => i.ingredientId).filter(Boolean))]
  console.log(`Ingrediënten toevoegen voor: ${recipe.name} (${portions} porties)`)
  await picnic.assignSellingGroupToBasket(recipe.id, ingredientIds, portions)
  console.log(`✓ ${core.length} ingrediënten toegevoegd.`)

  const skipped = recipe.ingredients.filter(i => i.ingredientType !== 'CORE')
  if (skipped.length > 0) {
    console.log(`\nNiet toegevoegd (${skipped.length} uit eigen keuken of variatietip):`)
    skipped.forEach(i => console.log(`  - ${i.sellingUnitId} (${i.ingredientType})`))
  }
} else {
  console.log('Gebruik: npm run flow -- <staples|recipes|add-recipe <id> [porties]>')
  process.exit(1)
}
