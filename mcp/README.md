# etrink-mcp

MCP server for [etrink](https://etrink.com): cloud MetaTrader 5 accounts and 24/7 bot hosting, driven by
Claude, OpenAI Codex, Gemini CLI, Cursor or any other MCP client. stdio transport, Node.js 18+, no runtime
dependencies (the published file is a single bundle).

## Run

```bash
ETRINK_API_KEY=etrk_mcp_... npx -y etrink-mcp
```

Create the API key at https://etrink.com/app/api-keys (the key is shown once — keep it in an env var or a
`.env` file and point `ETRINK_ENV_FILE` at it; never commit it).

| Env | Meaning |
|---|---|
| `ETRINK_API_KEY` | Your etrink API key (required) |
| `ETRINK_ENV_FILE` | Path to a `.env` file that contains `ETRINK_API_KEY=...` (alternative to the above) |
| `ETRINK_API_BASE` | API base URL, default `https://api.etrink.com` |

Client config (Claude Desktop, Cursor, Gemini CLI, … — `mcpServers` JSON):

```json
{ "mcpServers": { "etrink": { "command": "npx", "args": ["-y", "etrink-mcp"],
                               "env": { "ETRINK_ENV_FILE": "/full/path/.env" } } } }
```

Claude Code: `claude mcp add etrink -e ETRINK_ENV_FILE=/full/path/.env -- npx -y etrink-mcp`

## Tools

- MT5 (read): `list_accounts`, `get_open_positions`, `get_positions`, `get_report`, `get_trades`, `get_recent_signals`
- MT5 (write — the agent must dry-run with `test: true` and get the user's confirmation): `place_order`, `open_account`
- Service hosting: `list_services`, `get_service`, `create_service`, `deploy_service`, `get_build`, `list_releases`,
  `get_service_logs`, `set_service_env`, `update_service`, `start_service`, `stop_service`, `restart_service`,
  `rollback_service`, `exec_in_service`, `delete_service`

Every order passes the same server-side guards as etrink webhooks (plan limits, symbol allow-list, volume
cap, idempotency). How to use the tools safely: [`../etrink/SKILL.md`](../etrink/SKILL.md).

## Build

```bash
npm install && npm run build   # → dist/etrink-mcp.mjs
```

License: MIT
