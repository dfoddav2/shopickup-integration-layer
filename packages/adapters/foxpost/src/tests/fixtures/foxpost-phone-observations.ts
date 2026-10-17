/**
 * What Foxpost's test API answered on 2026-10-17 when each string was sent as `recipientPhone` of a
 * pickup-point parcel (home delivery gave the same answers). `accepted: true` means the parcel was created.
 * Re-run such a request per row to update it; do not edit by hand.
 */
export interface FoxpostPhoneObservation {
  phone: string;
  accepted: boolean;
  note: string;
}

export const FOXPOST_PHONE_OBSERVATIONS: readonly FoxpostPhoneObservation[] = [
  { phone: '+36 20 123 4567', accepted: false, note: 'spaced +36 20 123 4567' },
  { phone: '+36-20-123-4567', accepted: false, note: 'dashes +36-20-123-4567' },
  { phone: '06201234567', accepted: false, note: '06 national' },
  { phone: '06 20 123 4567', accepted: false, note: '06 national spaced' },
  { phone: '0036201234567', accepted: false, note: '0036' },
  { phone: '36201234567', accepted: true, note: '36 without plus' },
  { phone: '201234567', accepted: false, note: 'bare 20...' },
  { phone: '+3606201234567', accepted: false, note: '+36 trunk zero +36 06...' },
  { phone: '+36301234567', accepted: true, note: 'prefix 30' },
  { phone: '+36311234567', accepted: true, note: 'prefix 31' },
  { phone: '+36501234567', accepted: true, note: 'prefix 50' },
  { phone: '+36511234567', accepted: false, note: 'prefix 51' },
  { phone: '+36701234567', accepted: true, note: 'prefix 70' },
  { phone: '+36901234567', accepted: false, note: 'prefix 90 (premium)' },
  { phone: '+36211234567', accepted: false, note: 'prefix 21 (invalid)' },
  { phone: '+3612345678', accepted: false, note: 'landline Budapest' },
  { phone: '+3662123456', accepted: false, note: 'landline Szeged' },
  { phone: '+420602123456', accepted: false, note: 'Czech mobile' },
  { phone: '+436641234567', accepted: false, note: 'Austrian mobile' },
  { phone: '+3620123', accepted: false, note: 'too short' },
  { phone: '+362012345678', accepted: false, note: 'too long' },
  { phone: '+36201abc67', accepted: false, note: 'letters' },
  { phone: '', accepted: false, note: 'empty' },
];
