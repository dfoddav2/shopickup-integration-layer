/**
 * GLS Parcel Mapper
 * 
 * Transforms canonical Parcel objects to GLS API format for ParcelService.
 * All mappings are HU-specific but should work for other regions with minimal adjustments.
 */

import type { Parcel } from '@shopickup/core';
import type { GLSParcel, GLSAddress, GLSParcelProperty, GLSService } from '../types/index.js';
import type { Logger } from '@shopickup/core';

/**
 * GLS-specific carrier options for parcel creation.
 */
export interface CreateParcelsGLSCarrierOptions {
  /** Override package type (1=Colli, 2=Box, 3=Roll, 4=Can, 5=Case, 6=Reel, 7=Sack). */
  packageType?: number;
  /** Planned pickup date (ISO 8601). */
  pickupDate?: string;
  /** Enable Saturday Delivery (SAT service). */
  saturdayDelivery?: boolean;
  /** Serbia-only: sender identity card number / PIB. */
  senderIdentityCardNumber?: string;
  /** LRS (LockerReturn Service) pickup type — always 2 for HU. */
  pickupType?: number;
  /** Explicit additional services. */
  services?: GLSService[];
  /** Override parcel contents description. */
  content?: string;
  /** Enable FDS Flexible Delivery Service (email notification). Requires valid email in recipient.contact.email. */
  flexDeliveryServiceEmailFDS?: boolean;
  /** Enable FSS Flexible Delivery SMS Service (SMS notification). Requires valid phone in recipient.contact.phone and flexDeliveryServiceEmailFDS must be true. */
  flexDeliveryServiceSmsFSS?: boolean;
  /** Enable guaranteed 24H delivery service. */
  guaranteed24H?: boolean;
  /** Enable CS1 Contact Service. Requires valid phone in recipient.contact.phone. */
  contactServiceCS1?: boolean;
  /** Enable SMS pre-advice (SM2). Requires valid phone in international format. */
  smsPreadviceSM2?: boolean;
  /** Enable ShopReturn Service (SRS). Available only in HU and SI. */
  shopReturnServiceSRS?: boolean;
  /** GLS API mode: false=production, true=test. FDS/FSS are disabled in test mode. */
  useTestApi?: boolean;
}

/**
 * Extracts house number from street address string.
 * Looks for a trailing token starting with a digit
 * (e.g. "Main St 123" → "123", "Kossuth utca 14/A" → "14/A").
 * Returns undefined if no trailing digit-starting token found.
 */
export function extractHouseNumber(street: string): string | undefined {
  const match = street.trim().match(/\s(\d+\S*)$/u);
  return match ? match[1] : undefined;
}

/**
 * Removes trailing house-number token from street address string.
 * E.g. "Main St 123" → "Main St", "Kossuth utca 14/A" → "Kossuth utca"
 */
export function removeHouseNumber(street: string): string {
  return street.trim().replace(/\s+\d+\S*$/u, '').trim();
}

/**
 * Determines parcel content description from parcel metadata, items, or explicit override.
 */
export function determineContent(
   parcel: Parcel,
   override?: string
 ): string | undefined {
   if (override) return override;
   const meta = parcel.metadata?.glsContent as string | undefined;
   if (meta) return meta;
   if (parcel.items && parcel.items.length > 0) {
     const descriptions = parcel.items
       .map((item) => item.description)
       .filter((d): d is string => !!d);
     if (descriptions.length > 0) {
       return descriptions.join(', ');
     }
   }
   return undefined;
 }

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Maps ISO 3166-1 alpha-2 country codes to international dialing prefixes.
 * Covers all countries supported by GLS.
 */
const COUNTRY_DIAL_PREFIXES: Record<string, string> = {
  HU: '+36',
  AT: '+43',
  BE: '+32',
  BG: '+359',
  CZ: '+420',
  DE: '+49',
  DK: '+45',
  ES: '+34',
  FI: '+358',
  FR: '+33',
  GR: '+30',
  HR: '+385',
  IT: '+39',
  LU: '+352',
  NL: '+31',
  PL: '+48',
  PT: '+351',
  RO: '+40',
  SI: '+386',
  SK: '+421',
  RS: '+381',
};

/**
 * Returns the expected international dialing prefix for a given ISO country code.
 */
function getCountryDialPrefix(country: string): string | undefined {
  return COUNTRY_DIAL_PREFIXES[country.toUpperCase()];
}

