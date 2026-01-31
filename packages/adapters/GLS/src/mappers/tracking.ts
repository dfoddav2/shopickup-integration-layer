/**
 * GLS Tracking Mapper
 * 
 * Maps between canonical Shopickup tracking types and GLS tracking response types.
 * Converts GLS parcel status events to canonical TrackingEvent format.
 */

import type {
  TrackingEvent,
  TrackingUpdate,
  TrackingStatus,
} from '@shopickup/core';
import type {
  GLSGetParcelStatusesResponse,
  GLSParcelStatus,
  GLSErrorInfo,
} from '../types/index.js';

/**
 * GLS status code to Shopickup canonical status mapping
 * Based on GLS Appendix G tracking status codes
 * 
 * Maps GLS status codes (1-40) to canonical TrackingStatus values:
 * - PENDING: Awaiting pickup
 * - IN_TRANSIT: In transit between facilities
 * - OUT_FOR_DELIVERY: Out for delivery today
 * - DELIVERED: Successfully delivered
 * - EXCEPTION: Exception (delay, damage, etc.)
 * - RETURNED: Returned to sender
 * - CANCELLED: Shipment cancelled (not used in GLS statuses)
 */
const GLS_STATUS_MAPPING: Record<string, TrackingStatus> = {
  '1': 'PENDING', // Handed over to GLS
  '2': 'IN_TRANSIT', // Left parcel center
  '3': 'IN_TRANSIT', // Reached parcel center
  '4': 'OUT_FOR_DELIVERY', // Expected delivery during day
  '5': 'DELIVERED', // Delivered
  '6': 'EXCEPTION', // Stored in parcel center (treat as exception for pickup)
  '7': 'EXCEPTION', // Stored in parcel center (treat as exception for pickup)
  '8': 'OUT_FOR_DELIVERY', // Ready for self-collection (similar to out for delivery)
  '9': 'EXCEPTION', // Stored for new delivery date (treat as exception)
  '10': 'IN_TRANSIT', // Check scan normal
  '11': 'EXCEPTION', // Consignee on holidays (delay exception)
  '12': 'EXCEPTION', // Consignee absent (delay exception)
  '13': 'EXCEPTION', // Sorting error
  '14': 'EXCEPTION', // Reception closed (delay exception)
  '15': 'EXCEPTION', // Not delivered - lack of time (delay exception)
  '16': 'EXCEPTION', // No cash available
  '17': 'EXCEPTION', // Recipient refused
  '18': 'EXCEPTION', // Address information needed
  '19': 'EXCEPTION', // Weather condition (delay exception)
  '20': 'EXCEPTION', // Wrong/incomplete address
  '21': 'EXCEPTION', // Forwarded sorting error
  '22': 'IN_TRANSIT', // Sent from depot to sorting center
  '23': 'RETURNED', // Returned to sender
  '24': 'EXCEPTION', // Delivery option changed
  '25': 'EXCEPTION', // Forwarded misrouted
  '26': 'IN_TRANSIT', // Reached parcel center
  '27': 'IN_TRANSIT', // Reached parcel center
  '28': 'EXCEPTION', // Disposed
  '29': 'EXCEPTION', // Under investigation
  '30': 'EXCEPTION', // Inbound damaged
  '31': 'EXCEPTION', // Completely damaged
  '32': 'EXCEPTION', // Damaged
  '33': 'EXCEPTION', // Delivery attempted
  '34': 'EXCEPTION', // Parcel damaged in delivery
  '35': 'DELIVERED', // Delivered to parcel shop
  '36': 'EXCEPTION', // Lost parcel
  '37': 'EXCEPTION', // Parcel damaged - contents missing
  '38': 'IN_TRANSIT', // In international transit
  '39': 'IN_TRANSIT', // Customs clearance
  '40': 'EXCEPTION', // Customs hold
};

/**
 * Map GLS parcel status to canonical TrackingEvent
 * 
 * @param glsStatus GLS parcel status
 * @param parcelNumber GLS parcel ID (unused but kept for consistency)
 * @param clientReference Original client reference (unused but kept for consistency)
 * @returns Canonical TrackingEvent
 */
export function mapGLSStatusToTrackingEvent(
  glsStatus: GLSParcelStatus,
  parcelNumber?: number,
  clientReference?: string
): TrackingEvent {
  // Map GLS status code to canonical status
  const canonicalStatus = GLS_STATUS_MAPPING[glsStatus.statusCode] || 'PENDING';

  return {
    timestamp: new Date(glsStatus.statusDate),
    status: canonicalStatus,
    carrierStatusCode: glsStatus.statusCode,
    location: {
      city: glsStatus.depotCity,
      facility: glsStatus.depotNumber,
    },
    description: glsStatus.statusDescription,
    raw: glsStatus,
  };
}

/**
 * Map GLS GetParcelStatuses response to canonical TrackingUpdate
 * 
 * Note: POD data is included in rawCarrierResponse for integrator to handle.
 * The integrator is responsible for extracting and storing POD bytes.
 * 
 * @param glsResponse GLS tracking response
 * @returns Canonical TrackingUpdate with timeline of events
 */
export function mapGLSTrackingResponseToCanonical(
  glsResponse: GLSGetParcelStatusesResponse
): TrackingUpdate {
  const parcelNumber = glsResponse.parcelNumber;

  // Map all status updates to tracking events
  const events: TrackingEvent[] = (glsResponse.parcelStatusList || [])
    .map(status => mapGLSStatusToTrackingEvent(status, parcelNumber));

  // Sort events by timestamp (earliest first)
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Determine overall status from most recent event
  let currentStatus: TrackingStatus = 'PENDING';
  let lastUpdate: Date | null = null;
  
  if (events.length > 0) {
    currentStatus = events[events.length - 1].status;
    lastUpdate = events[events.length - 1].timestamp;
  }

  return {
    trackingNumber: String(parcelNumber || ''),
    events,
    status: currentStatus,
    lastUpdate,
    rawCarrierResponse: glsResponse,
  };
}

/**
 * Map GLS error to tracking error object
 * 
 * @param error GLS error
 * @returns Serializable error object
 */
export function mapGLSErrorInfoToTrackingError(error: GLSErrorInfo): any {
  return {
    errorCode: error.errorCode,
    errorDescription: error.errorDescription,
    clientReferenceList: error.clientReferenceList || [],
    parcelIdList: error.parcelIdList || [],
  };
}
