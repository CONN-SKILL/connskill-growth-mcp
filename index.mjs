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
// The v2 SDK signs a bound EIP-3009 authorization; unknown outcomes block new payment.
// A per-call cap (X402_MAX_USD, default 1.00) bounds what any single call spends.
//
// Env:
//   X402_ORIGIN     base URL (default https://agent.connskill.com)
//   X402_WALLET_KEY 0x-prefixed private key of a Base wallet with USDC (optional)
//   X402_MAX_USD    hard cap per paid call in USD (default 1.00)

import { readFileSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createConfiguredClients, clientErrorCode } from './skills/connskill-growth/scripts/client-config.mjs';
import { PaymentClientError } from './skills/connskill-growth/scripts/payment-client.mjs';

const PACKAGE = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

let clients;
try { clients = createConfiguredClients(); }
catch (error) { console.error('Configuration failed: ' + clientErrorCode(error)); process.exit(1); }
const ORIGIN = clients.origin;
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head']);

async function freeJson(path) {
  const response = await clients.free.request(path, { method: 'GET' }, { paid: false });
  if (!response.ok || !response.json || typeof response.json !== 'object' || Array.isArray(response.json)) {
    throw Error('Discovery unavailable');
  }
  return response.json;
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

// Integer discovery amounts must never pass through floating-point formatting.
function atomicUsdc(value) {
  const raw = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  if (typeof raw !== 'string' || !/^[0-9]{1,78}$/.test(raw)) return null;
  const amount = BigInt(raw);
  const fraction = (amount % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return { raw: amount, display: `${amount / 1000000n}${fraction ? '.' + fraction : ''}` };
}
function priceForService(service) {
  const accepts = service.accepts;
  if (!Array.isArray(accepts) || !accepts.length) return null;
  const prices = accepts.map(a => atomicUsdc(a?.amount));
  if (prices.some(p => p === null)) return null;
  prices.sort((a, b) => a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0);
  return prices[0].raw === prices.at(-1).raw ? prices[0].display : `${prices[0].display}-${prices.at(-1).display}`;
}
function usesWalletAuth(op, spec) {
  const requirements = op.security ?? spec.security;
  return Array.isArray(requirements) && requirements.some(requirement =>
    Object.keys(requirement || {}).some(name => /^(signInWithX|siwx|wallet)$/i.test(name)
      || String(spec.components?.securitySchemes?.[name]?.name || '').toLowerCase() === 'sign-in-with-x'));
}

async function buildTools() {
  const [spec, wellKnown] = await Promise.all([
    freeJson('/openapi.json'),
    freeJson('/.well-known/x402').catch(() => ({ services: [] })),
  ]);
  const priceByPath = new Map();
  for (const s of Array.isArray(wellKnown?.services) ? wellKnown.services : []) {
    if (!s || typeof s.endpoint !== 'string') continue;
    priceByPath.set(`${String(s.method || '*').toLowerCase()}:${s.endpoint}`, priceForService(s));
  }

  const tools = [];
  for (const [path, ops] of Object.entries(spec.paths || {})) {
    if (path === '/health' || path.startsWith('/.well-known') || path === '/openapi.json' || path === '/mcp') continue;
    const usable = Object.entries(ops || {}).filter(([method, op]) => HTTP_METHODS.has(method)
      && op && typeof op === 'object' && !Array.isArray(op) && typeof op.summary === 'string' && op.summary
      && !op['x-mcp-exclude'] && !usesWalletAuth(op, spec));
    for (const [method, op] of usable) {
      const security = op.security ?? spec.security;
      const paid = op['x-free'] !== true && !(Array.isArray(security) && security.length === 0);
      const price = priceByPath.get(`${method}:${path}`) ?? priceByPath.get(`*:${path}`);
      const priceNote = paid
        ? (price != null ? ` (costs ${price} USDC on Base via x402)` : ' (paid via x402)')
        : ' (free)';
      // MCP tool names must be unique. A path serving several methods (e.g.
      // GET+POST /v1/wishlist) keeps the clean name for POST — the action —
      // and suffixes the rest with their method.
      const base = toolName(path);
      const name = usable.length > 1 && method !== 'post' ? `${base}_${method}` : base;
      const schema = inputSchemaFor(op);
      if (paid) {
        if (Object.hasOwn(schema.properties || {}, 'confirmNewPurchase')) throw Error('Reserved argument collision');
        schema.properties = { ...schema.properties, confirmNewPurchase: {
          type: 'boolean', default: false,
          description: 'Set true only to intentionally buy an identical completed request again. Never use for retries or accepted/unclear purchases.',
        } };
      }
      tools.push({
        name,
        description: (op.summary || path) + priceNote,
        inputSchema: schema,
        _meta: { path, method: method.toUpperCase(), paid, price },
      });
    }
  }
  return tools;
}

// --- call an endpoint, paying if needed -----------------------------------
async function callEndpoint(meta, args) {
  let newPurchase = false;
  if (meta.paid) {
    if (args.confirmNewPurchase !== undefined && typeof args.confirmNewPurchase !== 'boolean') {
      throw new PaymentClientError('payment_request_invalid');
    }
    newPurchase = args.confirmNewPurchase === true;
    const { confirmNewPurchase, ...requestArgs } = args;
    args = requestArgs;
  }
  const target = ORIGIN + meta.path;
  const url = new URL(target);
  if (url.href !== target) throw new PaymentClientError('payment_target_invalid');
  const opts = { method: meta.method, headers: {} };
  if (meta.method === 'GET' || meta.method === 'HEAD') {
    for (const [k, v] of Object.entries(args || {})) if (v != null) url.searchParams.set(k, String(v));
  } else {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(args || {});
  }

  let client = clients.free;
  if (meta.paid) {
    client = await clients.paid();
    if (!client) {
      return { isError: true, text: `This endpoint costs ${meta.price != null ? meta.price + ' USDC' : 'a fee'} and needs a funded Base wallet. Set X402_WALLET_KEY (a Base private key holding USDC) to enable paid calls. Free quote/status endpoints work without it.` };
    }
  }
  const response = await client.request(url.href, opts, { paid: meta.paid, newPurchase });
  const payment = response.payment.state === 'unpaid' ? undefined : response.payment;
  return {
    isError: !response.ok,
    text: response.ok ? response.text : `HTTP ${response.status}: ${response.text}`,
    ...(payment ? { payment } : {}),
  };
}

// --- MCP server -----------------------------------------------------------
const server = new Server(
  { name: 'connskill-growth-services', version: PACKAGE.version },
  { capabilities: { tools: {} } },
);

let toolCache = null;
async function tools() { return (toolCache ||= await buildTools()); }

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: (await tools()).map(({ _meta, ...t }) => t),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    const t = (await tools()).find(x => x.name === req.params.name);
    if (!t) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
    const out = await callEndpoint(t._meta, req.params.arguments || {});
    return { isError: out.isError, content: [{ type: 'text', text: out.text }],
      ...(out.payment ? { _meta: { 'io.connskill/payment': out.payment } } : {}) };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: 'Call failed: ' + clientErrorCode(error) }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`connskill-growth-services MCP ready — origin ${ORIGIN}, wallet ${clients.hasWallet ? 'configured' : 'not set (free endpoints only)'}`);
