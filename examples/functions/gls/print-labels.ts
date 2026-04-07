import type { AdapterContext, CreateLabelsResponse } from '@shopickup/core';
import type { GLSPrintLabelsRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.print-labels --args examples/functions/fixtures/gls/print-labels.json --full-logs

export const meta = {
  id: 'gls.print-labels',
  description: 'GLS: print labels (batch, one-step)',
};

export async function run(args: GLSPrintLabelsRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.printLabels !== 'function') throw new Error('Adapter does not implement printLabels');

  const res = await adapter.printLabels(
    {
      parcels: args.parcels,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CreateLabelsResponse;
}
