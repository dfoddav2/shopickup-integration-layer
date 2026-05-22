# AGENTS.md

Use this repo’s executable config first: `package.json`, package manifests, `tsconfig*.json`, `vitest.config.ts`, and `opencode.json` beat prose when they disagree.

## Workspace

- pnpm monorepo on Node `>=18`; packages live under `packages/**` and `examples/*`.
- Real workspaces today: `packages/core`, `packages/adapters/foxpost`, `packages/adapters/GLS`, `packages/adapters/MPL`, `examples/dev-server`, `examples/functions`.
- `packages/adapters/` is just a grouping package, not a publishable workspace.

## Commands

- Root build order is fixed: `pnpm run build` runs `build:core` -> `build:adapters` -> `build:examples`.
- Root test command is `pnpm test` (`vitest --run`); coverage is `pnpm test:coverage`.
- Root lint command is `pnpm lint` (`eslint . --ext .ts`).
- Core package: `pnpm --filter @shopickup/core run build|test|dev`.
- Adapter packages: `pnpm --filter @shopickup/adapters-foxpost run build|test|dev|codegen`, same pattern for GLS and MPL.
- Dev server example: `pnpm --filter shopickup-dev-server-example run build|start|dev|test|test:watch|kill:dev`.

## Code Shape

- Core entrypoint is `packages/core/src/index.ts`; it re-exports domain types, interfaces, errors, stores, flows, HTTP clients, logging helpers, and adapter wrappers.
- Package exports point at `dist/`, so build before depending on published entrypoints.
- Vitest only auto-includes tests under `packages/**/src/**/*.{test,spec}.{ts,tsx,js,mjs}`.
- The adapter code you should treat as current examples are `packages/adapters/foxpost/src/index.ts`, `packages/adapters/GLS/src/index.ts`, and `packages/adapters/MPL/src/index.ts`.

## Repo Conventions

- Keep adapters stateless; pass credentials and HTTP clients at call time.
- Prefer the smallest change that fits the current package layout.
- `foxpost` uses `id = "hu-foxpost"` and has a `codegen` script wired to `../../carrier-docs/hu-foxpost/hu-foxpost.openapi.yaml`.
- `opencode.json` requires asking before commits; do not commit, push, or open PRs unless the user explicitly asks.
- Use `TodoWrite` for multi-step work.
