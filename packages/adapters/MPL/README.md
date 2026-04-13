# @shopickup/adapters-mpl

MPL adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

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

## Status

Published as `0.x.x` while the adapter API is still evolving.
