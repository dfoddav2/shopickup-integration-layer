# Understanding the `raw` Field

This guide explains the `raw` field that appears in all Shopickup adapter responses, why it contains different data depending on your configuration, and how to debug it.

## What is the `raw` Field?

The `raw` field in any CarrierResource response contains the **complete, unmodified response from the carrier's API**. This includes:

- All fields the carrier returned (not just the fields Shopickup normalized)
- Metadata, tracking numbers, identifiers, and other carrier-specific data
- Error details if the carrier returned an error
- Anything else the carrier sent in its response

**Example from a successful label creation:**

```json
{
  "carrierId": "label-123456",
  "status": "created",
  "labelUrl": "https://carrier.example.com/labels/123456.pdf",
  "raw": {
    "id": "label-123456",
    "status": "generated",
    "format": "pdf",
    "url": "https://carrier.example.com/labels/123456.pdf",
    "trackingNumber": "1Z999AA10123456784",
    "dimensions": {
      "width": 100,
      "height": 150
    },
    "generatedAt": "2026-01-22T10:30:00Z",
    "expiresAt": "2026-02-22T10:30:00Z"
  }
}
```

The top-level fields (`carrierId`, `status`, `labelUrl`) are **normalized** by the adapter (mapped from carrier terminology to Shopickup terminology). The `raw` field preserves the original carrier response.

## Why You Need the `raw` Field

### 1. **Debugging Adapter Issues**

When something goes wrong, the `raw` field shows you exactly what the carrier returned, which helps identify:
- Unexpected carrier behavior
- Undocumented carrier API quirks
- Data validation issues in the adapter

### 2. **Extracting Carrier-Specific Data**

Some carriers return useful data that isn't part of the Shopickup canonical model. The `raw` field makes this available:

```javascript
// Access carrier-specific metadata
const shipmentDetails = response.raw.shipment_metadata;
const pickupCode = response.raw.codes.pickup;
const insuranceInfo = response.raw.optional_insurance;
```

### 3. **Audit and Compliance**

Regulators and auditors may require proof that certain data was received from the carrier. Store the `raw` field for audit trails:

```javascript
// Save for compliance
await db.shipments.update(shipmentId, {
  carrierRawResponse: response.raw,
  timestamp: new Date()
});
```

### 4. **Integrator-Specific Handling**

Different integrators may need different subsets of carrier data. The `raw` field lets each integrator extract what they need:

```javascript
// Integrator A: Extract all tracking events
const events = response.raw.tracking_history?.map(...);

// Integrator B: Extract insurance eligibility
const eligible = response.raw.insurance_eligibility === "approved";
```

## Test Mode vs Production Mode

The content and structure of the `raw` field differs dramatically depending on whether you're using test mode or production mode.

### Test Mode (Default)

**When:** `FOXPOST_USE_TEST_API=true` or no `FOXPOST_API_KEY` provided

**What happens:**
- The adapter uses a mock HTTP client that returns fabricated carrier responses
- The `raw` field contains realistic but fake data
- No actual API calls are made

**Example test response:**

```json
{
  "carrierId": "parcel-999999",
  "status": "created",
  "raw": {
    "id": "parcel-999999",
    "status": "active",
    "trackingNumber": "MOCK123456789",
    "createdAt": "2026-01-22T10:00:00Z"
  }
}
```

**Why test mode?**
- Faster development (no network latency)
- No cost (no real API calls)
- Reliable (mock responses are deterministic)
- Good for testing adapter logic without carrier dependencies

### Production Mode

**When:** `FOXPOST_USE_TEST_API=false` AND `FOXPOST_API_KEY` is set to valid credentials

**What happens:**
- The adapter makes real API calls to the carrier
- The `raw` field contains the actual carrier response
- All data is real (real tracking numbers, real pricing, etc.)

**Example production response:**

```json
{
  "carrierId": "CLFOX0000012345",
  "status": "created",
  "raw": {
    "valid": true,
    "parcels": [
      {
        "barcode": "CLFOX0000012345",
        "refCode": "order-12345",
        "status": "registered",
        "trackingNumber": "1Z999AA10123456784",
        "createdAt": "2026-01-22T10:15:30Z",
        "estimatedDelivery": "2026-01-25",
        "service": "EXPRESS",
        "errors": []
      }
    ]
  }
}
```

**Why production mode?**
- Get real tracking numbers
- Test actual carrier pricing and constraints
- Verify integration before going live
- Debug real-world carrier behavior

## Switching Between Test and Production

### From Test Mode → Production Mode

1. Get credentials from your carrier (Foxpost API key, etc.)
2. Update `.env`:
   ```env
   FOXPOST_API_KEY=your-actual-api-key-here
   FOXPOST_USE_TEST_API=false
   ```
