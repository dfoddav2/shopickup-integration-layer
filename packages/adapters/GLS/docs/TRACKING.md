# GLS Parcel Tracking

This document describes the GLS parcel tracking capability for the Shopickup adapter.

## Overview

The GLS adapter supports parcel tracking via the `TRACK` capability. Tracking returns a timeline of events showing the current status and history of a parcel's journey.

### Important Notes

- **HU-Focused**: This implementation is optimized for Hungary. Experimental support for other countries (CZ, HR, RO, SI, SK, RS).
- **Stateless**: The adapter does not persist tracking data. Each call fetches fresh data from GLS API.
- **Real-time Updates**: Returns latest status from GLS tracking system.
- **Event Timeline**: Returns complete history of all tracking events for the parcel.

## Prerequisites

1. **GLS Account**: Active MyGLS account with tracking permissions
2. **Credentials**: MyGLS username, password, and client number(s)
3. **GLS Parcel ID**: The numeric parcel ID (typically from a prior `CREATE_PARCELS` call)

## API Flow

### Tracking a Parcel

```typescript
import { GLSAdapter } from '@shopickup/adapters-gls';
import { createAxiosHttpClient } from '@shopickup/core/http/axios-client';

const adapter = new GLSAdapter();
const httpClient = createAxiosHttpClient();
const logger = console; // or your logger

// Track a parcel by its GLS ID
const trackingResult = await adapter.track(
  {
    trackingNumber: '123456789', // GLS parcel ID
    credentials: {
      username: 'integration@example.com',
      password: 'myPassword123',
      clientNumberList: [12345],
    },
    options: {
      useTestApi: false, // Set to true for testing
    },
  },
  { http: httpClient, logger }
);

console.log('Current Status:', trackingResult.status); // e.g., 'IN_TRANSIT'
console.log('Last Update:', trackingResult.lastUpdate);

// Print tracking timeline
for (const event of trackingResult.events) {
  console.log(`${event.timestamp.toISOString()}: ${event.description}`);
  console.log(`  Status: ${event.status}`);
  console.log(`  Code: ${event.carrierStatusCode}`);
  if (event.location?.city) {
    console.log(`  Location: ${event.location.city}`);
  }
}
```

## Request Parameters

### TrackingRequest

```typescript
interface TrackingRequest {
  // GLS parcel number (numeric string or number)
  // Example: '123456789'
  trackingNumber: string;

  // GLS credentials (optional, but required for non-public tracking)
  credentials?: {
    username: string;           // MyGLS username
    password: string;           // MyGLS password (hashed internally)
    clientNumberList: number[]; // Array of GLS client numbers
  };

  // Request options (optional)
  options?: {
    useTestApi?: boolean; // Use test/sandbox endpoint
  };
}
```

## Response Format

### TrackingUpdate

```typescript
interface TrackingUpdate {
  // Tracking number (GLS parcel ID)
  trackingNumber: string;

  // Timeline of all tracking events (sorted chronologically)
  events: TrackingEvent[];

  // Current status (derived from latest event)
  // Values: PENDING, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION, RETURNED, CANCELLED
  status: TrackingStatus;

  // Timestamp of last tracking update (or null if no events)
  lastUpdate: Date | null;

  // Raw GLS API response (for debugging)
  rawCarrierResponse?: unknown;
}

interface TrackingEvent {
  // ISO 8601 timestamp of the event
  timestamp: Date;

  // Normalized canonical status
  status: TrackingStatus;

  // Original GLS status code (1-40+)
  carrierStatusCode?: string;

  // Location information
  location?: {
    city?: string;        // City name
    country?: string;     // Country code
    facility?: string;    // Facility/depot identifier
    latitude?: number;    // Coordinates (if available)
    longitude?: number;
  };

  // Human-readable description
  description: string;

  // Description in alternative language (if provided by GLS)
  descriptionLocalLanguage?: string;

  // Raw GLS status data
  raw?: unknown;
}

type TrackingStatus = 
  | 'PENDING'           // Awaiting pickup
  | 'IN_TRANSIT'        // In transit
  | 'OUT_FOR_DELIVERY'  // Out for delivery today
  | 'DELIVERED'         // Successfully delivered
  | 'EXCEPTION'         // Exception/delay/issue
  | 'RETURNED'          // Returned to sender
  | 'CANCELLED';        // Shipment cancelled
```

