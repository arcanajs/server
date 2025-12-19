/**
 * ArcanaJS Session Cookie
 *
 * Cookie helper class for session cookie management.
 */

import cookie from "cookie";
import type {
  SessionCookie,
  SessionCookieData,
  SessionCookieOptions,
} from "./types";

/**
 * Default cookie options
 */
const COOKIE_DEFAULTS: SessionCookieOptions = {
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
  private _sameSite: boolean | "lax" | "strict" | "none";

  constructor(options: SessionCookieOptions = {}) {
    const opts = { ...COOKIE_DEFAULTS, ...options };

    this._originalMaxAge = opts.maxAge ?? null;
    this._httpOnly = opts.httpOnly ?? true;
    this._path = opts.path ?? "/";
    this._domain = opts.domain;
    this._sameSite = opts.sameSite ?? "lax";

    // Handle secure option
    if (opts.secure === "auto") {
      // Will be set dynamically based on request
      this._secure = false;
    } else {
      this._secure = opts.secure ?? false;
    }

    // Calculate expires from maxAge or use provided expires
    if (opts.expires) {
      this._expires = opts.expires;
    } else if (opts.maxAge) {
      this._expires = new Date(Date.now() + opts.maxAge);
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

  get expires(): Date | null {
    return this._expires;
  }

  set expires(value: Date | null) {
    this._expires = value;
  }

  get maxAge(): number | null {
    if (this._expires === null) {
      return null;
    }
    const remaining = this._expires.getTime() - Date.now();
    return remaining > 0 ? remaining : 0;
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
    this._path = value;
  }

  get domain(): string | undefined {
    return this._domain;
  }

  set domain(value: string | undefined) {
    this._domain = value;
  }

  get sameSite(): boolean | "lax" | "strict" | "none" {
    return this._sameSite;
  }

  set sameSite(value: boolean | "lax" | "strict" | "none") {
    this._sameSite = value;
  }

  // ============================================================================
  // Methods
  // ============================================================================

  /**
   * Check if cookie has expired
   */
  get isExpired(): boolean {
    if (this._expires === null) {
      return false; // Session cookie never expires
    }
    return this._expires.getTime() <= Date.now();
  }

  /**
   * Reset maxAge to original value
   * Used for rolling sessions
   */
  resetMaxAge(): void {
    if (this._originalMaxAge !== null) {
      this._expires = new Date(Date.now() + this._originalMaxAge);
    }
  }

  /**
   * Serialize cookie for Set-Cookie header
   */
  serialize(name: string, val: string): string {
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

    return cookie.serialize(name, val, opts);
  }

  /**
   * Convert to JSON for storage
   */
  toJSON(): SessionCookieData {
    return {
      originalMaxAge: this._originalMaxAge,
      expires: this._expires ? this._expires.toISOString() : null,
      secure: this._secure,
      httpOnly: this._httpOnly,
      path: this._path,
      domain: this._domain,
      sameSite: this._sameSite,
    };
  }

  /**
   * Create a SessionCookieImpl from stored JSON data
   */
  static fromJSON(data: SessionCookieData): SessionCookieImpl {
    const cookie = new SessionCookieImpl();

    cookie._originalMaxAge = data.originalMaxAge;
    cookie._expires = data.expires ? new Date(data.expires) : null;
    cookie._secure = data.secure;
    cookie._httpOnly = data.httpOnly;
    cookie._path = data.path;
    cookie._domain = data.domain;
    cookie._sameSite = data.sameSite;

    return cookie;
  }
}
