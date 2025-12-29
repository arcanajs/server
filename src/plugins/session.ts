import type { Application } from "../core/application";
import { session } from "../modules/session/middleware";
import type {
  SessionCookieOptions,
  SessionStore,
} from "../modules/session/types";
import { cookieParser } from "./cookie";

/**
 * Session middleware configuration options
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
  /** Skip cookie parser auto-install (if you manually installed it) */
  skipCookieParser?: boolean;
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

    // Auto-install cookie parser FIRST (required for session to work)
    // Cookie parser needs the secret to parse signed session cookies
    if (!options.skipCookieParser) {
      app.use(cookieParser(options.secret));
    }

    // Install session middleware AFTER cookie parser
    app.use(session(options));
  },
});
