/**
 * ArcanaJS Middleware Engine
 *
 * Professional middleware system with ordering, composition, and async support.
 */

import type {
  ErrorMiddleware,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";

/**
 * Middleware options for fine-grained control
 */
export interface MiddlewareOptions {
  /** Execution priority (lower = earlier). Default: 100 */
  priority?: number;
  /** Conditional execution */
  condition?: (req: Request) => boolean | Promise<boolean>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Path pattern to match (optional) */
  path?: string;
  /** Name for debugging */
  name?: string;
}

/**
 * Internal middleware wrapper
 */
interface MiddlewareEntry {
  handler: Middleware | ErrorMiddleware;
  options: Required<Omit<MiddlewareOptions, "condition" | "path">> & {
    condition?: (req: Request) => boolean | Promise<boolean>;
    path?: string;
  };
  isErrorHandler: boolean;
}

/**
 * Middleware Engine - Manages middleware execution with advanced features
 */
export class MiddlewareEngine {
  private _middlewares: MiddlewareEntry[] = [];
  private _sorted = false;
  private _defaultTimeout = 30000; // 30 seconds

  /**
   * Add a middleware with optional configuration
   */
  use(middleware: Middleware, options?: MiddlewareOptions): this {
    this._middlewares.push({
      handler: middleware,
      options: {
        priority: options?.priority ?? 100,
        timeout: options?.timeout ?? this._defaultTimeout,
        name: options?.name ?? (middleware.name || "anonymous"),
        condition: options?.condition,
        path: options?.path,
      },
      isErrorHandler: middleware.length === 4,
    });
    this._sorted = false;
    return this;
  }

  /**
   * Add an error handler middleware
   */
  useError(handler: ErrorMiddleware, options?: MiddlewareOptions): this {
    this._middlewares.push({
      handler,
      options: {
        priority: options?.priority ?? 1000, // Error handlers run last
        timeout: options?.timeout ?? this._defaultTimeout,
        name: options?.name ?? (handler.name || "errorHandler"),
        condition: options?.condition,
        path: options?.path,
      },
      isErrorHandler: true,
    });
    this._sorted = false;
    return this;
  }

  /**
   * Set default timeout for all middlewares
   */
  setDefaultTimeout(ms: number): this {
    this._defaultTimeout = ms;
    return this;
  }

  /**
   * Get the number of registered middlewares
   */
  get count(): number {
    return this._middlewares.length;
  }

  /**
   * Execute middleware chain
   */
  async execute(
    req: Request,
    res: Response,
    done: NextFunction
  ): Promise<void> {
    if (!this._sorted) {
      this._sort();
    }

    let idx = 0;
    let currentError: any = null;

    const next: NextFunction = async (err?: any): Promise<void> => {
      if (err) {
        currentError = err;
      }

      if (idx >= this._middlewares.length) {
        return done(currentError);
      }

      const entry = this._middlewares[idx++];

      // Skip if condition fails
      if (entry.options.condition) {
        try {
          const shouldRun = await entry.options.condition(req);
          if (!shouldRun) {
            return next(currentError);
          }
        } catch (e) {
          return next(e);
        }
      }

      // Skip if path doesn't match
      if (
        entry.options.path &&
        !this._matchPath(req.path, entry.options.path)
      ) {
        return next(currentError);
      }

      try {
        if (currentError) {
          // Only run error handlers when there's an error
          if (entry.isErrorHandler) {
            await this._runWithTimeout(
              () =>
                (entry.handler as ErrorMiddleware)(
                  currentError,
                  req,
                  res,
                  next
                ),
              entry.options.timeout,
              entry.options.name
            );
            // Error was handled, clear it
            currentError = null;
          } else {
            // Skip non-error handlers when there's an error
            return next(currentError);
          }
        } else {
          // Only run non-error handlers when there's no error
          if (!entry.isErrorHandler) {
            await this._runWithTimeout(
              () => (entry.handler as Middleware)(req, res, next),
              entry.options.timeout,
              entry.options.name
            );
          } else {
            return next();
          }
        }
      } catch (e) {
        return next(e);
      }
    };

    await next();
  }

  /**
   * Compose all middlewares into a single middleware function
   */
  compose(): Middleware {
    if (!this._sorted) {
      this._sort();
    }

    return async (req: Request, res: Response, next: NextFunction) => {
      await this.execute(req, res, next);
    };
  }

  /**
   * Clear all middlewares
   */
  clear(): void {
    this._middlewares = [];
    this._sorted = false;
  }

  /**
   * Sort middlewares by priority
   */
  private _sort(): void {
    this._middlewares.sort((a, b) => a.options.priority - b.options.priority);
    this._sorted = true;
  }

  /**
   * Run a function with timeout
   */
  private async _runWithTimeout(
    fn: () => void | Promise<void>,
    timeout: number,
    name: string
  ): Promise<void> {
    if (timeout <= 0) {
      return fn();
    }

    return Promise.race([
      fn(),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Middleware "${name}" timed out after ${timeout}ms`)
          );
        }, timeout);
      }),
    ]);
  }

  /**
   * Simple path matching
   */
  private _matchPath(requestPath: string, pattern: string): boolean {
    if (pattern === "/" || pattern === "*") return true;
    return requestPath.startsWith(pattern);
  }
}

// ============================================================================
// Middleware Utilities
// ============================================================================

/**
 * Compose multiple middlewares into one
 */
export function compose(...middlewares: Middleware[]): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    let idx = 0;

    const dispatch = async (err?: any): Promise<void> => {
      if (err) {
        return next(err);
      }
      if (idx >= middlewares.length) {
        return next();
      }
      const middleware = middlewares[idx++];
      try {
        await middleware(req, res, dispatch);
      } catch (e) {
        return next(e);
      }
    };

    await dispatch();
  };
}

/**
 * Create a conditional middleware - only runs if condition is true
 */
export function unless(
  condition: (req: Request) => boolean,
  middleware: Middleware
): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (condition(req)) {
      return next();
    }
    return middleware(req, res, next);
  };
}

/**
 * Create a middleware that only runs if condition is true
 */
export function when(
  condition: (req: Request) => boolean,
  middleware: Middleware
): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!condition(req)) {
      return next();
    }
    return middleware(req, res, next);
  };
}

/**
 * Wrap a middleware with a timeout
 */
export function timeout(ms: number, middleware: Middleware): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Middleware timed out after ${ms}ms`)),
        ms
      );
    });

    try {
      await Promise.race([middleware(req, res, next), timeoutPromise]);
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Wrap a middleware to catch errors
 */
export function catchErrors(middleware: Middleware): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await middleware(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
