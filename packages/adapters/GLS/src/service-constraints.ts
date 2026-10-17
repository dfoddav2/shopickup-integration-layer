/**
 * GLS service applicability matrix.
 *
 * Single source of truth for which GLS services may accompany which
 * delivery method, and which services depend on another being present.
 *
 * This table is *descriptive*: it tells a caller what GLS will accept so
 * the caller can filter its own defaults before building a request. The
 * mapper does not consult it — an adapter is a general-purpose library,
 * so an explicitly requested but inapplicable service is a caller bug and
 * is rejected loudly rather than silently dropped. Deciding that a
 * merchant's shop-wide default simply does not apply to one shipment is
 * an application-level policy, and belongs to the application (SHO-164).
 *
 * ## Provenance — read before tightening this table
 *
 * The MyGLS API documentation (`MyGLS API for system integration`,
 * ver. 25.12.11) does NOT document delivery-method constraints. Its
 * Appendix B lists service codes and their parameters; the only
 * cross-service rule stated anywhere in that document is FSS requiring
 * FDS, which appears both in Appendix B's FSS row ("not available
 * without FDS") and as API error code 30.
 *
 * The "home deliveries only" restriction on FDS/FSS/CS1 comes from the
 * MyGLS web UI, not the API spec. It is encoded here because the mapper
 * already rejected exactly that trio for pickup-point parcels, so it is
 * established behaviour rather than a new guess.
 *
 * Everything else is deliberately left permissive (`['HOME',
 * 'PICKUP_POINT']`). Encoding an unverified guess as a hard constraint
 * would silently drop services that work today. Tighten a row only once
 * GLS confirms it or a test-API run demonstrates the rejection.
 *
 * ## Destination countries (verified 2026-10-17)
 *
 * The API documentation only says "Not all services are available in each
 * country or area" (Appendix B) and states one country rule, SRS "Available
 * only in HU and SI". It never describes shipping from one country to another.
 * The `countries` lists below come from GLS's own answers on the TEST API
 * (`api.test.mygls.hu`, HU account, HU sender): each service was sent on its
 * own with `PrepareLabels` to every destination, and GLS answered either with
 * a parcel or with `Service not available to country, Service 'X'` (error 13).
 * The same run showed that GLS itself refuses FDS, FSS and CS1 together with PSD
 * (`Service matrix violated`), which confirms the home-only rows above at the
 * API level. Re-run it with `GLS_LIVE_SERVICE_MATRIX=true` (see
 * `src/tests/live/service-matrix.live.spec.ts`) before changing a list: it is a
 * test account, not a contract, and GLS can change it.
 *
 * Where the test and the documentation disagree the table follows the test
 * and says so in the note: SRS is documented for HU and SI, but GLS refused SI.
 */

/** Delivery methods a service can apply to, mirroring the canonical Parcel. */
export type GLSDeliveryMethod = 'HOME' | 'PICKUP_POINT';

export interface GLSServiceConstraint {
  /** Delivery methods this service is valid for. */
  deliveryMethods: readonly GLSDeliveryMethod[];
  /** Service codes that must also be present for this one to be accepted. */
  requires: readonly string[];
  /**
   * Destination countries (ISO 3166-1 alpha-2) where GLS accepted the service
   * when it was last verified. Left out when the service is not restricted by
   * country or has not been verified: a missing list means "do not restrict".
   */
  countries?: readonly string[];
  /** Why the service is restricted, for logs and merchant-facing copy. */
  note?: string;
}

const BOTH: readonly GLSDeliveryMethod[] = ['HOME', 'PICKUP_POINT'];

export const GLS_SERVICE_CONSTRAINTS: Readonly<
  Record<string, GLSServiceConstraint>
