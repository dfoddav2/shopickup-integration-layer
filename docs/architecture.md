# Architecture

Shopickup is a TypeScript, ESM-only adapter layer for shipping carriers.

## Shape

- `packages/core`: shared domain types, `CarrierAdapter`, flows, stores, HTTP clients, logging helpers
- `packages/adapters/*`: carrier-specific adapters that translate between core types and carrier APIs
- `carrier-docs/*`: carrier OpenAPI sources and notes used for codegen and contract tests
- `examples/dev-server`: Fastify example server for local adapter testing
- `examples/functions`: CLI-style usage examples and fixtures

## Core Rules

- Adapters are stateless.
- Credentials are passed at call time.
- HTTP clients are injected through `AdapterContext`.
- Public package entrypoints resolve from `dist/`, so build before consuming packages directly.

## Current Adapter Surface

- Foxpost is the reference implementation for create parcel, create label, tracking, and pickup points.
- GLS and MPL are additional carrier adapters with their own carrier-specific validation and capability code.

## Testing Model

- Vitest is configured at the repo root.
- Adapter tests live under `packages/**/src/tests/*.spec.ts`.
- Keep pure mapping and validation logic in unit tests.
- Use mock HTTP or Prism-style contract tests for carrier integration behavior.
