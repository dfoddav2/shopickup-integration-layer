# Shopickup Example Dev Server

A Fastify-based development server that demonstrates how to use Shopickup adapters. Includes Swagger UI for interactive testing.

## Features

- Health check endpoint
- Foxpost adapter dev endpoint with full request/response validation
- Swagger UI for exploring and testing endpoints
- Structured logging for debugging

## Getting Started

### Install

```bash
pnpm install
```

### Run

**Development (with tsx hot-reload):**
```bash
pnpm run dev
```

**Production (compiled):**
```bash
pnpm run build
pnpm run start
```

The server starts on `http://localhost:3000`.

### Access Swagger UI

Open your browser to `http://localhost:3000/docs` to see all available endpoints and test them interactively.

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

## Testing via Swagger UI

1. Start the server: `pnpm run dev`
2. Open Swagger UI: `http://localhost:3000/docs`
3. Expand the "POST /api/dev/foxpost/create-parcel" endpoint
4. Click "Try it out"
5. Fill in the request body with your shipment, parcel, and credentials
6. Click "Execute"
7. See the response and response headers

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
└── Starts server on port 3000

foxpost-routes.ts
├── Creates FoxpostAdapter instance
├── Registers POST /api/dev/foxpost/create-parcel
└── Handles request -> adapter -> response mapping

http-client.ts
├── Implements HttpClient interface using built-in fetch
└── Handles GET, POST, PUT, PATCH, DELETE methods
```

## Debugging

All requests and errors are logged via Fastify's logger (pino). When running with `pnpm run dev`, you'll see debug logs:

```
[18:00:00] INFO: Foxpost createParcel request
  endpoint: '/api/dev/foxpost/create-parcel'
  shipmentId: 'order-123'
  parcelId: 'parcel-1'
  useTestApi: false
  hasCredentials: true

[18:00:00] DEBUG: Calling FoxpostAdapter.createParcel
  shipmentId: 'order-123'
  testMode: false

[18:00:01] INFO: Parcel created successfully
  shipmentId: 'order-123'
  carrierId: 'CLFOX0000000001'
  status: 'created'
```

## Next Steps

1. Add more dev endpoints for other adapter methods (`track`, `createLabel`, etc.)
2. Add database persistence (SQLite + Drizzle ORM)
3. Add store implementation for tracking carrier resources
4. Add webhook receiver for carrier events
5. Deploy to staging/production environment

## License

MIT
