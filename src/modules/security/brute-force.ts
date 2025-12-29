/**
 * ArcanaJS Brute Force Protection
 *
 * Protects against brute force attacks with login attempt limiting,
 * progressive delays, and account lockout support.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Brute Force Protection Options
 */
export interface BruteForceOptions {
  /** Maximum attempts before blocking. Default: 5 */
  maxAttempts?: number;

  /** Time window in milliseconds. Default: 900000 (15 minutes) */
  windowMs?: number;

  /** Block duration in milliseconds. Default: 900000 (15 minutes) */
  blockDuration?: number;

  /** Key generator (e.g., IP + username combo) */
  keyGenerator?: (req: Request) => string | Promise<string>;

  /** Function to determine if request is a failed login attempt */
  isFailedAttempt?: (req: Request, res: Response) => boolean | Promise<boolean>;

  /** Function to extract username for enumeration protection */
  getUsername?: (req: Request) => string | undefined;

  /** Enable progressive delay. Default: true */
  progressiveDelay?: boolean;

  /** Initial delay in milliseconds for progressive delay. Default: 1000 */
  initialDelay?: number;

  /** Maximum delay in milliseconds. Default: 30000 */
  maxDelay?: number;

  /** Delay multiplier for each attempt. Default: 2 */
  delayMultiplier?: number;

  /** Custom handler when blocked */
  onBlocked?: (
    req: Request,
    res: Response,
    next: NextFunction,
    attemptsInfo: AttemptsInfo
  ) => void | Promise<void>;

  /** Skip for certain requests */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /** Store for distributed environments */
  store?: BruteForceStore;

  /** Enable logging of blocked attempts */
  log?: boolean | ((info: AttemptsInfo, req: Request) => void);

  /** Trust proxy headers for IP */
  trustProxy?: boolean;
}

/**
 * Attempts information
 */
export interface AttemptsInfo {
  /** Key used for tracking */
  key: string;
  /** Number of failed attempts */
  attempts: number;
  /** Whether currently blocked */
  blocked: boolean;
  /** When the block expires (if blocked) */
  blockedUntil?: Date;
  /** Time remaining until unblock (ms) */
  remainingMs?: number;
  /** Recommended delay (ms) */
  delay?: number;
}

/**
 * Store interface for brute force tracking
 */
export interface BruteForceStore {
  /** Get current attempts for a key */
  get(key: string): Promise<AttemptsInfo | null>;

  /** Increment attempts for a key */
  increment(key: string, windowMs: number): Promise<AttemptsInfo>;

  /** Reset attempts for a key */
  reset(key: string): Promise<void>;

  /** Block a key */
  block(key: string, durationMs: number): Promise<void>;

  /** Check if key is blocked */
  isBlocked(key: string): Promise<boolean>;

  /** Cleanup expired entries */
  cleanup?(): Promise<void>;
}

/**
 * In-memory brute force store
 */
class MemoryBruteForceStore implements BruteForceStore {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private blocks = new Map<string, number>();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor() {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  async get(key: string): Promise<AttemptsInfo | null> {
    const now = Date.now();

    // Check if blocked
    const blockedUntil = this.blocks.get(key);
    if (blockedUntil) {
      if (blockedUntil > now) {
        return {
          key,
          attempts: 0,
          blocked: true,
          blockedUntil: new Date(blockedUntil),
          remainingMs: blockedUntil - now,
        };
      }
      this.blocks.delete(key);
    }

    const record = this.attempts.get(key);
    if (!record || record.resetTime <= now) {
      return null;
    }

    return {
      key,
      attempts: record.count,
      blocked: false,
    };
  }

  async increment(key: string, windowMs: number): Promise<AttemptsInfo> {
    const now = Date.now();

    // Check if blocked
    const blockedUntil = this.blocks.get(key);
    if (blockedUntil && blockedUntil > now) {
      return {
        key,
        attempts: 0,
        blocked: true,
        blockedUntil: new Date(blockedUntil),
        remainingMs: blockedUntil - now,
      };
    }

    let record = this.attempts.get(key);

    if (!record || record.resetTime <= now) {
      record = { count: 1, resetTime: now + windowMs };
    } else {
      record.count++;
    }

    this.attempts.set(key, record);

    return {
      key,
      attempts: record.count,
      blocked: false,
    };
  }

  async reset(key: string): Promise<void> {
    this.attempts.delete(key);
    this.blocks.delete(key);
  }

