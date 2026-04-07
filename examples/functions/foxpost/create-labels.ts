import type { AdapterContext, CreateLabelsResponse } from '@shopickup/core';
import type { CreateLabelsRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.create-labels --args examples/functions/fixtures/foxpost/create-labels.json --full-logs

export const meta = {
  id: 'foxpost.create-labels',
  description: 'Foxpost: create labels (batch)',
};

export async function run(args: CreateLabelsRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.createLabels !== 'function') {
    throw new Error('Adapter does not implement createLabels');
  }

  const res = await adapter.createLabels(
    {
      parcelCarrierIds: args.parcelCarrierIds,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CreateLabelsResponse;
}
