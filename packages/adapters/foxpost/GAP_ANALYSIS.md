# Foxpost Adapter Capability Reference

> Canonical mapping status for every FoxWeb API endpoint against the `@shopickup/adapters-foxpost` adapter.
> 
> **Carrier API version:** 1.2.14  
> **Adapter capabilities registered:** `CREATE_PARCEL`, `CREATE_PARCELS`, `CREATE_LABEL`, `TRACK`, `LIST_PICKUP_POINTS`, `TEST_MODE_SUPPORTED`, `DELETE_PARCEL`, `CREATE_RETURN`, `CREATE_RETURNS`, `BATCH_TRACK`

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Mapped / Implemented |
| ❌ | Not mapped / Not implemented |
| ⚠️ | Partially mapped or behavior differs from raw API |
| N/A | Field does not apply to this capability |

---

## 1. CREATE_PARCEL / CREATE_PARCELS

**OpenAPI endpoint:** `POST /api/parcel`  
**Adapter capability:** `CREATE_PARCEL`, `CREATE_PARCELS`  
**Implementation:** `src/capabilities/parcels.ts`

### Query Parameters

| OpenAPI Parameter | In Adapter | Status | How to set |
|---|---|---|---|
| `isWeb` | `options.foxpost.isWeb` | ✅ | Defaults to `!useTestApi` |
| `isRedirect` | `options.foxpost.isRedirect` | ✅ | Defaults to `false` |

### Request Body Fields (`CreateParcelRequest`)

| OpenAPI Field | Mapped From | Status | Notes |
|---|---|---|---|
| `recipientName` | `recipient.contact.name` | ✅ | Truncated to 150 chars |
| `recipientPhone` | `recipient.contact.phone` | ✅ | |
| `recipientEmail` | `recipient.contact.email` | ✅ | |
| `size` | `options.foxpost.size` or volume heuristic | ✅ | xs, s, m, l, xl |
| `recipientCountry` | `delivery.address.country` | ✅ | Defaults to `HU` |
| `recipientCity` | `delivery.address.city` | ✅ | HD only |
| `recipientZip` | `delivery.address.postalCode` | ✅ | HD only |
| `recipientAddress` | `delivery.address.street` | ✅ | HD only |
| `cod` | `parcel.cod.amount.amount` | ✅ | Integer, 0–1,000,000 |
| `deliveryNote` | `delivery.instructions` | ✅ | HD only, max 50 chars |
| `comment` | `options.foxpost.comment` → `metadata.foxpostComment` → `handling.fragile` | ✅ | Priority chain |
| `label` | `options.foxpost.label` | ✅ | C2C HD use-case |
| `fragile` | `parcel.handling.fragile` | ✅ | |
| `uniqueBarcode` | `options.foxpost.uniqueBarcode` | ✅ | APM only, max 20 chars |
| `refCode` | `references.customerReference` + `id` suffix | ✅ | Truncated to 30 chars |
| `destination` | `delivery.pickupPoint.id` | ✅ | APM only |

### Fields Not Mapped (by design)

| Field | Reason |
|---|---|
| `barcode` | Only in `UpdateParcelRequest` (update/delete flow, not creation) |
| `sender` | Only in `CreateParcelRequestExt` (external marketplace endpoint). Standard endpoint uses the API key's registered sender address. |

### Response Fields (`CreateResponse`)

| OpenAPI Field | In Adapter Response | Status | Notes |
|---|---|---|---|
| `valid` | Checked, influences error handling | ✅ | Top-level validation errors throw `CarrierError` |
| `parcels` | Mapped to `CarrierResource[]` | ✅ | Per-parcel success/failure |
| `parcels[].clFoxId` | `carrierId` | ✅ | |
| `parcels[].barcode` | Fallback for `carrierId` | ✅ | |
| `parcels[].newBarcode` | Fallback for `carrierId` | ✅ | |
| `parcels[].refCode` | Included in `raw` | ✅ | |
| `parcels[].errors` | Mapped to `FailedCarrierResource.errors` | ✅ | `ParcelValidationError[]` |
| `errors` (top-level) | Checked, throws `CarrierError` | ✅ | |

### Validation & Error Handling

