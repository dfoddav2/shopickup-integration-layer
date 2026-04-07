import type { AdapterContext } from '@shopickup/core';
import type { ExchangeAuthTokenRequest, ExchangeAuthTokenResponse } from '@shopickup/adapters-mpl';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.exchange-auth --args examples/functions/fixtures/mpl/exchange-auth.json --full-logs

export const meta = {
  id: 'mpl.exchange-auth',
  description: 'MPL: exchange Basic credentials for OAuth token',
};

export async function run(args: ExchangeAuthTokenRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: ExchangeAuthTokenRequest = {
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof adapter.exchangeAuthToken !== 'function') {
    throw new Error('Adapter does not implement exchangeAuthToken');
  }

  const res = await adapter.exchangeAuthToken(req, adapterCtx);
  return res as ExchangeAuthTokenResponse;
}
