import type { AdapterContext, CreateParcelsResponse } from '@shopickup/core';
import type { GLSCreateParcelsRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-parcels --args examples/functions/fixtures/gls/create-parcels.json --full-logs

export const meta = {
  id: 'gls.create-parcels',
  description: 'GLS: create parcels (batch)',
};

export async function run(args: GLSCreateParcelsRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.createParcels !== 'function') throw new Error('Adapter does not implement createParcels');

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
