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
 */

/** Delivery methods a service can apply to, mirroring the canonical Parcel. */
export type GLSDeliveryMethod = 'HOME' | 'PICKUP_POINT';

export interface GLSServiceConstraint {
  /** Delivery methods this service is valid for. */
  deliveryMethods: readonly GLSDeliveryMethod[];
  /** Service codes that must also be present for this one to be accepted. */
  requires: readonly string[];
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
    note: 'Flexible Delivery Service is offered for home deliveries only.',
  },
  FSS: {
    deliveryMethods: ['HOME'],
    requires: ['FDS'],
    note: 'Flexible Delivery SMS requires FDS and is home-delivery only.',
  },
  CS1: {
    deliveryMethods: ['HOME'],
    requires: [],
    note: 'Contact Service is offered for home deliveries only.',
  },

  // --- Permissive until confirmed by GLS ----------------------------
  '24H': { deliveryMethods: BOTH, requires: [] },
  SAT: { deliveryMethods: BOTH, requires: [] },
  SM2: { deliveryMethods: BOTH, requires: [] },
  SRS: { deliveryMethods: BOTH, requires: [] },
  INS: { deliveryMethods: BOTH, requires: [] },
  DPV: { deliveryMethods: BOTH, requires: [] },
  T09: { deliveryMethods: BOTH, requires: [] },
  T10: { deliveryMethods: BOTH, requires: [] },
  T12: { deliveryMethods: BOTH, requires: [] },
};

/**
 * Whether a service code may be used with the given delivery method.
 * Unknown codes are permitted: the table covers what the adapter emits,
 * and an integrator passing an explicit service we have never seen
 * should not be blocked by our incomplete matrix.
 */
export function isServiceAllowedForDelivery(
  code: string,
  deliveryMethod: GLSDeliveryMethod
): boolean {
  const constraint = GLS_SERVICE_CONSTRAINTS[code];
  if (!constraint) return true;
  return constraint.deliveryMethods.includes(deliveryMethod);
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
  reason: 'delivery-method' | 'missing-prerequisite';
  /** Human-readable explanation, safe to surface in logs or support UI. */
  detail: string;
}

/**
 * Explains why a service does not apply to a delivery method, for logs and
 * merchant-facing copy. Returns null when it does apply.
 */
export function explainServiceInapplicability(
  code: string,
  deliveryMethod: GLSDeliveryMethod
): string | null {
  if (isServiceAllowedForDelivery(code, deliveryMethod)) return null;
  const note = GLS_SERVICE_CONSTRAINTS[code]?.note;
  return (
    `${code} is not available for ${deliveryMethod} delivery`
    + (note ? ` - ${note}` : '')
  );
}
