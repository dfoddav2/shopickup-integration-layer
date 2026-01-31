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

// Labels capability
export {
  createLabel,
  createLabels,
} from './labels.js';

// Tracking capability
export {
  track,
} from './tracking.js';
