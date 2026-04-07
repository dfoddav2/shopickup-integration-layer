import type { AdapterContext, FetchPickupPointsResponse } from '@shopickup/core';
import type { GLSFetchPickupPointsRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.pickup-points --args examples/functions/fixtures/gls/pickup-points.json --full-logs

export const meta = {
  id: 'gls.pickup-points',
  description: 'GLS: fetch pickup points',
};

export async function run(args: GLSFetchPickupPointsRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.fetchPickupPoints !== 'function') throw new Error('Adapter does not implement fetchPickupPoints');

  const res = await adapter.fetchPickupPoints(args, ctx.adapterContext);
  return res as FetchPickupPointsResponse;
}
