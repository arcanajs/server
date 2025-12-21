/**
 * ArcanaJS Application - Production Ready Core
 *
 * Improvements:
 * - Removed setTimeout hack
 * - Added proper cleanup methods
 * - Enhanced error handling
 * - Plugin validation
 * - Memory leak prevention
 * - Request timeout support
 * - Better lifecycle management
 * - Type safety improvements
 */

import path from "node:path";
import { Router } from "../modules/router";
import type {
  ErrorMiddleware,
  HttpMethod,
  Middleware,
  NextFunction,
  Plugin,
  Request,
  Response,
} from "../types";
import { RequestImpl, ResponseImpl } from "./context";
import { View } from "./view";

/**
 * Application configuration options
 */
export interface ApplicationOptions {
  /** Enable strict mode (throw on warnings) */
  strict?: boolean;
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Enable request logging */
  logging?: boolean;
  /** Trust proxy headers */
  trustProxy?: boolean;
  /** Maximum hooks per event */
  maxHooksPerEvent?: number;
  /** Enable performance monitoring */
  monitoring?: boolean;
}

/**
 * Plugin metadata
 */
interface PluginMetadata {
  plugin: Plugin;
  installed: boolean;
  error?: Error;
  installedAt: number;
}

/**
 * Main Application class
 */
export class Application {
  // Core components
  private _router: Router = new Router({ useRadixTree: true });
  private _settings: Map<string, any> = new Map();
  private _plugins: Map<string, PluginMetadata> = new Map();
  private _engines: Map<string, Function> = new Map();
  private _extensions = {
    request: new Map<string, Function>(),
    response: new Map<string, Function>(),
    application: new Map<string, Function>(),
  };
  private _hooks = new Map<string, Function[]>();

  // State management
  private _initialized: boolean = false;
  private _destroyed: boolean = false;
  private _options: Required<ApplicationOptions>;

  // Public properties
  public locals: Record<string, any> = {};
  public server?: any;

  // Performance monitoring
  private _stats = {
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    startTime: Date.now(),
  };

  constructor(options: ApplicationOptions = {}) {
    // Set options with defaults
    this._options = {
      strict: options.strict ?? false,
      requestTimeout: options.requestTimeout ?? 30000,
      logging: options.logging ?? process.env.NODE_ENV !== "production",
      trustProxy: options.trustProxy ?? false,
      maxHooksPerEvent: options.maxHooksPerEvent ?? 100,
      monitoring: options.monitoring ?? true,
    };

    // Initialize default settings
    this._initializeDefaults();

    // Mark as initialized
    this._initialized = true;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private _initializeDefaults(): void {
    // Environment
    this.set("env", process.env.NODE_ENV || "development");
    this.set("x-powered-by", true);

    // View configuration
    this.set("views", path.resolve("views"));
    this.set("view", View);
    this.set("view engine", "html");

    // Multipart configuration
    this.set("multipart", {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tempDir: "/tmp",
    });

    // Trust proxy settings
    this.set("trust proxy", this._options.trustProxy);

    // Request settings
    this.set("json spaces", this.get("env") === "production" ? 0 : 2);
    this.set("etag", "weak");
    this.set("query parser", "simple");
    this.set("subdomain offset", 2);
    this.set("case sensitive routing", false);
    this.set("strict routing", false);
  }

  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Set application setting
   */
  set(setting: string, val: any): this {
    this._ensureNotDestroyed();

    // Validate critical settings
    if (setting === "view engine" && typeof val !== "string") {
      throw new TypeError("View engine must be a string");
    }

    this._settings.set(setting, val);
    return this;
  }

  /**
   * Check if setting is enabled
   */
  enabled(setting: string): boolean {
    return Boolean(this.get(setting));
  }

  /**
   * Check if setting is disabled
   */
  disabled(setting: string): boolean {
    return !this.enabled(setting);
  }

  /**
   * Enable setting
   */
  enable(setting: string): this {
    return this.set(setting, true);
  }

  /**
   * Disable setting
   */
  disable(setting: string): this {
    return this.set(setting, false);
  }

  // ============================================================================
  // ENGINE MANAGEMENT
  // ============================================================================

  /**
   * Register template engine
   */
  engine(
    ext: string,
    fn: (path: string, options: any) => Promise<string> | string
  ): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Template engine must be a function");
    }

