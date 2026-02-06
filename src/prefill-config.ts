// Import the form data interface to ensure type safety
import type { NFAFormData } from "./index";

// Configuration for a single prefillable field
export interface PrefillFieldConfig {
  value: string | string[] | boolean;
  readonly?: boolean; // If true: field is disabled and excluded from hash
}

// Type-safe prefill configuration using NFAFormData keys
export type PrefillConfig = {
  [K in keyof Partial<NFAFormData>]?: PrefillFieldConfig;
};

/**
 * Prefill configuration for form fields.
 *
 * Example usage:
 * ```typescript
 * export const prefillConfig: PrefillConfig = {
 *   // Lock form type to Form 4 (readonly)
 *   q1_formType: { value: "ATF FORM 4", readonly: true },
 *
 *   // Prefill Q5 fields as editable defaults
 *   q5_agencyName: { value: "MY AGENCY", readonly: false },
 *   q5_officialName: { value: "JOHN DOE", readonly: false },
 *   q5_officialTitle: { value: "CEO", readonly: false },
 *   q5_address: { value: "123 MAIN ST\nANYTOWN, ST 12345", readonly: false },
 *
 *   // Lock UPIN question to "NO"
 *   q8_hasUpin: { value: "NO", readonly: true },
 * };
 * ```
 */
export const prefillConfig: PrefillConfig = {
  // Add your prefill configuration here
  // Example: q1_formType: { value: "ATF FORM 4", readonly: true },
};

// Expose configuration globally for use in form.js
declare global {
  interface Window {
    PREFILL_CONFIG?: PrefillConfig;
  }
}

if (typeof window !== "undefined") {
  window.PREFILL_CONFIG = prefillConfig;
}

// Also export as default for module compatibility
export default prefillConfig;
