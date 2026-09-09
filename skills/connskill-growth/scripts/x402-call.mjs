#!/usr/bin/env node
// Standalone entrypoint. Copy the complete skill so shared modules stay together.
import { createConfiguredClients, clientErrorCode } from './client-config.mjs';
import { formatUsdc, PaymentClientError } from './payment-client.mjs';

const out = value => process.stdout.write((typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '\n');
function pricesFor(service) {
  if (!Array.isArray(service.accepts) || !service.accepts.length) return null;
  try {
    const values = service.accepts.map(item => ({ display: formatUsdc(item.amount), amount: BigInt(item.amount) }));
    values.sort((a, b) => a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0);
    return values[0].amount === values.at(-1).amount ? values[0].display : values[0].display + '-' + values.at(-1).display;
  } catch { return null; }
}

try {
  const clients = createConfiguredClients();
  const commandArgs = process.argv.slice(2);
  const newPurchase = commandArgs.at(-1) === '--new-purchase';
  if (newPurchase) commandArgs.pop();
  if (commandArgs.length > 3) throw Error('Unexpected arguments');
  const [method = 'prices', target = '', json = '{}'] = commandArgs;
  if (method.toLowerCase() === 'prices') {
    const response = await clients.free.request('/.well-known/x402', { method: 'GET' }, { paid: false });
    if (!response.ok || !Array.isArray(response.json?.services)) throw Error('discovery unavailable');
    out(response.json.services.filter(s => s && typeof s.endpoint === 'string').map(s => ({
      endpoint: s.endpoint, method: s.method || null, usd: pricesFor(s), summary: s.description || s.summary || '',
    })));
  } else {
    if (!target.startsWith('/') || target.startsWith('//')) {
      console.error('usage: x402-call.mjs <GET|POST> </path> [json] [--new-purchase]'); process.exitCode = 2;
    } else {
      const args = JSON.parse(json);
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('JSON object required');
      const rawUrl = clients.origin + target;
      const url = new URL(rawUrl);
      if (url.href !== rawUrl) throw new PaymentClientError('payment_target_invalid');
      const options = { method: method.toUpperCase(), headers: { 'user-agent': 'connskill-growth-skill/0.3' } };
      if (options.method === 'GET' || options.method === 'HEAD') {
        for (const [key, value] of Object.entries(args)) if (value != null) url.searchParams.set(key, String(value));
      } else {
        options.headers['content-type'] = 'application/json';
        options.body = JSON.stringify(args);
      }
      const client = clients.hasWallet ? await clients.paid() : clients.free;
      const response = await client.request(url.href, options, { paid: clients.hasWallet, newPurchase });
      if (response.payment.state !== 'unpaid') out({ status: response.status, payment: response.payment, response: response.json ?? response.text });
      else out(response.text);
      if (!response.ok) {
        console.error(response.status === 402 && !clients.hasWallet
          ? '402 Payment Required. Set X402_WALLET_KEY (a dedicated Base wallet with USDC) to enable paid calls.'
          : 'HTTP ' + response.status);
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error('Call failed: ' + clientErrorCode(error));
  process.exitCode = 1;
}
