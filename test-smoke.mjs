#!/usr/bin/env node
// Smoke test: spawn the MCP server, list tools (generated from the live spec),
// call one FREE endpoint (real data, no wallet) and one PAID endpoint (must
// return the "needs wallet" guard, not spend anything). No private key used.
import { spawn } from 'node:child_process';

const srv = spawn('node', ['index.mjs'], { cwd: import.meta.dirname, env: { ...process.env, X402_WALLET_KEY: '' } });
let buf = '';
const pending = new Map();
srv.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));

let id = 0;
const rpc = (method, params) => new Promise(res => {
  const myId = ++id;
  pending.set(myId, res);
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n');
});
const notify = (method, params) =>
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');

const fail = m => { console.error('FAIL:', m); srv.kill(); process.exit(1); };

await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
notify('notifications/initialized', {});

const list = await rpc('tools/list', {});
const tools = list.result?.tools || [];
console.log(`tools/list -> ${tools.length} tools`);
if (tools.length < 10) fail(`expected >=10 tools, got ${tools.length}`);
const names = tools.map(t => t.name);
for (const need of ['keyword_metrics', 'ai_search_volume', 'google_trends', 'smm_services', 'sms_quote'])
  if (!names.includes(need)) fail(`missing tool ${need}`);
console.log('  sample:', names.slice(0, 8).join(', '));
// a paid tool must announce its price in the description
const km = tools.find(t => t.name === 'keyword_metrics');
if (!/USDC/.test(km.description)) fail('paid tool missing price note');
console.log('  keyword_metrics:', km.description);

// FREE call — real data, no wallet
const free = await rpc('tools/call', { name: 'smm_services', arguments: { q: 'instagram' } });
const freeText = free.result?.content?.[0]?.text || '';
if (free.result?.isError || !freeText.includes('serviceId')) fail(`free call failed: ${freeText.slice(0,200)}`);
console.log(`FREE smm_services -> ok (${freeText.length} bytes, has serviceId)`);

// PAID call without wallet — must be guarded, not spend
const paid = await rpc('tools/call', { name: 'keyword_metrics', arguments: { keywords: ['seo'] } });
const paidText = paid.result?.content?.[0]?.text || '';
if (!paid.result?.isError || !/wallet/i.test(paidText)) fail(`paid guard missing: ${paidText.slice(0,200)}`);
console.log('PAID keyword_metrics (no wallet) -> correctly guarded');

console.log('\n✓ SMOKE TEST PASSED');
srv.kill();
process.exit(0);