/**
 * Validates phone number format (international format with +countrycode)
 * and checks that the country code matches the expected destination country.
 *
 * @param phone Phone number in international format (e.g., "+36301234567")
 * @param country ISO 3166-1 alpha-2 destination country code (e.g., "HU")
 * @returns Error message if invalid, empty string if valid
 */
function validatePhoneNumber(phone: string, country: string): string {
  const phoneRegex = /^\+[1-9][\d\s]+$/;
  if (!phoneRegex.test(phone)) {
    return `Phone number must be in international format starting with +, got: "${phone}"`;
  }

  const expectedPrefix = getCountryDialPrefix(country);
  if (expectedPrefix && !phone.startsWith(expectedPrefix)) {
    return `Phone number "${phone}" does not match destination country ${country.toUpperCase()}. Expected a ${country.toUpperCase()} phone number (${expectedPrefix}...).`;
  }

  return '';
}

/**
 * Builds auto-derived services from parcel data and options.
 */
export function buildGLSServiceList(
  parcel: Parcel,
  options?: CreateParcelsGLSCarrierOptions,
  logger?: Logger
): GLSService[] {
  const services: GLSService[] = [];
  const deliveryCountry = (parcel.recipient.delivery.method === 'PICKUP_POINT'
    ? parcel.recipient.delivery.pickupPoint?.address?.country
    : parcel.recipient.delivery.address?.country) || 'HU';

  // Validate service compatibility before building
  // PSD (Parcel Shop Delivery) is incompatible with home delivery services (FDS, FSS, CS1)
  // because a parcel cannot be delivered to a pickup point and have home delivery services simultaneously.
  if (parcel.recipient.delivery.method === 'PICKUP_POINT' && (options?.flexDeliveryServiceEmailFDS || options?.flexDeliveryServiceSmsFSS || options?.contactServiceCS1)) {
    const conflicting = [
      options.flexDeliveryServiceEmailFDS && 'FDS (flexDeliveryServiceEmailFDS)',
      options.flexDeliveryServiceSmsFSS && 'FSS (flexDeliveryServiceSmsFSS)',
      options.contactServiceCS1 && 'CS1 (contactServiceCS1)',
    ].filter(Boolean).join(' and ');
    throw new Error(
      `GLS: PSD (Parcel Shop Delivery) is incompatible with ${conflicting}. `
      + 'PSD delivers to a pickup point; these are home delivery services. '
      + 'Remove the conflicting options or use HOME delivery instead.'
    );
  }

  // PICKUP_POINT → PSD (Parcel Shop Delivery)
  // Please note, the PSD service requires additonal attributes to be provided, as mandatory (located in Address class):
  // - ContactName
  // - ContactPhone
  // - ContactEmail
  if (parcel.recipient.delivery.method === 'PICKUP_POINT') {
    // PSD requires ContactPhone in the delivery address, and it must match the destination country
    if (!parcel.recipient.contact.phone) {
      throw new Error('PSD (Parcel Shop Delivery) requires recipient.contact.phone');
    }
    const psdPhoneError = validatePhoneNumber(parcel.recipient.contact.phone, deliveryCountry);
    if (psdPhoneError) {
      throw new Error(`PSD (Parcel Shop Delivery) - delivery address ContactPhone: ${psdPhoneError}`);
    }
    const pickupPoint = parcel.recipient.delivery.pickupPoint;
    services.push({
      code: 'PSD',
      psdParameter: {
        stringValue: pickupPoint.id,
      },
    });
    logger?.debug(`GLS: Added PSD service for pickup point: ${pickupPoint.id}`);
  }

  // Saturday Delivery
  if (options?.saturdayDelivery) {
    services.push({ code: 'SAT' });
  }

  // Express / Overnight → T09/T10/T12
  if (parcel.service === 'express' || parcel.service === 'overnight') {
    services.push({ code: 'T09' });
    services.push({ code: 'T10' });
    services.push({ code: 'T12' });
  }

  // Insurance → INS
  if (parcel.insurance?.amount.amount != null) {
    services.push({
      code: 'INS',
      insParameter: { value: parcel.insurance.amount.amount },
    });
  }

  // Declared Value → DPV
  if (parcel.declaredValue?.amount != null) {
    services.push({
      code: 'DPV',
      dpvParameter: {
        stringValue: parcel.declaredValue.currency || 'HUF',
        decimalValue: parcel.declaredValue.amount,
      },
    });
  }

  // Optional email notification → FDS (recipient email)
  if (options?.flexDeliveryServiceEmailFDS) {
    if (!parcel.recipient.contact.email) {
      logger?.warn('GLS: FDS service enabled but recipient.contact.email is missing');
    } else if (!isValidEmail(parcel.recipient.contact.email)) {
      logger?.warn(`GLS: FDS service enabled but email is invalid: "${parcel.recipient.contact.email}"`);
    } else {
      services.push({
        code: 'FDS',
        fdsParameter: { value: parcel.recipient.contact.email },
      });
      logger?.debug(`GLS: Added FDS service for email: ${parcel.recipient.contact.email}`);
    }
  }

  // SMS notification → FSS (recipient phone)
  // NOTE: FSS requires FDS (flexDeliveryServiceEmailFDS) as a prerequisite per GLS service matrix
  if (options?.flexDeliveryServiceSmsFSS) {
    if (!options.flexDeliveryServiceEmailFDS) {
      throw new Error(
        'GLS: FSS (flexDeliveryServiceSmsFSS) requires FDS (flexDeliveryServiceEmailFDS) as a prerequisite. '
        + 'Enable flexDeliveryServiceEmailFDS or remove flexDeliveryServiceSmsFSS.'
      );
    } else if (!parcel.recipient.contact.phone) {
      throw new Error('FSS (flexDeliveryServiceSmsFSS) requires recipient.contact.phone');
    } else if (options.flexDeliveryServiceEmailFDS && !parcel.recipient.contact.email) {
      throw new Error('FSS (flexDeliveryServiceSmsFSS) requires recipient.contact.email when flexDeliveryServiceEmailFDS is enabled');
    } else if (options.flexDeliveryServiceEmailFDS && !isValidEmail(parcel.recipient.contact.email || '')) {
      throw new Error('FSS (flexDeliveryServiceSmsFSS) requires valid email in recipient.contact.email');
    }
    const phoneError = validatePhoneNumber(parcel.recipient.contact.phone, deliveryCountry);
    if (phoneError) {
      throw new Error(`FSS (flexDeliveryServiceSmsFSS): ${phoneError}`);
    }
    services.push({
      code: 'FSS',
      fssParameter: { value: parcel.recipient.contact.phone },
    });
    logger?.debug(`GLS: Added FSS service for phone: ${parcel.recipient.contact.phone}`);
  }

  // Guaranteed 24H service
  if (options?.guaranteed24H) {
    services.push({ code: '24H' });
    logger?.debug('GLS: Added 24H guaranteed delivery service');
  }

  // CS1 Contact Service
  if (options?.contactServiceCS1) {
    if (!parcel.recipient.contact.phone) {
      throw new Error('CS1 Contact Service requires recipient.contact.phone');
    }
    const phoneError = validatePhoneNumber(parcel.recipient.contact.phone, deliveryCountry);
    if (phoneError) {
      throw new Error(`CS1 (contactServiceCS1): ${phoneError}`);
    }
    services.push({
      code: 'CS1',
      cs1Parameter: { value: parcel.recipient.contact.phone },
    });
    logger?.debug(`GLS: Added CS1 Contact Service for phone: ${parcel.recipient.contact.phone}`);
  }

  // SM2 SMS Pre-advice
  if (options?.smsPreadviceSM2) {
    if (!parcel.recipient.contact.phone) {
      throw new Error('SM2 SMS Pre-advice requires recipient.contact.phone');
    }
    const phoneError = validatePhoneNumber(parcel.recipient.contact.phone, deliveryCountry);
    if (phoneError) {
      throw new Error(`SM2 (smsPreadviceSM2): ${phoneError}`);
    }
    services.push({
      code: 'SM2',
      sm2Parameter: { value: parcel.recipient.contact.phone },
    });
    logger?.debug(`GLS: Added SM2 SMS Pre-advice for phone: ${parcel.recipient.contact.phone}`);
  }

  // ShopReturn Service (SRS) - Available only in HU and SI
  if (options?.shopReturnServiceSRS) {
    const country = (parcel.recipient.delivery.method === 'PICKUP_POINT' 
      ? parcel.recipient.delivery.pickupPoint?.address?.country 
      : parcel.recipient.delivery.address.country) || 'HU';
    if (country.toUpperCase() === 'HU' || country.toUpperCase() === 'SI') {
      services.push({ code: 'SRS' });
      logger?.debug(`GLS: Added SRS ShopReturn Service for country: ${country.toUpperCase()}`);
    } else {
      logger?.warn(`GLS: SRS ShopReturn Service not available for country: ${country.toUpperCase()} (only HU and SI)`);
    }
  }

  // Merge explicit services (provided by integrator)
  if (options?.services && options.services.length > 0) {
    for (const svc of options.services) {
      // Avoid duplicate codes: explicit overrides auto-derived
      const existing = services.find((s) => s.code === svc.code);
      if (existing) {
        // Replace with explicit version
        Object.assign(existing, svc);
        logger?.debug(`GLS: Overrode auto-derived service with explicit: ${svc.code}`);
      } else {
        services.push(svc);
        logger?.debug(`GLS: Added explicit service: ${svc.code}`);
      }
    }
  }

  if (services.length > 0) {
    logger?.debug(`GLS: Final service list: ${services.map((s) => s.code).join(', ')}`);
  } else {
    logger?.debug('GLS: No services added');
  }

  return services.length > 0 ? services : [];
}

