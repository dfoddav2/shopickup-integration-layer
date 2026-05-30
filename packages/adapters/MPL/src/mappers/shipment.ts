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
  DeliveryAddress,
  BasicServiceCode,
  DeliveryMode,
  LabelType,
  PackageSize,
  CreateParcelsMPLCarrierOptions,
  ExtraServiceCode,
  Invoice,
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
    organization: contact.company,
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
    remark: (address as any).remark?.slice(0, 50),
  };
}

/**
 * Maps canonical Delivery to MPL DeliveryAddress
 * If PICKUP_POINT, includes pickup point information and parcelPickupSite
 */
export function mapDeliveryAddress(delivery: Delivery): DeliveryAddress {
  if (delivery.method === 'HOME') {
    return mapAddress(delivery.address);
  } else {
    // PICKUP_POINT - use pickup point address if available, otherwise use fallback
    const pickupAddr = delivery.pickupPoint.address;
    if (!pickupAddr) {
      throw new Error('PickupPointDelivery missing address information');
    }
    return {
      ...mapAddress(pickupAddr),
      parcelPickupSite: delivery.pickupPoint.id,
    };
  }
}

/**
 * Maps canonical Recipient to MPL Recipient format
 */
export function mapRecipient(
  recipient: {
    contact: CoreContact;
    delivery: Delivery;
  },
  luaCode?: string,
  disabled?: boolean,
): Recipient {
  const r: Recipient = {
    contact: mapContact(recipient.contact),
    address: mapDeliveryAddress(recipient.delivery),
  };
  if (luaCode) {
    r.luaCode = luaCode;
  }
  if (disabled !== undefined) {
    r.disabled = disabled;
  }
  return r;
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
  agreementCode: string,
  bankAccountNumber: string,
  parcelTerminal?: boolean,
  invoice?: Invoice,
): Sender {
  const s: Sender = {
    agreement: agreementCode,
    accountNo: bankAccountNumber,
    contact: mapContact(shipper.contact),
    address: mapAddress(shipper.address),
  };
  if (parcelTerminal !== undefined) {
    s.parcelTerminal = parcelTerminal;
  }
  if (invoice) {
    s.invoice = invoice;
  }
  return s;
}

/**
 * Maps canonical Parcel to MPL Service configuration
 * Handles COD, insurance, delivery mode, service level
 */
export function mapService(
  parcel: Parcel,
  isInternational: boolean = false,
  customsValue?: number,
  customsValueCurrency?: string,
  extraServices?: ExtraServiceCode[],
  supplementarySheetNr?: number,
  exportAuthorisation?: string,
  otherComment?: string,
  secId?: boolean,
  produceContent?: string,
): Service {
  const service: Service = {
    basic: mapServiceLevel(
      parcel.service,
      parcel.carrierServiceCode,
      isInternational,
    ),
    deliveryMode: mapDeliveryMode(parcel.recipient.delivery),
  };

  // Merge explicit extra services with auto-derived ones
  const extras = new Set<ExtraServiceCode>(extraServices ?? []);

  // Handle cash on delivery
  if (parcel.cod?.amount) {
    service.cod = parcel.cod.amount.amount;
    if (parcel.cod.amount.currency && parcel.cod.amount.currency !== 'HUF') {
      service.codCurrency = parcel.cod.amount.currency;
    }
    extras.add('K_UVT');
  }

  // Handle declared value / insurance
  if (parcel.declaredValue?.amount) {
    service.value = Math.round(parcel.declaredValue.amount);
    extras.add('K_ENY');
  } else if (parcel.insurance?.amount) {
    service.value = Math.round(parcel.insurance.amount.amount);
    extras.add('K_ENY');
  }

  // Handle special handling requirements
  if (parcel.handling?.fragile || parcel.handling?.perishables) {
    extras.add('K_TER');
  }

  if (extras.size > 0) {
    service.extra = Array.from(extras);
  }

  // Handle customs value for international shipments
  if (customsValue !== undefined) {
    service.customsValue = customsValue;
    if (customsValueCurrency) {
      service.customsValueCurrency = customsValueCurrency;
    }
  }

  if (supplementarySheetNr !== undefined) {
    service.supplementarySheetNr = supplementarySheetNr;
  }
  if (exportAuthorisation) {
    service.exportAuthorisation = exportAuthorisation;
  }
  if (otherComment) {
    service.otherComment = otherComment;
  }
  if (secId !== undefined) {
    service.secId = secId;
  }
  if (produceContent) {
    service.produceContent = produceContent;
  }

  return service;
}

