# Shopickup Example Dev Server

A Fastify-based development server that demonstrates how to use Shopickup adapters. Includes Swagger UI for interactive testing and configurable environment-based logging.

**Important:** This dev server is for testing and iteration only. It does not persist data. For production, implement your own `Store` interface with the database of your choice (PostgreSQL, MongoDB, DynamoDB, etc.).

## Features

- Health check endpoint
- Foxpost adapter dev endpoint with full request/response validation
- Swagger UI for exploring and testing endpoints
- Structured logging for debugging
- Environment-based configuration (logging level, HTTP timeouts, etc.)
- Full HTTP request/response debugging support

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment (Optional)

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` to customize logging and server settings (all settings have sensible defaults):

```env
NODE_ENV=development
# Default: use `info` for cleaner logs; set to `debug` for verbose HTTP & adapter debugging
LOG_LEVEL=info
HTTP_DEBUG=0
HTTP_TIMEOUT_MS=30000
SERVER_PORT=3000
```

See [Environment Variables](#environment-variables) for all available options.

### 3. Start the Server

**Development (with tsx hot-reload):**

```bash
pnpm run dev
```

**Production (compiled):**

```bash
pnpm run build
pnpm run start
```

The server starts on `http://localhost:3000` (or the port specified in `SERVER_PORT`).

You should see startup output like:

```
[dev-server] {"level":30,"time":"...","msg":"Server is running at http://localhost:3000"}
```

### Access Swagger UI

Open your browser to `http://localhost:3000/docs` to see all available endpoints and test them interactively.

## Environment Variables

Create a `.env` file in this directory (see `.env.example` as a template). All variables are optional; sensible defaults are provided.

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode: `development`, `production`, or `test` |
| `LOG_LEVEL` | `info` | Fastify/Pino log level: `debug`, `info`, `warn`, `error`, `fatal`, or `silent` |
| `HTTP_DEBUG` | `0` | Enable HTTP request/response logging (headers, status): `0` or `1` |
| `HTTP_DEBUG_FULL` | `0` | Enable full HTTP body logging (very verbose, includes request/response bodies): `0` or `1` |
| `HTTP_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
| `SERVER_PORT` | `3000` | Server port |
| `FOXPOST_API_KEY` | (empty) | Foxpost API key for real API testing (optional) |
| `FOXPOST_USE_TEST_API` | `true` | Use Foxpost test API: `true` or `false` |
| `MPL_API_KEY` | (empty) | MPL API key for real API testing (optional) |
| `MPL_API_SECRET` | (empty) | MPL API secret for real API testing (optional) |
| `MPL_USE_TEST_API` | `true` | Use MPL test/sandbox API: `true` or `false` |

### Debug Logging Example

To see detailed HTTP requests and responses:

```env
LOG_LEVEL=debug
HTTP_DEBUG=1
HTTP_DEBUG_FULL=1
```

Then restart: `pnpm run dev`

You'll see logs with request/response details, which is useful for understanding adapter-to-carrier communication.

### Silencing Pickup-Points (APM) Logs

The Foxpost adapter's `fetchPickupPoints` operation returns large APM feeds and is silent by default to avoid polluting logs. To enable adapter-level logs for pickup points, set the adapter context `loggingOptions` or run the server with `LOG_LEVEL=debug` and `HTTP_DEBUG=1`.

Example (enable adapter logging):

```js
// In your gateway/server when building AdapterContext
loggingOptions: { silentOperations: [] } // empty = enable logging
```

## Understanding the `raw` Field

All endpoint responses include a `raw` field containing the **full response from the carrier's API**. This is critical for debugging and understanding what data the carrier returns.

### Why `raw` Content Differs

**Test Mode** (default, `FOXPOST_USE_TEST_API=true` or no credentials):
- Returns mock data from Shopickup's test HTTP client
- `raw` contains realistic but fabricated carrier responses
- Useful for testing adapter logic without hitting the real carrier API
- Example: `{"valid": true, "parcels": [...]}`

**Production Mode** (`FOXPOST_USE_TEST_API=false` + valid `FOXPOST_API_KEY`):
- Makes real API calls to the carrier
- `raw` contains actual carrier response data
- Requires valid carrier credentials
- Example: Real Foxpost API response structure

### Debugging `raw` Field Data

Enable full HTTP debugging to see exactly what the adapter sends and receives:

```env
LOG_LEVEL=debug
HTTP_DEBUG=1
HTTP_DEBUG_FULL=1
```

Restart and make a request. Look for debug-level logs showing request and response details:

```
[dev-server] DEBUG: request
  method: "POST"
  url: "https://webapi-test.foxpost.hu/api/parcel?..."
  body: {...request body...}

