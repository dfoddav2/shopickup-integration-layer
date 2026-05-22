# Testing State

This document is a current snapshot of how testing works in the repo today.

## Top-Level View

- The root test command is `pnpm test`, which runs `vitest --run`.
- Coverage is available via `pnpm test:coverage`.
- Vitest is configured in `vitest.config.ts` to run in the Node environment.
- Root Vitest discovery is limited to `packages/**/src/**/*.{test,spec}.{ts,tsx,js,mjs}`.
- TypeScript project references cover `packages/core` and all three adapter packages.
- The root `tsconfig.json` excludes test files from compile-time inclusion, so tests are intentionally treated as runtime artifacts rather than part of the build output.

## Core Testing

`@shopickup/core` has the most established test surface.

- Package test script: `pnpm --filter @shopickup/core run test`
- Package test command: `vitest --run src`
- Test files live under `packages/core/src/**/__tests__/`.
- Coverage includes HTTP client behavior and logging helpers.
- The core test suite focuses on reusable infrastructure rather than carrier-specific behavior.

Current core test themes:

- HTTP client request/response behavior
- Debug and redaction behavior
- Logging helper behavior

## Adapter Testing

Each adapter package has its own package-local `test` script that runs plain `vitest --run`.

### Foxpost

- Test files live under `packages/adapters/foxpost/src/tests/`.
- The suite covers mappers, validation, credentials, tracking, pickup points, and parcel flows.
- There is also an integration-oriented test file, so Foxpost currently has the broadest adapter test surface.

### GLS

- Test files live under `packages/adapters/GLS/src/tests/`.
- The suite covers parcels, labels, tracking, mapping, and tracking integration.
- GLS has a solid functional spread, but the test surface is narrower than Foxpost's.

### MPL

- Test files live under `packages/adapters/MPL/src/tests/`.
- The suite covers auth, OAuth fallback, HTTP utilities, parcels, labels, tracking, and shipment details.
- MPL has the most explicit authentication-oriented coverage of the adapter packages.

## Example Testing

The example app has its own end-to-end style tests under `examples/dev-server/src/tests/`.

- `foxpost-batch.e2e.spec.ts`
- `pickup-points.e2e.spec.ts`
- `mpl-auth.e2e.spec.ts`

These are useful as integration checks for the example server, but they are not included in the root Vitest glob today.

## Gaps And Boundaries

- The root Vitest config does not currently include `examples/**/src/**/*.spec.ts`, so example tests are not part of the top-level `pnpm test` run.
- `packages/adapters/package.json` is just a grouping package and does not define its own test workflow.
- `packages/adapters/GLS/package.json` lists `vitest` as a dev dependency, while the other adapter packages rely on the repo root toolchain.
- Test placement is mostly consistent inside package-local `src/tests/` or `src/__tests__/` folders.

## Summary

The repo currently has a healthy package-local test structure, with the strongest and most centralized coverage in `@shopickup/core`. Adapter packages are tested separately and keep their tests close to implementation. The main structural gap is that example-server tests exist but are not yet wired into the root Vitest discovery path.
