import type { AdapterContext, CarrierResource } from '@shopickup/core';
import type { CreateParcelRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.create-parcel --args examples/functions/fixtures/foxpost/create-parcel.json --full-logs

export const meta = {
  id: 'foxpost.create-parcel',
  description: 'Foxpost: create single parcel',
};

export async function run(args: CreateParcelRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.createParcel !== 'function') {
    throw new Error('Adapter does not implement createParcel');
  }

  const res = await adapter.createParcel(
    {
      parcel: args.parcel,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CarrierResource;
}
