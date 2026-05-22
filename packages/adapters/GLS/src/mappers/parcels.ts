/**
 * GLS Parcel Mapper
 * 
 * Transforms canonical Parcel objects to GLS API format for ParcelService.
 * All mappings are HU-specific but should work for other regions with minimal adjustments.
 */

import type { Parcel } from '@shopickup/core';
import type { GLSParcel, GLSAddress, GLSParcelProperty, GLSService } from '../types/index.js';

/**
 * Maps a canonical Address to GLS Address format
 * 
 * @param address Canonical address (sender or destination)
 * @returns GLS Address object
 */
export function mapAddressToGLSAddress(address: any): GLSAddress {
  return {
    name: address.name || '',
    street: address.street || '',
    houseNumber: address.houseNumber || '',
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
 * @returns GLS ParcelProperty array or undefined if no dimensions
 */
export function mapDimensionsToGLSParcelProperty(
  parcel: Parcel,
  packageTypeOverride?: number
): GLSParcelProperty[] | undefined {
  if (!parcel.package?.dimensionsCm) {
    return undefined;
  }

  const dim = parcel.package.dimensionsCm;
  const properties: GLSParcelProperty[] = [];

  // Create a parcel property with dimensions and packaging info
  properties.push({
    content: 'Package contents',
    packageType: packageTypeOverride ?? 1, // Use override or default to Colli (1)
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
 * @param codAmount Optional COD amount
 * @returns GLS Parcel ready for API submission
 * 
 * @example
 * const canonical = {
 *   id: "ORDER-123",
 *   package: { weightGrams: 2500 },
 *   shipper: { contact: {...}, address: {...} },
 *   recipient: { contact: {...}, delivery: {...} }
 * };
 * const glsParcel = mapCanonicalParcelToGLS(canonical, 12345);
 */
export function mapCanonicalParcelToGLS(
  parcel: Parcel,
  clientNumber: number,
  codAmount?: number,
  codCurrency?: string,
  packageTypeOverride?: number
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
    // pickup point’s full address.
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

  // Build service list based on delivery method
  const serviceList: GLSService[] = [];
  if (parcel.recipient.delivery.method === 'PICKUP_POINT') {
    const pickupPoint = parcel.recipient.delivery.pickupPoint;
    // PSD (Parcel Shop Delivery) – the OpenAPI schema defines psdParameter as
    // ServiceParameterStringInteger, but the live API accepts the simpler
    // ServiceParameterString form (a plain "value" field).  We use "value"
    // because that is what the GLS test environment actually expects.
    // The shop ID format from the public feed is number-PARCELSHOP,
    // e.g. "379-PARCELSHOP".
    serviceList.push({
      code: 'PSD',
      value: pickupPoint.id,
    });
  }

  return {
    clientNumber: clientNumber, // REQUIRED: Each parcel must specify its client number for authorization
    clientReference: parcel.id,
    count: 1,
    content: 'Package contents',
    pickupAddress,
    deliveryAddress,
    codAmount,
    codCurrency: codCurrency || 'HUF',
    parcelPropertyList: mapDimensionsToGLSParcelProperty(parcel, packageTypeOverride),
    serviceList: serviceList.length > 0 ? serviceList : undefined,
    // Other fields like senderIdentityCardNumber can be added as needed
    // pickupDate: new Date().toISOString(), // Optional: current date
  };
}

/**
 * Maps an array of canonical Parcels to GLS Parcel format
 * 
 * @param parcels Canonical parcels
 * @param clientNumber GLS client number
 * @returns Array of GLS Parcel objects
 */
export function mapCanonicalParcelsToGLS(
  parcels: Parcel[],
  clientNumber: number,
  packageTypeOverride?: number
): GLSParcel[] {
  return parcels.map((parcel) => mapCanonicalParcelToGLS(parcel, clientNumber, undefined, undefined, packageTypeOverride));
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
