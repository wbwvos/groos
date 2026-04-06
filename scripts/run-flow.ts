import 'dotenv/config'
import { loadStaples, loadHousehold } from './config.js'
import { createPicnicService } from './picnic.js'

const picnic = createPicnicService()
await picnic.login()

const [action, ...args] = process.argv.slice(2)

if (action === 'staples') {
  const [staples] = await Promise.all([loadStaples(), loadHousehold()])
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
  recipes.forEach((r, i) => console.log(`${i}: ${r.id} | ${r.name}${r.cookingTime ? ` (${r.cookingTime})` : ''} | ${r.productIds.length} ingrediënten`))
} else if (action === 'add-recipe') {
  const id = args[0]
  const recipes = await picnic.getWeeklyRecipes()
  const recipe = recipes.find(r => r.id === id)
  if (!recipe) { console.log('Recept niet gevonden'); process.exit(1) }
  console.log(`Ingrediënten toevoegen voor: ${recipe.name}`)
  let added = 0
  for (const productId of recipe.productIds) {
    try {
      await picnic.addToBasket(productId, 1)
      console.log('✓', productId)
      added++
    } catch (err) {
      console.log('✗', productId, String(err))
    }
  }
  console.log(`\n${added}/${recipe.productIds.length} ingrediënten toegevoegd.`)
}
