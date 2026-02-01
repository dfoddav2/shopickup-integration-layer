# GLS Tracking Feature

## Overview

The GLS adapter provides comprehensive parcel tracking functionality using the MyGLS API's `GetParcelStatuses` endpoint. This allows integrators to retrieve the complete tracking history and current status of GLS parcels, including optional Proof of Delivery (POD) documents.

## Capabilities

### Track Parcel
Retrieve tracking information for a single parcel by its tracking number (parcel ID).

**Endpoint:** `GetParcelStatuses`

**Features:**
- Complete tracking event timeline (earliest to latest)
- Canonical status mapping (PENDING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION, RETURNED)
- Facility/location information for each event
- Optional Proof of Delivery (POD) document retrieval
- Support for multiple languages
- Test/sandbox mode support

## Request Format

```typescript
{
  trackingNumber: string;        // GLS parcel number (numeric string)
  credentials: {
    username: string;            // MyGLS API username
    password: string;            // MyGLS API password (plain text, adapter will hash)
    clientNumberList: number[];  // GLS client account numbers
  };
  options?: {
    useTestApi?: boolean;        // Use test API (default: false)
    returnPOD?: boolean;         // Request Proof of Delivery document (default: false)
    languageIsoCode?: string;    // Language code: EN, HU, CS, RO, SK, SL, HR (default: EN)
    country?: string;            // Country code for API endpoint (default: HU)
  };
}
```

## Response Format

```typescript
{
  trackingNumber: string;        // The tracked parcel number
  status: TrackingStatus;        // Current status: PENDING | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | EXCEPTION | RETURNED
  lastUpdate: Date | null;       // Timestamp of most recent tracking event
  events: TrackingEvent[];       // Timeline of all tracking events (chronologically sorted)
  rawCarrierResponse: {
    parcelNumber: number;        // GLS parcel ID
    clientReference?: string;    // Integrator's reference for the parcel
    deliveryCountryCode?: string; // Delivery destination country (ISO 3166-1)
    deliveryZipCode?: string;    // Delivery area zip code
    weight?: number;             // Parcel weight (nullable)
    parcelStatusList: ParcelStatus[];  // All status events from GLS
    pod?: Buffer | Uint8Array;   // Proof of Delivery PDF (if returnPOD=true and available)
    getParcelStatusErrors?: ErrorInfo[]; // Any GLS API errors
  };
}
```

### TrackingEvent Structure

```typescript
{
  timestamp: Date;               // When the event occurred
  status: TrackingStatus;        // Canonical status
  carrierStatusCode: string;     // GLS status code (1-420, see mapping below)
  location?: {
    city: string;                // Depot city
    facility: string;            // Depot/facility number
  };
  description: string;           // GLS status description
  raw: {
    statusCode: string;
    statusDate: Date;
    statusDescription: string;
    depotCity: string;
    depotNumber: string;
    statusInfo?: string;
  };
}
```

## Status Code Mapping

GLS provides detailed status codes (1-420) that are mapped to canonical `TrackingStatus` values:

### Common Status Codes

| Code | Meaning | Canonical Status |
|------|---------|------------------|
| 1 | Handed over to GLS | PENDING |
| 2 | Left parcel center | IN_TRANSIT |
| 3 | Reached parcel center | IN_TRANSIT |
| 4 | Expected delivery during day | OUT_FOR_DELIVERY |
| 5 | Delivered | DELIVERED |
| 8 | Ready for self-collection | OUT_FOR_DELIVERY |
| 23 | Returned to sender | RETURNED |
| 32 | Will be delivered in evening | OUT_FOR_DELIVERY |
| 40 | Returned to sender | RETURNED |
| 54 | Delivered to parcel box | DELIVERED |
| 55 | Delivered at ParcelShop | DELIVERED |
| 58 | Delivered at neighbor's | DELIVERED |

### Exception Status Codes

Exception statuses (codes 6-22, 24-31, 33-39, 41-122, etc.) map to `EXCEPTION` and represent:
- Delivery delays
- Address issues
- Customs holds
- Parcel damage
- Absence/refusal of recipient
- Weather conditions
- Sorting errors
- And other issues

See the complete mapping in `packages/adapters/GLS/src/mappers/tracking.ts` for all 70+ status codes.

