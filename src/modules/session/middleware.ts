/**
 * ArcanaJS Session Middleware - Production Implementation
 *
 * Robust session management with proper async handling,
 * security features, and error recovery
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";
import { SessionImpl } from "./session";
import { SessionCookieImpl } from "./session-cookie";
import {
  generateSessionId,
  unsignSessionId,
  signSessionId,
} from "./session-id";
import { MemoryStore } from "./stores";
import type { SessionOptions, SessionStore } from "./types";

/**
 * Create session middleware
 */
export function session(options: SessionOptions): Middleware {
  // Validate required options
  if (!options.secret) {
    throw new Error("session secret is required");
  }

  if (Array.isArray(options.secret) && options.secret.length === 0) {
    throw new Error("session secret cannot be empty array");
  }

  // Normalize configuration
  const config = normalizeOptions(options);

  // Warning for development
  if (
    config.store instanceof MemoryStore &&
    process.env.NODE_ENV === "production"
  ) {
    console.warn(
      "⚠️  WARNING: Using MemoryStore in production. " +
        "Sessions will be lost on restart. Use FileStore or RedisStore instead."
    );
  }

  return createSessionMiddleware(config);
}

/**
 * Normalize session options
 */
function normalizeOptions(
  options: SessionOptions
): Required<SessionOptions> & { secrets: string[] } {
  const secrets = Array.isArray(options.secret)
    ? options.secret
    : [options.secret];

  // Validate secrets
  for (const secret of secrets) {
    if (!secret || typeof secret !== "string" || secret.length < 32) {
      throw new Error("Session secrets must be at least 32 characters");
    }
  }

  return {
    name: options.name || "arcanajs.sid",
    secret: secrets[0],
    secrets,
    store: options.store || new MemoryStore(),
    resave: options.resave ?? false,
    saveUninitialized: options.saveUninitialized ?? false,
    rolling: options.rolling ?? false,
    proxy: options.proxy ?? false,
    cookie: options.cookie || {},
    genid: options.genid || generateSessionId,
    unset: options.unset || "keep",
  };
}

/**
 * Create the actual middleware function
 */
function createSessionMiddleware(
  config: ReturnType<typeof normalizeOptions>
): Middleware {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Skip if session already initialized
    if (req.session) {
      return next();
    }

    let sessionInstance: SessionImpl | null = null;
    let isNewSession = false;
    let shouldSave = false;

    try {
      // Initialize session
      sessionInstance = await initializeSession(req, config);
      isNewSession = sessionInstance.isNew;

      // Attach to request
      attachSessionToRequest(req, sessionInstance);

      // Setup regenerate function
      setupRegenerateFunction(sessionInstance, req, config);

      // Continue with request
      await next();

      // Determine if we should save
      shouldSave = shouldSaveSession(sessionInstance, isNewSession, config);

      if (shouldSave) {
        await saveSession(sessionInstance, res, config);
      }
    } catch (error) {
      console.error("Session middleware error:", error);

      // Clear session on error
      if (sessionInstance && !sessionInstance.isDestroyed) {
        try {
          await sessionInstance.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }

      // Re-throw to trigger error handling
      throw error;
    }
  };
}

/**
 * Initialize or load session
 */
async function initializeSession(
  req: Request,
  config: ReturnType<typeof normalizeOptions>
): Promise<SessionImpl> {
  // Try to load existing session
  const signedSid = req.cookies?.[config.name];

  if (signedSid) {
    const sid = unsignSessionId(signedSid, config.secrets);

    if (sid !== false) {
      const data = await config.store.get(sid);

      if (data) {
        // Validate session data
        if (isValidSessionData(data)) {
          const cookie = SessionCookieImpl.fromJSON(data.cookie);

          // Check if expired
          if (!cookie.isExpired) {
            const session = new SessionImpl(sid, config.store, cookie, data);

            // Apply rolling expiration
            if (config.rolling) {
              session.touch();
            }

            return session;
          }
        }
      }
    }
  }

  // Create new session
  return await createNewSession(req, config);
}

