import type { AdapterContext, CarrierResource } from '@shopickup/core';
import type { GLSCreateParcelRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-parcel --args examples/functions/fixtures/gls/create-parcel.json --full-logs

export const meta = {
  id: 'gls.create-parcel',
  description: 'GLS: create single parcel',
};

export async function run(args: GLSCreateParcelRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.createParcel !== 'function') throw new Error('Adapter does not implement createParcel');

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
