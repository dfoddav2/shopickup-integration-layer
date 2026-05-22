# @shopickup/adapters-gls

GLS adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-05-22T10:48:46Z
- Carrier API version: 25.12.11

## What it does

- `CREATE_PARCEL` and `CREATE_PARCELS`
- `CREATE_LABEL` and `CREATE_LABELS`
- `TRACK`
- `LIST_PICKUP_POINTS`

Pickup points use GLS's public country feed and do not require credentials.

## Install

```bash
pnpm add @shopickup/adapters-gls @shopickup/core
```

## Quick start

```ts
import { GLSAdapter } from "@shopickup/adapters-gls";
import { createAxiosHttpClient } from "@shopickup/core";

const adapter = new GLSAdapter();
const http = createAxiosHttpClient();

const result = await adapter.createParcel!(
  {
    parcel: {
      id: "ORDER-001",
      package: { weightGrams: 1200 },
      service: "standard",
      shipper: {
        contact: {
          name: "Shop",
          phone: "+361111111",
          email: "ship@example.com",
        },
        address: {
          name: "Shop",
          street: "Main utca 1",
          city: "Budapest",
          postalCode: "1011",
          country: "HU",
        },
      },
      recipient: {
        contact: {
          name: "Customer",
          phone: "+362222222",
          email: "customer@example.com",
        },
        delivery: {
          method: "HOME",
          address: {
            name: "Customer",
            street: "Fo utca 2",
            city: "Siofok",
            postalCode: "8600",
            country: "HU",
          },
        },
      },
    },
    credentials: {
      username: "integration@example.com",
      password: "your-password",
      clientNumberList: [12345],
    },
    options: { useTestApi: true, gls: { country: "HU" } },
  },
  { http, logger: console },
);
```

## Status

Published as `0.x.x` while the adapter API is still evolving.

## Testing

Tests are organized in three tiers under `src/tests/`:

- **unit/** — pure logic and utility tests (no HTTP client required)
- **mock/** — adapter capability tests using a mock HTTP client
- **live/** — opt-in live tests against the GLS public feed or MyGLS test API

### Run tests

```bash
# Unit + mock (default)
pnpm --filter @shopickup/adapters-gls run test

# Live (requires credentials for parcel/label/tracking tests)
pnpm --filter @shopickup/adapters-gls run test:live
```

### Live test credentials

Copy `live.env.example` to `.env.live` and fill in your MyGLS sandbox credentials:

```bash
cp live.env.example .env.live
```

Required variables for parcel/label/tracking live tests:

- `GLS_LIVE_USERNAME` — MyGLS email
- `GLS_LIVE_PASSWORD` — MyGLS password (plain text; adapter hashes it)
- `GLS_LIVE_CLIENT_NUMBER_LIST` — comma-separated GLS client numbers

Optional:

- `GLS_LIVE_WEBSHOP_ENGINE`
- `GLS_LIVE_USE_TEST_API` (default `true`)
- `GLS_LIVE_COUNTRY` (default `HU`)

The pickup-points live test does not require credentials (public feed).

## Parcel Creation

### Size / Dimensions Handling

GLS accepts **raw dimensions and weight** via `parcelPropertyList` rather than a size category.

**Default behavior** (when no explicit override is provided):

- The adapter maps `parcel.package.dimensionsCm` directly as `height`, `length`, and `width` (cm).
- Weight is converted from grams to kilograms (`weightGrams / 1000`).
- `packageType` defaults to **`1`** (Colli / parcel).

**Manual override:**
You can override the `packageType` by passing it in the request options:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      useTestApi: true,
      gls: {
        country: "HU",
        packageType: 2, // 1=Colli, 2=Box, 3=Roll, 4=Can, 5=Case, 6=Reel, 7=Sack
      },
    },
  },
  context,
);
```

**Note:** Raw dimensions and weight are always sent when available; the override only changes the `packageType` field.
