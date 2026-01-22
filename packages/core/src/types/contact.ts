/**
 * Contact domain type
 * Represents a person or organization contact information
 */

export interface Contact {
  /** Person or company name */
  name: string;

  /** Phone number (optional) */
  phone?: string;

  /** Email address (optional) */
  email?: string;

  /** Company name (optional, separate from name) */
  company?: string;
}