[dev-server] DEBUG: response
  status: 200
  body: {...carrier response...}
```

The response `body` is what becomes the `raw` field in the endpoint response.

**Important:** If `raw` appears empty or minimal in your response:
- Check that you provided valid Foxpost credentials (apiKey, basicUsername, basicPassword)
- Invalid credentials cause the carrier to return an error or empty response
- Use `HTTP_DEBUG_FULL=1` to see the actual HTTP response from the carrier
- Refer to [RAW_FIELD.md](./RAW_FIELD.md) for detailed debugging guidance

## Endpoints

### Health Check

**GET /health**

Simple health check endpoint.

```bash
curl http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "ts": "2025-01-19T18:00:00.000Z"
}
```

### Create Foxpost Parcel (Dev)

**POST /api/dev/foxpost/create-parcel**

Creates a parcel in the Foxpost carrier system. Demonstrates full adapter integration with the Shopickup core.

**Features:**

- Validates request against OpenAPI schema
- Supports both production and test APIs via `options.useTestApi`
- Returns normalized CarrierResource or structured error
- Full debug logging for troubleshooting

#### Request Example (Production API)

```json
{
  "shipment": {
    "id": "order-123",
    "sender": {
      "name": "Acme Corp",
      "street": "123 Business Ave",
      "city": "Budapest",
      "postalCode": "1011",
      "country": "HU",
      "phone": "+36301234567",
      "email": "shipping@acme.com"
    },
    "recipient": {
      "name": "John Doe",
      "street": "456 Main St",
      "city": "Debrecen",
      "postalCode": "4024",
      "country": "HU",
      "phone": "+36302222222",
      "email": "john@example.com"
    },
    "service": "standard",
    "totalWeight": 1000,
    "reference": "ORD-12345"
  },
  "parcel": {
    "id": "parcel-1",
    "shipmentId": "order-123",
    "weight": 1000,
    "dimensions": {
      "length": 20,
      "width": 15,
      "height": 10
    },
    "status": "draft"
  },
  "credentials": {
    "apiKey": "your-foxpost-api-key"
  },
  "options": {
    "useTestApi": false
  }
}
```

#### Request Example (Test API)

Same as above, but with `"useTestApi": true` and a test API key:

```json
{
  "shipment": { ... },
  "parcel": { ... },
  "credentials": {
    "apiKey": "your-foxpost-test-api-key"
  },
  "options": {
    "useTestApi": true
  }
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/dev/foxpost/create-parcel \
  -H "Content-Type: application/json" \
  -d '{
    "shipment": {
      "id": "test-order-1",
      "sender": {
        "name": "Test Sender",
        "street": "123 Street",
        "city": "Budapest",
        "postalCode": "1011",
        "country": "HU",
        "phone": "+3630123456",
        "email": "sender@test.com"
      },
      "recipient": {
        "name": "Test Recipient",
        "street": "456 Street",
        "city": "Debrecen",
        "postalCode": "4024",
        "country": "HU",
        "phone": "+3630654321",
        "email": "recipient@test.com"
      },
      "service": "standard",
      "totalWeight": 1000
    },
    "parcel": {
      "id": "test-parcel-1",
      "shipmentId": "test-order-1",
      "weight": 1000
    },
    "credentials": {
      "apiKey": "YOUR_API_KEY"
    },
    "options": {
      "useTestApi": false
    }
  }'
