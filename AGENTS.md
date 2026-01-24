# AGENTS.md — Development & Implementation Guidance

This document is for **developers and AI agents** contributing to Shopickup. It outlines the implementation strategy, design patterns, and decision-making framework for building the library and its adapters.

**Audience:** Developers, AI agents/copilots, and contributors implementing features or adding carriers.

---

## Table of Contents

1. [Project Philosophy & Constraints](#project-philosophy--constraints)
2. [Core Implementation Priorities](#core-implementation-priorities)
3. [Adapter Development Framework](#adapter-development-framework)
4. [Code Organization & Patterns](#code-organization--patterns)
5. [Testing Approach](#testing-approach)
6. [Common Implementation Decisions](#common-implementation-decisions)
7. [Pitfalls & Anti-Patterns](#pitfalls--anti-patterns)
8. [Checklist for Completing Tasks](#checklist-for-completing-tasks)

---

## Project Philosophy & Constraints

### What Shopickup Is

- A **library** (not a microservice or framework) for abstracting carrier API differences.
- **Adapter-first:** each carrier is an independent npm package.
- **Zero persistence** in core — integrators provide their own storage.
- **Pluggable HTTP client** — adapters don't control HTTP behavior.
- **Extensible without code changes** — adding a carrier doesn't modify core or existing adapters.

### What Shopickup Is NOT

- Not a full orchestration engine (no workflow state machine in core).
- Not an API gateway (integrators build their own REST/GraphQL layer).
- Not a database (core doesn't touch persistence unless provided a Store).
- Not opinionated about logging, secrets, or deployment (all optional/pluggable).

### Key Non-Negotiables

1. **Adapters are stateless:** no global state, no persistent side effects.
2. **HTTP client is pluggable:** adapters never control timeout, retry, or instrumentation.
3. **Credentials pass at call time:** never stored or read from process.env in adapters.
4. **CarrierResource is the universal return type:** all methods return normalized results.
5. **Capability declaration is authoritative:** orchestrator checks this before calling methods.

---

## Core Implementation Priorities

### Phase 1: Foundation (Locked In ✅)

**Status:** Architecture finalized.

- [x] Canonical domain types (Shipment, Parcel, Address, Label, TrackingEvent, Rate)
- [x] `CarrierAdapter` interface with capability model
- [x] `AdapterContext` with pluggable HTTP client
- [x] Structured error types (`CarrierError` with categories)
- [x] Basic orchestration helpers (`executeCreateLabelFlow`, etc.)
- [x] Optional `Store` interface for persistence
- [x] In-memory store for testing
- [x] OpenAPI documentation structure

### Phase 2: Foxpost (Next Steps)

**Implement first real adapter** to validate the design:

1. Generate types from `carrier-docs/canonical/foxpost.yaml`
2. Implement FoxpostAdapter with `CREATE_SHIPMENT`, `CREATE_PARCEL`, `CLOSE_SHIPMENT`, `CREATE_LABEL`
3. Write contract tests (vs. Prism mock server)
4. Write unit tests for mapper functions
5. Publish as `@shopickup/adapters-foxpost`

### Phase 3: Dev Server & Examples

**Lightweight Express/Fastify server** for testing:

1. SQLite + Drizzle ORM schema for shipments/parcels/labels
2. Example store implementation
3. `/label` endpoint wiring core + Foxpost adapter
4. Webhook receiver stub

### Phase 4: Extensibility Tooling (Future)

- `create-adapter-cli` generator
- Codegen helpers for openapi-typescript
- Mock server startup script

---

## Adapter Development Framework

### Anatomy of an Adapter Package

```
packages/adapters/<carrier>/
├── src/
│   ├── index.ts              # Main export: class or factory function
│   ├── client.ts             # Thin HTTP wrapper
│   ├── mapper.ts             # Canonical <-> provider mappings
│   ├── types.ts              # Re-exports from gen/ + custom types
│   └── errors.ts             # Carrier-specific error codes (optional)
├── gen/
│   ├── index.ts              # openapi-typescript output (gitignored? or committed?)
│   └── ... (generated types)
├── tests/
│   ├── contract.spec.ts      # Against Prism mock server
│   ├── mapper.spec.ts        # Unit tests for mapping functions
│   ├── fixtures/             # Recorded carrier responses (optional)
│   └── integration.spec.ts   # Full flow tests
├── package.json              # peerDependency: @shopickup/core
├── tsconfig.json
└── README.md                 # Carrier-specific notes (rate limits, quirks, etc.)
```

### Standard Adapter Skeleton

```typescript
// packages/adapters/<carrier>/src/index.ts
import { CarrierAdapter, Capability, CarrierResource, AdapterContext } from "@shopickup/core";
import { Client } from "./client";
import { mapToCarrier, mapFromCarrier } from "./mapper";

export class <CarrierAdapter> implements CarrierAdapter {
  id = "<carrier-id>";                  // e.g., "foxpost"
  displayName = "<Carrier Display Name>";
  capabilities: Capability[] = [
    // List only capabilities this carrier supports
    // "RATES",
    // "CREATE_SHIPMENT",
    // "CREATE_PARCEL",
    // "CLOSE_SHIPMENT",
    // "CREATE_LABEL",
    // "VOID_LABEL",
    // "TRACK",
    // "LIST_PICKUP_POINTS",
    // "PICKUP",
    // "WEBHOOKS",
  ];

  requires = {
    // Optional: declare method dependencies
    // createLabel: ["CLOSE_SHIPMENT"]
  };

  private client: Client;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.client = new Client(baseUrl);
  }

  configure(opts: { baseUrl?: string }): void {
    if (opts.baseUrl) {
      this.baseUrl = opts.baseUrl;
      this.client = new Client(opts.baseUrl);
    }
  }

  // Implement only methods declared in capabilities
  // Example: if "CREATE_LABEL" is in capabilities, implement createLabel()
  // Otherwise, omit the method (it will throw NotImplementedError if called)

  async createLabel(
    parcelCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource & { labelUrl?: string | null }> {
    // 1. Call carrier API via ctx.http (always required)
    // 2. Map response to CarrierResource
    // 3. Log significant events via ctx.logger (optional)
    // 4. Translate carrier errors to CarrierError (with category)
    // 5. Return normalized result

    try {
      const res = await ctx.http!.post(`/parcels/${parcelCarrierId}/label`, {});
      return {
        carrierId: res.id,
        status: "created",
        labelUrl: res.pdfUrl,
        raw: res,
      };
    } catch (err) {
      // Translate carrier error to CarrierError
      throw new CarrierError("...", "Validation", { raw: err });
    }
  }
}
```

### Client (Thin HTTP Wrapper)

```typescript
// packages/adapters/<carrier>/src/client.ts
import { HttpClient } from "@shopickup/core";

/**
 * Thin wrapper around the carrier's HTTP API.
 * Maps generated types to method calls, handles common setup.
 * Note: Actual HTTP invocation (retry, timeout, etc.) is delegated to HttpClient.
 */
export class Client {
  constructor(
    private baseUrl: string,
    private httpClient?: HttpClient // Optional; can be injected for testing
  ) {}

  async createLabel(
    parcelId: string,
    options: { format?: "pdf" | "zpl" } = {}
  ): Promise<LabelResponse> {
    // Use injected httpClient if available, otherwise delegate to caller's context
    // This is mostly a pass-through; the actual HTTP call is in the adapter method
    return {
      /* ... */
    };
  }
}
```

### Mapper (Bidirectional Type Conversion)

```typescript
// packages/adapters/<carrier>/src/mapper.ts
import { Shipment, Parcel, Address, TrackingEvent } from "@shopickup/core";
import { CarrierShipment, CarrierParcel, CarrierAddress } from "./gen";

/**
 * Bidirectional mapping between canonical types (core) and provider types (gen/).
 * Rationale: adapters are thin translation layers; mappers handle the complexity.
 */

export const mapToCarrier = {
  shipment(canonical: Shipment): CarrierShipment {
    return {
      referenceNumber: canonical.id,
      sender: mapToCarrier.address(canonical.sender),
      recipient: mapToCarrier.address(canonical.recipient),
      weight: canonical.totalWeight,
      service: mapServiceCode(canonical.service),
    };
  },

  address(canonical: Address): CarrierAddress {
    return {
      name: canonical.name,
      street: canonical.street,
      city: canonical.city,
      postalCode: canonical.postalCode,
      country: canonical.country,
      // Handle carrier-specific quirks:
      // - Some carriers require 2-char country codes, some require 3-char
      // - Some have separate "company" and "name" fields
      // - Some trim strings to max length
    };
  },

  // ... other types
};

export const mapFromCarrier = {
  trackingEvent(carrier: CarrierTrackingEvent): TrackingEvent {
    return {
      timestamp: new Date(carrier.timestamp),
      status: mapStatusCode(carrier.status), // e.g., "IN_DELIVERY" -> "OUT_FOR_DELIVERY"
      location: carrier.location,
      description: carrier.description,
      raw: carrier,
    };
  },

  // ... other types
};

// Helper functions for complex mappings
function mapServiceCode(canonical: string): string {
  const mapping = {
    standard: "GROUND",
    express: "EXPRESS",
    economy: "ECONOMY",
  };
  return mapping[canonical] || "GROUND";
}

function mapStatusCode(carrier: string): string {
  const mapping = {
    DELIVERED: "DELIVERED",
    IN_DELIVERY: "OUT_FOR_DELIVERY",
    EXCEPTION: "EXCEPTION",
    // ... map all carrier statuses
  };
  return mapping[carrier] || "PENDING";
}
```

### Error Translation

```typescript
// In adapter method catch block
try {
  const res = await ctx.http!.post(...);
} catch (err) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as CarrierErrorResponse | undefined;

    if (status === 400) {
      // Validation error — don't retry
      throw new CarrierError(
        `Validation error: ${data?.message}`,
        "Validation",
        { carrierCode: data?.code, raw: data }
      );
    } else if (status === 401 || status === 403) {
      // Auth error — don't retry
      throw new CarrierError("Unauthorized", "Auth", { raw: data });
    } else if (status === 429) {
      // Rate limit — retry with backoff
      const retryAfter = err.response?.headers["retry-after"];
      throw new CarrierError("Rate limit exceeded", "RateLimit", {
        retryAfterMs: retryAfter ? parseInt(retryAfter) * 1000 : 60000,
        raw: data,
      });
    } else if (status >= 500) {
      // Server error — retry
      throw new CarrierError("Server error", "Transient", { raw: data });
    }
  }

  // Network error, timeout, etc. — retry
  throw new CarrierError("Network error", "Transient", { raw: err });
}
```

---

## Code Organization & Patterns

### TypeScript Patterns

1. **Use strict typing throughout:**

   ```typescript
   // Good: return type explicit
   async createLabel(...): Promise<CarrierResource & { labelUrl?: string }> { }

   // Bad: using any
   async createLabel(...): Promise<any> { }
   ```

2. **Use zod for runtime validation (optional but recommended for inputs):**

   ```typescript
   import { z } from "zod";

   const AddressSchema = z.object({
     name: z.string(),
     street: z.string(),
     // ...
   });

   // Validate before mapping
   const validated = AddressSchema.parse(input);
   ```

3. **Factory functions for HTTP clients (for testing):**

   ```typescript
   // This allows tests to inject a mock HTTP client
   export function createFoxpostAdapter(
     baseUrl: string,
     httpClient?: HttpClient
   ): FoxpostAdapter {
     const adapter = new FoxpostAdapter(baseUrl);
     // adapter can accept optional httpClient for testing
     return adapter;
   }
   ```

### Logging Best Practices

```typescript
// Good: structured logs at appropriate levels
ctx.logger?.debug("Creating parcel", { shipmentId, parcelId, weight });
ctx.logger?.info("Label created", { trackingNumber, labelId });
ctx.logger?.error("Failed to create label", { error: err.message, parcelId });

// Bad: logging raw objects or missing context
ctx.logger?.log(res);
ctx.logger?.log("Error");
```

### Error Handling Patterns

```typescript
// Always translate carrier errors to CarrierError
try {
  const res = await ctx.http!.post(...);
  return { carrierId: res.id, status: "created", raw: res };
} catch (err) {
  if (err instanceof CarrierError) {
    // Already translated
    throw err;
  }

  // Determine category based on error type
  const category = determineErrorCategory(err);
  throw new CarrierError(
    getErrorMessage(err),
    category,
    { raw: err }
  );
}
```

---

## Testing Approach

### Contract Testing (Prism)

Contract tests verify the adapter sends correct requests and handles sample responses. Use Prism to mock the carrier API.

**Setup:**

```typescript
// tests/contract.spec.ts
import { start as startMockServer } from "@stoplight/prism-http";
import { FoxpostAdapter } from "../src";

describe("FoxpostAdapter Contract Tests", () => {
  let mockServer: any;

  beforeAll(async () => {
    mockServer = await startMockServer({
      document: "../../carrier-docs/canonical/foxpost.yaml",
      port: 3456,
      dynamic: false,
      errors: true,
    });
  });

  afterAll(async () => {
    await mockServer.close();
  });

  it("should create a label", async () => {
    const adapter = new FoxpostAdapter("http://localhost:3456");
    const result = await adapter.createLabel!("parcel-123", {
      http: httpClient, // or use fetch/axios directly
      logger: console,
    });

    expect(result.carrierId).toBeDefined();
    expect(result.status).toBe("created");
  });
});
```

### Unit Testing (Mappers)

Unit tests verify mapping logic without HTTP calls.

```typescript
// tests/mapper.spec.ts
import { mapToFoxpost, mapFromFoxpost } from "../src/mapper";

describe("Mapper - toFoxpost", () => {
  it("maps canonical address to Foxpost format", () => {
    const canonical = {
      name: "John Doe",
      street: "123 Main St",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
    };

    const foxpost = mapToFoxpost.address(canonical);
    expect(foxpost.RecipientName).toBe("John Doe");
    expect(foxpost.City).toBe("Budapest");
  });
});
```

### Integration Testing (Full Flow)

Integration tests exercise the entire flow: adapter + store + mock server.

```typescript
// tests/integration.spec.ts
import { executeCreateLabelFlow } from "@shopickup/core";
import { InMemoryStore } from "@shopickup/core/stores";

describe("Foxpost - Full Flow", () => {
  it("should complete createLabel flow", async () => {
    const adapter = new FoxpostAdapter("http://localhost:3456");
    const store = new InMemoryStore();

    const result = await executeCreateLabelFlow({
      adapter,
      shipment: { /* canonical shipment */ },
      parcels: [{ /* canonical parcel */ }],
      credentials: { apiKey: "test" },
      context: { http: httpClient, logger: console },
      store,
    });

    expect(result.labelResources).toHaveLength(1);
    const saved = await store.getCarrierResource("parcel-1", "label");
    expect(saved).toBeDefined();
  });
});
```

---

## Common Implementation Decisions

### Decision: HTTP Client Injection

**Question:** Should the adapter own the HTTP client, or should it be injected?

**Answer:** **Always injected via context.** This allows:

- Integrators to add custom middleware (auth, tracing, caching)
- Tests to inject a mock client
- A single point of control for retries and timeouts

```typescript
// Correct
async createLabel(parcelId: string, ctx: AdapterContext) {
  const res = await ctx.http!.post(...); // Use injected client
}

// Incorrect
async createLabel(parcelId: string, ctx: AdapterContext) {
  const res = await this.axiosInstance.post(...); // Own instance
}
```

### Decision: Serialization Format

**Question:** Should adapters handle JSON serialization, or should it be generic?

**Answer:** **Adapters handle carrier-specific serialization.** Most carriers use JSON, but some use XML or multipart. The adapter's responsibility is to map domain types → carrier types and invoke the HTTP client appropriately.

```typescript
// In FoxpostAdapter.createLabel()
const foxpostPayload = mapToFoxpost.parcelRequest(parcelRequest);
const res = await ctx.http!.post(
  "/parcels/label",
  foxpostPayload // Already serialized by mapToFoxpost
);
```

### Decision: Credentials Location

**Question:** Should credentials be passed per-call, or configured once?

**Answer:** **Pass credentials per-call.** This:

- Avoids global state
- Allows multi-tenant integrators to switch credentials
- Prevents accidental credential leakage in error logs

```typescript
// Correct
const result = await executeCreateLabelFlow({
  adapter,
  credentials: { apiKey: process.env.FOXPOST_KEY },
  // ...
});

// Incorrect
const adapter = new FoxpostAdapter();
adapter.setApiKey(process.env.FOXPOST_KEY); // Don't do this
```

### Decision: Async vs Sync

**Question:** Should adapters support both async and sync calls?

**Answer:** **Always async.** Adapters are thin HTTP wrappers and HTTP is always async. Even if a carrier offered a sync API, we'd wrap it in a Promise for consistency.

```typescript
// Always return Promise
async createLabel(...): Promise<CarrierResource> { }

// Never mix sync and async
// Don't do: createLabelSync(...): CarrierResource { }
```

### Decision: LIST_PICKUP_POINTS Capability

**Question:** How should adapters fetch and return pickup point/APM data?

**Answer:** **Return normalized `PickupPoint` array in `FetchPickupPointsResponse`.** This:

- Abstracts carrier-specific data structure (APM, parcel locker, pickup point, etc.)
- Supports optional filtering by country/region
- Preserves carrier-specific data in `metadata` and `raw` fields
- Supports silent logging for large feeds to avoid verbose logs

```typescript
// In adapter: implement fetchPickupPoints if LIST_PICKUP_POINTS capability is declared
export class <CarrierAdapter> implements CarrierAdapter {
  capabilities = ["LIST_PICKUP_POINTS"];

  async fetchPickupPoints(
    req: FetchPickupPointsRequest,
    ctx: AdapterContext
  ): Promise<FetchPickupPointsResponse> {
    // 1. Optional: handle request filtering (country, bounds, etc.)
    // 2. Fetch from carrier (usually public/unauthenticated)
    // 3. Map each carrier point to canonical PickupPoint
    // 4. Filter by country if requested
    // 5. Use safeLog() for verbose response logging

    const carrierPoints = await ctx.http!.get("/apm/list");
    const normalized = carrierPoints.map(point => mapToPickupPoint(point));
    const filtered = req.options?.country 
      ? normalized.filter(p => p.country.toLowerCase() === req.options.country.toLowerCase())
      : normalized;

    return {
      points: filtered,
      summary: { totalCount: filtered.length },
      raw: carrierPoints,
    };
  }
}

// Example: map carrier APM to canonical PickupPoint
function mapToPickupPoint(carrierApm: any): PickupPoint {
  return {
    id: carrierApm.id,
    name: carrierApm.name,
    latitude: parseFloat(carrierApm.lat),
    longitude: parseFloat(carrierApm.lng),
    address: {
      street: carrierApm.street,
      city: carrierApm.city,
      postalCode: carrierApm.zip,
      country: carrierApm.country.toLowerCase(),
    },
    pickupAllowed: carrierApm.allowsPickup ?? true,
    dropoffAllowed: carrierApm.allowsDropoff ?? true,
    paymentOptions: carrierApm.payments || [],
    metadata: {
      carrierSpecificField1: carrierApm.field1,
      carrierSpecificField2: carrierApm.field2,
    },
    raw: carrierApm,
  };
}
```

**Logging Considerations:**

APM/pickup-point feeds can be large (1000+ locations). By default, `fetchPickupPoints` is in the silent operations list to prevent verbose logging:

```typescript
// Default: no logging for large feeds
const response = await adapter.fetchPickupPoints(req, ctx);

// Enable logging if needed
const response = await adapter.fetchPickupPoints(req, {
  ...ctx,
  loggingOptions: {
    silentOperations: [], // Disable silent mode
    logRawResponse: 'summary', // Show count + keys only
    maxArrayItems: 10, // Limit array items in logs
  }
});
```

---

## Pitfalls & Anti-Patterns

### Anti-Pattern 1: Global State in Adapters

```typescript
// WRONG: adapter holds state
export class FoxpostAdapter {
  private apiKey: string;

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async createLabel(parcelId: string) {
    await fetch(..., { headers: { auth: this.apiKey } });
  }
}

// CORRECT: credentials passed at call time
export class FoxpostAdapter {
  async createLabel(parcelId: string, ctx: AdapterContext) {
    await ctx.http!.post(..., {
      headers: { auth: ctx.credentials?.apiKey }
    });
  }
}
```

### Anti-Pattern 2: Persisting Data in Adapters

```typescript
// WRONG: adapter persists shipments
export class FoxpostAdapter {
  private db: Database;

  async createShipment(req: CreateShipmentRequest) {
    const res = await this.http.post(...);
    await this.db.insert(...); // Don't do this!
    return { carrierId: res.id };
  }
}

// CORRECT: return result, let caller decide persistence
export class FoxpostAdapter {
  async createShipment(req: CreateShipmentRequest, ctx: AdapterContext) {
    const res = await ctx.http!.post(...);
    return { carrierId: res.id, status: "created", raw: res };
    // Caller (via Store) persists the mapping
  }
}
```

### Anti-Pattern 3: Opinionated Error Handling

```typescript
// WRONG: adapter decides retry strategy
export class FoxpostAdapter {
  async createLabel(parcelId: string) {
    for (let i = 0; i < 3; i++) {
      try {
        return await this.http.post(...);
      } catch (err) {
        if (i < 2) await sleep(1000); // Don't retry in adapter
      }
    }
  }
}

// CORRECT: throw structured error, let caller decide
export class FoxpostAdapter {
  async createLabel(parcelId: string, ctx: AdapterContext) {
    try {
      return await ctx.http!.post(...);
    } catch (err) {
      throw new CarrierError(..., "Transient", { raw: err });
      // Caller (integrator) decides retry strategy
    }
  }
}
```

### Anti-Pattern 4: Not Handling Carrier-Specific Quirks

```typescript
// WRONG: assumes all carriers work the same
const label = await adapter.createLabel(parcelId, ctx);

// CORRECT: check capability, handle dependencies
if (adapter.requires?.createLabel?.includes("CLOSE_SHIPMENT")) {
  // This carrier requires close before label
  await adapter.closeShipment!(shipmentId, ctx);
}
const label = await adapter.createLabel(parcelId, ctx);
```

### Anti-Pattern 5: Storing Raw Responses Insecurely

```typescript
// WRONG: logs credentials or sensitive data
ctx.logger?.debug("Response", { raw: JSON.stringify(res) });

// CORRECT: sanitize before logging
ctx.logger?.debug("Response", { carrierCode: res.id, status: res.status });
// Store full response in database (under encryption if needed)
await store.saveCarrierResource(parcelId, { raw: res });
```

---

## Checklist for Completing Tasks

### Scaffolding Core Types & Interfaces

- [ ] Define canonical `Shipment`, `Parcel`, `Address`, `Label`, `TrackingEvent`, `Rate` types in TypeScript
- [ ] Export from `@shopickup/core`
- [ ] Add Zod schemas (optional but recommended)
- [ ] Document each type with JSDoc comments
- [ ] Add tests for type validation

### Implementing a Carrier Adapter

- [ ] Create `packages/adapters/<carrier>/` directory
- [ ] Create `carrier-docs/canonical/<carrier>.yaml` with `x-capabilities` extension
- [ ] Run `pnpm run codegen --carrier=<carrier>` to generate types
- [ ] Create `src/index.ts` implementing `CarrierAdapter` interface
- [ ] Create `src/client.ts` (thin HTTP wrapper if needed)
- [ ] Create `src/mapper.ts` with bidirectional mapping functions
- [ ] Implement error translation to `CarrierError`
- [ ] Write contract tests against Prism mock server
- [ ] Write unit tests for mapper functions
- [ ] Write integration tests with full flow
- [ ] Add JSDoc explaining carrier-specific quirks
- [ ] Create `package.json` with `peerDependency: @shopickup/core`
- [ ] Test locally (`pnpm install` in monorepo, `pnpm run test`)
- [ ] Ready for publication

### Implementing the Dev Server

- [ ] Create `examples/dev-server/` with Express/Fastify
- [ ] Create SQLite schema with `shipments`, `parcels`, `labels`, `carrier_resources` tables
- [ ] Implement `Store` interface for SQLite
- [ ] Create `/label` endpoint wiring core + Foxpost adapter
- [ ] Create `/webhook` endpoint (stub)
- [ ] Add `docker-compose.dev.yml` (optional)
- [ ] Document how to run locally
- [ ] Provide example payload in README

### Adding a New Capability to Core

- [ ] Define the new capability in `Capability` enum
- [ ] Add corresponding method to `CarrierAdapter` interface
- [ ] Add flow helper in `executeCreateLabelFlow` (or new helper)
- [ ] Update `Store` interface if persistence is needed
- [ ] Write tests for the new flow
- [ ] Update README and ARCHITECTURE.md

### Fixing a Bug

- [ ] Write a failing test that reproduces the bug
- [ ] Identify the root cause
- [ ] Implement the fix
- [ ] Verify the test now passes
- [ ] Check for similar issues elsewhere
- [ ] Commit with a clear message

---

## Summary

**Remember:**

- **Adapters are stateless translation layers** — no global state, no persistence.
- **HTTP client is pluggable** — always use `ctx.http`, never own client.
- **Credentials pass at call time** — never store in adapter.
- **Return normalized results** — all methods return `CarrierResource`.
- **Errors are structured** — use `CarrierError` with category for intelligent handling.
- **Test comprehensively** — contract tests (vs. mock), unit tests (mappers), integration tests (full flow).
- **Document carrier quirks** — JSDoc comments explain mappings and dependencies.

Follow these principles, and you'll build adapters that are testable, maintainable, and easy for integrators to use.