## Proof of Delivery (POD)

### Requesting POD

To retrieve the Proof of Delivery document, set `returnPOD: true` in options:

```typescript
const response = await adapter.track({
  trackingNumber: '123456789',
  credentials: { /* ... */ },
  options: {
    returnPOD: true,
  },
});
```

### Accessing POD

The POD is returned in the `rawCarrierResponse.pod` field as a `Buffer` or `Uint8Array`:

```typescript
if (response.rawCarrierResponse?.pod) {
  const pdfBuffer = response.rawCarrierResponse.pod;
  // Upload to storage, display to user, etc.
}
```

### POD Formats

The adapter handles POD in multiple formats returned by GLS:
- Base64 string (automatically decoded to Buffer)
- Byte array (JSON number array, converted to Buffer)
- Uint8Array (converted to Buffer)
- Buffer (used as-is)

### Example: Upload POD to S3

```typescript
import AWS from 'aws-sdk';

const s3 = new AWS.S3();
const trackingResponse = await adapter.track({...});

if (trackingResponse.rawCarrierResponse?.pod) {
  const pdfBuffer = trackingResponse.rawCarrierResponse.pod;
  
  await s3.putObject({
    Bucket: 'my-shipping-bucket',
    Key: `tracking/${trackingResponse.trackingNumber}.pdf`,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
  }).promise();
}
```

### Example: Decode Dev-Server POD

The dev-server test route may return POD as base64. To decode:

```typescript
const response = await fetch('/api/dev/gls/track', { /* ... */ });
const data = await response.json();

if (data.rawCarrierResponse?.podBase64) {
  const pdfBuffer = Buffer.from(data.rawCarrierResponse.podBase64, 'base64');
  // Use buffer...
}
```

## Language Support

GLS supports status descriptions in multiple languages:

| Code | Language |
|------|----------|
| EN | English (default) |
| HU | Hungarian |
| CS | Czech |
| SK | Slovak |
| SL | Slovenian |
| RO | Romanian |
| HR | Croatian |

Example:

```typescript
const response = await adapter.track({
  trackingNumber: '123456789',
  credentials: { /* ... */ },
  options: {
    languageIsoCode: 'HU', // Request Hungarian descriptions
  },
});
```

## Test Mode

Use the test/sandbox API for development:

```typescript
const response = await adapter.track({
  trackingNumber: '123456789',
  credentials: { /* ... */ },
  options: {
    useTestApi: true,  // Uses https://api.test.mygls.hu/...
  },
});
```

## Error Handling

The adapter may throw `CarrierError` in these scenarios:

### Permanent Errors
- Invalid parcel number format
- Parcel not found
- Authentication failure
- Invalid credentials

### Transient Errors
- API temporarily unavailable (503)
- Network timeouts
- Rate limiting

### Validation Errors
- Missing required fields
- Invalid language code
- Missing credentials

Example error handling:

```typescript
try {
  const response = await adapter.track({...});
} catch (error) {
  if (error instanceof CarrierError) {
    if (error.category === 'Permanent' && error.message.includes('not found')) {
      // Parcel not found - likely wrong tracking number
      console.error('Tracking number not found');
    } else if (error.category === 'Auth') {
      // Authentication issue
      console.error('Invalid GLS credentials');
    } else {
      // Transient error - may retry
      console.error('Temporary API issue:', error.message);
    }
  }
}
```

## Dev-Server Example

### Request

```bash
curl -X POST http://localhost:3000/api/dev/gls/track \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "123456789",
    "credentials": {
      "username": "integration@example.com",
      "password": "myPassword123",
      "clientNumberList": [12345]
    },
    "options": {
      "useTestApi": true,
      "returnPOD": true,
      "languageIsoCode": "EN"
    }
  }'
```

### Response

