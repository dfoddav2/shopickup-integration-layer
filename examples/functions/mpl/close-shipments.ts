import type { AdapterContext, CloseShipmentResult } from '@shopickup/core';
import type { CloseShipmentsMPLRequest } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.close-shipments --args examples/functions/fixtures/mpl/close-shipments.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.close',
  description: 'MPL: close shipments (batch)',
};

export async function run(args: CloseShipmentsMPLRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: CloseShipmentsMPLRequest = {
    trackingNumbers: args.trackingNumbers,
    credentials: args.credentials,
    options: args.options,
  };

  // Defensive: check method
  if (typeof (adapter as any).closeShipments !== 'function') {
    throw new Error('Adapter does not implement closeShipments');
  }

  const res = await adapter.closeShipments(req, adapterCtx);
  return res as CloseShipmentResult;
}
