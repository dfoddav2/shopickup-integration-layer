/**
 * MPL Tracking Mapper
 * Converts MPL C-code tracking records to canonical TrackingUpdate format
 */

import type { TrackingEvent, TrackingUpdate } from '@shopickup/core';

/**
 * MPL C-Code Tracking Record Interface
 * Represents a single tracking record with C0-C63 fields from MPL API
 */
export interface MPLTrackingRecord {
  c0?: string;   // System ID
  c1?: string;   // Consignment ID (Tracking number)
  c2?: string;   // Service Code
  c4?: string;   // Delivery Mode
  c5?: string;   // Weight (Registered only)
  c6?: string;   // Service Description
  c8?: string;   // Location
  c9?: string;   // Last Event Status (CRITICAL)
  c10?: string;  // Timestamp
  c11?: string;  // Location Details
  c12?: string;  // Event Description
  c13?: string;  // Event Notes
  c38?: string;  // Service Name
  c39?: string;  // Service Details
  c41?: string;  // Size Length (Registered only)
  c42?: string;  // Size Width (Registered only)
  c43?: string;  // Size Height
  c49?: string;  // Destination
  c53?: string;  // Signature/Receiver
  c55?: string;  // Insurance flag
  c56?: string;  // COD flag
  c57?: string;  // Signature required flag
  c59?: string;  // Additional flag 1
  c60?: string;  // Additional flag 2
  c61?: string;  // Additional flag 3
  c63?: string;  // Custom/Reference data
  [key: string]: any;
}

/**
 * Map MPL tracking status codes (C9) to canonical TrackingStatus
 * 
 * C9 contains the tracking status code in Hungarian.
 * Common values (from carrier documentation):
 * - BEÉRKEZETT / RECEIVED / etc.
 */
function mapStatusCode(c9: string | undefined): 'PENDING' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'RETURNED' | 'CANCELLED' {
  if (!c9) return 'PENDING';

  const statusMap: Record<string, 'PENDING' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'RETURNED' | 'CANCELLED'> = {
    // Hungarian versions
    'BEÉRKEZETT': 'PENDING',
    'FELDOLGOZÁS': 'PENDING',
    'SZÁLLÍTÁS': 'IN_TRANSIT',
    'KÉZBESÍTÉS_ALATT': 'OUT_FOR_DELIVERY',
    'KÉZBESÍTVE': 'DELIVERED',
    'VISSZAKÜLDVE': 'RETURNED',
    'HIBA': 'EXCEPTION',
    'FELDOLGOZÁS ALATT': 'PENDING',
    'CSOMAG FELDOLGOZÁSA ALATT': 'PENDING',
    
    // English versions
    'RECEIVED': 'PENDING',
    'PROCESSING': 'PENDING',
    'IN_TRANSIT': 'IN_TRANSIT',
    'IN_DELIVERY': 'OUT_FOR_DELIVERY',
    'OUT_FOR_DELIVERY': 'OUT_FOR_DELIVERY',
    'DELIVERED': 'DELIVERED',
    'RETURNED': 'RETURNED',
    'ERROR': 'EXCEPTION',
    'EXCEPTION': 'EXCEPTION',
    'PENDING': 'PENDING',
    
    // German versions
    'EMPFANGEN': 'PENDING',
    'VERARBEITUNG': 'PENDING',
    'TRANSPORT': 'IN_TRANSIT',
    'AUSLIEFERUNG': 'OUT_FOR_DELIVERY',
    'GELIEFERT': 'DELIVERED',
    'ZURÜCKGEGEBEN': 'RETURNED',
    'FEHLER': 'EXCEPTION',
  };

  return statusMap[c9.toUpperCase().trim()] || 'PENDING';
}

/**
 * Parse date/time from MPL format
 * Expects format like: "2025-01-27 14:30:00" or similar
 */
function parseTimestamp(timestamp: string | undefined): Date | null {
  if (!timestamp) return null;
  
  try {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    return null;
  }
  
  return null;
}

