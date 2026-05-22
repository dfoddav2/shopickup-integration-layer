# Contributing

## Setup

- Node.js 18+
- pnpm 8+

## Commands

- Install: `pnpm install`
- Build: `pnpm run build`
- Test: `pnpm test`
- Coverage: `pnpm test:coverage`
- Lint: `pnpm lint`

## Repo Conventions

- TypeScript strict mode, ESM, NodeNext.
- Build before depending on package `dist/` entrypoints.
- Adapter tests belong under `packages/**/src/tests/*.spec.ts`.
- Keep adapters stateless and pass credentials through `AdapterContext`.

## Adapter Work

- Update the carrier OpenAPI spec first.
- Regenerate adapter types after spec changes.
- Add mapper and validation unit tests for new behavior.
- Add contract tests when you need request/response coverage against a mock carrier API.

## Logging

- Keep log messages short and actionable.
- Do not log secrets or raw carrier payloads unless explicitly needed for debugging.

## Release Safety

- Do not commit, push, or open PRs unless requested.
