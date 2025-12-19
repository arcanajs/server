/**
 * ArcanaJS Debug Utilities
 *
 * Provides debug logging and development tools.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface DebugOptions {
  enabled?: boolean;
  prefix?: string;
  colors?: boolean;
}

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: COLORS.dim,
  info: COLORS.cyan,
  warn: COLORS.yellow,
  error: COLORS.red,
};

const METHOD_COLORS: Record<string, string> = {
  GET: COLORS.green,
  POST: COLORS.blue,
  PUT: COLORS.yellow,
  PATCH: COLORS.magenta,
  DELETE: COLORS.red,
  HEAD: COLORS.cyan,
  OPTIONS: COLORS.dim,
};

/**
 * Debug logger for ArcanaJS
 */
export class Debug {
  private enabled: boolean;
  private prefix: string;
  private colors: boolean;

  constructor(options: DebugOptions = {}) {
    this.enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    this.prefix = options.prefix ?? "[ArcanaJS]";
    this.colors = options.colors ?? true;
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.enabled) {
      this._log("debug", message, ...args);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    this._log("info", message, ...args);
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    this._log("warn", message, ...args);
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    this._log("error", message, ...args);
  }

  /**
   * Log an HTTP request
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    duration: number
  ): void {
    if (!this.enabled) return;

    const methodColor = METHOD_COLORS[method] || COLORS.dim;
    const statusColor =
      statusCode >= 500
        ? COLORS.red
        : statusCode >= 400
        ? COLORS.yellow
        : statusCode >= 300
        ? COLORS.cyan
        : COLORS.green;

    if (this.colors) {
      console.log(
        `${COLORS.dim}${this.prefix}${COLORS.reset} ` +
          `${methodColor}${method}${COLORS.reset} ` +
          `${path} ` +
          `${statusColor}${statusCode}${COLORS.reset} ` +
          `${COLORS.dim}${duration.toFixed(2)}ms${COLORS.reset}`
      );
    } else {
      console.log(
        `${this.prefix} ${method} ${path} ${statusCode} ${duration.toFixed(
          2
        )}ms`
      );
    }
  }

  /**
   * Time a function execution
   */
  async time<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      this.debug(`${label} took ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Enable debug mode
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable debug mode
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if debug is enabled
   */
  get isEnabled(): boolean {
    return this.enabled;
  }

  private _log(level: LogLevel, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const color = this.colors ? LEVEL_COLORS[level] : "";
    const reset = this.colors ? COLORS.reset : "";

    const formattedMessage = `${color}${this.prefix}${reset} ${message}`;

    switch (level) {
      case "debug":
        console.debug(formattedMessage, ...args);
        break;
      case "info":
        console.info(formattedMessage, ...args);
        break;
      case "warn":
        console.warn(formattedMessage, ...args);
        break;
      case "error":
        console.error(formattedMessage, ...args);
        break;
    }
  }
}

/**
 * Default debug instance
 */
export const debug = new Debug();

/**
 * Create a scoped debug instance
 */
export function createDebug(namespace: string): Debug {
  return new Debug({ prefix: `[ArcanaJS:${namespace}]` });
}

/**
 * Debug middleware - logs all requests
 */
export function debugMiddleware() {
  return async (req: any, res: any, next: any) => {
    const start = performance.now();

    // Store original end method to intercept response
    const originalSend = res.send.bind(res);
    res.send = async function (data: any) {
      const duration = performance.now() - start;
      debug.request(req.method, req.path, res.statusCode || 200, duration);
      return originalSend(data);
    };

    await next();
  };
}
