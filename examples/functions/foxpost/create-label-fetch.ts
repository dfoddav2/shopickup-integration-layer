import type { AdapterContext, CreateLabelResponse } from '@shopickup/core';
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';
import type { CreateLabelRequestFoxpost } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.create-label-fetch --args examples/functions/fixtures/foxpost/create-label.json --full-logs

export const meta = {
  id: 'foxpost.create-label-fetch',
  description: 'Foxpost: create single label using the fetch HTTP client',
};

export async function run(args: CreateLabelRequestFoxpost, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.createLabel !== 'function') {
    throw new Error('Adapter does not implement createLabel');
  }

  const fetchHttpClient = createFetchHttpClient({
    debug: process.env.HTTP_DEBUG === '1' || process.env.FULL_LOGS === '1',
  });

  const adapterContext: AdapterContext = {
    ...ctx.adapterContext,
    http: fetchHttpClient,
  };

  const res = await adapter.createLabel(
    {
      parcelCarrierId: args.parcelCarrierId,
      credentials: args.credentials,
      options: args.options,
    },
    adapterContext,
  );

  return res as CreateLabelResponse;
}