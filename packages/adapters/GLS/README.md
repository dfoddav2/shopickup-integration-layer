# GLS Adapter for Shopickup

[![npm version](https://img.shields.io/npm/v/@shopickup/adapters-gls)](https://www.npmjs.com/package/@shopickup/adapters-gls)

GLS (GeneralLogisticsSystems) adapter for Shopickup integration layer. Provides access to GLS logistics services for Hungarian and Eastern European shipping.

## Features

### Phase 1: Pickup Points ✅ Complete
- **LIST_PICKUP_POINTS**: Fetch list of GLS pickup locations, parcel shops, and lockers
  - Public, unauthenticated API
  - 20+ countries supported
  - 3,608+ pickup points for Hungary
  - Real-time data from GLS network

### Phase 2: Parcel Creation ✅ Complete (HU-specific)
- **CREATE_PARCEL**: Create single parcel via GLS MyGLS API
- **CREATE_PARCELS**: Create multiple parcels in batch (up to 50 per request)
  - HTTP Basic authentication (SHA512-hashed passwords)
  - Partial failure support (per-parcel status)
  - Hungary (HU) fully tested and supported
  - Other regions (CZ, HR, RO, SI, SK, RS) supported with caveats

### Phase 3: Label Generation ✅ Complete (HU-specific)
- **CREATE_LABEL**: Create single label via GLS MyGLS API
- **CREATE_LABELS**: Create multiple labels in batch
  - PDF format support
  - Parcel ID based retrieval
  - Hungary (HU) fully tested and supported

### Phase 4: Tracking ✅ Complete (HU-specific)
- **TRACK**: Track parcel status and events via GLS MyGLS API
  - Real-time status updates
  - Event timeline history
  - Hungary (HU) fully tested and supported

### Future: Advanced Features
- Modify COD (Cash on Delivery) amounts
- Close shipments for label generation
- Delete labels
- Advanced parcel modifications

## Installation

```bash
npm install @shopickup/adapters-gls @shopickup/core
```

## Quick Start

### Fetching Pickup Points

```typescript
import { GLSAdapter } from '@shopickup/adapters-gls';
import { createAxiosHttpClient } from '@shopickup/core/http';

const adapter = new GLSAdapter();
const httpClient = createAxiosHttpClient();

// Fetch Hungarian pickup points
const response = await adapter.fetchPickupPoints(
  {
    credentials: { country: 'hu' },
    options: { country: 'hu' },
  },
  { http: httpClient, logger: console }
);

console.log(`Found ${response.summary.totalCount} pickup points`);
response.points.forEach(point => {
  console.log(`${point.name}: ${point.city}`);
});
```

### Creating Parcels

```typescript
// Create a single parcel
const result = await adapter.createParcel(
  {
    parcel: {
      id: 'ORDER-001',
      shipper: {
        contact: { name: 'Seller Inc', phone: '+36123456', email: 'seller@co.hu' },
        address: { street: 'Main St 1', city: 'Budapest', postalCode: '1012', country: 'HU' }
      },
      recipient: {
        contact: { name: 'Customer', phone: '+36987654', email: 'customer@co.hu' },
        delivery: {
          method: 'HOME',
          address: { street: 'Main St 5', city: 'Debrecen', postalCode: '4025', country: 'HU' }
        }
      },
      package: { weightGrams: 2500, dimensionsCm: { length: 30, width: 20, height: 15 } },
      service: 'standard'
    },
    credentials: {
      username: 'integration@mygls.hu',
      password: 'myPassword123',
      clientNumberList: [12345]
    },
    options: { country: 'HU', useTestApi: false }
  },
  { http: httpClient, logger: console }
);

console.log(`Created parcel: ${result.carrierId}`);
```

## Regional Support

| Region | Status | Tested | Notes |
|--------|--------|--------|-------|
| 🇭🇺 Hungary (HU) | ✅ Primary | Yes | Fully tested and supported |
| 🇨🇿 Czech Republic (CZ) | ⚠️ Secondary | No | May work with adjustments |
| 🇭🇷 Croatia (HR) | ⚠️ Secondary | No | May work with adjustments |
| 🇷🇴 Romania (RO) | ⚠️ Secondary | No | May work with adjustments |
| 🇸🇮 Slovenia (SI) | ⚠️ Secondary | No | May work with adjustments |
| 🇸🇰 Slovakia (SK) | ⚠️ Secondary | No | May work with adjustments |
| 🇷🇸 Serbia (RS) | ⚠️ Secondary | No | Requires senderIdentityCardNumber |

**Important**: The parcel creation features are HU (Hungary) specific. While the GLS MyGLS API supports other countries, this adapter has only been tested for Hungary. Other regions may require:
- Adjusted service codes
- Country-specific address validation
- Special required fields (e.g., Serbia)
- Regional endpoint configuration

See [PARCELS.md](./docs/PARCELS.md) for detailed regional information.

## Capabilities

| Capability | Status | Methods |
|------------|--------|---------|
| `LIST_PICKUP_POINTS` | ✅ Implemented | `fetchPickupPoints()` |
| `CREATE_PARCEL` | ✅ Implemented | `createParcel()` |
| `CREATE_PARCELS` | ✅ Implemented | `createParcels()` |
| `CREATE_LABEL` | ✅ Implemented | `createLabel()` |
| `CREATE_LABELS` | ✅ Implemented | `createLabels()` |
| `TRACK` | ✅ Implemented | `track()` |

## API Documentation

### Public Pickup Points (Unauthenticated)
- **Endpoint**: `https://map.gls-hungary.com/data/deliveryPoints/{country}.json`
- **Countries**: 20+ (AT, BE, BG, CZ, DE, DK, ES, FI, FR, GR, HR, HU, IT, LU, NL, PL, PT, RO, SI, SK, RS)
- **Auth**: None required
- **Rate Limit**: None documented
- **Response**: JSON with pickup point array

### MyGLS API (Authenticated)
- **Endpoints**: Regional (HU, CZ, HR, RO, SI, SK, RS)
- **Auth**: HTTP Basic with SHA512-hashed password
- **Operations**: Parcel creation, label generation, tracking, etc.
- **Batch Size**: Max 50 parcels per request
- **Rate Limit**: Check GLS documentation

## Configuration

### HTTP Client
Choose appropriate HTTP client for your environment:

```typescript
// Node.js (recommended)
import { createAxiosHttpClient } from '@shopickup/core/http/axios-client';
const httpClient = createAxiosHttpClient({ debug: true });

// Node 18+ or browser
import { createFetchHttpClient } from '@shopickup/core/http/fetch-client';
const httpClient = createFetchHttpClient();
```

### Credentials
Pass credentials at runtime (never store in adapter):

```typescript
const credentials = {
  username: process.env.GLS_USERNAME,        // MyGLS email
  password: process.env.GLS_PASSWORD,        // Plain password (hashed by adapter)
  clientNumberList: [parseInt(process.env.GLS_CLIENT_NUMBER)],
  webshopEngine: 'my-shop/1.0'               // Optional identifier
};
```

### Test vs Production
```typescript
// Production
options: { country: 'HU', useTestApi: false }
// → https://api.mygls.hu/ParcelService.svc

// Testing/Development
options: { country: 'HU', useTestApi: true }
// → https://api.test.mygls.hu/ParcelService.svc
```

## Code Architecture

The adapter is organized by capability for maintainability:

```
packages/adapters/GLS/src/
├── capabilities/
│   ├── index.ts              # Clean exports
│   ├── pickup-points.ts      # fetchPickupPoints()
│   ├── parcels.ts            # createParcel(), createParcels()
│   ├── labels.ts             # createLabel(), createLabels()
│   └── tracking.ts           # track()
├── mappers/                  # Data transformation
├── validation/               # Request/response validation
├── types/                    # TypeScript interfaces
├── utils/                    # Authentication, URL resolution
└── tests/                    # Unit tests (84+ tests)
```

## Documentation

- **[PARCELS.md](./docs/PARCELS.md)** - Comprehensive guide for parcel creation (CREATE_PARCEL, CREATE_PARCELS)
- **[LABELS.md](./docs/LABELS.md)** - Comprehensive guide for label generation (CREATE_LABEL, CREATE_LABELS)
- **[TRACKING.md](./docs/TRACKING.md)** - Comprehensive guide for parcel tracking (TRACK)
- **[OpenAPI Spec](../../carrier-docs/hu-gls/hu-gls.openapi.yaml)** - Full GLS API specification

## Error Handling

The adapter throws `CarrierError` with categorized errors:

```typescript
import { CarrierError } from '@shopickup/core';

try {
  const result = await adapter.createParcels(req, ctx);
} catch (err) {
  if (err instanceof CarrierError) {
    switch (err.category) {
      case 'Validation':  // Invalid input
        console.error('Fix your request:', err.message);
        break;
      case 'Auth':        // Auth failed
        console.error('Check credentials:', err.message);
        break;
      case 'Permanent':   // Unrecoverable
        console.error('Fatal error:', err.message);
        break;
      case 'Transient':   // Retry-able
        console.error('Temporary issue, retry:', err.message);
        break;
    }
  }
}
```

## Testing

```bash
# Run unit tests
pnpm --filter @shopickup/adapters-gls run test

# Build adapter
pnpm --filter @shopickup/adapters-gls run build
```

## License

Proprietary - GLS. Adapter licensed under the Shopickup project license.

## Support

For GLS API support, contact GLS Customer Support: https://www.gls-group.eu

For Shopickup adapter issues, see project documentation.