```

#### Success Response (200)

```json
{
  "carrierId": "CLFOX0000000001",
  "status": "created",
  "labelUrl": null,
  "raw": {
    "valid": true,
    "parcels": [
      {
        "barcode": "CLFOX0000000001",
        "refCode": "test-parcel-1",
        "errors": []
      }
    ]
  }
}
```

#### Error Response (400 - Validation)

```json
{
  "message": "Missing credentials.apiKey",
  "category": "Validation"
}
```

#### Error Response (401 - Auth)

```json
{
  "message": "API credentials invalid",
  "category": "Auth"
}
```

#### Error Response (502 - Server Error)

```json
{
  "message": "Server error from carrier API",
  "category": "Transient"
}
```

### Create Foxpost Parcels Batch (Dev)

**POST /api/dev/foxpost/create-parcels**

Creates multiple Foxpost parcels in a single batch request. Demonstrates intelligent HTTP status codes for mixed results.

**Features:**

- Accepts array of parcels in single request
- Returns appropriate HTTP status based on batch results:
  - **200 OK**: All parcels created successfully
  - **207 Multi-Status**: Some succeeded, some failed (mixed results)
  - **400 Bad Request**: All parcels failed with validation errors
- Includes `summary` field for quick status understanding
- Each parcel includes validation errors if applicable
- Shared credentials for the entire batch

#### Smart HTTP Status Codes

The batch endpoint uses semantic HTTP status codes to communicate different outcomes:

| Status | Meaning | When Used |
|--------|---------|-----------|
| **200 OK** | All parcels succeeded | Every parcel has `status: "created"` |
| **207 Multi-Status** | Mixed results | Some parcels succeeded, some failed |
| **400 Bad Request** | All failed with validation | All parcels have validation errors |

#### Request Example

```json
{
  "parcels": [
    {
      "recipientName": "John Doe",
      "recipientPhone": "+36201234567",
      "recipientEmail": "john@example.com",
      "recipientCity": "Budapest",
      "recipientPostalCode": "1011",
      "recipientCountry": "HU"
    },
    {
      "recipientName": "Jane Smith",
      "recipientPhone": "+36307654321",
      "recipientEmail": "jane@example.com",
      "recipientCity": "Debrecen",
      "recipientPostalCode": "4026",
      "recipientCountry": "HU"
    }
  ],
  "credentials": {
    "apiKey": "your-foxpost-api-key"
  },
  "options": {
    "useTestApi": true
  }
}
```

#### Success Response (200 - All Succeeded)

```json
{
  "summary": "All 2 parcels created successfully",
  "results": [
    {
      "carrierId": "CLFOX0000000001",
      "status": "created",
      "raw": { "valid": true, "parcels": [...] }
    },
    {
      "carrierId": "CLFOX0000000002",
      "status": "created",
      "raw": { "valid": true, "parcels": [...] }
    }
  ]
}
```

#### Mixed Results Response (207 - Partial Success)

```json
{
  "summary": "Mixed: 1 succeeded, 1 failed",
  "results": [
    {
      "carrierId": "CLFOX0000000001",
      "status": "created",
      "raw": { "valid": true, "parcels": [...] }
    },
    {
      "carrierId": null,
      "status": "failed",
      "errors": [
        {
          "field": "recipientPhone",
          "code": "INVALID_FORMAT",
          "message": "Phone number format is invalid"
        }
      ],
      "raw": { "valid": false, "errors": [...] }
    }
  ]
}
```

#### Failed Response (400 - All Failed)

```json
{
  "summary": "All 2 parcels failed with validation errors",
  "results": [
    {
      "carrierId": null,
      "status": "failed",
      "errors": [
        {
          "field": "recipientName",
          "code": "REQUIRED",
          "message": "Recipient name is required"
        }
      ],
      "raw": {}
    },
    {
      "carrierId": null,
      "status": "failed",
      "errors": [
        {
          "field": "recipientEmail",
          "code": "INVALID_FORMAT",
          "message": "Email format is invalid"
        }
      ],
      "raw": {}
    }
  ]
}
```

#### Error Response (502 - Server Error)

```json
{
  "message": "Server error from carrier API",
  "category": "Transient"
}
```

### Create MPL Label (Dev)

**POST /api/dev/mpl/create-label**

Creates a single label for an MPL parcel.

**Features:**

- Validates request against OpenAPI schema
- Supports label size, format, and ordering options (A5, A4, PDF, ZPL, etc.)
- Requires `accountingCode` for label generation
- Returns LabelResult with file metadata or structured error
- Full debug logging for troubleshooting

#### Request Example

```json
{
  "parcelCarrierId": "MLHUN12345671234567",
  "credentials": {
    "authType": "apiKey",
    "apiKey": "demo-api-key-12345",
    "apiSecret": "demo-api-secret-67890"
  },
  "options": {
    "labelType": "A5",
    "labelFormat": "PDF",
    "accountingCode": "ACC123",
    "useTestApi": true
  }
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/dev/mpl/create-label \
  -H "Content-Type: application/json" \
  -d '{
    "parcelCarrierId": "MLHUN12345671234567",
    "credentials": {
      "authType": "apiKey",
      "apiKey": "YOUR_API_KEY",
      "apiSecret": "YOUR_API_SECRET"
    },
    "options": {
      "labelType": "A5",
      "labelFormat": "PDF",
      "accountingCode": "ACC123"
    }
  }'
