# @shopickup/adapters-mpl

MPL adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-06-16T12:00:00Z
- Carrier API version: v2

## What it does

- `CREATE_PARCEL`
- `CREATE_PARCELS`
- `CREATE_LABEL`
- `CREATE_LABELS`
- `LIST_PICKUP_POINTS`
- `TRACK` — single-parcel tracking via Pull-1 API (guest/registered)
- `TRACK` — batch tracking via Pull-500 API (up to 500 items)
- `TRACK` — registered tracking with financial data
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

#### Delivery Mode

Override the delivery mode for pickup point deliveries. By default, the adapter derives the mode from `delivery.method`: `HOME` → `HA` (home delivery), `PICKUP_POINT` → `CS` (parcel locker). Use this option to force a specific mode when the default doesn't match the pickup point type:

- `HA` — Házhozszállítás (Home Delivery)
- `CS` — Csomagautomata (Parcel Locker)
- `PM` — Postán Maradó (Post Office)
- `PP` — PostaPont (Post Point)

```ts
mpl: {
  // ...required fields
  deliveryMode: "PM", // post office delivery for Nagyoroszi
}
```

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
        deliveryMode: "CS",
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

## Tracking

MPL provides **two tracking APIs** accessed through four adapter functions:

| Function | API | Type | Description |
|---|---|---|---|
| `track()` | Pull-1 (`/v2/nyomkovetes/{guest\|registered}`) | Synchronous | Track 1–N parcels (last or all history) |
| `trackRegistered()` | Pull-1 (`/v2/nyomkovetes/registered`) | Synchronous | Same as `track()` but forces the registered endpoint (includes financial data) |
| `trackPull500Start()` | Pull-500 (`POST /v2/mplapi-tracking/tracking`) | Async submit | Submit up to 500 tracking numbers; returns `trackingGUID` |
| `trackPull500Check()` | Pull-500 (`GET /v2/mplapi-tracking/tracking/{trackingGUID}`) | Async poll | Poll for results; returns status + CSV report when ready |

> NOTE: MPL test tracking endpoint is not actually connected to the real test endpoint DB and thus in test environment only the following (and perhaps some other) predefined keys can be used to simulate the flow: `UA000449616US`, `PB2SW00021917`

---

### Pull-1 Tracking (Single / Small Batch)

Used for synchronous tracking of one or more parcels. The API accepts **multiple tracking numbers** in a single request (comma-separated in the `ids` field), but MPL recommends **not resubmitting the same ID within 4 hours**.

#### Endpoints

| Endpoint | Auth Required | Includes Financial Data |
|---|---|---|
| `/v2/nyomkovetes/guest` | Basic auth or OAuth2 | No — excludes weight, dimensions, declared value |
| `/v2/nyomkovetes/registered` | Basic auth or OAuth2 | Yes — includes C5, C41, C42, C58 |

Both endpoints share the same request/response shape. The guest response simply omits the financial C-code fields.

#### Request Shape

```ts
interface TrackingRequestMPL {
  trackingNumbers: string[];         // 1+ tracking numbers (comma-joined into `ids`)
  credentials: MPLCredentials;       // apiKey+apiSecret or oAuth2Token
  state?: 'last' | 'all';            // default: 'last'
  useRegisteredEndpoint?: boolean;    // default: false (uses guest)
  options?: {
    useTestApi?: boolean;
  };
}
```

| Request Field | OpenAPI Field | Description |
|---|---|---|
| `trackingNumbers` | `ids` (comma-separated string) | One or more tracking numbers |
| `state` | `state` | `'last'` — returns only the latest event per parcel (faster); `'all'` — returns complete history |
| `options.mpl.language` | `language` | `'hu'` (default), `'en'`, or `'de'` |
| – | `X-Request-Id` | UUID — generated automatically by the adapter |
| – | `X-Correlation-Id` | UUID — set automatically when `useTestApi: true` |

#### C-Code Field Reference

The MPL Pull-1 API returns tracking data as an array of **C-code records** (`c0` through `c63`). Each record represents one tracking event for one parcel.