## Status Code Mapping

The GLS adapter maps GLS tracking codes (1-40+) to canonical statuses. This mapping is based on GLS Appendix G tracking codes.

### Common Status Codes

| GLS Code | Description | Canonical Status | Notes |
|----------|-------------|------------------|-------|
| 1 | Handed over to GLS | PENDING | Parcel picked up |
| 2 | Left parcel center | IN_TRANSIT | Departed from depot |
| 3 | Reached parcel center | IN_TRANSIT | Arrived at depot |
| 4 | Expected delivery during day | OUT_FOR_DELIVERY | On delivery route |
| 5 | Delivered | DELIVERED | Successfully delivered |
| 8 | Ready for self-collection | OUT_FOR_DELIVERY | Available at pickup point |
| 23 | Returned to sender | RETURNED | Returned to origin |
| 13-22, 24-40+ | Various exceptions | EXCEPTION | Delays, damage, issues, etc. |

### Exception Codes (Partial List)

| GLS Code | Description | Canonical Status |
|----------|-------------|------------------|
| 6-7 | Stored in parcel center | EXCEPTION |
| 9 | Stored for new delivery date | EXCEPTION |
| 11-12, 14-15, 19 | Delay conditions | EXCEPTION |
| 13 | Sorting error | EXCEPTION |
| 16 | No cash available | EXCEPTION |
| 17 | Recipient refused | EXCEPTION |
| 18 | Address information needed | EXCEPTION |
| 20 | Wrong/incomplete address | EXCEPTION |
| 28-32, 34, 36-37 | Damage/loss | EXCEPTION |
| 40 | Customs hold | EXCEPTION |

See GLS Appendix G for the complete list.

## Error Handling

The adapter throws `CarrierError` exceptions with different types:

### Permanent Errors (Won't be resolved by retry)

- **Invalid tracking number**: Non-numeric or negative
- **Missing credentials**: Required fields not provided
- **Authentication failure**: Invalid username/password
- **Parcel not found**: GLS doesn't have this parcel in system

```typescript
try {
  const tracking = await adapter.track(req, ctx);
} catch (error) {
  if (error instanceof CarrierError) {
    if (error.type === 'Permanent') {
      // Log and skip - won't succeed with retry
      console.error(`Permanent error: ${error.message}`);
    } else if (error.type === 'Transient') {
      // Can retry later
      console.warn(`Transient error: ${error.message}`);
      // Implement exponential backoff retry
    }
  }
}
```

### Transient Errors (May be resolved by retry)

- **API timeout**: GLS server slow or unavailable
- **Network error**: Connection problem
- **HTTP 5xx**: GLS API error

Implement exponential backoff retry with a maximum number of attempts.

## Event Timeline

Tracking events are returned in chronological order, from oldest to newest:

```typescript
const tracking = await adapter.track(req, ctx);

// Events are sorted chronologically
console.log('Timeline:');
for (const event of tracking.events) {
  console.log(
    `${event.timestamp.toISOString()}: ${event.status} - ${event.description}`
  );
}

// Most recent event represents current status
const currentEvent = tracking.events[tracking.events.length - 1];
console.log('Current:', currentEvent.status);

// Check if parcel has been delivered
const isDelivered = tracking.status === 'DELIVERED';
console.log('Delivered:', isDelivered);
```

## Example Scenarios

### Scenario 1: Successful Delivery Tracking

```typescript
// Request tracking for a delivered parcel
const tracking = await adapter.track(
  {
    trackingNumber: '123456789',
    credentials: {
      username: 'api@mycompany.com',
      password: 'secure_password',
      clientNumberList: [10001],
    },
  },
  { http: httpClient, logger: console }
);

// Response shows complete journey
// Events: PENDING → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
// status: 'DELIVERED'
// lastUpdate: 2024-01-17T14:30:00Z
```

### Scenario 2: In-Transit Tracking

