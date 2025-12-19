/**
 * ArcanaJS CORS Middleware
 *
 * Cross-Origin Resource Sharing configuration.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /**
   * Allowed origins. Can be:
   * - A string: exact match or "*" for all
   * - An array of strings: list of allowed origins
   * - A RegExp: pattern to match
   * - A function: async validated
   */
  origin?:
    | string
    | string[]
    | RegExp
    | ((
        origin: string,
        req: Request
      ) => boolean | string | Promise<boolean | string>);

  /** Allowed HTTP methods */
  methods?: string[];

  /** Allowed request headers */
  allowedHeaders?: string[];

  /** Headers exposed to the client */
  exposedHeaders?: string[];

  /** Allow credentials (cookies, authorization headers) */
  credentials?: boolean;

  /** Preflight cache duration in seconds */
  maxAge?: number;

  /** Pass preflight response to next handler */
  preflightContinue?: boolean;

  /** Success status for OPTIONS requests */
  optionsSuccessStatus?: number;
}

/**
 * Default CORS options
 */
const DEFAULT_OPTIONS: CorsOptions = {
  origin: "*",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: [],
  exposedHeaders: [],
  credentials: false,
  maxAge: undefined,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Check if origin is allowed
 */
async function isOriginAllowed(
  origin: string,
  allowedOrigin: CorsOptions["origin"],
  req: Request
): Promise<string | false> {
  if (!allowedOrigin) {
    return false;
  }

  // Allow all origins
  if (allowedOrigin === "*") {
    return "*";
  }

  // Exact string match
  if (typeof allowedOrigin === "string") {
    return origin === allowedOrigin ? origin : false;
  }

  // Array of allowed origins
  if (Array.isArray(allowedOrigin)) {
    return allowedOrigin.includes(origin) ? origin : false;
  }

  // RegExp match
  if (allowedOrigin instanceof RegExp) {
    return allowedOrigin.test(origin) ? origin : false;
  }

  // Function validator
  if (typeof allowedOrigin === "function") {
    const result = await allowedOrigin(origin, req);
    if (typeof result === "string") {
      return result;
    }
    return result ? origin : false;
  }

  return false;
}

/**
 * Set CORS headers on response
 */
async function setCorsHeaders(
  req: Request,
  res: Response,
  options: CorsOptions
): Promise<void> {
  const origin = req.headers.get("origin");

  if (origin) {
    const allowed = await isOriginAllowed(origin, options.origin, req);

    if (allowed) {
      res.set("Access-Control-Allow-Origin", allowed);

      // Vary by Origin when not using "*"
      if (allowed !== "*") {
        res.vary?.("Origin") || res.set("Vary", "Origin");
      }
    }
  }

  // Credentials
  if (options.credentials) {
    res.set("Access-Control-Allow-Credentials", "true");
  }

  // Exposed headers
  if (options.exposedHeaders && options.exposedHeaders.length > 0) {
    res.set("Access-Control-Expose-Headers", options.exposedHeaders.join(", "));
  }
}

/**
 * Set preflight CORS headers
 */
async function setPreflightHeaders(
  req: Request,
  res: Response,
  options: CorsOptions
): Promise<void> {
  // Set basic CORS headers
  await setCorsHeaders(req, res, options);

  // Access-Control-Allow-Methods
  if (options.methods && options.methods.length > 0) {
    res.set("Access-Control-Allow-Methods", options.methods.join(", "));
  }

  // Access-Control-Allow-Headers
  const requestedHeaders = req.headers.get("access-control-request-headers");
  if (options.allowedHeaders && options.allowedHeaders.length > 0) {
    res.set("Access-Control-Allow-Headers", options.allowedHeaders.join(", "));
  } else if (requestedHeaders) {
    // Reflect requested headers
    res.set("Access-Control-Allow-Headers", requestedHeaders);
    res.vary?.("Access-Control-Request-Headers") ||
      res.set("Vary", "Access-Control-Request-Headers");
  }

  // Access-Control-Max-Age
  if (options.maxAge !== undefined) {
    res.set("Access-Control-Max-Age", String(options.maxAge));
  }
}

/**
 * Create CORS middleware
 */
export function cors(options: CorsOptions = {}): Middleware {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    const isPreflightRequest =
      req.method === "OPTIONS" &&
      req.headers.has("access-control-request-method");

    if (isPreflightRequest) {
      // Handle preflight request
      await setPreflightHeaders(req, res, config);

      if (config.preflightContinue) {
        await next();
      } else {
        res.status(config.optionsSuccessStatus || 204);
        res.set("Content-Length", "0");
        await res.end();
      }
    } else {
      // Handle actual request
      await setCorsHeaders(req, res, config);
      await next();
    }
  };
}

/**
 * Create a CORS middleware that allows all origins (unsafe for production)
 */
export function corsAll(): Middleware {
  return cors({
    origin: "*",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    credentials: false,
  });
}

/**
 * Create a CORS middleware for development
 */
export function corsDev(): Middleware {
  return cors({
    origin: true as any, // Allow any origin
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
}