/**
 * Maps a canonical Address to GLS Address format
 *
 * @param address Canonical address (sender or destination)
 * @returns GLS Address object
 */
export function mapAddressToGLSAddress(address: any): GLSAddress {
  const streetRaw = address.street || '';
  const houseNumberExplicit = address.houseNumber || address.houseNr;
  const houseNumberInfo = address.houseNumberInfo || address.building || '';

  let streetClean: string;
  let houseNumberVal: string;

  if (houseNumberExplicit) {
    streetClean = streetRaw;
    houseNumberVal = houseNumberExplicit;
  } else {
    const extracted = extractHouseNumber(streetRaw);
    if (extracted) {
      streetClean = removeHouseNumber(streetRaw);
      houseNumberVal = extracted;
    } else if (houseNumberInfo && /^\d/.test(houseNumberInfo)) {
      // houseNumberInfo starts with a digit (e.g. "14/A"), likely contains
      // the house number itself — combine with street and re-parse
      const combined = `${streetRaw} ${houseNumberInfo}`.trim();
      const extractedFromCombined = extractHouseNumber(combined);
      if (extractedFromCombined) {
        streetClean = removeHouseNumber(combined);
        houseNumberVal = extractedFromCombined;
      } else {
        streetClean = combined;
        houseNumberVal = '';
      }
    } else {
      streetClean = streetRaw;
      houseNumberVal = '';
    }
  }

  return {
    name: address.name || '',
    street: streetClean,
    houseNumber: houseNumberVal,
    houseNumberInfo,
    city: address.city || '',
    zipCode: address.postalCode || address.zipCode || '',
    countryIsoCode: (address.country || 'HU').toUpperCase(),
    contactName: address.contactName,
    contactPhone: address.contactPhone,
    contactEmail: address.contactEmail,
  };
}

