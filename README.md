# Shopickup: Universal Multi-Carrier Shipping Integration Layer

> **Status:** Architecture finalized. Shopickup is a TypeScript-first, npm-publishable **adapter library** for shipping carriers. Not a microservice — a set of importable packages that handle carrier API complexity.

## 1. Project Overview & Philosophy

Shopickup solves the **carrier API heterogeneity problem** by providing:

1. **A canonical data model** (via `@shopickup/core`) that normalizes shipping concepts (shipments, parcels, labels, tracking).
2. **Pluggable carrier adapters** as independent npm packages, each implementing a strict `CarrierAdapter` contract.
3. **Zero persistence** in the core — integrators own their own data store (Postgres, SQLite, DynamoDB, etc.) and pass an optional `Store` interface.
4. **Lightweight orchestration helpers** for composing adapter methods into workflows (e.g., "create shipment → create parcel → close → create label").
5. **A minimal dev/test server** (Express/Fastify) bundled as an example; not intended for production.

### Key Principles

- **Library, not microservice:** Import adapters directly into your Node.js app.
- **Extensibility without code changes:** Adding a new carrier requires zero modifications to core or existing adapters.
- **Carrier API first:** OpenAPI specs in `carrier-docs/` drive adapter development (types generated, thin HTTP wrappers written by hand).
- **Pluggable HTTP client:** Adapters accept an optional `HttpClient` interface so consumers can inject their own HTTP layer (fetch, axios, Node.js http, etc.).
- **Stateless adapters:** Adapters map input → carrier API → output. All mappings between internal IDs and carrier IDs are managed by the integrator's `Store`.

### Directory Structure

```text
/shopickup-integration-layer
├── package.json                   # Root workspaces config
├── README.md                      # This file
├── ARCHITECTURE.md                # Detailed system design
├── AGENTS.md                      # Developer guidance for agents/contributors
├── ADAPTER_DEVELOPMENT.md         # Step-by-step carrier adapter guide
│
├── carrier-docs/
│   ├── raw/
│   │   └── foxpost.yaml          # Vendor OpenAPI spec (source of truth)
│   └── canonical/
│       └── foxpost.yaml          # Annotated with x-capabilities, x-requires, etc.
│
├── packages/
│   ├── core/                      # Canonical types, interfaces, orchestration helpers
│   │   ├── src/
│   │   │   ├── types/            # Canonical domain types (Shipment, Parcel, etc.)
│   │   │   ├── capabilities.ts   # Capability enum
│   │   │   ├── adapter.ts        # CarrierAdapter interface
│   │   │   ├── store.ts          # Optional Store interface
│   │   │   ├── flows.ts          # Orchestration helpers (createLabelFlow, etc.)
│   │   │   ├── errors.ts         # Structured error types
│   │   │   └── testing.ts        # Test harness (mock server, contract verifier)
│   │   └── package.json
│   │
│   ├── adapters/
│   │   ├── template/             # Starter template for new carriers
│   │   │   ├── src/
│   │   │   │   ├── index.ts      # Exports FoxpostAdapter class
│   │   │   │   ├── client.ts     # Thin HTTP wrapper (axios/fetch)
│   │   │   │   ├── mapper.ts     # Canonical <-> provider mappings
│   │   │   │   └── types.ts      # Re-exports from generated types
│   │   │   ├── gen/              # openapi-typescript generated types
│   │   │   ├── tests/            # Contract tests, unit tests
│   │   │   └── package.json      # peerDependency: @shopickup/core
│   │   │
│   │   └── foxpost/              # First real carrier
│   │       └── ... (same structure as template)
│   │
│   └── tools/
│       └── create-adapter-cli/    # Generator: pnpm create-adapter --name=dhl
│
├── examples/
│   └── dev-server/               # Lightweight example server (Express/Fastify)
│       ├── src/
│       │   ├── index.ts          # Main server
│       │   ├── db.ts             # SQLite + Drizzle ORM (optional example)
│       │   └── routes/           # Example endpoints: POST /label, POST /webhook
│       ├── package.json
│       └── sqlite.db             # (gitignored)
│
└── scripts/
    ├── codegen.sh                # Runs openapi-typescript to gen types
    └── start-mock.sh             # Spins up Prism mock server for contract tests
```

## 2. Architecture Overview

### The Canonical Domain Model

All carriers are normalized to these core concepts:

- **Shipment:** Top-level container (represents a single physical mailing).
- **Parcel:** One or more items within a shipment.
- **Address:** Sender/recipient with validation logic.
- **Label:** Generated shipping label (PDF/PNG) + tracking number.
- **TrackingEvent:** Normalized status update (PENDING, IN_TRANSIT, DELIVERED, EXCEPTION).
- **Rate:** Available service + price for a route/weight.

### The CarrierAdapter Interface

All adapters implement this strict contract (simplified):