```

#### Success Response (200)

```json
{
  "inputId": "MLHUN12345671234567",
  "status": "created",
  "fileId": "label-uuid-1",
  "pageRange": {
    "start": 1,
    "end": 1
  },
  "errors": null,
  "raw": {
    "label": "base64EncodedPdfData..."
  }
}
```

#### Error Response (400 - Validation)

```json
{
  "message": "Validation error: accountingCode is required for label creation",
  "category": "Validation",
  "errors": [
    {
      "field": "accountingCode",
      "code": "REQUIRED",
      "message": "accountingCode is required"
    }
  ]
}
```

#### Error Response (401 - Auth)

```json
{
  "message": "MPL API error: The provided access token is not valid (INVALID_TOKEN)",
  "category": "Auth",
  "mplErrorCode": "INVALID_TOKEN"
}
```

### Create MPL Labels Batch (Dev)

**POST /api/dev/mpl/create-labels**

Creates labels for multiple MPL parcels in a single batch request.

**Features:**

- Accepts array of tracking numbers in single request
- Returns appropriate HTTP status based on batch results:
  - **200 OK**: All labels created successfully
  - **207 Multi-Status**: Some succeeded, some failed (mixed results)
  - **400 Bad Request**: All labels failed with validation errors
- Includes `summary` field for quick status understanding
- Each result includes file mapping and metadata if successful
- Shared credentials and options for the entire batch

#### Request Example

```json
{
  "parcelCarrierIds": [
    "MLHUN12345671234567",
    "MLHUN12345671234568",
    "MLHUN12345671234569"
  ],
  "credentials": {
    "authType": "apiKey",
    "apiKey": "demo-api-key-12345",
    "apiSecret": "demo-api-secret-67890"
  },
  "options": {
    "labelType": "A5",
    "labelFormat": "PDF",
    "accountingCode": "ACC123",
    "singleFile": false,
    "useTestApi": true
  }
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/dev/mpl/create-labels \
  -H "Content-Type: application/json" \
  -d '{
    "parcelCarrierIds": ["MLHUN12345671234567", "MLHUN12345671234568"],
    "credentials": {
      "authType": "apiKey",
      "apiKey": "YOUR_API_KEY",
      "apiSecret": "YOUR_API_SECRET"
    },
    "options": {
      "labelType": "A5",
      "labelFormat": "PDF",
      "accountingCode": "ACC123"
    }
  }'
```

#### Success Response (200 - All Succeeded)

```json
{
  "files": [
    {
      "id": "label-uuid-1",
      "contentType": "application/pdf",
      "byteLength": 24576,
      "pages": 3,
      "orientation": "portrait",
      "url": null,
      "dataUrl": null,
      "metadata": {
        "size": "A5",
        "testMode": true
      }
    }
  ],
  "results": [
    {
      "inputId": "MLHUN12345671234567",
      "status": "created",
      "fileId": "label-uuid-1",
      "pageRange": { "start": 1, "end": 1 },
      "error": null
    },
    {
      "inputId": "MLHUN12345671234568",
      "status": "created",
      "fileId": "label-uuid-1",
      "pageRange": { "start": 2, "end": 2 },
      "error": null
    },
    {
      "inputId": "MLHUN12345671234569",
      "status": "created",
      "fileId": "label-uuid-1",
      "pageRange": { "start": 3, "end": 3 },
      "error": null
    }
  ],
  "successCount": 3,
  "failureCount": 0,
  "totalCount": 3,
  "allSucceeded": true,
  "allFailed": false,
  "someFailed": false,
  "summary": "All 3 labels created successfully",
  "rawCarrierResponse": {
    "labels": ["base64..."]
  }
}
```

#### Mixed Results Response (207 - Partial Success)

```json
{
  "files": [
    {
      "id": "label-uuid-1",
      "contentType": "application/pdf",
      "byteLength": 16384,
      "pages": 2,
      "orientation": "portrait",
      "metadata": { "size": "A5", "testMode": true }
    }
  ],
  "results": [
    {
      "inputId": "MLHUN12345671234567",
      "status": "created",
      "fileId": "label-uuid-1",
      "pageRange": { "start": 1, "end": 1 },
      "error": null
    },
    {
      "inputId": "MLHUN12345671234568",
      "status": "failed",
      "fileId": null,
      "pageRange": null,
      "error": {
        "message": "Invalid tracking number format",
        "category": "Validation",
        "carrierCode": "INVALID_FORMAT"
      }
    }
  ],
  "successCount": 1,
  "failureCount": 1,
  "totalCount": 2,
  "allSucceeded": false,
  "allFailed": false,
  "someFailed": true,
  "summary": "Mixed: 1 succeeded, 1 failed",
  "rawCarrierResponse": { "labels": ["base64..."] }
}
```

#### Failed Response (400 - All Failed)

```json
{
  "summary": "All 2 labels failed with validation errors",
  "results": [
    {
      "inputId": "INVALID",
      "status": "failed",
      "fileId": null,
      "error": {
        "message": "Validation error: accountingCode is required",
        "category": "Validation"
      }
    }
  ]
}
```

### Get MPL Shipment Details (Dev)

**POST /api/dev/mpl/shipment-details**

Retrieves shipment metadata and details by tracking/shipment number. Returns sender, recipient, items, and shipment state information.

**Note:** This is different from tracking. Tracking returns event history; shipment details returns metadata and current state.

**Features:**

- Validates request against OpenAPI schema
- Supports both production and test APIs via `options.useTestApi`
- Returns normalized shipment metadata (sender, recipient, items, dates)
- Requires `accountingCode` in credentials
- Full debug logging for troubleshooting

#### Request Example

```json
{
  "trackingNumber": "12345678",
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret",
    "accountingCode": "ACC123456"
  },
  "options": {
    "useTestApi": true
  }
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/dev/mpl/shipment-details \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "12345678",
    "credentials": {
      "apiKey": "YOUR_API_KEY",
      "apiSecret": "YOUR_API_SECRET",
      "accountingCode": "ACC123"
    },
    "options": {
      "useTestApi": true
    }
  }'
