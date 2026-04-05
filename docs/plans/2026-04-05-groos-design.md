# Groos — Automatische Weekboodschappen

**Datum:** 2026-04-05
**Status:** Goedgekeurd

## Probleemstelling

Wekelijkse boodschappen handmatig bestellen kost tijd. Doel: het vullen van het Picnic mandje automatiseren, inclusief avondmaaltijdsuggesties en vaste dagelijkse benodigdheden.

## Scope (MVP)

- Picnic als boodschappenwinkel
- Handmatige trigger via CLI / MCP in Claude Code
- Geen e-mail notificaties (frontend of Claude Code interface is voldoende)
- Vaste boodschappen via config bestand
- Maaltijdsuggesties via Claude AI (mix van vaste lijst + nieuwe suggesties)

## Technologiestack

| Component | Technologie |
|-----------|-------------|
| Taal | TypeScript |
| Picnic integratie | `picnic-api` npm package |
| MCP framework | FastMCP + Zod |
| AI (maaltijden) | Claude API |
| Config | YAML bestanden |

## Architectuur

### Fase 1 — CLI (testbed)

```
groos/
├── src/
│   ├── picnic.ts        # Picnic API wrapper
│   └── cli.ts           # CLI commando's
├── config/
│   ├── staples.yaml     # vaste boodschappen (havermelk, havermout, etc.)
│   └── meals.yaml       # maaltijdenlijst
├── .env                 # Picnic credentials, Claude API key
└── package.json
```

CLI commando's:
```bash
npm run cli search "havermelk"
npm run cli add <product-id>
npm run cli basket
npm run cli delivery
```

### Fase 2 — MCP server

`picnic.ts` blijft ongewijzigd. Extra bestand `mcp.ts` exposeert dezelfde functies als MCP tools via FastMCP:

| Tool | Beschrijving |
|------|-------------|
| `search_product(query)` | Zoek producten in Picnic |
| `add_to_basket(product_id, quantity)` | Voeg product toe aan mandje |
| `get_basket()` | Huidige inhoud van het mandje |
| `get_delivery_slots()` | Beschikbare bezorgtijden |
| `set_delivery_slot(slot_id)` | Stel bezorgtijd in |
| `fill_weekly_basket()` | Vul mandje op basis van config + AI maaltijdsuggesties |

### Fase 3 (toekomst) — UI voor vriendin

Vite + React + shadcn/ui frontend die de MCP tools als REST endpoints aanroept. Inclusief conversational ordering via een chat interface.

## Data flow

```
Claude Code gebruiker
  → MCP tool aanroepen (bijv. fill_weekly_basket)
  → Claude API: genereer 2-3 maaltijdsuggesties (config/meals.yaml als basis)
  → picnic-api: zoek alle items op (staples + maaltijdingrediënten)
  → picnic-api: voeg toe aan mandje
  → Resultaat terug naar Claude Code: overzicht van gevulde mandje
```

## Config formaat

**config/staples.yaml** — altijd in het mandje:
```yaml
staples:
  - name: havermelk
    quantity: 2
  - name: havermout
    quantity: 1
  - name: bananen
    quantity: 6
```

**config/meals.yaml** — maaltijdenlijst voor AI suggesties:
```yaml
meals:
  - naam: pasta carbonara
  - naam: rijst met groenten
```

## Toekomstige features (buiten MVP scope)

- Conversational ordering via WhatsApp of Signal
- Leergedrag op basis van bestelpatronen
- Bezorgtijden afstemmen via chat
- UI voor vriendin (Vite/React/shadcn)