  async block(key: string, durationMs: number): Promise<void> {
    this.blocks.set(key, Date.now() + durationMs);
    this.attempts.delete(key);
  }

  async isBlocked(key: string): Promise<boolean> {
    const blockedUntil = this.blocks.get(key);
    if (!blockedUntil) return false;

    if (blockedUntil <= Date.now()) {
      this.blocks.delete(key);
      return false;
    }

    return true;
  }

  async cleanup(): Promise<void> {
    const now = Date.now();

    for (const [key, record] of this.attempts.entries()) {
      if (record.resetTime <= now) {
        this.attempts.delete(key);
      }
    }

    for (const [key, blockedUntil] of this.blocks.entries()) {
      if (blockedUntil <= now) {
        this.blocks.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.attempts.clear();
    this.blocks.clear();
  }
}

/**
 * Default key generator (IP-based)
 */
function defaultKeyGenerator(req: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.ip || "unknown";
}

/**
 * Calculate progressive delay
 */
function calculateDelay(
  attempts: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  if (attempts <= 0) return 0;

  const delay = initialDelay * Math.pow(multiplier, attempts - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Default blocked handler
 */
async function defaultOnBlocked(
  _req: Request,
  res: Response,
  _next: NextFunction,
  info: AttemptsInfo
): Promise<void> {
  res.status(429);

  const retryAfter = info.remainingMs ? Math.ceil(info.remainingMs / 1000) : 60;

  res.set("Retry-After", String(retryAfter));

  await res.json({
    error: "Too Many Requests",
    message: "Too many failed attempts. Please try again later.",
    retryAfter,
    code: "BRUTE_FORCE_BLOCKED",
  });
}

/**
 * Create brute force protection middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { bruteForce } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Protect login endpoint
 * app.post('/login', bruteForce({
 *   maxAttempts: 5,
 *   windowMs: 15 * 60 * 1000, // 15 minutes
 *   keyGenerator: (req) => `login:${req.ip}:${req.body?.email}`,
 * }), async (req, res) => {
 *   // Handle login
 *   // On success, reset attempts: req.bruteForceReset?.()
 * });
 * ```
 */
export function bruteForce(options: BruteForceOptions = {}): Middleware {
  const maxAttempts = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 900000; // 15 minutes
  const blockDuration = options.blockDuration ?? 900000; // 15 minutes
  const store = options.store ?? new MemoryBruteForceStore();
  const onBlocked = options.onBlocked ?? defaultOnBlocked;
  const progressiveDelay = options.progressiveDelay ?? true;
  const initialDelay = options.initialDelay ?? 1000;
  const maxDelay = options.maxDelay ?? 30000;
  const delayMultiplier = options.delayMultiplier ?? 2;
  const trustProxy = options.trustProxy ?? false;
  const log = options.log;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (options.skip) {
      const shouldSkip = await options.skip(req);
      if (shouldSkip) {
        return next();
      }
    }

    // Generate key
    const key = options.keyGenerator
      ? await options.keyGenerator(req)
      : defaultKeyGenerator(req, trustProxy);

    // Check if blocked
    const info = await store.get(key);
    if (info?.blocked) {
      if (log) {
        if (typeof log === "function") {
          log(info, req);
        } else {
          console.warn(`[BruteForce] Blocked request from key: ${key}`);
        }
      }
      return onBlocked(req, res, next, info);
    }

    // Attach reset function to request
    (req as any).bruteForceReset = async () => {
      await store.reset(key);
    };

    // Attach info getter
    (req as any).bruteForceInfo = async () => {
      return store.get(key);
    };

    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    let responseSent = false;

    const handleResponse = async () => {
      if (responseSent) return;
      responseSent = true;

      // Check if this was a failed attempt
      const isFailed = options.isFailedAttempt
        ? await options.isFailedAttempt(req, res)
        : res.statusCode === 401 || res.statusCode === 403;

      if (isFailed) {
        const newInfo = await store.increment(key, windowMs);

        // Apply progressive delay
        if (progressiveDelay && newInfo.attempts > 0) {
          const delay = calculateDelay(
            newInfo.attempts,
            initialDelay,
            maxDelay,
            delayMultiplier
          );
          if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        // Check if should block
        if (newInfo.attempts >= maxAttempts) {
          await store.block(key, blockDuration);

          if (log) {
            const blockInfo: AttemptsInfo = {
              key,
              attempts: newInfo.attempts,
              blocked: true,
              blockedUntil: new Date(Date.now() + blockDuration),
              remainingMs: blockDuration,
            };

            if (typeof log === "function") {
              log(blockInfo, req);
            } else {
              console.warn(
                `[BruteForce] Blocking key: ${key} after ${newInfo.attempts} attempts`
              );
            }
          }
        }
      }
    };

    // Intercept response methods
    res.json = async (data: any) => {
      await handleResponse();
      return originalJson(data);
    };

    res.send = async (data: any) => {
      await handleResponse();
      return originalSend(data);
    };

    res.end = async (data?: any) => {
      await handleResponse();
      return originalEnd(data);
    };

    await next();
  };
}

/**
 * Create login protection middleware with username tracking
 */
export function loginProtection(
  options: {
    maxAttempts?: number;
    windowMs?: number;
    blockDuration?: number;
    usernameField?: string;
    trustProxy?: boolean;
    store?: BruteForceStore;
  } = {}
): Middleware {
  const usernameField = options.usernameField ?? "email";

  return bruteForce({
    maxAttempts: options.maxAttempts ?? 5,
    windowMs: options.windowMs ?? 900000,
    blockDuration: options.blockDuration ?? 900000,
    store: options.store,
    trustProxy: options.trustProxy,
    keyGenerator: (req) => {
      const ip = req.ip || "unknown";
      const username = req.body?.[usernameField] || "";
      // Combine IP and username for more granular protection
      return `login:${ip}:${username.toLowerCase()}`;
    },
    isFailedAttempt: (_req, res) => {
      return res.statusCode === 401 || res.statusCode === 403;
    },
  });
}

/**
 * Create API protection middleware
 */
export function apiProtection(
  options: {
    maxAttempts?: number;
    windowMs?: number;
    blockDuration?: number;
    trustProxy?: boolean;
    store?: BruteForceStore;
  } = {}
): Middleware {
  return bruteForce({
    maxAttempts: options.maxAttempts ?? 100,
    windowMs: options.windowMs ?? 60000, // 1 minute
    blockDuration: options.blockDuration ?? 300000, // 5 minutes
    store: options.store,
    trustProxy: options.trustProxy,
    progressiveDelay: false, // Faster for APIs
    isFailedAttempt: (_req, res) => {
      return res.statusCode >= 400;
    },
  });
}

/**
 * Create password reset protection
 */
export function passwordResetProtection(
  options: {
    maxAttempts?: number;
    windowMs?: number;
    blockDuration?: number;
    emailField?: string;
    store?: BruteForceStore;
  } = {}
): Middleware {
  const emailField = options.emailField ?? "email";

  return bruteForce({
    maxAttempts: options.maxAttempts ?? 3,
    windowMs: options.windowMs ?? 3600000, // 1 hour
    blockDuration: options.blockDuration ?? 3600000, // 1 hour
    store: options.store,
    keyGenerator: (req) => {
      const email = req.body?.[emailField] || "";
      return `password-reset:${email.toLowerCase()}`;
    },
    // Always treat as success to prevent email enumeration
    isFailedAttempt: () => true,
  });
}

/**
 * Utility: Create a Redis-compatible store adapter
 */
export function createRedisStore(client: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { EX?: number }) => Promise<any>;
  del: (key: string) => Promise<any>;
}): BruteForceStore {
  const prefix = "bruteforce:";

  return {
    async get(key: string): Promise<AttemptsInfo | null> {
      const data = await client.get(prefix + key);
      if (!data) return null;

      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    },

    async increment(key: string, windowMs: number): Promise<AttemptsInfo> {
      const existing = await this.get(key);
      const attempts = (existing?.attempts ?? 0) + 1;

      const info: AttemptsInfo = {
        key,
        attempts,
        blocked: false,
      };

      await client.set(prefix + key, JSON.stringify(info), {
        EX: Math.ceil(windowMs / 1000),
      });

      return info;
    },

    async reset(key: string): Promise<void> {
      await client.del(prefix + key);
      await client.del(prefix + "block:" + key);
    },

    async block(key: string, durationMs: number): Promise<void> {
      const info: AttemptsInfo = {
        key,
        attempts: 0,
        blocked: true,
        blockedUntil: new Date(Date.now() + durationMs),
        remainingMs: durationMs,
      };

      await client.set(prefix + "block:" + key, JSON.stringify(info), {
        EX: Math.ceil(durationMs / 1000),
      });
      await client.del(prefix + key);
    },

    async isBlocked(key: string): Promise<boolean> {
      const data = await client.get(prefix + "block:" + key);
      return data !== null;
    },
  };
}