/**
 * Maps parcel dimensions to GLS ParcelProperty format
 *
 * @param parcel Canonical parcel with optional dimensions
 * @param options GLS carrier options
 * @returns GLS ParcelProperty array or undefined if no dimensions
 */
export function mapDimensionsToGLSParcelProperty(
  parcel: Parcel,
  options?: CreateParcelsGLSCarrierOptions
): GLSParcelProperty[] | undefined {
  if (!parcel.package?.dimensionsCm) {
    return undefined;
  }

  const dim = parcel.package.dimensionsCm;
  const properties: GLSParcelProperty[] = [];

  // Create a parcel property with dimensions and packaging info
  properties.push({
    content: determineContent(parcel, options?.content),
    packageType: options?.packageType ?? 1, // Use override or default to Colli (1)
    height: dim.height,
    length: dim.length,
    width: dim.width,
    weight: parcel.package.weightGrams / 1000, // Convert from grams to kg
  });

  return properties;
}

/**
 * Maps canonical Parcel to GLS Parcel format
 *
 * This is the main mapping function for parcel creation.
 *
 * @param parcel Canonical parcel
 * @param clientNumber GLS client number
 * @param options GLS carrier options (pickupDate, services, etc.)
 * @param logger Optional logger for service mapping debug output
 * @returns GLS Parcel ready for API submission
 *
 * @example
 * const canonical = {
 *   id: "ORDER-123",
 *   package: { weightGrams: 2500 },
 *   shipper: { contact: {...}, address: {...} },
 *   recipient: { contact: {...}, delivery: {...} }
 * };
 * const glsParcel = mapCanonicalParcelToGLS(canonical, 12345, { pickupDate: "2026-05-25" });
 */
