# @connskill/mcp-growth-services

Pay-per-call market data and real-world actions for AI agents, from
**[agent.connskill.com](https://agent.connskill.com)**: keyword volume by location,
Google SERP snapshots (with AI-overview and PAA blocks), site audits with a real crawl,
backlinks, competitors, SMS verification numbers, receive-only inboxes, GDPR-compliant
LLM chat hosted in Germany, and a trust check for other x402 sellers.

No account, no API key. Each call is paid in **USDC on Base via x402**. Free endpoints
(quotes, catalogue, status, locations) need no wallet at all.

This repo ships the same capability in three forms, so any agent can buy:

| Form | For | Install |
|---|---|---|
| **MCP server** (`index.mjs`) | Claude Code, Claude Desktop, Cursor, Codex, OpenClaw, Hermes, anything MCP | `npx -y @connskill/mcp-growth-services` |
| **Skill** (`skills/connskill-growth/`) | Claude Code, Codex, OpenClaw, Hermes (agentskills.io format) | copy the folder or install from this repo |
| **Standalone script** (`skills/connskill-growth/scripts/x402-call.mjs`) | any agent that can run `node` | `node x402-call.mjs POST /v1/keyword-ideas '{"keyword":"..."}'` |

Tools are generated **live** from the service's `/openapi.json` and `/.well-known/x402`:
57 endpoints today (34 paid), and new ones appear without a release.

## Payment model

- **Free endpoints** work with no wallet.
- **Paid endpoints** need `X402_WALLET_KEY`, the private key of a Base wallet holding
  USDC. `x402-fetch` signs an EIP-3009 authorization per call; the facilitator pays gas.
  Without a key, paid tools return a clear hint instead of spending anything.
- **`X402_MAX_USD`** (default `1.00`) caps what any single call may spend.

⚠️ The key can spend real USDC. Use a **dedicated wallet** funded with only what the
agent may spend. Never a main wallet.

## Install

### Claude Code

```bash
claude mcp add connskill-growth -s user -e X402_WALLET_KEY=0x... -e X402_MAX_USD=0.50 -- npx -y @connskill/mcp-growth-services
```

Or as a plugin with the skill included (asks for the key in its own config, stored in the keychain):

```bash
claude plugin marketplace add CONN-SKILL/connskill-growth-mcp
claude plugin install connskill-growth@connskill
```

### Codex

```bash
codex mcp add connskill-growth --env X402_WALLET_KEY=0x... --env X402_MAX_USD=0.50 -- npx -y @connskill/mcp-growth-services
```

Skill only: copy `skills/connskill-growth` to `~/.agents/skills/`.

### Cursor / Claude Desktop (`mcpServers`)

```json
{
  "mcpServers": {
    "connskill-growth": {
      "command": "npx",
      "args": ["-y", "@connskill/mcp-growth-services"],
      "env": { "X402_WALLET_KEY": "0x...", "X402_MAX_USD": "0.50" }
    }
  }
}
```

### OpenClaw

```bash
openclaw mcp add connskill-growth --command npx --arg -y --arg @connskill/mcp-growth-services
```

Skill: copy `skills/connskill-growth` into `~/.agents/skills/` (or your workspace `skills/`)
and set `X402_WALLET_KEY` under `skills.entries.connskill-growth.env` in `openclaw.json`.

### Hermes (NousResearch hermes-agent)

```bash
hermes skills tap add CONN-SKILL/connskill-growth-mcp
hermes skills install connskill-growth
```

Or MCP in `~/.hermes/config.yaml` under `mcp_servers:` with `command: npx`,
`args: [-y, @connskill/mcp-growth-services]`, `env: {X402_WALLET_KEY: ...}`.

### From source

```bash
git clone https://github.com/CONN-SKILL/connskill-growth-mcp && cd connskill-growth-mcp && npm install
node index.mjs            # MCP over stdio
node test-smoke.mjs       # lists tools, calls a free endpoint, checks the paid guard (never spends)
```

## Environment

| Var | Default | Meaning |
|---|---|---|
| `X402_ORIGIN` | `https://agent.connskill.com` | Base URL of the service |
| `X402_WALLET_KEY` | – | Base private key holding USDC (enables paid calls) |
| `X402_MAX_USD` | `1.00` | Hard cap per paid call, in USD |

## What it sells (excerpt, prices live in `/.well-known/x402`)

| Endpoint | Price (USDC) |
|---|---|
| `POST /v1/keyword-ideas` | 0.03 |
| `POST /v1/keyword-metrics` (up to 1000 keywords) | 0.15 |
| `POST /v1/keyword-metrics-multi` (up to 30 locations, one payment) | 0.15 per location |
| `POST /v1/serp-report` (organic + AI overview, PAA, featured snippet) | 0.10-0.50 |
| `POST /v1/site-audit` (Labs + backlinks + real on-page crawl) | 1.00 |
| `POST /v1/trust-check` (vet an x402 seller: live 402, inflow, self-dealing) | 0.05 |
| `POST /sms/v1/sms-order` (quote first, free) | 0.25-3.00 |
| `POST /mail/v1/mail-inbox` (7-day receive-only inbox) | 0.50 |
| `POST /ai/v1/eu-chat` (GDPR, hosted in Germany, tool use) | 0.10 |

Something missing? `POST /v1/wishlist` is free and read by humans.

## License

MIT. Built by CONNSKILL GmbH & Co. KG, Traunstein, Germany.
