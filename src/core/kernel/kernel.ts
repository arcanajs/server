/**
 * ArcanaJS Core Kernel
 *
 * The kernel is the minimal orchestration layer that loads and coordinates modules.
 * It provides a clean, modular architecture for the framework.
 */

/**
 * Module interface that all ArcanaJS modules must implement
 */
export interface ArcanaJSModule {
  /** Unique name of the module */
  name: string;
  /** Version of the module */
  version: string;
  /** Dependencies on other modules (by name) */
  dependencies?: string[];
  /** Initialize the module with the kernel instance */
  init(kernel: ArcanaJSKernel): void | Promise<void>;
  /** Clean up resources when shutting down */
  destroy?(): void | Promise<void>;
}

/**
 * Kernel configuration options
 */
export interface KernelOptions {
  /** Enable debug mode */
  debug?: boolean;
  /** Environment (development/production/test) */
  env?: string;
  /** Trust proxy settings */
  trustProxy?: boolean | string | number;
}

/**
 * Kernel event types
 */
export type KernelEvent =
  | "module:registered"
  | "module:initialized"
  | "module:destroyed"
  | "kernel:booted"
  | "kernel:shutdown";

/**
 * Event listener type
 */
export type KernelEventListener = (...args: any[]) => void | Promise<void>;

/**
 * ArcanaJSKernel - The heart of ArcanaJS framework
 *
 * This is a minimal core that orchestrates modules without containing
 * business logic itself. All functionality comes from modules.
 */
export class ArcanaJSKernel {
  private _modules = new Map<string, ArcanaJSModule>();
  private _initializedModules = new Set<string>();
  private _settings = new Map<string, any>();
  private _events = new Map<string, KernelEventListener[]>();
  private _booted = false;

  readonly options: KernelOptions;

  constructor(options: KernelOptions = {}) {
    this.options = {
      debug: false,
      env: process.env.NODE_ENV || "development",
      trustProxy: false,
      ...options,
    };

    // Set default settings
    this._settings.set("env", this.options.env);
    this._settings.set("debug", this.options.debug);
    this._settings.set("trust proxy", this.options.trustProxy);
  }

  /**
   * Register a module with the kernel
   */
  register(module: ArcanaJSModule): this {
    if (this._modules.has(module.name)) {
      throw new Error(`Module "${module.name}" is already registered`);
    }

    this._modules.set(module.name, module);
    this._emit("module:registered", module);

    if (this.options.debug) {
      console.log(
        `[ArcanaJS] Module registered: ${module.name}@${module.version}`
      );
    }

    return this;
  }

  /**
   * Get a registered module by name
   */
  get<T extends ArcanaJSModule>(name: string): T | undefined {
    return this._modules.get(name) as T | undefined;
  }

  /**
   * Check if a module is registered
   */
  has(name: string): boolean {
    return this._modules.has(name);
  }

  /**
   * Get or set a setting value
   */
  setting(key: string): any;
  setting(key: string, value: any): this;
  setting(key: string, value?: any): any {
    if (arguments.length === 1) {
      return this._settings.get(key);
    }
    this._settings.set(key, value);
    return this;
  }

  /**
   * Boot the kernel - initialize all registered modules
   */
  async boot(): Promise<void> {
    if (this._booted) {
      throw new Error("Kernel is already booted");
    }

    // Sort modules by dependencies
    const sortedModules = this._sortByDependencies();

    // Initialize modules in order
    for (const module of sortedModules) {
      await this._initializeModule(module);
    }

    this._booted = true;
    await this._emit("kernel:booted");

    if (this.options.debug) {
      console.log(
        `[ArcanaJS] Kernel booted with ${this._modules.size} modules`
      );
    }
  }

  /**
   * Shutdown the kernel - destroy all modules in reverse order
   */
  async shutdown(): Promise<void> {
    if (!this._booted) {
      return;
    }

    // Get modules in reverse initialization order
    const sortedModules = Array.from(this._initializedModules)
      .map((name) => this._modules.get(name)!)
      .reverse();

    for (const module of sortedModules) {
      try {
        if (module.destroy) {
          await module.destroy();
        }
        this._initializedModules.delete(module.name);
        await this._emit("module:destroyed", module);

        if (this.options.debug) {
          console.log(`[ArcanaJS] Module destroyed: ${module.name}`);
        }
      } catch (error) {
        console.error(
          `[ArcanaJS] Error destroying module ${module.name}:`,
          error
        );
      }
    }

    this._booted = false;
    await this._emit("kernel:shutdown");

    if (this.options.debug) {
      console.log("[ArcanaJS] Kernel shutdown complete");
    }
  }

  /**
   * Check if the kernel is booted
   */
  get booted(): boolean {
    return this._booted;
  }

  /**
   * Subscribe to kernel events
   */
  on(event: KernelEvent, listener: KernelEventListener): this {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event)!.push(listener);
    return this;
  }

  /**
   * Remove an event listener
   */
  off(event: KernelEvent, listener: KernelEventListener): this {
    const listeners = this._events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Emit an event
   */
  private async _emit(event: KernelEvent, ...args: any[]): Promise<void> {
    const listeners = this._events.get(event) || [];
    for (const listener of listeners) {
      await listener(...args);
    }
  }

  /**
   * Initialize a single module
   */
  private async _initializeModule(module: ArcanaJSModule): Promise<void> {
    if (this._initializedModules.has(module.name)) {
      return;
    }

    // Check dependencies
    if (module.dependencies) {
      for (const dep of module.dependencies) {
        if (!this._initializedModules.has(dep)) {
          const depModule = this._modules.get(dep);
          if (!depModule) {
            throw new Error(
              `Module "${module.name}" depends on "${dep}" which is not registered`
            );
          }
          await this._initializeModule(depModule);
        }
      }
    }

    await module.init(this);
    this._initializedModules.add(module.name);
    await this._emit("module:initialized", module);

    if (this.options.debug) {
      console.log(`[ArcanaJS] Module initialized: ${module.name}`);
    }
  }

  /**
   * Sort modules by their dependencies (topological sort)
   */
  private _sortByDependencies(): ArcanaJSModule[] {
    const sorted: ArcanaJSModule[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(
          `Circular dependency detected involving module "${name}"`
        );
      }

      visiting.add(name);
      const module = this._modules.get(name);
      if (!module) return;

      if (module.dependencies) {
        for (const dep of module.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(name);
      visited.add(name);
      sorted.push(module);
    };

    for (const name of this._modules.keys()) {
      visit(name);
    }

    return sorted;
  }
}

/**
 * Create a new kernel instance
 */
export function createKernel(options?: KernelOptions): ArcanaJSKernel {
  return new ArcanaJSKernel(options);
}
