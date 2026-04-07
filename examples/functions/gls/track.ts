import type { AdapterContext, TrackingUpdate } from '@shopickup/core';
import type { GLSTrackingRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.track --args examples/functions/fixtures/gls/track.json --full-logs

export const meta = {
  id: 'gls.track',
  description: 'GLS: track a parcel',
};

export async function run(args: GLSTrackingRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.track !== 'function') throw new Error('Adapter does not implement track');

  const res = await adapter.track(args, ctx.adapterContext);
  return res as TrackingUpdate;
}
