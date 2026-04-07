import type { AdapterContext, TrackingUpdate } from '@shopickup/core';
import type { TrackingRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.track --args examples/functions/fixtures/foxpost/track.json --full-logs

export const meta = {
  id: 'foxpost.track',
  description: 'Foxpost: track a parcel',
};

export async function run(args: TrackingRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.track !== 'function') {
    throw new Error('Adapter does not implement track');
  }

  const res = await adapter.track(
    {
      trackingNumber: args.trackingNumber,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as TrackingUpdate;
}