- Required fields (`recipientName`, `recipientEmail`, `recipientPhone`) are validated pre-flight.
- HD parcels require all three address fields (`recipientCity`, `recipientZip`, `recipientAddress`) to be present together.
- APM parcels require `destination` when no address fields are present.
- `uniqueBarcode` is rejected for batch requests with >1 parcel (to avoid duplicate barcodes).

---

## 2. CREATE_LABEL / CREATE_LABELS

**OpenAPI endpoint:** `POST /api/label/{pageSize}`  
**Adapter capability:** `CREATE_LABEL`, `CREATE_LABELS`  
**Implementation:** `src/capabilities/label.ts`

### Path / Query Parameters

| OpenAPI Parameter | In Adapter | Status | Notes |
|---|---|---|---|
| `pageSize` | `options.size` | ✅ | A6, A7, _85X85. **A5 is NOT exposed** (see Missing below). |
| `startPos` | `options.foxpost.startPos` | ✅ | 0–7, only meaningful for A7 on A4 sheets |
| `isPortrait` | `options.foxpost.isPortrait` | ✅ | Defaults to `false` |

### Request Body

The adapter sends the array of `parcelCarrierIds` (Foxpost barcodes) as the raw request body.

| OpenAPI Body | In Adapter | Status | Notes |
|---|---|---|---|
| Array of barcode strings | `req.parcelCarrierIds` | ✅ | |

### Response Handling

Foxpost returns a single combined PDF. The adapter:

- Creates one `LabelFileResource` with `contentType: application/pdf`
- Returns per-item `LabelResult[]` where all items reference the same `fileId`
- Sets `metadata.combined: true` and `metadata.barcodeCount`

| OpenAPI Response | In Adapter | Status | Notes |
|---|---|---|---|
| PDF binary (`application/pdf`) | `LabelFileResource.rawBytes` | ✅ | `Buffer` or `Uint8Array` |
| Error (`ApiError`) | Mapped to failed `LabelResult` | ✅ | HTTP status-driven categorization |

### Missing / Gaps

| Item | Status | Notes |
|---|---|---|
| **A5 page size** | ❌ | OpenAPI enum includes `A5`; adapter only exposes `A6`, `A7`, `_85X85` in validation schema. Add `A5` to `options.size` enum if needed. |
| **Label info endpoint** (`GET /api/label/info/{barcode}`) | ❌ | Not implemented. Could be used to pre-validate label data before PDF generation. |
| **Delivery note PDF** (`POST /api/label/deliveryNote`) | ❌ | Not implemented. Separate from parcel label; generates a bill-of-delivery PDF. |

---

## 3. TRACK

**OpenAPI endpoint:** `GET /api/tracking/{barcode}`  
**Adapter capability:** `TRACK`  
**Implementation:** `src/capabilities/track.ts`

### Path Parameters

| OpenAPI Parameter | In Adapter | Status | Notes |
|---|---|---|---|
| `barcode` | `req.trackingNumber` | ✅ | Foxpost barcode (e.g., `CLFOX00000000000`) |

### Response Fields (`Tracking`)

| OpenAPI Field | In Adapter Response | Status | Notes |
|---|---|---|---|
| `clFox` | Included in `rawCarrierResponse`; used for not-found check | ✅ | |
| `parcelType` | Included in `rawCarrierResponse`; logged | ✅ | NORMAL, RE, XRE, IRE, C2B |
| `sendType` | Included in `rawCarrierResponse`; logged | ✅ | APM, HD, COLLECT |
| `traces` | Mapped to `TrackingEvent[]` | ✅ | Reversed to chronological order |
| `relatedParcel` | Included in `rawCarrierResponse` | ✅ | |
| `estimatedDelivery` | Included in `rawCarrierResponse` | ✅ | |

### Trace Field Mapping

Each `Trace` is mapped to a `TrackingEvent`:

| OpenAPI Trace Field | Canonical `TrackingEvent` | Status |
|---|---|---|
| `status` | `carrierStatusCode` | ✅ |
| `statusDate` | `timestamp` | ✅ |
| `shortName` / `longName` | `description` | ✅ | Prefers mapped human-readable descriptions |
| `statusStationId` | Included in `raw` | ✅ | |

