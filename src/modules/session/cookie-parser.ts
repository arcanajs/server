/**
 * ArcanaJS Cookie Parser - Production Implementation
 *
 * Secure cookie parsing with JSON and signed cookie support
 * Optimized for Bun runtime with proper error handling
 */

import cookie from "cookie";
import signature from "cookie-signature";
import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Cookie parser options
 */
export interface CookieParserOptions {
  /** Secret(s) for signed cookies */
  secret?: string | string[];
  /** Decode cookie values */
  decode?: (val: string) => string;
}

// ============================================================================
// JSON Cookie Utilities
// ============================================================================

/**
 * Parse JSON cookie value
 *
 * @param str Cookie value with 'j:' prefix
 * @returns Parsed object or undefined
 */
export function parseJSONCookie(str: string): any | undefined {
  if (typeof str !== "string" || !str.startsWith("j:")) {
    return undefined;
  }

  try {
    return JSON.parse(str.slice(2));
  } catch {
    return undefined;
  }
}

/**
 * Parse all JSON cookies in an object
 *
 * @param obj Cookie object
 * @returns Modified object with parsed JSON cookies
 */
export function parseJSONCookies(
  obj: Record<string, any>
): Record<string, any> {
  for (const key of Object.keys(obj)) {
    const val = parseJSONCookie(obj[key]);
    if (val !== undefined) {
      obj[key] = val;
    }
  }
  return obj;
}

/**
 * Serialize value as JSON cookie
 *
 * @param value Value to serialize
 * @returns JSON cookie string with 'j:' prefix
 */
export function serializeJSONCookie(value: any): string {
  return "j:" + JSON.stringify(value);
}

// ============================================================================
// Signed Cookie Utilities
// ============================================================================

/**
 * Parse signed cookie value
 *
 * @param str Signed cookie value with 's:' prefix
 * @param secrets Array of secrets to try
 * @returns Unsigned value, original value, or false
 */
export function parseSignedCookie(
  str: string,
  secrets: string[]
): string | false {
  if (typeof str !== "string") {
    return false;
  }

  // Not signed, return as-is
  if (!str.startsWith("s:")) {
    return str;
  }

  const value = str.slice(2);

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
 * Parse all signed cookies in an object
 *
 * @param obj Cookie object
 * @param secrets Array of secrets
 * @returns Object with signed cookies separated
 */
export function parseSignedCookies(
  obj: Record<string, any>,
  secrets: string[]
): {
  signedCookies: Record<string, any>;
  unsignedCookies: Record<string, any>;
} {
  const signedCookies: Record<string, any> = {};
  const unsignedCookies: Record<string, any> = { ...obj };

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const unsigned = parseSignedCookie(val, secrets);

    // If unsigned successfully and different from original
    if (unsigned !== false && unsigned !== val) {
      signedCookies[key] = unsigned;
      delete unsignedCookies[key];
    }
  }

  return { signedCookies, unsignedCookies };
}

/**
 * Sign a cookie value
 *
 * @param value Value to sign
 * @param secret Secret key
 * @returns Signed value with 's:' prefix
 */
export function signCookie(value: string, secret: string): string {
  return "s:" + signature.sign(value, secret);
}

// ============================================================================
// Cookie Parser Middleware
// ============================================================================

/**
 * Create cookie parser middleware
 *
 * @param options Parser options
 * @returns Middleware function
 */
export function cookieParser(options: CookieParserOptions = {}): Middleware {
  const secrets = normalizeSecrets(options.secret);
  const decode = options.decode || decodeURIComponent;

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Skip if already parsed
    if (req.cookies && Object.keys(req.cookies).length > 0) {
      return next();
    }

    try {
      // Initialize cookie containers
      req.cookies = Object.create(null);
      req.signedCookies = Object.create(null);

      // Set secret on request
      if (secrets.length > 0) {
        req.secret = secrets[0];
      }

      // Get cookie header
      const cookieHeader = req.headers.get("cookie");
      if (!cookieHeader) {
        return next();
      }

      // Parse cookies
      const parsed = cookie.parse(cookieHeader, { decode });

      // Separate signed and unsigned cookies
      if (secrets.length > 0) {
        const { signedCookies, unsignedCookies } = parseSignedCookies(
          parsed,
          secrets
        );

        // Parse JSON in signed cookies
        req.signedCookies = parseJSONCookies(signedCookies);
        req.cookies = parseJSONCookies(unsignedCookies);
      } else {
        // Parse JSON in all cookies
        req.cookies = parseJSONCookies(parsed);
      }

      await next();
    } catch (error) {
      console.error("Cookie parsing error:", error);

      // Initialize empty on error
      req.cookies = Object.create(null);
      req.signedCookies = Object.create(null);

      await next();
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize secret(s) to array
 */
function normalizeSecrets(secret?: string | string[]): string[] {
  if (!secret) {
    return [];
  }

  if (Array.isArray(secret)) {
    return secret.filter((s) => typeof s === "string" && s.length > 0);
  }

  return typeof secret === "string" && secret.length > 0 ? [secret] : [];
}

/**
 * Validate cookie name
 */
export function isValidCookieName(name: string): boolean {
  // RFC 6265 compliant name validation
  return /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(name);
}

/**
 * Validate cookie value
 */
export function isValidCookieValue(value: string): boolean {
  // Check for control characters
  return !/[\x00-\x1f\x7f]/.test(value);
}

// ============================================================================
// Cookie Builder
// ============================================================================

/**
 * Cookie builder for response
 */
export class CookieBuilder {
  private _name: string;
  private _value: string;
  private _options: cookie.SerializeOptions = {};

  constructor(name: string, value: any) {
    if (!isValidCookieName(name)) {
      throw new Error(`Invalid cookie name: ${name}`);
    }

    this._name = name;
    this._value = this._serializeValue(value);
  }

  httpOnly(enabled = true): this {
    this._options.httpOnly = enabled;
    return this;
  }

  secure(enabled = true): this {
    this._options.secure = enabled;
    return this;
  }

  sameSite(policy: "strict" | "lax" | "none" | boolean): this {
    this._options.sameSite = policy;
    return this;
  }

  maxAge(seconds: number): this {
    this._options.maxAge = seconds;
    return this;
  }

  expires(date: Date): this {
    this._options.expires = date;
    return this;
  }

  path(path: string): this {
    this._options.path = path;
    return this;
  }

  domain(domain: string): this {
    this._options.domain = domain;
    return this;
  }

  sign(secret: string): this {
    this._value = signCookie(this._value, secret);
    return this;
  }

  build(): string {
    return cookie.serialize(this._name, this._value, this._options);
  }

  private _serializeValue(value: any): string {
    if (typeof value === "object") {
      return serializeJSONCookie(value);
    }
    return String(value);
  }
}

/**
 * Create a new cookie builder
 */
export function createCookie(name: string, value: any): CookieBuilder {
  return new CookieBuilder(name, value);
}
