import type { AdapterContext, FetchPickupPointsResponse } from '@shopickup/core';
import type { FetchPickupPointsRequestMPL } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.pickup-points --args examples/functions/fixtures/mpl/pickup-points.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.pickup-points',
  description: 'MPL: fetch pickup points',
};

export async function run(args: FetchPickupPointsRequestMPL, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();

  if (typeof adapter.fetchPickupPoints !== 'function') {
    throw new Error('Adapter does not implement fetchPickupPoints');
  }

  const res = await adapter.fetchPickupPoints(args, ctx.adapterContext);
  return res as FetchPickupPointsResponse;
}
