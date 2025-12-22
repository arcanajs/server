/**
 * ArcanaJS Session System - Production Types
 *
 * Comprehensive type definitions for session management
 * Optimized for Bun runtime with strict type safety
 */

// ============================================================================
// Core Session Types
// ============================================================================

/**
 * Session cookie configuration
 */
export interface SessionCookieData {
  /** Original maxAge in milliseconds */
  originalMaxAge: number | null;
  /** Expiration timestamp (ISO string) */
  expires: string | null;
  /** HTTPS-only flag */
  secure: boolean;
  /** JavaScript-inaccessible flag */
  httpOnly: boolean;
  /** Cookie path */
  path: string;
  /** Cookie domain */
  domain?: string;
  /** SameSite policy */
  sameSite: "strict" | "lax" | "none" | boolean;
}

/**
 * Session cookie options
 */
export interface SessionCookieOptions {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean | "auto";
  sameSite?: "strict" | "lax" | "none" | boolean;
  path?: string;
  domain?: string;
}

/**
 * Stored session data structure
 */
export interface SessionData {
  /** Cookie metadata */
  cookie: SessionCookieData;
  /** Session creation timestamp */
  createdAt?: number;
  /** Last activity timestamp */
  lastActivity?: number;
  /** Custom session data */
  [key: string]: any;
}

/**
 * Session store interface
 */
export interface SessionStore {
  /**
   * Retrieve session by ID
   * @returns Session data or null if not found/expired
   */
  get(sid: string): Promise<SessionData | null>;

  /**
   * Store session data
   * @param sid Session ID
   * @param session Session data
   * @param ttl TTL in seconds (optional)
   */
  set(sid: string, session: SessionData, ttl?: number): Promise<void>;

  /**
   * Delete session
   * @param sid Session ID
   */
  destroy(sid: string): Promise<void>;

  /**
   * Update session expiration
   * @param sid Session ID
   * @param session Session data
   */
  touch?(sid: string, session: SessionData): Promise<void>;

  /**
   * Clear all sessions
   */
  clear?(): Promise<void>;

  /**
   * Get session count
   */
  length?(): Promise<number>;

  /**
   * Cleanup expired sessions
   */
  prune?(): Promise<void>;
}

/**
 * Session configuration options
 */
export interface SessionOptions {
  /** Cookie name */
  name?: string;
  /** Secret key(s) for signing */
  secret: string | string[];
  /** Session store */
  store?: SessionStore;
  /** Force save unchanged sessions */
  resave?: boolean;
  /** Save uninitialized sessions */
  saveUninitialized?: boolean;
  /** Rolling session expiration */
  rolling?: boolean;
  /** Trust proxy headers */
  proxy?: boolean;
  /** Cookie options */
  cookie?: SessionCookieOptions;
  /** Custom ID generator */
  genid?: (req: any) => string;
  /** Unset behavior */
  unset?: "destroy" | "keep";
}

/**
 * Session interface
 */
export interface Session {
  /** Unique session ID */
  readonly id: string;
  /** Cookie configuration */
  cookie: SessionCookie;
  /** Creation timestamp */
  readonly createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;

  /**
   * Get session value
   */
  get<T = any>(key: string): T | undefined;

  /**
   * Set session value
   */
  set(key: string, value: any): this;

  /**
   * Delete session value
   */
  delete(key: string): boolean;

  /**
   * Check if key exists
   */
  has(key: string): boolean;

  /**
   * Destroy session
   */
  destroy(): Promise<void>;

  /**
   * Regenerate session ID
   */
  regenerate(): Promise<void>;

  /**
   * Save session to store
   */
  save(): Promise<void>;

  /**
   * Reload session from store
   */
  reload(): Promise<void>;

  /**
   * Touch session (update expiration)
   */
  touch(): void;

  /**
   * Check if modified
   */
  readonly isModified: boolean;

  /**
   * Check if new
   */
  readonly isNew: boolean;

  /**
   * Convert to JSON
   */
  toJSON(): SessionData;
}

/**
 * Session cookie interface
 */
export interface SessionCookie extends SessionCookieData {
  /** Current maxAge in milliseconds */
  maxAge: number | null;
  /** Check if expired */
  readonly isExpired: boolean;
  /** Reset to original maxAge */
  resetMaxAge(): void;
  /** Serialize for Set-Cookie header */
  serialize(name: string, value: string): string;
  /** Convert to JSON */
  toJSON(): SessionCookieData;
}

// ============================================================================
// Store Error Types
// ============================================================================

export class SessionStoreError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "SessionStoreError";
  }
}

export class SessionNotFoundError extends SessionStoreError {
  constructor(sid: string) {
    super(`Session not found: ${sid}`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

export class SessionExpiredError extends SessionStoreError {
  constructor(sid: string) {
    super(`Session expired: ${sid}`, "SESSION_EXPIRED");
    this.name = "SessionExpiredError";
  }
}
