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
import { MPLAdapter } from "@shopickup/adapters-mpl";
import { createAxiosHttpClient } from "@shopickup/core";

const adapter = new MPLAdapter();
const http = createAxiosHttpClient();

const result = await adapter.exchangeAuthToken(
  {
    credentials: { apiKey: "your-api-key", apiSecret: "your-api-secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
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

### Sandbox tracking limitation

**Important:** The MPL sandbox tracking endpoint (`/v2/nyomkovetes`) is backed by a **separate mock service** that does **not** share data with the sandbox shipment API. Parcels created via `createParcel` / `closeShipments` will **not** appear in tracking results.

To verify tracking in sandbox, use the hardcoded mock identifiers that the mock backend recognises:

- `UA000449616US`
- `PB2SW00021917`

The `tracking.live.spec.ts` live test queries these IDs directly and confirms the adapter parses the mock responses correctly.

If you need to test an end-to-end create → label → close → track flow, be aware that the final tracking step may return `NotFound` in the sandbox even after a successful `closeShipments`. This is a known sandbox limitation, not an adapter bug.

## Status

Published as `0.x.x` while the adapter API is still evolving.

## Parcel Creation

### Size / Dimensions Handling

MPL requires a **size category** (`S`, `M`, `L`, `PRINT`, `PACK`) for parcel-machine (`CS`) deliveries. Weight is also sent as `item.weight`.

**Default heuristic** (when no explicit override is provided):

- The adapter derives the size from `parcel.package.dimensionsCm` using a **max-dimension** heuristic:
  - max dimension `≤ 38 cm` → `S`
  - max dimension `≤ 60 cm` → `M`
  - max dimension `> 60 cm` → `L`
- If no dimensions are provided, no size field is sent (may fail for CS deliveries).

**Manual override:**
You can bypass the heuristic by passing an explicit size in the request options:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      useTestApi: true,
      mpl: {
        accountingCode: "...",
        agreementCode: "...",
        bankAccountNumber: "...",
        size: "M", // S, M, L, PRINT, PACK
      },
    },
  },
  context,
);
```

**Note:** `PRINT` and `PACK` are valid MPL size codes but are not produced by the current heuristic. Use the manual override if you need them.
