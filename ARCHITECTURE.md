# Shopickup Architecture Deep Dive

This document provides a comprehensive technical design of the Shopickup integration layer, covering data models, interfaces, flow orchestration, error handling, testing, and security considerations.

## Table of Contents

1. [Core Concepts & Data Model](#core-concepts--data-model)
2. [Adapter Interface & Contract](#adapter-interface--contract)
3. [Orchestration & Flows](#orchestration--flows)
4. [Persistence & Store Interface](#persistence--store-interface)
5. [Error Handling & Resilience](#error-handling--resilience)
6. [Testing Strategy](#testing-strategy)
7. [Security & Credentials Management](#security--credentials-management)
8. [Extensibility & Plugin Architecture](#extensibility--plugin-architecture)
9. [Observability & Debugging](#observability--debugging)

---

## Core Concepts & Data Model

### Canonical Domain Model

All carriers are normalized to a unified domain model defined in `@shopickup/core`. This ensures integrators can reason about shipping concepts without carrier-specific knowledge.

#### Shipment

Represents a single physical mailing from shipper to recipient.

```typescript
interface Shipment {
  id: string;                          // Internal unique ID
  carrierIds?: Record<string, string>; // Maps carrier -> carrier's shipment ID
  sender: Address;
  recipient: Address;
  service: "standard" | "express" | "economy" | "overnight"; // Normalized service
  reference?: string;                  // Customer reference (e.g., order ID)
  dimensions?: {
    length: number;     // cm
    width: number;      // cm
    height: number;     // cm
  };
  totalWeight: number;  // grams
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Parcel

A physical container within a shipment (most shipments have exactly one parcel).

```typescript
interface Parcel {
  id: string;
  shipmentId: string;
  carrierIds?: Record<string, string>;  // Maps carrier -> carrier's parcel ID
  weight: number;                       // grams
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  items?: {
    sku?: string;
    quantity: number;
    description?: string;
    weight?: number;
  }[];
  status: "draft" | "created" | "closed" | "label_generated" | "shipped" | "delivered";
  metadata?: Record<string, unknown>;
}
```

#### Address

Represents a sender or recipient location with carrier-agnostic validation.

```typescript
interface Address {
  name: string;           // Person or company name
  street: string;         // Street address (no PO boxes by default)
  city: string;
  postalCode: string;     // Zip code (format varies by country)
  country: string;        // ISO 3166-1 alpha-2 (e.g., "US", "HU")
  phone?: string;
  email?: string;
  company?: string;
  province?: string;      // State/region
  isPoBox?: boolean;
}
```

#### Label

Represents a generated shipping label that can be printed.

```typescript
interface Label {
  id: string;
  parcelId: string;
  trackingNumber: string;
  carrier: string;
  labelUrl?: string;       // URL to PDF or label image
  labelData?: Buffer;      // Raw PDF/ZPL data if not stored separately
  createdAt: Date;
  expiresAt?: Date;        // Some carriers' labels expire
  metadata?: {
    format?: "PDF" | "PNG" | "ZPL";  // Label format
    returnLabel?: boolean;
  };
}
```

#### TrackingEvent

A normalized status update in a parcel's journey.

```typescript
interface TrackingEvent {
  timestamp: Date;        // ISO 8601 UTC
  status: "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION" | "RETURNED";
  location?: {
    city?: string;
    country?: string;
    facility?: string;
  };
  description: string;    // Human-readable description
  raw?: unknown;          // Raw carrier event data for debugging
}
```

#### Rate

Available shipping option with pricing.

```typescript
interface Rate {
  service: string;        // e.g., "standard", "express"
  carrier: string;
  price: number;          // In smallest currency unit (e.g., cents for USD)
  currency: string;       // ISO 4217 (e.g., "USD", "HUF")
  estimatedDays?: number;
  metadata?: Record<string, unknown>;
}
```

---

## Adapter Interface & Contract

### CarrierAdapter Interface

The single contract all carriers must implement. Minimal, optional methods that adapters declare via `capabilities`.

```typescript
export type Capability =
  | "RATES"           // getRates()
  | "CREATE_SHIPMENT" // createShipment()
  | "CREATE_PARCEL"   // createParcel()
  | "CLOSE_SHIPMENT"  // closeShipment()
  | "CREATE_LABEL"    // createLabel()
  | "VOID_LABEL"      // voidLabel()
  | "TRACK"           // track()
  | "PICKUP"          // requestPickup()
  | "WEBHOOKS";       // Supports webhook notifications

export interface CarrierResource {
  /**
   * Provider-assigned ID for this resource.
   * Examples: shipment ID, parcel ID, label ID.
   */
  carrierId?: string;

  /**
   * Normalized status (e.g., "created", "pending", "failed").
   * Adapter-specific, but should be consistent within that adapter.
   */
  status?: string;

  /**
   * Raw carrier JSON response. Stored for debugging and potential future use.
   */
  raw?: unknown;

  /**
   * Optional metadata. Used for carrier-specific quirks (e.g., "labelExpiresAt").
   */
  meta?: Record<string, unknown>;
}

export interface AdapterContext {
  /**
   * Injected HTTP client (axios, fetch, Node.js http, etc.).
   * Required. Allows integrator to control retries, caching, instrumentation.
   */
  http: HttpClient;

  /**
   * Optional logger instance. Adapter should log significant events.
   */
  logger?: Logger;

  /**
   * Optional telemetry client for metrics (optional).
   */
  telemetry?: TelemetryClient;
}

export interface HttpClient {
  get<T>(url: string, config?: any): Promise<T>;
  post<T>(url: string, data?: any, config?: any): Promise<T>;
  put<T>(url: string, data?: any, config?: any): Promise<T>;
  delete<T>(url: string, config?: any): Promise<T>;
}

export interface CarrierAdapter {
  /**
   * Unique identifier for this carrier (e.g., "foxpost", "dhl", "ups").
   */
  id: string;

  /**
   * Display name for UI/logging (e.g., "Foxpost Hungary").
   */
  displayName?: string;

  /**
   * List of capabilities this adapter supports.
   * Orchestrator checks this to decide which methods to call.
   */
  capabilities: Capability[];

  /**
   * Optional: declares dependencies for certain operations.
   * Example: { createLabel: ["CLOSE_SHIPMENT"] }
   * means closeShipment() MUST be called before createLabel().
   */
  requires?: {
    createLabel?: Capability[];
    voidLabel?: Capability[];
    track?: Capability[];
  };

  /**
   * Optional: called once at adapter instantiation to configure
   * base URL, timeouts, or other settings.
   */
  configure?(opts: { baseUrl?: string; timeout?: number }): void;

  // ========== Capability Methods ==========

  /**
   * Fetch available rates for a shipment.
   */
  getRates?(
    req: RatesRequest,
    ctx: AdapterContext
  ): Promise<RatesResponse>;

  /**
   * Create a shipment (some carriers require this before parcels).
   */
  createShipment?(
    req: CreateShipmentRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Add a parcel to a shipment.
   */
  createParcel?(
    shipmentCarrierId: string,
    req: ParcelRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Close/finalize a shipment (required by some carriers before labeling).
   */
  closeShipment?(
    shipmentCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Generate a label for a parcel.
   */
  createLabel?(
    parcelCarrierId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource & { labelUrl?: string | null }>;

  /**
   * Void/cancel a label (delete).
   */
  voidLabel?(
    labelId: string,
    ctx: AdapterContext
  ): Promise<CarrierResource>;

  /**
   * Track a parcel by tracking number.
   */
  track?(
    trackingNumber: string,
    ctx: AdapterContext
  ): Promise<TrackingUpdate>;

  /**
   * Request a pickup from the shipper location.
   */
  requestPickup?(
    req: PickupRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource>;
}

export interface RatesRequest {
  shipment: Shipment;
  parcels: Parcel[];
  services?: string[]; // Filter to specific services
}

export interface RatesResponse {
  rates: Rate[];
}

export interface CreateShipmentRequest {
  shipment: Shipment;
  credentials: Record<string, unknown>; // API key, username, etc.
}

export interface ParcelRequest {
  parcel: Parcel;
  credentials: Record<string, unknown>;
}

export interface TrackingUpdate {
  trackingNumber: string;
  events: TrackingEvent[];
  status: "PENDING" | "IN_TRANSIT" | "DELIVERED" | "EXCEPTION" | "RETURNED";
}

export interface PickupRequest {
  shipment: Shipment;
  preferredDate?: Date;
  instructions?: string;
  credentials: Record<string, unknown>;
}
```

### Key Design Decisions

1. **Stateless adapters:** Adapters accept all required data in method parameters. No global state or side effects.
2. **Pluggable HTTP client:** Allows integrators to control retries, timeouts, instrumentation, and request/response logging.
3. **Capabilities declaration:** Adapters declare what they support; orchestrator decides flow.
4. **Optional methods:** Only implement what the carrier supports; unsupported operations throw `NotImplementedError`.
5. **Normalized return type:** All methods return `CarrierResource` with `carrierId`, `status`, and raw response, making it easy to map back to internal IDs.

---

## Orchestration & Flows

### High-Level Flow Executor

Core provides orchestration helpers that compose adapter methods into common workflows. The orchestrator is **not** a persistent state machine — it's a request-scoped helper that executes a sequence of adapter calls and returns a result.

#### Create Label Flow Example

```typescript
export async function executeCreateLabelFlow(opts: {
  adapter: CarrierAdapter;
  shipment: Shipment;
  parcels: Parcel[];
  credentials: Record<string, unknown>;
  context: AdapterContext;
  store?: Store; // Optional
}): Promise<CreateLabelFlowResult> {
  const { adapter, shipment, parcels, credentials, context, store } = opts;

  const result: CreateLabelFlowResult = {
    shipmentResource: null,
    parcelResources: [],
    labelResources: [],
    errors: [],
  };

  try {
    // Step 1: Create shipment (if supported)
    if (adapter.capabilities.includes("CREATE_SHIPMENT")) {
      const shipmentRes = await adapter.createShipment!(
        { shipment, credentials },
        context
      );
      result.shipmentResource = shipmentRes;
      if (store && shipmentRes.carrierId) {
        await store.saveCarrierResource(shipment.id, "shipment", shipmentRes);
      }
    }

    // Step 2: Create parcels (if supported)
    if (adapter.capabilities.includes("CREATE_PARCEL")) {
      for (const parcel of parcels) {
        const shipmentCarrierId =
          result.shipmentResource?.carrierId || shipment.id;
        const parcelRes = await adapter.createParcel!(
          shipmentCarrierId,
          { parcel, credentials },
          context
        );
        result.parcelResources.push(parcelRes);
        if (store && parcelRes.carrierId) {
          await store.saveCarrierResource(parcel.id, "parcel", parcelRes);
        }
      }
    }

    // Step 3: Close shipment if required before label
    if (
      adapter.requires?.createLabel?.includes("CLOSE_SHIPMENT") &&
      adapter.capabilities.includes("CLOSE_SHIPMENT")
    ) {
      const closeRes = await adapter.closeShipment!(
        result.shipmentResource?.carrierId || shipment.id,
        context
      );
      if (store) {
        await store.appendEvent(shipment.id, {
          type: "SHIPMENT_CLOSED",
          resource: closeRes,
        });
      }
    }

    // Step 4: Create labels (for each parcel if supported)
    if (adapter.capabilities.includes("CREATE_LABEL")) {
      for (const parcelRes of result.parcelResources) {
        const labelRes = await adapter.createLabel!(
          parcelRes.carrierId || "",
          context
        );
        result.labelResources.push(labelRes);
        if (store && labelRes.carrierId) {
          await store.saveCarrierResource(
            parcels[result.labelResources.length - 1].id,
            "label",
            labelRes
          );
        }
      }
    }

    return result;
  } catch (error) {
    result.errors.push({
      step: "unknown",
      error,
    });
    throw error;
  }
}

export interface CreateLabelFlowResult {
  shipmentResource: CarrierResource | null;
  parcelResources: CarrierResource[];
  labelResources: CarrierResource[];
  errors: Array<{ step: string; error: unknown }>;
}
```

### Key Principles

1. **Composition over orchestration:** Instead of a centralized state machine, compose adapter methods declaratively.
2. **Capability-driven:** Check adapter capabilities before calling methods.
3. **Optional persistence:** If a `Store` is provided, save mappings; otherwise, return everything and let caller persist.
4. **Fail fast:** If a step fails, throw immediately; caller decides retry logic.

---

## Persistence & Store Interface

### Store Interface

Since different integrators need different storage strategies (Postgres, SQLite, DynamoDB, etc.), core defines an **optional** `Store` interface that orchestrators can use.

```typescript
export interface Store {
  /**
   * Save or update an internal shipment record.
   */
  saveShipment(shipment: Shipment): Promise<void>;

  /**
   * Retrieve a shipment by ID.
   */
  getShipment(id: string): Promise<Shipment | null>;

  /**
   * Save an internal parcel record.
   */
  saveParcel(parcel: Parcel): Promise<void>;

  /**
   * Retrieve a parcel by ID.
   */
  getParcel(id: string): Promise<Parcel | null>;

  /**
   * Save a carrier resource mapping.
   * This creates a record linking an internal resource to its carrier ID.
   * Examples:
   *   saveCarrierResource(shipmentId, "shipment", { carrierId: "foxpost-12345", raw: {...} })
   *   saveCarrierResource(parcelId, "parcel", { carrierId: "fp-parcel-789", status: "created" })
   */
  saveCarrierResource(
    internalId: string,
    resourceType: "shipment" | "parcel" | "label",
    resource: CarrierResource
  ): Promise<void>;

  /**
   * Retrieve a carrier resource by internal ID.
   */
  getCarrierResource(
    internalId: string,
    resourceType: string
  ): Promise<CarrierResource | null>;

  /**
   * Append an immutable domain event to the audit log.
   */
  appendEvent(internalId: string, event: DomainEvent): Promise<void>;

  /**
   * Retrieve events for an entity (useful for debugging and compliance).
   */
  getEvents(internalId: string): Promise<DomainEvent[]>;

  /**
   * Save a label record.
   */
  saveLabel(label: Label): Promise<void>;

  /**
   * Retrieve a label by ID or tracking number.
   */
  getLabel(id: string): Promise<Label | null>;
  getLabelByTrackingNumber(tracking: string): Promise<Label | null>;
}

export interface DomainEvent {
  id?: string;
  type:
    | "SHIPMENT_CREATED"
    | "PARCEL_CREATED"
    | "SHIPMENT_CLOSED"
    | "LABEL_GENERATED"
    | "LABEL_VOIDED"
    | "TRACKING_UPDATED"
    | "ERROR_OCCURRED";
  timestamp?: Date;
  internalId: string;
  carrierId?: string;
  resource?: CarrierResource;
  details?: Record<string, unknown>;
}
```

### In-Memory Store (for Testing)

Core ships with a simple in-memory store for development and testing:

```typescript
export class InMemoryStore implements Store {
  private shipments = new Map<string, Shipment>();
  private parcels = new Map<string, Parcel>();
  private carrierResources = new Map<string, CarrierResource>();
  private events = new Map<string, DomainEvent[]>();
  private labels = new Map<string, Label>();

  async saveShipment(shipment: Shipment): Promise<void> {
    this.shipments.set(shipment.id, shipment);
  }

  async getShipment(id: string): Promise<Shipment | null> {
    return this.shipments.get(id) ?? null;
  }

  // ... other methods
}
```

### Integrator Examples

#### SQLite + Drizzle (see `examples/dev-server`)

```typescript
// Integrator implements Store for their Drizzle schema
export class SqliteStore implements Store {
  constructor(private db: Database) {}

  async saveShipment(shipment: Shipment): Promise<void> {
    await this.db
      .insert(shipmentsTable)
      .values(shipment)
      .onConflictDoUpdate({ target: shipmentsTable.id, set: shipment });
  }

  // ... other methods
}
```

#### Postgres

```typescript
// Integrator implements Store for their Postgres pool
export class PostgresStore implements Store {
  constructor(private pool: Pool) {}

  async saveShipment(shipment: Shipment): Promise<void> {
    await this.pool.query(
      `INSERT INTO shipments (...) VALUES (...)
       ON CONFLICT (id) DO UPDATE SET ...`,
      [shipment.id, /* ... */]
    );
  }

  // ... other methods
}
```

---

## Error Handling & Resilience

### Structured Error Types

All adapters throw or return structured `CarrierError` objects to allow integrators to decide retry logic.

```typescript
export class CarrierError extends Error {
  /**
   * Error category determines retry strategy.
   */
  category:
    | "Validation" // 400: bad request (don't retry)
    | "Auth"       // 401/403: credentials invalid (don't retry)
    | "RateLimit"  // 429: too many requests (retry with backoff)
    | "Transient"  // 5xx, timeout, network error (retry)
    | "Permanent"; // Unrecoverable (don't retry)

  /**
   * Carrier-specific error code (e.g., "ERR_INVALID_ADDRESS").
   */
  carrierCode?: string;

  /**
   * Raw carrier error response for debugging.
   */
  raw?: unknown;

  /**
   * Suggested retry delay in milliseconds (for RateLimit errors).
   */
  retryAfterMs?: number;

  constructor(
    message: string,
    category: CarrierError["category"],
    opts?: {
      carrierCode?: string;
      raw?: unknown;
      retryAfterMs?: number;
    }
  ) {
    super(message);
    this.category = category;
    this.carrierCode = opts?.carrierCode;
    this.raw = opts?.raw;
    this.retryAfterMs = opts?.retryAfterMs;
    this.name = "CarrierError";
  }
}
```

### Error Translation Example (Adapter)

```typescript
// In FoxpostAdapter.createLabel()
try {
  const res = await ctx.http.post(`/parcels/${parcelId}/label`, {});
  return { carrierId: res.id, status: "created", raw: res };
} catch (err) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const carrierErr = err.response?.data;

    if (status === 400) {
      throw new CarrierError(
        `Invalid parcel: ${carrierErr.message}`,
        "Validation",
        { carrierCode: carrierErr.code, raw: carrierErr }
      );
    } else if (status === 401) {
      throw new CarrierError("API key invalid", "Auth", {
        raw: carrierErr,
      });
    } else if (status === 429) {
      throw new CarrierError("Rate limit exceeded", "RateLimit", {
        retryAfterMs: parseInt(
          err.response?.headers["retry-after"] ?? "60000"
        ),
        raw: carrierErr,
      });
    } else if (status >= 500) {
      throw new CarrierError("Carrier service error", "Transient", {
        raw: carrierErr,
      });
    }
  }
  throw new CarrierError("Unknown error", "Permanent", { raw: err });
}
```

### Integrator Retry Logic

```typescript
// Integrator decides retry strategy based on error category
async function createLabelWithRetry(
  adapter: CarrierAdapter,
  parcelId: string,
  context: AdapterContext,
  maxRetries = 3
): Promise<CarrierResource> {
  let lastError: CarrierError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await adapter.createLabel!(parcelId, context);
    } catch (err) {
      if (err instanceof CarrierError) {
        lastError = err;

        // Permanent errors: fail immediately
        if (err.category === "Permanent" || err.category === "Validation") {
          throw err;
        }

        // Transient/RateLimit: wait and retry
        if (
          err.category === "Transient" ||
          err.category === "RateLimit"
        ) {
          const delayMs = err.retryAfterMs ?? Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        // Auth: fail immediately
        if (err.category === "Auth") {
          throw err;
        }
      }

      throw err;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}
```

---

## Testing Strategy

### Contract Testing (Adapter ↔ Mock Carrier)

Each adapter should have contract tests that verify it correctly calls carrier endpoints. Use Prism to spin up a mock server from the carrier's OpenAPI spec.

#### Setup

```typescript
// packages/adapters/foxpost/tests/contract.spec.ts
import { start as startMockServer } from "@stoplight/prism-http";
import { FoxpostAdapter } from "../src";

describe("FoxpostAdapter - Contract Tests", () => {
  let mockServer: any;
  let adapter: FoxpostAdapter;

  beforeAll(async () => {
    // Start mock server from OpenAPI spec
    mockServer = await startMockServer({
      document: "./carrier-docs/canonical/foxpost.yaml",
      port: 3456,
    });

    adapter = new FoxpostAdapter("http://localhost:3456");
  });

  afterAll(async () => {
    await mockServer.close();
  });

  it("should create a label with valid parcel", async () => {
    const result = await adapter.createLabel!("parcel-123", {
      http: fetchClient,
      logger: console,
    });

    expect(result.carrierId).toBeDefined();
    expect(result.status).toBe("created");
    expect(result.raw).toBeDefined();
  });

  it("should throw Validation error for invalid parcel", async () => {
    await expect(
      adapter.createLabel!("invalid-id", {
        http: fetchClient,
        logger: console,
      })
    ).rejects.toThrow(CarrierError);
  });
});
```

### Unit Tests (Mapping & Logic)

```typescript
// packages/adapters/foxpost/tests/mapper.spec.ts
import { mapFromFoxpost, mapToFoxpost } from "../src/mapper";

describe("Foxpost Mapper", () => {
  it("should map canonical address to Foxpost format", () => {
    const canonical = {
      name: "John Doe",
      street: "123 Main St",
      city: "Budapest",
      postalCode: "1011",
      country: "HU",
    };

    const foxpost = mapToFoxpost(canonical);
    expect(foxpost.RecipientName).toBe("John Doe");
    expect(foxpost.RecipientCity).toBe("Budapest");
  });

  it("should map Foxpost tracking event to canonical format", () => {
    const foxpostEvent = {
      timestamp: "2024-01-17T10:30:00Z",
      status: "IN_DELIVERY",
      description: "Parcel out for delivery",
    };

    const canonical = mapFromFoxpost.trackingEvent(foxpostEvent);
    expect(canonical.status).toBe("OUT_FOR_DELIVERY");
    expect(canonical.timestamp.toISOString()).toBe(
      "2024-01-17T10:30:00.000Z"
    );
  });
});
```

### Integration Tests (Full Flow)

```typescript
// packages/adapters/foxpost/tests/integration.spec.ts
import { executeCreateLabelFlow } from "@shopickup/core";
import { FoxpostAdapter } from "../src";
import { InMemoryStore } from "@shopickup/core/stores";

describe("Foxpost - Integration Tests", () => {
  const adapter = new FoxpostAdapter("http://localhost:3456");
  const store = new InMemoryStore();

  it("should complete full create-label flow", async () => {
    const shipment: Shipment = {
      id: "ship-1",
      sender: { /* ... */ },
      recipient: { /* ... */ },
      service: "standard",
      totalWeight: 1000,
    };

    const parcel: Parcel = {
      id: "par-1",
      shipmentId: "ship-1",
      weight: 1000,
    };

    const result = await executeCreateLabelFlow({
      adapter,
      shipment,
      parcels: [parcel],
      credentials: { apiKey: "test-key" },
      context: { http: fetchClient, logger: console },
      store,
    });

    expect(result.labelResources).toHaveLength(1);
    expect(result.labelResources[0].carrierId).toBeDefined();

    // Verify mappings persisted
    const savedResource = await store.getCarrierResource("par-1", "label");
    expect(savedResource).toBeDefined();
  });
});
```

---

## Security & Credentials Management

### Credential Handling

1. **Never store credentials in adapters** — credentials are passed at runtime as method parameters.
2. **Integrators own credential storage** — use Vault, KMS, or environment variables as appropriate.
3. **Log redaction** — adapters should not log raw credentials.

```typescript
// GOOD: Credentials passed at call time
const result = await adapter.createLabel("parcel-123", {
  http: httpClient,
  logger: logger,
});

// BAD: Never do this
adapter.setApiKey(apiKey); // Don't store in adapter
const result = await adapter.createLabel("parcel-123", { http: httpClient });
```

### Webhook Security

For carriers that support webhooks, core provides verification helpers:

```typescript
export interface WebhookVerifier {
  /**
   * Verify webhook signature using carrier-provided secret.
   * Returns true if signature is valid, false otherwise.
   */
  verify(payload: Buffer, signature: string, secret: string): boolean;
}

// In integrator's webhook handler:
if (!verifier.verify(req.rawBody, req.headers["x-signature"], secret)) {
  res.status(401).json({ error: "Invalid signature" });
  return;
}

// Process webhook
const event = JSON.parse(req.body);
await handleCarrierEvent(event);
```

### Audit Logging

Core's `Store` interface includes an `appendEvent()` method for immutable audit logs. Integrators should log all significant operations.

```typescript
await store.appendEvent(shipmentId, {
  type: "LABEL_GENERATED",
  internalId: shipmentId,
  carrierId: "foxpost",
  resource: labelResource,
  timestamp: new Date(),
});
```

---

## Extensibility & Plugin Architecture

### Adding a New Carrier

#### 1. Define OpenAPI Spec

Create `carrier-docs/canonical/<carrier>.yaml` with `x-capabilities` extension:

```yaml
openapi: 3.0.0
info:
  title: Acme Carrier API
  version: 1.0.0
  x-capabilities:
    - CREATE_SHIPMENT
    - CREATE_PARCEL
    - CREATE_LABEL
  x-requires:
    createLabel:
      - CREATE_PARCEL
```

#### 2. Generate Types

```bash
pnpm run codegen --carrier=acme
# Outputs: packages/adapters/acme/gen/*.ts
```

#### 3. Implement Adapter

```typescript
// packages/adapters/acme/src/index.ts
import { CarrierAdapter, Capability } from "@shopickup/core";
import { AcmeClient } from "./client";
import { mapToAcme, mapFromAcme } from "./mapper";

export class AcmeAdapter implements CarrierAdapter {
  id = "acme";
  capabilities: Capability[] = [
    "CREATE_SHIPMENT",
    "CREATE_PARCEL",
    "CREATE_LABEL",
  ];

  private client: AcmeClient;

  constructor(baseUrl: string) {
    this.client = new AcmeClient(baseUrl);
  }

  async createShipment(
    req: CreateShipmentRequest,
    ctx: AdapterContext
  ): Promise<CarrierResource> {
    const payload = mapToAcme.shipment(req.shipment);
    const res = await ctx.http!.post("/shipments", payload, {
      headers: { Authorization: `Bearer ${req.credentials.apiKey}` },
    });
    return { carrierId: res.id, status: "created", raw: res };
  }

  // ... other methods
}
```

#### 4. Publish

```bash
cd packages/adapters/acme
npm publish --access public
```

### Discovery & Registration

Integrators can load adapters dynamically:

```typescript
// Option 1: Explicit registration
import { FoxpostAdapter } from "@shopickup/adapters-foxpost";
import { DhlAdapter } from "@shopickup/adapters-dhl";

const adapters = [
  new FoxpostAdapter(process.env.FOXPOST_BASE_URL),
  new DhlAdapter(process.env.DHL_BASE_URL),
];

// Option 2: Filesystem discovery (advanced)
const adapters = await discoverAdapters("./packages/adapters");
```

---

## Observability & Debugging

### Logging

Adapters accept an optional logger in context. Use standard log levels:

```typescript
ctx.logger?.debug("Creating shipment", { shipmentId, carrierName });
ctx.logger?.info("Label created", { trackingNumber, labelUrl });
ctx.logger?.warn("Rate limit approaching", { remainingRequests: 10 });
ctx.logger?.error("Failed to create label", { error, parcelId });
```

### Telemetry

Adapters can emit metrics via optional telemetry client:

```typescript
ctx.telemetry?.recordHistogram("foxpost.createLabel.duration_ms", duration);
ctx.telemetry?.incrementCounter("foxpost.labels.created", 1);
ctx.telemetry?.recordGauge("foxpost.rateLimit.remaining", remaining);
```

### Request Tracing

Integrators should ensure all HTTP requests include a `trace-id` header:

```typescript
// In integrator's HTTP client middleware
const traceId = req.headers["x-trace-id"] || generateTraceId();
httpClient.defaults.headers["x-trace-id"] = traceId;
```

### Debugging with Raw Responses

All `CarrierResource` objects include a `raw` field with the carrier's full response. Log and inspect this for debugging:

```typescript
ctx.logger?.debug("Carrier response", { raw: result.raw });
// Later: query logs for this shipment and inspect what the carrier actually sent back
```

---

## Summary

This architecture provides:

- **Canonical domain model** that all carriers normalize to.
- **Strict adapter contract** that's minimal and optional-method friendly.
- **Stateless adapters** that accept HTTP client + credentials at call time.
- **Flow helpers** that compose adapter methods without persisting state.
- **Optional persistence** via pluggable `Store` interface.
- **Structured error handling** that enables intelligent retries.
- **Comprehensive testing** via contract + unit + integration tests.
- **Security-first design** with no credential storage in adapters.
- **Observable & debuggable** with logging, telemetry, and raw response inspection.
- **Extensible** — adding carriers requires zero changes to core.

The result: a lightweight, focused library that solves carrier heterogeneity without opinionating on persistence, HTTP layers, or deployment.
