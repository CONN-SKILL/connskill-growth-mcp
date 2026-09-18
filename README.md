# @connskill/mcp-growth-services

Turn a local business question into one JSON report: Google search results, Maps
listings, observed competitor domains and optional own-domain presence. The
**Local Market Check** combines these observations in one paid package call.
You can also start with a domain-ranking snapshot or selected keyword demand.

| Result | Free recipe | Paid tool |
|---|---|---|
| Search + Maps for one term and location | [Local Market Check](https://agent.connskill.com/local-market-check) · [JSON recipe](https://agent.connskill.com/local-market-check.json) | `local_market_check` |
| Keywords a domain ranks for | [Domain rankings](https://agent.connskill.com/domain-rankings) · [JSON recipe](https://agent.connskill.com/domain-rankings.json) | `ranked_keywords` |
| Search volume and advertising competition for selected terms | [Keyword demand](https://agent.connskill.com/keyword-research) · [JSON recipe](https://agent.connskill.com/keyword-research.json) | `keyword_metrics` |

The recipes are free and do not authorize payment. Resolve location and language,
read the current contract and quote, then approve the scope and total spending
limit before buying. Local Market Check returns JSON with `serpTop`, `maps`,
`competitors`, optional `presence` and `tips`. Check `partial` and
`unavailableSections`: missing data remains unknown. Tips are suggestions, not
verified findings. The result is a sample, not a complete market analysis or a
ranking/revenue promise. Do not buy the component searches separately or retry
payment after an unclear result.

Other catalogue services include site audits, backlinks, SMS verification,
receive-only inboxes, LLM chat hosted in Germany and x402 seller checks.

No account, no API key. Paid calls use **USDC on Base via x402**. Free endpoints
(quotes, catalogue, status, locations) need no wallet at all.

## Source and published package

Checked **18 September 2026, 14:19 UTC**: this source tree is the **0.3.0 candidate**;
[npm latest](https://registry.npmjs.org/@connskill%2fmcp-growth-services/latest) and the
[official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.CONN-SKILL%2Fconnskill-growth-mcp/versions/latest)
still publish **0.2.1**. An unversioned `npx` command installs the published package,
not this source candidate. The v2 payment safeguards described below refer to
0.3.0 source and must not be assumed for 0.2.1. Use [the source setup](#from-source)
to run the candidate. Publishing npm, Registry metadata and Glama remains a separate release.

This repo provides three entry points:

| Form | For | Install |
|---|---|---|
| **MCP server** (`index.mjs`) | Claude Code, Claude Desktop, Cursor, Codex, OpenClaw, Hermes, anything MCP | Published npm package, currently 0.2.1; see source setup for 0.3.0 |
| **Skill** (`skills/connskill-growth/`) | Claude Code, Codex, OpenClaw, Hermes (agentskills.io format) | copy the folder or install from this repo |
| **Standalone script** (`skills/connskill-growth/scripts/x402-call.mjs`) | any agent that can run `node` | `node x402-call.mjs GET /v1/local-market-check-quote` (free) |

Tools are generated from the service's current [OpenAPI catalogue](https://agent.connskill.com/openapi.json)
and [x402 prices](https://agent.connskill.com/.well-known/x402) when the MCP process first reads its catalogue.
The available tool set follows those documents; endpoints marked for exclusion and wallet-signature
operations are kept out of this adapter. Restart the MCP process to load an updated catalogue.

## Payment model

The following describes the 0.3.0 source candidate, not the currently published 0.2.1 package.

- **Free endpoints** work with no wallet.
- **Paid endpoints** need `X402_WALLET_KEY`, the private key of a Base wallet holding
  USDC. The official x402 v2 packages sign an EIP-3009 authorization for the chosen
  request. The client permits Base mainnet, official USDC and the configured merchant
  only. It checks the complete resource URL and refuses redirects.
  Without a key, paid MCP tools return a clear hint instead of sending a purchase.
- **`X402_MAX_USD`** (default `1.00`) is an exact USDC decimal with up to six fractional
  digits. Empty, negative, scientific and hexadecimal values are rejected. `0`
  disables payment. This is a per-call authorization limit, not a daily budget.
- Requests have a bounded duration and bounded JSON request/response sizes. A signed
  request is sent at most once. A timeout after dispatch is an **unknown outcome**,
  not proof that the merchant rejected payment.
- An accepted background job (`202`) is recorded as **accepted**, with its purchase
  and authenticated status URLs. It is not reported as a delivered result.
- Payment attempts are persisted before dispatch. Repeating the same canonical request
  does not create another payment by default. An intentional new purchase of an already
  delivered request requires MCP argument `confirmNewPurchase: true` or CLI flag
  `--new-purchase`. Neither option overrides an accepted or unclear purchase.
- Keep the private state directory and its parent together. The parent contains a
  bootstrap marker that detects a missing store. Damaged or incomplete state blocks
  payment; it is never silently reset. A completely lost parent and marker cannot be
  distinguished from first use by a new process. Do not delete them to retry a purchase.
  Separate clients or containers must share the same persistent state to share this guard.

MCP responses include payment state in `_meta["io.connskill/payment"]`; uncertain
outcomes also contain the purchase reference and `doNotPayAgain` in the text result.
No authorization signature or private key is saved in the attempt store. This client
uses the purchase reference for support; it does not automatically replay a payment
header or sign a replacement to recover a response.

⚠️ The key can spend real USDC. Use a **dedicated wallet** funded with only what the
agent may spend. Never a main wallet.

## Install

The 0.3.0 source requires Node.js 22 or newer. The lockfile includes runtime dependencies that require Node 22.
The `npx` examples below select the published npm release (0.2.1 at the check above).
For the 0.3.0 source candidate, use `node` and the absolute path to its `index.mjs`
after the source setup. Free discovery needs no wallet.

### Claude Code

```bash
claude mcp add connskill-growth -s user -e X402_WALLET_KEY=0x... -e X402_MAX_USD=0.50 -- npx -y @connskill/mcp-growth-services
```

Or install the GitHub plugin with its skill (a separate source route from npm; configure wallet credentials through your client):

```bash
claude plugin marketplace add CONN-SKILL/connskill-growth-mcp
claude plugin install connskill-growth@connskill
```

### Codex

```bash
codex mcp add connskill-growth --env X402_WALLET_KEY=0x... --env X402_MAX_USD=0.50 -- npx -y @connskill/mcp-growth-services
```

Skill only: copy the complete `skills/connskill-growth` folder to `~/.agents/skills/`. Its scripts share local modules; copying only `x402-call.mjs` is insufficient.

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
git clone https://github.com/CONN-SKILL/connskill-growth-mcp
cd connskill-growth-mcp
npm ci
node index.mjs            # MCP over stdio
node test-smoke.mjs       # lists tools, calls a free endpoint, checks the paid guard (never spends)
```

### Container from source

Build from this directory using the checked-in lockfile and pinned official Node image:

```bash
docker build --tag connskill-growth-mcp:local .
docker run --rm -i connskill-growth-mcp:local
```

The container runs as the unprivileged `node` user and communicates over STDIO.
Keep stdin open (`-i`); no port is exposed. Free endpoints work without a wallet.
For paid use, keep the parent directory in a named volume and supply the wallet
through the runtime environment:

```bash
docker run --rm -i \
  --mount type=volume,src=connskill-growth-state,dst=/home/node/.local/state \
  --env X402_WALLET_KEY --env X402_MAX_USD=0.50 \
  connskill-growth-mcp:local
```

Reusing the same volume preserves attempts across container replacement. An ephemeral
container filesystem cannot provide that guarantee. Supply settings at runtime only. The build context contains
only the explicitly allowed package files; it excludes credentials and local dependencies.

The local container candidate is separate from a published Glama release. Glama
requires a successful build test and publication through its existing maintainer interface.

The copied standalone skill needs only Node for unsigned calls. For paid calls,
install the locked package dependencies from this source tree, or install
`@x402/fetch@2.17.0`, `@x402/core@2.17.0`, `@x402/evm@2.17.0` and `viem` in a parent
package directory where Node can resolve them. SDK imports are lazy; no wallet or
payment store is required for free discovery.

## Environment

| Var | Default | Meaning |
|---|---|---|
| `X402_ORIGIN` | `https://agent.connskill.com` | Bare HTTPS origin; no credentials, path, query or fragment |
| `X402_WALLET_KEY` | – | Base private key holding USDC (enables paid calls) |
| `X402_MAX_USD` | `1.00` | Exact USDC limit per paid call, at most six decimal places |
| `X402_PAY_TO` | CONNSKILL merchant for the default origin | Expected Base recipient; must be explicitly configured for a custom origin |
| `X402_STATE_DIR` | `~/.local/state/connskill-mcp` | Absolute path to the private attempt store; preserve its parent and marker |

## What it sells (excerpt)

Current amounts and tiers are listed in the [x402 discovery document](https://agent.connskill.com/.well-known/x402).
The actual payment challenge binds the amount for the chosen request.

- `GET /v1/local-market-check-quote` (free), then one approved `POST /v1/local-market-check`
- `POST /v1/ranked-keywords`
- `POST /v1/keyword-ideas`
- `POST /v1/keyword-metrics` (the linked entry recipe limits the task to 1–10 selected keywords; read the live schema for API limits)
- `POST /v1/keyword-metrics-multi` (up to 30 locations, one payment)
- `POST /v1/serp-report` (organic + AI overview, PAA, featured snippet)
- `POST /v1/site-audit` (Labs + backlinks + real on-page crawl)
- `POST /v1/trust-check` (vet an x402 seller: live 402, inflow, self-dealing)
- `POST /sms/v1/sms-order` (quote first, free)
- `POST /mail/v1/mail-inbox` (7-day receive-only inbox)
- `POST /ai/v1/eu-chat` (hosted in Germany, tool use)

Something missing? `POST /v1/wishlist` is free and read by humans.

## License

MIT. Built by CONNSKILL GmbH & Co. KG, Traunstein, Germany.
