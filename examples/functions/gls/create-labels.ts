import type { AdapterContext, CreateLabelsResponse } from '@shopickup/core';
import type { GLSCreateLabelsRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-labels --args examples/functions/fixtures/gls/create-labels.json --full-logs

export const meta = {
  id: 'gls.create-labels',
  description: 'GLS: create labels (batch)',
};

export async function run(args: GLSCreateLabelsRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.createLabels !== 'function') throw new Error('Adapter does not implement createLabels');

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