3. Restart dev server:
   ```bash
   pnpm run dev
   ```
4. Make a request to any endpoint
5. Check the response's `raw` field — it should now contain real carrier data

### From Production Mode → Test Mode

1. Update `.env`:
   ```env
   FOXPOST_USE_TEST_API=true
   # Or leave FOXPOST_API_KEY empty
   ```
2. Restart dev server:
   ```bash
   pnpm run dev
   ```
3. Make a request — you're back to mock data

## Debugging the `raw` Field

### Enable Full HTTP Logging

To see the exact HTTP request/response cycle (which becomes the `raw` field):

1. Update `.env`:
   ```env
   LOG_LEVEL=debug
   HTTP_DEBUG=1
   HTTP_DEBUG_FULL=1
   ```

2. Restart: `pnpm run dev`

3. Make a request. You'll see logs like:

   ```
   [dev-server] {...,"level":20,"msg":"→ POST /parcels","path":"/parcels","method":"POST","headers":{"content-type":"application/json"},"body":{"shipmentId":"ship-123",...}}
   [dev-server] {...,"level":20,"msg":"← 200 OK","status":200,"headers":{"content-type":"application/json"},"body":{"id":"parcel-123","status":"active",...}}
   ```

4. The response body in the logs is **exactly what becomes the `raw` field**

### Understanding Request/Response Flow

```
Your Request
    ↓
Adapter (FoxpostAdapter)
    ↓
Maps canonical types → carrier types
    ↓
Makes HTTP call via ctx.http
    ↓
Carrier API responds
    ↓
Response body is stored as `raw`
    ↓
Adapter maps carrier response → canonical response
    ↓
Your Response (with `raw` preserved)
```

### Common Debug Scenarios

#### Scenario: "The `raw` field looks wrong"

1. Enable `HTTP_DEBUG=1` and `HTTP_DEBUG_FULL=1`
2. Restart and make the request again
3. Check the logs for the actual HTTP response
4. Compare with what you see in the `raw` field
5. If they differ, the adapter is transforming the response (check `mapper.ts`)

**Example log output:**

```
[dev-server] {...,"msg":"← 200 OK","body":{"id":"parcel-123","status":"created"}}
```

This exact body becomes the `raw` field.

#### Scenario: "The `raw` field is empty"

This usually means:
1. **Invalid credentials** — The most common cause! If you're using test credentials (`apiKey: "test-key"`, `basicUsername: "user"`, `basicPassword: "pass"`), the Foxpost test API will reject them and return an error
2. The carrier returned an error response (check the `status` field and HTTP logs)
3. The adapter filtered the response (check `mapper.ts`)

**Solution — Check Your Credentials:**
- Are you using placeholder test credentials? The Foxpost API requires **real Foxpost test account credentials**
- Get valid test credentials from your Foxpost account
- Update `.env` with real credentials:
  ```env
  FOXPOST_API_KEY=your-real-test-api-key
  FOXPOST_USE_TEST_API=true
  ```
- Restart the dev server
- Make another request; the `raw` field should now have real data from Foxpost

**Solution — Debug the Actual Error:**
- Enable `HTTP_DEBUG_FULL=1` to see the actual HTTP response from the carrier:
  ```env
  LOG_LEVEL=debug
  HTTP_DEBUG=1
  HTTP_DEBUG_FULL=1
  ```
- Restart: `pnpm run dev`
- Make a request and look at the response body in the logs
- This shows you what the carrier actually returned
- If it's an error response, look for error codes or messages

**Solution — Test with Mock Mode:**
- If you don't have valid credentials yet, you can use mock data by leaving credentials empty
- The dev-server will use a test HTTP client that returns fabricated responses
- Example request without real credentials:
  ```json
  {
    "parcel": {...},
    "credentials": null,  // or omit entirely
    "options": { "useTestApi": true }
  }
  ```

#### Scenario: "I want to extract something from `raw` but it's not there"

1. Check the carrier's API documentation
2. Enable `HTTP_DEBUG_FULL=1` and see the full response
3. If the data is in the carrier response but not in `raw`, the adapter may be filtering it
4. Check `packages/adapters/<carrier>/src/mapper.ts` to see what's being included

## Security Considerations

### Sensitive Data in `raw`

The `raw` field may contain sensitive data:
- API keys (if the carrier echoes them back)
- Personal information (names, addresses, phone numbers)
- Payment information (credit card last 4 digits, etc.)
- Credentials or authentication tokens

**Best practices:**

1. **Don't log `raw` to console in production**
   ```javascript
   // WRONG for production
   console.log(response.raw);

   // RIGHT: Only log specific fields
   console.log({ carrierId: response.carrierId, status: response.status });
   ```

