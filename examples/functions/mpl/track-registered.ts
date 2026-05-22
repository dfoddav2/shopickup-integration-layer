import type { AdapterContext, TrackingUpdate } from '@shopickup/core';
import type { TrackingRequestMPL } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.track-registered --args examples/functions/fixtures/mpl/track-registered.json --exchange-first --full-logs

const prodTrackingUrl = 'https://core.api.posta.hu/v2/nyomkovetes';
const testTrackingUrl = 'https://sandbox.api.posta.hu/v2/nyomkovetes';

function resolveTrackingUrl(opts?: { useTestApi?: boolean }): string {
  return opts?.useTestApi ? testTrackingUrl : prodTrackingUrl;
}

export const meta = {
  id: 'mpl.track-registered',
  description: 'MPL: track parcels using the registered endpoint (includes financial data)',
};

export async function run(args: TrackingRequestMPL, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapterCtx = ctx.adapterContext;

  // Use the exported trackRegistered capability directly for full batch results
  const results = await mod.trackRegistered(
    {
      trackingNumbers: args.trackingNumbers,
      credentials: args.credentials,
      state: 'last',
      useRegisteredEndpoint: true,
      options: args.options,
    },
    adapterCtx,
    resolveTrackingUrl,
  );

  return results as TrackingUpdate[];
}
