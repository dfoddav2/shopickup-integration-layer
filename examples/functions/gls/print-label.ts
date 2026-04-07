import type { AdapterContext, CreateLabelResponse } from '@shopickup/core';
import type { GLSPrintLabelRequest } from '@shopickup/adapters-gls/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.print-label --args examples/functions/fixtures/gls/print-label.json --full-logs

export const meta = {
  id: 'gls.print-label',
  description: 'GLS: print single label (one-step)',
};

export async function run(args: GLSPrintLabelRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-gls')) as typeof import('@shopickup/adapters-gls');
  const adapter = new mod.GLSAdapter();

  if (typeof adapter.printLabel !== 'function') throw new Error('Adapter does not implement printLabel');

  const res = await adapter.printLabel(
    {
      parcel: args.parcel,
      credentials: args.credentials,
      options: args.options,
    },
    ctx.adapterContext,
  );

  return res as CreateLabelResponse;
}
