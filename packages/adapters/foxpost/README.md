# @shopickup/adapters-foxpost

Foxpost adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-05-22T10:48:46Z
- Carrier API version: 1.2.14

## What it does

- `CREATE_PARCEL` / `CREATE_PARCELS`
- `CREATE_LABEL` / `CREATE_LABELS`
- `TRACK`
- `LIST_PICKUP_POINTS`
- `DELETE_PARCEL`
- `CREATE_RETURN` / `CREATE_RETURNS`
- `BATCH_TRACK`

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

### Carrier Comments

You can attach a short comment to a parcel via three sources (in priority order):

1. **`options.foxpost.comment`** — explicit override (max 50 chars)
2. **`parcel.metadata.foxpostComment`** — integrator metadata
3. **`parcel.handling.fragile`** — automatically sets comment to `"FRAGILE"`

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      foxpost: {
        comment: "Handle with care",
      },
    },
  },
  context,
);
```

### Delivery Note

For **HOME delivery** parcels, the adapter forwards `delivery.instructions` as `deliveryNote` (max 50 chars). This note is visible to the courier.

```ts
const parcel = {
  // ...other fields
  recipient: {
    // ...contact
    delivery: {
      method: "HOME",
      address: { /* ... */ },
      instructions: "Leave on porch",
    },
  },
};
```

### Label Printing (C2C HD)

For C2C home-delivery parcels, you can ask Foxpost to print the label by setting:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      foxpost: {
        label: true, // Foxpost prints the label
      },
    },
  },
  context,
);
```

### Unique Barcode (APM)

For APM (pickup-point) parcels, you can provide your own unique barcode:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      foxpost: {
        uniqueBarcode: "MYBARCODE123",
      },
    },
  },
  context,
);
```

## Delete Parcel

Delete a parcel by its Foxpost barcode before it enters the courier network:

```ts
const result = await adapter.deleteParcel!(
  {
    parcelCarrierId: "CLFOX0000000001",
    credentials,
    options: {
      foxpost: {
        isWeb: true, // default; set false for non-web deletions
      },
    },
  },
  context,
);

// result.status === 'deleted' or 'failed'
// result.errors array on failure
```

The adapter never throws for `DELETE_PARCEL`; all outcomes are returned as a `DeleteParcelResult`.

## Create Return

> **Sandbox Limitation:** The Foxpost test API (`webapi-test.foxpost.hu`) does **not** support return creation. It accepts requests but returns `PROCESS_NOT_IMPLEMENTED_YET` in the response body. Returns can only be verified against the **production API** (`webapi.foxpost.hu`).

Create a return for an existing parcel:

```ts
const result = await adapter.createReturn!(
  {
    return: {
      parcelCarrierId: "CLFOX0000000001",
      uniqueBarcode: "RET-001",      // optional
      refCode: "ORDER-123",           // optional
    },
    credentials,
    options: {
      foxpost: {
        returnType: "RE", // "RE" (default) or "IRE" (immediate return)
      },
    },
  },
  context,
);

// result.status === 'created'
// result.carrierId — the new return parcel barcode
```

### Batch Returns

Create up to 100 returns in a single call:

```ts
const result = await adapter.createReturns!(
  {
    returns: [
      { parcelCarrierId: "CLFOX0000000001" },
      { parcelCarrierId: "CLFOX0000000002", refCode: "ORDER-124" },
    ],
    credentials,
    options: {
      foxpost: {
        returnType: "RE",
      },
    },
  },
  context,
);

// result.successCount, result.failureCount, result.results[]
```

---

## Batch Track

Track multiple parcels in a single API call:

```ts
const result = await adapter.batchTrack!(
  {
    trackingNumbers: [
      "CLFOX0000000001",
      "CLFOX0000000002",
      "CLFOX0000000003",
    ],
    credentials,
  },
  context,
);

// result.totalCount, result.successCount, result.failureCount
// result.results[] — per-item BatchTrackingResult

const first = result.results[0];
if (first.status === "found") {
  first.update!.events; // chronological TrackingEvent[]
  first.update!.status; // canonical status: PENDING, IN_TRANSIT, DELIVERED, ...
}
```

**Note:** Weight is not sent to Foxpost during parcel creation.
