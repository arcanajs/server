/**
 * ArcanaJS Application - Production Ready
 *
 * Application indépendante qui compose Router et MiddlewareStack
 * Séparation claire des responsabilités sans dépendance circulaire
 */

import path from "node:path";
import { MiddlewareStack } from "../modules/middleware/middleware-stack";
import { Router } from "../modules/router/router";
import type {
  ErrorMiddleware,
  Middleware,
  NextFunction,
  Plugin,
  Request,
  Response,
} from "../types";
import { RequestImpl, ResponseImpl } from "./context";
import { View } from "./view";

/**
 * Options de l'application
 */
export interface ApplicationOptions {
  strict?: boolean;
  requestTimeout?: number;
  logging?: boolean;
  trustProxy?: boolean;
  maxHooksPerEvent?: number;
  monitoring?: boolean;
  mergeParams?: boolean;
}

/**
 * Metadata de plugin
 */
interface PluginMetadata {
  plugin: Plugin;
  installed: boolean;
  error?: Error;
  installedAt: number;
}

/**
 * Application avec architecture séparée
 */
export class Application {
  // Router principal (composition, pas héritage)
  private _router: Router;

  // Stack de middleware au niveau application
  private _middlewareStack: MiddlewareStack;

  // Configuration
  private _settings: Map<string, any> = new Map();
  private _plugins: Map<string, PluginMetadata> = new Map();
  private _engines: Map<string, Function> = new Map();
  private _hooks = new Map<string, Function[]>();

  // Extensions
  private _extensions = {
    request: new Map<string, Function>(),
    response: new Map<string, Function>(),
    application: new Map<string, Function>(),
  };

  // État
  private _initialized: boolean = false;
  private _destroyed: boolean = false;
  private readonly _options: Required<ApplicationOptions>;

  // Public
  public locals: Record<string, any> = {};
  public server?: any;

  // Statistiques
  private _stats = {
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    startTime: Date.now(),
  };

