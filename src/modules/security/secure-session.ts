/**
 * ArcanaJS Secure Session Utilities
 *
 * Provides session security features including fixation prevention,
 * hijacking detection, and session binding.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Secure Session Options
 */
export interface SecureSessionOptions {
  /** Bind session to user agent. Default: true */
  bindUserAgent?: boolean;

  /** Bind session to IP address. Default: false (can cause issues with mobile) */
  bindIP?: boolean;

  /** Regenerate session ID after login. Default: true */
  regenerateOnLogin?: boolean;

  /** Session ID cookie name for detection. Default: 'sessionId' */
  sessionIdCookie?: string;

  /** Maximum session age in milliseconds. Default: 24 hours */
  maxAge?: number;

  /** Maximum idle time in milliseconds. Default: 30 minutes */
  maxIdleTime?: number;

  /** Track session activity. Default: true */
  trackActivity?: boolean;

  /** On session violation handler */
  onViolation?: (
    req: Request,
    res: Response,
    next: NextFunction,
    violation: SessionViolation
  ) => void | Promise<void>;

  /** Trust proxy for IP binding */
  trustProxy?: boolean;

  /** Session fingerprint fields */
  fingerprintFields?: string[];
}

/**
 * Session violation types
 */
export interface SessionViolation {
  type:
    | "user_agent_mismatch"
    | "ip_mismatch"
    | "fingerprint_mismatch"
    | "session_expired"
    | "session_idle"
    | "concurrent_session";
  message: string;
  details?: Record<string, any>;
}

/**
 * Session metadata stored with the session
 */
export interface SessionSecurityMeta {
  /** User agent at session creation */
  userAgent?: string;

  /** IP address at session creation */
  ip?: string;

  /** Session fingerprint */
  fingerprint?: string;

  /** Session creation time */
  createdAt: number;

  /** Last activity time */
  lastActivity: number;

  /** Number of requests in this session */
  requestCount: number;
}

/**
 * Generate a session fingerprint from request
 */
function generateFingerprint(req: Request, fields: string[]): string {
  const parts: string[] = [];

  for (const field of fields) {
    switch (field) {
      case "user-agent":
        parts.push(req.headers.get("user-agent") || "");
        break;
      case "accept-language":
        parts.push(req.headers.get("accept-language") || "");
        break;
      case "accept-encoding":
        parts.push(req.headers.get("accept-encoding") || "");
        break;
      case "accept":
        parts.push(req.headers.get("accept") || "");
        break;
      default:
        parts.push(req.headers.get(field) || "");
    }
  }

  // Create a simple hash
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get real IP considering proxy
 */
function getRealIP(req: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
    const realIP = req.headers.get("x-real-ip");
    if (realIP) {
      return realIP.trim();
    }
  }
  return req.ip || "unknown";
}

/**
 * Default violation handler
 */
async function defaultOnViolation(
  _req: Request,
  res: Response,
  _next: NextFunction,
  violation: SessionViolation
): Promise<void> {
  res.status(401);
  await res.json({
    error: "Unauthorized",
    message: violation.message,
    code: `SESSION_${violation.type.toUpperCase()}`,
  });
}

/**
 * Create secure session middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { secureSession } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Apply after session middleware
 * app.use(session({ ... }));
 * app.use(secureSession({
 *   bindUserAgent: true,
 *   bindIP: false, // Can cause issues with mobile networks
 *   maxIdleTime: 30 * 60 * 1000 // 30 minutes
 * }));
 * ```
 */
