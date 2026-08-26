# @connskill/mcp-growth-services

An MCP server that gives an AI agent (Claude Desktop, Cursor, OpenClaw, …) direct
tools for **CONNSKILL Growth Services** — SEO & SERP data, SMS verification and
social-marketing orders — paid per call via **x402 (USDC on Base)**.

Tools are generated **live** from the service's own `/openapi.json` and
`/.well-known/x402`. New endpoints show up automatically; nothing is hardcoded.

## What you get

22 tools (generated live, so the count grows with the service), e.g. `serp_report`, `keyword_metrics`, `ai_search_volume`,
`google_trends`, `keyword_difficulty`, `domain_tech`, `backlinks_report`,
`sms_order`, `smm_order`, plus the free `*_quote` / `*_services` lookups. Each
tool's description carries its price (e.g. *"costs 0.15 USDC on Base via x402"*).

## Payment model

- **Free endpoints** (quotes, catalogue, status) work with **no wallet**.
- **Paid endpoints** need `X402_WALLET_KEY` — the private key of a Base wallet
  holding USDC. `x402-fetch` signs an EIP-3009 authorization per call; the
  facilitator pays the gas. Without a key, paid tools return a clear hint instead
  of spending anything.
- **`X402_MAX_USD`** (default `1.00`) caps what any single call may spend. Set it
  low (e.g. `0.50`) — it is your safety belt against a runaway or buggy call.

⚠️ The wallet key can spend real USDC. Use a **dedicated wallet** funded with only
what you want the agent to be able to spend, never your main wallet.

## Setup

```bash
npm install        # in this folder
```

### Claude Desktop / Cursor (`mcpServers`)

```json
{
  "mcpServers": {
    "connskill-growth": {
      "command": "node",
      "args": ["/absolute/path/to/automaton/mcp/index.mjs"],
      "env": {
        "X402_WALLET_KEY": "<your Base wallet private key, 0x-prefixed>",
        "X402_MAX_USD": "0.50"
      }
    }
  }
}
```

Omit `X402_WALLET_KEY` to run in free-only mode (quotes and catalogue lookups).

## Environment

| Var | Default | Meaning |
|---|---|---|
| `X402_ORIGIN` | `https://agent.connskill.com` | Base URL of the service |
| `X402_WALLET_KEY` | – | Base private key holding USDC (enables paid calls) |
| `X402_MAX_USD` | `1.00` | Hard cap per paid call, in USD |

## Test

```bash
node test-smoke.mjs   # lists tools, calls a free endpoint, checks the paid guard
```

No key is used by the smoke test — it never spends.
