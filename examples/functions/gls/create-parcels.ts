export const meta = {
  id: 'gls.createParcels',
  description: 'GLS: create parcels (batch)',
};

export async function run(args: any, ctx: { adapterContext: any }) {
  // args: { parcels: [...], credentials: {...}, options?: {...} }
  const { GLSAdapter } = await import('@shopickup/adapters-gls');
  const adapter = new (GLSAdapter as any)();
  const adapterCtx = ctx.adapterContext;

  const req = {
    parcels: args.parcels,
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof (adapter as any).createParcels !== 'function') {
    throw new Error('Adapter does not implement createParcels');
  }

  return await (adapter as any).createParcels(req, adapterCtx);
}