export function secureSession(options: SecureSessionOptions = {}): Middleware {
  const bindUserAgent = options.bindUserAgent ?? true;
  const bindIP = options.bindIP ?? false;
  const maxAge = options.maxAge ?? 86400000; // 24 hours
  const maxIdleTime = options.maxIdleTime ?? 1800000; // 30 minutes
  const trackActivity = options.trackActivity ?? true;
  const onViolation = options.onViolation ?? defaultOnViolation;
  const trustProxy = options.trustProxy ?? false;
  const fingerprintFields = options.fingerprintFields ?? [
    "user-agent",
    "accept-language",
  ];

  const SESSION_META_KEY = "_securityMeta";

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if session exists
    if (!req.session) {
      return next();
    }

    const session = req.session;
    const now = Date.now();

    // Get or initialize security metadata
    let meta: SessionSecurityMeta | undefined = session.get(SESSION_META_KEY);

    if (!meta) {
      // New session - initialize metadata
      meta = {
        createdAt: now,
        lastActivity: now,
        requestCount: 0,
      };

      if (bindUserAgent) {
        meta.userAgent = req.headers.get("user-agent") || undefined;
      }

      if (bindIP) {
        meta.ip = getRealIP(req, trustProxy);
      }

      if (fingerprintFields.length > 0) {
        meta.fingerprint = generateFingerprint(req, fingerprintFields);
      }

      session.set(SESSION_META_KEY, meta);
    } else {
      // Existing session - validate

      // Check session age
      if (now - meta.createdAt > maxAge) {
        await session.destroy();
        return onViolation(req, res, next, {
          type: "session_expired",
          message: "Session has expired",
          details: {
            age: now - meta.createdAt,
            maxAge,
          },
        });
      }

      // Check idle time
      if (maxIdleTime && now - meta.lastActivity > maxIdleTime) {
        await session.destroy();
        return onViolation(req, res, next, {
          type: "session_idle",
          message: "Session timed out due to inactivity",
          details: {
            idleTime: now - meta.lastActivity,
            maxIdleTime,
          },
        });
      }

      // Check user agent binding
      if (bindUserAgent && meta.userAgent) {
        const currentUserAgent = req.headers.get("user-agent") || "";
        if (meta.userAgent !== currentUserAgent) {
          await session.destroy();
          return onViolation(req, res, next, {
            type: "user_agent_mismatch",
            message: "Session user agent mismatch detected",
            details: {
              expected: meta.userAgent.substring(0, 50),
              received: currentUserAgent.substring(0, 50),
            },
          });
        }
      }

      // Check IP binding
      if (bindIP && meta.ip) {
        const currentIP = getRealIP(req, trustProxy);
        if (meta.ip !== currentIP) {
          await session.destroy();
          return onViolation(req, res, next, {
            type: "ip_mismatch",
            message: "Session IP address mismatch detected",
            details: {
              expected: meta.ip,
              received: currentIP,
            },
          });
        }
      }

      // Check fingerprint
      if (meta.fingerprint && fingerprintFields.length > 0) {
        const currentFingerprint = generateFingerprint(req, fingerprintFields);
        if (meta.fingerprint !== currentFingerprint) {
          await session.destroy();
          return onViolation(req, res, next, {
            type: "fingerprint_mismatch",
            message: "Session fingerprint mismatch detected",
          });
        }
      }

      // Update activity
      if (trackActivity) {
        meta.lastActivity = now;
        meta.requestCount++;
        session.set(SESSION_META_KEY, meta);
      }
    }

    // Attach helper methods to request
    (req as any).sessionMeta = () => meta;

    (req as any).regenerateSession = async () => {
      // Get all session data before regeneration
      const sessionData: Record<string, any> = {};
      const sessionKeys = ["userId", "user", "_securityMeta"];
      for (const key of sessionKeys) {
        const value = session.get(key);
        if (value !== undefined) {
          sessionData[key] = value;
        }
      }

      await session.regenerate();
      // Restore non-security data
      for (const [key, value] of Object.entries(sessionData)) {
        if (key !== SESSION_META_KEY) {
          session.set(key, value);
        }
      }

      // Create new security metadata
      const newMeta: SessionSecurityMeta = {
        createdAt: Date.now(),
        lastActivity: Date.now(),
        requestCount: 0,
      };

      if (bindUserAgent) {
        newMeta.userAgent = req.headers.get("user-agent") || undefined;
      }

      if (bindIP) {
        newMeta.ip = getRealIP(req, trustProxy);
      }

      if (fingerprintFields.length > 0) {
        newMeta.fingerprint = generateFingerprint(req, fingerprintFields);
      }

      session.set(SESSION_META_KEY, newMeta);
    };

    await next();
  };
}

