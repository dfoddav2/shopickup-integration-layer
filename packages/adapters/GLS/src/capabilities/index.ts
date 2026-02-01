/**
 * GLS Adapter - Capabilities Index
 * 
 * Re-exports all GLS adapter capabilities from their respective modules.
 * This maintains backward compatibility while organizing code by capability.
 */

// Pickup Points capability
export {
  fetchPickupPoints,
} from './pickup-points.js';

// Parcels capability
export {
  createParcel,
  createParcels,
} from './parcels.js';

// Labels capability (two-step: GetPrintData)
export {
  createLabel,
  createLabels,
} from './labels.js';

// Print Labels capability (one-step: PrintLabels)
export {
  printLabel,
  printLabels,
} from './print-labels.js';

// Tracking capability
export {
  track,
} from './tracking.js';
