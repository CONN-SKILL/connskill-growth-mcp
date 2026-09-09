---
name: connskill-growth
description: Buy market data and real-world actions per call with USDC (x402, no signup, no API key) from agent.connskill.com - keyword volume by location, Google SERP snapshots with AI-overview and PAA blocks, site audits with a real crawl, backlinks, competitors, SMS verification numbers, receive-only inboxes, GDPR-compliant LLM chat hosted in Germany, and a trust check for other x402 sellers. Use when an agent needs SEO or SERP data, a phone number or inbox for a verification, EU-hosted inference, or wants to vet an x402 seller before paying it.
license: MIT
compatibility: Node 22+. Free endpoints need nothing. Paid endpoints need a Base wallet holding USDC (X402_WALLET_KEY) - use a dedicated, small wallet.
metadata:
  openclaw:
    primaryEnv: X402_WALLET_KEY
    requires:
      bins: ["node"]
    envVars:
      - name: X402_WALLET_KEY
        required: false
        description: Private key (0x...) of a Base wallet holding USDC. Optional - without it only free endpoints work.
      - name: X402_MAX_USD
        required: false
        description: Hard cap per paid call in USD (default 1.00).
    install:
      - id: node
        kind: node
        package: "@connskill/mcp-growth-services"
        bins: ["connskill-growth-mcp"]
        label: MCP server (optional, same tools as this skill)
  hermes:
    tags: [seo, serp, x402, usdc, sms, email, llm, gdpr, trust]
    homepage: https://agent.connskill.com
---

# CONNSKILL Growth Services (x402)

One origin, a live service catalogue, paid per call in USDC on Base via the
x402 protocol. No account, no API key. The first request returns HTTP 402 with the
price; after checking it, the client sends one authorized request. Prices and the full catalogue are always live:

- `https://agent.connskill.com/openapi.json` - schemas, prices, `info.x-guidance`
- `https://agent.connskill.com/.well-known/x402` - every paid endpoint with its price
- `https://agent.connskill.com/llms.txt` - short human/agent readme

## Two ways to call

**Preferred: the MCP server** (tools generated live from the spec, pays for you):
`npx -y @connskill/mcp-growth-services` with env `X402_WALLET_KEY` and `X402_MAX_USD`.

**Without MCP: the bundled script** (same payment path, prints JSON):

```bash
node scripts/x402-call.mjs prices                                   # free: catalogue with prices
node scripts/x402-call.mjs GET  /v1/locations '{"q":"germany"}'     # free
node scripts/x402-call.mjs POST /v1/keyword-ideas '{"keyword":"agent commerce","location":"Germany"}'
```

For paid calls the script needs `npm i x402-fetch viem` once and `X402_WALLET_KEY`
set. Set `X402_MAX_USD` to the maximum amount you authorize for a single call.

## What to call for what

| Need | Endpoint |
|---|---|
| Keyword ideas around a seed | `POST /v1/keyword-ideas {keyword, location?}` |
| Volume/CPC for up to 1000 keywords | `POST /v1/keyword-metrics {keywords[], location?}` |
| Same keywords across up to 30 locations, one payment | `POST /v1/keyword-metrics-multi {keywords[], locations[]}` |
| Google SERP snapshot incl. AI overview, PAA, featured snippet | `POST /v1/serp-report {keyword, location?, depth?}` |
| Site audit: traffic, ranked keywords, competitors, backlinks, real on-page crawl | `POST /v1/site-audit {target}` |
| Backlinks / competitors / domain rank / traffic estimate | `POST /v1/backlinks-report`, `/v1/competitors`, `/v1/domain-rank`, `/v1/traffic-estimate` |
| Vet another x402 seller (live 402, USDC inflow, self-dealing share) | `POST /v1/trust-check {origin}` |
| Phone number for an SMS verification (quote first, free) | `GET /sms/v1/sms-quote?service=...` then `POST /sms/v1/sms-order` |
| Receive-only inbox for 7 days | `POST /mail/v1/mail-inbox` then `POST /mail/v1/mail-messages` (free) |
| GDPR-compliant chat completion hosted in Germany (tool use supported) | `POST /ai/v1/eu-chat {messages[], model?, tools?}` |
| Text embeddings, EU-hosted | `POST /ai/v1/eu-embed {input}` |

Read the live discovery document for current amounts and tiers. The payment challenge binds the chosen request.

Locations are country/city names or DataForSEO codes; `GET /v1/locations?q=germany` lists countries and languages for free.
Ask for the free quote/catalogue endpoint before any paid call when the price is a range.

## Rules of thumb

- Never put a main wallet's key in `X402_WALLET_KEY`. Fund a dedicated wallet with a few USDC.
- Read the current challenge and quote before paying. The helper checks x402 v2,
  exact USDC amounts, Base network, merchant, resource URL and redirects.
- Copy the whole skill folder, including all scripts. Free calls need Node only;
  paid calls need `@x402/fetch@2.17.0`, `@x402/core@2.17.0`, `@x402/evm@2.17.0` and `viem`.
- Never retry payment after an unclear response. Use its purchase reference for
  wallet-authenticated status or support. `202 accepted` is not a delivered result.
- A repeated identical request is guarded by a persistent private attempt store.
  Only use `--new-purchase` (CLI) or `confirmNewPurchase: true` (MCP) when an already
  delivered request is deliberately being bought again. Accepted or unclear attempts
  stay blocked. Keep the store and parent marker; do not clear them as a retry method.
- `X402_MAX_USD` accepts ordinary USDC decimals with up to six decimal places;
  `0` disables payment. Custom `X402_ORIGIN` values require an explicit expected
  `X402_PAY_TO` for paid calls. `X402_STATE_DIR` must be absolute and persistent.
- If you want an endpoint that does not exist yet, post it to `POST /v1/wishlist` (free).