export function mapCanonicalParcelToGLS(
  parcel: Parcel,
  clientNumber: number,
  options?: CreateParcelsGLSCarrierOptions,
  logger?: Logger
): GLSParcel {
  // Map shipper/sender address
  const pickupAddress = mapAddressToGLSAddress({
    ...parcel.shipper.address,
    name: parcel.shipper.contact.name,
    contactName: parcel.shipper.contact.name,
    contactPhone: parcel.shipper.contact.phone,
    contactEmail: parcel.shipper.contact.email,
  });

  // Map recipient/delivery address
  let deliveryAddressData: any;
  if (parcel.recipient.delivery.method === 'HOME') {
    deliveryAddressData = {
      ...parcel.recipient.delivery.address,
      name: parcel.recipient.contact.name,
      contactName: parcel.recipient.contact.name,
      contactPhone: parcel.recipient.contact.phone,
      contactEmail: parcel.recipient.contact.email,
    };
  } else {
    // PICKUP_POINT delivery
    const pickupPoint = parcel.recipient.delivery.pickupPoint;
    // GLS validates the delivery address even for PSD parcels, so we must
    // supply realistic fallback values when the caller does not include the
    // pickup point's full address.
    deliveryAddressData = {
      ...(pickupPoint.address || {}),
      name: pickupPoint.name || 'Pickup Point',
      city: pickupPoint.address?.city || 'Budapest',
      street: pickupPoint.address?.street || pickupPoint.id,
      postalCode: pickupPoint.address?.postalCode || '1011',
      country: pickupPoint.address?.country || 'HU',
      contactName: parcel.recipient.contact.name,
      contactPhone: parcel.recipient.contact.phone,
      contactEmail: parcel.recipient.contact.email,
    };
  }
  const deliveryAddress = mapAddressToGLSAddress(deliveryAddressData);

  // Build service list (auto-derived + explicit)
  const serviceList = buildGLSServiceList(parcel, options, logger);

  // COD mapping
  let codAmount: number | undefined;
  let codCurrency: string | undefined;
  let codReference: string | undefined;
  if (parcel.cod) {
    codAmount = parcel.cod.amount.amount;
    codCurrency = parcel.cod.amount.currency;
    codReference = parcel.cod.reference;
  }

  return {
    clientNumber: clientNumber, // REQUIRED: Each parcel must specify its client number for authorization
    clientReference: parcel.id,
    count: 1,
    content: determineContent(parcel, options?.content),
    pickupAddress,
    deliveryAddress,
    codAmount,
    codCurrency,
    codReference,
    pickupDate: options?.pickupDate,
    senderIdentityCardNumber: options?.senderIdentityCardNumber,
    pickupType: options?.pickupType,
    parcelPropertyList: mapDimensionsToGLSParcelProperty(parcel, options),
    serviceList: serviceList.length > 0 ? serviceList : undefined,
  };
}

/**
 * Maps an array of canonical Parcels to GLS Parcel format
 *
 * @param parcels Canonical parcels
 * @param clientNumber GLS client number
 * @param options GLS carrier options
 * @param logger Optional logger for service mapping debug output
 * @returns Array of GLS Parcel objects
 */
export function mapCanonicalParcelsToGLS(
  parcels: Parcel[],
  clientNumber: number,
  options?: CreateParcelsGLSCarrierOptions,
  logger?: Logger
): GLSParcel[] {
  return parcels.map((parcel) => mapCanonicalParcelToGLS(parcel, clientNumber, options, logger));
}

/**
 * Maps GLS ParcelInfo response to a CarrierResource-compatible object
 * 
 * @param parcelInfo Successfully created parcel info from GLS
 * @param index Index in the batch for tracking
 * @returns Object suitable for CarrierResource
 */
export function mapGLSParcelInfoToCarrierResource(parcelInfo: any, index: number): any {
  // Handle both camelCase and PascalCase from GLS response
  const parcelId = parcelInfo.parcelId ?? parcelInfo.ParcelId;
  const clientReference = parcelInfo.clientReference ?? parcelInfo.ClientReference;

  return {
    carrierId: parcelId != null ? String(parcelId) : undefined,
    status: 'created',
    raw: parcelInfo,
    metadata: {
      clientReference: clientReference,
      parcelId: parcelId,
    },
  };
}
