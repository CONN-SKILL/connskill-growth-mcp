#!/usr/bin/env node
// MCP server for CONNSKILL Growth Services.
//
// It exposes the x402 API at agent.connskill.com as MCP tools, so a Claude /
// Cursor / OpenClaw agent can call SEO data, SMS verification and social
// marketing directly. Tools are generated LIVE from the service's own
// /openapi.json (descriptions, input schemas, free-vs-paid) and /.well-known/x402
// (prices) — nothing is hardcoded, so new endpoints appear without a release.
//
// Payment: free endpoints (quotes, status, catalogue) work with no wallet. Paid
// endpoints need X402_WALLET_KEY — the private key of a Base wallet holding USDC.
// x402-fetch signs an EIP-3009 authorization per call; the facilitator pays gas.
// A per-call cap (X402_MAX_USD, default 1.00) bounds what any single call spends.
//
// Env:
//   X402_ORIGIN     base URL (default https://agent.connskill.com)
//   X402_WALLET_KEY 0x-prefixed private key of a Base wallet with USDC (optional)
//   X402_MAX_USD    hard cap per paid call in USD (default 1.00)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const ORIGIN = (process.env.X402_ORIGIN || 'https://agent.connskill.com').replace(/\/+$/, '');
const WALLET_KEY = process.env.X402_WALLET_KEY || '';
const MAX_USD = Number(process.env.X402_MAX_USD || '1.00');
const USDC_DECIMALS = 6;

// --- payment (lazy: only wire up viem/x402 when a key is actually present) ---
let payFetch = null;
async function paymentFetch() {
  if (payFetch) return payFetch;
  if (!WALLET_KEY) return null;
  const { privateKeyToAccount } = await import('viem/accounts');
  const { wrapFetchWithPayment } = await import('x402-fetch');
  const account = privateKeyToAccount(WALLET_KEY.startsWith('0x') ? WALLET_KEY : `0x${WALLET_KEY}`);
  const maxAtomic = BigInt(Math.round(MAX_USD * 10 ** USDC_DECIMALS));
  payFetch = wrapFetchWithPayment(fetch, account, maxAtomic);
  return payFetch;
}

// --- discovery: turn the live spec into tool definitions ------------------
function toolName(path) {
  // /v1/keyword-metrics -> keyword_metrics ; /smm/v1/smm-order -> smm_order
  const last = path.replace(/^\/+/, '').split('/').pop() || path;
  return last.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function inputSchemaFor(op) {
  // POST with a JSON body, or GET with query parameters.
  const body = op.requestBody?.content?.['application/json']?.schema;
  if (body && body.type === 'object') return body;
  if (Array.isArray(op.parameters) && op.parameters.length) {
    const properties = {}, required = [];
    for (const p of op.parameters) {
      properties[p.name] = { ...(p.schema || { type: 'string' }), description: p.description };
      if (p.required) required.push(p.name);
    }
    return { type: 'object', properties, required };
  }
  return { type: 'object', properties: {} };
}

async function buildTools() {
  const [spec, wellKnown] = await Promise.all([
    fetch(`${ORIGIN}/openapi.json`).then(r => r.json()),
    fetch(`${ORIGIN}/.well-known/x402`).then(r => r.json()).catch(() => ({ services: [] })),
  ]);
  const priceByPath = new Map();
  for (const s of wellKnown.services || []) {
    const amt = s.accepts?.[0]?.amount;
    if (amt != null) priceByPath.set(s.endpoint, (Number(amt) / 10 ** USDC_DECIMALS));
  }

  const tools = [];
  for (const [path, ops] of Object.entries(spec.paths || {})) {
    if (path === '/health' || path.startsWith('/.well-known') || path === '/openapi.json') continue;
    for (const [method, op] of Object.entries(ops)) {
      if (!op || typeof op !== 'object' || !op.summary) continue;
      const paid = !(Array.isArray(op.security) && op.security.length === 0);
      const price = priceByPath.get(path);
      const priceNote = paid
        ? (price != null ? ` (costs ${price.toFixed(2)} USDC on Base via x402)` : ' (paid via x402)')
        : ' (free)';
      tools.push({
        name: toolName(path),
        description: (op.summary || path) + priceNote,
        inputSchema: inputSchemaFor(op),
        _meta: { path, method: method.toUpperCase(), paid, price },
      });
    }
  }
  return tools;
}

// --- call an endpoint, paying if needed -----------------------------------
async function callEndpoint(meta, args) {
  const url = new URL(ORIGIN + meta.path);
  const opts = { method: meta.method, headers: {} };
  if (meta.method === 'GET') {
    for (const [k, v] of Object.entries(args || {})) if (v != null) url.searchParams.set(k, String(v));
  } else {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(args || {});
  }

  let doFetch = fetch;
  if (meta.paid) {
    doFetch = await paymentFetch();
    if (!doFetch) {
      return { isError: true, text: `This endpoint costs ${meta.price != null ? meta.price.toFixed(2) + ' USDC' : 'a fee'} and needs a funded Base wallet. Set X402_WALLET_KEY (a Base private key holding USDC) to enable paid calls. Free quote/status endpoints work without it.` };
    }
  }
  const res = await doFetch(url.toString(), opts);
  const text = await res.text();
  if (!res.ok && res.status !== 200) {
    return { isError: true, text: `HTTP ${res.status}: ${text.slice(0, 800)}` };
  }
  return { isError: false, text };
}

// --- MCP server -----------------------------------------------------------
const server = new Server(
  { name: 'connskill-growth-services', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

let toolCache = null;
async function tools() { return (toolCache ||= await buildTools()); }

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: (await tools()).map(({ _meta, ...t }) => t),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const t = (await tools()).find(x => x.name === req.params.name);
  if (!t) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
  try {
    const out = await callEndpoint(t._meta, req.params.arguments || {});
    return { isError: out.isError, content: [{ type: 'text', text: out.text }] };
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: `Call failed: ${e.message}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`connskill-growth-services MCP ready — origin ${ORIGIN}, wallet ${WALLET_KEY ? 'configured' : 'not set (free endpoints only)'}`);
