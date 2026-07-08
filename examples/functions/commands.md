Quick Commands & Examples
=========================

This file collects common commands you can run from the repository root to exercise the examples/functions harness.

Run interactively
-----------------

Open the interactive editor-based CLI and pick a function:

  pnpm dlx ts-node ./examples/functions/cli.ts

Run non-interactively with fixture file (mock HTTP)
--------------------------------------------------

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels \
    --args examples/functions/fixtures/mpl/create-parcels.json --mock

Run non-interactively with inline JSON
--------------------------------------

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.exchange-auth \
    --args '{"credentials":{"apiKey":"x","apiSecret":"y"}}'

Show full logs (env alias)
-------------------------

Set env alias to always show full logs (or pass `--full-logs`):

  FULL_LOGS=1 pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json

Write detailed logs to a file
-----------------------------

Use `--log-file <path>` to keep the console concise while capturing detailed CLI, adapter, and HTTP logs in a file:

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run gls.create-label --args examples/functions/fixtures/gls/create-label.json --log-file ./tmp/gls-create-label.log

Use the mock HTTP client (no network)
------------------------------------

  USE_MOCK_HTTP_CLIENT=1 pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json

Fetch MPL pickup points (auth required)
---------------------------------------

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.pickup-points --args examples/functions/fixtures/mpl/pickup-points.json --full-logs

If you want the CLI to exchange API key/secret for OAuth first, add `--exchange-first` and provide `MPL_API_KEY` / `MPL_API_SECRET` in env:

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.pickup-points --args examples/functions/fixtures/mpl/pickup-points.json --exchange-first

- Run and perform token exchange first (useful when you have API key/secret and want a fresh token):

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.create-parcels --args examples/functions/fixtures/mpl/create-parcels.json --exchange-first

Close shipments and save manifest PDFs
---------------------------------------

`close-shipments` generates carrier manifest/delivery-note PDFs, exposed via the response's `files` array (same shape as label PDFs). Pass `--save-label` to write them to disk next to the function file. When a result has multiple files (e.g. MPL can return delivery note + posting list + pallet posting list), each is saved separately with a `.<documentType>.pdf` suffix; a single file is saved as plain `.pdf`.

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run mpl.close-shipments \
    --args examples/functions/fixtures/mpl/close-shipments.json --mock --save-label

  pnpm dlx ts-node ./examples/functions/cli.ts -- --run foxpost.close-shipments \
    --args examples/functions/fixtures/foxpost/close-shipments.json --mock --save-label

Foxpost's `close-shipments` requires a sender account id via `options.foxpost.sender` (or `FOXPOST_SENDER` in env).

Notes
-----

- `--mock` and `USE_MOCK_HTTP_CLIENT=1` are equivalent; pick whichever you prefer.
- `--full-logs` or `FULL_LOGS=1` disable truncation and show full response payloads — handy for development, but avoid in CI where logs should be concise.
- `--save-label` works for `create-label`, `create-labels`, `print-label`, `print-labels`, and `close-shipments`; it extracts binary PDF (or ZPL) bytes from the result's `files`/`file`/`rawBytes` fields and writes them next to the function's source file.
