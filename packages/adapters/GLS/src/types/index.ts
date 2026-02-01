/**
 * GLS Adapter Types
 * 
 * Type definitions for GLS-specific data structures.
 * GLS serves Hungary and Eastern Europe (AT, BE, BG, CZ, DE, DK, ES, FI, FR, GR, HR, HU, IT, LU, NL, PL, PT, RO, SI, SK, RS)
 */

/**
 * GLS Delivery Point (from public pickup points feed)
 * Represents a parcel shop, locker, or delivery location
 */
export interface GLSDeliveryPoint {
  id: string;
  goldId?: number;
  name: string;
  description?: string;
  contact: {
    countryCode: string;
    postalCode: string;
    city: string;
    address: string;
    web?: string;
    phone?: string;
  };
  location: [latitude: number, longitude: number];
  hours: Array<[weekday: number, from: string | null, to: string | null, ...rest: any[]]>;
  features: string[];
  type: string;
  externalId?: string;
  lockerSaturation?: string;
  hasWheelchairAccess: boolean;
}

/**
 * GLS Delivery Points Feed Response
 * Structure returned from the public GLS pickup points endpoint
 */
export interface GLSDeliveryPointsFeed {
  items: GLSDeliveryPoint[];
}

/**
 * Resolved base URL and country code info for GLS operations
 */
export interface GLSUrlConfig {
  baseUrl: string;
  country: string;
}

/**
 * GLS API Request Base
 * Used for authentication in all GLS MyGLS API calls
 * 
 * IMPORTANT: This adapter is currently HU-specific (Hungary).
 * While GLS MyGLS API supports multiple countries (CZ, HR, RO, SI, SK, RS),
 * this implementation is optimized for HU. Other countries may require:
 * - Adjusted service codes and parameters
 * - Country-specific address validation rules
 * - Special requirements (e.g., senderIdentityCardNumber for Serbia)
 * - Regional endpoint configuration
 * 
 * To extend to other countries, ensure regional requirements are met.
 */
export interface GLSAPIRequestBase {
  username: string; // MyGLS email address
  password: number[]; // SHA512-hashed password as byte array [0-255 values]
  clientNumberList: number[]; // List of GLS client/account numbers
  webshopEngine?: string; // Optional identifier for the integration system
}

/**
 * GLS Address object
 * Used for both pickup and delivery addresses
 */
export interface GLSAddress {
  name: string; // Name of person/organization
  street: string; // Street name
  houseNumber?: string; // House number (digits only)
  houseNumberInfo?: string; // Building, stairway, etc.
  city: string; // Town/village name
  zipCode: string; // Postal code
  countryIsoCode: string; // ISO 3166-1 alpha-2 code (e.g., "HU")
  contactName?: string; // Contact person name
  contactPhone?: string; // Contact phone number
  contactEmail?: string; // Contact email address
}

/**
 * GLS Service Parameter - String value
 */
export interface GLSServiceParameterString {
  value: string;
}

/**
 * GLS Service Parameter - Decimal value
 */
export interface GLSServiceParameterDecimal {
  value: number;
}

/**
 * GLS Service Parameter - DateTime value
 */
export interface GLSServiceParameterDateTime {
  value: string; // ISO 8601 datetime string
}

/**
 * GLS Service Parameter - String + Decimal value
 */
export interface GLSServiceParameterStringDecimal {
  stringValue: string;
  decimalValue: number;
}

/**
 * GLS Service Parameter - String + Integer value
 */
export interface GLSServiceParameterStringInteger {
  stringValue: string;
  integerValue: number;
}

/**
 * GLS Service Parameter - Time range
 */
export interface GLSServiceParameterTimeRange {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
}

/**
 * GLS Service Parameter - ADR (Dangerous Goods)
 */
export interface GLSServiceParameterADR {
  value: string;
}

/**
 * GLS Service object
 * Defines services to be applied to a parcel (e.g., COD, SMS notification, etc.)
 * 
 * Service codes:
 * - ADR: Dangerous Goods / ADR service
 * - AOS: Signature on delivery
 * - CS1: Custom service 1
 * - DDS: Delivery date specification
 * - DPV: Declared value protection / Insurance
 * - FDS: Forward delivery service
 * - FSS: Fuel surcharge service
 * - INS: Insurance service
 * - MMP: Multipurpose service
 * - PSD: Parcel shop delivery
 * - SDS: Scheduled delivery service
 * - SM1: SMS notification service 1
 * - SM2: SMS notification service 2
 * - SZL: Specialized service
 */
