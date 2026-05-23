/**
 * GLS Parcel Mapper
 * 
 * Transforms canonical Parcel objects to GLS API format for ParcelService.
 * All mappings are HU-specific but should work for other regions with minimal adjustments.
 */

import type { Parcel } from '@shopickup/core';
import type { GLSParcel, GLSAddress, GLSParcelProperty, GLSService } from '../types/index.js';

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
}

/**
 * Extracts house number from street address string.
 * Looks for trailing digits (e.g. "Main St 123" → "123").
 * Returns undefined if no trailing digits found.
 */
export function extractHouseNumber(street: string): string | undefined {
  const match = street.trim().match(/\s(\d+[a-zA-Z]*)$/);
  return match ? match[1] : undefined;
}

/**
 * Removes trailing house number from street address string.
 * E.g. "Main St 123" → "Main St"
 */
export function removeHouseNumber(street: string): string {
  const houseNumber = extractHouseNumber(street);
  if (!houseNumber) return street;
  return street.trim().replace(new RegExp(`\\s${houseNumber.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`), '').trim();
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
 * Builds auto-derived services from parcel data and options.
 */
export function buildGLSServiceList(
  parcel: Parcel,
  options?: CreateParcelsGLSCarrierOptions
): GLSService[] {
  const services: GLSService[] = [];

  // PICKUP_POINT → PSD (Parcel Shop Delivery)
  if (parcel.recipient.delivery.method === 'PICKUP_POINT') {
    const pickupPoint = parcel.recipient.delivery.pickupPoint;
    services.push({
      code: 'PSD',
      value: pickupPoint.id,
    });
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

  // Email notification → FDS (recipient email)
  if (parcel.recipient.contact.email) {
    services.push({
      code: 'FDS',
      fdsParameter: { value: parcel.recipient.contact.email },
    });
  }

  // SMS notification → FSS (recipient phone)
  if (parcel.recipient.contact.phone) {
    services.push({
      code: 'FSS',
      fssParameter: { value: parcel.recipient.contact.phone },
    });
  }

  // Merge explicit services (provided by integrator)
  if (options?.services && options.services.length > 0) {
    for (const svc of options.services) {
      // Avoid duplicate codes: explicit overrides auto-derived
      const existing = services.find((s) => s.code === svc.code);
      if (existing) {
        // Replace with explicit version
        Object.assign(existing, svc);
      } else {
        services.push(svc);
      }
    }
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
  const houseNumberExtracted = !houseNumberExplicit ? extractHouseNumber(streetRaw) : undefined;
  const houseNumber = houseNumberExplicit || houseNumberExtracted;
  const streetClean = houseNumberExtracted ? removeHouseNumber(streetRaw) : streetRaw;

  return {
    name: address.name || '',
    street: streetClean || address.street || '',
    houseNumber: houseNumber || '',
    houseNumberInfo: address.houseNumberInfo || address.building || '',
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
  options?: CreateParcelsGLSCarrierOptions
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
  const serviceList = buildGLSServiceList(parcel, options);

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
 * @returns Array of GLS Parcel objects
 */
export function mapCanonicalParcelsToGLS(
  parcels: Parcel[],
  clientNumber: number,
  options?: CreateParcelsGLSCarrierOptions
): GLSParcel[] {
  return parcels.map((parcel) => mapCanonicalParcelToGLS(parcel, clientNumber, options));
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