/**
 * Parse weight from string (C5)
 * Expects format like "1.5 kg" or "1500" (grams)
 */
function parseWeight(weightStr: string | undefined): number | undefined {
  if (!weightStr) return undefined;
  
  try {
    // Remove units (kg, g, etc.)
    const numStr = weightStr.replace(/[^\d.,]/g, '').replace(',', '.');
    const weight = parseFloat(numStr);
    return isNaN(weight) ? undefined : weight;
  } catch {
    return undefined;
  }
}

/**
 * Build event history from a single C-code record
 * For 'last' state, returns single event from latest status
 * For 'all' state, caller is responsible for handling multiple records
 */
function buildTrackingEvent(record: MPLTrackingRecord): TrackingEvent {
  const timestamp = parseTimestamp(record.c10) || new Date();
  const status = mapStatusCode(record.c9);
  
  // Build location object from C-codes
  const location = (record.c8 || record.c11) ? {
    city: record.c11 || record.c8,
  } : undefined;

  return {
    timestamp,
    status,
    location,
    description: record.c12 || record.c6 || 'No description',
    carrierStatusCode: record.c9,
    raw: record,
  };
}

/**
 * Convert MPL C-code tracking record to canonical TrackingUpdate
 * 
 * @param record - MPL tracking record with C-codes
 * @param includeFinancialData - If true, include weight/size/value (Registered endpoint)
 * @returns Canonical TrackingUpdate
 */
export function mapMPLTrackingToCanonical(
  record: MPLTrackingRecord,
  includeFinancialData: boolean = false
): TrackingUpdate {
  // Validate critical field
  if (!record.c1) {
    throw new Error('Invalid tracking record: missing c1 (Consignment ID)');
  }

  // Build base tracking update
  const trackingUpdate: TrackingUpdate = {
    trackingNumber: record.c1,
    status: mapStatusCode(record.c9),
    lastUpdate: parseTimestamp(record.c10) || null,
    events: [buildTrackingEvent(record)],
    rawCarrierResponse: {
      record,
      // Include financial data in response if available
      ...(includeFinancialData && {
        weight: record.c5,
        dimensions: {
          length: record.c41,
          width: record.c42,
          height: record.c43,
        },
        value: (record as any).c58,
      }),
    },
  };

  return trackingUpdate;
}

/**
 * Build multiple events from complete tracking history
 * Used when state='all' is requested
 * 
 * Note: MPL API appears to return multiple records in trackAndTrace array
 * when state='all'. Each record represents an event in the history.
 */
export function mapMPLTrackingHistoryToCanonical(
  records: MPLTrackingRecord[],
  includeFinancialData: boolean = false
): TrackingUpdate {
  if (records.length === 0) {
    throw new Error('No tracking records provided');
  }

  // Get base info from first/main record (usually latest)
  const mainRecord = records[0];
  const trackingNumber = mainRecord.c1;

  if (!trackingNumber) {
    throw new Error('Invalid tracking records: missing c1 (Consignment ID)');
  }

  // Build event history from all records
  const events: TrackingEvent[] = records.map(record => buildTrackingEvent(record));

  // Get latest status from first record (most recent)
  const latestStatus = mapStatusCode(mainRecord.c9);
  const lastUpdate = parseTimestamp(mainRecord.c10) || null;

  const trackingUpdate: TrackingUpdate = {
    trackingNumber,
    status: latestStatus,
    lastUpdate,
    events,
    rawCarrierResponse: {
      records,
      // Include financial data in response if available
      ...(includeFinancialData && {
        weight: mainRecord.c5,
        dimensions: {
          length: mainRecord.c41,
          width: mainRecord.c42,
          height: mainRecord.c43,
        },
        value: (mainRecord as any).c58,
      }),
    },
  };

  return trackingUpdate;
}

/**
 * Determine if record has financial data (Registered vs Guest)
 * Registered includes C5 (weight), Guest excludes it
 */
export function isRegisteredRecord(record: MPLTrackingRecord): boolean {
  return !!(record.c5 || record.c41 || record.c42 || record.c58);
}
