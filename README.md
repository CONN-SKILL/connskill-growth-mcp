# @connskill/mcp-growth-services

Start with **Keyword Metrics** for Google Ads search volume, CPC, advertising
competition and available monthly history. Add **AI Search Volume** only when
modeled question-demand signals help your decision. These are two separate paid
results, not an automatic bundle. AI demand includes signals such as Google
People Also Ask; it is **not measured ChatGPT or Perplexity usage**. Advertising
competition is not organic SEO difficulty.

[Start keyword research](https://agent.connskill.com/keyword-research?ref=github) ·
[Deutscher Einstieg](https://agent.connskill.com/de/keyword-research?ref=github) ·
[Worked guide](https://agent.connskill.com/news/google-and-ai-keyword-demand?ref=github)

| Result | Free preparation | Paid MCP tool |
|---|---|---|
| Google keyword demand, CPC and advertising competition | [Keyword recipe](https://agent.connskill.com/keyword-research.json) | `keyword_metrics` |
| Modeled AI/question-demand signal | [Data limits and inputs](https://agent.connskill.com/keyword-research?ref=github#ai-search-volume) | `ai_search_volume` |
| Keywords a domain ranks for | [Domain rankings](https://agent.connskill.com/domain-rankings) | `ranked_keywords` |
| Local search + Maps observations | [Local Market Check](https://agent.connskill.com/local-market-check) | `local_market_check` |

### One bounded keyword task

1. Choose 1–10 terms and resolve the country/language with the free catalogue.
2. Read current prices and input limits. Approve each tool and a total budget.
3. Call only the approved tool, using the same terms and market for a comparison:

```json
{"keywords":["seo api","keyword research"],"location_code":2276,"language_code":"de"}
```

Example instruction for your MCP client (preparation only):

> Prepare Keyword Metrics for these two terms in Germany, in German. Explain
> the current price and output fields. Offer AI Search Volume as a separate,
> optional modeled signal. Do not buy either result until I approve the tools
> and total budget. Preserve missing data as unknown and do not retry payment
> after an unclear result.

A free recipe or this prompt does not authorize payment. Keep `X402_MAX_USD=0`
and omit the wallet for preparation. The cap is per call, not a combined budget.
No ranking or revenue guarantee; check partial and unavailable results.

Other catalogue services include site audits, backlinks, SMS verification,
receive-only inboxes, LLM chat hosted in Germany and x402 seller checks.

No account, no API key. Paid calls use **USDC on Base via x402**. Free endpoints
(quotes, catalogue, status, locations) need no wallet at all.

## Source and published package

Version **0.3.2** adds the keyword-first guide and optional discovery-channel measurement.
Version **0.3.1** updated the MCP SDK and vulnerable transitive dependencies.
The payment protocol and spending guards are unchanged from 0.3.0, which introduced the v2 payment client and persistent purchase guards
described below. Earlier **0.2.1** installations use a different payment client;
do not assume these safeguards for that version. Check [npm latest](https://registry.npmjs.org/@connskill%2fmcp-growth-services/latest)
and the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.CONN-SKILL%2Fconnskill-growth-mcp/versions/latest)
before installing. An unversioned `npx` command selects npm's published release,
not necessarily the current GitHub source. Use [the source setup](#from-source)
for this checked-in version. GitHub, npm, Registry and Glama are separate release channels.

This repo provides three entry points:

| Form | For | Install |
|---|---|---|
| **MCP server** (`index.mjs`) | Claude Code, Claude Desktop, Cursor, Codex, OpenClaw, Hermes, anything MCP | Published npm package; check its version, or use the source setup |
| **Skill** (`skills/connskill-growth/`) | Claude Code, Codex, OpenClaw, Hermes (agentskills.io format) | copy the folder or install from this repo |
| **Standalone script** (`skills/connskill-growth/scripts/x402-call.mjs`) | any agent that can run `node` | `node x402-call.mjs GET /v1/local-market-check-quote` (free) |

Tools are generated from the service's current [OpenAPI catalogue](https://agent.connskill.com/openapi.json)
and [x402 prices](https://agent.connskill.com/.well-known/x402) when the MCP process first reads its catalogue.
The available tool set follows those documents; endpoints marked for exclusion and wallet-signature
operations are kept out of this adapter. Restart the MCP process to load an updated catalogue.

## Your first purchase: prepare, then enable payment

Start without a wallet and with payment disabled. For an MCP client that accepts
`mcpServers`, use this pinned configuration (Node.js 22 or newer):

```json
{
  "mcpServers": {
    "connskill-growth": {
      "command": "npx",
      "args": ["-y", "@connskill/mcp-growth-services@0.3.2"],
      "env": { "X402_MAX_USD": "0", "X402_DISCOVERY_SOURCE": "github" }
    }
  }
}
```

1. Inspect the free catalogue, inputs and current quote. HTTP 402 is a price
   offer, not a payment or an error to fix by retrying.
2. Approve the exact tool, inputs and price. Configure `X402_WALLET_KEY` only
   through your MCP client's secure local configuration, using a dedicated
   wallet with USDC on **Base Mainnet**. Never paste a key or seed into a chat.
3. Change `X402_MAX_USD` from `0` to the approved per-call amount, then **restart
   the MCP process** so it reads the new configuration. A configured wallet alone
   does not approve a purchase. Start with one `keyword_metrics` call. Optional
   `ai_search_volume` is a separate purchase, not part of that approval.
4. Save the result and purchase reference. For an unclear payment or missing
   result, use [wallet support](https://agent.connskill.com/support); do not pay
   again. Return the cap to `0` and restart for later preparation-only sessions.

The cap is **per call**, not a total budget or a one-call counter. Your client
must also enforce your approved scope. Client/network costs may be additional.
Hosted MCP can inspect free tools, but it does not supply a wallet or automatically
turn every MCP client into an x402 payment client. Use this local adapter for its
supported automatic payment flow.

## Payment model

The following describes version 0.3.2 and does not apply to earlier 0.2.1 installations.

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

The 0.3.2 source requires Node.js 22 or newer. The lockfile includes runtime dependencies that require Node 22.
The `npx` examples below select the published npm release; verify its version first.
To run the checked-in source, use `node` and the absolute path to its `index.mjs`
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

## Optional discovery-channel measurement

Calls made by this MCP adapter identify the software as `connskill-growth-mcp`
in the User-Agent header. Optionally set `X402_DISCOVERY_SOURCE` to where you
actually found it: `github`, `npm`, `glama`, `mcp-registry`, `x402scan`, `402index`,
`x402-list`, `agenstry`, or `website`. Leave it unset if unknown. No visitor ID,
IP address or wallet key is added by this feature. The existing payment protocol
still uses the payer wallet to settle a purchase.

The merchant reports this as a **self-reported channel**, separately from MCP
client usage. A successful HTTP request alone is not counted as a sale: the
report requires a matching payment and stored successful delivery. Missing or
conflicting channel evidence remains unknown. Installing through npm does not
prove that npm acquired the buyer. Endpoint URLs, signed resources and purchase
bodies are unchanged by this measurement.