```

#### Success Response (200)

```json
{
  "trackingNumber": "12345678",
  "orderId": "ORDER-001",
  "shipmentDate": "2025-01-20T10:30:00Z",
  "sender": {
    "name": "Acme Corp",
    "street": "123 Business Ave",
    "city": "Budapest",
    "postalCode": "1011",
    "country": "HU",
    "phone": "+36301234567"
  },
  "recipient": {
    "name": "John Doe",
    "street": "456 Main St",
    "city": "Debrecen",
    "postalCode": "4024",
    "country": "HU",
    "phone": "+36302222222"
  },
  "items": [
    {
      "id": "ITEM-1",
      "weight": 500
    },
    {
      "id": "ITEM-2",
      "weight": 300
    }
  ],
  "raw": {
    "shipmentId": "12345678",
    "status": "IN_TRANSIT",
    "createdAt": "2025-01-20T10:30:00Z"
  }
}
```

#### Error Response (400 - Validation)

```json
{
  "message": "accountingCode is required in credentials",
  "category": "Validation"
}
```

#### Error Response (401 - Auth)

```json
{
  "message": "MPL API error: The provided access token is not valid",
  "category": "Auth"
}
```

#### Error Response (404 - Not Found)

```json
{
  "message": "Shipment not found: 12345678",
  "category": "Validation"
}
```

### Track MPL Parcel (Dev)

**Endpoint:** `POST /api/dev/mpl/track`

**Description:** Track a parcel by tracking number using MPL's Pull-1 tracking endpoint.

Returns current tracking status and events (typically one event representing the latest state). Supports both guest endpoint (public, no financial data) and registered endpoint (authenticated, includes weight/dimensions).

**Request Body:**

```json
{
  "trackingNumber": "CL12345678901",
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret",
    "accountingCode": "ACC123456"
  },
  "options": {
    "useTestApi": false
  }
}
```

**Optional: Use OAuth2 Token Instead of API Key**

```json
{
  "trackingNumber": "CL12345678901",
  "credentials": {
    "oAuth2Token": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accountingCode": "ACC123456"
  },
  "options": {
    "useTestApi": false
  }
}
```

**Success Response (200 OK):**

```json
{
  "trackingNumber": "CL12345678901",
  "status": "DELIVERED",
  "events": [
    {
      "timestamp": "2025-01-27T14:30:00Z",
      "status": "DELIVERED",
      "location": {
        "city": "Budapest",
        "country": null
      },
      "description": "Delivered to recipient",
      "carrierStatusCode": "KÉZBESÍTVE",
      "raw": {
        "c1": "CL12345678901",
        "c9": "KÉZBESÍTVE",
        "c10": "2025-01-27 14:30:00",
        "c8": "Budapest",
        "c12": "Delivered to recipient"
      }
    }
  ],
  "lastUpdate": "2025-01-27T14:30:00Z",
  "rawCarrierResponse": {
    "record": {
      "c1": "CL12345678901",
      "c9": "KÉZBESÍTVE",
      "c10": "2025-01-27 14:30:00",
      "c8": "Budapest",
      "c12": "Delivered to recipient"
    }
  }
}
```

**Status Values:**
- `PENDING` - Parcel received, awaiting processing
- `IN_TRANSIT` - In transit between facilities
- `OUT_FOR_DELIVERY` - Out for delivery today
- `DELIVERED` - Successfully delivered
- `EXCEPTION` - Exception (delay, damage, etc.)
- `RETURNED` - Returned to sender

**Example: Using Test API**

```bash
curl -X POST http://localhost:3000/api/dev/mpl/track \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumber": "CL12345678901",
    "credentials": {
      "apiKey": "test-key",
      "apiSecret": "test-secret",
      "accountingCode": "ACC123456"
    },
    "options": {
      "useTestApi": true
    }
  }'
