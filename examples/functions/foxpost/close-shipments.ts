import type { AdapterContext, CloseShipmentsResponse } from '@shopickup/core';
import type { CloseShipmentsRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.close-shipments --args examples/functions/fixtures/foxpost/close-shipments.json --full-logs --save-label
//
// Foxpost has no separate shipment-closing step; this maps to POST /api/label/deliveryNote,
// which returns a single delivery note PDF covering all requested parcel barcodes. The PDF is
// exposed via the response's `files` array (see CloseShipmentsResponse). Pass --save-label to
// write it to close-shipments.pdf next to this file.

export const meta = {
  id: 'foxpost.close-shipments',
  description: 'Foxpost: close shipments (generate delivery note PDF)',
};

export async function run(args: CloseShipmentsRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.closeShipments !== 'function') {
    throw new Error('Adapter does not implement closeShipments');
  }

  const res = await adapter.closeShipments(
    {
      trackingNumbers: args.trackingNumbers,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CloseShipmentsResponse;
}
