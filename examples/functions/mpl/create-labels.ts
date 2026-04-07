import type { AdapterContext, CreateLabelsResponse } from '@shopickup/core';
import type { CreateLabelsMPLRequest } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-labels --args examples/functions/fixtures/mpl/create-labels.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.create-labels',
  description: 'MPL: create labels for multiple parcels (batch)',
};

export async function run(args: CreateLabelsMPLRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: CreateLabelsMPLRequest = {
    parcelCarrierIds: args.parcelCarrierIds,
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof adapter.createLabels !== 'function') {
    throw new Error('Adapter does not implement createLabels');
  }

  const res = await adapter.createLabels(req, adapterCtx);
  return res as CreateLabelsResponse;
}