    const extension = ext[0] !== "." ? "." + ext : ext;
    this._engines.set(extension, fn);
    return this;
  }

  /**
   * Get registered engine
   */
  getEngine(ext: string): Function | undefined {
    const extension = ext[0] !== "." ? "." + ext : ext;
    return this._engines.get(extension);
  }

  // ============================================================================
  // MULTIPART CONFIGURATION
  // ============================================================================

  /**
   * Configure multipart form data parsing options
   */
  multipart(options: {
    maxFileSize?: number;
    maxFiles?: number;
    tempDir?: string;
  }): this {
    const current = this.get("multipart") || {};
    this.set("multipart", { ...current, ...options });
    return this;
  }

  // ============================================================================
  // ROUTING METHODS
  // ============================================================================

  /**
   * Use middleware or mount router
   */
  use(
    path: string | Middleware | ErrorMiddleware | Application | Router,
    ...handlers: (Middleware | ErrorMiddleware | Application | Router)[]
  ): this {
    this._ensureNotDestroyed();

    if (typeof path === "string") {
      if (handlers[0] instanceof Router) {
        this._router.mount(path, handlers[0]);
      } else {
        this._router.use(path, ...(handlers as Middleware[]));
      }
    } else {
      this._router.use("/", ...([path, ...handlers] as Middleware[]));
    }
    return this;
  }

  /**
   * Register route with method
   */
  route(method: HttpMethod, path: string, ...handlers: Middleware[]): this {
    this._ensureNotDestroyed();

    if (handlers.length === 0) {
      throw new Error(`Route ${method} ${path} has no handlers`);
    }

    this._router.route(method, path, ...handlers);
    return this;
  }

  /**
   * GET route
   */
  get(
    pathOrSetting: string,
    ...handlers: (Middleware | ErrorMiddleware)[]
  ): any {
    if (handlers.length === 0) {
      return this._settings.get(pathOrSetting);
    }
    return this.route("GET", pathOrSetting, ...(handlers as Middleware[]));
  }

  /** POST route */
  post(path: string, ...handlers: Middleware[]): this {
    return this.route("POST", path, ...handlers);
  }

  /** PUT route */
  put(path: string, ...handlers: Middleware[]): this {
    return this.route("PUT", path, ...handlers);
  }

  /** DELETE route */
  delete(path: string, ...handlers: Middleware[]): this {
    return this.route("DELETE", path, ...handlers);
  }

  /** PATCH route */
  patch(path: string, ...handlers: Middleware[]): this {
    return this.route("PATCH", path, ...handlers);
  }

  /** HEAD route */
  head(path: string, ...handlers: Middleware[]): this {
    return this.route("HEAD", path, ...handlers);
  }

  /** OPTIONS route */
  options(path: string, ...handlers: Middleware[]): this {
    return this.route("OPTIONS", path, ...handlers);
  }

  /** ALL methods route */
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
    methods.forEach((method) => this.route(method, path, ...handlers));
    return this;
  }

  // ============================================================================
  // PLUGIN SYSTEM
  // ============================================================================

  /**
   * Register plugin
   */
  plugin(plugin: Plugin): this {
    this._ensureNotDestroyed();

    // Validate plugin
    if (!plugin || typeof plugin !== "object") {
      throw new TypeError("Plugin must be an object");
    }

    if (!plugin.name || typeof plugin.name !== "string") {
      throw new TypeError("Plugin must have a name");
    }

    if (typeof plugin.install !== "function") {
      throw new TypeError("Plugin must have an install function");
    }

    // Check if already installed
    if (this._plugins.has(plugin.name)) {
      const existing = this._plugins.get(plugin.name)!;
      if (existing.installed) {
        console.warn(`Plugin "${plugin.name}" is already installed`);
        return this;
      }
    }

    // Install plugin
    const metadata: PluginMetadata = {
      plugin,
      installed: false,
      installedAt: Date.now(),
    };

    try {
      plugin.install(this);
      metadata.installed = true;
      this._plugins.set(plugin.name, metadata);

      if (this._options.logging) {
        console.log(`✓ Plugin installed: ${plugin.name}`);
      }
    } catch (error) {
      metadata.error = error as Error;
      this._plugins.set(plugin.name, metadata);

      console.error(`✗ Plugin installation failed: ${plugin.name}`, error);

      if (this._options.strict) {
        throw error;
      }
    }

    return this;
  }

  /**
   * Get plugin metadata
   */
  getPlugin(name: string): PluginMetadata | undefined {
    return this._plugins.get(name);
  }

  /**
   * Check if plugin is installed
   */
  hasPlugin(name: string): boolean {
    const plugin = this._plugins.get(name);
    return plugin?.installed ?? false;
  }

  /**
   * Get all installed plugins
   */
  getPlugins(): PluginMetadata[] {
    return Array.from(this._plugins.values()).filter((p) => p.installed);
  }

  // ============================================================================
  // EXTENSION SYSTEM
  // ============================================================================

  /**
   * Register extension
   */
  extend(
    type: "request" | "response" | "application",
    name: string,
    fn: Function
  ): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Extension must be a function");
    }

    // Check for conflicts
    if (this._extensions[type].has(name)) {
      console.warn(`Extension "${name}" on ${type} is being overwritten`);
    }

    this._extensions[type].set(name, fn);

    // Apply application extensions immediately if initialized
    if (type === "application" && this._initialized) {
      (this as any)[name] = fn.bind(this);
    }

    return this;
  }

  /**
   * Remove extension
   */
  removeExtension(
    type: "request" | "response" | "application",
    name: string
  ): this {
    this._extensions[type].delete(name);

    if (type === "application") {
      delete (this as any)[name];
    }

    return this;
  }

  /**
   * Apply extensions to request/response
   */
  private _applyExtensions(req: Request, res: Response): void {
    this._extensions.request.forEach((fn, name) => {
      (req as any)[name] = fn.bind(req);
    });

    this._extensions.response.forEach((fn, name) => {
      (res as any)[name] = fn.bind(res);
    });
  }

  // ============================================================================
  // HOOK SYSTEM
  // ============================================================================

  /**
   * Register hook
   */
  on(hook: string, fn: Function): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Hook handler must be a function");
    }

    if (!this._hooks.has(hook)) {
      this._hooks.set(hook, []);
    }

    const hooks = this._hooks.get(hook)!;

    // Check max hooks limit
    if (hooks.length >= this._options.maxHooksPerEvent) {
      throw new Error(
        `Maximum hooks limit (${this._options.maxHooksPerEvent}) reached for "${hook}"`
      );
    }

    hooks.push(fn);
    return this;
  }

  /**
   * Remove hook
   */
  off(hook: string, fn?: Function): this {
    if (!fn) {
      this._hooks.delete(hook);
      return this;
    }

    const hooks = this._hooks.get(hook);
    if (hooks) {
      const index = hooks.indexOf(fn);
      if (index > -1) {
        hooks.splice(index, 1);
      }
      if (hooks.length === 0) {
        this._hooks.delete(hook);
      }
    }

    return this;
  }

  /**
   * Run hooks with timeout support
   */
  private async _runHooks(
    hook: string,
    timeout: number = 5000,
    ...args: any[]
  ): Promise<void> {
    const hooks = this._hooks.get(hook);
    if (!hooks || hooks.length === 0) {
      return;
    }

    for (const fn of hooks) {
      try {
        await Promise.race([
          Promise.resolve(fn(...args)),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Hook "${hook}" timeout`)),
              timeout
            )
          ),
        ]);
      } catch (error) {
        console.error(`Error in hook "${hook}":`, error);

        if (this._options.strict) {
          throw error;
        }
      }
    }
  }

  // Lifecycle hooks
  onStart(fn: () => void | Promise<void>): this {
    return this.on("onStart", fn);
  }

  onStop(fn: () => void | Promise<void>): this {
    return this.on("onStop", fn);
  }

  beforeRequest(fn: (req: Request) => void | Promise<void>): this {
    return this.on("beforeRequest", fn);
  }

  afterRequest(
    fn: (req: Request, res: Response) => void | Promise<void>
  ): this {
    return this.on("afterRequest", fn);
  }

  beforeResponse(
    fn: (req: Request, res: Response) => void | Promise<void>
  ): this {
    return this.on("beforeResponse", fn);
  }

  afterResponse(
    fn: (req: Request, res: Response) => void | Promise<void>
  ): this {
    return this.on("afterResponse", fn);
  }

  onError(
    fn: (err: any, req: Request, res: Response) => void | Promise<void>
  ): this {
    return this.on("onError", fn);
  }

  onSuccess(fn: (req: Request, res: Response) => void | Promise<void>): this {
    return this.on("onSuccess", fn);
  }

  // Hook runners
  async runStartHooks(): Promise<void> {
    await this._runHooks("onStart", 10000);
  }

  async runStopHooks(): Promise<void> {
    await this._runHooks("onStop", 10000);
  }

  async runBeforeRequestHooks(req: Request): Promise<void> {
    await this._runHooks("beforeRequest", 5000, req);
  }

  async runAfterRequestHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterRequest", 5000, req, res);
  }

  async runBeforeResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("beforeResponse", 5000, req, res);
  }

  async runAfterResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterResponse", 5000, req, res);
  }

  async runOnErrorHooks(err: any, req: Request, res: Response): Promise<void> {
    await this._runHooks("onError", 5000, err, req, res);
  }

  async runOnSuccessHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("onSuccess", 5000, req, res);
  }

  // ============================================================================
  // REQUEST HANDLING
  // ============================================================================

  /**
   * Handle request through router
   */
  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    this._applyExtensions(req, res);
    await this._router.handle(req, res, next);
  }

  /**
   * Main request handler (entry point from server)
   */
  async fetch(nativeRequest: globalThis.Request): Promise<globalThis.Response> {
    this._ensureNotDestroyed();

    const startTime = Date.now();
    let arcanajsReq: Request | undefined;
    let arcanajsRes: Response | undefined;

    try {
      // Create request/response wrappers
      arcanajsReq = new RequestImpl(nativeRequest, this);

      let responseResolver: (res: globalThis.Response) => void;
      const responsePromise = new Promise<globalThis.Response>((resolve) => {
        responseResolver = resolve;
      });

      arcanajsRes = new ResponseImpl(responseResolver!, this, arcanajsReq);
      (arcanajsRes as any).req = arcanajsReq;

      // Set request timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Request timeout"));
        }, this._options.requestTimeout);
      });

      // Handle request lifecycle
      const lifecyclePromise = (async () => {
        try {
          await this.runBeforeRequestHooks(arcanajsReq!);

          const done = async (err?: any) => {
            if (err) {
              await this._handleError(err, arcanajsReq!, arcanajsRes!);
            } else if (!arcanajsRes!.sent) {
              await arcanajsRes!.status(404).send("Not Found");
            }
          };

          await this.handle(arcanajsReq!, arcanajsRes!, done);

          // Wait for response if not sent
          if (!arcanajsRes!.sent) {
            await Promise.race([
              responsePromise,
              new Promise((r) => setTimeout(r, 100)),
            ]);
          }
        } catch (err) {
          await this._handleError(err, arcanajsReq!, arcanajsRes!);
        } finally {
          if (arcanajsRes!.sent) {
            await this.runOnSuccessHooks(arcanajsReq!, arcanajsRes!);
          }
          await this.runAfterRequestHooks(arcanajsReq!, arcanajsRes!);

          // Update stats
          if (this._options.monitoring) {
            this._stats.requests++;
            this._stats.totalResponseTime += Date.now() - startTime;
          }
        }
      })();

      // Race between timeout and lifecycle
      await Promise.race([lifecyclePromise, timeoutPromise]);

      return await responsePromise;
    } catch (error) {
      // Handle fatal errors
      if (arcanajsReq && arcanajsRes) {
        await this._handleError(error, arcanajsReq, arcanajsRes);
        if (arcanajsRes.sent) {
          return (arcanajsRes as any)._responsePromise;
        }
      }

      // Fallback response
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message:
            this.get("env") === "development"
              ? (error as Error).message
              : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  /**
   * Handle errors
   */
  private async _handleError(
    err: any,
    req: Request,
    res: Response
  ): Promise<void> {
    if (this._options.monitoring) {
      this._stats.errors++;
    }

    await this.runOnErrorHooks(err, req, res);

    if (this._options.logging) {
      console.error("Request error:", err);
    }

    if (!res.sent) {
      const isDev = this.get("env") === "development";
      await res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
        ...(isDev && { stack: err.stack }),
      });
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Render view
   */
  async render(
    name: string,
    options: any = {},
    callback?: (err: Error | null, html?: string) => void
  ): Promise<string> {
    try {
      const opts = { ...this.locals, ...options };
      const ViewConfig = this.get("view");
      const view = new ViewConfig(name, {
        defaultEngine: this.get("view engine"),
        root: this.get("views"),
        engines: Object.fromEntries(this._engines),
      });

      if (!view.path) {
        await view.resolvePath(this.get("views"));
      }

      const html = await view.render(opts);

      if (callback) {
        callback(null, html);
      }

      return html;
    } catch (err: any) {
      if (callback) {
        callback(err);
      }
      throw err;
    }
  }

  // ============================================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================================

  /**
   * Start server (placeholder for server adapters)
   */
  listen(port: number, callback?: () => void): any {
    console.warn(
      "Application.listen should be overridden by server adapter (e.g., serve())"
    );
    if (callback) callback();
  }

  /**
   * Destroy application and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this._destroyed) {
      return;
    }

    // Run stop hooks
    await this.runStopHooks();

    // Clear all maps
    this._settings.clear();
    this._engines.clear();
    this._hooks.clear();
    this._extensions.request.clear();
    this._extensions.response.clear();
    this._extensions.application.clear();

    // Clear plugins
    this._plugins.clear();

    // Clear locals
    this.locals = {};

    // Mark as destroyed
    this._destroyed = true;

    if (this._options.logging) {
      console.log("Application destroyed");
    }
  }

  /**
   * Get application statistics
   */
  getStats() {
    return {
      ...this._stats,
      uptime: Date.now() - this._stats.startTime,
      avgResponseTime:
        this._stats.requests > 0
          ? this._stats.totalResponseTime / this._stats.requests
          : 0,
      plugins: this._plugins.size,
      hooks: Array.from(this._hooks.values()).reduce(
        (sum, hooks) => sum + hooks.length,
        0
      ),
      extensions:
        this._extensions.request.size +
        this._extensions.response.size +
        this._extensions.application.size,
    };
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /**
   * Ensure application is not destroyed
   */
  private _ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Cannot use destroyed application");
    }
  }
}

/**
 * Factory function
 */
export const arcanajs = (options?: ApplicationOptions) =>
  new Application(options);
