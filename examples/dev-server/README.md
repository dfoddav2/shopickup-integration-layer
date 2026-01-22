# Shopickup Example Dev Server

A Fastify-based development server that demonstrates how to use Shopickup adapters. Includes Swagger UI for interactive testing and configurable environment-based logging.

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
LOG_LEVEL=debug
HTTP_DEBUG=1
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

### Debug Logging Example

To see detailed HTTP requests and responses:

```env
LOG_LEVEL=debug
HTTP_DEBUG=1
HTTP_DEBUG_FULL=1
```

Then restart: `pnpm run dev`

You'll see logs with request/response details, which is useful for understanding adapter-to-carrier communication.

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
2. Add more dev endpoints for other adapter methods (`track`, `createLabel`, etc.)
3. Add database persistence (SQLite + Drizzle ORM)
4. Add store implementation for tracking carrier resources
5. Add webhook receiver for carrier events
6. Deploy to staging/production environment

## Support & Resources

- [RAW_FIELD.md](./RAW_FIELD.md) — Comprehensive guide to the `raw` field, debugging, and examples
- [Environment Variables](#environment-variables) — Reference for `.env` configuration
- [Debugging](#debugging) — Tips for troubleshooting and inspecting requests
- Foxpost adapter source: `packages/adapters/foxpost/src/`
- Core types: `packages/core/src/types/`

## License

MIT
