import type { TrackingEvent, TrackingUpdate, TrackingStatus } from '@shopickup/core';

export interface MPLTrackingRecord {
  c0?: string;   // Backend system name (EÉRT, BPU) or parcel type (IKRL=letter, IKRCS=parcel)
  c1?: string;   // Consignment ID (tracking number)
  c2?: string;   // Basic service name (e.g. "Üzleti csomag")
  c4?: string;   // Delivery mode (e.g. "Csomagautomatára kézbesítés")
  c5?: string;   // Declared value amount (HUF) — Registered only
  c6?: string;   // COD amount
  c8?: string;   // Retention period (storage days)
  c9?: string;   // Event description / status text (e.g. "Sikeresen kézbesítve háznál")
  c10?: string;  // Event category description (e.g. "Felvétel", "Kézbesítés")
  c11?: string;  // Event date (YYYYMMDD format, e.g. "20190607")
  c12?: string;  // Event time (HH:MM:SS format, e.g. "01:30:59")
  c13?: string;  // Receiving post office / facility name
  c38?: string;  // Recipient country code
  c39?: string;  // Recipient country name
  c41?: string;  // Weight (grams) — Registered only
  c42?: string;  // Size category (S, M, L, "-") — Registered only
  c43?: string;  // Event category code (0-5): 0=Unclassified, 1=Receipt, 2=Processing, 3=Transport, 4=Delivery, 5=Delivered
  c49?: string;  // Sender country code
  c53?: string;  // Replacement parcel tracking ID
  c55?: string;  // Failed delivery reason
  c56?: string;  // Recipient's title/role (e.g. "Címzett")
  c57?: string;  // COD currency (e.g. "HUF")
  c58?: string;  // Declared value currency (e.g. "HUF") — Registered only
  c59?: string;  // Related/linked identifier
  c60?: string;  // Retention deadline / expiry date
  c61?: string;  // Max transaction category reached during parcel journey (0-5)
  c63?: string;  // Sender country name
  [key: string]: any;
}

function mapC43ToStatus(c43: string | undefined, c9: string | undefined): TrackingStatus {
  if (!c43) return 'PENDING';

  const categoryCode = parseInt(c43, 10);
  const c9Lower = (c9 || '').toLowerCase();

  switch (categoryCode) {
    case 5:
      return 'DELIVERED';
    case 4:
      return 'OUT_FOR_DELIVERY';
    case 3:
      if (
        c9Lower.includes('visszaküld') ||
        c9Lower.includes('visszakérte') ||
        c9Lower.includes('megtagadta')
      ) {
        return 'RETURNED';
      }
      if (
        c9Lower.includes('sérülés') ||
        c9Lower.includes('ismeretlen') ||
        c9Lower.includes('megszűnt') ||
        c9Lower.includes('akadályozott')
      ) {
        return 'EXCEPTION';
      }
      return 'IN_TRANSIT';
    case 2:
      return 'PENDING';
    case 1:
      return 'PENDING';
    case 0:
    default:
      return 'PENDING';
  }
}

function parseTimestamp(dateStr: string | undefined, timeStr: string | undefined): Date | null {
  if (!dateStr || !timeStr) return null;

  try {
    const combined = `${dateStr} ${timeStr}`;
    const parsed = new Date(combined);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function buildTrackingEvent(record: MPLTrackingRecord): TrackingEvent {
  const timestamp = parseTimestamp(record.c11, record.c12) || new Date();
  const status = mapC43ToStatus(record.c43, record.c9);

  const location = record.c13
    ? { facility: record.c13 }
    : undefined;

  return {
    timestamp,
    status,
    location,
    description: record.c9 || 'No description',
    descriptionLocalLanguage: record.c10 || undefined,
    carrierStatusCode: record.c9,
    raw: record,
  };
}

export function mapMPLTrackingToCanonical(
  record: MPLTrackingRecord,
  includeFinancialData: boolean = false
): TrackingUpdate {
  if (!record.c1) {
    throw new Error('Invalid tracking record: missing c1 (Consignment ID)');
  }

  const events = [buildTrackingEvent(record)];

  const trackingUpdate: TrackingUpdate = {
    trackingNumber: record.c1,
    status: mapC43ToStatus(record.c43, record.c9),
    lastUpdate: events[0].timestamp,
    events,
    rawCarrierResponse: {
      record,
      ...(includeFinancialData && {
        declaredValueAmount: record.c5,
        weight: record.c41,
        size: record.c42,
        declaredValueCurrency: record.c58,
      }),
    },
  };

  return trackingUpdate;
}

export function mapMPLTrackingHistoryToCanonical(
  records: MPLTrackingRecord[],
  includeFinancialData: boolean = false
): TrackingUpdate {
  if (records.length === 0) {
    throw new Error('No tracking records provided');
  }

  const mainRecord = records[0];
  const trackingNumber = mainRecord.c1;

  if (!trackingNumber) {
    throw new Error('Invalid tracking records: missing c1 (Consignment ID)');
  }

  const events: TrackingEvent[] = records.map(record => buildTrackingEvent(record));

  const latestStatus = mapC43ToStatus(mainRecord.c43, mainRecord.c9);

  const trackingUpdate: TrackingUpdate = {
    trackingNumber,
    status: latestStatus,
    lastUpdate: events.length > 0 ? events[events.length - 1].timestamp : null,
    events,
    rawCarrierResponse: {
      records,
      ...(includeFinancialData && {
        declaredValueAmount: mainRecord.c5,
        weight: mainRecord.c41,
        size: mainRecord.c42,
        declaredValueCurrency: mainRecord.c58,
      }),
    },
  };

  return trackingUpdate;
}

export function isRegisteredRecord(record: MPLTrackingRecord): boolean {
  return !!(record.c5 || record.c41 || record.c42 || record.c58);
}
