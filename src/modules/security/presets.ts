/**
 * ArcanaJS Security Presets
 *
 * Pre-configured security bundles for common use cases.
 * These combine multiple security middlewares into easy-to-use packages.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";
import { bodyLimit, type BodyLimitOptions } from "./body-limit";
import { cors, type CorsOptions } from "./cors";
import { helmet, type HelmetOptions } from "./helmet";
import { rateLimit, type RateLimitOptions } from "./rate-limit";
import {
  securityHeaders,
  type SecurityHeadersOptions,
} from "./security-headers";

/**
 * Security Preset Options
 */
export interface SecurityPresetOptions {
  /** Helmet options */
  helmet?: HelmetOptions | false;

  /** CORS options */
  cors?: CorsOptions | false;

  /** Rate limit options */
  rateLimit?: RateLimitOptions | false;

  /** Body limit options */
  bodyLimit?: BodyLimitOptions | string | false;

  /** Enhanced security headers options */
  securityHeaders?: SecurityHeadersOptions | false;

  /** Trust proxy for rate limiting */
  trustProxy?: boolean;
}

/**
 * Combine multiple middlewares into one
 */
function combineMiddlewares(
  ...middlewares: (Middleware | undefined)[]
): Middleware {
  const filtered = middlewares.filter(Boolean) as Middleware[];

  return async (req: Request, res: Response, next: NextFunction) => {
    let index = 0;

    const runNext = async (): Promise<void> => {
      if (index < filtered.length) {
        const middleware = filtered[index++];
        await middleware(req, res, runNext);
      } else {
        await next();
      }
    };

    await runNext();
  };
}

/**
 * Strict Security Preset
 *
 * Maximum security for sensitive applications like banking, healthcare.
 * May break some features - review carefully.
 *
 * Features:
 * - Strict CSP headers
 * - HSTS with preload
 * - No cross-origin resource sharing
 * - Aggressive rate limiting
 * - Strict body limits
 * - Permissions policy denying all
 */
export function strictSecurity(
  options: SecurityPresetOptions = {}
): Middleware {
  const middlewares: Middleware[] = [];

  // Helmet with strict settings
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: true,
          },
        },
        crossOriginEmbedderPolicy: { policy: "require-corp" },
        crossOriginOpenerPolicy: { policy: "same-origin" },
        crossOriginResourcePolicy: { policy: "same-origin" },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        frameguard: { action: "deny" },
        referrerPolicy: { policy: "no-referrer" },
        ...options.helmet,
      })
    );
  }

  // No CORS by default in strict mode
  if (options.cors) {
    middlewares.push(cors(options.cors));
  }

  // Aggressive rate limiting
  if (options.rateLimit !== false) {
    middlewares.push(
      rateLimit({
        windowMs: 60000,
        max: 30, // 30 requests per minute
        standardHeaders: true,
        legacyHeaders: false,
        ...options.rateLimit,
      })
    );
  }

  // Strict body limit
  if (options.bodyLimit !== false) {
    const limit =
      typeof options.bodyLimit === "string" ? options.bodyLimit : "10kb";
    middlewares.push(bodyLimit(limit));
  }

  // Enhanced security headers
  if (options.securityHeaders !== false) {
    middlewares.push(
      securityHeaders({
        permissionsPolicy: {
          accelerometer: "none",
          camera: "none",
          geolocation: "none",
          microphone: "none",
          payment: "none",
          usb: "none",
          "interest-cohort": "none",
        },
        noCacheSecure: true,
        disableClientHints: true,
        ...options.securityHeaders,
      })
    );
  }

  return combineMiddlewares(...middlewares);
}

/**
 * Standard Security Preset
 *
 * Recommended production defaults. Good balance of security and usability.
 *
 * Features:
 * - Standard CSP (relaxed enough for common use)
 * - HSTS enabled
 * - Configurable CORS
 * - Moderate rate limiting
 * - Reasonable body limits
 */
export function standardSecurity(
  options: SecurityPresetOptions = {}
): Middleware {
  const middlewares: Middleware[] = [];

  // Helmet with standard settings
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: false, // Often needs customization
        hsts: { maxAge: 15552000, includeSubDomains: true },
        frameguard: { action: "sameorigin" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        ...options.helmet,
      })
    );
  }

  // CORS with same-origin by default
  if (options.cors !== false) {
    middlewares.push(
      cors({
        origin: (process.env.ALLOWED_ORIGINS?.split(",") ||
          undefined) as CorsOptions["origin"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        ...options.cors,
      })
    );
  }

  // Moderate rate limiting
  if (options.rateLimit !== false) {
    middlewares.push(
      rateLimit({
        windowMs: 60000,
        max: 100, // 100 requests per minute
        standardHeaders: true,
        ...options.rateLimit,
      })
    );
  }

  // Standard body limit
  if (options.bodyLimit !== false) {
    const limit =
      typeof options.bodyLimit === "string" ? options.bodyLimit : "100kb";
    middlewares.push(bodyLimit(limit));
  }

  // Basic security headers
  if (options.securityHeaders !== false) {
    middlewares.push(
      securityHeaders({
        permissionsPolicy: {
          "interest-cohort": "none", // Block FLoC
        },
        ...options.securityHeaders,
      })
    );
  }

  return combineMiddlewares(...middlewares);
}

/**
 * API Security Preset
 *
 * Optimized for JSON API backends.
 *
 * Features:
 * - No CSP (not needed for APIs)
 * - Flexible CORS for API access
 * - Higher rate limits
 * - JSON body limit
 * - Minimal headers
 */
