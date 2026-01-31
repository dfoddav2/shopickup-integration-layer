# GLS Label Creation

This document describes the GLS label creation capability for the Shopickup adapter.

## Overview

The GLS adapter supports label generation via the `CREATE_LABEL` capability. Labels are PDF documents generated from previously created parcels.

### Important Notes

- **HU-Specific**: This implementation is optimized for Hungary. Other countries (CZ, HR, RO, SI, SK, RS) may require adjustments.
- **Stateless**: The adapter does not store PDF files. Integrators must handle storage and URL generation.
- **Two-Step Process**: Labels require parcels to exist first. Create parcels via `CREATE_PARCELS`, then labels via `CREATE_LABEL`.

## Prerequisites

1. **GLS Account**: Active MyGLS account with label printing permissions
2. **Credentials**: MyGLS username, SHA512-hashed password, and client number(s)
3. **Existing Parcels**: Parcel IDs from a prior `CREATE_PARCELS` call

## API Flow

### Step 1: Create Parcels

First, create one or more parcels:

```typescript
import { GLSAdapter } from '@shopickup/adapters-gls';
import { createAxiosHttpClient } from '@shopickup/core/http/axios-client';

const adapter = new GLSAdapter();
const httpClient = createAxiosHttpClient();

const parcelResponse = await adapter.createParcels({
  parcels: [
    {
      id: 'ORDER-001',
      weight: 1200, // grams
      sender: {
        name: 'Sender Co',
        street: 'Main St 1',
        city: 'Budapest',
        postalCode: '1011',
        country: 'HU',
      },
      recipient: {
        name: 'John Doe',
        street: 'Delivery St 42',
        city: 'Szeged',
        postalCode: '6720',
        country: 'HU',
      },
    },
  ],
  credentials: {
    username: 'integration@example.com',
    password: 'myPassword123', // Will be SHA512-hashed internally
    clientNumberList: [12345],
  },
}, {
  http: httpClient,
  logger: console,
});

// Results contain parcel IDs
const parcelIds = parcelResponse.results.map(r => r.carrierId);
// parcelIds = ['GLS-98765']
```

### Step 2: Create Labels

Then, retrieve label PDFs using the parcel IDs:

```typescript
const labelResponse = await adapter.createLabel({
  parcelCarrierId: parcelIds[0], // 'GLS-98765'
  credentials: {
    username: 'integration@example.com',
    password: 'myPassword123',
    clientNumberList: [12345],
  },
}, {
  http: httpClient,
  logger: console,
});

// Response contains PDF bytes and metadata
console.log(labelResponse.results[0].status); // 'created'
console.log(labelResponse.rawCarrierResponse); // Buffer with PDF data
```

### Batch Processing

For multiple labels:

```typescript
const batchLabelResponse = await adapter.createLabels({
  parcelCarrierIds: ['GLS-98765', 'GLS-98766', 'GLS-98767'],
  credentials: {
    username: 'integration@example.com',
    password: 'myPassword123',
    clientNumberList: [12345],
  },
}, {
  http: httpClient,
  logger: console,
});

// Successful labels in results array
console.log(batchLabelResponse.results);
// [
//   { inputId: 'GLS-98765', status: 'created', fileId: 'gls-label-98765', ... },
//   { inputId: 'GLS-98766', status: 'created', fileId: 'gls-label-98766', ... },
//   { inputId: 'GLS-98767', status: 'created', fileId: 'gls-label-98767', ... },
// ]

// PDF bytes for all labels combined
const pdfBuffer = batchLabelResponse.rawCarrierResponse;
```

## Response Format

The label creation response follows this structure:

```typescript
interface CreateLabelsResponse {
  files: [
    {
      id: string;                    // File identifier
      contentType: 'application/pdf';
      byteLength: number;            // PDF size in bytes
      pages: number;                 // Number of pages
      orientation: 'portrait';
      metadata: {
        glsParcelId: string;
        clientReference: string;
        parcelNumber: string;
        pin?: string;                // For parcel locker service (LRS)
      };
    }
  ];
  results: [
    {
      inputId: string;               // Original parcel ID
      status: 'created' | 'failed';
      fileId?: string;               // Reference to files array
      carrierId?: string;            // GLS parcel ID
      errorMessage?: string;         // Error description if failed
      errorCode?: string;            // GLS error code if failed
    }
  ];
  successCount: number;              // Number of successful labels
  failureCount: number;              // Number of failed labels
  totalCount: number;
  allSucceeded: boolean;
  allFailed: boolean;
  someFailed: boolean;
  summary: string;                   // Human-readable summary
  rawCarrierResponse: Buffer;        // PDF bytes for integrator storage
}
```

## Handling PDF Bytes

The adapter returns raw PDF bytes in `rawCarrierResponse`. The integrator must:

1. **Extract bytes**:
   ```typescript
   const pdfBuffer = labelResponse.rawCarrierResponse as Buffer;
   ```

2. **Store/Upload** (not performed by adapter):
   ```typescript
   // Example: Upload to S3
   const s3Url = await storage.upload(pdfBuffer, 'labels/batch-001.pdf');
   
   // Example: Save to filesystem
   await fs.promises.writeFile('/tmp/labels.pdf', pdfBuffer);
   ```

3. **Update metadata** (optional):
   ```typescript
   labelResponse.files?.forEach(file => {
     file.url = s3Url;
   });
   ```

4. **Return to client**:
   ```typescript
   return {
     ...labelResponse,
     // files now contain URLs if you added them above
   };
   ```

## Error Handling

Errors can occur at different levels:

### Request Validation

```typescript
try {
  await adapter.createLabels({
    parcelCarrierIds: [], // Empty array
    credentials: { /* ... */ },
  }, ctx);
} catch (error) {
  // CarrierError: 'parcelCarrierIds array cannot be empty'
  // Category: 'Validation'
}
```

### Authentication

```typescript
try {
  await adapter.createLabels({
    parcelCarrierIds: ['GLS-98765'],
    credentials: {
      username: 'bad@example.com',
      password: 'wrongPassword',
      clientNumberList: [12345],
    },
  }, ctx);
} catch (error) {
  // CarrierError: 'GLS authentication failed'
  // Category: 'Permanent' (will not retry)
}
```

### Partial Failures

When some labels succeed and others fail:

```typescript
const response = await adapter.createLabels({
  parcelCarrierIds: ['GLS-OK', 'GLS-BAD', 'GLS-OK2'],
  credentials: { /* ... */ },
}, ctx);

// Response includes both successes and failures
console.log(response.successCount);  // 2
console.log(response.failureCount);  // 1
console.log(response.someFailed);    // true

// Per-item results show which failed
response.results.forEach(result => {
  if (result.status === 'failed') {
    console.log(`Failed: ${result.inputId} - ${result.errorMessage}`);
  }
});
```

## Printer Types

The adapter defaults to `Thermo` (thermal printer). Other supported types:

| Type | Description |
|------|-------------|
| `A4_2x2` | A4 paper, 2×2 labels per page |
| `A4_4x1` | A4 paper, 4×1 labels per page |
| `Connect` | GLS Connect label printer |
| `Thermo` | Standard thermal printer (default) |
| `ThermoZPL` | Zebra thermal printer (ZPL format) |
| `ShipItThermoPdf` | ShipIt thermal PDF format |
| `ThermoZPL_300DPI` | Zebra thermal 300 DPI |

To customize:

```typescript
const response = await adapter.createLabels({
  parcelCarrierIds: ['GLS-98765'],
  credentials: { /* ... */ },
  options: {
    printerType: 'A4_2x2', // Customize printer
  },
}, ctx);
```

## Services

Label creation inherits services from parcel creation. Common services:

- **COD** (Cash on Delivery): Amount to collect
- **AOS** (Signature on Delivery): Require signature
- **SMS** (SMS Notification): Notify recipient
- **INS** (Insurance): Declared value protection
- **PSD** (Parcel Shop Delivery): Deliver to parcel shop
- **ADR** (Dangerous Goods): ADR label required

