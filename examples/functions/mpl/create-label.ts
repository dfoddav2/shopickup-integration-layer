import type { AdapterContext, CreateLabelResponse } from '@shopickup/core';
import type { CreateLabelMPLRequest } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-label --args examples/functions/fixtures/mpl/create-label.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.create-label',
  description: 'MPL: create label for parcel',
};

export async function run(args: CreateLabelMPLRequest, ctx: { adapterContext: AdapterContext }) {
  // Dynamic import to preserve runtime resolution while keeping types
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: CreateLabelMPLRequest = {
    parcelCarrierId: args.parcelCarrierId,
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof adapter.createLabel !== 'function') {
    throw new Error('Adapter does not implement createLabel');
  }

  const res = await adapter.createLabel(req, adapterCtx);
  return res as CreateLabelResponse;
}