export function apiSecurity(options: SecurityPresetOptions = {}): Middleware {
  const middlewares: Middleware[] = [];

  // Minimal helmet for APIs
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        frameguard: false, // APIs don't need frame protection
        hsts: { maxAge: 15552000, includeSubDomains: true },
        noSniff: true,
        referrerPolicy: { policy: "no-referrer" },
        ...options.helmet,
      })
    );
  }

  // Flexible CORS for APIs
  if (options.cors !== false) {
    middlewares.push(
      cors({
        origin: options.cors?.origin ?? "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        exposedHeaders: [
          "X-Request-Id",
          "X-RateLimit-Limit",
          "X-RateLimit-Remaining",
        ],
        credentials: false,
        maxAge: 86400, // 24 hours
        ...options.cors,
      })
    );
  }

  // Higher rate limits for APIs
  if (options.rateLimit !== false) {
    middlewares.push(
      rateLimit({
        windowMs: 60000,
        max: 1000, // 1000 requests per minute
        standardHeaders: true,
        legacyHeaders: true,
        ...options.rateLimit,
      })
    );
  }

  // JSON body limit
  if (options.bodyLimit !== false) {
    const limit =
      typeof options.bodyLimit === "string" ? options.bodyLimit : "1mb";
    middlewares.push(bodyLimit(limit));
  }

  return combineMiddlewares(...middlewares);
}

/**
 * Relaxed Security Preset
 *
 * Development-friendly settings. NOT for production!
 *
 * Features:
 * - No CSP
 * - Allow all CORS
 * - High rate limits
 * - Large body limits
 */
export function relaxedSecurity(
  options: SecurityPresetOptions = {}
): Middleware {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[Security] Using relaxedSecurity in production is NOT recommended!"
    );
  }

  const middlewares: Middleware[] = [];

  // Minimal helmet
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false,
        hsts: false,
        ...options.helmet,
      })
    );
  }

  // Allow all CORS
  if (options.cors !== false) {
    middlewares.push(
      cors({
        origin: "*",
        credentials: false,
        ...options.cors,
      })
    );
  }

  // No rate limiting by default
  if (options.rateLimit) {
    middlewares.push(rateLimit(options.rateLimit));
  }

  // Large body limit
  if (options.bodyLimit !== false) {
    const limit =
      typeof options.bodyLimit === "string" ? options.bodyLimit : "10mb";
    middlewares.push(bodyLimit(limit));
  }

  return combineMiddlewares(...middlewares);
}

/**
 * GraphQL Security Preset
 *
 * Optimized for GraphQL APIs.
 *
 * Features:
 * - Larger body limits for queries
 * - Query complexity considerations
 * - Appropriate CORS
 */
export function graphqlSecurity(
  options: SecurityPresetOptions & {
    /** Enable query depth limiting (external implementation needed) */
    maxQueryDepth?: number;
  } = {}
): Middleware {
  const middlewares: Middleware[] = [];

  // Minimal helmet
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: false,
        hsts: { maxAge: 15552000 },
        ...options.helmet,
      })
    );
  }

  // CORS for GraphQL
  if (options.cors !== false) {
    middlewares.push(
      cors({
        origin: (options.cors?.origin ?? "*") as CorsOptions["origin"],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
        ...options.cors,
      })
    );
  }

  // Moderate rate limiting (per-query limiting preferred)
  if (options.rateLimit !== false) {
    middlewares.push(
      rateLimit({
        windowMs: 60000,
        max: 500,
        ...options.rateLimit,
      })
    );
  }

  // Larger body limit for complex queries
  if (options.bodyLimit !== false) {
    const limit =
      typeof options.bodyLimit === "string" ? options.bodyLimit : "500kb";
    middlewares.push(bodyLimit(limit));
  }

  return combineMiddlewares(...middlewares);
}

/**
 * WebSocket Security Preset
 *
 * Security for WebSocket-enabled applications.
 */
export function websocketSecurity(
  options: SecurityPresetOptions = {}
): Middleware {
  const middlewares: Middleware[] = [];

  // Helmet with WebSocket-friendly settings
  if (options.helmet !== false) {
    middlewares.push(
      helmet({
        contentSecurityPolicy: options.helmet?.contentSecurityPolicy ?? {
          directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", "wss:", "ws:"],
          },
        },
        ...options.helmet,
      })
    );
  }

  // CORS for WebSocket upgrade
  if (options.cors !== false) {
    middlewares.push(
      cors({
        origin: (options.cors?.origin ?? "*") as CorsOptions["origin"],
        credentials: true,
        ...options.cors,
      })
    );
  }

  return combineMiddlewares(...middlewares);
}

/**
 * Custom Security Preset Builder
 *
 * Build your own security preset with fine-grained control.
 */
export function customSecurity(config: {
  middlewares: Middleware[];
}): Middleware {
  return combineMiddlewares(...config.middlewares);
}

/**
 * Environment-based security selector
 *
 * Automatically selects the appropriate security preset based on NODE_ENV.
 */
export function autoSecurity(
  options: {
    production?: SecurityPresetOptions;
    development?: SecurityPresetOptions;
    test?: SecurityPresetOptions;
  } = {}
): Middleware {
  const env = process.env.NODE_ENV || "development";

  switch (env) {
    case "production":
      return standardSecurity(options.production);
    case "test":
      return relaxedSecurity(options.test);
    default:
      return relaxedSecurity(options.development);
  }
}
