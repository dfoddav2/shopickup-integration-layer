import type { AdapterContext, CreateLabelResponse } from '@shopickup/core';
import type { GLSCreateLabelRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-label --args examples/functions/fixtures/gls/create-label.json --save-label --full-logs

export const meta = {
  id: 'gls.create-label',
  description: 'GLS: create single label',
};

export async function run(args: GLSCreateLabelRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.createLabel !== 'function') throw new Error('Adapter does not implement createLabel');

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
