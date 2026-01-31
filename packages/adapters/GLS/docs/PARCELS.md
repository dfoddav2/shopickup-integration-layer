# GLS Adapter - Parcel Creation Guide

## Overview

This guide documents the GLS Adapter's parcel creation capabilities (Phase 2: `CREATE_PARCEL` and `CREATE_PARCELS`).

**IMPORTANT: This implementation is Hungary (HU) specific.**

The GLS MyGLS API supports multiple Eastern European countries (CZ, HR, RO, SI, SK, RS), but this adapter has been tested and optimized for Hungary. Other countries may require:
- Adjusted service codes and parameters
- Country-specific address validation rules
- Additional required fields (e.g., Serbia requires `senderIdentityCardNumber`)
- Regional endpoint configuration

## Regional Support Matrix

| Country | Status | Tested | Regional Endpoint | Notes |
|---------|--------|--------|-------------------|-------|
| **HU** (Hungary) | ✅ Primary | Yes | `https://api.mygls.hu/ParcelService.svc` | Fully tested and supported |
| **CZ** (Czech Republic) | ⚠️ Secondary | No | `https://api.mygls.cz/ParcelService.svc` | May work, not officially tested |
| **HR** (Croatia) | ⚠️ Secondary | No | `https://api.mygls.hr/ParcelService.svc` | May work, not officially tested |
| **RO** (Romania) | ⚠️ Secondary | No | `https://api.mygls.ro/ParcelService.svc` | May work, not officially tested |
| **SI** (Slovenia) | ⚠️ Secondary | No | `https://api.mygls.si/ParcelService.svc` | May work, not officially tested |
| **SK** (Slovakia) | ⚠️ Secondary | No | `https://api.mygls.sk/ParcelService.svc` | May work, not officially tested |
| **RS** (Serbia) | ⚠️ Secondary | No | `https://api.mygls.rs/ParcelService.svc` | Requires `senderIdentityCardNumber` (ID card/PIB) |

## Capabilities

### `CREATE_PARCEL`
Creates a single parcel in the GLS system.

- **Input**: `CreateParcelRequest` with single `Parcel`
- **Output**: `CarrierResource` with generated `carrierId` (parcel ID)
- **Internal**: Delegates to `createParcels` for batch processing

### `CREATE_PARCELS`
Creates multiple parcels in a single API call (batch operation).

- **Input**: `CreateParcelsRequest` with array of `Parcel[]`
- **Output**: `CreateParcelsResponse` with per-parcel results and summary statistics
- **Max Batch Size**: 50 parcels per request (enforced by GLS API)
- **Partial Failures**: Supported - returns individual success/failure status for each parcel

## Authentication

The GLS MyGLS API uses **HTTP Basic Authentication** with **SHA512-hashed passwords**.

### Password Hashing Flow

```
Plain Password
    ↓
SHA512 Hash → Hex String
    ↓
Base64 Encode (with username)
    ↓
Authorization Header: "Basic base64(username:sha512_hash)"
```

### Example

```typescript
import { hashPasswordSHA512, createGLSAuthHeader } from '@shopickup/adapters-gls/utils';

const password = "myPassword123";
const hashedPassword = hashPasswordSHA512(password);
// hashedPassword = "c26ad2c296744...8a" (hex string)

const headers = createGLSAuthHeader("user@example.com", hashedPassword);
// headers = {
//   Authorization: "Basic dXNlckBleGFtcGxlLmNvbTpjMjZhZDJjMjk2Nz..."
// }
```

### Credentials Object

```typescript
interface GLSCredentials {
  username: string;           // MyGLS email address
  password: string;           // Plain text (hashed by adapter)
  clientNumberList: number[]; // GLS account numbers
  webshopEngine?: string;     // Optional identifier
}
```

## Usage Examples

### Creating a Single Parcel

