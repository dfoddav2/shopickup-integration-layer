# MPL Adapter Known Issues & TODOs

## Tracking Empty Results on Sandbox — RESOLVED

**Status:** Investigated — sandbox architecture limitation, not a code bug

Both guest (`/v2/nyomkovetes/guest`) and registered (`/v2/nyomkovetes/registered`) endpoints return `trackAndTrace: []` for parcels created in the same sandbox session.

**Root cause:** The MPL sandbox tracking endpoint is backed by a **separate mock service** that does **not** share data with the sandbox shipment API. Only predefined hardcoded mock identifiers are recognised:

- `UA000449616US`
- `PB2SW00021917`

**Documentation:** The MPL tracking technical description explicitly states the sandbox uses a configurable Mock service. Non-existent identifiers return an empty `trackAndTrace` array.

**Resolution:**

- `tracking.live.spec.ts` tests the adapter against the known hardcoded mock IDs.
- `home-delivery-flow.live.spec.ts` and `pickup-point-flow.live.spec.ts` gracefully accept `NotFound` for the tracking step instead of failing.
- README.md includes a dedicated "Sandbox tracking limitation" section.

## Registered Endpoint Note

The registered endpoint behaves identically to the guest endpoint when querying mock IDs. It does not require separate credentials beyond the standard OAuth2 Bearer token. The `trackRegistered` capability is exported for power users who need weight, dimensions, and declared value in tracking responses when real data is available (production only).
