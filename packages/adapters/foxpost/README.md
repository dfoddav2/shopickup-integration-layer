# @shopickup/adapters-foxpost

Shopickup adapter for **Foxpost** - a major Hungarian logistics carrier providing parcel delivery and pickup services.

## Features

- **CREATE_PARCEL** - Create parcels directly in Foxpost system
- **CREATE_LABEL** - Generate PDF shipping labels
- **TRACK** - Track parcel status and location

## Installation

```bash
npm install @shopickup/adapters-foxpost @shopickup/core
```

## Quick Start

```typescript
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";
import { executeCreateLabelFlow } from "@shopickup/core";

// Create adapter instance
const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");

// Define shipment and parcel
const shipment = {
  id: "order-123",
  sender: {
    name: "Your Company",
    street: "123 Business Ave",
    city: "Budapest",
    postalCode: "1011",
    country: "HU",
    phone: "+36301234567",
    email: "shipping@company.com",
  },
  recipient: {
    name: "Customer Name",
    street: "456 Main Street",
    city: "Debrecen",
    postalCode: "4024",
    country: "HU",
    phone: "+36302222222",
    email: "customer@example.com",
  },
  service: "standard",
  totalWeight: 1000, // grams
  reference: "ORD-12345",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const parcels = [
  {
    id: "parcel-1",
    weight: 1000, // grams
    dimensions: {
      length: 20, // cm
      width: 15,
      height: 10,
    },
  },
];

// Create labels
const result = await executeCreateLabelFlow({
  adapter,
  shipment,
  parcels,
  credentials: { apiKey: process.env.FOXPOST_API_KEY },
  context: {
    http: yourHttpClient, // axios, fetch, etc.
    logger: console,
  },
});

console.log("Tracking numbers:", result.parcelResources.map(r => r.carrierId));
console.log("Labels:", result.labelResources);
```

## Carrier-Specific Notes

### Parcel Sizing

Foxpost uses 5 size categories: `xs`, `s`, `m`, `l`, `xl`. The adapter automatically determines size based on parcel dimensions:

- **xs**: < 5 liters (5,000 cm³)
- **s**: 5-15 liters (5,000-15,000 cm³)
- **m**: 15-50 liters (15,000-50,000 cm³)
- **l**: 50-100 liters (50,000-100,000 cm³)
- **xl**: > 100 liters

If dimensions are not provided, defaults to **s** (small).

### Home Delivery (HD)

For home delivery parcels, these fields are **required**:
- `recipientCity`
- `recipientZip` (postal code)
- `recipientAddress` (street address)

### Metadata Support

Parcels can include optional metadata:

```typescript
parcel.metadata = {
  fragile: true,              // Mark as fragile
  comment: "Handle with care", // Add comment
  cod: 5000,                  // Cash on delivery (HUF)
};
```

### API Key Authentication

The Foxpost API uses header-based authentication:

```typescript
credentials: {
  apiKey: "your-foxpost-api-key"
}
```

### No Shipment Concept

Unlike many carriers, Foxpost doesn't have a shipment container concept. Parcels are created directly, and `CREATE_SHIPMENT` is not supported.

### Barcode Format

Foxpost barcodes follow the format: `CLFOX<numeric_code>`. Example: `CLFOX0000000001`

### Label Generation

Labels are generated in A7 format (approximately 7×10 cm) suitable for small parcel labels. The adapter returns base64-encoded PDF data that can be:

- Stored in a database
- Sent to a printer
- Embedded in shipping confirmations

```typescript
const label = result.labelResources[0];
if (label.labelUrl) {
  // Convert base64 back to binary and save/print
  const pdfBuffer = Buffer.from(label.labelUrl.split(",")[1], "base64");
  fs.writeFileSync("label.pdf", pdfBuffer);
}
```

### Tracking Status Codes

Foxpost tracking events are mapped to canonical statuses:

