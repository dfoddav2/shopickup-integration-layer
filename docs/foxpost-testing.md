# Foxpost Testing

This is the Foxpost-specific testing guide used to split unit, mock, and live coverage.

## Tiers

- `unit`: schema, mapper, and status logic.
- `mock`: adapter behavior with mocked HTTP responses.
- `live`: sandbox or public-API checks, opt-in only.

## Package Scripts

- `pnpm --filter @shopickup/adapters-foxpost run test`
- `pnpm --filter @shopickup/adapters-foxpost run test:live`

## Live Env

Required for sandbox flow tests:

- `FOXPOST_LIVE_API_KEY`
- `FOXPOST_LIVE_BASIC_USERNAME`
- `FOXPOST_LIVE_BASIC_PASSWORD`

Optional:

- `FOXPOST_LIVE_BASE_URL` default `https://webapi-test.foxpost.hu`
- `FOXPOST_LIVE_USE_TEST_API` default `true`
- `FOXPOST_LIVE_PUBLIC_FEED` set to `true` to enable the live pickup-points spec
- `FOXPOST_LIVE_PICKUP_POINT_ID` default `23676` for the deterministic pickup-point flow

You can also put these values in `packages/adapters/foxpost/.env.live`. The live loader reads that file automatically when present.

## Run Example

```bash
cp packages/adapters/foxpost/live.env.example packages/adapters/foxpost/.env.live
pnpm --filter @shopickup/adapters-foxpost run test:live
```

Or export them in your shell:

```bash
export FOXPOST_LIVE_API_KEY=...
export FOXPOST_LIVE_BASIC_USERNAME=...
export FOXPOST_LIVE_BASIC_PASSWORD=...
export FOXPOST_LIVE_PUBLIC_FEED=true
pnpm --filter @shopickup/adapters-foxpost run test:live
```

## Capability Minimums

### `CREATE_PARCEL`

- unit: parcel request mapping and validation
- mock: success, validation failure, response-shape failure
- live: create a real sandbox parcel

### `CREATE_LABEL`

- unit: binary/PDF validation and response shaping
- mock: PDF success, API 400/401 translation, malformed carrier response
- live: label a sandbox parcel

### `TRACK`

- unit: status mapping and trace normalization
- mock: empty body not found, malformed response, success path
- live: track a sandbox parcel

### `LIST_PICKUP_POINTS`

- unit: pickup-point mapping helpers and validation
- mock: invalid feed handling, filtering, no-http-client behavior
- live: load the public feed

## Minimum Done Rule

For each capability, keep at least one passing test in each relevant tier before calling the capability complete.
