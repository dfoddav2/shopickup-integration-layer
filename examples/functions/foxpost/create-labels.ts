export const meta = { id: 'foxpost.createLabels', description: 'Foxpost: create labels (batch)' };

export async function run(args: any, ctx: { adapterContext: any }) {
  const { FoxpostAdapter } = await import('@shopickup/adapters-foxpost');
  const adapter = new (FoxpostAdapter as any)();
  const adapterCtx = ctx.adapterContext;

  const req = {
    parcelCarrierIds: args.parcelCarrierIds,
    credentials: args.credentials,
    options: args.options,
  };

  if (typeof (adapter as any).createLabels !== 'function') throw new Error('Adapter missing createLabels');
  return await (adapter as any).createLabels(req, adapterCtx);
}