| Field | Label | Description | Guest | Registered |
|---|---|---|---|---|---|
| `c0` | System ID | Backend system name (EÉRT, BPU) or parcel type (IKRL=letter, IKRCS=parcel) | ✓ | ✓ |
| `c1` | **Consignment ID** | Tracking number (parcel ID) — **required** | ✓ | ✓ |
| `c2` | Basic service name | Service name (e.g. `Üzleti csomag`) | ✓ | ✓ |
| `c4` | Delivery mode | Delivery type description (e.g. `Csomagautomatára kézbesítés`) | ✓ | ✓ |
| `c5` | **Declared value amount** | Parcel declared value in HUF | ✗ | ✓ |
| `c6` | COD amount | Cash-on-delivery amount | ✓ | ✓ |
| `c8` | Retention period | Storage/retention period in days | ✓ | ✓ |
| `c9` | **Event description** | Human-readable event status text (e.g. `Sikeresen kézbesítve háznál`) | ✓ | ✓ |
| `c10` | Event category description | Category label (e.g. `Felvétel`, `Szállítás`, `Kézbesítés`) | ✓ | ✓ |
| `c11` | **Event date** | Event date in YYYYMMDD format (e.g. `20190607`) | ✓ | ✓ |
| `c12` | **Event time** | Event time in HH:MM:SS format (e.g. `01:30:59`) | ✓ | ✓ |
| `c13` | Location | Receiving post office / facility name (e.g. `Szegedi Logisztikai Üzem`) | ✓ | ✓ |
| `c38` | Recipient country code | ISO country code of recipient | ✓ | ✓ |
| `c39` | Recipient country name | Country name of recipient | ✓ | ✓ |
| `c41` | **Weight** | Parcel weight in grams | ✗ | ✓ |
| `c42` | **Size category** | Size category (S, M, L, `-`) | ✗ | ✓ |
| `c43` | **Event category code** | Numeric category (0-5): 0=Unclassified, 1=Receipt, 2=Processing, 3=Transport, 4=Delivery, 5=Delivered | ✓ | ✓ |
| `c49` | Sender country code | ISO country code of sender | ✓ | ✓ |
| `c53` | Replacement ID | Replacement parcel tracking ID | ✓ | ✓ |
| `c55` | Failed delivery reason | Reason for failed delivery attempt | ✓ | ✓ |
| `c56` | Recipient's role | Recipient's title (e.g. `Címzett`) | ✓ | ✓ |
| `c57` | COD currency | COD currency code (e.g. `HUF`) | ✓ | ✓ |
| `c58` | **Declared value currency** | Declared value currency code (e.g. `HUF`) | ✗ | ✓ |
| `c59` | Related identifier | Related/linked tracking identifier | ✓ | ✓ |
| `c60` | Retention deadline | Retention expiry date | ✓ | ✓ |
| `c61` | Max category | Maximum transaction category reached during journey (0-5) | ✓ | ✓ |
| `c63` | Sender country name | Country name of sender | ✓ | ✓ |

**Financial Data (Registered-only, excluded from Guest):**
- `c5` — Declared value amount (HUF)
- `c41` — Weight (grams)
- `c42` — Size category (S, M, L)
- `c58` — Declared value currency (HUF)

#### Status Code Mapping (C43 → Canonical)

The field `c43` contains a **numeric event category code** (0–5) that serves as the primary status indicator. The field `c9` contains the **human-readable event description** and may override the canonical status in specific non-delivery cases (return, exception).

| C43 Code | Category | Canonical Status | Notes |
|---|---|---|---|
| `0` | Unclassified (Nem besorolt) | `PENDING` | Catch-all for unknown/missing categories |
| `1` | Receipt (Felvétel) | `PENDING` | Parcel accepted into the postal system |
| `2` | Processing (Feldolgozás) | `PENDING` | Sorting, forwarding operations |
| `3` | Transport (Szállítás) | `IN_TRANSIT` / `RETURNED` / `EXCEPTION` | Check c9 for exception patterns |
| `4` | Delivery (Kézbesítés) | `OUT_FOR_DELIVERY` | Last mile delivery or parcel locker |
| `5` | Delivered (Kézbesített) | `DELIVERED` | Successfully delivered to recipient |

**Exception detection for category `3` (Transport):**
The mapper inspects the `c9` description text for the following keywords to detect non-delivery events:

