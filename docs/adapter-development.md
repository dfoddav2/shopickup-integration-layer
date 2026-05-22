# Adapter Development

Use this when adding or changing a carrier adapter.

## Inputs

- Carrier OpenAPI spec in `carrier-docs/<carrier>/`
- Adapter package in `packages/adapters/<carrier>/`
- Core contract from `@shopickup/core`

## Package Shape

- `src/index.ts`: adapter entrypoint
- `src/capabilities/`: carrier operations
- `src/mappers/`: canonical to carrier conversion and back
- `src/validation.ts`: request validation helpers
- `src/utils/`: carrier-specific helpers
- `src/tests/`: unit and contract tests

## Workflow

1. Define or update the carrier OpenAPI spec.
2. Regenerate types with the package `codegen` script.
3. Implement the adapter methods declared in `capabilities`.
4. Add mapper and validation unit tests.
5. Add contract tests if the carrier flow benefits from request/response verification.
6. Run the package build and the relevant tests.

## Unit Testing

- Keep tests close to the code: `packages/adapters/<carrier>/src/tests/*.spec.ts`.
- Test pure functions first: mappers, validators, response normalization, option handling.
- Mock the injected HTTP client instead of calling real carrier endpoints in unit tests.
- Use the root test command for the whole repo, or filter to a package when iterating.

## Commands

- All tests: `pnpm test`
- One adapter package: `pnpm --filter @shopickup/adapters-foxpost run test`
- Build first when validating package output: `pnpm run build`

## Constraints

- Keep adapters stateless.
- Pass credentials and HTTP clients at call time.
- Use `.js` extensions in relative imports.
- Log only carrier-safe data.
