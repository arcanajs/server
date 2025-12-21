/**
 * ArcanaJS Debug Utilities
 *
 * Professional debug logging and development tools with enhanced formatting,
 * performance monitoring, and comprehensive error handling.
 *
 * 100% Compatible with Bun Runtime
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "trace";

export interface DebugOptions {
  enabled?: boolean;
  prefix?: string;
  colors?: boolean;
  timestamp?: boolean;
  level?: LogLevel;
  namespace?: string;
  structured?: boolean;
  performance?: boolean;
}

export interface PerformanceMetrics {
  label: string;
  duration: number;
  memory?: number;
  timestamp: string;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  namespace?: string;
  args?: any[];
  duration?: number;
  memory?: number;
}

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  inverse: "\x1b[7m",
  strikethrough: "\x1b[9m",
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

const LEVEL_COLORS: Record<LogLevel | "success", string> = {
  trace: COLORS.gray,
  debug: COLORS.dim,
  info: COLORS.blue,
  success: COLORS.green,
  warn: COLORS.yellow + COLORS.bright,
  error: COLORS.brightRed + COLORS.bright,
};

const METHOD_COLORS: Record<string, string> = {
  GET: COLORS.brightGreen + COLORS.bright,
  POST: COLORS.brightBlue + COLORS.bright,
  PUT: COLORS.brightYellow + COLORS.bright,
  PATCH: COLORS.brightMagenta + COLORS.bright,
  DELETE: COLORS.brightRed + COLORS.bright,
  HEAD: COLORS.brightCyan + COLORS.bright,
  OPTIONS: COLORS.gray,
  CONNECT: COLORS.green,
  TRACE: COLORS.magenta,
};

const STATUS_COLORS: Record<number, string> = {
  200: COLORS.brightGreen,
  201: COLORS.brightGreen,
  204: COLORS.brightGreen,
  301: COLORS.brightYellow,
  302: COLORS.brightYellow,
  304: COLORS.brightYellow,
  400: COLORS.brightRed,
  401: COLORS.brightRed,
  403: COLORS.brightRed,
  404: COLORS.brightRed,
  500: COLORS.brightRed + COLORS.bgRed,
  502: COLORS.brightRed + COLORS.bgRed,
  503: COLORS.brightRed + COLORS.bgRed,
};

/**
 * Get memory usage with Bun compatibility
 */
function getMemoryUsage() {
  // Bun uses Bun.gc() and process.memoryUsage()
  if (typeof Bun !== "undefined") {
    // Force garbage collection to get accurate reading
    if (typeof Bun.gc === "function") {
      Bun.gc(false); // Non-blocking GC
    }
  }
  return process.memoryUsage();
}

/**
 * Professional Debug logger for ArcanaJS with enhanced features
 */
export class Debug {
  private enabled: boolean;
  private prefix: string;
  private colors: boolean;
  private timestamp: boolean;
  private level: LogLevel;
  private namespace?: string;
  private structured: boolean;
  private performance: boolean;
  private history: LogEntry[] = [];
  private maxHistorySize: number = 1000;

  constructor(options: DebugOptions = {}) {
    this.enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    this.prefix = options.prefix ?? "[ArcanaJS]";
    this.colors = options.colors ?? true;
    this.timestamp = options.timestamp ?? true;
    this.level = options.level ?? "info";
    this.namespace = options.namespace;
    this.structured = options.structured ?? false;
    this.performance = options.performance ?? true;
  }