```typescript
import { GLSAdapter } from '@shopickup/adapters-gls';
import { createAxiosHttpClient } from '@shopickup/core/http';

const adapter = new GLSAdapter();
const httpClient = createAxiosHttpClient();

const result = await adapter.createParcel(
  {
    parcel: {
      id: 'ORDER-001',
      shipper: {
        contact: {
          name: 'Company Name',
          phone: '+36 1 111 1111',
          email: 'sender@company.com',
        },
        address: {
          street: 'Sender Street',
          city: 'Budapest',
          postalCode: '1012',
          country: 'HU',
        },
      },
      recipient: {
        contact: {
          name: 'Customer Name',
          phone: '+36 1 222 2222',
          email: 'customer@example.com',
        },
        delivery: {
          method: 'HOME',
          address: {
            street: 'Customer Street',
            city: 'Debrecen',
            postalCode: '4025',
            country: 'HU',
          },
        },
      },
      package: {
        weightGrams: 2500,
        dimensionsCm: {
          length: 30,
          width: 20,
          height: 15,
        },
      },
      service: 'standard',
    },
    credentials: {
      username: 'integration@mygls.hu',
      password: 'myPassword123',
      clientNumberList: [12345],
    },
    options: {
      country: 'HU',
      useTestApi: false, // Set to true for testing
    },
  },
  {
    http: httpClient,
    logger: console,
  }
);

console.log(result.carrierId);  // GLS parcel ID
console.log(result.status);     // "created"
```

### Creating Multiple Parcels (Batch)

```typescript
const response = await adapter.createParcels(
  {
    parcels: [
      { id: 'ORDER-001', shipper: {...}, recipient: {...}, package: {...}, service: 'standard' },
      { id: 'ORDER-002', shipper: {...}, recipient: {...}, package: {...}, service: 'express' },
      { id: 'ORDER-003', shipper: {...}, recipient: {...}, package: {...}, service: 'standard' },
    ],
    credentials: {
      username: 'integration@mygls.hu',
      password: 'myPassword123',
      clientNumberList: [12345],
    },
    options: {
      country: 'HU',
      useTestApi: false,
    },
  },
  {
    http: httpClient,
    logger: console,
  }
);

console.log(response.totalCount);    // 3
console.log(response.successCount);  // 3
console.log(response.failureCount);  // 0
console.log(response.summary);       // "All 3 parcels created successfully"

// Per-parcel results
response.results.forEach((result, idx) => {
  if (result.status === 'created') {
    console.log(`Parcel ${idx}: ${result.carrierId}`);
  } else {
    console.log(`Parcel ${idx}: Failed`, result.errors);
  }
});
```

### Handling Partial Failures

```typescript
if (response.someFailed) {
  const failures = response.results.filter(r => r.status === 'failed');
  
  failures.forEach((failed) => {
    console.error('Failed parcel:', failed.raw);
    if (failed.errors) {
      failed.errors.forEach(err => {
        console.error(`  ${err.field}: ${err.message}`);
      });
    }
  });
}
```

### Using with COD (Cash on Delivery)

```typescript
// For now, COD is passed via options or special handling
// Currently the mapper doesn't automatically set COD from canonical Parcel
// This may be enhanced in future versions to support:
// parcel.cod = { amount: 50.00, currency: 'HUF', reference: 'COD-REF-001' }

// To create parcels with COD, you would need custom mapper logic
```

### Testing with Test API

Use `useTestApi: true` in options to test against GLS test environment:

```typescript
const result = await adapter.createParcel(
  {
    parcel: {...},
    credentials: {...},
    options: {
      country: 'HU',
      useTestApi: true,  // Uses https://api.test.mygls.hu/...
    },
  },
  { http: httpClient, logger: console }
);
```

## Address Mapping

Canonical `Address` objects are mapped to GLS address format:

### Input (Canonical)
```typescript
address: {
  name: "John Doe",
  street: "Main Street",
  houseNumber: "123",
  city: "Budapest",
  postalCode: "1011",
  country: "HU",
  contactName: "John",
  contactPhone: "+36 1 234 5678",
  contactEmail: "john@example.com"
}
```

### Output (GLS)
```typescript
{
  name: "John Doe",
  street: "Main Street",
  houseNumber: "123",
  city: "Budapest",
  zipCode: "1011",
  countryIsoCode: "HU",
  contactName: "John",
  contactPhone: "+36 1 234 5678",
  contactEmail: "john@example.com"
}
```

### Special Handling
- **Home Delivery**: Full address required
- **Pickup Point Delivery**: Address taken from pickup point details (if available)
- **House Number**: Numeric part only; additional info (Building, Apt) goes to `houseNumberInfo`

## Delivery Methods

### Home Delivery
```typescript
recipient: {
  contact: {...},
  delivery: {
    method: 'HOME',
    address: {
      street: '...',
      city: '...',
      postalCode: '...',
      country: 'HU'
    }
  }
}
```