### Missing / Gaps

| Item | Status | Notes |
|---|---|---|
| **TrackDTO endpoint** (`GET /api/tracking/tracks/{barcode}`) | ❌ | Returns raw `TrackDTO[]` without `clFox` wrapper. The adapter uses the richer `GET /api/tracking/{barcode}` endpoint instead. |

---

## 4. DELETE_PARCEL

**OpenAPI endpoint:** `DELETE /api/parcel/{barcode}`  
**Adapter capability:** `DELETE_PARCEL`  
**Implementation:** `src/capabilities/delete-parcel.ts`

### Path Parameters

| OpenAPI Parameter | In Adapter | Status | Notes |
|---|---|---|---|
| `barcode` | `req.parcelCarrierId` | ✅ | Foxpost barcode (e.g., `CLFOX00000000000`) |

### Query Parameters

| OpenAPI Parameter | In Adapter | Status | Notes |
|---|---|---|---|
| `isWeb` | `options.foxpost.isWeb` | ✅ | Defaults to `true` |

### Response Handling

| HTTP Status | Adapter Behavior |
|---|---|
| `200` / `204` | Returns `DeleteParcelResult` with `status: 'deleted'` |
| `400` | Returns `DeleteParcelResult` with `status: 'failed'`, error code `Validation` |
| `401` / `403` | Returns `DeleteParcelResult` with `status: 'failed'`, error code `Auth` |
| Other | Returns `DeleteParcelResult` with `status: 'failed'`, error code `Transient` |

The adapter **never throws** for `DELETE_PARCEL`; all outcomes are returned as a `DeleteParcelResult`.

---

## 5. CREATE_RETURN / CREATE_RETURNS

**OpenAPI endpoint:** `POST /api/re/ext` (single), `POST /api/re/exts` (batch)  
**Adapter capability:** `CREATE_RETURN`, `CREATE_RETURNS`  
**Implementation:** `src/capabilities/return.ts`

### Query Parameters

| OpenAPI Parameter | In Adapter | Status | Notes |
|---|---|---|---|
| `returnType` | `options.foxpost.returnType` | ✅ | `RE` (default) or `IRE` |

### Request Body (`CreateReParcelReq`)

| OpenAPI Field | Mapped From | Status | Notes |
|---|---|---|---|
| `barcode` | `return.parcelCarrierId` | ✅ | Original parcel barcode |
| `uniqueBarcode` | `return.uniqueBarcode` | ✅ | Max 20 chars |
| `refCode` | `return.refCode` | ✅ | Max 30 chars |

### Response Fields (`CreateReParcelRes`)

| OpenAPI Field | In Adapter Response | Status | Notes |
|---|---|---|---|
| `barcode` | Included in `raw` | ✅ | Original barcode |
| `newBarcode` | `carrierId` | ✅ | Return parcel barcode |
| `created` | `status === 'created'` | ✅ | |
| `errors` | Mapped to `errors` array | ✅ | Per-item failure |

### Batch Behavior

`createReturns` sends up to 100 items in a single `POST /api/re/exts` call and returns a `CreateParcelsResponse`-style summary with `successCount`, `failureCount`, and per-item `results`.

### Sandbox Limitation

The Foxpost **test/sandbox API** (`webapi-test.foxpost.hu`) returns `PROCESS_NOT_IMPLEMENTED_YET` for return creation endpoints. This is a **carrier-side, undocumented limitation** — the endpoint accepts requests and returns HTTP `201`, but the response body contains `created: false` and per-item `errors: [{ field: 'parcel', message: 'PROCESS_NOT_IMPLEMENTED_YET' }]`.

**Consequences:**
- Return creation **cannot be live-tested against the sandbox**.
- The adapter implementation is complete and correct per the OpenAPI spec.
- Returns can only be verified against the **production API** (`webapi.foxpost.hu`).
- No live E2E tests exist for this capability because the sandbox does not support it.

---

## 6. BATCH_TRACK

**OpenAPI endpoint:** `POST /api/tracking/tracks`  
**Adapter capability:** `BATCH_TRACK`  
**Implementation:** `src/capabilities/batch-track.ts`

### Request Body

