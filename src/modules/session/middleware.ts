/**
 * ArcanaJS Session Middleware
 *
 * The core middleware that manages sessions across requests.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";
import { SessionImpl } from "./session";
import { SessionCookieImpl } from "./session-cookie";
import {
  generateSessionId,
  signSessionId,
  unsignSessionId,
} from "./session-id";
import { MemoryStore } from "./stores/memory-store";
import type { SessionOptions } from "./types";

/**
 * session - Create session middleware
 */
export function session(options: SessionOptions): Middleware {
  // Validate options
  if (
    !options.secret ||
    (Array.isArray(options.secret) && options.secret.length === 0)
  ) {
    throw new Error("session options.secret is required");
  }

  const name = options.name || "arcanajs.sid";
  const secrets = Array.isArray(options.secret)
    ? options.secret
    : [options.secret];
  const store = options.store || new MemoryStore();
  const resave = options.resave ?? false;
  const saveUninitialized = options.saveUninitialized ?? false;
  const rolling = options.rolling ?? false;

  return async (req: Request, res: Response, next: NextFunction) => {
    let sessionObj: SessionImpl | undefined;
    let isNewSession = false;
    let saved = false;

    // Helper to create a new session
    const createNewSession = async () => {
      const id = options.genid ? options.genid(req) : generateSessionId();
      const cookie = new SessionCookieImpl(options.cookie);

      // Auto-detect secure
      if (options.cookie?.secure === "auto") {
        const isSecure =
          req.headers.get("x-forwarded-proto") === "https" ||
          (req as any).secure === true;
        cookie.secure = isSecure;
      }

      isNewSession = true;
      const sess = new SessionImpl(id, store, cookie);

      // Add regenerate implementation
      sess.regenerate = async () => {
        await store.destroy(sess.id);
        const newSess = await createNewSession();
        // Copy data
        const data = sess.toJSON();
        for (const [key, value] of Object.entries(data)) {
          if (key !== "cookie") newSess.set(key, value);
        }
        sessionObj = newSess;
      };

      return sess;
    };

    // Define lazy req.session property
    Object.defineProperty(req, "session", {
      get: async function () {
        if (sessionObj) return sessionObj;

        // 1. Try to load from cookie
        const signedSid = req.cookies?.[name];
        if (signedSid) {
          const sid = unsignSessionId(signedSid, secrets);
          if (sid) {
            const data = await store.get(sid);
            if (data) {
              const cookieObj = SessionCookieImpl.fromJSON(data.cookie);
              sessionObj = new SessionImpl(sid, store, cookieObj, data);

              // Add regenerate implementation for existing session
              sessionObj.regenerate = async () => {
                await store.destroy(sessionObj!.id);
                const newSess = await createNewSession();
                const currentData = sessionObj!.toJSON();
                for (const [key, value] of Object.entries(currentData)) {
                  if (key !== "cookie") newSess.set(key, value);
                }
                sessionObj = newSess;
              };

              return sessionObj;
            }
          }
        }

        // 2. Fallback to new session
        sessionObj = await createNewSession();
        return sessionObj;
      },
      set: function (val) {
        sessionObj = val;
      },
      configurable: true,
    });

    // Lazy req.sessionID
    Object.defineProperty(req, "sessionID", {
      get: async function () {
        const s = await (req as any).session;
        return s.id;
      },
      configurable: true,
    });

    const saveSession = async () => {
      if (saved) return;
      saved = true;

      // Only attempt to save if session was accessed
      if (!sessionObj) return;

      const session = sessionObj;

      // Handle destruction
      if ((session as any)._destroyed) {
        res.clearCookie(name, options.cookie as any);
        return;
      }

      // Rolling session
      if (rolling) {
        session.touch();
      }

      const shouldSave =
        (resave && !isNewSession) ||
        (saveUninitialized && isNewSession) ||
        session.isModified;

      if (shouldSave) {
        await session.save();

        // Set cookie
        const signed = signSessionId(session.id, secrets[0]);
        res.cookie(name, signed, session.cookie as any);
      }
    };

    // Defer session saving until the response is about to be sent
    res.defer(saveSession);

    await next();
  };
}
