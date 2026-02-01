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
  '32': 'OUT_FOR_DELIVERY', // Will be delivered in the evening
  '33': 'EXCEPTION', // Delivery attempted - exceeded time frame
  '34': 'EXCEPTION', // Refused acceptance due to delayed delivery
  '35': 'DELIVERED', // Delivered (parcel was refused because goods not ordered)
  '36': 'EXCEPTION', // Consignee was not in, contact card couldn't be left
  '37': 'EXCEPTION', // Change delivery for shipper's request
  '38': 'EXCEPTION', // Could not be delivered due to missing delivery note
  '39': 'EXCEPTION', // Delivery note not signed
  '40': 'RETURNED', // Returned to sender
  '41': 'IN_TRANSIT', // Forwarded normal
  '42': 'EXCEPTION', // Disposed upon shipper's request
  '43': 'EXCEPTION', // Parcel is not locatable
  '44': 'EXCEPTION', // Parcel excluded from General Terms and Conditions
  '46': 'EXCEPTION', // Change completed for delivery address
  '47': 'IN_TRANSIT', // Left the parcel center
  '51': 'PENDING', // Parcel data entered into GLS IT system; not yet handed over
  '52': 'PENDING', // COD data entered into GLS IT system
  '53': 'IN_TRANSIT', // Depot transit
  '54': 'DELIVERED', // Delivered to parcel box
  '55': 'DELIVERED', // Delivered at ParcelShop
  '56': 'EXCEPTION', // Stored in GLS ParcelShop
  '57': 'EXCEPTION', // Reached maximum storage time in ParcelShop
  '58': 'DELIVERED', // Delivered at neighbor's
  '59': 'DELIVERED', // ParcelShop pickup
  '60': 'EXCEPTION', // Customs clearance delayed - missing invoice
  '61': 'EXCEPTION', // Customs documents being prepared
  '62': 'EXCEPTION', // Customs clearance delayed - missing phone number
  '64': 'EXCEPTION', // Released by customs
  '65': 'EXCEPTION', // Released by customs (clearance by consignee)
  '66': 'EXCEPTION', // Customs clearance delayed - awaiting approval
  '67': 'EXCEPTION', // Customs documents being prepared
  '68': 'EXCEPTION', // Could not be delivered - consignee refused to pay
  '69': 'EXCEPTION', // Stored in parcel center - consignment incomplete
  '70': 'EXCEPTION', // Customs clearance delayed - incomplete documents
  '71': 'EXCEPTION', // Customs clearance delayed - missing/inaccurate documents
  '72': 'EXCEPTION', // Customs data must be recorded
  '73': 'EXCEPTION', // Customs parcel locked in origin country
  '74': 'EXCEPTION', // Customs clearance delayed - customs inspection
  '75': 'EXCEPTION', // Confiscated by customs authorities
  '76': 'EXCEPTION', // Customs data recorded, parcel can be sent to final location
  '80': 'IN_TRANSIT', // Forwarded to desired address for delivery
  '83': 'PENDING', // Pickup-service data entered into GLS system
  '84': 'PENDING', // Label for pickup produced
  '85': 'PENDING', // Driver received order to pick up during the day
  '86': 'IN_TRANSIT', // Reached the parcel center
  '87': 'EXCEPTION', // Pickup request cancelled - no goods to pick up
  '88': 'EXCEPTION', // Could not be picked up - goods not packed
  '89': 'EXCEPTION', // Could not be picked up - customer not informed
  '90': 'EXCEPTION', // Pickup request cancelled - goods sent by other means
  '91': 'EXCEPTION', // Pick and Ship/Return cancelled
  '92': 'DELIVERED', // Delivered
  '93': 'DELIVERED', // Signature confirmed
  '97': 'DELIVERED', // Placed in parcellocker
  '99': 'IN_TRANSIT', // Consignee contacted - email delivery notification
  '401': 'EXCEPTION', // Parcellocker capacity problem
  '402': 'EXCEPTION', // Parcellocker oversized
  '403': 'EXCEPTION', // Parcel damaged
  '404': 'EXCEPTION', // Parcellocker technical issue
  '420': 'EXCEPTION', // Defect box
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
