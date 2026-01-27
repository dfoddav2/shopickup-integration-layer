/**
 * MPL Adapter: Shipment Mappers
 * Converts canonical Parcel objects to/from MPL ShipmentCreateRequest format
 * 
 * Key mapping strategies:
 * 1. Canonical Parcel -> MPL ShipmentCreateRequest (one parcel = one item in shipment)
 * 2. Handles delivery modes: HOME (HA) vs PICKUP_POINT (PM/PP/CS)
 * 3. Maps canonical service levels to MPL basic service codes
 * 4. Translates COD/insurance to MPL extra services
 */

import type { Parcel, Contact as CoreContact, Address as CoreAddress, Delivery } from '@shopickup/core';
import type {
  ShipmentCreateRequest,
  Item,
  Service,
  Recipient,
  Sender,
  Contact as MPLContact,
  Address as MPLAddress,
  BasicServiceCode,
  DeliveryMode,
  LabelType,
} from '../validation.js';

/**
 * Maps canonical service level to MPL basic service code
 * 
 * Defaults to A_175_UZL (standard domestic service)
 * Can be overridden by parcel.carrierServiceCode if provided
 */
export function mapServiceLevel(
  service: string,
  carrierServiceCode?: string,
  isInternational: boolean = false,
): BasicServiceCode {
  // If integrator explicitly provided a carrier service code, use it
  if (carrierServiceCode) {
    // Validate it's a real MPL service code
    const validCodes = [
      'A_175_UZL',
      'A_177_MPC',
      'A_176_NET',
      'A_176_NKP',
      'A_122_ECS',
      'A_121_CSG',
      'A_13_EMS',
      'A_123_EUP',
      'A_123_HAR',
      'A_123_HAI',
      'A_125_HAR',
      'A_125_HAI',
    ];
    if (validCodes.includes(carrierServiceCode)) {
      return carrierServiceCode as BasicServiceCode;
    }
  }

  // Map canonical service levels to MPL codes
  if (isInternational) {
    switch (service) {
      case 'standard':
        return 'A_123_EUP'; // Europe standard
      case 'express':
        return 'A_13_EMS'; // Express Mail Service
      default:
        return 'A_123_EUP';
    }
  }

  // Domestic services
  switch (service) {
    case 'express':
      return 'A_121_CSG'; // Csomag (parcel) - faster
    case 'economy':
      return 'A_175_UZL'; // Standard - cheapest
    case 'overnight':
      return 'A_121_CSG'; // Use fastest available
    case 'standard':
    default:
      return 'A_175_UZL'; // Default standard domestic
  }
}

/**
 * Maps delivery type to MPL delivery mode
 * 
 * Canonical Delivery is discriminated union:
 * - HomeDelivery: { method: 'HOME'; address }
 * - PickupPointDelivery: { method: 'PICKUP_POINT'; pickupPoint }
 */
export function mapDeliveryMode(delivery: Delivery): DeliveryMode {
  switch (delivery.method) {
    case 'HOME':
      return 'HA'; // Házhozszállítás (Home Delivery)
    case 'PICKUP_POINT':
      // Parcel locker (Csomagautomata) by default for pickup points
      // Integrator can override via metadata if needed
      return 'CS'; // Csomagautomata
    default:
      return 'HA'; // Default to home
  }
}

/**
 * Maps canonical Contact to MPL Contact format
 */
export function mapContact(contact: CoreContact): MPLContact {
  return {
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
  };
}

/**
 * Maps canonical Address to MPL Address format
 * 
 * MPL requires:
 * - postCode: 4 characters
 * - city: 2-35 chars
 * - address: 3-60 chars (street + house number)
 */
export function mapAddress(address: CoreAddress): MPLAddress {
  return {
    postCode: address.postalCode.slice(0, 4).padEnd(4, '0'), // Normalize to 4 digits
    city: address.city.slice(0, 35),
    address: address.street.slice(0, 60),
  };
}

/**
 * Maps canonical Delivery to MPL DeliveryAddress
 * If PICKUP_POINT, includes pickup point information
 */
export function mapDeliveryAddress(delivery: Delivery): MPLAddress {
  if (delivery.method === 'HOME') {
    return mapAddress(delivery.address);
  } else {
    // PICKUP_POINT - use pickup point address if available, otherwise use fallback
    const pickupAddr = delivery.pickupPoint.address;
    if (pickupAddr) {
      return mapAddress(pickupAddr);
    }
    // Fallback - this shouldn't happen but be defensive
    throw new Error('PickupPointDelivery missing address information');
  }
}

/**
 * Maps canonical Recipient to MPL Recipient format
 */
export function mapRecipient(recipient: {
  contact: CoreContact;
  delivery: Delivery;
}): Recipient {
  return {
    contact: mapContact(recipient.contact),
    address: mapDeliveryAddress(recipient.delivery),
  };
}

