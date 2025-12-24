/**
 * ArcanaJS Layer
 */

import type { ErrorMiddleware, HttpMethod, Middleware } from "../../types";
import type { RouteConstraints } from "./router";

/**
 * Layer configuration options
 */
export interface LayerOptions {
  /** Route path pattern */
  path: string;
  /** HTTP method */
  method: HttpMethod;
  /** Route handler */
  handler: Middleware | ErrorMiddleware;
  /** Parameter constraints */
  constraints?: RouteConstraints;
  /** Route metadata */
  metadata?: Record<string, any>;
  /** Enable route caching */
  cache?: boolean;
}

/**
 * Parameter extraction result
 */
export interface ParameterExtraction {
  /** Extracted parameters */
  params: Record<string, string>;
  /** Whether all required parameters were found */
  valid: boolean;
  /** Missing required parameters */
  missing?: string[];
}

/**
 * Layer - Represents a single route or middleware in the stack
 */
export class Layer {
  // Core properties
  public readonly method: HttpMethod;
  public readonly path: string;
  public readonly handler: Middleware | ErrorMiddleware;
  public readonly constraints?: RouteConstraints;
  public readonly metadata: Record<string, any>;

  // Pattern matching
  private readonly _regexp: RegExp;
  private readonly _keys: string[] = [];
  private readonly _optional: Set<string> = new Set();
  private readonly _fastPath: boolean;

  // Performance
  private _matchCache?: Map<string, boolean>;
  private _paramsCache?: Map<string, Record<string, string>>;
  private readonly _cacheEnabled: boolean;
  private _hitCount: number = 0;
  private _missCount: number = 0;

  constructor(options: LayerOptions);
  constructor(
    path: string,
    method: HttpMethod,
    handler: Middleware | ErrorMiddleware,
    constraints?: RouteConstraints
  );
  constructor(
    pathOrOptions: string | LayerOptions,
    method?: HttpMethod,
    handler?: Middleware | ErrorMiddleware,
    constraints?: RouteConstraints
  ) {
    // Handle both constructor signatures
    if (typeof pathOrOptions === "object") {
      const options = pathOrOptions;
      this.path = options.path;
      this.method = options.method;
      this.handler = options.handler;
      this.constraints = options.constraints;
      this.metadata = options.metadata || {};
      this._cacheEnabled = options.cache ?? true;
    } else {
      this.path = pathOrOptions;
      this.method = method!;
      this.handler = handler!;
      this.constraints = constraints;
      this.metadata = {};
      this._cacheEnabled = true;
    }

    // Initialize caches if enabled
    if (this._cacheEnabled) {
      this._matchCache = new Map();
      this._paramsCache = new Map();
    }

    // Check for fast paths
    this._fastPath = this.path === "*" || this.path === "/" || this.path === "";

    // Build regex pattern
    this._regexp = this._buildPattern();

    // Store creation timestamp
    this.metadata.createdAt = Date.now();
  }

