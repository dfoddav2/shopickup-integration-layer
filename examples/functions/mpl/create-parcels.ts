import type { AdapterContext, CreateParcelsResponse } from '@shopickup/core';
import type { CreateParcelsMPLRequest } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.create-parcels',
  description: 'MPL: create parcels (batch)',
};

export async function run(args: CreateParcelsMPLRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: CreateParcelsMPLRequest = {
    parcels: args.parcels,
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof adapter.createParcels !== 'function') {
    throw new Error('Adapter does not implement createParcels');
  }

  const res = await adapter.createParcels(req, adapterCtx);
  return res as CreateParcelsResponse;
}
