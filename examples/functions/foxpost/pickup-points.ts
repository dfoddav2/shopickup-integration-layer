import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AdapterContext, FetchPickupPointsResponse } from '@shopickup/core';
import type { FoxpostFetchPickupPointsRequest } from '@shopickup/adapters-foxpost/validation';

// Quick test call:
// pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.pickup-points --args examples/functions/fixtures/foxpost/pickup-points.json --full-logs

export const meta = {
  id: 'foxpost.pickup-points',
  description: 'Foxpost: fetch pickup points',
};

const __dirname = join(fileURLToPath(import.meta.url), '..');

export async function run(args: FoxpostFetchPickupPointsRequest, ctx: { adapterContext: AdapterContext }) {
  const mod = (await import('@shopickup/adapters-foxpost')) as typeof import('@shopickup/adapters-foxpost');
  const adapter = new mod.FoxpostAdapter();

  if (typeof adapter.fetchPickupPoints !== 'function') {
    throw new Error('Adapter does not implement fetchPickupPoints');
  }

  const res = await adapter.fetchPickupPoints(args, ctx.adapterContext);

  writeFileSync(
    join(__dirname, 'pickup-points-result.json'),
    JSON.stringify(res, null, 2),
    'utf-8',
  );

  return res as FetchPickupPointsResponse;
}