Services are set during parcel creation and carried through to labels.

## Testing

### With Prism Mock Server

Start Prism with the GLS OpenAPI spec:

```bash
npm install -g @stoplight/prism-cli
prism mock carrier-docs/hu-gls/hu-gls.openapi.yaml -p 3456
```

Then test against the mock:

```typescript
const adapter = new GLSAdapter();
const httpClient = createAxiosHttpClient({
  baseUrl: 'http://localhost:3456',
});

// All requests will use the mock server
const response = await adapter.createLabels({
  parcelCarrierIds: ['GLS-MOCK-001'],
  credentials: { /* ... */ },
}, {
  http: httpClient,
  logger: console,
});
```

### Unit Tests

Run label tests:

```bash
pnpm --filter @shopickup/adapters-gls run test -- labels.spec.ts
```

## Country Support

### Hungary (HU) - Full Support ✅

All label features supported:

- Standard label formats
- Thermal printer output
- Parcel shop delivery (PSD)
- Parcel lockers (LRS) with PIN codes
- All service types

### Other Countries (CZ, HR, RO, SI, SK, RS)

Experimental support. May require:

- Service availability adjustments
- Field validation differences
- Country-specific error handling
- Regional printer settings

To use with other countries:

```typescript
await adapter.createLabels({
  parcelCarrierIds: ['GLS-98765'],
  credentials: { /* ... */ },
  options: {
    country: 'CZ', // Czech Republic
  },
}, ctx);
```

## Troubleshooting

### "Invalid address"

GLS requires specific address fields. Ensure:

- `name` is provided
- `street` is provided
- `city` is provided
- `postalCode` is provided
- `countryIsoCode` is 2-letter ISO code (HU, CZ, etc.)

### "Unauthorized"

Password hashing must be correct. The adapter automatically SHA512-hashes the password, but ensure:

- Password is provided before hashing
- Username matches GLS account
- Client number is valid for the account

### "Parcel not found"

The `parcelCarrierId` must be from a successful `CREATE_PARCELS` call:

```typescript
// First create parcel
const parcelResp = await adapter.createParcels({
  parcels: [/* ... */],
  credentials: { /* ... */ },
}, ctx);

// Get the carrier ID from response
const carrierId = parcelResp.results[0].carrierId;

// Then use it for labels
await adapter.createLabels({
  parcelCarrierIds: [carrierId],
  credentials: { /* ... */ },
}, ctx);
```

## API Reference

### GLSAdapter.createLabel()

Create a single label PDF.

```typescript
async createLabel(
  req: {
    parcelCarrierId: string;
    credentials: {
      username: string;
      password: string;
      clientNumberList: number[];
      webshopEngine?: string;
    };
    options?: {
      country?: string;           // ISO country code (default: 'HU')
      useTestApi?: boolean;       // Use test endpoint (default: false)
      printerType?: string;       // Printer type (default: 'Thermo')
    };
  },
  ctx: AdapterContext
): Promise<CreateLabelsResponse>
```

### GLSAdapter.createLabels()

Create multiple label PDFs in batch.

```typescript
async createLabels(
  req: {
    parcelCarrierIds: string[];
    credentials: {
      username: string;
      password: string;
      clientNumberList: number[];
      webshopEngine?: string;
    };
    options?: {
      country?: string;           // ISO country code (default: 'HU')
      useTestApi?: boolean;       // Use test endpoint (default: false)
      printerType?: string;       // Printer type (default: 'Thermo')
    };
  },
  ctx: AdapterContext
): Promise<CreateLabelsResponse>
```

## Changelog

### v1.0.0 (2025-01-31)

- Initial label creation support
- PrintLabels endpoint integration
- PDF bytes returned in `rawCarrierResponse`
- Per-label metadata in `files` array
- Partial failure handling
- HU-focused implementation with experimental multi-country support
