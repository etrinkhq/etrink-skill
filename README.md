# etrink skill for Claude

A [Claude skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) that teaches Claude
(Claude Code, Claude Desktop, Claude.ai) to work with an [etrink](https://etrink.com) account:

- **MT5 accounts:** list accounts, balances and open positions, closed-trade reports, signal history,
  and (with your confirmation) place or close orders.
- **Service hosting:** create, deploy and operate a Python / Node.js / Go / Rust bot 24/7 —
  build logs, runtime logs, env vars, restart, rollback.

It uses the etrink MCP server; the skill explains setup, tool usage and safety rules.

## Install

**Claude Code**
```bash
git clone https://github.com/etrink/etrink-skill.git /tmp/etrink-skill
mkdir -p ~/.claude/skills && cp -r /tmp/etrink-skill/etrink ~/.claude/skills/
```

**Claude.ai / Claude Desktop:** zip the `etrink` folder and upload it under Settings → Capabilities → Skills.

Then follow section 1 of [`etrink/SKILL.md`](etrink/SKILL.md) to create an API key and register the MCP server.

## Safety

- Your API key stays in your own env/.env file; the skill tells Claude never to print or commit it.
- Claude only trades on your explicit instruction, always dry-runs first (`test: true`) and asks for confirmation.
- Server-side limits (max volume, allowed symbols, plan limits, idempotency) apply to every order.
