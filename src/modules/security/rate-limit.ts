/**
 * ArcanaJS Rate Limiting Middleware
 *
 * Protects against brute-force attacks and DoS by limiting request rates.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Rate limit store interface
 */
export interface RateLimitStore {
  /** Increment the counter for a key */
  increment(key: string): Promise<RateLimitInfo>;
  /** Reset the counter for a key */
  reset(key: string): Promise<void>;
  /** Cleanup expired entries */
  cleanup?(): Promise<void>;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  /** Total number of requests in the current window */
  totalHits: number;
  /** Time when the window resets (ms) */
  resetTime: Date;
}

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  /** Time window in milliseconds. Default: 60000 (1 minute) */
  windowMs?: number;

  /** Maximum requests per window. Can be a function for dynamic limits. Default: 100 */
  max?: number | ((req: Request) => number | Promise<number>);

  /** Key generator function. Default: IP address */
  keyGenerator?: (req: Request) => string | Promise<string>;

  /** Custom handler for rate limited requests */
  handler?: (
    req: Request,
    res: Response,
    next: NextFunction,
    options: RateLimitOptions
  ) => void | Promise<void>;

  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /** Skip rate limiting on failed requests */
  skipFailedRequests?: boolean;

  /** Skip rate limiting on successful requests */
  skipSuccessfulRequests?: boolean;

  /** Custom store for distributed rate limiting */
  store?: RateLimitStore;

  /** Enable rate limit headers */
  headers?: boolean;

  /** Enable draft-6 rate limit headers */
  standardHeaders?: boolean | "draft-6" | "draft-7";

  /** Legacy headers (X-RateLimit-*) */
  legacyHeaders?: boolean;

  /** Message to send when rate limited */
  message?: string | object;

  /** Status code for rate limited responses. Default: 429 */
  statusCode?: number;
}

/**
 * In-memory rate limit store
 */
class MemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(windowMs: number) {
    this.windowMs = windowMs;

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || record.resetTime <= now) {
      // Start new window
      record = {
        count: 1,
        resetTime: now + this.windowMs,
      };
    } else {
      record.count++;
    }

    this.hits.set(key, record);

    return {
      totalHits: record.count,
      resetTime: new Date(record.resetTime),
    };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (record.resetTime <= now) {
        this.hits.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.hits.clear();
  }
}

/**
 * Default rate limit handler
 */
async function defaultHandler(
  req: Request,
  res: Response,
  next: NextFunction,
  options: RateLimitOptions
): Promise<void> {
  const message = options.message || {
    error: "Too many requests, please try again later.",
  };
  const statusCode = options.statusCode || 429;

  res.status(statusCode);

  if (typeof message === "object") {
    await res.json(message);
  } else {
    await res.send(message);
  }
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: Request): string {
  return req.ip || "unknown";
}

/**
 * Create rate limiting middleware
 */
export function rateLimit(options: RateLimitOptions = {}): Middleware {
  const windowMs = options.windowMs || 60000;
  const store = options.store || new MemoryStore(windowMs);
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;
  const handler = options.handler || defaultHandler;
  const skip = options.skip;
  const headers = options.headers !== false;
  const legacyHeaders = options.legacyHeaders ?? true;
  const standardHeaders = options.standardHeaders ?? true;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check if should skip
    if (skip) {
      const shouldSkip = await skip(req);
      if (shouldSkip) {
        return next();
      }
    }

    // Generate key
    const key = await keyGenerator(req);

    // Get/increment counter
    const info = await store.increment(key);

    // Calculate max
    let max = options.max ?? 100;
    if (typeof max === "function") {
      max = await max(req);
    }

    // Calculate remaining
    const remaining = Math.max(0, max - info.totalHits);
    const resetSeconds = Math.ceil(
      (info.resetTime.getTime() - Date.now()) / 1000
    );

    // Set headers
    if (headers) {
      // Legacy headers
      if (legacyHeaders) {
        res.set("X-RateLimit-Limit", String(max));
        res.set("X-RateLimit-Remaining", String(remaining));
        res.set(
          "X-RateLimit-Reset",
          String(Math.ceil(info.resetTime.getTime() / 1000))
        );
      }

      // Standard draft-6/7 headers
      if (standardHeaders) {
        res.set("RateLimit-Limit", String(max));
        res.set("RateLimit-Remaining", String(remaining));
        res.set("RateLimit-Reset", String(resetSeconds));
      }
    }

    // Check if rate limited
    if (info.totalHits > max) {
      // Set Retry-After header
      res.set("Retry-After", String(resetSeconds));

      // Call custom handler
      return handler(req, res, next, options);
    }

    await next();
  };
}

/**
 * Create a slow-down middleware (delays instead of blocking)
 */
export function slowDown(
  options: {
    windowMs?: number;
    delayAfter?: number;
    delayMs?: number;
    maxDelayMs?: number;
    keyGenerator?: (req: Request) => string;
    skip?: (req: Request) => boolean;
  } = {}
): Middleware {
  const windowMs = options.windowMs || 60000;
  const delayAfter = options.delayAfter || 1;
  const delayMs = options.delayMs || 1000;
  const maxDelayMs = options.maxDelayMs || Infinity;
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;
  const skip = options.skip;

  const store = new MemoryStore(windowMs);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip && skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const info = await store.increment(key);

    if (info.totalHits > delayAfter) {
      const delay = Math.min(
        (info.totalHits - delayAfter) * delayMs,
        maxDelayMs
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    await next();
  };
}
