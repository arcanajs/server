/**
 * ArcanaJS Session ID Generation
 *
 * Cryptographically secure session ID generation and signing.
 */

import signature from "cookie-signature";

/**
 * Generate a cryptographically secure session ID
 *
 * Uses crypto.randomUUID() combined with additional entropy
 * to create a unique, unpredictable session identifier.
 */
export function generateSessionId(): string {
  // Use crypto.randomUUID() for base ID (122 bits of randomness)
  const uuid = crypto.randomUUID();

  // Add additional entropy using current timestamp and random bytes
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.getRandomValues(new Uint8Array(8));
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Combine and return
  return `${uuid}-${timestamp}-${randomHex}`;
}

/**
 * Sign a session ID with a secret
 *
 * Creates a signed cookie value that can be verified later.
 * Uses HMAC-SHA256 via cookie-signature.
 *
 * @param sid - The session ID to sign
 * @param secret - The secret to sign with
 * @returns Signed session ID prefixed with 's:'
 */
export function signSessionId(sid: string, secret: string): string {
  return "s:" + signature.sign(sid, secret);
}

/**
 * Unsign and verify a session ID
 *
 * Verifies the signature and returns the original session ID.
 * Supports multiple secrets for secret rotation.
 *
 * @param signed - The signed session ID (with 's:' prefix)
 * @param secrets - Array of secrets to try
 * @returns Original session ID or false if invalid
 */
export function unsignSessionId(
  signed: string,
  secrets: string[]
): string | false {
  // Check for 's:' prefix
  if (typeof signed !== "string" || signed.substring(0, 2) !== "s:") {
    return false;
  }

  const value = signed.slice(2);

  // Try each secret
  for (const secret of secrets) {
    const result = signature.unsign(value, secret);
    if (result !== false) {
      return result;
    }
  }

  return false;
}

/**
 * Validate a session ID format
 *
 * Ensures the session ID meets basic requirements.
 *
 * @param sid - Session ID to validate
 * @returns true if valid format
 */
export function isValidSessionId(sid: string): boolean {
  // Must be a non-empty string
  if (typeof sid !== "string" || sid.length === 0) {
    return false;
  }

  // Must be at least 32 characters (UUID length)
  if (sid.length < 32) {
    return false;
  }

  // Must not contain control characters or spaces
  if (/[\x00-\x1f\x7f\s]/.test(sid)) {
    return false;
  }

  return true;
}
