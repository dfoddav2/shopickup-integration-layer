/**
 * Label mapping utilities for MPL adapter
 * 
 * Handles conversion from canonical label requests to MPL API query parameters
 * and normalization of API responses back to canonical format.
 * 
 * The MPL label endpoint uses GET with query parameters:
 * GET /shipments/label?trackingNumbers=X&trackingNumbers=Y&labelType=A5&labelFormat=PDF&orderBy=SENDING&singleFile=true
 * 
 * Response is JSON array of LabelQueryResult objects with base64-encoded label data.
 */

import { CreateLabelsMPLRequest, LabelOrderBy, LabelFormat, LabelType } from '../validation.js';

/**
 * Query parameters for the MPL label API GET request
 */
export interface LabelQueryParams {
  trackingNumbers: string[];  // Required
  labelType?: LabelType;       // Optional, defaults to A5 on server
  labelFormat?: LabelFormat;   // Optional, defaults to PDF on server
  orderBy?: LabelOrderBy;      // Optional
  singleFile?: boolean;        // Optional
}

/**
 * Build query parameters from canonical label request
 * 
 * Transforms CreateLabelsMPLRequest into query parameters suitable for
 * the MPL GET /shipments/label endpoint.
 * 
 * @param req - Canonical label request
 * @returns Query parameters object
 */
export function buildLabelQueryParams(req: CreateLabelsMPLRequest): LabelQueryParams {
  return {
    trackingNumbers: req.parcelCarrierIds,
    labelType: req.options?.labelType,
    labelFormat: req.options?.labelFormat,
    orderBy: req.options?.orderBy,
    singleFile: req.options?.singleFile,
  };
}

/**
 * Serialize query parameters to URL search params string
 * 
 * Handles array parameters (trackingNumbers) as multiple query params:
 * ?trackingNumbers=X&trackingNumbers=Y&trackingNumbers=Z&labelType=A5&labelFormat=PDF
 * 
 * @param params - Query parameters
 * @returns URLSearchParams string (without leading ?)
 */
export function serializeQueryParams(params: LabelQueryParams): string {
  const searchParams = new URLSearchParams();
  
  // Add tracking numbers as array (multiple params with same name)
  params.trackingNumbers.forEach(tn => {
    searchParams.append('trackingNumbers', tn);
  });
  
  // Add optional parameters if present
  if (params.labelType) {
    searchParams.set('labelType', params.labelType);
  }
  if (params.labelFormat) {
    searchParams.set('labelFormat', params.labelFormat);
  }
  if (params.orderBy) {
    searchParams.set('orderBy', params.orderBy);
  }
  if (params.singleFile !== undefined) {
    searchParams.set('singleFile', String(params.singleFile));
  }
  
  return searchParams.toString();
}

/**
 * Build complete query string for logging/debugging
 * 
 * Shows the actual query string that will be sent to the API
 * 
 * @param params - Query parameters
 * @returns Complete query string with leading ?
 */
export function buildQueryString(params: LabelQueryParams): string {
  const serialized = serializeQueryParams(params);
  return serialized ? `?${serialized}` : '';
}

/**
 * Get default values for optional label parameters
 * 
 * These match MPL server defaults for when parameters are not specified
 */
export const LABEL_DEFAULTS = {
  labelType: 'A5' as const,
  labelFormat: 'PDF' as const,
  orderBy: undefined,
  singleFile: false,
};
