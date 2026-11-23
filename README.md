# WineVoyager MCP server

An [MCP](https://modelcontextprotocol.io) server that lets AI assistants answer questions about **Italian DOP wine denominations (DOCG and DOC)** with verified data instead of guesses: regions, provinces, colours, wine types, grapes with minimum and maximum percentages, production methods and the official source of each record.

The data comes from the [WineVoyager API](https://api.winevoyager.tours/docs), read from the official MASAF disciplinari and cross-checked with the EU eAmbrosia register.

## Quick start

No signup needed: without a key the server works at the **basic** level.

### Claude Desktop, Cursor, Windsurf

Add this to the client's MCP configuration (for Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "winevoyager": {
      "command": "npx",
      "args": ["-y", "winevoyager-mcp"],
      "env": {
        "WINEVOYAGER_API_KEY": "your-own-key-or-remove-this-line"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add winevoyager -e WINEVOYAGER_API_KEY=your-own-key -- npx -y winevoyager-mcp
```

Requires Node.js 20 or later.

## Tools

| Tool | What it does |
| --- | --- |
| `search_denominations` | Find denominations by partial name (accents ignored), region, province, colour or DOCG/DOC. Returns ids; page through everything with `offset`. |
| `get_denomination` | Full record of one denomination: wine types, grapes with min/max %, methods, official source. |
| `find_denominations_by_grape` | Which denominations name a grape variety, optionally with a minimum percentage. |
| `list_regions` | The 20 Italian regions with their number of DOCG and DOC and the provinces where they are produced. |

Example questions: *"Which grapes are allowed in Taurasi?"*, *"Which DOCG are made in the province of Cuneo?"*, *"Which region has the most DOCG?"*, *"Where must Sangiovese be at least 80%?"*.

## Access levels and API key

| | Basic (no key) | Full (`WINEVOYAGER_API_KEY`) |
| --- | --- | --- |
| Basic data of all denominations | ✓ | ✓ |
| Wine types, grapes, methods | 8 showcase denominations | all denominations |
| Grape search | showcase only (flagged as incomplete) | complete |

Showcase denominations: Barolo, Barbaresco, Brunello di Montalcino, Chianti Classico, Amarone della Valpolicella, Taurasi, Franciacorta, Conegliano Valdobbiadene Prosecco.

- At the basic level the server tells the assistant which data is missing, so it says so instead of guessing.
- **Your key is personal.** Put it in your own environment, never in a shared config or repository. Keys are free during Early Access (60 days): request one at support@winevoyager.tours.
- An invalid or expired key does not cause errors: the API answers at the basic level, and the server tells the assistant the key was not accepted.

## Limits and caching

- The API allows about 30 requests per minute per IP. When the limit is reached the tool returns an error telling the assistant to wait instead of retrying.
- Responses are cached **in memory only** for 5 minutes and dropped when the server stops. Nothing is written to disk.

## Data licence

The code in this repository is MIT. The **data** returned by the tools is not:

- Basic data and the showcase denominations: **CC-BY 4.0**, attribution *"Data by WineVoyager"* with a link to https://www.winevoyager.tours/developers. Every tool result includes it.
- Wine types, grapes and methods of the other denominations: **commercial licence** (Full plan).
- Runtime use in AI assistants and MCP servers is allowed. Bulk redistribution, permanent copies or indexes of the data, and training AI/ML models are not. Full terms: https://www.winevoyager.tours/developers#terms

Data is provided as is: always check the official disciplinare in force.

## Development

```bash
npm install
npm test          # unit and in-memory MCP tests (synthetic data, no network)
npm run build
node scripts/smoke.mjs   # real stdio client against the live API
npm run inspect   # MCP Inspector
```

Environment variables: `WINEVOYAGER_API_KEY` (optional), `WINEVOYAGER_API_URL` (optional, defaults to `https://api.winevoyager.tours`).
