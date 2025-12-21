import type { Application } from "../core/application";
import { session } from "../modules/session/middleware";
import type { SessionCookieOptions, SessionStore } from "../modules/session/types";
import type { Request } from "../types";
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
export const sessionPlugin = (options: SessionOptions) => ({
  name: "session",
  version: "1.0.0",

  install(app: Application) {
    // Validate session options before installing
    if (
      !options.secret ||
      (Array.isArray(options.secret) && options.secret.length === 0)
    ) {
      throw new Error("session options.secret is required");
    }

    // Install session middleware
    app.use(session(options));
  },
});
