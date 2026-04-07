import type { AdapterContext } from '@shopickup/core';
import type { CreateParcelMPLRequest, CreateParcelsMPLRequest } from '@shopickup/adapters-mpl/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcel --args examples/functions/fixtures/mpl/create-parcel.json --exchange-first --full-logs

export const meta = {
  id: 'mpl.create-parcel',
  description: 'MPL: create single parcel (delegates to createParcels when needed)',
};

export async function run(args: CreateParcelMPLRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-mpl')) as typeof import('@shopickup/adapters-mpl');
  const adapter = new mod.MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  const req: CreateParcelMPLRequest = {
    parcel: args.parcel,
    credentials: args.credentials,
    options: args.options,
  };

  // Prefer adapter.createParcel if available, otherwise reuse createParcels
  if (typeof adapter.createParcel === 'function') {
    const res = await adapter.createParcel(req as any, adapterCtx);
    return res;
  }

  if (typeof adapter.createParcels !== 'function') {
    throw new Error('Adapter does not implement createParcel or createParcels');
  }

  // Build batch request with single parcel and return the first result
  const batchReq: CreateParcelsMPLRequest = {
    parcels: [req.parcel],
    credentials: req.credentials,
    options: req.options,
  };

  const batchRes = await adapter.createParcels(batchReq as any, adapterCtx);
  if (!batchRes || !Array.isArray(batchRes.results) || batchRes.results.length === 0) {
    throw new Error('createParcels returned unexpected result');
  }

  return batchRes.results[0];
}
