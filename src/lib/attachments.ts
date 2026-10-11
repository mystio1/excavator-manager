// Canonical values are always stored/submitted in English regardless of the
// displayed label's language, so downstream string-matching (e.g. Site
// Analysis's bucket/breaker hour split) keeps working no matter which
// operator language is active. Lives outside the "use client" picker so server
// code (validation, services) can import it as a real value.
export const ATTACHMENT_VALUES = ["Bucket", "Breaker", "Chaining"] as const;

export type AttachmentValue = (typeof ATTACHMENT_VALUES)[number];

export const TOOL_REQUIRED_MESSAGE = "Select the tool used (Bucket, Breaker or Chaining)";