/**
 * Maps canonical Parcel shipper to MPL Sender format
 * 
 * IMPORTANT: Sender requires:
 * - agreement (8-character contract number)
 * - contact, address
 * 
 * The integration should provide agreement number via parcel metadata or credentials
 */
export function mapSender(
  shipper: {
    contact: CoreContact;
    address: CoreAddress;
  },
  agreementNumber: string,
): Sender {
  return {
    agreement: agreementNumber.padEnd(8, '0').slice(0, 8),
    contact: mapContact(shipper.contact),
    address: mapAddress(shipper.address),
  };
}

/**
 * Maps canonical Parcel to MPL Service configuration
 * Handles COD, insurance, delivery mode, service level
 */
export function mapService(
  parcel: Parcel,
  isInternational: boolean = false,
): Service {
  const service: Service = {
    basic: mapServiceLevel(
      parcel.service,
      parcel.carrierServiceCode,
      isInternational,
    ),
    deliveryMode: mapDeliveryMode(parcel.recipient.delivery),
  };

  // Handle cash on delivery
  if (parcel.cod?.amount) {
    service.cod = parcel.cod.amount.amount;
    if (parcel.cod.amount.currency && parcel.cod.amount.currency !== 'HUF') {
      service.codCurrency = parcel.cod.amount.currency;
    }
  }

  // Handle declared value / insurance
  if (parcel.declaredValue?.amount) {
    service.value = Math.round(parcel.declaredValue.amount);
    // If we have value, add K_ENY (value insurance) extra service
    service.extra = service.extra || [];
    if (!service.extra.includes('K_ENY')) {
      service.extra.push('K_ENY');
    }
  } else if (parcel.insurance?.amount) {
    service.value = Math.round(parcel.insurance.amount.amount);
    service.extra = service.extra || [];
    if (!service.extra.includes('K_ENY')) {
      service.extra.push('K_ENY');
    }
  }

  return service;
}

/**
 * Maps canonical Parcel package to MPL Item format
 * 
 * A parcel contains one item (package) in MPL terms
 */
export function mapItem(parcel: Parcel): Item {
  const item: Item = {
    services: mapService(parcel),
  };

  // Add weight if available
  if (parcel.package?.weightGrams) {
    item.weight = {
      value: parcel.package.weightGrams,
      unit: 'g',
    };
  }

  // Add custom data from references if available
  if (parcel.references?.orderId) {
    item.customData1 = parcel.references.orderId.slice(0, 40);
  }

  if (parcel.references?.customerReference) {
    item.customData2 = parcel.references.customerReference.slice(0, 40);
  }

  // Handle special handling requirements
  if (parcel.handling?.fragile || parcel.handling?.perishables) {
    if (!item.services.extra) {
      item.services.extra = [];
    }
    // Add bulky handling if needed for fragile items
    if (!item.services.extra.includes('K_TER')) {
      item.services.extra.push('K_TER');
    }
  }

  return item;
}

/**
 * Main mapper: canonical Parcel -> MPL ShipmentCreateRequest
 * 
 * Usage:
 * ```
 * const mplShipment = mapParcelToMPLShipment(
 *   canonicalParcel,
 *   sender,
 *   agreementNumber,
 *   labelType
 * );
 * ```
 * 
 * @param parcel - Canonical Parcel domain object
 * @param shipper - Shipper contact and address from parcel
 * @param agreementNumber - 8-character MPL agreement/contract number
 * @param labelType - Optional label format (A5, A4, etc.)
 * @param developerName - System name making the API call (default: "shopickup-mpl")
 * @returns MPL ShipmentCreateRequest ready for POST /shipments
 */
export function mapParcelToMPLShipment(
  parcel: Parcel,
  shipper: {
    contact: CoreContact;
    address: CoreAddress;
  },
  agreementNumber: string,
  labelType?: LabelType,
  developerName: string = 'shopickup-mpl',
): ShipmentCreateRequest {
  return {
    developer: developerName,
    sender: mapSender(shipper, agreementNumber),
    recipient: mapRecipient(parcel.recipient),
    webshopId: parcel.id, // Use parcel ID as unique identifier within request
    orderId: parcel.references?.orderId,
    labelType: labelType || 'A5', // Default to A5
    item: [mapItem(parcel)],
  };
}

/**
 * Batch mapper: Convert multiple parcels to multiple ShipmentCreateRequests
 * 
 * Useful for preparing shipment array for batch POST
 */
export function mapParcelsToMPLShipments(
  parcels: Parcel[],
  shipper: {
    contact: CoreContact;
    address: CoreAddress;
  },
  agreementNumber: string,
  labelType?: LabelType,
  developerName?: string,
): ShipmentCreateRequest[] {
  return parcels.map((parcel, idx) =>
    mapParcelToMPLShipment(
      parcel,
      shipper,
      agreementNumber,
      labelType,
      developerName,
    ),
  );
}
