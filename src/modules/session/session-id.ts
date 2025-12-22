/**
 * ArcanaJS Session ID Utilities - Production Implementation
 *
 * Cryptographically secure session ID generation and validation
 * Optimized for Bun runtime with HMAC signing
 */

import signature from "cookie-signature";

// ============================================================================
// Constants
// ============================================================================

const SESSION_ID_LENGTH = 36; // UUID v4 length
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// Session ID Generation
// ============================================================================

/**
 * Generate cryptographically secure session ID using Bun's crypto
 *
 * @returns UUID v4 string
 */
export function generateSessionId(): string {
  // Use Bun's native crypto.randomUUID()
  return crypto.randomUUID();
}

/**
 * Generate multiple session IDs in batch
 *
 * @param count Number of IDs to generate
 * @returns Array of session IDs
 */
export function generateSessionIds(count: number): string[] {
  if (count <= 0 || !Number.isInteger(count)) {
    throw new Error("Count must be a positive integer");
  }

  return Array.from({ length: count }, () => generateSessionId());
}

// ============================================================================
// Session ID Validation
// ============================================================================

/**
 * Validate session ID format and security
 *
 * @param sid Session ID to validate
 * @returns true if valid
 */
export function isValidSessionId(sid: string): boolean {
  // Type check
  if (typeof sid !== "string") {
    return false;
  }

  // Length check
  if (sid.length !== SESSION_ID_LENGTH) {
    return false;
  }

  // Pattern check (UUID v4)
  if (!SESSION_ID_PATTERN.test(sid)) {
    return false;
  }

  // Security checks
  if (hasControlCharacters(sid)) {
    return false;
  }

  return true;
}

/**
 * Check for control characters in string
 */
function hasControlCharacters(str: string): boolean {
  return /[\x00-\x1f\x7f]/.test(str);
}

// ============================================================================
// Session ID Signing
// ============================================================================

/**
 * Sign session ID with secret
 *
 * @param sid Session ID
 * @param secret Secret key
 * @returns Signed session ID with 's:' prefix
 */
export function signSessionId(sid: string, secret: string): string {
  if (!isValidSessionId(sid)) {
    throw new Error("Invalid session ID");
  }

  if (!secret || typeof secret !== "string" || secret.length < 32) {
    throw new Error("Secret must be at least 32 characters");
  }

  return "s:" + signature.sign(sid, secret);
}

/**
 * Unsign and verify session ID
 *
 * Supports multiple secrets for rotation
 *
 * @param signed Signed session ID
 * @param secrets Array of secrets to try
 * @returns Original session ID or false
 */
export function unsignSessionId(
  signed: string,
  secrets: string[]
): string | false {
  // Type check
  if (typeof signed !== "string") {
    return false;
  }

  // Check prefix
  if (!signed.startsWith("s:")) {
    return false;
  }

  // Validate secrets
  if (!Array.isArray(secrets) || secrets.length === 0) {
    throw new Error("At least one secret is required");
  }

  const value = signed.slice(2);

  // Try each secret (first is current, others for rotation)
  for (const secret of secrets) {
    const result = signature.unsign(value, secret);

    if (result !== false) {
      // Validate the unsigned ID
      if (isValidSessionId(result)) {
        return result;
      }
    }
  }

  return false;
}

/**
 * Batch unsign multiple session IDs
 *
 * @param signedIds Array of signed session IDs
 * @param secrets Array of secrets
 * @returns Map of signed ID to unsigned ID
 */
export function unsignSessionIds(
  signedIds: string[],
  secrets: string[]
): Map<string, string | false> {
  const results = new Map<string, string | false>();

  for (const signedId of signedIds) {
    results.set(signedId, unsignSessionId(signedId, secrets));
  }

  return results;
}

// ============================================================================
// Session ID Rotation
// ============================================================================

/**
 * Re-sign session ID with new secret
 *
 * Used for secret rotation
 *
 * @param signed Old signed session ID
 * @param oldSecrets Old secrets for unsigning
 * @param newSecret New secret for signing
 * @returns New signed session ID or null if invalid
 */
export function rotateSessionId(
  signed: string,
  oldSecrets: string[],
  newSecret: string
): string | null {
  const sid = unsignSessionId(signed, oldSecrets);

  if (sid === false) {
    return null;
  }

  return signSessionId(sid, newSecret);
}

// ============================================================================
// Timing-Safe Comparison
// ============================================================================

/**
 * Timing-safe string comparison
 *
 * Prevents timing attacks on session ID comparison
 *
 * @param a First string
 * @param b Second string
 * @returns true if equal
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  // Use Bun's built-in crypto for timing-safe comparison
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);

  // XOR all bytes and accumulate
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }

  return result === 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract session ID from signed cookie value
 *
 * @param cookieValue Cookie value (may or may not be signed)
 * @param secrets Secrets for unsigning
 * @returns Session ID or null
 */
export function extractSessionId(
  cookieValue: string,
  secrets: string[]
): string | null {
  if (!cookieValue) {
    return null;
  }

  // Check if signed
  if (cookieValue.startsWith("s:")) {
    const result = unsignSessionId(cookieValue, secrets);
    return result === false ? null : result;
  }

  // Not signed, validate directly
  return isValidSessionId(cookieValue) ? cookieValue : null;
}

/**
 * Check if session ID is signed
 */
export function isSignedSessionId(value: string): boolean {
  return typeof value === "string" && value.startsWith("s:");
}
