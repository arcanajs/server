/**
 * Module Loader - Lazy loading system for ArcanaJS modules
 */

import type { ArcanaJSModule } from "./kernel";

/**
 * Module factory function type
 */
export type ModuleFactory<T extends ArcanaJSModule = ArcanaJSModule> = () =>
  | T
  | Promise<T>;

/**
 * Module definition for lazy loading
 */
export interface ModuleDefinition {
  name: string;
  factory: ModuleFactory;
  dependencies?: string[];
}

/**
 * Module Loader - Handles lazy loading and caching of modules
 */
export class ModuleLoader {
  private _definitions = new Map<string, ModuleDefinition>();
  private _cache = new Map<string, ArcanaJSModule>();
  private _loading = new Map<string, Promise<ArcanaJSModule>>();

  /**
   * Register a module factory for lazy loading
   */
  define(name: string, factory: ModuleFactory, dependencies?: string[]): this {
    this._definitions.set(name, { name, factory, dependencies });
    return this;
  }

  /**
   * Check if a module is defined
   */
  has(name: string): boolean {
    return this._definitions.has(name) || this._cache.has(name);
  }

  /**
   * Load a module (lazy)
   */
  async load<T extends ArcanaJSModule>(name: string): Promise<T> {
    // Return from cache if already loaded
    if (this._cache.has(name)) {
      return this._cache.get(name) as T;
    }

    // Return existing loading promise if already loading
    if (this._loading.has(name)) {
      return this._loading.get(name) as Promise<T>;
    }

    const definition = this._definitions.get(name);
    if (!definition) {
      throw new Error(`Module "${name}" is not defined`);
    }

    // Load dependencies first
    if (definition.dependencies) {
      await Promise.all(definition.dependencies.map((dep) => this.load(dep)));
    }

    // Create loading promise
    const loadingPromise = (async () => {
      const module = await definition.factory();
      this._cache.set(name, module);
      this._loading.delete(name);
      return module;
    })();

    this._loading.set(name, loadingPromise);
    return loadingPromise as Promise<T>;
  }

  /**
   * Preload multiple modules
   */
  async preload(...names: string[]): Promise<ArcanaJSModule[]> {
    return Promise.all(names.map((name) => this.load(name)));
  }

  /**
   * Clear the module cache
   */
  clear(): void {
    this._cache.clear();
  }

  /**
   * Get all defined module names
   */
  get definedModules(): string[] {
    return Array.from(this._definitions.keys());
  }

  /**
   * Get all loaded module names
   */
  get loadedModules(): string[] {
    return Array.from(this._cache.keys());
  }
}

/**
 * Default module loader instance
 */
export const moduleLoader = new ModuleLoader();

/**
 * Register built-in module factories
 */
export function registerBuiltinModules(loader: ModuleLoader): void {
  // Router module
  loader.define("router", async () => {
    const { RouterModule } = await import("../../modules/router");
    return new RouterModule();
  });

  // Middleware engine module
  loader.define("middleware", async () => {
    const { MiddlewareModule } = await import("../../modules/middleware");
    return new MiddlewareModule();
  });

  // HTTP module
  loader.define(
    "http",
    async () => {
      const { HttpModule } = await import("../../modules/http");
      return new HttpModule();
    },
    ["router", "middleware"]
  );

  // Security module
  loader.define("security", async () => {
    const { SecurityModule } = await import("../../modules/security");
    return new SecurityModule();
  });
}