```typescript
export type Capability =
  | "RATES" | "CREATE_SHIPMENT" | "CREATE_PARCEL"
  | "CLOSE_SHIPMENT" | "CREATE_LABEL" | "VOID_LABEL"
  | "TRACK" | "PICKUP" | "WEBHOOKS";

export interface AdapterContext {
  logger?: Logger;
  http?: HttpClient;           // Pluggable HTTP client (required)
  telemetry?: TelemetryClient; // Optional
}

export interface CarrierAdapter {
  id: string;                  // e.g., "foxpost"
  displayName?: string;
  capabilities: Capability[];
  requires?: { createLabel?: Capability[] };  // e.g., ["CLOSE_SHIPMENT"]

  configure?(opts: { baseUrl?: string }): void;
  getRates?(req: RatesRequest, ctx: AdapterContext): Promise<RatesResponse>;
  createShipment?(req: CreateShipmentRequest, ctx: AdapterContext): Promise<CarrierResource>;
  createParcel?(shipmentCarrierId: string, req: ParcelRequest, ctx: AdapterContext): Promise<CarrierResource>;
  closeShipment?(shipmentCarrierId: string, ctx: AdapterContext): Promise<CarrierResource>;
  createLabel?(parcelCarrierId: string, ctx: AdapterContext): Promise<CarrierResource & { labelUrl?: string | null }>;
  voidLabel?(labelId: string, ctx: AdapterContext): Promise<CarrierResource>;
  track?(trackingNumber: string, ctx: AdapterContext): Promise<TrackingUpdate>;
}
```

- Adapters are **stateless:** they accept input + credentials + context and return normalized results.
- **No persistence** in the adapter: the caller's `Store` manages mappings between internal IDs and carrier IDs.
- **Pluggable HTTP client:** the `http` client in context is injected by the caller (axios, fetch, etc.).

### Orchestration Helpers (Core)

Core exports lightweight flow helpers for common patterns:

```typescript
const result = await executeCreateLabelFlow({
  adapter,           // CarrierAdapter instance
  shipment,          // Internal shipment object
  parcels,           // List of parcels
  credentials,       // { apiKey, ... }
  context,           // { logger, http, ... }
});
// result: { label, trackingNumber, raw, ... }
```

The helper:

1. Checks adapter capabilities.
2. Calls `createShipment` if supported.
3. Calls `createParcel` for each parcel if supported.
4. Calls `closeShipment` if adapter `requires` it.
5. Calls `createLabel`.
6. Returns normalized label + raw carrier responses for debugging.

### Error Handling

Adapters throw structured `CarrierError` types:

```typescript
class CarrierError extends Error {
  category: "Validation" | "Auth" | "RateLimit" | "Transient" | "Permanent";
  carrierCode?: string;
  raw?: unknown;  // raw carrier error for debugging
}
```

Consumers (via `Store` interface) decide retry logic based on category.

### Persistence & Store Interface (Optional)

Core defines a pluggable `Store` interface:

```typescript
export interface Store {
  saveShipment(shipment: Shipment): Promise<void>;
  getShipment(id: string): Promise<Shipment | null>;
  saveCarrierResource(shipmentId: string, resource: CarrierResource): Promise<void>;
  appendEvent(shipmentId: string, event: DomainEvent): Promise<void>;
}
```

- **In-memory store** available in core for testing.
- Integrators implement their own (Postgres, SQLite, DynamoDB, etc.).
- Not required if the integrator is stateless (just calling adapters synchronously).

### Testing & Contract Verification

Core provides:

1. **Mock server generator** (Prism from OpenAPI) — spins up a mock carrier API for contract tests.
2. **Contract test harness** — verify adapter sends expected requests and handles sample responses.
3. **Fixture management** — record/replay carrier responses for deterministic unit tests.

## 3. Carrier Adapter Development Workflow

### Step 1: Define Carrier OpenAPI

Add `carrier-docs/canonical/<carrier>.yaml` with `x-` OpenAPI extensions:

```yaml
info:
  title: Foxpost Carrier API
  version: 1.0.0
  x-capabilities:
    - CREATE_SHIPMENT
    - CREATE_PARCEL
    - CLOSE_SHIPMENT
    - CREATE_LABEL
  x-requires:
    createLabel:
      - CLOSE_SHIPMENT  # Must close before label

paths:
  /shipments:
    post:
      operationId: createShipment
      x-operation-id: createShipment
      x-capability: CREATE_SHIPMENT
```

### Step 2: Generate Types

```bash
pnpm run codegen --carrier=foxpost
# Outputs: packages/adapters/foxpost/gen/*.ts (types only)
```

### Step 3: Implement Adapter

Create `packages/adapters/foxpost/src/index.ts`:

```typescript
import { CarrierAdapter, Capability, AdapterContext } from "@shopickup/core";
import { FoxpostClient } from "./client";
import { mapToFoxpost, mapFromFoxpost } from "./mapper";

export class FoxpostAdapter implements CarrierAdapter {
  id = "foxpost";
  capabilities: Capability[] = ["CREATE_SHIPMENT", "CREATE_PARCEL", "CLOSE_SHIPMENT", "CREATE_LABEL"];
  requires = { createLabel: ["CLOSE_SHIPMENT"] };

  private client: FoxpostClient;

  constructor(baseUrl: string) {
    this.client = new FoxpostClient(baseUrl);
  }

  async createLabel(parcelId: string, ctx: AdapterContext): Promise<CarrierResource & { labelUrl?: string }> {
    const response = await ctx.http!.post(`/parcels/${parcelId}/label`, {});
    return {
      carrierId: response.labelId,
      status: "created",
      labelUrl: response.pdfUrl,
      raw: response,
    };
  }
  // ... other methods
}
```

