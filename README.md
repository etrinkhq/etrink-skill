# etrink skill for AI agents

A skill that teaches an AI agent (Claude, OpenAI Codex, Gemini CLI, Cursor and any other MCP-capable
assistant) to work with an [etrink](https://etrink.com) account:

- **MT5 accounts:** list accounts, balances and open positions, closed-trade reports, signal history,
  and (with your confirmation) place or close orders.
- **Service hosting:** create, deploy and operate a Python / Node.js / Go / Rust bot 24/7 —
  build logs, runtime logs, env vars, restart, rollback.

It uses the etrink MCP server; the skill explains setup, tool usage and safety rules.
The skill follows the open [Agent Skills](https://agentskills.io) format (`etrink/SKILL.md` with YAML front matter),
so the same folder works in every client that supports skills. [`AGENTS.md`](AGENTS.md) points other agents to it.

## Install

```bash
git clone https://github.com/etrinkhq/etrink-skill.git
```

| Client | Install |
|---|---|
| **Claude Code** | `mkdir -p ~/.claude/skills && cp -r etrink-skill/etrink ~/.claude/skills/` |
| **Claude.ai / Claude Desktop** | Zip the `etrink` folder and upload it under Settings → Capabilities → Skills |
| **OpenAI Codex CLI** | `mkdir -p ~/.codex/skills && cp -r etrink-skill/etrink ~/.codex/skills/` |
| **Gemini CLI, Cursor, Windsurf, Copilot, others** | Copy `etrink/` into your project (or the client's skills/rules folder) and keep [`AGENTS.md`](AGENTS.md) at the project root — or paste `etrink/SKILL.md` into the client's custom instructions |

Then follow section 1 of [`etrink/SKILL.md`](etrink/SKILL.md) to create an API key and register the MCP server
(commands for Claude, Codex, Gemini CLI, Cursor and generic MCP clients are included).

## Safety

- Your API key stays in your own env/.env file; the skill tells the agent never to print or commit it.
- The agent only trades on your explicit instruction, always dry-runs first (`test: true`) and asks for confirmation.
- Server-side limits (max volume, allowed symbols, plan limits, idempotency) apply to every order.

## License

[MIT](LICENSE). The skill files are free to use and adapt; using etrink itself requires an etrink account.
