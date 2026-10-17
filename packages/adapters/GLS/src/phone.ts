/**
 * Recipient phone numbers the way GLS validates them.
 *
 * ## What GLS does (verified 2026-10-17, test API, ~130 requests)
 *
 * The MyGLS documentation says nothing about phone formats beyond "international
 * format" for the SMS services. In practice GLS parses the number against the
 * DESTINATION country, and for the SMS-based parameters (the pickup-point `PSD`
 * ContactPhone, `SM2` and `FSS`) it requires a valid MOBILE number of that
 * country. It accepts every common way of writing such a number: `+420...` with
 * spaces, dashes or parentheses, `00420...`, `420...` without the plus, and the
 * national form with or without the trunk zero. It refuses `+cc` followed by the
 * trunk zero, implausible, short or long numbers, letters, an empty value,
 * landlines, and numbers of another country. `CS1` and the plain home-delivery
 * contact phone accept anything (even a landline or no phone).
 *
 * This module replicates that without any dependency, so the adapter can refuse a
 * doomed number before the request and send the normalised E.164 form (which GLS
 * accepted for every valid number). The mobile patterns are the numbering-plan
 * ranges (the same data libphonenumber ships); GLS agreed with them on 98 of the
 * first 102 requests, and the four differences were `+cc0...` numbers that
 * libphonenumber repairs and GLS refuses, which this module refuses too.
 *
 * Known divergences, kept strict on purpose: GLS accepted a Hungarian mobile
 * number for an SK destination; this module requires the destination's own.
 * RS is included for completeness but could not be tested (no pickup points, and
 * SM2/FSS are not available there).
 */

interface PhoneRule {
  /** Country calling code, without the plus. */
  callingCode: string;
  /** National (trunk) prefixes a number may be dialled with at home; none for CZ. */
  trunkPrefixes: readonly string[];
  /** Mobile numbering plan of the national significant number (no trunk prefix). */
  mobile: RegExp;
}

export const GLS_PHONE_RULES: Readonly<Record<string, PhoneRule>> = {
  HU: { callingCode: '36', trunkPrefixes: ['06'], mobile: /^(?:(?:[257]0|3[01])\d{7})$/ },
  CZ: { callingCode: '420', trunkPrefixes: [], mobile: /^(?:(?:60[1-8]\d|7(?:0(?:[2-5]\d|60)|19[0-4]|[2379]\d\d))\d{5})$/ },
  SK: { callingCode: '421', trunkPrefixes: ['0'], mobile: /^(?:909[1-9]\d{5}|9(?:0[1-8]|1[0-24-9]|4[03-57-9]|5\d)\d{6})$/ },
  HR: { callingCode: '385', trunkPrefixes: ['0'], mobile: /^(?:9(?:(?:0[1-9]|[12589]\d)\d\d|7(?:[0679]\d\d|5(?:[01]\d|44|55|77|9[5-79])))\d{4}|98\d{6})$/ },
  RO: { callingCode: '40', trunkPrefixes: ['0'], mobile: /^(?:(?:630|702)0\d{5}|(?:6(?:00|2\d)|7(?:0[013-9]|1[0-3]|[2-7]\d|8[03-8]|9[0-39]))\d{6})$/ },
  SI: { callingCode: '386', trunkPrefixes: ['0'], mobile: /^(?:65(?:[178]\d|5[56]|6[01])\d{4}|(?:[37][01]|4[0139]|51|6[489])\d{6})$/ },
  RS: { callingCode: '381', trunkPrefixes: ['0'], mobile: /^(?:6(?:[0-689]|7\d)\d{6,7})$/ },
};

export type GLSPhoneFailure =
  /** Empty, or contains something other than digits, spaces, dashes, dots, parentheses and a leading plus. */
  | 'invalid-characters'
  /** An international number with another country's calling code. */
  | 'other-country'
  /** Not a valid mobile number of the destination country (landline, implausible, too short or long, `+cc0...`). */
  | 'not-mobile'
  /** The destination has no rule here. */
  | 'unsupported-country';

export type GLSPhoneResult =
  | { ok: true; /** `+` and the calling code and the national number, nothing else. */ e164: string }
  | { ok: false; reason: GLSPhoneFailure };

/**
 * Normalises a phone number for the destination country and checks that it is a
 * valid MOBILE number there, as GLS requires for PSD, SM2 and FSS.
 */
export function normalizeGLSMobilePhone(phone: string, country: string): GLSPhoneResult {
  const rule = GLS_PHONE_RULES[country.toUpperCase()];
  if (!rule) return { ok: false, reason: 'unsupported-country' };

  const text = (phone ?? '').trim();
  if (!text || /[^\d+\s().-]/.test(text) || text.lastIndexOf('+') > 0) {
    return { ok: false, reason: 'invalid-characters' };
  }

  const digits = text.replace(/\D/g, '');
  const cc = rule.callingCode;
  const accept = (nsn: string): GLSPhoneResult =>
    rule.mobile.test(nsn) ? { ok: true, e164: `+${cc}${nsn}` } : { ok: false, reason: 'not-mobile' };

  // International: a plus or the 00 exit prefix, and then it must be this country's code.
  const international = text.startsWith('+') ? digits : digits.startsWith('00') ? digits.slice(2) : null;
  if (international !== null) {
    if (!international.startsWith(cc)) return { ok: false, reason: 'other-country' };
    return accept(international.slice(cc.length));
  }

  // No prefix at all: the national form with its trunk prefix, the bare national
  // number, or the calling code written without the plus. The first that is a
  // valid mobile number wins.
  const candidates: string[] = [];
  for (const trunk of rule.trunkPrefixes) {
    if (digits.startsWith(trunk)) candidates.push(digits.slice(trunk.length));
  }
  candidates.push(digits);
  if (digits.startsWith(cc)) candidates.push(digits.slice(cc.length));
  for (const nsn of candidates) {
    if (rule.mobile.test(nsn)) return { ok: true, e164: `+${cc}${nsn}` };
  }
  return { ok: false, reason: 'not-mobile' };
}

/**
 * Best-effort normalisation for the parameters GLS does not validate (CS1, the
 * plain contact phone): the E.164 form when the number is a valid mobile number of
 * the destination, otherwise the input unchanged.
 */
export function normalizeGLSPhoneLoosely(phone: string, country: string): string {
  const result = normalizeGLSMobilePhone(phone, country);
  return result.ok ? result.e164 : phone;
}

/** The reason for a refused number, worded for logs and error messages. */
export function explainGLSPhoneFailure(phone: string, country: string, reason: GLSPhoneFailure): string {
  const cc = country.toUpperCase();
  switch (reason) {
    case 'other-country':
      return `Phone number "${phone}" does not match destination country ${cc}. Expected a ${cc} mobile number (+${GLS_PHONE_RULES[cc]?.callingCode}...).`;
    case 'invalid-characters':
      return `Phone number "${phone}" is not a valid phone number (digits, spaces and a leading + only).`;
    case 'unsupported-country':
      return `No phone number rules for destination country ${cc}.`;
    default:
      return `Phone number "${phone}" is not a valid mobile number for destination country ${cc}. GLS needs a mobile number for this service; landlines are refused.`;
  }
}
