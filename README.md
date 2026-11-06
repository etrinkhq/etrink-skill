# etrink skill for AI agents — MetaTrader 5 (MT5) + 24/7 bot hosting

[![License: MIT](https://img.shields.io/badge/license-MIT-37e39a.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/format-Agent%20Skills-37e39a.svg)](https://agentskills.io)
[![MCP](https://img.shields.io/badge/MCP-server-37e39a.svg)](https://etrink.com/mcp)

Talk to your MetaTrader 5 accounts from Claude Code, Claude Desktop, OpenAI Codex, Gemini CLI or Cursor.
[etrink](https://etrink.com) runs your MT5 terminals and Expert Advisors (EAs) in the cloud 24/7 — no VPS to manage —
and this skill teaches your AI agent how to use them safely through the etrink MCP server.

**Ask things like:**

- "How did my gold bot do this week? Break it down by magic number."
- "Show my open positions and equity on all accounts."
- "What was the slippage on my last 20 TradingView signals?"
- "Buy 0.10 EURUSD on my demo account with SL 1.0820" (dry run first, then your confirmation)
- "Deploy this Python bot as a 24/7 service and show me the logs."

## What it covers

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