  constructor(options: ApplicationOptions = {}) {
    this._options = {
      strict: options.strict ?? false,
      requestTimeout: options.requestTimeout ?? 30000,
      logging: options.logging ?? process.env.NODE_ENV !== "production",
      trustProxy: options.trustProxy ?? false,
      maxHooksPerEvent: options.maxHooksPerEvent ?? 100,
      monitoring: options.monitoring ?? true,
      mergeParams: options.mergeParams ?? false,
    };

    // Créer le router avec les mêmes options
    this._router = new Router({
      useRadixTree: true,
      mergeParams: this._options.mergeParams,
      monitoring: this._options.monitoring,
    });

    // Créer la stack de middleware au niveau app
    this._middlewareStack = new MiddlewareStack({
      mergeParams: this._options.mergeParams,
      timeout: this._options.requestTimeout,
    });

    this._initializeDefaults();
    this._initialized = true;
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  private _initializeDefaults(): void {
    this.set("env", process.env.NODE_ENV || "development");
    this.set("x-powered-by", true);
    this.set("views", path.resolve("views"));
    this.set("view", View);
    this.set("view engine", "html");
    this.set("trust proxy", this._options.trustProxy);
    this.set("json spaces", this.get("env") === "production" ? 0 : 2);
    this.set("etag", "weak");
    this.set("query parser", "simple");
    this.set("subdomain offset", 2);
  }

  set(setting: string, val: any): this {
    this._ensureNotDestroyed();
    this._settings.set(setting, val);
    return this;
  }

  get(pathOrSetting: string, ...handlers: Middleware[]): any {
    if (handlers.length === 0) {
      return this._settings.get(pathOrSetting);
    }
    return this._router.get(pathOrSetting, ...handlers);
  }

  enabled(setting: string): boolean {
    return Boolean(this.get(setting));
  }

  disabled(setting: string): boolean {
    return !this.enabled(setting);
  }

  enable(setting: string): this {
    return this.set(setting, true);
  }

  disable(setting: string): this {
    return this.set(setting, false);
  }

  // ============================================================================
  // MIDDLEWARE & ROUTING
  // ============================================================================

  /**
   * Enregistrer middleware ou router
   * Cette méthode gère tout : middleware normaux, error middleware, routers
   */
  use(
    path: string | Middleware | ErrorMiddleware | Router | Application,
    ...handlers: Array<Middleware | ErrorMiddleware | Router | Application>
  ): this {
    this._ensureNotDestroyed();

    // Cas 1: Monter un Router
    if (path instanceof Router) {
      this._router.mount("/", path);
      return this;
    }

    if (path instanceof Application) {
      this._router.mount("/", path._router);
      return this;
    }

    // Cas 2: path est une string
    if (typeof path === "string") {
      for (const handler of handlers) {
        if (handler instanceof Router) {
          this._router.mount(path, handler);
        } else if (handler instanceof Application) {
          this._router.mount(path, handler._router);
        } else if (typeof handler === "function") {
          // Middleware normal ou error middleware
          if (handler.length === 4) {
            // Error middleware - ajouter à la stack app
            this._middlewareStack.push(handler as ErrorMiddleware, path);
          } else {
            // Middleware normal - ajouter au router
            this._router.use(path, handler as Middleware);
          }
        }
      }
      return this;
    }

    // Cas 3: path est un middleware/router
    if (typeof path === "function") {
      // Déterminer si c'est un error middleware
      if (path.length === 4) {
        this._middlewareStack.push(path as ErrorMiddleware, "/");
      } else {
        this._router.use(path as Middleware);
      }

      // Traiter les autres handlers
      for (const handler of handlers) {
        if (handler instanceof Router) {
          this._router.mount("/", handler);
        } else if (handler instanceof Application) {
          this._router.mount("/", handler._router);
        } else if (typeof handler === "function") {
          if (handler.length === 4) {
            this._middlewareStack.push(handler as ErrorMiddleware, "/");
          } else {
            this._router.use(handler as Middleware);
          }
        }
      }
    }

    return this;
  }

  /**
   * Enregistrer explicitement un error middleware
   */
  useError(handler: ErrorMiddleware): this {
    this._ensureNotDestroyed();

    if (typeof handler !== "function") {
      throw new TypeError("Error middleware must be a function");
    }

    if (handler.length !== 4) {
      throw new TypeError("Error middleware must accept 4 parameters");
    }

    this._middlewareStack.push(handler, "/", handler.name || "errorHandler");
    return this;
  }

  // ============================================================================
  // HTTP METHODS (délégués au router)
  // ============================================================================

  post(path: string, ...handlers: Middleware[]): this {
    return this._router.post(path, ...handlers), this;
  }

  put(path: string, ...handlers: Middleware[]): this {
    return this._router.put(path, ...handlers), this;
  }

  delete(path: string, ...handlers: Middleware[]): this {
    return this._router.delete(path, ...handlers), this;
  }

  patch(path: string, ...handlers: Middleware[]): this {
    return this._router.patch(path, ...handlers), this;
  }

  head(path: string, ...handlers: Middleware[]): this {
    return this._router.head(path, ...handlers), this;
  }

  options(path: string, ...handlers: Middleware[]): this {
    return this._router.options(path, ...handlers), this;
  }

  all(path: string, ...handlers: Middleware[]): this {
    return this._router.all(path, ...handlers), this;
  }

  // ============================================================================
  // PLUGINS
  // ============================================================================

  plugin(plugin: Plugin): this {
    this._ensureNotDestroyed();

    if (!plugin || typeof plugin !== "object") {
      throw new TypeError("Plugin must be an object");
    }

    if (!plugin.name || typeof plugin.name !== "string") {
      throw new TypeError("Plugin must have a name");
    }

    if (typeof plugin.install !== "function") {
      throw new TypeError("Plugin must have an install function");
    }

    if (this._plugins.has(plugin.name)) {
      const existing = this._plugins.get(plugin.name)!;
      if (existing.installed) {
        console.warn(`Plugin "${plugin.name}" is already installed`);
        return this;
      }
    }

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

  // ============================================================================
  // EXTENSIONS
  // ============================================================================

  extend(
    type: "request" | "response" | "application",
    name: string,
    fn: Function
  ): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Extension must be a function");
    }

    this._extensions[type].set(name, fn);

    if (type === "application" && this._initialized) {
      (this as any)[name] = fn.bind(this);
    }

    return this;
  }

