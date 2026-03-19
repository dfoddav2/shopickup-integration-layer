import { MPLAdapter } from '@shopickup/adapters-mpl';
import type { AdapterContext } from '@shopickup/core';

export const meta = {
  id: 'mpl.close',
  description: 'MPL: close shipments (batch)',
};

export async function run(args: any, ctx: { adapterContext: AdapterContext }) {
  const adapter = new (await import('@shopickup/adapters-mpl')).MPLAdapter();
  const adapterCtx = ctx.adapterContext;

  // args: { trackingNumbers: string[], credentials: {...}, options?: {...} }
  const req = {
    trackingNumbers: args.trackingNumbers,
    credentials: args.credentials,
    options: args.options,
  } as any;

  // Defensive: check method
  if (typeof (adapter as any).closeShipments !== 'function') {
    throw new Error('Adapter does not implement closeShipments');
  }

  const res = await (adapter as any).closeShipments(req, adapterCtx);
  return res;
}
