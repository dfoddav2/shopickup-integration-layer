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

### Service Types

The adapter maps canonical `parcel.service` values to GLS basic service codes:

| Canonical service | GLS codes injected |
|---|---|
| `standard` | None (default delivery) |
| `express` | `T09`, `T10`, `T12` |
| `overnight` | `T09`, `T10`, `T12` |

You can bypass this mapping entirely by passing explicit `carrierServiceCode` on the parcel, or by adding explicit services via `options.gls.services`.

### Extra Services (Auto-Derived)

The adapter automatically injects extra services based on parcel data:

| Service | Trigger | Description |
|---|---|---|
| `PSD` | `delivery.method === "PICKUP_POINT"` | Parcel Shop Delivery — shop ID from `pickupPoint.id` |
| `SAT` | `options.gls.saturdayDelivery === true` | Saturday Delivery |
| `T09` / `T10` / `T12` | `parcel.service === "express" \| "overnight"` | Express services |
| `INS` | `parcel.insurance` present | Insurance — amount from `insurance.amount.amount` |
| `DPV` | `parcel.declaredValue` present | Declared Value — currency + amount |
| `FDS` | `recipient.contact.email` present | Email notification (recipient email) |
| `FSS` | `recipient.contact.phone` present | SMS notification (recipient phone) |

### Extra Services (Explicit)

Any service can be added manually via `options.gls.services`. The adapter supports all 23 GLS service codes with their respective parameter types:

```ts
await adapter.createParcel!(
  {
    parcel,
    credentials,
    options: {
      gls: {
        services: [
          { code: "24H" },                           // 24-hour service
          { code: "ADR", adrParameter: { value: "..." } },  // Dangerous goods
          { code: "AOS", aosParameter: { value: "Neighbor" } }, // Alternative addressee
          { code: "CS1", cs1Parameter: { value: "+362222222" } }, // SMS confirmation
          { code: "DDS", ddsParameter: { value: "2026-05-25T10:00:00Z" } }, // Delivery date
          { code: "DPV", dpvParameter: { stringValue: "HUF", decimalValue: 50000 } }, // Declared value
          { code: "FDS", fdsParameter: { value: "customer@example.com" } }, // Email notification
          { code: "FSS", fssParameter: { value: "+362222222" } }, // SMS notification
          { code: "INS", insParameter: { value: 10000 } }, // Insurance
          { code: "MMP", mmpParameter: { value: 5000 } },
          { code: "PRS" },                          // Personal service
          { code: "PSS" },                          // Parcel shop service
          { code: "SAT" },                          // Saturday delivery
          { code: "SDS", sdsParameter: { startTime: "10:00", endTime: "14:00" } }, // Scheduled delivery
          { code: "SM1", sm1Parameter: { value: "+362222222" } }, // SMS service
          { code: "SM2", sm2Parameter: { value: "+362222222" } }, // SMS pre-advice
          { code: "SRS" },                          // Shop return service
          { code: "SZL", szlParameter: { value: "+362222222" } }, // Document return
          { code: "T09" },                          // Express T09
          { code: "T10" },                          // Express T10
          { code: "T12" },                          // Express T12
          { code: "TGS" },                          // Think Green Service
          { code: "XS" },                           // Exchange service
        ],
      },
    },
  },
  context,
);
```

### Explicit overrides

Integrators can override any auto-derived value by passing the same service code explicitly. For example, if `parcel.insurance` auto-creates an `INS` service with `value: 10000`, but you want `value: 50000`, pass an explicit `INS` in `options.gls.services` — it will replace the auto-derived one.

### Address Handling

**House number extraction:**
If the canonical address does not have an explicit `houseNumber` field, the adapter attempts to extract it from the end of the `street` string using a simple regex (e.g. `"Main utca 15"` → `street: "Main utca"`, `houseNumber: "15"`).

**House number info:**
If the canonical address has a `building` or `houseNumberInfo` field, it is forwarded to GLS as `houseNumberInfo` (building, floor, etc.).

### Parcel Content Description

The `content` field (parcel contents description) is derived in this priority order:

1. **`options.gls.content`** — explicit override
2. **`parcel.metadata.glsContent`** — carrier-specific metadata
3. **`parcel.items` descriptions** — joined with `", "`
4. **`undefined`** — GLS will use a generic description

### COD (Cash on Delivery)

If `parcel.cod` is present, the adapter maps it automatically:

```ts
const parcel = {
  // ...other fields
  cod: {
    amount: { amount: 15000, currency: "HUF" },
    reference: "COD-REF-001",
  },
};
```

This produces `codAmount: 15000`, `codCurrency: "HUF"`, `codReference: "COD-REF-001"` in the GLS request.

### Pickup Date

Set a planned pickup date via `options.gls.pickupDate`:

```ts
options: {
  gls: {
    pickupDate: "2026-05-25T08:00:00Z",
  },
}
```

### Serbia-Specific Fields

For Serbia (`country: "RS"`), GLS requires `senderIdentityCardNumber`:

```ts
options: {
  gls: {
    senderIdentityCardNumber: "123456789",
  },
}
```

### LRS (LockerReturn Service)

For the LRS service in Hungary, set `pickupType` to `2` (LabellessParcelLocker):

```ts
options: {
  gls: {
    pickupType: 2,
  },
}
```

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
