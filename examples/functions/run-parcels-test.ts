#!/usr/bin/env ts-node
import path from 'path';
import fs from 'fs';
import { loadEnv } from './_lib/env';
import { createHttpClient, buildAdapterContext } from './_lib/context';

async function main() {
  // Load local .env if present
  const root = path.dirname(new URL(import.meta.url).pathname);
  const localEnv = path.join(root, '.env');
  if (fs.existsSync(localEnv)) loadEnv(localEnv);

  const useMock = process.env.USE_MOCK_HTTP_CLIENT === '1' || process.env.USE_MOCK_HTTP_CLIENT === 'true';
  const http = createHttpClient({ useMock });
  const ctx = { adapterContext: buildAdapterContext(http, console as any) } as any;

  const fixturePath = path.join(root, 'fixtures', 'mpl', 'create-parcels.json');
  if (!fs.existsSync(fixturePath)) {
    console.error('Fixture not found:', fixturePath);
    process.exit(1);
  }

  const args = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as any;

  // Optionally exchange credentials first if EXCHANGE_AUTH_FIRST=1
  const exchangeFirst = process.env.EXCHANGE_AUTH_FIRST === '1' || process.argv.includes('--exchange-first');
  if (exchangeFirst) {
    const apiKey = process.env.MPL_API_KEY || args.credentials?.apiKey;
    const apiSecret = process.env.MPL_API_SECRET || args.credentials?.apiSecret;
    if (apiKey && apiSecret) {
      const { MPLAdapter } = await import('@shopickup/adapters-mpl');
      const adapter = new MPLAdapter();
      console.log('Exchanging API key/secret for OAuth token...');
      const exch = await (adapter as any).exchangeAuthToken({ credentials: { apiKey, apiSecret }, options: { useTestApi: args.options?.useTestApi } }, ctx.adapterContext);
      args.credentials = args.credentials || {};
      args.credentials.authType = 'oauth2';
      args.credentials.access_token = exch.access_token;
      console.log('Received token (masked):', exch.access_token ? ('****' + String(exch.access_token).slice(-4)) : '<none>');
    } else {
      console.warn('exchange-first requested but apiKey/apiSecret not available in env or fixture');
    }
  }

  // Run create-parcels via adapter
  const { MPLAdapter } = await import('@shopickup/adapters-mpl');
  const adapter = new MPLAdapter();
  if (typeof (adapter as any).createParcels !== 'function') {
    console.error('MPLAdapter does not implement createParcels');
    process.exit(2);
  }

  console.log('Calling createParcels with args (redacted):', { parcels: args.parcels?.length ?? 0, credentials: args.credentials ? { authType: args.credentials.authType } : undefined });
  const res = await (adapter as any).createParcels({ parcels: args.parcels, credentials: args.credentials, options: args.options }, ctx.adapterContext);
  console.log('createParcels result:', JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