| Foxpost Status | Canonical Status |
|---|---|
| CREATE, PENDING | PENDING |
| OPERIN, OPEROUT, REDIRECT, SORTIN, SORTOUT, etc. | IN_TRANSIT |
| HDSENT, HDINTRANSIT, HDHUBOUT, HDCOURIER | OUT_FOR_DELIVERY |
| RECEIVE, RETURNED, COLLECTED | DELIVERED |
| HDUNDELIVERABLE, EXCEPTION, BACKLOGINFULL, MISSORT | EXCEPTION |
| HDRETURN, BACKTOSENDER | RETURNED |

## Environments

### Sandbox
```typescript
const adapter = new FoxpostAdapter("https://webapi-test.foxpost.hu");
```

### Production
```typescript
const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");
```

## Test Mode (useTestApi Option)

The Foxpost adapter supports switching between production and test API endpoints on a **per-call basis** using the `useTestApi` option. This is useful when testing your integration without affecting production data.

### How It Works

Foxpost has two separate API environments:
- **Production:** `https://webapi.foxpost.hu` - real shipments
- **Test/Sandbox:** `https://webapi-test.foxpost.hu` - test credentials required

### Using Test Mode

#### For `createParcel()` - Pass via request options:

```typescript
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";

const adapter = new FoxpostAdapter("https://webapi.foxpost.hu"); // Default prod

// Use test API for this call
const result = await adapter.createParcel!(
  "shipment-id",
  {
    shipment,
    parcel,
    credentials: { apiKey: process.env.FOXPOST_TEST_API_KEY },
    options: { useTestApi: true }  // ← Switch to test API
  },
  context
);
```

#### For `track()` and `createLabel()` - Pass via context:

```typescript
// Extend context with options (using 'as any' for now)
const ctx: AdapterContext = {
  http: yourHttpClient,
  logger: console,
  options: { useTestApi: true }  // ← Switch to test API
} as any;

const tracking = await adapter.track!("CLFOX0000000001", ctx);
const label = await adapter.createLabel!("parcel-123", ctx);
```

### Test Mode Example

```typescript
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";

// Create adapter pointing to production (or test - doesn't matter)
const adapter = new FoxpostAdapter("https://webapi.foxpost.hu");

// Test credentials
const testCredentials = {
  apiKey: process.env.FOXPOST_TEST_API_KEY
};

// Create parcel in test API
const parcelResult = await adapter.createParcel!(
  "test-shipment-1",
  {
    shipment: testShipment,
    parcel: testParcel,
    credentials: testCredentials,
    options: { useTestApi: true }  // Use test endpoint
  },
  context
);

console.log("Test parcel created:", parcelResult.carrierId);

// Track in test API
const trackingCtx = {
  http: context.http,
  logger: console,
  options: { useTestApi: true }
} as any;

const tracking = await adapter.track!(parcelResult.carrierId, trackingCtx);
console.log("Test tracking:", tracking.status);
```

### Important Notes

- **Separate Credentials:** Test and production APIs use different credentials. Ensure you have separate API keys for each environment.
- **No Data Sharing:** Test and production environments are completely isolated. Test shipments won't appear in production.
- **Mixed Calls:** You can mix test and production calls in the same session:
  ```typescript
  // Some calls to prod
  await adapter.createParcel!(id1, { credentials: prod, options: { useTestApi: false } }, ctx);
  
  // Some calls to test
  await adapter.createParcel!(id2, { credentials: test, options: { useTestApi: true } }, ctx);
  ```
- **Discovery:** Check for `TEST_MODE_SUPPORTED` capability to detect if an adapter supports this feature:
  ```typescript
  if (adapter.capabilities.includes("TEST_MODE_SUPPORTED")) {
    // Safe to use useTestApi option
  }
  ```

## Testing

The adapter includes comprehensive tests run from the monorepo root using **Vitest**.

### Test Structure

- **Unit Tests** (`src/tests/mapper.spec.ts`): 14 tests
  - Bidirectional mapping validation
  - Size category determination
  - Status code translation
  - Tracking event parsing
  - Test coverage: All mapper functions
  
