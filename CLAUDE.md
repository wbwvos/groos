# Groos

Automatische weekboodschappen via Picnic, aangestuurd vanuit Claude Code via een MCP server.

## Project

- **Winkel:** Picnic (`picnic-api` npm package)
- **Interface:** MCP server (FastMCP) voor gebruik in Claude Code
- **AI:** Claude API voor maaltijdsuggesties
- **Taal:** TypeScript

## Fases

1. **CLI** — testbed voor Picnic integratie (search, add, basket, delivery)
2. **MCP** — FastMCP server met tools voor Claude Code
3. **UI** (toekomst) — Vite + React + shadcn voor vriendin

## Structuur

```
groos/
├── src/
│   ├── picnic.ts        # Picnic API wrapper
│   ├── cli.ts           # CLI testbed
│   └── mcp.ts           # FastMCP server (fase 2)
├── config/
│   ├── staples.yaml     # vaste boodschappen
│   └── meals.yaml       # maaltijdenlijst
├── docs/plans/          # design docs en implementatieplannen
└── .env                 # credentials (nooit committen)
```

## Design doc

Zie `docs/plans/2026-04-05-groos-design.md` voor het volledige design.