### Pickup Point Delivery
```typescript
recipient: {
  contact: {...},
  delivery: {
    method: 'PICKUP_POINT',
    pickupPoint: {
      id: 'GLS-001',
      name: 'GLS ParcelShop Central',
      address: {...},  // Optional, extracted if available
      type: 'SHOP'
    }
  }
}
```

## Error Handling

### Error Categories

The adapter returns `CarrierError` with appropriate categories:

- **`Validation`**: Invalid input, missing required fields, unsupported country
- **`Auth`**: Authentication failed (401, 403)
- **`Permanent`**: HTTP client not provided, unrecoverable errors
- **`Transient`**: Network errors, server errors (500+), timeouts

### Example Error Handling

```typescript
import { CarrierError } from '@shopickup/core';

try {
  const result = await adapter.createParcels(req, ctx);
} catch (err) {
  if (err instanceof CarrierError) {
    if (err.category === 'Validation') {
      console.error('Invalid request:', err.message);
    } else if (err.category === 'Auth') {
      console.error('Authentication failed:', err.message);
    } else if (err.category === 'Transient') {
      console.error('Temporary error, retry later:', err.message);
    }
    
    // Access raw carrier response
    console.debug('Raw response:', err.raw);
  }
}
```

## Fields Mapping

### From Canonical `Parcel`

| Canonical | GLS | Notes |
|-----------|-----|-------|
| `parcel.id` | `clientReference` | Your reference for tracking |
| `parcel.shipper.address` | `pickupAddress` | Sender/pickup location |
| `parcel.recipient.delivery.address` | `deliveryAddress` | Recipient/delivery location |
| `parcel.package.weightGrams` | `parcelPropertyList[].weight` | Converted to kg (÷ 1000) |
| `parcel.package.dimensionsCm` | `parcelPropertyList[].{height,length,width}` | Dimensions in cm |
| `parcel.service` | (optional) | Could be mapped to GLS service codes in future |

### Not Yet Supported

- **COD (Cash on Delivery)**: Structure exists in GLS types but not automatically set from canonical
- **Services**: GLS supports many services (AOS, SMS, INS, etc.) but not yet mapped from canonical
- **Dangerous Goods (ADR)**: Requires special handling not yet implemented
- **Special Handling**: Fragile, perishables, etc.

## Testing

### Unit Tests

The adapter includes comprehensive unit tests:

```bash
pnpm --filter @shopickup/adapters-gls run test
```

Tests cover:
- Address mapping
- Dimensions mapping
- Parcel mapping
- Home delivery
- Pickup point delivery
- Edge cases (missing fields, lowercase countries, etc.)

### Contract Tests (Future)

Contract tests against GLS test API endpoint (when available):
```bash
# Not yet implemented - would use Prism mock server
```

## Troubleshooting

### "Invalid country code"
- Ensure country is 2-letter ISO 3166-1 code (e.g., "HU", not "Hungary")
- Check if country is in supported list (currently optimized for HU)

### "Authentication failed"
- Verify username (email) and password are correct
- Check that password is NOT already SHA512-hashed (adapter handles hashing)
- Ensure client numbers are valid GLS account numbers

### "Unsupported country: XY"
- This adapter is HU-specific for parcel creation
- Other countries may work but are not officially tested
- Check regional support matrix above

### "Missing required HTTP client"
- Ensure you pass `ctx.http` to the adapter method
- Use `createAxiosHttpClient()` or appropriate HTTP client for your environment

## Implementation Notes

### Design Decisions

1. **Batch Processing**: `createParcel` delegates to `createParcels` to avoid code duplication
2. **Stateless**: Adapter maintains no state; all configuration passed per-request
3. **Partial Failures**: Returns per-parcel status to allow integrators to handle mixed results
4. **Password Hashing**: Adapter hashes passwords internally; integrators pass plain text

### Future Enhancements

- [ ] Support for COD (cash on delivery) mapping
- [ ] Service code mapping (AOS, SMS, INS, etc.)
- [ ] Dangerous goods (ADR) support
- [ ] Multi-country regional validation
- [ ] Label generation (GetPrintData, PrintLabels endpoints)
- [ ] Tracking implementation (GetParcelInformation)
- [ ] Shipment management (CloseShipment, ModifyCOD)

## See Also

- [GLS Adapter - Pickup Points](./README.md#pickup-points)
- [GLS MyGLS API Specification](../../carrier-docs/hu-gls/hu-gls.openapi.yaml)
- [Shopickup Core Types](../../../packages/core/src/types/)
- [Foxpost Adapter Reference](../../foxpost/docs/PARCELS.md)