- **Integration Tests** (`src/tests/integration.spec.ts`): 14 tests
  - Full workflows with mock HTTP client
  - Capability checking
  - Error handling
  - Store persistence (when provided)
  - Test mode (useTestApi option) behavior
  - Test coverage: Adapter methods + flow orchestration + test mode

- **Total:** 28 passing tests ✅

### Running Tests

```bash
# Run all tests (monorepo)
pnpm run test

# Run Foxpost adapter tests only
pnpm run test -- foxpost

# Watch mode (auto-rebuild + retest)
pnpm run test -- --watch

# Coverage report
pnpm run test:coverage

# Run specific test file
pnpm run test -- mapper.spec.ts
```

### Test Examples

**Mapper Test:**
```typescript
import { describe, it, expect } from "vitest";
import { mapToFoxpost } from "../mapper";

describe("Mapper", () => {
  it("should map address correctly", () => {
    const result = mapToFoxpost.address({
      name: "John Doe",
      street: "123 Main St",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
    });
    
    expect(result.name).toBe("John Doe");
    expect(result.city).toBe("Budapest");
  });
});
```

**Integration Test:**
```typescript
import { describe, it, expect } from "vitest";
import { FoxpostAdapter } from "../index";
import { MockHttpClient } from "@shopickup/core/testing";

describe("FoxpostAdapter", () => {
  it("should create a label", async () => {
    const adapter = new FoxpostAdapter("https://api.example.com");
    const mockHttp = new MockHttpClient();
    
    const result = await adapter.createLabel("parcel-123", {
      http: mockHttp,
      logger: console,
    });
    
    expect(result.carrierId).toBeDefined();
    expect(result.status).toBe("created");
  });
});
```

### Build-First Workflow

Tests run against compiled code in `dist/`, not TypeScript sources:

```bash
# 1. Build all packages
pnpm run build

# 2. Tests automatically run against dist/ output
pnpm run test
```

This ensures tests verify the same code that will be published.

## Limitations

- ❌ `CREATE_SHIPMENT` - Foxpost doesn't have shipments; parcels are independent
- ❌ `CLOSE_SHIPMENT` - Not applicable
- ❌ `VOID_LABEL` - Foxpost doesn't support label cancellation
- ❌ `PICKUP` - Not supported via API
- ❌ `RATES` - No rate quote API available

## Error Handling

The adapter throws `CarrierError` with categories for intelligent retry logic:

```typescript
try {
  await adapter.createParcel!(shipmentId, req, context);
} catch (err) {
  if (err instanceof CarrierError) {
    switch (err.category) {
      case "Validation":
        // Don't retry (400, missing fields, etc.)
        console.error("Fix and retry:", err.message);
        break;
      case "Auth":
        // Don't retry (401, 403)
        console.error("Check credentials:", err.message);
        break;
      case "RateLimit":
        // Retry with backoff
        await sleep(err.extra?.retryAfterMs || 60000);
        break;
      case "Transient":
        // Retry (network, 500, timeout)
        await sleep(1000);
        break;
    }
  }
}
```

## Configuration

### Base URL Configuration

```typescript
adapter.configure({ baseUrl: "https://webapi.foxpost.hu" });
```

### Custom HTTP Client

The adapter uses the injected HTTP client from context. You can customize behavior via middleware:

```typescript
import axios from "axios";

const axiosInstance = axios.create({
  timeout: 30000,
  headers: { "User-Agent": "MyApp/1.0" },
});

const context = {
  http: axiosInstance,
  logger: console,
};
```

## Support

For issues or questions:

- Check the [Foxpost API docs](https://webapi.foxpost.hu/docs)
- See the [Shopickup adapter development guide](../../docs/ADAPTER_DEVELOPMENT.md)
- Report bugs at [github.com/anomalyco/shopickup-integration-layer](https://github.com/anomalyco/shopickup-integration-layer)

## License

MIT

---

**Maintained by:** Shopickup Contributors  
**Last Updated:** January 2025