/**
 * Create a new session
 */
async function createNewSession(
  req: Request,
  config: ReturnType<typeof normalizeOptions>
): Promise<SessionImpl> {
  const sid = config.genid(req);
  const cookie = new SessionCookieImpl(config.cookie);

  // Auto-detect secure
  if (config.cookie.secure === "auto") {
    const isSecure =
      req.protocol === "https" ||
      req.headers.get("x-forwarded-proto") === "https";
    cookie.secure = isSecure;
  }

  return new SessionImpl(sid, config.store, cookie);
}

/**
 * Attach session to request object
 */
function attachSessionToRequest(req: Request, session: SessionImpl): void {
  // Use direct property assignment (not lazy getter)
  Object.defineProperty(req, "session", {
    get: () => session,
    set: (value) => {
      // Allow reassignment during regeneration
      Object.defineProperty(req, "session", {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
    enumerable: true,
    configurable: true,
  });

  // Add sessionID property
  Object.defineProperty(req, "sessionID", {
    get: () => session.id,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Setup session regeneration function
 */
function setupRegenerateFunction(
  session: SessionImpl,
  req: Request,
  config: ReturnType<typeof normalizeOptions>
): void {
  session.regenerate = async function (): Promise<void> {
    if (session.isDestroyed) {
      throw new Error("Cannot regenerate destroyed session");
    }

    session._markRegenerating();

    try {
      // Save old data
      const oldData = session.toJSON();

      // Destroy old session
      await config.store.destroy(session.id);

      // Create new session with same data
      const newSession = await createNewSession(req, config);

      // Copy data (except internal fields)
      for (const [key, value] of Object.entries(oldData)) {
        if (!["cookie", "createdAt", "lastActivity"].includes(key)) {
          newSession.set(key, value);
        }
      }

      // Replace session on request
      (req as any).session = newSession;

      session._unmarkRegenerating();
    } catch (error) {
      session._unmarkRegenerating();
      throw new Error(`Failed to regenerate session: ${error}`);
    }
  };
}

/**
 * Determine if session should be saved
 */
function shouldSaveSession(
  session: SessionImpl,
  isNew: boolean,
  config: ReturnType<typeof normalizeOptions>
): boolean {
  if (session.isDestroyed) {
    return false;
  }

  // Force save if resave is enabled
  if (config.resave && !isNew) {
    return true;
  }

  // Save uninitialized sessions if configured
  if (config.saveUninitialized && isNew) {
    return true;
  }

  // Save if modified
  if (session.isModified) {
    return true;
  }

  return false;
}

/**
 * Save session and set cookie
 */
async function saveSession(
  session: SessionImpl,
  res: Response,
  config: ReturnType<typeof normalizeOptions>
): Promise<void> {
  try {
    // Save to store
    await session.save();

    // Sign session ID
    const signed = signSessionId(session.id, config.secrets[0]);

    // Set cookie
    res.cookie(config.name, signed, {
      ...session.cookie.toJSON(),
      httpOnly: session.cookie.httpOnly,
      secure: session.cookie.secure,
      sameSite:
        session.cookie.sameSite === true
          ? "strict"
          : session.cookie.sameSite === false
          ? undefined
          : session.cookie.sameSite,
      path: session.cookie.path,
      domain: session.cookie.domain,
      maxAge: session.cookie.maxAge || undefined,
      expires: session.cookie.expires
        ? new Date(session.cookie.expires)
        : undefined,
    });
  } catch (error) {
    throw new Error(`Failed to save session: ${error}`);
  }
}

/**
 * Validate session data structure
 */
function isValidSessionData(data: any): data is import("./types").SessionData {
  return (
    data &&
    typeof data === "object" &&
    data.cookie &&
    typeof data.cookie === "object"
  );
}
