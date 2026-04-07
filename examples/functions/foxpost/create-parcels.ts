import type { AdapterContext, CreateParcelsResponse } from '@shopickup/core';
import type { CreateParcelsRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.create-parcels --args examples/functions/fixtures/foxpost/create-parcels.json --full-logs

export const meta = {
  id: 'foxpost.create-parcels',
  description: 'Foxpost: create parcels (batch)',
};

export async function run(args: CreateParcelsRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.createParcels !== 'function') {
    throw new Error('Adapter does not implement createParcels');
  }

  const res = await adapter.createParcels(
    {
      parcels: args.parcels,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CreateParcelsResponse;
}