/**
 * TODO: MPL size mapping explainer
 *
 * That mapping is shown in partner documentation and examples of MPL locker handling, and it
 * matches the API examples where shipments are tagged with  size: "L"  while weight is sent
 * separately. If you are targeting the Hungarian Posta business parcel product rather than
 * parcel lockers, the weight limits can differ by destination type, so the service code alone
 * is not enough to infer the correct cap.
 *
 * Most useful implementation note:
 * For your integration layer, the safest approach is to treat  size  as a carrier-specific enum
 * and validate it against the delivery method: home delivery, post office, or locker.
 * That means you should not rely only on the API schema text; you should explicitly encode
 * the actual dimension and weight rules per MPL service in your adapter or validation layer.
 *
 * Recommended interpretation:
 * If your docs only say  szabvány méret , the best reading is: MPL expects one of the carrier’s
 * predefined size classes, and those classes are service-dependent rather than universal.
 *
 * TODO: Consult MPL service representative to encode exact dimension and weight thresholds.
 */

/**
 * Maps canonical parcel dimensions to an MPL package size category.
 *
 * MPL parcel lockers (CS) require a size code rather than raw dimensions.
 * Heuristic thresholds based on common locker slot sizes:
 *   S  – small locker slot (max dim ≤ 38 cm)
 *   M  – medium locker slot (max dim ≤ 60 cm)
 *   L  – large locker slot (anything larger)
 */
export function mapDimensionsToSize(
  dimensions: { length: number; width: number; height: number }
): PackageSize {
  const maxDim = Math.max(dimensions.length, dimensions.width, dimensions.height);
  if (maxDim <= 38) return 'S';
  if (maxDim <= 60) return 'M';
  return 'L';
}

/**
 * Maps canonical Parcel package to MPL Item format
 *
 * A parcel contains one item (package) in MPL terms
 */
export function mapItem(
  parcel: Parcel,
  sizeOverride?: PackageSize,
  senderParcelPickupSite?: string,
  customsValue?: number,
  customsValueCurrency?: string,
  extraServices?: ExtraServiceCode[],
  supplementarySheetNr?: number,
  exportAuthorisation?: string,
  otherComment?: string,
  secId?: boolean,
  produceContent?: string,
  qrCode?: string,
): Item {
  const item: Item = {
    services: mapService(
      parcel,
      false,
      customsValue,
      customsValueCurrency,
      extraServices,
      supplementarySheetNr,
      exportAuthorisation,
      otherComment,
      secId,
      produceContent,
    ),
  };

  // Add weight if available
  if (parcel.package?.weightGrams) {
    item.weight = {
      value: parcel.package.weightGrams,
      unit: 'g',
    };
  }

  // Add size category: explicit override via mplOpts.size takes precedence, otherwise derive
  // from parcel dimensions using mapDimensionsToSize. NOTE: this heuristic should be validated
  // against the delivery method and MPL service rules (see TODO above).
  if (sizeOverride) {
    item.size = sizeOverride;
  } else if (parcel.package?.dimensionsCm) {
    item.size = mapDimensionsToSize(parcel.package.dimensionsCm);
  }

  // Add custom data from references if available
  if (parcel.references?.orderId) {
    item.customData1 = parcel.references.orderId.slice(0, 40);
  }

  if (parcel.references?.customerReference) {
    item.customData2 = parcel.references.customerReference.slice(0, 40);
  }

  // Sender-side parcel pickup site (for parcel locker dispatch)
  if (senderParcelPickupSite) {
    item.senderParcelPickupSite = senderParcelPickupSite;
  }

  // QR code content for label
  if (qrCode) {
    item.qrCode = qrCode;
  }

  return item;
}

