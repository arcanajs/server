/**
 * ArcanaJS Router - Production Ready
 *
 * Router indépendant qui gère le routing et les middleware de manière séparée.
 * Utilise MiddlewareStack pour la gestion de la chaîne de responsabilité.
 */

import type {
  ErrorMiddleware,
  HttpMethod,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";
import {
  MiddlewareStack,
  type ExecutionOptions,
} from "../middleware/middleware-stack";
import { Layer } from "./layer";
import { RadixTree, type ParamConstraint } from "./radix-tree";

/**
 * Contraintes de route
 */
export interface RouteConstraints {
  [param: string]: RegExp | ((value: string) => boolean);
}

/**
 * Options du router
 */
export interface RouterOptions extends ExecutionOptions {
  useRadixTree?: boolean;
  prefix?: string;
  caseSensitive?: boolean;
  strict?: boolean;
  monitoring?: boolean;
}

/**
 * Metadata de route
 */
export interface RouteMetadata {
  name?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  [key: string]: any;
}

/**
 * Callback pour groupe de routes
 */
export type RouteGroupCallback = (router: Router) => void;

/**
 * Router avec séparation claire des responsabilités
 */
export class Router {
  // Middleware stack indépendante
  private _middlewareStack: MiddlewareStack;

  // Mounted child routers
  private _mounts: Array<{ path: string; router: Router }> = [];

  // Route layers pour le matching
  private _routeLayers: Layer[] = [];

  // Radix tree pour performance
  private _radixTree?: RadixTree;

  // Configuration
  private _prefix: string;
  private readonly _options: Required<RouterOptions>;

  // Métadonnées
  private _routeMetadata = new Map<string, RouteMetadata>();

  // Monitoring
  private _stats = {
    requests: 0,
    errors: 0,
    totalTime: 0,
  };

  constructor(options: RouterOptions = {}) {
    this._options = {
      useRadixTree: options.useRadixTree ?? true,
      prefix: options.prefix || "",
      caseSensitive: options.caseSensitive ?? false,
      strict: options.strict ?? false,
      mergeParams: options.mergeParams ?? false,
      timeout: options.timeout ?? 30000,
      monitoring: options.monitoring ?? true,
      onMiddleware: options.onMiddleware ?? (() => {}),
    };

    this._prefix = this._options.prefix;

    // Créer la stack de middleware
    this._middlewareStack = new MiddlewareStack({
      mergeParams: this._options.mergeParams,
      timeout: this._options.timeout,
      onMiddleware: this._options.onMiddleware,
    });

    // Créer le radix tree si activé
    if (this._options.useRadixTree) {
      this._radixTree = new RadixTree();
    }
  }

  // ============================================================================
  // MIDDLEWARE MANAGEMENT
  // ============================================================================

  /**
   * Enregistrer un middleware ou un error middleware
   * Gère automatiquement les deux types
   */
  use(
    path: string | Middleware | ErrorMiddleware,
    ...handlers: Array<Middleware | ErrorMiddleware>
  ): this {
    let targetPath = "/";
    let middlewares: Array<Middleware | ErrorMiddleware> = [];

    // Déterminer le path et les handlers
    if (typeof path === "string") {
      targetPath = this._resolvePath(path);
      middlewares = handlers;
    } else {
      targetPath = "/";
      middlewares = [path, ...handlers];
    }

    // Valider les handlers
    for (const handler of middlewares) {
      if (typeof handler !== "function") {
        throw new TypeError("Middleware must be a function");
      }
    }

    // Ajouter à la stack
    const names = middlewares.map((h) => h.name || "anonymous");
    this._middlewareStack.pushMany(middlewares, targetPath, names);

    return this;
  }

  /**
   * Enregistrer un error middleware explicitement
   */
  useError(handler: ErrorMiddleware): this {
    if (typeof handler !== "function") {
      throw new TypeError("Error middleware must be a function");
    }

    if (handler.length !== 4) {
      throw new TypeError(
        "Error middleware must accept 4 parameters (err, req, res, next)"
      );
    }

    this._middlewareStack.push(handler, "/", handler.name || "errorHandler");
    return this;
  }

  // ============================================================================
  // ROUTE REGISTRATION
  // ============================================================================

  /**
   * Enregistrer une route avec méthode HTTP
   */
  route(
    method: HttpMethod,
    path: string,
    ...args: (Middleware | RouteConstraints | Middleware[] | RouteMetadata)[]
  ): this {
    const resolvedPath = this._resolvePath(path);
    const handlers: Middleware[] = [];
    let constraints: RouteConstraints | undefined;
    let metadata: RouteMetadata | undefined;

    // Parser les arguments
    for (const arg of args) {
      if (typeof arg === "function") {
        handlers.push(arg as Middleware);
      } else if (Array.isArray(arg)) {
        handlers.push(
          ...(arg.filter((h) => typeof h === "function") as Middleware[])
        );
      } else if (typeof arg === "object") {
        const keys = Object.keys(arg);
        const isConstraints = keys.some(
          (key) => arg[key] instanceof RegExp || typeof arg[key] === "function"
        );

        if (isConstraints) {
          constraints = arg as RouteConstraints;
        } else {
          metadata = arg as RouteMetadata;
        }
      }
    }

    // Validation
    if (handlers.length === 0) {
      throw new Error(`Route ${method} ${path} must have at least one handler`);
    }

    // Ajouter au radix tree
    if (this._radixTree) {
      const parsedConstraints = constraints
        ? this._parseConstraints(constraints)
        : undefined;
      this._radixTree.add(
        method,
        resolvedPath,
        handlers,
        parsedConstraints,
        metadata
      );
    }

    // Créer les layers
    handlers.forEach((handler) => {
      const layer = new Layer({
        path: resolvedPath,
        method,
        handler,
        constraints,
        metadata,
      });
      this._routeLayers.push(layer);
    });

    // Sauvegarder metadata
    if (metadata) {
      const routeKey = `${method}:${resolvedPath}`;
      this._routeMetadata.set(routeKey, metadata);
    }

    return this;
  }

  // ============================================================================
  // HTTP METHOD SHORTCUTS
  // ============================================================================

  get(path: string, ...args: any[]): this {
    return this.route("GET", path, ...args);
  }

  post(path: string, ...args: any[]): this {
    return this.route("POST", path, ...args);
  }

  put(path: string, ...args: any[]): this {
    return this.route("PUT", path, ...args);
  }

  delete(path: string, ...args: any[]): this {
    return this.route("DELETE", path, ...args);
  }

  patch(path: string, ...args: any[]): this {
    return this.route("PATCH", path, ...args);
  }

  head(path: string, ...args: any[]): this {
    return this.route("HEAD", path, ...args);
  }

  options(path: string, ...args: any[]): this {
    return this.route("OPTIONS", path, ...args);
  }

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
  // ROUTE GROUPS
  // ============================================================================

  /**
   * Créer un groupe de routes avec prefix
   */
  group(prefix: string, callback: RouteGroupCallback): this;
  group(
    options: { prefix: string; middleware?: Middleware[] },
    callback: RouteGroupCallback
  ): this;
  group(
    prefixOrOptions: string | { prefix: string; middleware?: Middleware[] },
    callback: RouteGroupCallback
  ): this {
    const prefix =
      typeof prefixOrOptions === "string"
        ? prefixOrOptions
        : prefixOrOptions.prefix;

    const middleware =
      typeof prefixOrOptions === "object"
        ? prefixOrOptions.middleware
        : undefined;

    // Créer un sous-router
    const subRouter = new Router({
      ...this._options,
      prefix: this._resolvePath(prefix),
      useRadixTree: false, // Utilisera le radix tree du parent
    });

    // Exécuter le callback
    callback(subRouter);

    // Ajouter le middleware de groupe si fourni
    if (middleware && middleware.length > 0) {
      const groupPath = this._resolvePath(prefix);
      this._middlewareStack.pushMany(middleware, groupPath);
    }

    // Fusionner le sous-router
    this._mergeRouter(subRouter);

    return this;
  }

  /**
   * Monter un router à un path
   */
  mount(path: string, router: Router): this {
    if (!(router instanceof Router)) {
      throw new TypeError("Can only mount Router instances");
    }

    const mountPath = this._resolvePath(path);

    // Store mount instead of merging to preserve router-local middleware and error handlers
    this._mounts.push({ path: mountPath, router });

    return this;
  }

  // ============================================================================
  // REQUEST HANDLING
  // ============================================================================

  /**
   * Gérer une requête entrante
   * Séparation claire : middleware -> routing -> handlers
   */
  async handle(
    req: Request,
    res: Response,
    finalHandler: NextFunction
  ): Promise<void> {
    const startTime = this._options.monitoring ? Date.now() : 0;
    // Check mounted child routers first (choose longest matching mount)
    if (this._mounts && this._mounts.length > 0) {
      let bestMount: { path: string; router: Router } | null = null;
      for (const m of this._mounts) {
        if (req.path === m.path || req.path.startsWith(m.path + "/")) {
          if (!bestMount || m.path.length > bestMount.path.length) {
            bestMount = m;
          }
        }
      }

      if (bestMount) {
        // Delegate to child router with path adjusted (strip mount prefix)
        const originalPath = req.path;
        const originalBase = req.baseUrl || "";

        // Compute new path: strip mount path prefix
        let newPath = originalPath.slice(bestMount.path.length);
        if (!newPath) newPath = "/";

        // Adjust request
        req.path = newPath;
        req.baseUrl =
          (originalBase === "/" ? "" : originalBase) + bestMount.path;

        try {
          await bestMount.router.handle(req, res, finalHandler);
        } finally {
          // Restore original path/baseUrl
          req.path = originalPath;
          req.baseUrl = originalBase;
        }

        return;
      }
    }

    try {
      if (this._options.monitoring) {
        this._stats.requests++;
      }

      // Créer le handler final qui fera le routing
      const routingHandler: NextFunction = async (err?: any) => {
        if (err) {
          return finalHandler(err);
        }

        // Essayer le radix tree d'abord
        if (this._radixTree) {
          const match = this._radixTree.find(
            req.method as HttpMethod,
            req.path
          );

          if (match) {
            // Fusionner ou remplacer les params
            if (this._options.mergeParams) {
              req.params = { ...req.params, ...match.params };
            } else {
              req.params = match.params;
            }

            // Exécuter les handlers de la route
            await this._executeRouteHandlers(
              match.route.handlers,
              req,
              res,
              finalHandler
            );

            if (this._options.monitoring) {
              this._stats.totalTime += Date.now() - startTime;
            }

            return;
          }
        }

        // Fallback: chercher dans les layers
        await this._executeLayerMatching(req, res, finalHandler);

        if (this._options.monitoring) {
          this._stats.totalTime += Date.now() - startTime;
        }
      };

      // D'abord exécuter la chaîne de middleware
      await this._middlewareStack.execute(req, res, routingHandler);
    } catch (error) {
      if (this._options.monitoring) {
        this._stats.errors++;
      }
      finalHandler(error);
    }
  }

  /**
   * Exécuter les handlers d'une route
   */
  private async _executeRouteHandlers(
    handlers: Middleware[],
    req: Request,
    res: Response,
    finalHandler: NextFunction
  ): Promise<void> {
    let index = 0;

    const next: NextFunction = async (err?: any) => {
      if (err) {
        // Try to handle error with router-local error middleware first
        const handled = await this._runLocalErrorMiddleware(
          err,
          req,
          res,
          finalHandler
        );
        if (handled) return;
        return finalHandler(err);
      }

      if (index >= handlers.length) return finalHandler();

      const handler = handlers[index++];

      try {
        await handler(req, res, next);
      } catch (error) {
        // On thrown error, use same local error handling path
        const handled = await this._runLocalErrorMiddleware(
          error,
          req,
          res,
          finalHandler
        );
        if (handled) return;
        finalHandler(error);
      }
    };

    await next();
  }

  /**
   * Try to run router-local error middleware matching the request path.
   * Returns true if the router executed local error middleware (even if that middleware called next),
   * otherwise false.
   */
  private async _runLocalErrorMiddleware(
    err: any,
    req: Request,
    res: Response,
    finalHandler: NextFunction
  ): Promise<boolean> {
    try {
      const entries: any[] = (this._middlewareStack as any).entries || [];
      const firstErrorIndex = entries.findIndex(
        (e) =>
          e.isErrorHandler &&
          (e.path === "*" || e.path === "/" || req.path.startsWith(e.path))
      );

      if (firstErrorIndex >= 0) {
        const routerFinal: NextFunction = async (e?: any) => {
          if (e) return finalHandler(e);
          return finalHandler();
        };

        await (this._middlewareStack as any).execute(
          req,
          res,
          routerFinal,
          firstErrorIndex,
          err
        );
        return true;
      }
    } catch (ex) {
      finalHandler(ex);
      return true;
    }

    return false;
  }

  /**
   * Matching par layers (fallback)
   */
  private async _executeLayerMatching(
    req: Request,
    res: Response,
    finalHandler: NextFunction
  ): Promise<void> {
    let index = 0;

    const next: NextFunction = async (err?: any) => {
      if (err) return finalHandler(err);
      if (index >= this._routeLayers.length) return finalHandler();

      const layer = this._routeLayers[index++];

      // Vérifier le matching
      if (!layer.match(req.path)) {
        return next();
      }

      // Vérifier la méthode
      if (layer.method !== req.method) {
        return next();
      }

      // Valider les contraintes
      if (layer.constraints) {
        const extraction = layer.extractParams(req.path);
        if (!extraction.valid || !layer.validateParams(extraction.params)) {
          return next();
        }
      }

      // Extraire les params
      const params = layer.params(req.path);
      if (this._options.mergeParams) {
        req.params = { ...req.params, ...params };
      } else {
        req.params = params;
      }

      // Exécuter le handler
      try {
        await (layer.handler as Middleware)(req, res, next);
      } catch (error) {
        next(error);
      }
    };

    await next();
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Obtenir toutes les routes enregistrées
   */
  getRoutes(): Array<{
    method: HttpMethod;
    path: string;
    metadata?: RouteMetadata;
  }> {
    const routes: Array<{
      method: HttpMethod;
      path: string;
      metadata?: RouteMetadata;
    }> = [];
    const seen = new Set<string>();

    for (const layer of this._routeLayers) {
      const key = `${layer.method}:${layer.path}`;
      if (seen.has(key)) continue;

      seen.add(key);
      routes.push({
        method: layer.method,
        path: layer.path,
        metadata: this._routeMetadata.get(key),
      });
    }

    return routes;
  }

  /**
   * Obtenir les statistiques
   */
  getStats() {
    return {
      ...this._stats,
      avgTime:
        this._stats.requests > 0
          ? this._stats.totalTime / this._stats.requests
          : 0,
      routes: this._routeLayers.length,
      middleware: this._middlewareStack.getStats(),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

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
        result[param] = { pattern: constraint, name: param };
      } else if (typeof constraint === "function") {
        result[param] = { validator: constraint, name: param };
      }
    }

    return result;
  }

  private _mergeRouter(router: Router): void {
    // Fusionner middleware
    this._middlewareStack.merge(router._middlewareStack, "");

    // Fusionner layers
    for (const layer of router._routeLayers) {
      this._routeLayers.push(layer);

      if (this._radixTree && layer.method !== "USE") {
        const constraints = layer.constraints
          ? this._parseConstraints(layer.constraints)
          : undefined;
        this._radixTree.add(
          layer.method,
          layer.path,
          [layer.handler as Middleware],
          constraints,
          layer.metadata
        );
      }
    }

    // Fusionner metadata
    router._routeMetadata.forEach((value, key) => {
      this._routeMetadata.set(key, value);
    });
  }
}