export interface GLSService {
  code: string; // Service code (e.g., "AOS", "SMS", "COD")
  adrParameter?: GLSServiceParameterADR;
  aosParameter?: GLSServiceParameterString;
  cs1Parameter?: GLSServiceParameterString;
  ddsParameter?: GLSServiceParameterDateTime;
  dpvParameter?: GLSServiceParameterStringDecimal;
  fdsParameter?: GLSServiceParameterString;
  fssParameter?: GLSServiceParameterString;
  insParameter?: GLSServiceParameterDecimal;
  mmpParameter?: GLSServiceParameterDecimal;
  psdParameter?: GLSServiceParameterStringInteger;
  sdsParameter?: GLSServiceParameterTimeRange;
  sm1Parameter?: GLSServiceParameterString;
  sm2Parameter?: GLSServiceParameterString;
  szlParameter?: GLSServiceParameterString;
  value?: string; // Service value without special settings
}

/**
 * GLS Parcel Property
 * Specifies dimensions, weight, and packaging type
 */
export interface GLSParcelProperty {
  content?: string; // Package content description
  packageType?: number; // 1-7 (1=parcel, 2=pallet, etc.)
  height?: number; // Height in cm
  length?: number; // Length in cm
  width?: number; // Width in cm
  weight?: number; // Weight in kg
}

/**
 * GLS Parcel object
 * Represents a single parcel to be created/labeled
 * 
 * IMPORTANT: Per GLS API spec (ver. 25.12.11), EACH PARCEL MUST include ClientNumber.
 * This associates the parcel with a specific GLS account/client for authorization.
 * See: php_rest_client.php line 32 for reference implementation.
 */
export interface GLSParcel {
  clientNumber?: number; // REQUIRED: GLS account number for this parcel (authorization)
  clientReference?: string; // Client's reference number (recommended)
  count?: number; // Number of parcels in shipment (max 99, default 1)
  codAmount?: number; // Cash on delivery amount
  codCurrency?: string; // ISO 4217 code (e.g., "HUF")
  codReference?: string; // COD reference number for payment pairing
  content?: string; // Parcel contents description (mandatory for Serbia)
  pickupDate?: string; // Pickup date (ISO 8601 datetime)
  pickupAddress: GLSAddress; // Pickup/sender address (REQUIRED)
  deliveryAddress: GLSAddress; // Delivery/recipient address (REQUIRED)
  serviceList?: GLSService[]; // List of additional services
  senderIdentityCardNumber?: string; // ID card/PIB (REQUIRED for Serbia only)
  pickupType?: number; // Only for LRS service, always 2 (HU only)
  parcelPropertyList?: GLSParcelProperty[]; // Dimensions and packaging properties
}

/**
 * GLS Parcel Info - Response for successfully created parcel
 */
export interface GLSParcelInfo {
  clientReference?: string;
  parcelId: number;
}

/**
 * GLS Error Info - Error details in response
 */
export interface GLSErrorInfo {
  errorCode: number;
  errorDescription: string;
  clientReferenceList?: string[];
  parcelIdList?: number[];
}

/**
 * GLS PrepareLabels Request
 * Request to create parcels/labels
 */
export interface GLSPrepareLabelsRequest extends GLSAPIRequestBase {
  parcelList: GLSParcel[];
}

/**
 * GLS PrepareLabels Response
 * Response from parcel creation
 */
export interface GLSPrepareLabelsResponse {
  parcelInfoList?: GLSParcelInfo[];
  prepareLabelsError?: GLSErrorInfo[];
}

/**
 * GLS PrintDataInfo - Information from GetPrintData/PrintLabels about printed labels
 */
export interface GLSPrintDataInfo {
  clientReference?: string;
  parcelId: number;
}

/**
 * GLS GetPrintData Request
 * Request to retrieve print data (labels) for existing parcels
 */
export interface GLSGetPrintDataRequest extends GLSAPIRequestBase {
  parcelIdList?: number[]; // Optional: list of parcel IDs
  parcelList: GLSParcel[]; // Required: list of parcels with label info
}

/**
 * GLS GetPrintData Response
 * Response containing PDF document bytes and metadata
 */
