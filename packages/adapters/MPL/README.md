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

### Service Type / Shipping Speed

MPL supports multiple service speeds. You can control the service type in two ways:

**1. Canonical service level** (recommended for most integrators):

```ts
parcel.service = "express"; // Maps to A_121_CSG (faster domestic)
// or
parcel.service = "standard"; // Maps to A_175_UZL (standard domestic)
```

Canonical mapping:

| `parcel.service` | Domestic | International |
|---|---|---|
| `standard` | `A_175_UZL` | `A_123_EUP` |
| `express` | `A_121_CSG` | `A_13_EMS` |
| `economy` | `A_175_UZL` | `A_123_EUP` |
| `overnight` | `A_121_CSG` | `A_13_EMS` |

**2. Exact MPL carrier service code** (for integrators who know the exact MPL product):

```ts
parcel.carrierServiceCode = "A_121_CSG"; // Bypasses canonical mapping
```

Valid MPL basic service codes:

| Code | Description |
|---|---|
| `A_175_UZL` | Belföld alapszolgáltatás (standard domestic) |
| `A_177_MPC` | MPC — nagyobb térfogat (larger volume) |
| `A_122_ECS` | Economy közép |
| `A_121_CSG` | Csomag — faster domestic |
| `A_13_EMS` | Express Mail Service (international) |
| `A_123_EUP` | Európa (international standard) |
| `A_123_HAR` / `A_123_HAI` | Közlekedési + Ajánlott |
| `A_125_HAR` / `A_125_HAI` | Csere-csomag |
| `A_176_NET` / `A_176_NKP` | Nemzetközi |

### Extra Services

MPL offers dozens of additional paid services. The adapter **auto-derives** some common extras from parcel data:

| Auto-derived extra | Trigger |
|---|---|
| `K_ENY` (value insurance) | `parcel.declaredValue` or `parcel.insurance` present |
| `K_TER` (bulky handling) | `parcel.handling.fragile` or `parcel.handling.perishables` |
| `K_UVT` (cash on delivery) | `parcel.cod` present |

You can also **explicitly specify** extra services via `options.mpl.extraServices`:

```ts
mpl: {
  // ...required fields
  extraServices: ["K_IDA", "K_FNK"],
}
```

Explicit extras are merged with auto-derived ones (duplicates are deduplicated).

Common extra service codes:

| Code | Description |
|---|---|
| `K_ENY` | Értéknyilvánítás (value insurance) |
| `K_TER` | Terjedelmes kezelés (bulky handling) |
| `K_UVT` | Árufizetés (cash on delivery) |
| `K_IDA` | Időablak (time-window delivery) |
| `K_FNK` | Fix napi kézbesítés (fixed-day delivery) |
| `K_IDO` | Időablak (legacy time window) |
| `K_TOR` | Törvényi |
| `K_ORZ` | Óvadék |
| `K_RLC` | Ragasz logikai csomag |
| `K_CSE` | Csere-csomag alapcsomag |
| `K_CSA` | Csere-csomag inverz csomag |
| `K_MSZ` / `K_SKZ` / `K_ALA` / `K_BER` / `K_EKE` / `K_AAT` / `K_AAA` / `K_DOK` / `K_TEP` / `K_PSZ` / `K_EXT` / `K_INV` / `K_LEH` / `K_TET` / `K_GLO` / `K_LEZ` / `K_POT` / `K_VNY` / `K_CSM` / `K_EFF` / `K_VIK` / `K_ZSK` / `K_EFC` / `K_DU` / `K_LX` / `K_KRC` / `K_ESZ` / `K_ETV` / `K_KRF` / `K_VAR` / `K_UTN` / `K_VER` / `K_EPR` / `K_IDG` / `K_KNY` / `K_KOR` / `K_PRE` / `K_UTK` / `K_ANT` / `K_CIP` | Various additional services |

### Additional Parcel Creation Options

All options below are **optional** and live under `options.mpl` alongside the required fields (`accountingCode`, `agreementCode`, `bankAccountNumber`).

#### Label Format

Override the default `PDF` label format:

```ts
mpl: {
  // ...required fields
  labelFormat: "ZPL", // or "PDF"
}
```

#### Posting Date

Set the planned physical posting date (up to 6 months in the future):

```ts
mpl: {
  // ...required fields
  shipmentDate: "2026-06-15", // yyyy-MM-dd
}
```

