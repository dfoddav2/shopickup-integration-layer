# GLS Adapter – Known Issues & TODOs

## PSD (Parcel Shop Delivery) Service Parameter

**Status:** Needs investigation  
**Priority:** High  
**Files affected:** `src/mappers/parcels.ts`, `src/types/index.ts`, `src/validation/parcels.ts`

### Problem

The GLS test API consistently rejects parcels with the PSD service, returning error code 13:

```txt
ErrorCode: 13
ErrorDescription: "Invalid service parameter, Service 'PSD'"
```

We have tested both parameter formats without success:

1. **ServiceParameterStringInteger** (matches the OpenAPI `Service` schema):

   ```json
   {
     "code": "PSD",
     "psdParameter": {
       "stringValue": "379-PARCELSHOP",
       "integerValue": 1
     }
   }
   ```

2. **ServiceParameterString** (matches the Appendix B description):

   ```json
   {
     "code": "PSD",
     "value": "379-PARCELSHOP"
   }
   ```

### Root-cause hypotheses

- The test account (`103014881`) may not have PSD enabled in the GLS contract.
- The pickup point ID format might differ from `number-PARCELSHOP` for this account.
- The PascalCase conversion (`convertToPascalCase`) may be mangling the service parameter key name.

### Next steps

1. **Contact GLS support** to confirm whether PSD is enabled for the test client number.
2. **Verify the exact PSD parameter shape** expected by the live GLS JSON endpoint by capturing a working request from the official PHP/C# samples.
3. **Check PascalCase conversion** — inspect the raw request body to ensure `PsdParameter` / `Value` is sent correctly.
4. **Update the mapper** (`src/mappers/parcels.ts`) once the correct format is confirmed.
5. **Update the Zod schema** (`src/validation/parcels.ts`) and TypeScript types (`src/types/index.ts`) if the parameter shape differs from the current definition.
6. **Remove the early-exit guard** in the live test (`src/tests/live/pickup-point-flow.live.spec.ts`) once PSD works end-to-end.

---

## Tracking NotFound for Fresh Test Parcels

**Status:** Mitigated with retries, underlying carrier behaviour  
**Priority:** Low  
**Files affected:** `src/tests/live/home-delivery-flow.live.spec.ts`, `src/tests/live/pickup-point-flow.live.spec.ts`, `src/tests/live/live-test-utils.ts`

### Problem

The GLS test API returns `Parcel not found with current settings (code: 26)` for tracking requests immediately after label creation. The parcel becomes trackable only after a variable delay (observed 15–60 seconds).

### Current workaround

Live tests use `pollWithRetries` with:

- `maxRetries: 6`
- `retryDelayMs: 15_000`
- Total wait: 90 seconds

If the parcel is still not found after all retries, the test accepts `NotFound` as a valid outcome for a freshly created test parcel.

### Next steps

1. **Monitor stability** — if the delay increases, consider bumping retries or delay.
2. **Document the lag** in the adapter README so integrators know to expect it.

---

## Pickup Point ID Format

**Status:** Documented, needs confirmation with GLS  
**Priority:** Medium  
**Files affected:** `src/mappers/parcels.ts`, `src/tests/live/pickup-point-flow.live.spec.ts`, `live.env.example`

### Problem

The canonical `PickupPoint.id` from the public feed uses the format `1027-CSOMAGPONT05`, but the PSD service description says the ID should be in `number-PARCELSHOP` format (e.g. `379-PARCELSHOP`). The test currently derives the PSD ID from `raw.goldId`:

```ts
const psdId = raw.goldId ? `${raw.goldId}-PARCELSHOP` : pickupPoint.id;
```

### Next steps

1. **Confirm with GLS** which ID format the PSD service actually expects for the test account.
2. **Update the mapper** to use the confirmed format consistently.
3. **Update `live.env.example`** to reflect the correct example value.

---

## `convertToPascalCase` for Request Bodies

**Status:** Working for most fields, edge cases possible  
**Priority:** Low  
**Files affected:** `src/utils/authentication.ts`, `src/capabilities/parcels.ts`

### Problem

The adapter converts the entire JSON request to PascalCase to match GLS .NET conventions. This is brittle:

- Unknown fields may be converted unexpectedly.
- Nested objects with mixed casing (e.g. `psdParameter` → `PsdParameter`) may not align with the actual API expectation.

### Next steps

1. **Consider building the request directly in PascalCase** instead of converting at runtime, so the exact shape is visible in the source code.
2. **Add a raw-request debug log** that prints the JSON body exactly as sent to the wire.

---

## Address Validation for Pickup-Point Parcels

**Status:** Fixed in mapper, needs regression test  
**Priority:** Low  
**Files affected:** `src/mappers/parcels.ts`

### Problem

When no pickup point address is provided, the mapper used to fall back to:

- `city: 'Pickup Point'`
- `postalCode: '00000'`

GLS rejects `'00000'` as an invalid zip code.

### Fix

The mapper now falls back to realistic values (`Budapest`, `1011`) when the caller omits the address. The live test also supplies a real address from the GLS public feed.

### Next steps

1. **Add a unit test** in `src/tests/unit/parcels.spec.ts` that verifies fallback address values are realistic and include all required fields.

---

## General Live-Test Improvements

- **Extract shared retry config** into `live-env.ts` so both home-delivery and pickup-point tests use the same constants.
- **Add a live test for `fetchPickupPoints`** that validates the first point has a valid `goldId` and `externalId`.
- **Add a live test for batch parcel creation** (multiple parcels in one `createParcels` call).