/**
 * Main mapper: canonical Parcel -> MPL ShipmentCreateRequest
 *
 * Accepts the full MPL carrier options object so every optional field
 * (labelFormat, tag, groupTogether, deliveryTime, etc.) can be forwarded
 * without expanding the parameter list.
 *
 * @param parcel - Canonical Parcel domain object
 * @param shipper - Shipper contact and address from parcel
 * @param mplOpts - Full MPL carrier-specific options
 * @param developerName - System name making the API call (default: "shopickup-mpl")
 * @returns MPL ShipmentCreateRequest ready for POST /shipments
 */
export function mapParcelToMPLShipment(
  parcel: Parcel,
  shipper: {
    contact: CoreContact;
    address: CoreAddress;
  },
  mplOpts: CreateParcelsMPLCarrierOptions,
  developerName: string = 'shopickup-mpl',
): ShipmentCreateRequest {
  const req: ShipmentCreateRequest = {
    developer: developerName,
    sender: mapSender(
      shipper,
      mplOpts.agreementCode,
      mplOpts.bankAccountNumber,
      mplOpts.parcelTerminal,
      mplOpts.invoice,
    ),
    recipient: mapRecipient(
      parcel.recipient,
      mplOpts.recipientLuaCode,
      mplOpts.recipientDisabled,
    ),
    webshopId: parcel.id,
    orderId: parcel.references?.orderId,
    labelType: mplOpts.labelType ?? 'A5',
    item: [
      mapItem(
        parcel,
        mplOpts.size,
        mplOpts.senderParcelPickupSite,
        mplOpts.customsValue,
        mplOpts.customsValueCurrency,
        mplOpts.extraServices,
        mplOpts.supplementarySheetNr,
        mplOpts.exportAuthorisation,
        mplOpts.otherComment,
        mplOpts.secId,
        mplOpts.produceContent,
        mplOpts.qrCode,
      ),
    ],
  };

  if (mplOpts.labelFormat) {
    req.labelFormat = mplOpts.labelFormat;
  }
  if (mplOpts.shipmentDate) {
    req.shipmentDate = mplOpts.shipmentDate;
  }
  if (mplOpts.tag) {
    req.tag = mplOpts.tag;
  }
  if (mplOpts.groupTogether !== undefined) {
    req.groupTogether = mplOpts.groupTogether;
  }
  if (mplOpts.deliveryTime) {
    req.deliveryTime = mplOpts.deliveryTime;
  }
  if (mplOpts.deliveryDate) {
    req.deliveryDate = mplOpts.deliveryDate;
  }
  if (mplOpts.paymentMode) {
    req.paymentMode = mplOpts.paymentMode;
  }
  if (mplOpts.packageRetention !== undefined) {
    req.packageRetention = mplOpts.packageRetention;
  }
  if (mplOpts.printRecipientData) {
    req.printRecipientData = mplOpts.printRecipientData;
  }

  return req;
}

/**
 * Batch mapper: Convert multiple parcels to multiple ShipmentCreateRequests
 *
 * Useful for preparing shipment array for batch POST.
 * All parcels share the same shipper and MPL options (uniform batch).
 */
export function mapParcelsToMPLShipments(
  parcels: Parcel[],
  shipper: {
    contact: CoreContact;
    address: CoreAddress;
  },
  mplOpts: CreateParcelsMPLCarrierOptions,
  developerName?: string,
): ShipmentCreateRequest[] {
  return parcels.map((parcel) =>
    mapParcelToMPLShipment(parcel, shipper, mplOpts, developerName),
  );
}