> = {
  // --- Established restrictions -------------------------------------
  PSD: {
    deliveryMethods: ['PICKUP_POINT'],
    requires: [],
    note: 'Parcel Shop Delivery is the pickup-point mechanism itself.',
  },
  FDS: {
    deliveryMethods: ['HOME'],
    requires: [],
    countries: ['HU', 'CZ', 'SK', 'HR', 'RO', 'SI'],
    note: 'Flexible Delivery Service is offered for home deliveries only, and GLS refuses it for RS.',
  },
  FSS: {
    deliveryMethods: ['HOME'],
    requires: ['FDS'],
    countries: ['HU', 'CZ', 'SK', 'HR', 'RO', 'SI'],
    note: 'Flexible Delivery SMS requires FDS, so it follows FDS: home delivery only, and not for RS.',
  },
  CS1: {
    deliveryMethods: ['HOME'],
    requires: [],
    countries: ['HU', 'SK'],
    note: 'Contact Service is offered for home deliveries only, and GLS accepts it only for HU and SK.',
  },

  // --- Verified per destination country, delivery method not restricted
  '24H': {
    deliveryMethods: BOTH,
    requires: [],
    countries: ['HU', 'SK'],
    note: 'GLS accepts the 24-hour guarantee only for HU and SK.',
  },
  SM2: {
    deliveryMethods: BOTH,
    requires: [],
    countries: ['HU', 'SK'],
    note: 'GLS accepts the SMS pre-advice only for HU and SK.',
  },
  SRS: {
    deliveryMethods: BOTH,
    requires: [],
    countries: ['HU'],
    note:
      'ShopReturn Service: the API documentation says HU and SI, but GLS refused it for SI and every other country on the test API (2026-10-17).',
  },

  // --- Permissive until confirmed by GLS ----------------------------
  SAT: { deliveryMethods: BOTH, requires: [] },
  INS: { deliveryMethods: BOTH, requires: [] },
  DPV: { deliveryMethods: BOTH, requires: [] },
  T09: { deliveryMethods: BOTH, requires: [] },
  T10: { deliveryMethods: BOTH, requires: [] },
  T12: { deliveryMethods: BOTH, requires: [] },
};

/**
 * Whether GLS accepts the service for the destination country, as last
 * verified (see "Destination countries" above). A service with no `countries`
 * list, and a code that is not in the table, are not restricted.
 */
export function isServiceAvailableForCountry(
  code: string,
  country: string
): boolean {
  const countries = GLS_SERVICE_CONSTRAINTS[code]?.countries;
  if (!countries) return true;
  return countries.includes(country.toUpperCase());
}

/**
 * Whether a service code may be used with the given delivery method and,
 * when the destination country is given, in that country.
 * Unknown codes are permitted: the table covers what the adapter emits,
 * and an integrator passing an explicit service we have never seen
 * should not be blocked by our incomplete matrix.
 */
export function isServiceAllowedForDelivery(
  code: string,
  deliveryMethod: GLSDeliveryMethod,
  country?: string
): boolean {
  const constraint = GLS_SERVICE_CONSTRAINTS[code];
  if (!constraint) return true;
  if (!constraint.deliveryMethods.includes(deliveryMethod)) return false;
  return country === undefined || isServiceAvailableForCountry(code, country);
}

/** Service codes that are valid only for home delivery. */
export function homeDeliveryOnlyServiceCodes(): string[] {
  return Object.entries(GLS_SERVICE_CONSTRAINTS)
    .filter(
      ([, c]) =>
        c.deliveryMethods.length === 1 && c.deliveryMethods[0] === 'HOME'
    )
    .map(([code]) => code);
}

/** Service codes that are valid only for pickup-point delivery. */
export function pickupPointOnlyServiceCodes(): string[] {
  return Object.entries(GLS_SERVICE_CONSTRAINTS)
    .filter(
      ([, c]) =>
        c.deliveryMethods.length === 1 &&
        c.deliveryMethods[0] === 'PICKUP_POINT'
    )
    .map(([code]) => code);
}

/** A service a caller chose not to send, and why. */
export interface SkippedGLSService {
  code: string;
  reason: 'delivery-method' | 'destination-country' | 'missing-prerequisite';
  /** Human-readable explanation, safe to surface in logs or support UI. */
  detail: string;
}

/**
 * Explains why a service does not apply to a delivery method (and, when the
 * destination country is given, to that country), for logs and merchant-facing
 * copy. Returns null when it does apply.
 */
export function explainServiceInapplicability(
  code: string,
  deliveryMethod: GLSDeliveryMethod,
  country?: string
): string | null {
  if (isServiceAllowedForDelivery(code, deliveryMethod, country)) return null;
  const note = GLS_SERVICE_CONSTRAINTS[code]?.note;
  const where = !isServiceAllowedForDelivery(code, deliveryMethod)
    ? `${deliveryMethod} delivery`
    : `destination ${country?.toUpperCase()}`;
  return `${code} is not available for ${where}` + (note ? ` - ${note}` : '');
}
