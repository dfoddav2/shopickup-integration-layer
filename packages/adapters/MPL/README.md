# @shopickup/adapters-mpl

MPL adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-05-22T10:48:46Z
- Carrier API version: v2

## What it does

- `CREATE_PARCEL`
- `CREATE_PARCELS`
- `CREATE_LABEL`
- `CREATE_LABELS`
- `LIST_PICKUP_POINTS`
- OAuth/basic auth exchange helpers

Pickup points are authenticated and require MPL credentials in the adapter request.

## Install

```bash
pnpm add @shopickup/adapters-mpl @shopickup/core
```

## Quick start

```ts
import { MPLAdapter } from '@shopickup/adapters-mpl';
import { createAxiosHttpClient } from '@shopickup/core';

const adapter = new MPLAdapter();
const http = createAxiosHttpClient();

const result = await adapter.exchangeAuthToken(
  {
    credentials: { apiKey: 'your-api-key', apiSecret: 'your-api-secret' },
    options: { useTestApi: true },
  },
  { http, logger: console }
);
```

## Testing

Tests are organized in three tiers under `src/tests/`:

- **unit/** — pure logic and utility tests (no HTTP client required)
- **mock/** — adapter capability tests using a mock HTTP client
- **live/** — opt-in live tests against the MPL sandbox or production API

### Run tests

```bash
# Unit + mock (default)
pnpm --filter @shopickup/adapters-mpl run test

# Live (requires credentials)
pnpm --filter @shopickup/adapters-mpl run test:live
```

### Live test credentials

Copy `live.env.example` to `.env.live` and fill in your MPL sandbox credentials:

```bash
cp live.env.example .env.live
```

Required variables:

- `MPL_LIVE_API_KEY`
- `MPL_LIVE_API_SECRET`
- `MPL_LIVE_ACCOUNTING_CODE`
- `MPL_LIVE_AGREEMENT_CODE`
- `MPL_LIVE_BANK_ACCOUNT_NUMBER`

The live suite skips automatically if credentials are missing.

## Status

Published as `0.x.x` while the adapter API is still evolving.
