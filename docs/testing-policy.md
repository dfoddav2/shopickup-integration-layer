# Testing Policy

This document defines the testing model for carrier adapters and the surrounding core packages.

## Goals

- Keep fast feedback for local development.
- Separate pure logic from HTTP contract checks.
- Make live carrier tests opt-in and explicit.
- Define a minimum coverage floor per capability.

## Test Tiers

### 1. Unit

Use for pure logic only.

Typical targets:

- mappers
- validators
- error translation helpers
- status normalization
- request shaping helpers

Rules:

- no network
- no mock server
- deterministic inputs and outputs only

### 2. Mocked Integration

Use a mock HTTP client or mock server to exercise adapter behavior across request/response boundaries.

Typical targets:

- adapter capability functions
- response parsing
- carrier error translation
- partial success handling
- redaction / logging behavior

Rules:

- no external carrier calls
- use carrier-shaped responses from docs/specs
- cover both happy-path and error-path behavior

### 3. Live E2E

Use real carrier sandbox or test APIs.

Typical targets:

- final request formatting against the provider
- credential exchange / auth behavior
- end-to-end success on supported sandbox flows

Rules:

- opt-in only
- require environment variables for credentials
- skip automatically when secrets are absent
- never run in the default `pnpm test` path

## Repo Layout Recommendation

Use a tiered package-local layout:

```text
packages/adapters/<carrier>/src/tests/
  unit/
  mock/
  live/
```

If a package is small, `unit/` and `mock/` can be grouped together initially. The important part is that live tests stay isolated.

## Script Recommendation

Each adapter package should eventually expose these test commands:

- `pnpm --filter @shopickup/adapters-<carrier> run test` for unit + mock tests
- `pnpm --filter @shopickup/adapters-<carrier> run test:live` for sandbox tests
- `pnpm --filter @shopickup/adapters-<carrier> run test:watch` for local iteration if useful

Root `pnpm test` should keep running only the fast, deterministic suite.

## Running Live Tests

Live tests read environment variables from the current shell process. Set them before running the live command, for example:

```bash
export FOXPOST_LIVE_API_KEY=...
export FOXPOST_LIVE_BASIC_USERNAME=...
export FOXPOST_LIVE_BASIC_PASSWORD=...
export FOXPOST_LIVE_PUBLIC_FEED=true
pnpm --filter @shopickup/adapters-foxpost run test:live
```

If you prefer a persistent local setup, use your shell profile, `direnv`, or your CI secret store. This repo does not auto-load `.env` files for live tests yet.

Foxpost also supports a package-local `packages/adapters/foxpost/.env.live` file. The live test loader reads it automatically if present, and it is gitignored by the repo-wide `.env.*` rule.

## Minimum Per-Capability Coverage

For every declared carrier capability, define at least:

- one successful request mapping test
- one response parsing test
- one carrier-error test
- one validation or edge-case test

Recommended additions where relevant:

- one live sandbox test
- one logging/redaction assertion for sensitive payloads

## Foxpost Starting Point

Foxpost is a good first carrier to split because it already has:

- strong validation coverage
- mapper coverage
- tracking and label capability code
- explicit carrier API error handling in `createLabels`

Recommended first Foxpost coverage by capability:

- `CREATE_PARCEL`: happy-path mapping, carrier validation failure, missing barcode failure
- `CREATE_PARCELS`: batch success, partial failure, empty batch, malformed carrier response
- `CREATE_LABEL`: binary PDF success, carrier API error translation, unexpected response shape
- `CREATE_LABELS`: batch PDF success, API 400/401 error translation, empty result handling
- `TRACK`: success mapping, empty-body not-found, malformed response, 401/404-style miss
- `LIST_PICKUP_POINTS`: feed parse success, invalid feed handling, filtering behavior, no-http-client error

## Naming Guidance

- Put pure logic tests near the implementation helper they cover.
- Name mock tests after the capability and scenario.
- Name live tests with a clear `live` suffix or folder.
- Keep carrier-specific test fixtures close to the tests that use them.

## Exit Criteria For A Capability

A capability should not be considered done until:

- its unit tests pass
- its mocked integration tests pass
- its error translation is covered
- its response shape is validated against the carrier docs
- live sandbox coverage exists if the carrier exposes a safe test environment