export interface GLSGetPrintDataResponse {
  pdfdocument?: string | Uint8Array; // PDF in byte array (may be base64 string or binary)
  getPrintDataErrorList?: GLSErrorInfo[];
  printDataInfoList?: GLSPrintDataInfo[];
}

/**
 * GLS GetPrintedLabels Request
 * Retrieves PDF labels for already-created parcels (second step in two-step flow)
 * Generates parcel numbers and PDF document containing labels in byte array format.
 */
export interface GLSGetPrintedLabelsRequest extends GLSAPIRequestBase {
  parcelIdList: number[]; // List of parcel database record IDs (REQUIRED, max 99 items)
  printPosition?: number; // 1-4: position on A4 page (A4 format only)
  showPrintDialog?: boolean; // Show print dialog in PDF reader
  typeOfPrinter?: 'A4_2x2' | 'A4_4x1' | 'Connect' | 'Thermo' | 'ThermoZPL' | 'ShipItThermoPdf' | 'ThermoZPL_300DPI' | 'ShipItThermoZpl'; // Printer type
}

/**
 * GLS GetPrintedLabels Response
 * Response containing PDF labels and metadata about successfully prepared records
 */
export interface GLSGetPrintedLabelsResponse {
  labels?: string | Uint8Array; // PDF document in byte array (may be base64 string or binary)
  getPrintedLabelsErrorList?: GLSErrorInfo[];
  printDataInfoList?: GLSPrintDataInfo[];
}

/**
 * GLS PrintLabels Request
 * Combined request that performs PrepareLabels + GetPrintedLabels in one call
 */
export interface GLSPrintLabelsRequest extends GLSAPIRequestBase {
  parcelList: GLSParcel[]; // Required: list of parcels to create labels for
  printPosition?: number; // 1-4: position on A4 page (A4 format only)
  showPrintDialog?: boolean; // Show print dialog in PDF reader
  typeOfPrinter?: 'A4_2x2' | 'A4_4x1' | 'Connect' | 'Thermo' | 'ThermoZPL' | 'ShipItThermoPdf' | 'ThermoZPL_300DPI'; // Printer type
}

/**
 * GLS PrintLabelsInfo - Information about successfully created label
 */
export interface GLSPrintLabelsInfo extends GLSParcelInfo {
  parcelNumber?: number; // Parcel number
  pin?: string; // PIN code for parcel lockers (if LRS service used)
}

/**
 * GLS PrintLabels Response
 * Response containing PDF document and parcel info
 */
export interface GLSPrintLabelsResponse {
  labels?: string | Uint8Array; // PDF document (may be base64 string or binary)
  printLabelsErrorList?: GLSErrorInfo[];
  printLabelsInfoList?: GLSPrintLabelsInfo[];
}

/**
 * GLS Parcel Status - Tracking event for a parcel
 * Represents a status update at a specific point in time and location
 */
export interface GLSParcelStatus {
  depotCity: string; // Depot/location city
  depotNumber: string; // Depot identifier
  statusCode: string; // GLS status code (1-50+, see Appendix G)
  statusDate: string; // ISO 8601 datetime of status
  statusDescription: string; // Human-readable status description (e.g., "The parcel was handed over to GLS")
  statusInfo?: string; // Additional status information
}

/**
 * GLS GetParcelStatuses Request
 * Request to retrieve tracking information for a parcel
 */
export interface GLSGetParcelStatusesRequest extends GLSAPIRequestBase {
  parcelNumber: number; // GLS parcel ID (REQUIRED)
  returnPOD?: boolean; // True = include Proof of Delivery PDF
  languageIsoCode?: string; // ISO 639-1 language code (HR, CS, HU, RO, SK, SL; default EN)
}

/**
 * GLS GetParcelStatuses Response
 * Response containing parcel tracking information and optional POD
 */
export interface GLSGetParcelStatusesResponse {
  clientReference?: string; // Original client reference from parcel creation
  deliveryCountryCode?: string; // ISO 3166-1 alpha-2 country code
  deliveryZipCode?: string; // Delivery area postal code
  parcelNumber?: number; // GLS parcel ID
  parcelStatusList?: GLSParcelStatus[]; // Timeline of status updates
  pod?: string | Uint8Array; // Proof of Delivery PDF (if requested)
  weight?: number; // Parcel weight (kg or grams - check spec)
  getParcelStatusErrors?: GLSErrorInfo[]; // Any errors encountered
}
