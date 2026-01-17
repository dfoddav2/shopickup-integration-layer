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

## Testing

Run the test suite:

```bash
npm run test --workspace=@shopickup/adapters-foxpost
```

### Unit Tests
Tests mapper functions without HTTP calls:
```bash
npm run test -- --testNamePattern="Mapper"
```

### Integration Tests
Tests full workflows with mock HTTP client:
```bash
npm run test -- --testNamePattern="Integration"
```

### Contract Tests
Tests against Prism mock server (requires Docker):
```bash
# Start Prism mock server
docker run --rm -p 3456:4010 -v $(pwd)/carrier-docs/hu-foxpost:/etc/swagger stoplight/prism-cli mock -h 0.0.0.0 /etc/swagger/hu-foxpost.openapi.yaml

# Run tests
npm run test -- --testNamePattern="Contract"
```

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
**Last Updated:** January 2024
