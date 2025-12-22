/**
 * ArcanaJS Session Cookie - Production Implementation
 *
 * Robust cookie management with proper validation
 * and security features optimized for Bun
 */

import cookie from "cookie";
import type {
  SessionCookie,
  SessionCookieData,
  SessionCookieOptions,
} from "./types";

/**
 * Default cookie configuration
 */
const DEFAULTS: Required<
  Omit<SessionCookieOptions, "expires" | "domain" | "maxAge">
> = {
  httpOnly: true,
  secure: "auto",
  sameSite: "lax",
  path: "/",
};

/**
 * Session cookie implementation
 */
export class SessionCookieImpl implements SessionCookie {
  private _originalMaxAge: number | null;
  private _expires: Date | null;
  private _secure: boolean;
  private _httpOnly: boolean;
  private _path: string;
  private _domain?: string;
  private _sameSite: "strict" | "lax" | "none" | boolean;

  constructor(options: SessionCookieOptions = {}) {
    const opts = { ...DEFAULTS, ...options };

    // Initialize properties
    this._originalMaxAge = opts.maxAge ?? null;
    this._httpOnly = opts.httpOnly;
    this._path = opts.path;
    this._domain = options.domain;
    this._sameSite = opts.sameSite;

    // Handle secure option
    if (opts.secure === "auto") {
      this._secure = false; // Set dynamically later
    } else {
      this._secure = opts.secure ?? false;
    }

    // Calculate expiration
    if (options.expires) {
      this._expires = options.expires;
    } else if (options.maxAge) {
      this._expires = new Date(Date.now() + options.maxAge);
    } else {
      this._expires = null;
    }
  }

  // ============================================================================
  // Getters and Setters
  // ============================================================================

  get originalMaxAge(): number | null {
    return this._originalMaxAge;
  }

  get expires(): string | null {
    return this._expires ? this._expires.toISOString() : null;
  }

  set expires(value: string | null) {
    this._expires = value ? new Date(value) : null;
  }

  get maxAge(): number | null {
    if (!this._expires) return null;
    const remaining = this._expires.getTime() - Date.now();
    return Math.max(0, remaining);
  }

  set maxAge(value: number | null) {
    if (value === null) {
      this._expires = null;
    } else {
      this._expires = new Date(Date.now() + value);
    }
  }

  get secure(): boolean {
    return this._secure;
  }

  set secure(value: boolean) {
    this._secure = value;
  }

  get httpOnly(): boolean {
    return this._httpOnly;
  }

  set httpOnly(value: boolean) {
    this._httpOnly = value;
  }

  get path(): string {
    return this._path;
  }

  set path(value: string) {
    // Validate path
    if (!value.startsWith("/")) {
      throw new Error("Cookie path must start with /");
    }
    this._path = value;
  }

  get domain(): string | undefined {
    return this._domain;
  }

  set domain(value: string | undefined) {
    // Validate domain if provided
    if (value && !/^[a-z0-9.-]+$/i.test(value)) {
      throw new Error("Invalid cookie domain");
    }
    this._domain = value;
  }

  get sameSite(): "strict" | "lax" | "none" | boolean {
    return this._sameSite;
  }

  set sameSite(value: "strict" | "lax" | "none" | boolean) {
    this._sameSite = value;
  }

  // ============================================================================
  // Methods
  // ============================================================================

  /**
   * Check if cookie has expired
   */
  get isExpired(): boolean {
    if (!this._expires) return false;
    return this._expires.getTime() <= Date.now();
  }

  /**
   * Reset maxAge to original value
   */
  resetMaxAge(): void {
    if (this._originalMaxAge !== null) {
      this._expires = new Date(Date.now() + this._originalMaxAge);
    }
  }

  /**
   * Serialize cookie for Set-Cookie header
   */
  serialize(name: string, value: string): string {
    // Validate inputs
    if (!name || typeof name !== "string") {
      throw new Error("Cookie name is required");
    }
    if (typeof value !== "string") {
      throw new Error("Cookie value must be a string");
    }

    const opts: cookie.SerializeOptions = {
      path: this._path,
      httpOnly: this._httpOnly,
      secure: this._secure,
    };

    if (this._domain) {
      opts.domain = this._domain;
    }

    if (this._expires) {
      opts.expires = this._expires;
    }

    // Handle sameSite
    if (this._sameSite === true) {
      opts.sameSite = "strict";
    } else if (this._sameSite === false) {
      // Don't set sameSite
    } else {
      opts.sameSite = this._sameSite;
    }

    return cookie.serialize(name, value, opts);
  }

  /**
   * Convert to JSON for storage
   */
  toJSON(): SessionCookieData {
    return {
      originalMaxAge: this._originalMaxAge,
      expires: this.expires,
      secure: this._secure,
      httpOnly: this._httpOnly,
      path: this._path,
      domain: this._domain,
      sameSite: this._sameSite,
    };
  }

  /**
   * Create instance from stored JSON
   */
  static fromJSON(data: SessionCookieData): SessionCookieImpl {
    const instance = new SessionCookieImpl();

    instance._originalMaxAge = data.originalMaxAge;
    instance._expires = data.expires ? new Date(data.expires) : null;
    instance._secure = data.secure;
    instance._httpOnly = data.httpOnly;
    instance._path = data.path;
    instance._domain = data.domain;
    instance._sameSite = data.sameSite;

    return instance;
  }

  /**
   * Clone this cookie
   */
  clone(): SessionCookieImpl {
    return SessionCookieImpl.fromJSON(this.toJSON());
  }
}
