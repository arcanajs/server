/**
 * ArcanaJS Session Module - Type Definitions
 *
 * Core interfaces and types for the session management system.
 */

import type { Request } from "../../types";

// ============================================================================
// Session Cookie Types
// ============================================================================

/**
 * Cookie data stored with the session
 */
export interface SessionCookieData {
  /** Original maxAge value in milliseconds */
  originalMaxAge: number | null;
  /** Expiration date */
  expires: Date | string | null;
  /** Cookie is only sent over HTTPS */
  secure: boolean;
  /** Cookie is not accessible via JavaScript */
  httpOnly: boolean;
  /** Cookie path */
  path: string;
  /** Cookie domain */
  domain?: string;
  /** SameSite attribute */
  sameSite: boolean | "lax" | "strict" | "none";
}

/**
 * Cookie options for session configuration
 */
export interface SessionCookieOptions {
  /** Max age in milliseconds */
  maxAge?: number;
  /** Explicit expiration date */
  expires?: Date;
  /** HttpOnly flag (default: true) */
  httpOnly?: boolean;
  /** Secure flag - 'auto' detects based on connection (default: 'auto') */
  secure?: boolean | "auto";
  /** SameSite attribute (default: 'lax') */
  sameSite?: boolean | "lax" | "strict" | "none";
  /** Cookie path (default: '/') */
  path?: string;
  /** Cookie domain */
  domain?: string;
}

// ============================================================================
// Session Data Types
// ============================================================================

/**
 * Session data stored in the store
 */
export interface SessionData {
  /** Cookie configuration */
  cookie: SessionCookieData;
  /** Arbitrary session data */
  [key: string]: any;
}

/**
 * Session cookie interface
 */
export interface SessionCookie extends SessionCookieData {
  /** Reset maxAge to original value */
  resetMaxAge(): void;
  /** Check if cookie has expired */
  readonly isExpired: boolean;
  /** Serialize cookie for Set-Cookie header */
  serialize(name: string, val: string): string;
  /** Convert to JSON for storage */
  toJSON(): SessionCookieData;
}

/**
 * Session object attached to req.session
 */
export interface Session {
  /** Session ID */
  readonly id: string;
  /** Session cookie */
  cookie: SessionCookie;

  /**
   * Get a value from the session
   */
  get<T = any>(key: string): T | undefined;

  /**
   * Set a value in the session
   */
  set(key: string, value: any): this;

  /**
   * Delete a key from the session
   */
  delete(key: string): boolean;

  /**
   * Check if a key exists in the session
   */
  has(key: string): boolean;

  /**
   * Destroy the session
   */
  destroy(): Promise<void>;

  /**
   * Regenerate the session with a new ID (prevents session fixation)
   */
  regenerate(): Promise<void>;

  /**
   * Save the session to the store
   */
  save(): Promise<void>;

  /**
   * Reload the session from the store
   */
  reload(): Promise<void>;

  /**
   * Touch the session (update expiration without modifying data)
   */
  touch(): void;

  /**
   * Check if session has been modified
   */
  readonly isModified: boolean;

  /**
   * Check if this is a new session
   */
  readonly isNew: boolean;

  /**
   * Convert session to JSON for storage
   */
  toJSON(): SessionData;
}

// ============================================================================
// Session Store Interface
// ============================================================================

/**
 * Session store interface for extensibility
 *
 * Implement this interface to create custom session stores.
 */
export interface SessionStore {
  /**
   * Get session data by ID
   * @returns Session data or null if not found/expired
   */
  get(sid: string): Promise<SessionData | null>;

  /**
   * Store session data
   * @param sid - Session ID
   * @param session - Session data to store
   * @param ttl - Time to live in seconds (optional)
   */
  set(sid: string, session: SessionData, ttl?: number): Promise<void>;

  /**
   * Destroy a session
   */
  destroy(sid: string): Promise<void>;

  /**
   * Touch a session (update expiration)
   * Optional - if not implemented, set() will be called
   */
  touch?(sid: string, session: SessionData): Promise<void>;

  /**
   * Clear all sessions (optional)
   */
  clear?(): Promise<void>;

  /**
   * Get total number of sessions (optional)
   */
  length?(): Promise<number>;

  /**
   * Get all sessions (optional)
   */
  all?(): Promise<SessionData[] | Record<string, SessionData>>;
}

// ============================================================================
// Session Options
// ============================================================================

/**
 * Session middleware configuration options
 */
export interface SessionOptions {
  /**
   * Cookie name for the session ID
   * @default "arcanajs.sid"
   */
  name?: string;

  /**
   * Secret(s) used to sign the session cookie.
   * REQUIRED - will throw if not provided.
   * If an array, first secret is used to sign, all are used to verify.
   */
  secret: string | string[];

  /**
   * Session store instance
   * @default MemoryStore (development only!)
   */
  store?: SessionStore;

  /**
   * Force save session to store on every request
   * @default false
   */
  resave?: boolean;

  /**
   * Save uninitialized sessions (new but not modified)
   * @default false
   */
  saveUninitialized?: boolean;

  /**
   * Reset cookie maxAge on every request
   * @default false
   */
  rolling?: boolean;

  /**
   * Trust the reverse proxy for secure cookies
   * @default undefined (auto-detect)
   */
  proxy?: boolean;

  /**
   * Behavior when req.session is deleted
   * @default "keep"
   */
  unset?: "destroy" | "keep";

  /**
   * Custom session ID generator
   */
  genid?: (req: Request) => string;

  /**
   * Cookie options
   */
  cookie?: SessionCookieOptions;
}

// ============================================================================
// Session Events (for observability)
// ============================================================================

/**
 * Session event types
 */
export type SessionEventType =
  | "create"
  | "destroy"
  | "save"
  | "regenerate"
  | "touch";

/**
 * Session event handler
 */
export type SessionEventHandler = (
  type: SessionEventType,
  sessionId: string,
  session?: SessionData
) => void | Promise<void>;
