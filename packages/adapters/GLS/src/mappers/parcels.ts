/**
 * GLS Parcel Mapper
 * 
 * Transforms canonical Parcel objects to GLS API format for ParcelService.
 * All mappings are HU-specific but should work for other regions with minimal adjustments.
 */

import type { Parcel } from '@shopickup/core';
import type { GLSParcel, GLSAddress, GLSParcelProperty } from '../types/index.js';

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
export function mapDimensionsToGLSParcelProperty(parcel: Parcel): GLSParcelProperty[] | undefined {
  if (!parcel.package?.dimensionsCm) {
    return undefined;
  }

  const dim = parcel.package.dimensionsCm;
  const properties: GLSParcelProperty[] = [];

  // Create a parcel property with dimensions and packaging info
  properties.push({
    content: 'Package contents',
    packageType: 1, // Default to parcel (1=parcel, 2=pallet, etc.)
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
  codCurrency?: string
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
    deliveryAddressData = {
      ...(pickupPoint.address || {}),
      name: pickupPoint.name || 'Pickup Point',
      city: pickupPoint.address?.city || 'Pickup Point',
      street: pickupPoint.address?.street || pickupPoint.id,
      postalCode: pickupPoint.address?.postalCode || '00000',
      country: pickupPoint.address?.country || 'HU',
      contactName: parcel.recipient.contact.name,
      contactPhone: parcel.recipient.contact.phone,
      contactEmail: parcel.recipient.contact.email,
    };
  }
  const deliveryAddress = mapAddressToGLSAddress(deliveryAddressData);

  return {
    clientReference: parcel.id,
    count: 1,
    content: 'Package contents',
    pickupAddress,
    deliveryAddress,
    codAmount,
    codCurrency: codCurrency || 'HUF',
    parcelPropertyList: mapDimensionsToGLSParcelProperty(parcel),
    // Other fields like serviceList, senderIdentityCardNumber can be added as needed
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
  clientNumber: number
): GLSParcel[] {
  return parcels.map((parcel) => mapCanonicalParcelToGLS(parcel, clientNumber));
}

/**
 * Maps GLS ParcelInfo response to a CarrierResource-compatible object
 * 
 * @param parcelInfo Successfully created parcel info from GLS
 * @param index Index in the batch for tracking
 * @returns Object suitable for CarrierResource
 */
export function mapGLSParcelInfoToCarrierResource(parcelInfo: any, index: number): any {
  return {
    carrierId: parcelInfo.parcelId.toString(),
    status: 'created',
    raw: parcelInfo,
    metadata: {
      clientReference: parcelInfo.clientReference,
      parcelId: parcelInfo.parcelId,
    },
  };
}
