import type { AdapterContext, CreateLabelResponse } from '@shopickup/core';
import type { CreateLabelRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.create-label --args examples/functions/fixtures/foxpost/create-label.json --full-logs

export const meta = {
  id: 'foxpost.create-label',
  description: 'Foxpost: create single label',
};

export async function run(args: CreateLabelRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.createLabel !== 'function') {
    throw new Error('Adapter does not implement createLabel');
  }

  const res = await adapter.createLabel(
    {
      parcelCarrierId: args.parcelCarrierId,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CreateLabelResponse;
}
