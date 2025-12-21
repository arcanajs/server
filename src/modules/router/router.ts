/**
 * ArcanaJS Enhanced Router
 *
 * Advanced routing with groups, constraints, prefixes, and optional parameters.
 */

import type { ArcanaJSKernel, ArcanaJSModule } from "../../core/kernel";
import type {
  ErrorMiddleware,
  HttpMethod,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";
import { Layer } from "./layer";
import { RadixTree, type ParamConstraint } from "./radix-tree";

/**
 * Route constraints configuration
 */
export interface RouteConstraints {
  [param: string]: RegExp | ((value: string) => boolean);
}

/**
 * Router options
 */
export interface RouterOptions {
  /** Use radix tree for performance */
  useRadixTree?: boolean;
  /** Base prefix for all routes */
  prefix?: string;
  /** Case-sensitive routing */
  caseSensitive?: boolean;
  /** Strict routing (trailing slashes matter) */
  strict?: boolean;
}

/**
 * Route group callback
 */
export type RouteGroupCallback = (router: Router) => void;

export class Router {
  public stack: Layer[] = [];
  private _prefix: string;
  private _options: RouterOptions;
  private _radixTree?: RadixTree;
  private _useRadixTree: boolean;

  constructor(options: RouterOptions = {}) {
    this._options = options;
    this._prefix = options.prefix || "";
    this._useRadixTree = options.useRadixTree ?? false;

    if (this._useRadixTree) {
      this._radixTree = new RadixTree();
    }
  }

  /**
   * Set a global prefix for all routes
   */
  prefix(prefix: string): this {
    this._prefix = prefix;
    return this;
  }

  /**
   * Use middleware(s)
   */
  use(path: string | Middleware, ...handlers: Middleware[]): this {
    let p = "/";
    let fns = handlers;

    if (typeof path === "string") {
      p = this._resolvePath(path);
    } else {
      fns = [path, ...handlers];
    }

    fns.forEach((fn) => {
      this.stack.push(new Layer(p, "USE", fn));
    });
    return this;
  }

  /**
   * Use error handling middleware
   */
  useError(handler: ErrorMiddleware): this {
    this.stack.push(new Layer("/", "USE", handler));
    return this;
  }

  /**
   * Add a route with specific method
   */
  route(
    method: HttpMethod,
    path: string,
    ...args: (Middleware | RouteConstraints | Middleware[])[]
  ): this {
    const resolvedPath = this._resolvePath(path);
    let handlers: Middleware[] = [];
    let constraints: RouteConstraints | undefined;

    // Parse arguments - first object is constraints, rest are handlers
    for (const arg of args) {
      if (typeof arg === "function") {
        handlers.push(arg as Middleware);
      } else if (typeof arg === "object" && !Array.isArray(arg)) {
        constraints = arg as RouteConstraints;
      } else if (Array.isArray(arg)) {
        // Handle arrays of middleware functions
        for (const item of arg) {
          if (typeof item === "function") {
            handlers.push(item as Middleware);
          }
        }
      }
    }

    // Add to radix tree if enabled
    if (this._radixTree) {
      const parsedConstraints = constraints
        ? this._parseConstraints(constraints)
        : undefined;
      this._radixTree.add(method, resolvedPath, handlers, parsedConstraints);
    }

    // Always add to stack for compatibility
    handlers.forEach((fn) => {
      const layer = new Layer(resolvedPath, method, fn, constraints);
      this.stack.push(layer);
    });

    return this;
  }

  /**
   * Create a route group with a common prefix
   */
  group(prefix: string, callback: RouteGroupCallback): this {
    const subRouter = new Router({
      ...this._options,
      prefix: this._resolvePath(prefix),
      useRadixTree: false, // Groups use parent's radix tree
    });

    callback(subRouter);

    // Merge sub-router's stack into this router
    for (const layer of subRouter.stack) {
      // Create new layer with proper path and constraints
      const newLayer = new Layer(layer.path, layer.method, layer.handler, layer.constraints);
      this.stack.push(newLayer);
      
      // Also add to radix tree if enabled
      if (this._radixTree && layer.method !== "USE") {
        const parsedConstraints = layer.constraints ? this._parseConstraints(layer.constraints) : undefined;
        this._radixTree.add(layer.method, layer.path, [layer.handler as Middleware], parsedConstraints);
      }
    }

    return this;
  }

  /**
   * Mount a sub-router at a path
   */
  mount(path: string, router: Router): this {
    const mountPath = this._resolvePath(path);

    router.stack.forEach((layer) => {
      const fullPath = this._joinPaths(mountPath, layer.path);
      const newLayer = new Layer(fullPath, layer.method, layer.handler, layer.constraints);
      this.stack.push(newLayer);

      if (this._radixTree && layer.method !== "USE") {
        const parsedConstraints = layer.constraints ? this._parseConstraints(layer.constraints) : undefined;
        this._radixTree.add(layer.method, fullPath, [
          layer.handler as Middleware,
        ], parsedConstraints);
      }
    });

    return this;
  }

  // HTTP method shortcuts
  get(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("GET", path, ...args);
  }

  post(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("POST", path, ...args);
  }

  put(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("PUT", path, ...args);
  }

  delete(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("DELETE", path, ...args);
  }

  patch(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("PATCH", path, ...args);
  }

  head(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("HEAD", path, ...args);
  }

  options(path: string, ...args: (Middleware | RouteConstraints | Middleware[])[]): this {
    return this.route("OPTIONS", path, ...args);
  }

  /**
   * Add all HTTP methods for a path
   */
  all(path: string, ...handlers: Middleware[]): this {
    const methods: HttpMethod[] = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    methods.forEach((method) => {
      this.route(method, path, ...handlers);
    });
    return this;
  }

  /**
   * Handle incoming request
   */
  async handle(req: Request, res: Response, out: NextFunction): Promise<void> {
    // Try radix tree first for O(log n) matching
    if (this._radixTree) {
      const match = this._radixTree.find(req.method as HttpMethod, req.path);
      if (match) {
        req.params = { ...req.params, ...match.params };

        // First, execute all USE middleware
        let middlewareIdx = 0;
        const middlewareStack = this.stack.filter(layer => layer.method === "USE");
        
        const executeMiddleware = async (err?: any) => {
          if (err) return out(err);
          if (middlewareIdx >= middlewareStack.length) {
            // All middleware executed, now execute route handlers
            return executeRouteHandlers();
          }

          const layer = middlewareStack[middlewareIdx++];
          const path = req.path;

          if (!layer.match(path)) {
            return executeMiddleware(err);
          }

          // Handle path stripping for USE
          const originalPath = req.path;
          const originalBaseUrl = req.baseUrl;
          const removed = layer.method === "USE" ? layer.path : "";

          if (removed !== "/" && removed !== "") {
            req.baseUrl += removed;
            req.path = req.path.substring(removed.length) || "/";
          }

          req.params = { ...req.params, ...layer.params(path) };

          try {
            if (layer.handler.length === 4) {
              await (layer.handler as ErrorMiddleware)(null, req, res, executeMiddleware);
            } else {
              await (layer.handler as Middleware)(req, res, executeMiddleware);
            }
          } catch (e) {
            req.path = originalPath;
            req.baseUrl = originalBaseUrl;
            return out(e);
          }

          req.path = originalPath;
          req.baseUrl = originalBaseUrl;
        };

        // Execute route handlers after middleware
        let routeIdx = 0;
        const executeRouteHandlers = async (err?: any) => {
          if (err) return out(err);
          if (routeIdx >= match.route.handlers.length) return out();

          const handler = match.route.handlers[routeIdx++];
          try {
            await handler(req, res, executeRouteHandlers);
          } catch (e) {
            return out(e);
          }
        };

        return executeMiddleware();
      }
    }

    // Fallback to linear stack search
    let idx = 0;
    const stack = this.stack;

    const next: NextFunction = async (err?: any) => {
      if (idx >= stack.length) {
        return out(err);
      }

      const layer = stack[idx++];
      const path = req.path;

      if (!layer.match(path)) {
        return next(err);
      }

      // Method matching: 'USE' matches everything
      if (layer.method !== "USE" && layer.method !== req.method) {
        return next(err);
      }

      // Check constraints
      if (layer.constraints) {
        const params = layer.params(path);
        if (!layer.validateParams(params)) {
          return out(); // Stop processing, constraints failed
        }
      }

      // Handle path stripping for USE
      const originalPath = req.path;
      const originalBaseUrl = req.baseUrl;
      const removed = layer.method === "USE" ? layer.path : "";

      if (removed !== "/" && removed !== "") {
        req.baseUrl += removed;
        req.path = req.path.substring(removed.length) || "/";
      }

      req.params = { ...req.params, ...layer.params(path) };

      try {
        if (err) {
          if (layer.handler.length === 4) {
            await (layer.handler as ErrorMiddleware)(err, req, res, next);
          } else {
            await next(err);
          }
        } else {
          if (layer.handler.length < 4) {
            await (layer.handler as Middleware)(req, res, next);
          } else {
            await next();
          }
        }
      } catch (e) {
        await next(e);
      } finally {
        req.path = originalPath;
        req.baseUrl = originalBaseUrl;
      }
    };

    await next();
  }

  /**
   * Get all registered routes (for documentation/debugging)
   */
  getRoutes(): Array<{ method: HttpMethod; path: string }> {
    return this.stack
      .filter((layer) => layer.method !== "USE")
      .map((layer) => ({
        method: layer.method,
        path: layer.path,
      }));
  }

  // Private methods

  private _resolvePath(path: string): string {
    if (!this._prefix) return path;
    return this._joinPaths(this._prefix, path);
  }

  private _joinPaths(base: string, path: string): string {
    if (base === "/" || base === "") return path;
    if (path === "/") return base;

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : "/" + path;

    return normalizedBase + normalizedPath;
  }

  private _parseConstraints(
    constraints: RouteConstraints
  ): Record<string, ParamConstraint> {
    const result: Record<string, ParamConstraint> = {};

    for (const [param, constraint] of Object.entries(constraints)) {
      if (constraint instanceof RegExp) {
        result[param] = { pattern: constraint };
      } else {
        result[param] = { validator: constraint };
      }
    }

    return result;
  }
}

/**
 * RouterModule - ArcanaJS module for routing
 */
export class RouterModule implements ArcanaJSModule {
  readonly name = "router";
  readonly version = "1.0.0";

  private _router: Router;

  constructor(options?: RouterOptions) {
    this._router = new Router(options);
  }

  init(kernel: ArcanaJSKernel): void {
    // Module is ready
  }

  get router(): Router {
    return this._router;
  }
}
