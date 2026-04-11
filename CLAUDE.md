# Groos

MCP server voor Picnic.nl — laat Claude Code je weekboodschappen doen.

## Setup

```bash
cp .env.example .env
# Vul PICNIC_USERNAME en PICNIC_PASSWORD in
npm install
```

## MCP registreren in Claude Code

```bash
claude mcp add groos -- $(pwd)/node_modules/.bin/tsx $(pwd)/src/mcp.ts
```

## Eerste keer: 2FA instellen

Picnic gebruikt SMS-verificatie. Dit hoef je maar één keer te doen:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npm run cli 2fa-request       # stuurt SMS
npm run cli 2fa-verify <code> # voer de code in
```

De sessie wordt opgeslagen in `.picnic-session` en hergebruikt bij herstart.

## Beschikbare MCP tools

| Tool | Beschrijving |
|------|-------------|
| `search_product` | Zoek producten op naam |
| `add_to_basket` | Voeg product toe aan mandje |
| `remove_from_basket` | Verwijder product uit mandje |
| `clear_basket` | Maak mandje leeg |
| `get_basket` | Toon mandje met totaalprijs |
| `get_weekly_plan` | Toon vaste boodschappen + bekende maaltijden (voor quantity check) |
| `get_weekly_recipes` | Toon uitgelichte recepten van Picnic deze week |
| `add_recipe_to_basket` | Voeg ingrediënten van een recept toe |
| `get_delivery_slots` | Beschikbare bezorgtijden |
| `set_delivery_slot` | Kies bezorgmoment |
| `check_order_eligibility` | Controleer minimum bedrag |
| `confirm_order` | ⚠️ Plaats bestelling definitief |

## Configuratie

- `config/staples.yaml` — vaste wekelijkse boodschappen
- `config/meals.yaml` — bekende maaltijden (voor suggesties)
- `config/household.yaml` — gezinssamenstelling (voor hoeveelheidscheck)

## Runtime vereisten

- Node.js 22+ (via nvm aanbevolen op WSL)
- Picnic.nl account (Nederland)

## Bekende beperkingen

- Receptparsing is gebaseerd op Picnic's interne app-structuur. Een Picnic-update kan dit breken.
- Alleen de ~10 uitgelichte recepten van de Picnic homepage zijn beschikbaar; er is geen zoekfunctie voor recepten.
- `.picnic-session` bevat je auth token — nooit committen (staat in `.gitignore`).

## Bekende technical debt

### confirm_order werkt niet via automatisch incasso

`confirmOrder` faalt omdat Picnic een iDEAL checkout-stap vereist vóór de eerste bevestiging. Na de eerste betaling zou automatisch incasso actief worden, maar dit blijkt in de praktijk niet te werken — ook niet in de Picnic app zelf. De `payment.getPaymentProfile` API laat zien dat alleen iDEAL beschikbaar is als betaalmethode (`available_payment_methods: []`, geen incasso-optie).

Mogelijk vereist Picnic een aparte activatiestap voor automatisch incasso die niet via de API beschikbaar is. Voorlopig is `confirm_order` als tool beschikbaar maar zal het mislukken met een API-fout. Zie ook `src/picnic.ts` voor de TODO-comment.

## API overzicht (picnic-api v4)

**Auth:** `login`, `generate2FACode('SMS')`, `verify2FACode(code)`

**Cart:** `getCart`, `addProductToCart`, `removeProductFromCart`, `clearCart`, `getDeliverySlots`, `setDeliverySlot`, `getMinimumOrderValue`, `confirmOrder(orderId)` ⚠️

**Catalog:** `search(query)`, `getSuggestions(query)`, `getProductDetails(id)`, `getProductDetailsPage(id)`

**Delivery:** `getDeliveries(filter?)`, `getDelivery(id)`, `getDeliveryPosition(id)`, `getDeliveryScenario(id)`

**Payment:** `getPaymentProfile()`, `getWalletTransactions(page)`, `getWalletTransactionDetails(id)`

**Recipe:** `getRecipesPage()`, `getRecipeDetailsPage(id)`, `addProductToRecipe(productId, recipeId, sectionId?, count?)`

**User:** `getUserDetails()`, `getUserInfo()`, `getProfileMenu()`

**App:** `getBootstrapData()`, `getPage(pageId)` — bekende page IDs: `home_page_root`, `purchases-page-root`, `meals-page-root`, `slot-selector-root`, `category-tree-root`, `search-page-results?search_term=X`, `product-details-page-root?id=X`, `selling-group-details-page?selling_group_id=X`