- `visszaküld`, `visszakérte`, `megtagadta` → `RETURNED`
- `sérülés`, `ismeretlen`, `megszűnt`, `akadályozott` → `EXCEPTION`
- Otherwise → `IN_TRANSIT`

#### Canonical Response Shape

Each tracking number results in one `TrackingUpdate`:

```ts
interface TrackingUpdate {
  trackingNumber: string;           // From c1
  status: TrackingStatus;           // Mapped canonical status (PENDING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION, RETURNED)
  lastUpdate: Date | null;          // Built from c11 (date) + c12 (time)
  events: TrackingEvent[];          // One event per record (state='last') or multiple (state='all')
  rawCarrierResponse?: {
    record: MPLTrackingRecord;      // Original C-code record
    // Registered-only (when includeFinancialData=true):
    declaredValueAmount?: string;   // c5 — Declared value in HUF
    weight?: string;                // c41 — Weight in grams
    size?: string;                  // c42 — Size category (S, M, L)
    declaredValueCurrency?: string; // c58 — Currency code (e.g. "HUF")
  };
}
```

Each `TrackingEvent` is built as follows:

| TrackingEvent Field | Source | Notes |
|---|---|---|
| `timestamp` | `c11` + `c12` | Combined from date (YYYYMMDD) + time (HH:MM:SS) |
| `status` | `c43` | Mapped through the numeric category code table |
| `carrierStatusCode` | `c9` | Original Hungarian event description text |
| `location.facility` | `c13` | Receiving post office / facility name |
| `description` | `c9` or `'No description'` | Event description text; falls back if c9 is missing |
| `descriptionLocalLanguage` | `c10` | Event category description (e.g. "Kézbesítés") |
| `raw` | full C-code record | Original record for debugging |

**Important:** The adapter currently returns events in API order (not necessarily chronological). When `state='all'` is requested, the API returns multiple records per tracking number — one per event in the parcel's history. The adapter maps each record to a separate `TrackingEvent`. For `state='last'` (default), each record is just the latest event.

---

### Pull-500 Batch Tracking

Used for **asynchronous tracking of up to 500 parcels** in a single batch. The API is a two-step process:

1. **`trackPull500Start()`** — Submit tracking numbers → receive a `trackingGUID`
2. **`trackPull500Check()`** — Poll with the `trackingGUID` until `status === 'READY'`

MPL recommends **at least 1 minute** between poll attempts. Processing time depends on the number of tracking numbers submitted (can be several minutes).

#### Pull-500 Start

```ts
interface Pull500StartRequest {
  trackingNumbers: string[];        // 1–500 tracking numbers
  credentials: MPLCredentials;
  language?: 'hu' | 'en';           // default: 'hu'
  options?: {
    useTestApi?: boolean;
  };
}
```

Headers sent automatically by the adapter:

| Header | Source |
|---|---|
| `X-Request-Id` | `randomUUID()` — generated per call |
| `X-Correlation-Id` | `test-${Date.now()}` when `useTestApi: true` |
| `X-Accounting-Code` | From `credentials.accountingCode` |
| `Content-Type` | `application/json` |

**Response:**

```ts
interface Pull500StartResponse {
  trackingGUID: string;             // UUID for polling
  errors?: ErrorDescriptor[];       // Submission errors (if any)
}
```

#### Pull-500 Check

```ts
interface Pull500CheckRequest {
  trackingGUID: string;             // From trackPull500Start()
  credentials: MPLCredentials;
  options?: {
    useTestApi?: boolean;
  };
}
```

**Response:**

```ts
interface Pull500CheckResponse {
  status: 'NEW' | 'INPROGRESS' | 'READY' | 'ERROR';
  report?: string;                  // CSV-formatted tracking data (when status=READY)
  report_fields?: string;           // CSV header row (when status=READY)
  errors?: ErrorDescriptor[];       // Processing errors (if any)
}
```

**Status progression:**

```
NEW ──> INPROGRESS ──> READY
                        │
                        └──> ERROR
```

- `NEW` — Request received, queued for processing
- `INPROGRESS` — Processing in progress
- `READY` — Results available in `report` / `report_fields`
- `ERROR` — Processing failed; check `errors` array