```

#### Tracking Status Codes (C-Codes)

MPL API returns C-code tracking data which is normalized to canonical statuses:

**Hungarian:**
- `BEÉRKEZETT` → PENDING
- `FELDOLGOZÁS` → PENDING
- `SZÁLLÍTÁS` → IN_TRANSIT
- `KÉZBESÍTÉS_ALATT` → OUT_FOR_DELIVERY
- `KÉZBESÍTVE` → DELIVERED
- `VISSZAKÜLDVE` → RETURNED
- `HIBA` → EXCEPTION

**English & German equivalents are also supported.**

The `carrierStatusCode` field in the response preserves the original MPL status code for debugging.

#### Error Response (400 - Validation)

```json
{
  "message": "Invalid tracking request: trackingNumber is required",
  "category": "Validation"
}
```

#### Error Response (401 - Auth)

```json
{
  "message": "Unauthorized (401): Invalid credentials",
  "category": "Auth"
}
```

#### Error Response (404 - Not Found)

```json
{
  "message": "No tracking information found for: CL12345678901",
  "category": "Validation"
}
```

#### Error Response (429 - Rate Limited)

```json
{
  "message": "Rate limited (429): Too many requests",
  "category": "RateLimit"
}
```

#### Error Response (503 - Service Unavailable)

```json
{
  "message": "Server error (503): Temporary service unavailable",
  "category": "Transient"
}
```

### Track MPL Parcel (Registered - Authenticated)

**Endpoint:** `POST /api/dev/mpl/track-registered`

**Description:** Track a parcel using MPL's registered endpoint with authentication. Returns tracking status plus financial data (weight, dimensions, declared value, service code). Intended for power users and internal/admin use.

**Request Body:**

```json
{
  "trackingNumbers": ["CL12345678901"],
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret",
    "accountingCode": "ACC123456"
  },
  "state": "last",
  "options": {
    "useTestApi": false
  }
}
```

**Success Response (200 OK):**

```json
{
  "trackingNumber": "CL12345678901",
  "status": "DELIVERED",
  "events": [
    {
      "timestamp": "2025-01-27T14:30:00Z",
      "status": "DELIVERED",
      "location": {
        "city": "Budapest",
        "country": null
      },
      "description": "Delivered to recipient",
      "carrierStatusCode": "KÉZBESÍTVE",
      "raw": {
        "c1": "CL12345678901",
        "c2": "A_175_UZL",
        "c5": "2.5",
        "c9": "KÉZBESÍTVE",
        "c10": "2025-01-27 14:30:00",
        "c41": "20",
        "c42": "15",
        "c43": "10",
        "c58": "50000",
        "c8": "Budapest",
        "c12": "Delivered to recipient"
      }
    }
  ],
  "lastUpdate": "2025-01-27T14:30:00Z",
  "rawCarrierResponse": {
    "record": {
      "c1": "CL12345678901",
      "c2": "A_175_UZL",
      "c5": "2.5",
      "c9": "KÉZBESÍTVE",
      "c10": "2025-01-27 14:30:00",
      "c41": "20",
      "c42": "15",
      "c43": "10",
      "c58": "50000",
      "c8": "Budapest",
      "c12": "Delivered to recipient"
    },
    "weight": "2.5",
    "dimensions": {
      "length": "20",
      "width": "15",
      "height": "10"
    },
    "value": "50000"
  }
}
```

**Key Differences from Guest Endpoint:**
- Includes financial data (weight C5, dimensions C41/C42/C43, declared value C58)
- Requires authentication
- More detailed service information
- Better suited for internal/admin tracking

**Example: Using Registered Endpoint**

```bash
curl -X POST http://localhost:3000/api/dev/mpl/track-registered \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumbers": ["CL12345678901"],
    "credentials": {
      "apiKey": "test-key",
      "apiSecret": "test-secret",
      "accountingCode": "ACC123456"
    },
    "state": "last",
    "options": {
      "useTestApi": true
    }
  }'
```

### Track MPL Parcels Batch (Pull-500) - Two-Phase Protocol

**Endpoints:**
- `POST /api/dev/mpl/track-pull500-start` — Submit batch (up to 500 parcels)
- `POST /api/dev/mpl/track-pull500-check` — Poll for results

**Description:** Efficiently track large batches (up to 500 parcels) in a single request. MPL processes the request asynchronously, returning a tracking GUID for polling. Results take 1-5 minutes to generate.

**Use Case:** Batch tracking for daily reconciliation, large shipment monitoring, or bulk parcel status updates.

#### Phase 1: Submit Batch Request

**Endpoint:** `POST /api/dev/mpl/track-pull500-start`

**Request Body:**

```json
{
  "trackingNumbers": [
    "CL12345678901",
    "CL98765432109",
    "CLABCD123456"
  ],
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret"
  },
  "language": "hu",
  "options": {
    "useTestApi": false
  }
}
```

**Success Response (200 OK):**

```json
{
  "trackingGUID": "550e8400-e29b-41d4-a716-446655440000",
  "errors": null
}
```

**Example: Submit Batch**

```bash
curl -X POST http://localhost:3000/api/dev/mpl/track-pull500-start \
  -H "Content-Type: application/json" \
  -d '{
    "trackingNumbers": ["CL12345678901", "CL98765432109"],
    "credentials": {
      "apiKey": "test-key",
      "apiSecret": "test-secret"
    },
    "language": "hu",
    "options": {
      "useTestApi": false
    }
  }'