  /**
   * Build regex pattern for route matching
   */
  private _buildPattern(): RegExp {
    if (this._fastPath) {
      return /^.*$/; // Match everything for wildcards
    }

    let pattern = this.path
      .replace(/\//g, "\\/")
      .replace(
        /:(\w+)(<([^>]+)>)?(\?)?/g,
        (
          match,
          name: string,
          constraintMatch: string,
          constraint: string,
          optional: string
        ) => {
          this._keys.push(name);

          if (optional) {
            this._optional.add(name);
          }

          // Use constraint pattern if provided
          const regex = constraint || "[^\\/]+";

          return optional
            ? `(?:(?<${name}>${regex}))?`
            : `(?<${name}>${regex})`;
        }
      )
      .replace(/\*\*/g, "(?<catchAll>.*)")
      .replace(/(?<!\*)\*(?!\*)/g, "(?<wildcard>[^\\/]+)");

    // Handle USE middleware - match prefixes
    if (
      this.method === "USE" &&
      !this.path.endsWith("/") &&
      this.path !== "*"
    ) {
      pattern = pattern + "(?:\\/.*)?";
    }

    return new RegExp(
      `^${pattern}${this._fastPath || this.path === "*" ? "" : "$"}`,
      "i"
    );
  }

  /**
   * Check if this layer matches the given path
   */
  match(path: string): boolean {
    // Check cache first
    if (this._matchCache?.has(path)) {
      this._hitCount++;
      return this._matchCache.get(path)!;
    }

    let matches: boolean;

    // Fast path checks
    if (this._fastPath) {
      if (this.path === "*") {
        matches = true;
      } else if (this.path === "/" || this.path === "") {
        matches = path === "/";
      } else {
        matches = this._regexp.test(path);
      }
    }
    // USE middleware can match prefixes
    else if (this.method === "USE") {
      matches = path.startsWith(this.path) || this._regexp.test(path);
    }
    // Regular route matching
    else {
      matches = this._regexp.test(path);
    }

    // Update cache
    if (this._matchCache) {
      this._matchCache.set(path, matches);

      // Prevent cache from growing too large
      if (this._matchCache.size > 1000) {
        const firstKey = this._matchCache.keys().next().value;
        if (firstKey !== undefined) {
          this._matchCache.delete(firstKey);
        }
      }
    }

    if (matches) {
      this._hitCount++;
    } else {
      this._missCount++;
    }

    return matches;
  }

  /**
   * Extract parameters from the path
   */
  params(path: string): Record<string, string> {
    // Check cache
    if (this._paramsCache?.has(path)) {
      return this._paramsCache.get(path)!;
    }

    const match = this._regexp.exec(path);
    if (!match) {
      return {};
    }

    const params: Record<string, string> = {};

    // Use named groups (preferred)
    if (match.groups) {
      for (const [key, value] of Object.entries(match.groups)) {
        if (value !== undefined) {
          // Decode URI components
          try {
            params[key] = decodeURIComponent(value);
          } catch {
            params[key] = value;
          }
        }
      }
    }
    // Fallback to indexed groups
    else {
      this._keys.forEach((key, i) => {
        if (match[i + 1] !== undefined) {
          try {
            params[key] = decodeURIComponent(match[i + 1]);
          } catch {
            params[key] = match[i + 1];
          }
        }
      });
    }

    // Update cache
    if (this._paramsCache) {
      this._paramsCache.set(path, params);

      // Prevent cache from growing too large
      if (this._paramsCache.size > 1000) {
        const firstKey = this._paramsCache.keys().next().value;
        if (firstKey !== undefined) {
          this._paramsCache.delete(firstKey);
        }
      }
    }

    return params;
  }

  /**
   * Extract parameters with validation
   */
  extractParams(path: string): ParameterExtraction {
    const params = this.params(path);
    const missing: string[] = [];

    // Check for missing required parameters
    for (const key of this._keys) {
      if (!this._optional.has(key) && params[key] === undefined) {
        missing.push(key);
      }
    }

    return {
      params,
      valid: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
    };
  }

  /**
   * Validate extracted parameters against constraints
   */
  validateParams(params: Record<string, string>): boolean {
    if (!this.constraints) {
      return true;
    }

    for (const [key, constraint] of Object.entries(this.constraints)) {
      const value = params[key];

      // Skip validation for optional parameters that are not provided
      if (this._optional.has(key) && value === undefined) {
        continue;
      }

      // Required parameter is missing
      if (value === undefined && !this._optional.has(key)) {
        return false;
      }

      if (value !== undefined) {
        // RegExp constraint
        if (constraint instanceof RegExp) {
          if (!constraint.test(value)) {
            return false;
          }
        }
        // Function constraint
        else if (typeof constraint === "function") {
          try {
            if (!constraint(value)) {
              return false;
            }
          } catch (error) {
            console.error(`Constraint validation error for ${key}:`, error);
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Check if handler is an error handler (has 4 parameters)
   */
  get isErrorHandler(): boolean {
    return this.handler.length === 4;
  }

  /**
   * Get parameter keys
   */
  get keys(): string[] {
    return [...this._keys];
  }

  /**
   * Get optional parameter keys
   */
  get optionalKeys(): string[] {
    return Array.from(this._optional);
  }

  /**
   * Get required parameter keys
   */
  get requiredKeys(): string[] {
    return this._keys.filter((key) => !this._optional.has(key));
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      enabled: this._cacheEnabled,
      matchCacheSize: this._matchCache?.size ?? 0,
      paramsCacheSize: this._paramsCache?.size ?? 0,
      hitCount: this._hitCount,
      missCount: this._missCount,
      hitRate:
        this._hitCount + this._missCount > 0
          ? (this._hitCount / (this._hitCount + this._missCount)) * 100
          : 0,
    };
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this._matchCache?.clear();
    this._paramsCache?.clear();
    this._hitCount = 0;
    this._missCount = 0;
  }

  /**
   * Get layer information for debugging
   */
  getInfo() {
    return {
      method: this.method,
      path: this.path,
      keys: this._keys,
      optional: Array.from(this._optional),
      required: this.requiredKeys,
      hasConstraints: !!this.constraints,
      isErrorHandler: this.isErrorHandler,
      isFastPath: this._fastPath,
      metadata: this.metadata,
      cacheStats: this.getCacheStats(),
    };
  }

  /**
   * Create a string representation for debugging
   */
  toString(): string {
    const params = this._keys.length > 0 ? ` [${this._keys.join(", ")}]` : "";
    return `Layer { method: ${this.method}, path: ${this.path}${params} }`;
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      method: this.method,
      path: this.path,
      keys: this._keys,
      optional: Array.from(this._optional),
      metadata: this.metadata,
    };
  }
}
