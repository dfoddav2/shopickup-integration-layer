# @shopickup/adapters-foxpost

Foxpost adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## What it does

- `CREATE_PARCEL`
- `CREATE_LABEL`
- `TRACK`
- `LIST_PICKUP_POINTS`

## Install

```bash
pnpm add @shopickup/adapters-foxpost @shopickup/core
```

## Quick start

```ts
import { FoxpostAdapter } from '@shopickup/adapters-foxpost';
import { executeCreateLabelFlow } from '@shopickup/core';

const adapter = new FoxpostAdapter('https://webapi.foxpost.hu');

const result = await executeCreateLabelFlow({
  adapter,
  shipment: {
    id: 'order-001',
    sender: { name: 'Shop', street: 'Main', city: 'Budapest', postalCode: '1011', country: 'HU' },
    recipient: { name: 'Customer', street: 'Fo utca 2', city: 'Siofok', postalCode: '8600', country: 'HU' },
    service: 'standard',
    totalWeight: 1200,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  parcels: [{ id: 'parcel-1', weight: 1200 }],
  credentials: { apiKey: 'your-foxpost-api-key' },
  context: { http: yourHttpClient, logger: console },
});
```

## Status

Published as `0.x.x` while the adapter API is still evolving.