/**
 * Session fixation prevention - regenerate session on privilege escalation
 */
export function sessionFixationPrevention(): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original login/auth functions if they exist
    const session = req.session;

    if (session) {
      // Attach a helper that should be called after successful authentication
      (req as any).onAuthenticated = async () => {
        if (req.session) {
          // Get session data before regeneration
          const sessionData: Record<string, any> = {};
          const sessionKeys = ["userId", "user"];
          for (const key of sessionKeys) {
            const value = req.session.get(key);
            if (value !== undefined) {
              sessionData[key] = value;
            }
          }

          await req.session.regenerate();

          // Restore data except security metadata
          for (const [key, value] of Object.entries(sessionData)) {
            if (!key.startsWith("_security")) {
              req.session.set(key, value);
            }
          }
        }
      };
    }

    await next();
  };
}

/**
 * Concurrent session prevention
 */
export function concurrentSessionPrevention(
  options: {
    maxSessions?: number;
    getSessionKey?: (req: Request) => string | undefined;
    store?: Map<string, Set<string>>;
    onViolation?: (
      req: Request,
      res: Response,
      next: NextFunction
    ) => void | Promise<void>;
  } = {}
): Middleware {
  const maxSessions = options.maxSessions ?? 1;
  const store = options.store ?? new Map<string, Set<string>>();

  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.session;
    if (!session) {
      return next();
    }

    // Get user identifier (typically from session after login)
    const userKey = options.getSessionKey
      ? options.getSessionKey(req)
      : session.get("userId");

    if (!userKey) {
      return next();
    }

    const sessionId = req.sessionID;
    if (!sessionId) {
      return next();
    }

    // Get existing sessions for this user
    let userSessions = store.get(userKey);

    if (!userSessions) {
      userSessions = new Set();
      store.set(userKey, userSessions);
    }

    // Check if this session is already registered
    if (!userSessions.has(sessionId)) {
      // Check if we're at the limit
      if (userSessions.size >= maxSessions) {
        if (options.onViolation) {
          return options.onViolation(req, res, next);
        }

        res.status(403);
        await res.json({
          error: "Forbidden",
          message: `Maximum of ${maxSessions} concurrent session(s) allowed`,
          code: "CONCURRENT_SESSION_LIMIT",
        });
        return;
      }

      userSessions.add(sessionId);
    }

    // Attach cleanup helper
    (req as any).removeFromConcurrentSessions = () => {
      if (userKey && sessionId) {
        const sessions = store.get(userKey);
        if (sessions) {
          sessions.delete(sessionId);
          if (sessions.size === 0) {
            store.delete(userKey);
          }
        }
      }
    };

    await next();
  };
}

/**
 * Session activity logger
 */
export function sessionActivityLogger(
  options: {
    log?: (info: {
      sessionId: string;
      userId?: string;
      action: string;
      ip: string;
      userAgent: string;
      path: string;
      timestamp: Date;
    }) => void;
    logOnlyAuthenticated?: boolean;
  } = {}
): Middleware {
  const logger = options.log ?? console.log;
  const onlyAuthenticated = options.logOnlyAuthenticated ?? true;

  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.session;

    if (!session) {
      return next();
    }

    const userId = session.get("userId");

    // Skip if not authenticated and only logging authenticated
    if (onlyAuthenticated && !userId) {
      return next();
    }

    logger({
      sessionId: req.sessionID || "unknown",
      userId,
      action: req.method,
      ip: req.ip || "unknown",
      userAgent: req.headers.get("user-agent") || "unknown",
      path: req.path,
      timestamp: new Date(),
    });

    await next();
  };
}
