# @shopickup/adapters-gls

GLS adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## What it does

- `CREATE_PARCEL` and `CREATE_PARCELS`
- `CREATE_LABEL` and `CREATE_LABELS`
- `TRACK`
- `LIST_PICKUP_POINTS`

## Install

```bash
pnpm add @shopickup/adapters-gls @shopickup/core
```

## Quick start

```ts
import { GLSAdapter } from '@shopickup/adapters-gls';
import { createAxiosHttpClient } from '@shopickup/core';

const adapter = new GLSAdapter();
const http = createAxiosHttpClient();

const result = await adapter.createParcel!(
  {
    parcel: {
      id: 'ORDER-001',
      package: { weightGrams: 1200 },
      service: 'standard',
      shipper: {
        contact: { name: 'Shop', phone: '+361111111', email: 'ship@example.com' },
        address: { name: 'Shop', street: 'Main utca 1', city: 'Budapest', postalCode: '1011', country: 'HU' },
      },
      recipient: {
        contact: { name: 'Customer', phone: '+362222222', email: 'customer@example.com' },
        delivery: {
          method: 'HOME',
          address: { name: 'Customer', street: 'Fo utca 2', city: 'Siofok', postalCode: '8600', country: 'HU' },
        },
      },
    },
    credentials: {
      username: 'integration@example.com',
      password: 'your-password',
      clientNumberList: [12345],
    },
    options: { useTestApi: true, gls: { country: 'HU' } },
  },
  { http, logger: console }
);
```

## Status

Published as `0.x.x` while the adapter API is still evolving.