2. **Encrypt `raw` when stored**
   ```javascript
   // Store raw response encrypted
   await db.shipments.update(shipmentId, {
     carrierRawResponse: encrypt(response.raw),
     timestamp: new Date()
   });
   ```

3. **Sanitize before external communication**
   ```javascript
   // Don't send raw to third-party services
   // Only send normalized fields
   await externalService.report({
     carrierId: response.carrierId,
     status: response.status,
     timestamp: new Date()
   });
   ```

4. **Use `HTTP_DEBUG_FULL` carefully**
   - Only enable in development
   - Never enable in production
   - Be aware it logs full request/response bodies including sensitive data

## Real-World Examples

### Example 1: Extracting Carrier-Specific Pricing

Shopickup normalizes rates to a canonical format, but the carrier might return detailed pricing breakdown in `raw`:

```javascript
const response = await adapter.createRate(shipment, ctx);

// Normalized rate (canonical)
console.log(response.amount); // "29.99"

// Carrier-specific pricing details (raw)
console.log(response.raw.priceBreakdown);
// {
//   "baseFare": 20.00,
//   "fuelSurcharge": 2.50,
//   "insuranceFee": 3.00,
//   "taxesAndFees": 4.49,
//   "total": 29.99
// }

// Use carrier details in your business logic
const fuelSurchargePercentage = (response.raw.fuelSurcharge / response.raw.baseFare) * 100;
```

### Example 2: Handling Carrier-Specific Errors

When the adapter returns a `CarrierError`, the `raw` field may contain carrier-specific error details:

```javascript
try {
  const response = await adapter.createLabel(parcelId, ctx);
} catch (error) {
  // Shopickup error (normalized)
  console.log(error.message); // "Validation error: Invalid address"
  console.log(error.category); // "Validation"

  // Carrier-specific error details (raw)
  console.log(error.raw);
  // {
  //   "code": "ADDRESS_VALIDATION_FAILED",
  //   "details": {
  //     "field": "postalCode",
  //     "value": "99999",
  //     "reason": "Invalid postal code for country HU"
  //   }
  // }

  // Use carrier details for more specific error handling
  if (error.raw?.details?.field === "postalCode") {
    // Show user: "Please check the postal code"
  }
}
```

### Example 3: Audit Trail

Store `raw` for compliance and troubleshooting:

```javascript
const response = await adapter.createLabel(parcelId, ctx);

// Save audit record
await db.auditLog.create({
  shipmentId,
  parcelId,
  action: "CREATE_LABEL",
  carrierResponse: response.raw,  // Full carrier data
  timestamp: new Date(),
  userId: currentUser.id
});

// Later, if there's a dispute or issue:
const audit = await db.auditLog.get(shipmentId);
console.log("Original carrier response:", audit.carrierResponse);
// This proves what the carrier actually said at the time
```

## Troubleshooting

### Q: The `raw` field is null/undefined

**A:** This might indicate:
1. Test mode is returning empty/null responses (check mock client)
2. The carrier returned an error (check `status` field)
3. The adapter is filtering it out (check `mapper.ts`)

Enable `HTTP_DEBUG_FULL=1` to see the actual HTTP response.

### Q: The `raw` field looks truncated or incomplete

**A:** If you're using `HTTP_DEBUG_FULL=1`, logs may truncate large responses. Check the actual network response in your browser's dev tools or with tools like `curl -v`.

### Q: Different data in `raw` for same request in test vs production mode

**A:** This is expected and correct. Test mode returns mock data; production mode returns real carrier data. The structure may also differ.

### Q: How do I know if I'm in test mode?

**A:** Check your `.env` file:
- If `FOXPOST_USE_TEST_API=true` → test mode
- If `FOXPOST_USE_TEST_API=false` + `FOXPOST_API_KEY` is set → production mode
- If `FOXPOST_API_KEY` is empty → test mode (default)

Or check the response; mock data is obviously fabricated (e.g., `trackingNumber: "MOCK123456789"`).

### Q: The `raw` field has different structure than the carrier's API docs

**A:** The adapter's mapper may be transforming the response. Check:
1. The actual HTTP response (enable `HTTP_DEBUG_FULL=1`)
2. The adapter's mapper: `packages/adapters/<carrier>/src/mapper.ts`
3. The adapter's client: `packages/adapters/<carrier>/src/client.ts`

The `raw` field should match what the carrier's API actually returned.

## Next Steps

- Read [README.md](./README.md) for quick start and environment configuration
- Review adapter source: `packages/adapters/foxpost/src/`
- Check out adapter tests: `packages/adapters/foxpost/tests/`
- Explore core types: `packages/core/src/types/`