**CSV Report Format (when status=READY):**

The `report_fields` field contains the column headers and `report` contains the data rows. The exact columns are determined by MPL and may include fields like tracking number, status, timestamps, etc. The adapter currently returns the raw CSV strings — callers should parse them as needed.

---

### Error Handling

All tracking functions throw `CarrierError` with the following categories mapped from HTTP status codes:

| HTTP Status | CarrierError Category | Description |
|---|---|---|
| `400` | `Validation` | Bad request — invalid parameters |
| `401` | `Auth` | Unauthorized — invalid/expired credentials |
| `403` | `Auth` | Forbidden — caller not configured for this host:port |
| `404` | `NotFound` | Tracking information not found |
| `429` | `RateLimit` | Rate limited — `retryAfterMs` set from `Retry-After` header |
| `500+` | `Transient` | Server error — retryable |
| Network errors | `Transient` | Connection refused, DNS failure, timeout |

Additionally, the adapter checks for specific error conditions:

| Condition | Error | Category |
|---|---|---|
| Empty `trackAndTrace` array (no records returned) | `"No tracking information found"` | `NotFound` |
| Missing `trackingGUID` in Pull-500 start response | `"Pull-500 start response missing trackingGUID"` | `Transient` |
| Invalid request (Zod validation fails) | Validation error message | `Validation` |

**API Gateway Error Response Structure:**

```json
{
  "fault": {
    "faultstring": "Invalid ApiKey",
    "detail": {
      "errorcode": "oauth.v2.InvalidApiKey"
    }
  }
}
```

**Backend Error Response Structure (Pull-1 only):**

```json
{
  "errors": [
    {
      "code": "103",
      "message": "Invalid tracking number format"
    }
  ]
}
```

---

### Usage Examples

#### Basic single-parcel tracking (guest)

```ts
const updates = await adapter.track(
  {
    trackingNumbers: ["UA000449616US"],
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

// updates[0].status        → "PENDING" | "IN_TRANSIT" | etc.
// updates[0].trackingNumber → "UA000449616US"
// updates[0].events[0].timestamp
// updates[0].events[0].carrierStatusCode → original c9 value
// updates[0].events[0].location.city
// updates[0].events[0].description
```

#### Registered tracking with financial data

```ts
const updates = await adapter.trackRegistered(
  {
    trackingNumbers: ["UA000449616US"],
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

// updates[0].rawCarrierResponse.declaredValueAmount    → c5 (declared value in HUF)
// updates[0].rawCarrierResponse.weight                 → c41 (weight in grams)
// updates[0].rawCarrierResponse.size                   → c42 (size category S/M/L)
// updates[0].rawCarrierResponse.declaredValueCurrency  → c58 (currency code)
```

#### Full tracking history (state='all')

```ts
const updates = await adapter.track(
  {
    trackingNumbers: ["UA000449616US"],
    credentials: { apiKey: "key", apiSecret: "secret" },
    state: "all",              // Request full event history
    options: { useTestApi: true },
  },
  { http, logger: console },
);

// updates[0].events → array of all events in the parcel's journey
// events are NOT guaranteed to be chronological; sort by timestamp
```

#### Pull-500 batch tracking

```ts
// Step 1: Submit batch
const startResp = await adapter.trackPull500Start(
  {
    trackingNumbers: ["UA000449616US", "PB2SW00021917"],
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

const guid = startResp.trackingGUID; // "e.g. a1b2c3d4-..."

// Step 2: Wait 60s+ then poll for results
const checkResp = await adapter.trackPull500Check(
  {
    trackingGUID: guid,
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

if (checkResp.status === "READY") {
  // checkResp.report         → CSV data rows
  // checkResp.report_fields  → CSV column headers
}
```

### Sandbox Tracking Notes

The MPL sandbox tracking endpoint is backed by a **separate mock service** that does **not** share data with the sandbox shipment API. Parcels created via `createParcel` / `closeShipments` will **not** appear in tracking results.

Recognised mock tracking IDs in sandbox:
- `UA000449616US`
- `PB2SW00021917`

These return canned responses that exercise the adapter's parsing and mapping logic. See `tracking.live.spec.ts` for exact expected values.