```json
{
  "trackingNumber": "123456789",
  "status": "DELIVERED",
  "lastUpdate": "2024-02-01T14:30:00.000Z",
  "events": [
    {
      "timestamp": "2024-01-31T08:00:00.000Z",
      "status": "PENDING",
      "carrierStatusCode": "1",
      "description": "Handed over to GLS",
      "location": {
        "city": "Budapest",
        "facility": "0001"
      }
    },
    {
      "timestamp": "2024-02-01T10:00:00.000Z",
      "status": "IN_TRANSIT",
      "carrierStatusCode": "2",
      "description": "Left parcel center",
      "location": {
        "city": "Budapest",
        "facility": "0001"
      }
    },
    {
      "timestamp": "2024-02-01T14:30:00.000Z",
      "status": "DELIVERED",
      "carrierStatusCode": "5",
      "description": "Delivered",
      "location": {
        "city": "Budapest",
        "facility": "0001"
      }
    }
  ],
  "rawCarrierResponse": {
    "parcelNumber": 123456789,
    "clientReference": "ORD-2024-001",
    "deliveryCountryCode": "HU",
    "deliveryZipCode": "1056",
    "weight": 2.5,
    "podBase64": "JVBERi0xLjQKJeLjz9MNCjEgMCBvYmo...",
    "parcelNumber": 123456789
  }
}
```

## Best Practices

### 1. Cache Tracking Results
Parcel status updates are typically infrequent. Cache results with a reasonable TTL (e.g., 5-15 minutes):

```typescript
const cache = new Map();

async function getTrackingWithCache(trackingNumber) {
  const cacheKey = `gls-track-${trackingNumber}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }
  
  const data = await adapter.track({...});
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### 2. Handle POD Gracefully
Not all parcels have POD available (e.g., pending delivery). Check before accessing:

```typescript
const pod = response.rawCarrierResponse?.pod;
if (pod) {
  // Process POD
} else if (response.status === 'DELIVERED') {
  // POD not available - may not be available for this parcel type
  console.log('POD not available for this delivery');
}
```

### 3. Validate Tracking Numbers
Always validate the tracking number format before requesting:

```typescript
const trackingNumber = userInput.trim();
if (!/^\d{9,12}$/.test(trackingNumber)) {
  throw new Error('Invalid GLS tracking number');
}
```

### 4. Monitor Status Transitions
Track status changes to trigger actions (e.g., notification when OUT_FOR_DELIVERY):

```typescript
const previousResponse = await getPreviousTracking(trackingNumber);
const currentResponse = await adapter.track({...});

if (previousResponse?.status !== currentResponse.status) {
  await notifyUser(`Parcel status changed to: ${currentResponse.status}`);
}
```

### 5. Use Appropriate Language
Set language based on delivery destination or user preference:

```typescript
const deliveryCountry = shipment.deliveryCountryCode;
const languageMap = {
  'HU': 'HU',
  'CZ': 'CS',
  'SK': 'SK',
  'RO': 'RO',
};

const response = await adapter.track({
  ...
  options: {
    languageIsoCode: languageMap[deliveryCountry] || 'EN',
  },
});
```

## API Endpoint Information

### Production Endpoints
- Hungary: `https://api.mygls.hu/ParcelService.svc/json/GetParcelStatuses`
- Czech: `https://api.mygls.cz/ParcelService.svc/json/GetParcelStatuses`
- Slovakia: `https://api.mygls.sk/ParcelService.svc/json/GetParcelStatuses`
- (And other countries - see `resolveGLSBaseUrl()` utility)

### Test Endpoints
- Hungary: `https://api.test.mygls.hu/ParcelService.svc/json/GetParcelStatuses`
- Czech: `https://api.test.mygls.cz/ParcelService.svc/json/GetParcelStatuses`
- (And others)

## Rate Limiting

GLS API has rate limits. Recommended:
- Cache results (see Best Practices #1)
- Use polling intervals of 5-15 minutes
- Batch requests when possible
- Implement exponential backoff for retries

## Troubleshooting

### "Parcel not found"
- Verify the tracking number is correct
- Check that credentials are valid for the account containing this parcel
- Ensure you're using the correct country/API endpoint

### "Invalid credentials"
- Verify username and password
- Check that credentials are for MyGLS API (not customer portal)
- Confirm client number is correct

### "POD not available"
- Not all parcel types support POD
- POD may only be available after delivery
- Try with `returnPOD: true` to explicitly request

### No status events returned
- Parcel may be too new (immediately after shipment creation)
- Verify tracking number
- Check that parcel was handed over to GLS

## Related Documentation

- [GLS Label Creation](./LABELS.md)
- [GLS Parcel Management](./PARCELS.md)
- [GLS Status Codes (Complete Reference)](./STATUS_CODES.md)