```typescript
// Track a parcel currently in transit
const tracking = await adapter.track({
  trackingNumber: '987654321',
  credentials: { ... },
}, { http, logger });

// Response shows journey in progress
// Events: PENDING → IN_TRANSIT
// status: 'IN_TRANSIT'
// lastUpdate: 2024-01-16T10:00:00Z

// Check estimated delivery (if available in location data)
const lastEvent = tracking.events[tracking.events.length - 1];
if (lastEvent.location?.city) {
  console.log(`Parcel is in ${lastEvent.location.city}`);
}
```

### Scenario 3: Exception Handling

```typescript
// Track a parcel with an exception
const tracking = await adapter.track({
  trackingNumber: '555555555',
  credentials: { ... },
}, { http, logger });

// Response shows the issue
// Events: PENDING → IN_TRANSIT → EXCEPTION
// status: 'EXCEPTION'
// lastEvent.description: "Recipient refused"

// Handle based on exception type
if (tracking.status === 'EXCEPTION') {
  console.warn(`Issue with parcel: ${tracking.events[tracking.events.length - 1].description}`);
  // Notify customer, retry delivery, etc.
}
```

### Scenario 4: Returned Parcel

```typescript
// Track a returned parcel
const tracking = await adapter.track({
  trackingNumber: '444444444',
  credentials: { ... },
}, { http, logger });

// Response shows return journey
// Events: PENDING → IN_TRANSIT → OUT_FOR_DELIVERY → EXCEPTION → RETURNED
// status: 'RETURNED'
// lastUpdate: 2024-01-17T16:00:00Z

if (tracking.status === 'RETURNED') {
  // Process return, issue refund, etc.
}
```

## Development & Testing

### Test Mode

Use `options.useTestApi: true` to test against GLS test API:

```typescript
const tracking = await adapter.track(
  {
    trackingNumber: '123456789',
    credentials: { ... },
    options: { useTestApi: true }, // Use test endpoint
  },
  { http, logger }
);
```

### Dev-Server Endpoint

For development, the Shopickup dev-server provides a REST endpoint:

```bash
# Start dev-server
cd examples/dev-server
npm run dev

# Test tracking (in another terminal)
curl -X POST http://localhost:3000/api/dev/gls/track \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "123456789",
    "credentials": {
      "username": "test@example.com",
      "password": "testpass",
      "clientNumberList": [12345]
    },
    "options": {
      "useTestApi": true
    }
  }'
```

## Implementation Details

### Authentication

The adapter handles password hashing automatically:

- Password is SHA512-hashed internally before API call
- Never store or log plain-text passwords
- Credentials are validated before each request

### Validation

All requests and responses are validated:

- Tracking number must be a positive integer
- Credentials must include username, password, client numbers
- GLS response is validated for required fields

### Retry Strategy

For production use, implement exponential backoff:

```typescript
async function trackWithRetry(
  req: TrackingRequest,
  ctx: AdapterContext,
  maxRetries = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await adapter.track(req, ctx);
    } catch (error) {
      if (error instanceof CarrierError && error.type === 'Transient' && attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw;
      }
    }
  }
}
```

## Limitations

- **60+ status codes**: Only common ones (1-40) are mapped
- **Limited location data**: May not include GPS coordinates
- **No POD by default**: Proof of Delivery requires separate API call
- **Single parcel**: One tracking call per parcel (no batch tracking)
- **Regional variations**: Status codes may vary by GLS region

## Troubleshooting

### "Parcel not found" error

- Verify the tracking number is correct (GLS parcel ID, not order number)
- Ensure the parcel was created via `CREATE_PARCELS` in this account
- Check that credentials belong to the same GLS account that created the parcel

### "Authentication failed" error

- Verify username and password are correct
- Ensure client number is valid and associated with account
- Check that account has tracking permissions enabled

### No events returned

- Parcel may be too new (just created)
- Try again after a few minutes
- Check that parcel ID is correct in the system

### Timeout errors

- GLS API may be experiencing delays
- Implement exponential backoff retry
- Try test API first to verify connectivity

## References

- **GLS MyGLS API**: https://api.mygls.hu/
- **GLS Appendix G**: Tracking status codes documentation
- **Shopickup Core**: [TrackingUpdate type](../../../core/src/types/tracking.ts)
