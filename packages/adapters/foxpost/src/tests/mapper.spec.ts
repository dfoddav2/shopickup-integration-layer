/**
 * Unit tests for Foxpost mapper functions
 * Tests bidirectional mapping between canonical types and Foxpost API types
 */

import { describe, it, expect } from 'vitest';
import type { Shipment, Parcel, Address } from '@shopickup/core';
import {
  mapAddressToFoxpost,
  determineFoxpostSize,
  mapParcelToFoxpost,
  mapFoxpostStatusToCanonical,
  mapFoxpostTrackToCanonical,
} from '../mappers/index.js';
import type { TrackDTO } from '../types/generated.js';

// (rest of file unchanged)