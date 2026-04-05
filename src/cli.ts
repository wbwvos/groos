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
