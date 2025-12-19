/**
 * ArcanaJS Security Module
 */

import type { ArcanaJSKernel, ArcanaJSModule } from "../../core/kernel";

// Helmet exports
export {
  contentSecurityPolicy,
  dnsPrefetchControl,
  frameguard,
  helmet,
  hidePoweredBy,
  hsts,
  noSniff,
  referrerPolicy,
} from "./helmet";

export type {
  CrossOriginEmbedderPolicy,
  CrossOriginOpenerPolicy,
  CrossOriginResourcePolicy,
  CSPDirectives,
  CSPOptions,
  HelmetOptions,
  HSTSOptions,
  ReferrerPolicy,
} from "./helmet";

// CORS exports
export { cors, corsAll, corsDev } from "./cors";
export type { CorsOptions } from "./cors";

// Rate limiting exports
export { rateLimit, slowDown } from "./rate-limit";
export type {
  RateLimitInfo,
  RateLimitOptions,
  RateLimitStore,
} from "./rate-limit";

// Body limit exports
export { bodyLimit, jsonWithLimit, textWithLimit } from "./body-limit";
export type { BodyLimitOptions } from "./body-limit";

// Session exports
export { FileStore, MemoryStore, RedisStore, session } from "../session";
export type {
  RedisClient,
  Session,
  SessionCookieOptions,
  SessionData,
  SessionOptions,
  SessionStore,
} from "../session";

/**
 * SecurityModule - ArcanaJS module for security features
 */
export class SecurityModule implements ArcanaJSModule {
  readonly name = "security";
  readonly version = "1.0.0";

  init(kernel: ArcanaJSKernel): void {
    // Security module is ready
  }
}
