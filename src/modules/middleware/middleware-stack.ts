/**
 * ArcanaJS Middleware Stack - Production Ready
 *
 * Gestionnaire de middleware indépendant qui implémente la chaîne de responsabilité.
 * Peut être utilisé par Router et Application sans dépendance circulaire.
 */

import type {
  ErrorMiddleware,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";

/**
 * Entry dans la stack de middleware
 */
interface MiddlewareEntry {
  handler: Middleware | ErrorMiddleware;
  path: string;
  isErrorHandler: boolean;
  name?: string;
}

/**
 * Options pour l'exécution de middleware
 */
export interface ExecutionOptions {
  /** Fusionner les paramètres au lieu de les remplacer */
  mergeParams?: boolean;
  /** Timeout pour chaque middleware */
  timeout?: number;
  /** Callback appelé après chaque middleware */
  onMiddleware?: (entry: MiddlewareEntry, duration: number) => void;
}

/**
 * Gestionnaire de stack de middleware
 * Implémente le pattern Chain of Responsibility
 */
export class MiddlewareStack {
  private _stack: MiddlewareEntry[] = [];
  private _options: Required<ExecutionOptions>;

  constructor(options: ExecutionOptions = {}) {
    this._options = {
      mergeParams: options.mergeParams ?? false,
      timeout: options.timeout ?? 30000,
      onMiddleware: options.onMiddleware ?? (() => {}),
    };
  }

  // ============================================================================
  // STACK MANAGEMENT
  // ============================================================================

  /**
   * Ajouter un middleware à la stack
   */
  push(
    handler: Middleware | ErrorMiddleware,
    path: string = "/",
    name?: string
  ): void {
    if (typeof handler !== "function") {
      throw new TypeError("Middleware must be a function");
    }

    const entry: MiddlewareEntry = {
      handler,
      path,
      isErrorHandler: handler.length === 4,
      name: name || handler.name || "anonymous",
    };

    this._stack.push(entry);
  }

  /**
   * Ajouter plusieurs middlewares
   */
  pushMany(
    handlers: Array<Middleware | ErrorMiddleware>,
    path: string = "/",
    names?: string[]
  ): void {
    handlers.forEach((handler, index) => {
      const name = names?.[index];
      this.push(handler, path, name);
    });
  }

  /**
   * Obtenir la taille de la stack
   */
  get length(): number {
    return this._stack.length;
  }

  /**
   * Obtenir tous les entries
   */
  get entries(): ReadonlyArray<MiddlewareEntry> {
    return [...this._stack];
  }

  /**
   * Vider la stack
   */
  clear(): void {
    this._stack = [];
  }

  // ============================================================================
  // EXECUTION ENGINE
  // ============================================================================

  /**
   * Exécuter la chaîne de middleware
   * Implémente le pattern Chain of Responsibility
   */
  async execute(
    req: Request,
    res: Response,
    finalHandler: NextFunction,
    startIndex: number = 0
  ): Promise<void> {
    let currentIndex = startIndex;
    let currentError: any = undefined;

    /**
     * Fonction next() qui avance dans la chaîne
     */
    const next: NextFunction = async (err?: any): Promise<void> => {
      // Capturer l'erreur si présente
      if (err !== undefined) {
        currentError = err;
      }

      // Fin de la chaîne
      if (currentIndex >= this._stack.length) {
        return finalHandler(currentError);
      }

      const entry = this._stack[currentIndex++];
      const startTime = Date.now();

      try {
        // Créer un timeout pour ce middleware
        const timeoutPromise =
          this._options.timeout > 0
            ? new Promise<never>((_, reject) => {
                setTimeout(() => {
                  reject(new Error(`Middleware "${entry.name}" timeout`));
                }, this._options.timeout);
              })
            : null;

        // Exécuter le middleware avec timeout
        const executionPromise = this._executeMiddleware(
          entry,
          req,
          res,
          next,
          currentError
        );

        if (timeoutPromise) {
          await Promise.race([executionPromise, timeoutPromise]);
        } else {
          await executionPromise;
        }

        // Callback après exécution
        const duration = Date.now() - startTime;
        this._options.onMiddleware(entry, duration);
      } catch (error) {
        // Transmettre l'erreur au prochain middleware d'erreur
        await next(error);
      }
    };

    // Démarrer la chaîne
    await next(currentError);
  }

  /**
   * Exécuter un middleware individuel
   */
  private async _executeMiddleware(
    entry: MiddlewareEntry,
    req: Request,
    res: Response,
    next: NextFunction,
    error?: any
  ): Promise<void> {
    const { handler, isErrorHandler } = entry;

    // Si on a une erreur
    if (error !== undefined) {
      // Seuls les error handlers peuvent traiter les erreurs
      if (isErrorHandler) {
        await (handler as ErrorMiddleware)(error, req, res, next);
      } else {
        // Passer au suivant avec l'erreur
        await next(error);
      }
    }
    // Pas d'erreur
    else {
      // Les error handlers sont ignorés s'il n'y a pas d'erreur
      if (isErrorHandler) {
        await next();
      } else {
        await (handler as Middleware)(req, res, next);
      }
    }
  }

  // ============================================================================
  // FILTERING & UTILITIES
  // ============================================================================

  /**
   * Filtrer les middleware par path
   */
  filterByPath(path: string): MiddlewareEntry[] {
    return this._stack.filter((entry) => {
      if (entry.path === "*" || entry.path === "/") {
        return true;
      }
      return path.startsWith(entry.path);
    });
  }

  /**
   * Obtenir les stats de la stack
   */
  getStats() {
    return {
      total: this._stack.length,
      normal: this._stack.filter((e) => !e.isErrorHandler).length,
      error: this._stack.filter((e) => e.isErrorHandler).length,
      paths: [...new Set(this._stack.map((e) => e.path))],
    };
  }

  /**
   * Obtenir une représentation string pour debug
   */
  toString(): string {
    return this._stack
      .map((entry, i) => {
        const type = entry.isErrorHandler ? "[ERROR]" : "[NORMAL]";
        return `${i}: ${type} ${entry.name} @ ${entry.path}`;
      })
      .join("\n");
  }

  // ============================================================================
  // CLONING & COMPOSITION
  // ============================================================================

  /**
   * Créer une copie de cette stack
   */
  clone(): MiddlewareStack {
    const newStack = new MiddlewareStack(this._options);
    newStack._stack = [...this._stack];
    return newStack;
  }

  /**
   * Fusionner avec une autre stack
   */
  merge(other: MiddlewareStack, prefix: string = ""): void {
    for (const entry of other._stack) {
      const path = prefix ? this._joinPaths(prefix, entry.path) : entry.path;
      this.push(entry.handler, path, entry.name);
    }
  }

  /**
   * Joindre deux paths
   */
  private _joinPaths(base: string, path: string): string {
    if (base === "/" || base === "") return path;
    if (path === "/") return base;

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : "/" + path;

    return normalizedBase + normalizedPath;
  }
}

/**
 * Factory function pour créer une stack
 */
export function createMiddlewareStack(
  options?: ExecutionOptions
): MiddlewareStack {
  return new MiddlewareStack(options);
}
