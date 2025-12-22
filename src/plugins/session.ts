import type { Application } from "../core/application";
import { session } from "../modules/session/middleware";
import type {
  SessionCookieOptions,
  SessionStore,
} from "../modules/session/types";

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