  /**
   * Log a trace message (most verbose)
   */
  trace(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("trace")) {
      this._log("trace", message, ...args);
    }
  }

  /**
   * Log a debug message
   */
  debug(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("debug")) {
      this._log("debug", message, ...args);
    }
  }

  /**
   * Log an info message
   */
  info(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("info")) {
      this._log("info", message, ...args);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("warn")) {
      this._log("warn", message, ...args);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("error")) {
      this._log("error", message, ...args);
    }
  }

  /**
   * Log success message (alias for info with green styling)
   */
  success(message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog("info")) {
      this._log("success", message, ...args);
    }
  }

  /**
   * Log with custom level
   */
  log(level: LogLevel, message: string, ...args: any[]): void {
    if (this.enabled && this._shouldLog(level)) {
      this._log(level, message, ...args);
    }
  }

  /**
   * Log an HTTP request with enhanced formatting
   */
  request(
    method: string,
    path: string,
    statusCode: number,
    duration?: number,
    userAgent?: string,
    ip?: string,
    memory?: string
  ): void {
    if (!this.enabled) return;

    const methodColor = METHOD_COLORS[method] || COLORS.dim;
    const statusColor =
      STATUS_COLORS[statusCode] ||
      (statusCode >= 500
        ? COLORS.brightRed + COLORS.bgRed
        : statusCode >= 400
        ? COLORS.brightRed
        : statusCode >= 300
        ? COLORS.brightYellow
        : COLORS.brightGreen);

    const timestamp = this.timestamp ? this._formatTimestamp() : "";

    if (this.structured) {
      const logData: any = {
        type: "request",
        method,
        path,
        statusCode,
      };

      if (this.timestamp) {
        logData.timestamp = timestamp;
      }

      if (duration !== undefined) {
        logData.duration = `${duration.toFixed(2)}ms`;
      }

      if (userAgent !== undefined) {
        logData.userAgent = userAgent;
      }

      if (ip !== undefined) {
        logData.ip = ip;
      }

      if (memory !== undefined) {
        logData.memory = memory;
      }

      console.log(JSON.stringify(logData, null, 2));
      return;
    }

    const parts = [];

    if (this.timestamp) {
      parts.push(`${COLORS.dim}${timestamp}${COLORS.reset}`);
    }

    parts.push(`${COLORS.dim}${this.prefix}${COLORS.reset}`);
    parts.push(`${methodColor}${method}${COLORS.reset}`);
    parts.push(path);
    parts.push(`${statusColor}${statusCode}${COLORS.reset}`);

    if (duration !== undefined) {
      parts.push(`${COLORS.cyan}${duration.toFixed(2)}ms${COLORS.reset}`);
    }

    if (userAgent !== undefined) {
      parts.push(
        `${COLORS.dim}${userAgent.slice(0, 50)}${
          userAgent.length > 50 ? "..." : ""
        }${COLORS.reset}`
      );
    }

    if (ip !== undefined) {
      parts.push(`${COLORS.magenta}${ip}${COLORS.reset}`);
    }

    if (memory !== undefined) {
      parts.push(`${COLORS.yellow}${memory}${COLORS.reset}`);
    }

    console.log(parts.join(" "));
  }

  /**
   * Time a function execution with enhanced metrics
   */
  async time<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
    const start = performance.now();
    const startMemory = this.performance ? getMemoryUsage() : null;

    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      const endMemory = this.performance ? getMemoryUsage() : null;
      const memoryDiff =
        startMemory && endMemory
          ? `${(
              (endMemory.heapUsed - startMemory.heapUsed) /
              1024 /
              1024
            ).toFixed(2)}MB`
          : "";

      this.debug(`${label} completed`, {
        duration: `${duration.toFixed(2)}ms`,
        memory: memoryDiff,
        timestamp: this._formatTimestamp(),
      });
    }
  }

  /**
   * Create a performance timer
   */
  createTimer(label: string): () => PerformanceMetrics {
    const start = performance.now();
    const startMemory = this.performance ? getMemoryUsage() : null;

    return (): PerformanceMetrics => {
      const duration = performance.now() - start;
      const endMemory = this.performance ? getMemoryUsage() : null;
      const memoryDiff =
        startMemory && endMemory
          ? (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024
          : 0;

      const metrics: PerformanceMetrics = {
        label,
        duration,
        memory: memoryDiff,
        timestamp: this._formatTimestamp(),
      };

      this.debug(`Timer: ${label}`, metrics);
      return metrics;
    };
  }

  /**
   * Group related logs
   */
  group(label: string, fn: () => void): void {
    if (!this.enabled) return;

    console.group(`${COLORS.cyan}${this.prefix} ${label}${COLORS.reset}`);
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Group related logs (collapsed)
   */
  groupCollapsed(label: string, fn: () => void): void {
    if (!this.enabled) return;

    console.groupCollapsed(
      `${COLORS.cyan}${this.prefix} ${label}${COLORS.reset}`
    );
    try {
      fn();
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Create a table from data
   */
  table(data: any[], columns?: string[]): void {
    if (!this.enabled) return;

    console.table(data, columns);
  }

  /**
   * Clear the console
   */
  clear(): void {
    if (!this.enabled) return;

    console.clear();
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

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Get log history
   */
  getHistory(): LogEntry[] {
    return [...this.history];
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Export logs to JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Create child logger with namespace
   */
  child(namespace: string): Debug {
    return new Debug({
      enabled: this.enabled,
      prefix: this.prefix,
      colors: this.colors,
      timestamp: this.timestamp,
      level: this.level,
      namespace: this.namespace ? `${this.namespace}:${namespace}` : namespace,
      structured: this.structured,
      performance: this.performance,
    });
  }

  private _log(
    level: LogLevel | "success",
    message: string,
    ...args: any[]
  ): void {
    const timestamp = this._formatTimestamp();
    const namespace = this.namespace ? `[${this.namespace}]` : "";
    const color = this.colors ? LEVEL_COLORS[level] : "";
    const reset = this.colors ? COLORS.reset : "";

    // Store in history
    const logEntry: LogEntry = {
      level: level as LogLevel,
      message,
      timestamp,
      namespace: this.namespace,
      args: args.length > 0 ? args : undefined,
    };

    this._addToHistory(logEntry);

    if (this.structured) {
      const logData: any = {
        level,
        message,
        timestamp,
        namespace: this.namespace,
      };

      if (args.length > 0) {
        logData.args = args;
      }

      if (this.performance) {
        logData.memory = this._getMemoryInfo();
      }

      console.log(JSON.stringify(logData, null, 2));
      return;
    }

    const parts = [];

    if (this.timestamp) {
      parts.push(`${COLORS.dim}${timestamp}${COLORS.reset}`);
    }

    parts.push(`${color}${this.prefix}${namespace}${reset}`);
    parts.push(message);

    const formattedMessage = parts.join(" ");

    switch (level) {
      case "trace":
        console.debug(formattedMessage, ...args);
        break;
      case "debug":
        console.debug(formattedMessage, ...args);
        break;
      case "info":
      case "success":
        console.info(formattedMessage, ...args);
        break;
      case "warn":
        console.warn(formattedMessage, ...args);
        break;
      case "error":
        console.error(formattedMessage, ...args);
        break;
      default:
        console.log(formattedMessage, ...args);
        break;
    }
  }

  private _shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["trace", "debug", "info", "warn", "error"];
    const currentLevelIndex = levels.indexOf(this.level);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  private _addToHistory(entry: LogEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  private _formatTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  private _getMemoryInfo(): string {
    const usage = getMemoryUsage();
    return `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`;
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
 * Enhanced debug middleware - logs all requests with comprehensive metrics
 * Fully compatible with Bun runtime with accurate memory tracking
 */
export function debugMiddleware(options?: {
  colors?: boolean;
  timestamp?: boolean;
  performance?: boolean;
  userAgent?: boolean;
  ip?: boolean;
  memoryMode?: "accurate" | "fast" | "disabled";
}) {
  // Default all options to true if not provided
  const config = {
    colors: options?.colors ?? true,
    timestamp: options?.timestamp ?? true,
    performance: options?.performance ?? true,
    userAgent: options?.userAgent ?? true,
    ip: options?.ip ?? true,
    memoryMode: options?.memoryMode ?? "fast",
  };

  const middlewareDebug = new Debug({
    prefix: "[ArcanaJS:Middleware]",
    colors: config.colors,
    timestamp: config.timestamp,
    performance: config.performance,
  });

  // Track baseline memory for relative measurements
  let baselineMemory = 0;
  let isInitialized = false;

  // Initialize baseline after first request stabilizes
  const initializeBaseline = async () => {
    if (isInitialized) return;

    // Wait for system to stabilize
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
      Bun.gc(true); // Force blocking GC for accurate baseline
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    baselineMemory = getMemoryUsage().heapUsed;
    isInitialized = true;
  };

  return async (req: any, res: any, next: any) => {
    // Initialize baseline on first request
    if (
      !isInitialized &&
      config.performance &&
      config.memoryMode !== "disabled"
    ) {
      await initializeBaseline();
    }

    // Capture start time immediately
    const start = performance.now();

    // Capture initial memory state based on mode
    let startMemory = null;
    if (config.performance && config.memoryMode !== "disabled") {
      startMemory = getMemoryUsage().heapUsed;
    }

    // Store original methods to intercept response
    const originalSend = res.send?.bind(res);
    const originalEnd = res.end?.bind(res);
    const originalWrite = res.write?.bind(res);

    let responseData: any;
    let responseSize = 0;
    let logged = false;

    const logRequest = () => {
      if (logged) return;
      logged = true;

      const duration = performance.now() - start;

      // Calculate memory after request processing
      let memoryValue = undefined;
      if (
        config.performance &&
        config.memoryMode !== "disabled" &&
        startMemory !== null
      ) {
        const currentMemory = getMemoryUsage().heapUsed;
        const memoryDiff = (currentMemory - startMemory) / 1024 / 1024;

        // Different strategies based on mode
        if (config.memoryMode === "accurate") {
          // Accurate mode: Only show if significant growth
          if (memoryDiff > 0.5) {
            memoryValue = `+${memoryDiff.toFixed(2)}MB`;
          } else if (memoryDiff < -0.5) {
            memoryValue = `${memoryDiff.toFixed(2)}MB`;
          } else {
            memoryValue = "~0.00MB";
          }
        } else {
          // Fast mode: Show all changes, use ~ for small values
          if (Math.abs(memoryDiff) < 0.1) {
            memoryValue = "~0.00MB";
          } else if (Math.abs(memoryDiff) < 1) {
            memoryValue = `~${memoryDiff.toFixed(2)}MB`;
          } else {
            memoryValue =
              memoryDiff >= 0
                ? `+${memoryDiff.toFixed(2)}MB`
                : `${memoryDiff.toFixed(2)}MB`;
          }
        }
      }

      const durationValue = config.performance ? duration : undefined;
      const userAgentValue = config.userAgent
        ? req.headers.get("user-agent")
        : undefined;
      const ipValue =
        config.ip && req.app?.server
          ? req.app.server.requestIP(req._nativeRequest)?.address
          : undefined;

      middlewareDebug.request(
        req.method,
        req.path,
        res.statusCode || 200,
        durationValue,
        userAgentValue,
        ipValue,
        memoryValue
      );
    };

    res.send = function (data: any) {
      responseData = data;
      logRequest();
      return originalSend?.(data);
    };

    res.end = function (data: any) {
      if (!responseData && data) {
        responseData = data;
      }
      logRequest();
      return originalEnd?.(data);
    };

    res.write = function (chunk: any) {
      if (chunk) {
        responseSize += Buffer.byteLength(chunk);
      }
      return originalWrite?.(chunk);
    };

    await next();
  };
}

/**
 * Performance monitoring middleware
 */
export function performanceMiddleware(options?: {
  threshold?: number;
  logSlowQueries?: boolean;
}) {
  const perfDebug = new Debug({
    prefix: "[ArcanaJS:Performance]",
    colors: true,
    timestamp: true,
    performance: true,
  });

  const threshold = options?.threshold ?? 1000;

  return async (req: any, res: any, next: any) => {
    const start = performance.now();
    const startMemory = getMemoryUsage();

    const originalEnd = res.end.bind(res);
    res.end = function (data: any) {
      const duration = performance.now() - start;
      const endMemory = getMemoryUsage();
      const memoryDiff =
        (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

      if (duration > threshold || options?.logSlowQueries) {
        perfDebug.warn("Slow request detected", {
          method: req.method,
          path: req.path,
          duration: `${duration.toFixed(2)}ms`,
          memory: `${memoryDiff.toFixed(2)}MB`,
          statusCode: res.statusCode,
        });
      }

      return originalEnd(data);
    };

    await next();
  };
}

/**
 * Global debug utilities
 */
export const logger = {
  /**
   * Get system information
   */
  systemInfo(): void {
    const sysDebug = new Debug({ prefix: "[ArcanaJS:System]" });
    const isBun = typeof Bun !== "undefined";

    sysDebug.info("System Information", {
      runtime: isBun ? `Bun ${Bun.version}` : `Node ${process.version}`,
      platform: process.platform,
      arch: process.arch,
      memory: getMemoryUsage(),
      uptime: `${(process.uptime() / 60).toFixed(2)}min`,
      pid: process.pid,
    });
  },

  /**
   * Get memory usage in a formatted way
   */
  memoryUsage(): void {
    const memDebug = new Debug({ prefix: "[ArcanaJS:Memory]" });
    const usage = getMemoryUsage();

    memDebug.info("Memory Usage", {
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)}MB`,
    });
  },

  /**
   * Log application startup information
   */
  startup(appName: string, version?: string): void {
    const startupDebug = new Debug({ prefix: "[ArcanaJS:Startup]" });
    const isBun = typeof Bun !== "undefined";

    startupDebug.success(
      `${appName} ${version ? `v${version}` : ""} started successfully`,
      {
        timestamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
        runtime: isBun ? `Bun ${Bun.version}` : `Node ${process.version}`,
        environment: process.env.NODE_ENV || "development",
      }
    );
  },
};

/**
 * Color utilities for custom formatting
 */
export const colors = COLORS;

/**
 * Predefined log levels for easy access
 */
export const LOG_LEVELS = {
  TRACE: "trace" as LogLevel,
  DEBUG: "debug" as LogLevel,
  INFO: "info" as LogLevel,
  WARN: "warn" as LogLevel,
  ERROR: "error" as LogLevel,
} as const;
