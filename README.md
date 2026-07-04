# anzsco-mcp

[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/NaveenSharma/anzsco-mcp)](https://github.com/NaveenSharma/anzsco-mcp/releases)
[![Glama](https://glama.ai/mcp/servers/NaveenSharma/anzsco-mcp/badges/score.svg)](https://glama.ai/mcp/servers/NaveenSharma/anzsco-mcp)

> **Live endpoint**: `https://mcp.anzsco.com.au/` — no auth required, no install needed.

Model Context Protocol (MCP) server for [anzsco.com.au](https://anzsco.com.au/ai) — lets AI assistants search and explore Australian occupation codes (ANZSCO), visa pathways, state nominations, and the latest SkillSelect invitation round data.

Built as a **Cloudflare Worker** — stateless, globally distributed, free-tier friendly.

---

## What it does

Australian skilled migration requires matching a job role to an **ANZSCO occupation code**. The right code determines:

- Which visa subclasses you can apply for (189 / 190 / 491 / 482 / 186 / 494)
- Which states and territories can nominate you
- Which skills assessment authority assesses your qualifications
- Your SkillSelect points and invitation probability

This MCP server exposes all of that as **8 AI-callable tools**, so Claude (and other AI assistants) can answer questions like:

- *"Can a .NET developer apply for visa 189?"*
- *"What ANZSCO code is a React developer?"*
- *"Does NSW nominate civil engineers for subclass 190?"*
- *"What was the latest SkillSelect points cutoff?"*

---

## 8 Tools

| Tool | Description | Example |
|------|-------------|---------|
| `search_occupations` | Fuzzy search by job title or technology. Handles synonyms — `.net developer` → 261312, `react developer` → 261212, `python data scientist` → 224114 | `query: ".net developer"` |
| `get_occupation` | Full occupation detail: title, ANZSCO group, skills assessment authority, occupation lists (MLTSSL/STSOL/ROL), eligible visa subclasses | `code: "261312"` |
| `get_visa_pathway` | Occupation + visa eligibility combined — is this code on the skills list? What's the assessment pathway? | `code: "261312", subclass: "189"` |
| `get_state_nomination` | Does a given state currently nominate this occupation? Points bonus (+5 for 190, +15 for 491) | `code: "261312", stateCode: "NSW"` |
| `get_latest_skillselect_round` | Most recent SkillSelect round: date, total invitations, breakdown by subclass, points cutoffs | (no params) |
| `search_by_visa` | All occupations eligible for a given visa subclass | `subclass: "189"` |
| `search_by_state` | All occupations nominated by a given state | `stateCode: "VIC"` |
| `compare_occupations` | Side-by-side comparison of 2–5 occupation codes across visas, states, and lists | `codes: ["261312", "261313", "261212"]` |

---

## Live Endpoint

```
https://mcp.anzsco.com.au/
```

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/` | MCP JSON-RPC 2.0 endpoint |
| `GET` | `/` | Root manifest JSON |
| `GET` | `/.well-known/mcp.json` | MCP discovery manifest |
| `GET` | `/.well-known/mcp/server-card.json` | Smithery scanner manifest |
| `GET` | `/tools` | Human-readable tool catalogue |
| `GET` | `/health` | Health check |

**Transport**: JSON-RPC 2.0 over HTTP POST. Stateless (no SSE). No authentication required.

---

## Claude Desktop Integration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "anzsco": {
      "transport": {
        "type": "http",
        "url": "https://mcp.anzsco.com.au/"
      }
    }
  }
}
```

Restart Claude Desktop — you'll see ANZSCO tools available in the tool selector.

---

## Claude Code (CLI) Integration

```bash
claude mcp add anzsco --transport http https://mcp.anzsco.com.au/
```

---

## curl Examples

```bash
MCP_URL="https://mcp.anzsco.com.au"

# Initialize
curl -s -X POST "$MCP_URL/" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0"},"capabilities":{}}}' | jq .

# List tools
curl -s -X POST "$MCP_URL/" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq .result.tools[].name

# Search: .net developer
curl -s -X POST "$MCP_URL/" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_occupations","arguments":{"query":".net developer"}}}' | jq .

# Visa pathway: can 261312 apply for 189?
curl -s -X POST "$MCP_URL/" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_visa_pathway","arguments":{"code":"261312","subclass":"189"}}}' | jq .

# Latest SkillSelect round
curl -s -X POST "$MCP_URL/" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_latest_skillselect_round","arguments":{}}}' | jq .
```

---

## Quick Reference: Common ANZSCO Codes

| Technology / Role | ANZSCO Code | Title |
|---|---|---|
| .NET / C# developer | 261312 | Developer Programmer |
| Java / backend engineer | 261313 | Software Engineer |
| React / Vue / frontend | 261212 | Web Developer |
| Python / data scientist | 224114 | Data Scientist |
| DevOps / Kubernetes | 261316 | DevOps Engineer |
| iOS / Android mobile | 261312 | Developer Programmer |
| Civil engineer | 233512 | Civil Engineer |
| General practitioner (GP) | 253111 | General Medical Practitioner |
| Electrician | 341111 | Electrician (General) |

---

## Deploy Your Own

**Prerequisites**: Node.js 18+, Wrangler CLI, Cloudflare account.

```bash
git clone https://github.com/NaveenSharma/anzsco-mcp.git
cd anzsco-mcp
npm install
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml — set your account_id
npm run deploy
```

The Worker fetches live data from `https://anzsco.com.au/api/` with a 5-minute Cloudflare edge cache. No environment variables or secrets required.

---

## Data Sources

| Data | Source | Cache |
|---|---|---|
| ANZSCO occupation records | `https://anzsco.com.au/api/anzsco/` | 5 min CF edge |
| SkillSelect rounds | `https://anzsco.com.au/api/skillselect/rounds/latest` | 5 min CF edge |
| Tech synonyms mapping | Bundled in `src/synonyms.ts` | N/A (in-memory) |
| State nominations | `https://anzsco.com.au/api/anzsco/` | 5 min CF edge |

---

## Architecture

```
AI Client (Claude, etc.)
    │ POST / (JSON-RPC 2.0)
    ▼
Cloudflare Worker (this repo)
    │ fetch with CF edge cache (5 min TTL)
    ▼
anzsco.com.au API
    │
    ▼
ANZSCO database + SkillSelect data
```

- **Stateless** — no persistent storage in the Worker
- **No auth** — public read-only occupation reference data
- **Globally distributed** — served from 300+ Cloudflare PoPs
- **MCP spec**: `2024-11-05`

---

## Listings

- **Glama**: [glama.ai/mcp/servers/NaveenSharma/anzsco-mcp](https://glama.ai/mcp/servers/NaveenSharma/anzsco-mcp)
- **Smithery**: [smithery.ai/server/anzsco-mcp](https://smithery.ai/server/anzsco-mcp) *(pending)*
- **Docs / demo**: [anzsco.com.au/ai](https://anzsco.com.au/ai)

---

## Contributing

Contributions welcome. The most useful additions are:

- Updating occupation data when ANZSCO publishes new codes
- Adding technology synonyms to `src/synonyms.ts`
- Fixing SkillSelect round data as new rounds are published
- Improving tool descriptions for better AI discoverability

PRs and issues welcome at [github.com/NaveenSharma/anzsco-mcp](https://github.com/NaveenSharma/anzsco-mcp).

---

## License

MIT — see [LICENSE](LICENSE).

Data sourced from publicly available ANZSCO and Department of Home Affairs records. Not affiliated with the Australian Bureau of Statistics or the Department of Home Affairs.
