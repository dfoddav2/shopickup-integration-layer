# @shopickup/adapters-foxpost

Foxpost adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-05-22T10:48:46Z
- Carrier API version: 1.2.14

## What it does

- `CREATE_PARCEL`
- `CREATE_LABEL`
- `TRACK`
- `LIST_PICKUP_POINTS`

Pickup points use Foxpost's public feed and do not require credentials.

## Install

```bash
pnpm add @shopickup/adapters-foxpost @shopickup/core
```

## Quick start

```ts
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";
import { executeCreateLabelFlow } from "@shopickup/core";

const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");

const result = await executeCreateLabelFlow({
  adapter,
  shipment: {
    id: "order-001",
    sender: {
      name: "Shop",
      street: "Main",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
    },
    recipient: {
      name: "Customer",
      street: "Fo utca 2",
      city: "Siofok",
      postalCode: "8600",
      country: "HU",
    },
    service: "standard",
    totalWeight: 1200,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  parcels: [{ id: "parcel-1", weight: 1200 }],
  credentials: { apiKey: "your-foxpost-api-key" },
  context: { http: yourHttpClient, logger: console },
});
```

## Status

Published as `0.x.x` while the adapter API is still evolving.

## Testing

- `pnpm --filter @shopickup/adapters-foxpost run test` runs unit and mock tests.
- `pnpm --filter @shopickup/adapters-foxpost run test:live` runs live tests.

Live tests read `packages/adapters/foxpost/.env.live` automatically when present. Start from the example file:

```bash
cp packages/adapters/foxpost/live.env.example packages/adapters/foxpost/.env.live
pnpm --filter @shopickup/adapters-foxpost run test:live
```

## Parcel Creation

### Size / Dimensions Handling

Foxpost requires a **size category** (`xs`, `s`, `m`, `l`, `xl`) rather than raw dimensions.

**Default heuristic** (when no explicit override is provided):

- The adapter derives the size from `parcel.package.dimensionsCm` using a **volume-based** heuristic:
  - `< 5,000 cm³` → `xs`
  - `< 15,000 cm³` → `s`
  - `< 50,000 cm³` → `m`
  - `< 100,000 cm³` → `l`
  - `≥ 100,000 cm³` → `xl`
- If no dimensions are provided, defaults to **`s`** (small).

**Manual override:**
You can bypass the heuristic by passing an explicit size in the request options:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      foxpost: {
        size: "m", // xs, s, m, l, xl
      },
    },
  },
  context,
);
```

**Note:** Weight is not sent to Foxpost during parcel creation.
