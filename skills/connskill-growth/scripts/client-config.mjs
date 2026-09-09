// Shared runtime settings for the MCP server and the copied skill.
import os from 'node:os';
import path from 'node:path';
import { createPaymentClient, PaymentClientError } from './payment-client.mjs';
import { createPaymentAttemptStore } from './payment-attempt-store.mjs';

export const DEFAULT_ORIGIN = 'https://agent.connskill.com';
export const DEFAULT_PAY_TO = '0x43B85AE58f0A2505c710Bc715d6f3EB16b1f63dE';

export function clientErrorCode(error) {
  return error instanceof PaymentClientError && /^payment_[a-z_]{1,80}$/.test(error.code)
    ? error.code : 'client_request_failed';
}

export function createConfiguredClients(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const origin = env.X402_ORIGIN === undefined ? DEFAULT_ORIGIN : env.X402_ORIGIN;
  const maxUsd = env.X402_MAX_USD === undefined ? '1.00' : env.X402_MAX_USD;
  const configuredRecipient = env.X402_PAY_TO;
  const configuredStateDirectory = env.X402_STATE_DIR;
  // Validate public settings before importing a wallet or touching persistent state.
  const free = createPaymentClient({ origin, maxUsd, payTo: configuredRecipient, fetchImpl });
  const walletKey = env.X402_WALLET_KEY ?? '';
  if (typeof walletKey !== 'string') throw new PaymentClientError('payment_wallet_configuration_invalid');
  const hasWallet = walletKey.length > 0;
  const payTo = configuredRecipient === undefined && free.origin === DEFAULT_ORIGIN
    ? DEFAULT_PAY_TO : configuredRecipient;
  let paidPromise;
  async function paid() {
    if (!hasWallet) return null;
    if (!payTo) throw new PaymentClientError('payment_recipient_required');
    if (!paidPromise) paidPromise = (async () => {
      const directory = configuredStateDirectory === undefined
        ? path.join(os.homedir(), '.local', 'state', 'connskill-mcp') : configuredStateDirectory;
      if (typeof directory !== 'string' || !path.isAbsolute(directory) ||
          path.resolve(directory) === path.parse(directory).root) {
        throw new PaymentClientError('payment_state_directory_invalid');
      }
      let signer;
      try {
        if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(walletKey)) throw Error('invalid');
        const { privateKeyToAccount } = await import('viem/accounts');
        signer = privateKeyToAccount(walletKey.startsWith('0x') ? walletKey : '0x' + walletKey);
      } catch {
        // Third-party errors may contain key material; never forward their text.
        throw new PaymentClientError('payment_wallet_configuration_invalid');
      }
      const attemptStore = createPaymentAttemptStore({ directory });
      return createPaymentClient({ origin: free.origin, maxUsd, payTo, signer, attemptStore, fetchImpl });
    })();
    return paidPromise;
  }
  return Object.freeze({ origin: free.origin, hasWallet, free, paid });
}