| OpenAPI Body | In Adapter | Status | Notes |
|---|---|---|---|
| Array of barcode strings | `req.trackingNumbers` | ✅ | Max 100 per batch |

### Response Handling

Foxpost returns an array of `Statuses` objects (one per barcode). The adapter maps each to a `BatchTrackingResult`:

| OpenAPI Response | In Adapter | Status | Notes |
|---|---|---|---|
| `Statuses[].barcode` | `result.trackingNumber` | ✅ | |
| `Statuses[].statuses` | Mapped to `TrackingEvent[]` | ✅ | Reversed to chronological order |
| `Statuses[].createdAt` | Included in `raw` | ✅ | |
| Missing barcode | `status: 'failed'`, code `MISSING_BARCODE` | ✅ | |
| Empty statuses | `status: 'not_found'` | ✅ | |

### Summary Stats

The `BatchTrackingResponse` includes:
- `totalCount` — total items processed
- `successCount` — items with at least one status event
- `failureCount` — items that failed (missing barcode or parse error)
- `allSucceeded`, `allFailed`, `someFailed` — convenience booleans

---

## 7. LIST_PICKUP_POINTS

**OpenAPI endpoint:** `GET https://cdn.foxpost.hu/foxplus.json` (public feed, not in OpenAPI base URL)  
**Adapter capability:** `LIST_PICKUP_POINTS`  
**Implementation:** `src/capabilities/pickup-points.ts`

### Request Options

This capability uses a **public unauthenticated feed**. No credentials required.

| Feed Field | Canonical `PickupPoint` | Status | Notes |
|---|---|---|---|
| `place_id` / `operator_id` | `id` / `providerId` | ✅ | `operator_id` preferred as primary ID |
| `name` | `name` | ✅ | |
| `country` | `country` | ✅ | Lowercased |
| `zip` | `postalCode` | ✅ | |
| `city` | `city` | ✅ | |
| `street` | `street` | ✅ | |
| `address` | `address` | ✅ | Fallback built from zip + city + street |
| `findme` | `findme` | ✅ | |
| `geolat` / `geolng` | `latitude` / `longitude` | ✅ | Coerced from string if needed |
| `allowed2` | `pickupAllowed` / `dropoffAllowed` | ✅ | ALL/B2C = both; C2C = dropoff only |
| `cardPayment` / `cashPayment` | `paymentOptions` | ✅ | Normalized to "card", "cash" |
| `paymentOptions` | `paymentOptions` | ✅ | Merged with card/cash |
| `isOutdoor` | `isOutdoor` | ✅ | |
| `open` | `openingHours` | ✅ | Hungarian day names preserved |
| `depot`, `load`, `apmType`, `substitutes`, `variant`, `fillEmptyList`, `ssapt`, `sdapt` | `metadata` | ✅ | Carrier-specific fields |
| Raw entry | `raw` | ✅ | Full original object preserved |

### Filtering Options

| Option | Status | Notes |
|---|---|---|
| `options.foxpost.country` | ✅ | Post-fetch filter by ISO country code |
| `options.foxpost.bbox` | ✅ | Post-fetch bounding-box filter (north/south/east/west) |
| `options.foxpost.updatedSince` | ❌ | Schema accepts it but not used in filtering logic. Feed is static snapshot, no modification timestamps. |

### Missing / Gaps

| Item | Status | Notes |
|---|---|---|
| **Icon URL** (`iconUrl`) | ⚠️ | Parsed in validation but not exposed on `PickupPoint` interface. Available in `raw` only. |
| **Service flags** (`service`, `serviceString`) | ⚠️ | Parsed in validation but not normalized to canonical `PickupPoint` fields. Available in `raw` only. |

---

## 8. Not Implemented (OpenAPI Endpoints)

These endpoints are defined in the carrier OpenAPI spec but **not exposed** by the adapter:

| Endpoint | Method | OpenAPI Tag | Reason |
|---|---|---|---|
| `POST /api/xre/unique` | POST | External Returns | Niche use-case (external returns with unique barcodes). No core capability mapping. |
| `POST /api/parcel/ext` | POST | Parcels | Marketplace/unregistered parcel creation. Differs from standard flow. |
| `POST /api/parcel/c2b` | POST | Parcels | C2B parcel creation. Partial overlap with standard CREATE_PARCEL but requires `sender` object. |
| `POST /api/label/deliveryNote` | POST | Labels | Bill-of-delivery PDF. Separate from parcel label. No core capability. |
| `GET /api/label/info/{barcode}` | GET | Labels | Pre-label metadata lookup. Could be useful for validation before label generation. |
| `POST /api/file` | POST | Upload files | CSV/Excel bulk upload. No core file-upload capability pattern. |
| `GET /api/address` | GET | Addresses | Address listing. No core address-management capability. |
| `POST /api/address` | POST | Addresses | Address creation. No core address-management capability. |
| `DELETE /api/address/{name}` | DELETE | Addresses | Address deletion. No core address-management capability. |

---

## 9. Size / Dimensions Handling

Foxpost requires a **size category** (`xs`, `s`, `m`, `l`, `xl`) rather than raw dimensions.

| Source | Behavior |
|---|---|
| `options.foxpost.size` | Explicit override; bypasses heuristic entirely |
| `parcel.package.dimensionsCm` | Volume-based heuristic: <5,000cm³=xs, <15,000cm³=s, <50,000cm³=m, <100,000cm³=l, ≥100,000cm³=xl |
| Neither provided | Defaults to `s` |

Weight (`parcel.package.weightGrams`) is **not sent** to Foxpost during parcel creation.

---

## 10. Authentication

| Mechanism | Requirement | Notes |
|---|---|---|
| Basic Auth | Required | `credentials.basicUsername` + `credentials.basicPassword` |
| API Key (header) | Required | `credentials.apiKey` sent as `api-key` header |
| Both together | Required | Foxpost requires both mechanisms simultaneously |

Test mode uses `https://webapi-test.foxpost.hu` (separate credentials required).

---

## 11. Summary Table

| Capability | Status | OpenAPI Endpoint | Core Gaps |
|---|---|---|---|
| **CREATE_PARCEL** | ✅ Full | `POST /api/parcel` | None |
| **CREATE_PARCELS** | ✅ Full | `POST /api/parcel` | None |
| **CREATE_LABEL** | ✅ Full | `POST /api/label/{pageSize}` | A5 size not exposed; label-info endpoint not implemented |
| **CREATE_LABELS** | ✅ Full | `POST /api/label/{pageSize}` | Same as CREATE_LABEL |
| **TRACK** | ✅ Full | `GET /api/tracking/{barcode}` | TrackDTO endpoint not used (richer endpoint preferred) |
| **LIST_PICKUP_POINTS** | ✅ Full | Public JSON feed | `updatedSince` filter accepted but not applied; iconUrl/service flags only in raw |
| **DELETE_PARCEL** | ✅ Full | `DELETE /api/parcel/{barcode}` | None |
| **CREATE_RETURN** | ✅ Full | `POST /api/re/ext` | None |
| **CREATE_RETURNS** | ✅ Full | `POST /api/re/exts` | None |
| **BATCH_TRACK** | ✅ Full | `POST /api/tracking/tracks` | None |
| **CREATE_EXTERNAL_RETURN** | ❌ Not impl | `POST /api/xre/unique` | Niche use-case; no core mapping |
| **CREATE_PARCEL_EXT** | ❌ Not impl | `POST /api/parcel/ext` | Marketplace flow; no core mapping |
| **CREATE_C2B_PARCEL** | ❌ Not impl | `POST /api/parcel/c2b` | Requires sender object; no core mapping |
| **GENERATE_DELIVERY_NOTE** | ❌ Not impl | `POST /api/label/deliveryNote` | No core capability |
| **GET_LABEL_INFO** | ❌ Not impl | `GET /api/label/info/{barcode}` | Could be added as helper |
| **UPLOAD_FILE** | ❌ Not impl | `POST /api/file` | No core file-upload pattern |
| **MANAGE_ADDRESSES** | ❌ Not impl | `GET/POST/DELETE /api/address/*` | No core address-management pattern |

---

*Last updated: 2026-05-30*  
*Maintained alongside `@shopickup/adapters-foxpost` source code. When the adapter changes, update this document.*
