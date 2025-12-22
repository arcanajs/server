/**
 * ArcanaJS Session Module - Main Exports
 *
 * Production-ready session management system
 * Optimized for Bun runtime
 *
 * @example
 * ```typescript
 * import { session, FileStore } from "@arcanajs/server/session";
 *
 * app.use(session({
 *   secret: process.env.SESSION_SECRET!,
 *   store: new FileStore({ path: "./.sessions" }),
 *   cookie: {
 *     httpOnly: true,
 *     secure: true,
 *     maxAge: 86400000
 *   }
 * }));
 * ```
 */

// ============================================================================
// Core Exports
// ============================================================================

// Types
export type {
  Session,
  SessionCookie,
  SessionCookieData,
  SessionCookieOptions,
  SessionData,
  SessionStore,
  SessionOptions,
} from "./types";

// Errors
export {
  SessionStoreError,
  SessionNotFoundError,
  SessionExpiredError,
} from "./types";

// Middleware
export { session } from "./middleware";

// Session Implementation
export { SessionImpl } from "./session";
export { SessionCookieImpl } from "./session-cookie";

// Session ID Utilities
export {
  generateSessionId,
  generateSessionIds,
  isValidSessionId,
  signSessionId,
  unsignSessionId,
  unsignSessionIds,
  rotateSessionId,
  extractSessionId,
  isSignedSessionId,
  timingSafeEqual,
} from "./session-id";

// ============================================================================
// Store Exports
// ============================================================================

export { MemoryStore } from "./stores";
export { FileStore } from "./stores";
export { RedisStore } from "./stores";
export type { RedisClient } from "./stores";

// ============================================================================
// Cookie Parser Exports
// ============================================================================

export {
  cookieParser,
  parseJSONCookie,
  parseJSONCookies,
  serializeJSONCookie,
  parseSignedCookie,
  parseSignedCookies,
  signCookie,
  isValidCookieName,
  isValidCookieValue,
  createCookie,
  CookieBuilder,
} from "./cookie-parser";

export type { CookieParserOptions } from "./cookie-parser";

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create session middleware with sensible defaults
 */
export function createSession(secret: string, store?: SessionStore) {
  return session({
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: 86400000, // 24 hours
    },
  });
}

/**
 * Create development session (Memory store with warnings)
 */
export function createDevSession(secret: string) {
  console.warn(
    "⚠️  Using MemoryStore for development. " +
      "Sessions will be lost on restart."
  );

  return createSession(secret, new MemoryStore());
}

/**
 * Create production session (File store)
 */
export function createProdSession(secret: string, options?: { path?: string }) {
  const store = new FileStore({
    path: options?.path || "./.sessions",
    checkPeriod: 3600000, // 1 hour
  });

  return createSession(secret, store);
}


// ============================================================================
// Re-export for convenience
// ============================================================================

import { MemoryStore } from "./stores";
import { FileStore } from "./stores";
import type { SessionStore } from "./types";
import { session } from "./middleware";
