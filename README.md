# Groos 🛒

Een MCP server voor [Picnic.nl](https://picnic.nl) waarmee Claude Code je weekboodschappen kan doen. Zoek producten, vul je mandje met vaste boodschappen en Picnic-recepten, kies een bezorgmoment en plaats je bestelling — allemaal vanuit een Claude Code gesprek.

## Vereisten

- Node.js 22+
- Een [Picnic.nl](https://picnic.nl) account (Nederland)
- [Claude Code](https://claude.ai/claude-code)

## Installatie

```bash
git clone https://github.com/wbwvos/groos
cd groos
npm install
cp .env.example .env
```

Vul `.env` in met je Picnic credentials:

```
PICNIC_USERNAME=jouw@email.nl
PICNIC_PASSWORD=jouwwachtwoord
```

> **Let op:** Als je wachtwoord een `#` bevat, zet het dan tussen aanhalingstekens: `PICNIC_PASSWORD="wacht#woord"`

## 2FA instellen (eenmalig)

Picnic vereist SMS-verificatie. Dit doe je eenmalig via de CLI:

```bash
npm run cli 2fa-request       # verstuurt SMS naar je telefoon
npm run cli 2fa-verify 123456 # vul je ontvangen code in
```

Je sessie wordt opgeslagen in `.picnic-session` en automatisch hergebruikt.

## MCP registreren in Claude Code

```bash
claude mcp add groos -- $(pwd)/node_modules/.bin/tsx $(pwd)/src/mcp.ts
```

Start daarna een nieuw Claude Code gesprek. Je kunt nu zeggen:

> *"Vul mijn weekmandje: vaste boodschappen en 2 recepten van Picnic, bezorging morgenochtend."*

## Configuratie aanpassen

Je eigen instellingen staan in `~/.config/groos/`, buiten deze repo. Bij de
eerste start worden ze gekopieerd vanuit de templates in `config/`, dus je hoeft
niks handmatig aan te maken. Zet `GROOS_CONFIG_DIR` om een andere map te
gebruiken.

| Bestand | Inhoud |
|---------|--------|
| `~/.config/groos/staples.yaml` | Vaste wekelijkse producten met aantallen |
| `~/.config/groos/meals.yaml` | Bekende maaltijden (als inspiratie voor Claude) |
| `~/.config/groos/household.yaml` | Gezinssamenstelling (voor hoeveelheidscheck) |

`manage_staples` schrijft naar `staples.yaml`, dus die verandert tijdens gebruik.
De meegeleverde `config/*.example.yaml` blijven ongemoeid.

## Beschikbare tools

Claude heeft toegang tot deze tools:

- **Zoeken & mandje:** `search_product`, `add_to_basket`, `remove_from_basket`, `clear_basket`, `get_basket`
- **Weekplanning:** `get_weekly_plan`, `manage_staples`
- **Recepten:** `get_weekly_recipes`, `search_recipe`, `add_recipe_to_basket`
- **Bezorging:** `get_delivery_slots`, `set_delivery_slot`
- **Bestelling:** `check_order_eligibility`, `confirm_order` ⚠️

### Receptcatalogus

`search_recipe` zoekt in een lokale cache van Picnic-recepten (naam, categorie). Vul of ververs hem met:

```bash
npm run update-recipes
```

`get_weekly_plan` ververst de catalogus automatisch als hij ouder is dan een week.

### Zonder Claude proberen

`npm run flow` draait dezelfde stappen vanaf de opdrachtregel, handig om te zien
wat de tools zouden doen:

```bash
npm run flow -- staples              # zoek je vaste boodschappen op
npm run flow -- recipes              # toon de weekrecepten
npm run flow -- add-recipe <id> 4    # zet een recept in je mandje
```

## Node.js op WSL

Op Windows Subsystem for Linux gebruik je best nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22 && nvm use 22
```

## Bekende beperkingen

- Receptparsing is gebaseerd op Picnic's interne app-structuur en kan breken bij een Picnic-update.
- `confirm_order` werkt momenteel niet via automatisch incasso — Picnic vereist eerst een iDEAL checkout-stap. Zie `CLAUDE.md` voor details.

## Licentie

ISC