  private _applyExtensions(req: Request, res: Response): void {
    this._extensions.request.forEach((fn, name) => {
      (req as any)[name] = fn.bind(req);
    });

    this._extensions.response.forEach((fn, name) => {
      (res as any)[name] = fn.bind(res);
    });
  }

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  on(hook: string, fn: Function): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Hook handler must be a function");
    }

    if (!this._hooks.has(hook)) {
      this._hooks.set(hook, []);
    }

    const hooks = this._hooks.get(hook)!;

    if (hooks.length >= this._options.maxHooksPerEvent) {
      throw new Error(
        `Maximum hooks limit (${this._options.maxHooksPerEvent}) reached for "${hook}"`
      );
    }

    hooks.push(fn);
    return this;
  }

  private async _runHooks(
    hook: string,
    timeout: number = 5000,
    ...args: any[]
  ): Promise<void> {
    const hooks = this._hooks.get(hook);
    if (!hooks || hooks.length === 0) return;

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
        if (this._options.strict) throw error;
      }
    }
  }

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
   * Handler principal de requête
   * Architecture: App Middleware -> Router (avec ses middleware) -> Error Middleware
   */
  async fetch(nativeRequest: globalThis.Request): Promise<globalThis.Response> {
    this._ensureNotDestroyed();

    const startTime = Date.now();
    let req: Request | undefined;
    let res: Response | undefined;

    try {
      // Créer request/response
      req = new RequestImpl(nativeRequest, this);

      let responseResolver: (r: globalThis.Response) => void;
      const responsePromise = new Promise<globalThis.Response>((resolve) => {
        responseResolver = resolve;
      });

      res = new ResponseImpl(responseResolver!, this, req);
      (res as any).req = req;

      // Timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Request timeout"));
        }, this._options.requestTimeout);
      });

      // Lifecycle
      const lifecyclePromise = (async () => {
        try {
          await this.runBeforeRequestHooks(req!);

          // Handler final qui gère les erreurs et 404
          const finalHandler: NextFunction = async (err?: any) => {
            if (err) {
              // Passer aux error middleware
              await this._handleError(err, req!, res!);
            } else if (!res!.sent) {
              // 404
              await res!.status(404).send("Not Found");
            }
          };

          // Créer le handler qui exécute le router après les middleware app
          const routerHandler: NextFunction = async (err?: any) => {
            if (err) {
              return finalHandler(err);
            }

            // Exécuter le router (qui a ses propres middleware)
            await this._router.handle(req!, res!, finalHandler);
          };

          // Exécuter middleware app -> router -> error middleware
          await this._middlewareStack.execute(req!, res!, routerHandler);

          // Attendre la réponse
          if (!res!.sent) {
            await Promise.race([
              responsePromise,
              new Promise((r) => setTimeout(r, 100)),
            ]);
          }
        } catch (err) {
          await this._handleError(err, req!, res!);
        } finally {
          if (res!.sent) {
            await this.runOnSuccessHooks(req!, res!);
          }
          await this.runAfterRequestHooks(req!, res!);

          if (this._options.monitoring) {
            this._stats.requests++;
            this._stats.totalResponseTime += Date.now() - startTime;
          }
        }
      })();

      await Promise.race([lifecyclePromise, timeoutPromise]);
      return await responsePromise;
    } catch (error) {
      if (req && res) {
        await this._handleError(error, req, res);
        if (res.sent) {
          return (res as any)._responsePromise;
        }
      }

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
   * Gérer les erreurs
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
  // LIFECYCLE
  // ============================================================================

  listen(port: number, callback?: () => void): any {
    console.warn("Application.listen should be overridden by server adapter");
    if (callback) callback();
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;

    await this.runStopHooks();
    this._settings.clear();
    this._engines.clear();
    this._hooks.clear();
    this._extensions.request.clear();
    this._extensions.response.clear();
    this._extensions.application.clear();
    this._plugins.clear();
    this.locals = {};
    this._destroyed = true;

    if (this._options.logging) {
      console.log("Application destroyed");
    }
  }

  getStats() {
    return {
      ...this._stats,
      uptime: Date.now() - this._stats.startTime,
      avgResponseTime:
        this._stats.requests > 0
          ? this._stats.totalResponseTime / this._stats.requests
          : 0,
      router: this._router.getStats(),
      middleware: this._middlewareStack.getStats(),
    };
  }

  private _ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Cannot use destroyed application");
    }
  }
}

export const arcanajs = (options?: ApplicationOptions) =>
  new Application(options);
