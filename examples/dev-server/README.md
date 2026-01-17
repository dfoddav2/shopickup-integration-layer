# Shopickup Dev Server (Fastify)

This example application demonstrates how to wire together the Shopickup core library, a carrier adapter (Foxpost), and a simple SQLite-backed Store. It's intended as a developer convenience for testing adapter flows locally.

Features:
- Fastify server exposing endpoints for creating labels and fetching saved labels
- SQLite store (via better-sqlite3 + drizzle-orm) for simple persistence
- Uses adapter `@shopickup/adapters-foxpost` and core flow helper `executeCreateLabelFlow`
- Simple axios-based HTTP client compatible with `AdapterContext.http`

Requirements
- Node 18+
- npm
- (Optional) Docker for running Prism mock server for contract testing

Install

From repository root:

```bash
# You can install dependencies for the example only
cd examples/dev-server
npm install
```

Run

```bash
# Start dev server (ts-node)
npm run dev

# Or build and run
npm run build
npm start
```

Endpoints

- `GET /health` - health check
- `POST /label` - create parcel(s) and generate label(s)
  - Body:
    ```json
    {
      "shipment": { /* Shipment object (see @shopickup/core types) */ },
      "parcels": [ /* array of Parcel objects */ ],
      "credentials": { "apiKey": "FOO" }
    }
    ```
  - Returns a `CreateLabelFlowResult` with created parcel resources and label resources.

- `GET /label/:trackingNumber` - Fetch stored label by tracking number

Testing with Foxpost Sandbox

1. Set `FOXPOST_API_KEY` environment variable to your sandbox API key (if required):

```bash
export FOXPOST_API_KEY=your_api_key
npm run dev
```

2. POST to `/label` with a sample shipment and parcel to create a parcel and generate a label.

Contract Testing with Prism (Optional)

You can run a Prism mock server with the provided OpenAPI spec for more realistic contract tests:

```bash
# From repo root, run Prism in Docker (example)
docker run --rm -p 3456:4010 -v $(pwd)/carrier-docs/hu-foxpost:/etc/swagger stoplight/prism-cli mock -h 0.0.0.0 /etc/swagger/hu-foxpost.openapi.yaml

# Update the adapter base URL to the mock server (in examples/dev-server/src/server.ts)
# or set FOXPOST_BASE_URL env var and modify code to read it
```

Notes & Limitations
- This dev server is intentionally minimal and not production-ready.
- Use real migrations for DB schema management in real projects.
- The Store uses simple JSON serialization for complex fields; adapt as needed.

Next Steps
- Add endpoints for tracking updates and webhooks
- Add OpenAPI for the dev server itself
- Implement authentication and request validation with `zod`

