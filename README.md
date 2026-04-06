# Groos 🛒

Een MCP server voor [Picnic.nl](https://picnic.nl) waarmee Claude Code je weekboodschappen kan doen. Zoek producten, vul je mandje met vaste boodschappen en Picnic-recepten, kies een bezorgmoment en plaats je bestelling — allemaal vanuit een Claude Code gesprek.

## Vereisten

- Node.js 22+
- Een [Picnic.nl](https://picnic.nl) account (Nederland)
- [Claude Code](https://claude.ai/claude-code)

## Installatie

```bash
git clone https://github.com/sledder/groos
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

| Bestand | Inhoud |
|---------|--------|
| `config/staples.yaml` | Vaste wekelijkse producten met aantallen |
| `config/meals.yaml` | Bekende maaltijden (als inspiratie voor Claude) |
| `config/household.yaml` | Gezinssamenstelling (voor hoeveelheidscheck) |

## Beschikbare tools

Claude heeft toegang tot deze tools:

- **Zoeken & mandje:** `search_product`, `add_to_basket`, `remove_from_basket`, `clear_basket`, `get_basket`
- **Weekplanning:** `get_weekly_plan`, `get_weekly_recipes`, `add_recipe_to_basket`
- **Bezorging:** `get_delivery_slots`, `set_delivery_slot`
- **Bestelling:** `check_order_eligibility`, `confirm_order` ⚠️

## Node.js op WSL

Op Windows Subsystem for Linux gebruik je best nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22 && nvm use 22
```

## Bekende beperkingen

- Receptparsing is gebaseerd op Picnic's interne app-structuur en kan breken bij een Picnic-update.
- Alleen de ~10 uitgelichte recepten van de Picnic homepage zijn beschikbaar.

## Licentie

ISC
