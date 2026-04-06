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

## API overzicht (picnic-api v4)

**Auth:** `login`, `generate2FACode('SMS')`, `verify2FACode(code)`

**Cart:** `getCart`, `addProductToCart`, `removeProductFromCart`, `clearCart`, `getDeliverySlots`, `setDeliverySlot`, `getMinimumOrderValue`, `confirmOrder(orderId)` ⚠️

**Catalog:** `search(query)`

**App:** `getPage('home_page_root')`, `getPage('selling-group-details-page?selling_group_id=X')`
