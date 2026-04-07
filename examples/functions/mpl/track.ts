import type { AdapterContext, TrackingUpdate } from '@shopickup/core';
import type { TrackingRequestMPL } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.track --args examples/functions/fixtures/mpl/track.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.track',
  description: 'MPL: track parcels (Pull-1 guest endpoint)',
};

export async function run(args: TrackingRequestMPL, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;
  if (typeof adapter.track !== 'function') {
    throw new Error('Adapter does not implement track');
  }

  const res = await adapter.track(
    {
      trackingNumber: args.trackingNumbers[0],
      credentials: args.credentials,
      options: args.options,
    },
    adapterCtx,
  );
  return res as TrackingUpdate;
}