#### Tag & Grouping

Tag shipments for filtering before close, or mark items to be delivered together:

```ts
mpl: {
  // ...required fields
  tag: "summer-sale",           // max 50 chars
  groupTogether: true,          // items delivered together
}
```

#### Time-Window / Fixed-Day Delivery

When using the `K_IDA` (time-window) or `K_FNK` (fixed-day) extra services, provide the preferred slot:

```ts
mpl: {
  // ...required fields
  deliveryTime: "morning",      // earlyMorning | morning | afternoon | evening
  deliveryDate: "2026-06-16",   // yyyy-MM-dd (required for K_FNK)
}
```

#### COD Payout Method

Control how MPL pays out collected COD funds to the sender:

```ts
mpl: {
  // ...required fields
  paymentMode: "UV_AT", // UV_AT = bank transfer, UV_KP = cash
}
```

#### Package Retention

Set the retention period in business days (0, 5, or 10):

```ts
mpl: {
  // ...required fields
  packageRetention: 5,
}
```

#### Parcel Terminal Dispatch

When dispatching from a parcel locker, set the sender-side terminal flag and optionally the terminal name:

```ts
mpl: {
  // ...required fields
  parcelTerminal: true,
  senderParcelPickupSite: "568 sz. automata - Savoya Park",
}
```

#### Customs (International)

For international shipments, provide customs value and currency:

```ts
mpl: {
  // ...required fields
  customsValue: 150.5,
  customsValueCurrency: "EUR",
}
```

#### Print Recipient Data

Control what recipient data appears on the label:

```ts
mpl: {
  // ...required fields
  printRecipientData: "PRINTPHONENUMBER", // PRINTALL | PRINTPHONENUMBER | PRINTEMAIL | PRINTNOTHING
}
```

#### Recipient Retail Customer ID

If the recipient has a Magyar Posta retail customer ID (LÜA):

```ts
mpl: {
  // ...required fields
  recipientLuaCode: "LUA123456",
  recipientDisabled: true, // For disabled recipients at parcel terminals
}
```

#### Invoice Recipient

If the invoice should go to a different address than the sender:

```ts
mpl: {
  // ...required fields
  invoice: {
    name: "Billing Co",
    postCode: "1234",
    city: "Budapest",
    address: "Billing St 1",
    vatIdentificationNumber: "12345678901",
  },
}
```

#### QR Code

Custom QR code content to print on the label:

```ts
mpl: {
  // ...required fields
  qrCode: "CUSTOMQR123",
}
```

#### International Service Options

Additional fields for international shipments:

```ts
mpl: {
  // ...required fields
  supplementarySheetNr: 2,          // Supplementary sheet number
  exportAuthorisation: "9022900",     // Export authorization
  otherComment: "fragile contents",   // Other comment (max 105 chars)
  secId: true,                        // Generate inverse parcel (for A_125_HAR)
  produceContent: "999",              // Produce content code
}
```

#### Complete Example

```ts
await adapter.createParcel(
  {
    parcel: {
      ...parcel,
      service: "express",           // or use carrierServiceCode for exact MPL code
      carrierServiceCode: "A_121_CSG",
    },
    credentials,
    options: {
      useTestApi: true,
      mpl: {
        accountingCode: "ACC001",
        agreementCode: "12345678",
        bankAccountNumber: "123456781234567800000000",
        size: "M",
        labelFormat: "ZPL",
        shipmentDate: "2026-06-15",
        tag: "summer-sale",
        groupTogether: true,
        deliveryTime: "morning",
        paymentMode: "UV_AT",
        packageRetention: 5,
        parcelTerminal: false,
        customsValue: 200,
        customsValueCurrency: "EUR",
        printRecipientData: "PRINTALL",
        recipientLuaCode: "LUA123456",
        recipientDisabled: false,
        invoice: {
          name: "Billing Co",
          postCode: "1234",
          city: "Budapest",
          address: "Billing St 1",
          vatIdentificationNumber: "12345678901",
        },
        qrCode: "QR123",
        extraServices: ["K_IDA", "K_FNK"],
        supplementarySheetNr: 1,
        exportAuthorisation: "AUTH001",
        otherComment: "handle with care",
        secId: false,
        produceContent: "888",
      },
    },
  },
  context,
);
```
