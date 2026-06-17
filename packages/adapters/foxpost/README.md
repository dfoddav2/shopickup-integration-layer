# @shopickup/adapters-foxpost

Foxpost adapter for Shopickup.

[GitHub repo](https://github.com/shopickup/shopickup-integration-layer)
[Issues](https://github.com/shopickup/shopickup-integration-layer/issues)

## Metadata

- Last updated: 2026-06-17T00:00:00Z
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

## Tracking

Foxpost provides **two tracking APIs** accessed through two adapter functions:

| Function | API | Type | Description |
|---|---|---|---|
| `track()` | `GET /api/tracking/{barcode}` | Synchronous | Track a single parcel by barcode |
| `batchTrack()` | `POST /api/tracking/tracks` | Synchronous | Batch-track up to 100 parcels |

> **Note:** Weight is not sent to Foxpost during parcel creation.

---

### Single Tracking (TRACK)

Used for synchronous tracking of a single parcel. The API returns all available traces
in reverse chronological order (latest first). The adapter reverses them to chronological order.

#### Endpoint

| Endpoint | Auth Required |
|---|---|
| `GET /api/tracking/{barcode}` | Basic auth |

#### Request Shape

```ts
interface TrackingRequestFoxpost extends TrackingRequest {
  trackingNumber: string;            // clFoxId or uniqueBarcode
  credentials: FoxpostCredentials;   // apiKey + apiSecret
  options?: {
    useTestApi?: boolean;
  };
}
```

| Request Field | Description |
|---|---|
| `trackingNumber` | Parcel barcode (e.g. `CLFOX...`) or `clFox` ID assigned at creation |
| `options.useTestApi` | `true` routes to sandbox environment |

#### Response Shape

```ts
interface FoxpostTrackingResponse {
  clFox?: string;                     // Internal Foxpost ID
  parcelType?: string;                // Parcel type code
  sendType?: string;                  // Send type description
  estimatedDelivery?: string;         // ISO date string of estimated delivery
  relatedParcel?: string;             // Related/return tracking number
  traces: FoxpostTrace[];             // Reverse chronological event array
}
```

Each `FoxpostTrace` represents one tracking event:

| Trace Field | Type | Description |
|---|---|---|
| `status` | `string` | Foxpost status code (e.g. `OPERIN`, `HDRECEIVE`) |
| `statusDate` | `string` | ISO date string of the event |
| `longName` | `string?` | Human-readable status description |
| `statusStationId` | `string?` | Station/facility identifier |
| `statusStationName` | `string?` | Station/facility name |

#### Canonical Response Shape

```ts
interface TrackingUpdate {
  trackingNumber: string;              // From request
  status: TrackingStatus;              // Mapped canonical status
  lastUpdate: Date | null;             // Timestamp of latest event
  events: TrackingEvent[];             // Chronological event array
  estimatedDelivery: Date | null;      // From response.estimatedDelivery
  relatedTrackingNumber: string | null;// From response.relatedParcel (e.g. return tracking ID)
  rawCarrierResponse: FoxpostTrackingResponse;
}
```

Each `TrackingEvent` is built as follows:

| TrackingEvent Field | Source | Notes |
|---|---|---|
| `timestamp` | `statusDate` | Parsed ISO date string |
| `status` | `status` | Mapped through the Foxpost status code table |
| `carrierStatusCode` | `status` | Original Foxpost status code (e.g. `OPERIN`) |
| `location.facility` | `statusStationName` | Station/facility name |
| `description` | `longName` or `status` | Human-readable description; falls back to the status code |
| `descriptionLocalLanguage` | Mapped Hungarian description | From `FOXPOST_STATUS_MAP` (see below) |
| `raw` | Full trace object | Original Foxpost trace for debugging |

---

### Status Code Mapping

Foxpost uses 37+ operational status codes mapped to 7 canonical statuses.
Each code also has English and Hungarian human-readable descriptions.

**Canonical status groups:**

| Canonical Status | Foxpost Codes |
|---|---|
| `PENDING` | `CREATE` |
| `IN_TRANSIT` | `OPERIN`, `OPEROOT`, `REDIRECT`, `RESENT`, `SORTIN`, `SORTOUT`, `MPSIN`, `C2CIN`, `C2BIN`, `INWAREHOUSE`, `HDDEPO`, `HDHUBIN`, `COLLECTSENT`, `SLOTCHANGE`, `WBXREDIRECT`, `PREREDIRECT`, `PREPAREDFORPD` |
| `OUT_FOR_DELIVERY` | `HDSENT`, `HDINTRANSIT`, `HDCOURIER`, `HDHUBOUT` |
| `DELIVERED` | `RECEIVE`, `HDRECEIVE`, `COLLECTED`, `RETURNED` |
| `RETURNED` | `RETURN`, `BACKTOSENDER`, `HDRETURN` |
| `EXCEPTION` | `OVERTIMEOUT`, `OVERTIMED`, `HDUNDELIVERABLE`, `MISSORT`, `EMPTYSLOT`, `BACKLOGINFULL`, `BACKLOGINFAIL` |
| `UNKNOWN` | Any unmapped code (falls back to `PENDING`) |

**Full status code reference** (from `packages/adapters/foxpost/src/mappers/trackStatus.ts`):

| Code | Canonical | EN Description | HU Description | Type |
|---|---|---|---|---|
| `CREATE` | `PENDING` | Order created | Rendelés létrehozva | locker |
| `OPERIN` | `IN_TRANSIT` | Arrived at locker | Automatában megérkezett | locker |
| `OPEROOT` | `IN_TRANSIT` | Removed from locker / Out for delivery | Automatából kivéve / Kiszállítás | locker |
| `RECEIVE` | `DELIVERED` | Delivered to recipient | Átvéve | locker |
| `RETURN` | `RETURNED` | Returned to sender | Visszaküldésre került | facility |
| `REDIRECT` | `IN_TRANSIT` | Redirected to new destination | Átirányítva új célhelyre | facility |
| `BACKTOSENDER` | `RETURNED` | Returned to sender | Szállító felé visszaküldve | facility |
| `RESENT` | `IN_TRANSIT` | Resent to new destination | Újra küldve új célhelyre | facility |
| `SORTIN` | `IN_TRANSIT` | Arrived at sorting facility | Rendezőközpontba megérkezett | facility |
| `SORTOUT` | `IN_TRANSIT` | Left sorting facility | Rendezőközpontból elküldve | facility |
| `MPSIN` | `IN_TRANSIT` | Arrived at parcel hub | Csomagközpontba megérkezett | facility |
| `C2CIN` | `IN_TRANSIT` | Arrived at customer collection point | Ügyfél felvevőpontba megérkezett | facility |
| `C2BIN` | `IN_TRANSIT` | Arrived at business collection point | Üzleti felvevőpontba megérkezett | facility |
| `INWAREHOUSE` | `IN_TRANSIT` | In warehouse | Raktárban van | facility |
| `HDSENT` | `OUT_FOR_DELIVERY` | Home delivery sent | Házhozszállítás küldve | courier |
| `HDINTRANSIT` | `OUT_FOR_DELIVERY` | Out for home delivery | Házhoz szállítás alatt | courier |
| `HDDEPO` | `IN_TRANSIT` | At home delivery depot | Kiszállítási depoban | facility |
| `HDCOURIER` | `OUT_FOR_DELIVERY` | With courier for delivery | Futárnál szállításra | courier |
| `HDHUBIN` | `IN_TRANSIT` | Arrived at delivery hub | Szállítási csomópontra megérkezett | facility |
| `HDHUBOUT` | `OUT_FOR_DELIVERY` | Left delivery hub | Szállítási csomópontból elküldve | facility |
| `HDRECEIVE` | `DELIVERED` | Delivered by home delivery | Házhoz szállítva | courier |
| `HDRETURN` | `RETURNED` | Returned from home delivery | Házhoz szállítás visszatérült | courier |
| `OVERTIMEOUT` | `EXCEPTION` | Overtime out (delivery exceeded time limit) | Túlóra lejárt | technical |
| `OVERTIMED` | `EXCEPTION` | Overtime (delivery delayed) | Túlóra (késedelem) | technical |
| `HDUNDELIVERABLE` | `EXCEPTION` | Undeliverable (home delivery failed) | Nem szállítható (házhoz szállítás sikertelen) | courier |
| `MISSORT` | `EXCEPTION` | Missorted — rerouted | Hibásan rendezett — átirányított | technical |
| `EMPTYSLOT` | `EXCEPTION` | No locker slot available | Nincs szabad automatahely | locker |
| `BACKLOGINFULL` | `EXCEPTION` | Backlog — facility at capacity | Feldolgozási várakozási sor teljes | facility |
| `BACKLOGINFAIL` | `EXCEPTION` | Backlog failed — retry needed | Feldolgozási sor sikertelen | technical |
| `COLLECTSENT` | `IN_TRANSIT` | Collect shipment sent | Gyűjtőszállítmány küldve | facility |
| `COLLECTED` | `DELIVERED` | Collected from sender | Feladótól összeszedve | facility |
| `SLOTCHANGE` | `IN_TRANSIT` | Locker slot changed | Automatahely módosult | technical |
| `WBXREDIRECT` | `IN_TRANSIT` | Redirected via WBX | WBX-en keresztül átirányított | facility |
| `PREREDIRECT` | `IN_TRANSIT` | Pre-redirect (staged for redirection) | Előátirányítás (átirányításra előkészítve) | technical |
| `RETURNED` | `DELIVERED` | Returned (delivered back to sender) | Visszaküldve (feladónak szállítva) | facility |
| `PREPAREDFORPD` | `IN_TRANSIT` | Prepared for home delivery | Házhoz szállításra előkészítve | technical |

---

### Batch Tracking (BATCH_TRACK)

Track multiple parcels in a single API call. Accepts up to **100 tracking numbers** per request.

#### Endpoint

| Endpoint | Auth Required |
|---|---|
| `POST /api/tracking/tracks` | Basic auth |

#### Request Shape

```ts
interface BatchTrackingRequestFoxpost extends BatchTrackingRequest {
  trackingNumbers: string[];         // 1–100 barcodes
  credentials: FoxpostCredentials;
  options?: {
    useTestApi?: boolean;
  };
}
```

#### Response Shape

The raw API returns an array of `Statuses` objects:

```ts
interface FoxpostStatuses {
  barcode: string;                    // Tracking barcode
  statuses: FoxpostTrackDTO[];        // Chronological tracking events
}
```

Each `FoxpostTrackDTO` is:

```ts
interface FoxpostTrackDTO {
  status: string;                     // Foxpost status code
  statusDate: string;                 // ISO date string
  longName?: string;                  // Human-readable description
}
```

#### Canonical Response Shape

```ts
interface BatchTrackingResponse {
  results: BatchTrackingResult[];     // Per-barcode results
  successCount: number;
  failureCount: number;
  totalCount: number;
  allSucceeded: boolean;
  allFailed: boolean;
  someFailed: boolean;
  summary: string;
  rawCarrierResponse?: string;        // Serialised log of the HTTP response
}
```

Each `BatchTrackingResult`:

```ts
interface BatchTrackingResult {
  trackingNumber: string;
  status: 'found' | 'not_found' | 'failed';
  update?: {                          // Present when status === 'found'
    trackingNumber: string;
    events: TrackingEvent[];          // Chronological event array
    status: TrackingStatus;           // Mapped canonical status
    lastUpdate: Date;
    rawCarrierResponse: FoxpostStatuses;
  };
  error?: {                           // Present when status === 'failed'
    code: string;
    message: string;
  };
  raw?: any;                          // Original API item for debugging
}
```

---

### Error Handling

All tracking functions throw `CarrierError` with the following categories mapped from HTTP status codes:

| HTTP Status | CarrierError Category | Description |
|---|---|---|
| `400` | `Validation` | Bad request — invalid parameters |
| `401` | `Auth` | Unauthorized — invalid/expired credentials |
| `403` | `Auth` | Forbidden — caller not authorized |
| `404` | `NotFound` | Tracking information not found for given barcode |
| `429` | `RateLimit` | Rate limited |
| `500+` | `Transient` | Server error — retryable |
| Network errors | `Transient` | Connection refused, DNS failure, timeout |

Additionally, the adapter checks for specific error conditions:

| Condition | Error | Category |
|---|---|---|
| Empty/null response body | `"No tracking information found for {barcode}"` | `NotFound` |
| Missing `clFox` in response | `"No tracking information found for {barcode}"` | `NotFound` |
| Missing `traces` array | `"Invalid tracking response: traces array missing"` | `Transient` |
| Zod validation failure on response | Validation error message | `Validation` |

---

### Usage Examples

#### Single parcel tracking

```ts
const update = await adapter.track(
  {
    trackingNumber: "CLFOX0000000001",
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

// update.status              → "PENDING" | "IN_TRANSIT" | "DELIVERED" | etc.
// update.trackingNumber      → "CLFOX0000000001"
// update.events              → chronological TrackingEvent[]
// update.events[0].timestamp → Date
// update.events[0].status    → canonical status
// update.events[0].carrierStatusCode → "OPERIN" (original Foxpost code)
// update.events[0].location.facility → station name
// update.events[0].description       → "Arrived at locker"
// update.estimatedDelivery   → Date | null
// update.relatedTrackingNumber → string | null (e.g. return parcel ID)
```

#### Batch tracking

```ts
const result = await adapter.batchTrack!(
  {
    trackingNumbers: [
      "CLFOX0000000001",
      "CLFOX0000000002",
      "CLFOX0000000003",
    ],
    credentials: { apiKey: "key", apiSecret: "secret" },
    options: { useTestApi: true },
  },
  { http, logger: console },
);

// result.totalCount
// result.successCount
// result.failureCount
// result.summary → "All 3 parcels tracked successfully"

const first = result.results[0];
if (first.status === "found") {
  first.update!.events;              // chronological TrackingEvent[]
  first.update!.status;              // canonical status
  first.update!.relatedTrackingNumber;
}
if (first.status === "not_found") {
  // Parcel not yet in tracking system
}
```

### Sandbox Tracking Notes

Foxpost sandbox tracking requires parcels to first be **created** via `createParcel` / `createParcels` before they appear in the tracking system. After creation, there may be a processing delay before tracking data becomes available. The E2E tests poll with retries to handle this.

Recognised mock tracking numbers in sandbox:
- Use the `carrierId` returned from `createParcel` in sandbox mode

See `packages/adapters/foxpost/src/tests/live/batch-track.live.spec.ts` for the exact E2E test flow.