### Step 4: Write Contract Tests

`packages/adapters/foxpost/tests/contract.spec.ts` — uses the mock server:

```typescript
it("should create a label", async () => {
  const adapter = new FoxpostAdapter("http://localhost:3000");  // mock server
  const result = await adapter.createLabel("parcel-123", { http: fetchClient });
  expect(result.carrierId).toBeDefined();
  expect(result.labelUrl).toMatch(/\.pdf$/);
});
```

### Step 5: Publish

```bash
cd packages/adapters/foxpost
npm publish --access public
```

Consumers can then:

```bash
npm install @shopickup/adapters-foxpost
```

## 4. Consumer Integration (How to Use)

### Simple Synchronous Usage

```typescript
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";
import { executeCreateLabelFlow } from "@shopickup/core";
import { httpClient } from "your-http-lib";  // axios, fetch, etc.

const adapter = new FoxpostAdapter("https://api.foxpost.hu");

const result = await executeCreateLabelFlow({
  adapter,
  shipment: { /* ... */ },
  parcels: [{ /* ... */ }],
  credentials: { apiKey: process.env.FOXPOST_KEY },
  context: { http: httpClient, logger: console },
});

console.log(result.label.trackingNumber);
console.log(result.label.pdfUrl);
```

### With Persistence (SQLite Example)

See `examples/dev-server/` for a complete example using SQLite + Drizzle ORM:

```typescript
const store = new SqliteStore(db);
const shipment = await store.getShipment(shipmentId);

const result = await executeCreateLabelFlow({
  adapter,
  shipment,
  parcels,
  credentials,
  context: { http: httpClient, logger: console },
});

// Save carrier resource mapping
await store.saveCarrierResource(shipmentId, result.carrierResource);
```

## 5. Development Workflow

### Initial Setup

```bash
git clone https://github.com/yourusername/shopickup-integration-layer.git
cd shopickup-integration-layer
pnpm install
pnpm run build
pnpm run test
```

### Adding a New Carrier

```bash
# Generate adapter skeleton
pnpm run tools/create-adapter --name=dhl

# This creates:
# - packages/adapters/dhl/
# - carrier-docs/canonical/dhl.yaml (with stubs)
# - src/index.ts, client.ts, mapper.ts, tests/

# Then implement and test
pnpm run codegen --carrier=dhl
# ... implement adapter methods ...
pnpm run test --filter=@shopickup/adapters-dhl
```

### Running the Dev Server

```bash
cd examples/dev-server
pnpm install
pnpm run dev
# Server running at http://localhost:3000

# Test endpoint
curl -X POST http://localhost:3000/label \
  -H "Content-Type: application/json" \
  -d '{
    "shipment": { /* ... */ },
    "parcels": [{ /* ... */ }],
    "carrier": "foxpost"
  }'
```

## 6. Design Principles & Decisions

| Principle | Decision | Rationale |
|-----------|----------|-----------|
| **Distribution** | Library (npm package) | Easy to import, versioned independently, no ops overhead |
| **Persistence** | Leave to integrator | Different apps need different stores; core stays small |
| **HTTP client** | Pluggable interface | Consumers control retries, caching, instrumentation |
| **OpenAPI specs** | In `carrier-docs/` | Single source of truth for carrier APIs, drives codegen |
| **Errors** | Structured types | Integrators can decide retry/fallback logic cleanly |
| **Example server** | SQLite + Drizzle | Lightweight, self-contained, not opinionated |

## 7. Non-Functional Goals

1. **Zero-downtime extensibility:** Add a carrier adapter without modifying core or other adapters.
2. **Strict typing:** All domain models and adapter methods are strongly typed (TypeScript + Zod).
3. **Observable:** Adapters emit context (logger, telemetry hooks) for integration with observability platforms.
4. **Testable:** Mock server + contract tests make it easy to test adapters without real API calls.

## 8. Governance & Contributing

- **Code ownership:** Core maintained by project stewards; adapters can be community-maintained.
- **Versioning:** Core follows semver; adapters declare peerDependency ranges.
- **Review process:** Adapters must pass contract tests and include JSDoc explaining carrier-specific mappings.
- **Security:** Credentials never stored in adapters; always passed at runtime.

For detailed contribution guidelines, see **ADAPTER_DEVELOPMENT.md**.

## 9. Roadmap

- **v1 (current):** Core types, Foxpost adapter, dev server.
- **v1.1:** DHL, UPS adapters; webhook receiver helpers.
- **v1.2:** Async flow orchestration (background jobs, event sourcing).
- **v2:** Rate negotiation, pickup scheduling, returns management.
