Functions Test Harness
======================

Purpose
-------

This directory contains a lightweight "functions" test harness to call adapter capabilities directly (no HTTP server). It provides:

- an interactive CLI to pick and run capability modules (`cli.ts`)
- per-adapter capability modules under `./<carrier>/` (each exports `meta` + `run(args, ctx)`)
- helpers to build an `AdapterContext` and load environment variables

This is intended for quick manual testing (via `ts-node`) and scripting of adapter flows.

Files to know
-------------

- `cli.ts` — interactive CLI (uses Inquirer). Run with `ts-node` to pick a function and supply JSON args.
- `_lib/env.ts` — simple dotenv loader (`loadEnv()` / `requireEnv()`)
- `_lib/context.ts` — builds a minimal `AdapterContext` (HTTP client + logger)
- `<carrier>/*.ts` — function modules (example: `mpl/close.ts`, `gls/create-parcels.ts`, `foxpost/create-labels.ts`)
- `.env.example` — example env vars for credentials (copy to `.env` and fill)

Prerequisites
-------------

- Node.js (18+ recommended)
- A package runner (pnpm/npm/yarn)
- Dev dependencies: `ts-node`, `inquirer`, `dotenv` (see install instructions)

Install
-------

From the repository root run (choose one):

- pnpm:
  pnpm add -Dw ts-node inquirer dotenv

- npm (dev deps):
  npm install --save-dev ts-node inquirer dotenv

Note: I intentionally did not modify the repo package.json — install the dev deps locally for running the examples.

Setup credentials
-----------------

1. Copy `examples/functions/.env.example` -> `examples/functions/.env` (this file is gitignored).
2. Fill required credentials (e.g. `MPL_OAUTH_TOKEN` or `MPL_API_KEY`/`MPL_API_SECRET`, and `MPL_ACCOUNTING_CODE`).

Interactive usage
-----------------

Start the CLI with ts-node from repo root:

  npx ts-node ./examples/functions/cli.ts

Or, if you installed ts-node locally with pnpm/npm:

  pnpm dlx ts-node ./examples/functions/cli.ts

The CLI will list available function modules it finds under `examples/functions/*` and prompt you to provide JSON args in an editor. After running it prints the JSON result.

Programmatic / Non-interactive runs
----------------------------------

The CLI supports both interactive mode and non-interactive invocation via flags. You can still call modules directly from a short script (example below), or run them with the CLI using `--run` and `--args`.

CLI non-interactive flags

- `--run <functionId>` or `-r <functionId>` — run the function identified by `<carrier>.<file>` (for example `mpl.create-parcels`).
- `--args <json-or-path>` or `-a <json-or-path>` — pass arguments as raw JSON or a path to a JSON file (resolved robustly).
- `--mock` / `--use-mock` — use the built-in mock HTTP client (no external network calls).
- `--full-logs` / `--log-full` — show full responses and avoid truncation/summaries (useful for dev debugging).
- `--log-file <path>` — write detailed CLI, adapter, and HTTP logs to the given file while keeping console output concise.
- `--exchange-first` / `--refresh-token` — perform an API key → OAuth token exchange before running the requested function (requires `MPL_API_KEY` + `MPL_API_SECRET` in env or passed in `--args`).

Examples

- Run using a fixture file (mocked HTTP):

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json --mock

- Run using inline JSON (real HTTP):

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.exchange-auth --args '{"credentials":{"apiKey":"x","apiSecret":"y"}}'

- Run and request full logs (no truncation):

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json --full-logs

- Run and write detailed logs to a file:

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-label --args examples/functions/fixtures/gls/create-label.json --log-file ./tmp/gls-create-label.log

- Run and perform token exchange first (useful when you have API key/secret and want a fresh token):

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json --exchange-first

Scripted example (call module directly)
--------------------------------------

Create a file `examples/functions/run-example.ts` with this content:

```ts
import { loadEnv } from './_lib/env';
import { createHttpClient, buildAdapterContext } from './_lib/context';

async function main() {
  loadEnv(); // loads examples/functions/.env

  const http = createHttpClient();
  const ctx = { adapterContext: buildAdapterContext(http, console as any) } as any;

  // Example: MPL close
  const mod = await import('./mpl/close');
  const args = {
    trackingNumbers: ['MLHUN12345671234567'],
    credentials: { authType: 'oauth2', oAuth2Token: process.env.MPL_OAUTH_TOKEN },
    options: { mpl: { accountingCode: process.env.MPL_ACCOUNTING_CODE }, useTestApi: true },
  };

  const res = await mod.run(args, ctx);
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err)=>{ console.error(err); process.exit(1); });
```

Run it with:

  pnpm dlx ts-node ./examples/functions/run-example.ts

or

  npx ts-node ./examples/functions/run-example.ts

Test helper script
------------------

There is a small helper script `examples/functions/run-parcels-test.ts` that runs the MPL `createParcels` flow using the bundled fixture. It supports an exchange-first mode via env or CLI flag:

  EXCHANGE_AUTH_FIRST=1 pnpm dlx ts-node ./examples/functions/run-parcels-test.ts

or

  pnpm dlx ts-node ./examples/functions/run-parcels-test.ts -- --exchange-first

The script also respects `USE_MOCK_HTTP_CLIENT=1` to run offline.
Adding new function modules
---------------------------

Create a new file under `examples/functions/<carrier>/` that exports:

- `meta` — small object with `{ id: string, description?: string }`
- `async function run(args: any, ctx: { adapterContext: AdapterContext })` — performs the call and returns result

The CLI discovers modules by scanning `examples/functions/*/*.ts`.

Security
--------

- Never commit real credentials. Use `examples/functions/.env` locally and keep it out of git.
- The CLI logs results to stdout; be cautious if responses contain sensitive data.

Troubleshooting
---------------

- If the CLI fails to `import('@shopickup/adapters-...')` modules, make sure your module resolution/setup for the monorepo allows importing local packages (you may need to run a build step or use ts-node with project settings).
- If you see TypeScript diagnostics about missing types for packages like `inquirer` or `dotenv`, install the corresponding `@types/*` packages as needed.

Next improvements (ideas)

- Add non-interactive CLI flags (`--run <id> --args '<json>'`).
- Add a small runner script `run.ts` to simplify programmatic invocation.
- Auto-generate a manifest.json of available functions for faster discovery.
- Add mocking mode to run functions offline without real carrier calls.

If you want I can implement the `--run` flags and a small `run.ts` helper next.