```

#### Phase 2: Poll for Results

**Endpoint:** `POST /api/dev/mpl/track-pull500-check`

**Important:** Allow 1+ minute before first poll. Results can take several minutes to generate. Recommend polling every 30-60 seconds with exponential backoff.

**Request Body:**

```json
{
  "trackingGUID": "550e8400-e29b-41d4-a716-446655440000",
  "credentials": {
    "apiKey": "your-api-key",
    "apiSecret": "your-api-secret"
  },
  "options": {
    "useTestApi": false
  }
}
```

**Response: Status NEW (still queued)**

```json
{
  "status": "NEW"
}
```

**Response: Status INPROGRESS (processing)**

```json
{
  "status": "INPROGRESS"
}
```

**Response: Status READY (results available)**

```json
{
  "status": "READY",
  "report_fields": "tracking_number;status;location;date;description",
  "report": "CL12345678901;DELIVERED;Budapest;2025-01-27;Delivered to recipient\nCL98765432109;IN_TRANSIT;Debrecen;2025-01-27;In transit\nCLABCD123456;PENDING;Unknown;2025-01-27;Awaiting processing"
}
```

**Response: Status ERROR (processing failed)**

```json
{
  "status": "ERROR",
  "errors": [
    {
      "code": "BATCH_PROCESSING_ERROR",
      "text": "Failed to process batch due to server error"
    }
  ]
}
```

**Example: Poll for Results**

```bash
# First poll (after 1+ minute delay)
curl -X POST http://localhost:3000/api/dev/mpl/track-pull500-check \
  -H "Content-Type: application/json" \
  -d '{
    "trackingGUID": "550e8400-e29b-41d4-a716-446655440000",
    "credentials": {
      "apiKey": "test-key",
      "apiSecret": "test-secret"
    },
    "options": {
      "useTestApi": false
    }
  }'

# Response: {"status": "INPROGRESS"}

# Wait 30-60 seconds, then poll again...

# Response when ready:
# {"status": "READY", "report_fields": "...", "report": "..."}
```

**Polling Recommendations:**

1. Wait 1+ minute after submitting batch before first poll
2. Poll every 30-60 seconds
3. Stop polling after status becomes READY or ERROR
4. Handle transient errors (429, 503) with backoff
5. Set a reasonable timeout (e.g., 10-15 minutes) for overall batch processing

**Example: Parsing CSV Report**

When status=READY, the report contains CSV-formatted tracking data:

```javascript
const response = await fetch('/api/dev/mpl/track-pull500-check', {
  method: 'POST',
  body: JSON.stringify(checkRequest)
});

const data = await response.json();

if (data.status === 'READY') {
  // Parse CSV-like report
  const headers = data.report_fields.split(';');
  const rows = data.report.split('\n');
  
  rows.forEach(row => {
    const cols = row.split(';');
    const tracking = {
      tracking_number: cols[0],
      status: cols[1],
      location: cols[2],
      date: cols[3],
      description: cols[4]
    };
    console.log(tracking);
  });
}
```

**Error Responses:**

| Status Code | Category | Meaning |
|-------------|----------|---------|
| 400 | Validation | Invalid request (empty array, >500 items, invalid GUID) |
| 401 | Auth | Invalid credentials |
| 429 | RateLimit | Too many requests - check Retry-After header |
| 503 | Transient | Server error - retry with backoff |

```


1. Start the server: `pnpm run dev`
2. Open Swagger UI: `http://localhost:3000/docs`
3. Expand the endpoint you want to test (Foxpost or MPL)
4. Click "Try it out"
5. Fill in the request body with your data and credentials
6. Click "Execute"
7. See the response and response headers

**Available endpoints in Swagger UI:**
- Foxpost: Create Parcel (single), Create Parcels (batch), Exchange Auth Token, Fetch Pickup Points
- MPL: Create Label (single), Create Labels (batch), Create Parcel (single), Create Parcels (batch), Exchange Auth Token, Fetch Pickup Points, Get Shipment Details, Track Parcel (guest), Track Parcel (registered), Track Batch (Pull-500 start), Track Batch (Pull-500 check)

## Running E2E Tests

The dev-server includes end-to-end tests that verify the batch endpoint behavior:

```bash
# Install dependencies
pnpm install

# Run tests (will skip if server not running)
pnpm test

# Run tests in watch mode
pnpm test:watch
```

The E2E tests verify:

- ✅ HTTP 200 returns when all parcels succeed
- ✅ HTTP 207 returns for mixed success/failure results
- ✅ HTTP 400 returns when all parcels fail with validation errors
- ✅ Error details include field, code, and message
- ✅ Summary field correctly describes the batch result
- ✅ Each result includes standard CarrierResource fields

## How It Works

The dev endpoint:

1. Validates incoming request against OpenAPI schema (automatic by Fastify)
2. Builds a canonical `CreateParcelRequest` from the request body
3. Creates an `AdapterContext` with the built-in fetch HTTP client
4. Calls `FoxpostAdapter.createParcel(shipmentId, req, ctx)`
5. Returns normalized `CarrierResource` or maps `CarrierError` to HTTP status codes

## Architecture

```
server.ts
├── Registers Fastify plugins (logger, CORS, swagger)
├── Registers foxpost-routes.ts
├── Registers mpl-routes.ts
└── Starts server on port 3000

foxpost-routes.ts
├── Creates FoxpostAdapter instance
├── Registers POST /api/dev/foxpost/create-parcel
├── Registers POST /api/dev/foxpost/create-parcels
├── Registers POST /api/dev/foxpost/create-label
├── Registers POST /api/dev/foxpost/create-labels
└── Handles request -> adapter -> response mapping

mpl-routes.ts
├── Creates MPLAdapter instance
├── Registers POST /api/dev/mpl/create-parcel
├── Registers POST /api/dev/mpl/create-parcels
├── Registers POST /api/dev/mpl/create-label
├── Registers POST /api/dev/mpl/create-labels
├── Registers POST /api/dev/mpl/exchange-auth-token
├── Registers POST /api/dev/mpl/pickup-points
├── Registers POST /api/dev/mpl/shipment-details
└── Handles request -> adapter -> response mapping

http-client.ts
├── Implements HttpClient interface using built-in fetch
└── Handles GET, POST, PUT, PATCH, DELETE methods
```

## Debugging

All requests and errors are logged via Fastify's logger (pino). The dev server uses a human‑friendly console format (pino‑pretty) while production emits structured JSON. You can control debug output and HTTP client request/response logging with env vars.

- `NODE_ENV=development` (default when not `production`) enables pretty console logging.
- `HTTP_DEBUG=1` enables the HttpClient debug logs (request/response events).
- `HTTP_DEBUG_FULL=1` enables truncated body previews in HttpClient logs (USE WITH CAUTION — this can expose sensitive data).

Example output (dev):

```
[2026-01-20 12:09:10.349 +0100] INFO: Foxpost createParcel request
  endpoint: /api/dev/foxpost/create-parcel
  shipmentId: shipment-001
  parcelId: parcel-001
  useTestApi: true
  hasCredentials: true

[2026-01-20 12:09:10.349 +0100] DEBUG: Calling FoxpostAdapter.createParcel
  shipmentId: shipment-001
  testMode: true

[2026-01-20 12:09:10.416 +0100] ERROR: Foxpost: Error creating parcel

[2026-01-20 12:09:10.416 +0100] ERROR: Error in createParcel
  err: { type: 'CarrierError', message: 'Foxpost credentials invalid', category: 'Auth', carrierCode: 'WRONG_USERNAME_OR_PASSWORD' }
```

Tips:

- Use `HTTP_DEBUG=1` while developing to surface HTTP calls. Add `HTTP_DEBUG_FULL=1` to see truncated body previews.
- Keep `HTTP_DEBUG_FULL` disabled for production.
- The HttpClient sanitizes common sensitive headers (authorization, api-key, x-api-key, password, token) before logging.

## Next Steps

1. Read [RAW_FIELD.md](./RAW_FIELD.md) for a deep dive into the `raw` field and debugging strategies
2. Test label endpoints with Swagger UI (`/docs`) or cURL
3. Implement your own `Store` interface for your database of choice (Postgres, MongoDB, DynamoDB, etc.)
4. Add webhook receiver for carrier events (scaffold is available)
5. Integrate additional carriers by adding new adapter packages
6. Deploy to staging/production environment

## Support & Resources

- [RAW_FIELD.md](./RAW_FIELD.md) — Comprehensive guide to the `raw` field, debugging, and examples
- [Environment Variables](#environment-variables) — Reference for `.env` configuration
- [Debugging](#debugging) — Tips for troubleshooting and inspecting requests
- Foxpost adapter source: `packages/adapters/foxpost/src/`
- MPL adapter source: `packages/adapters/MPL/src/`
- Core types: `packages/core/src/types/`

## License

MIT
