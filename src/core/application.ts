import path from "node:path";
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
import { Router } from "./router";
import { View } from "./view";

export class Application {
  private _router: Router = new Router();
  private _settings: Record<string, any> = {};
  private _plugins: Plugin[] = [];
  private _engines: Record<string, any> = {};
  private _extensions = {
    request: new Map<string, Function>(),
    response: new Map<string, Function>(),
  };
  private _hooks = new Map<string, Function[]>();

  public locals: Record<string, any> = {};

  constructor() {
    this.set("env", process.env.NODE_ENV || "development");
    this.set("x-powered-by", true);
    this.set("views", path.resolve("views"));
    this.set("view", View);

    // Default multipart configuration
    this.set("multipart", {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tempDir: "/tmp",
    });
  }

  engine(
    ext: string,
    fn: (path: string, options: any) => Promise<string> | string
  ): this {
    const extension = ext[0] !== "." ? "." + ext : ext;
    this._engines[extension] = fn;
    return this;
  }

  set(setting: string, val: any): this {
    this._settings[setting] = val;
    return this;
  }

  /**
   * Configure multipart form data parsing options
   *
   * @param options Multipart configuration options
   * @returns this for chaining
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

  get(path: string, ...handlers: (Middleware | ErrorMiddleware)[]): any {
    if (handlers.length === 0) {
      return this._settings[path];
    }
    return this.route("GET", path, ...(handlers as Middleware[]));
  }

  use(
    path: string | Middleware | ErrorMiddleware | Application | Router,
    ...handlers: (Middleware | ErrorMiddleware | Application | Router)[]
  ) {
    if (path instanceof Application || path instanceof Router) {
      this._router.use("/", (req, res, next) => path.handle(req, res, next));
    } else if (typeof path === "string") {
      handlers.forEach((h) => {
        if (h instanceof Application || h instanceof Router) {
          this._router.use(path, (req, res, next) => h.handle(req, res, next));
        } else {
          this._router.use(path, h as Middleware);
        }
      });
    } else {
      const fns = [path, ...handlers];
      fns.forEach((h) => {
        if (h instanceof Application || h instanceof Router) {
          this._router.use("/", (req, res, next) => h.handle(req, res, next));
        } else {
          this._router.use("/", h as Middleware);
        }
      });
    }
    return this;
  }

  // HTTP methods proxy
  route(method: HttpMethod, path: string, ...handlers: Middleware[]) {
    this._router.route(method, path, ...handlers);
    return this;
  }

  post(path: string, ...handlers: Middleware[]) {
    return this.route("POST", path, ...handlers);
  }
  put(path: string, ...handlers: Middleware[]) {
    return this.route("PUT", path, ...handlers);
  }
  delete(path: string, ...handlers: Middleware[]) {
    return this.route("DELETE", path, ...handlers);
  }
  patch(path: string, ...handlers: Middleware[]) {
    return this.route("PATCH", path, ...handlers);
  }

  // Plugin System
  plugin(plugin: Plugin): this {
    this._plugins.push(plugin);
    plugin.install(this);
    return this;
  }

  // Extension System (Non-monkey patching)
  extend(type: "request" | "response", name: string, fn: Function): this {
    this._extensions[type].set(name, fn);
    return this;
  }

  on(hook: string, fn: Function): this {
    if (!this._hooks.has(hook)) {
      this._hooks.set(hook, []);
    }
    this._hooks.get(hook)!.push(fn);
    return this;
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

  private async _runHooks(hook: string, ...args: any[]): Promise<void> {
    const hooks = this._hooks.get(hook) || [];
    for (const fn of hooks) {
      await fn(...args);
    }
  }

  async runStartHooks(): Promise<void> {
    await this._runHooks("onStart");
  }

  async runStopHooks(): Promise<void> {
    await this._runHooks("onStop");
  }

  async runBeforeRequestHooks(req: Request): Promise<void> {
    await this._runHooks("beforeRequest", req);
  }

  async runAfterRequestHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterRequest", req, res);
  }

  async runBeforeResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("beforeResponse", req, res);
  }

  async runAfterResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterResponse", req, res);
  }

  async runOnErrorHooks(err: any, req: Request, res: Response): Promise<void> {
    await this._runHooks("onError", err, req, res);
  }

  async runOnSuccessHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("onSuccess", req, res);
  }

  async handle(req: Request, res: Response, next: NextFunction) {
    // Apply extensions
    this._applyExtensions(req, res);
    await this._router.handle(req, res, next);
  }

  async render(
    name: string,
    options: any = {},
    callback?: (err: Error | null, html?: string) => void
  ): Promise<string> {
    const opts = { ...this.locals, ...options };
    const ViewConfig = this.get("view");
    const view = new ViewConfig(name, {
      defaultEngine: this.get("view engine"),
      root: this.get("views"),
      engines: this._engines,
    });

    try {
      if (!view.path) await view.resolvePath(this.get("views"));
      const html = await view.render(opts);
      if (callback) callback(null, html);
      return html;
    } catch (err: any) {
      if (callback) callback(err);
      throw err;
    }
  }

  private _applyExtensions(req: Request, res: Response) {
    this._extensions.request.forEach((fn, name) => {
      req[name] = fn.bind(req);
    });
    this._extensions.response.forEach((fn, name) => {
      res[name] = fn.bind(res);
    });
  }

  /**
   * Main entry point from server adapters
   */
  async fetch(nativeRequest: globalThis.Request): Promise<globalThis.Response> {
    const arcanajsReq = new RequestImpl(nativeRequest, this);

    // This promise will resolve when the response is ready to be sent to the client
    let responseResolver: (res: globalThis.Response) => void;
    const responsePromise = new Promise<globalThis.Response>((resolve) => {
      responseResolver = resolve;
    });

    const arcanajsRes = new ResponseImpl(responseResolver!, this, arcanajsReq);
    arcanajsRes.req = arcanajsReq;

    // Track the lifecycle separately
    const lifecycle = (async () => {
      try {
        await this.runBeforeRequestHooks(arcanajsReq);

        const done = async (err?: any) => {
          if (err) {
            await this.runOnErrorHooks(err, arcanajsReq, arcanajsRes);
            console.error(err);
            if (!arcanajsRes.sent) {
              await arcanajsRes
                .status(500)
                .json({ error: "Internal Server Error" });
            }
          } else if (!arcanajsRes.sent) {
            await arcanajsRes.status(404).send("Not Found");
          }
        };

        await this.handle(arcanajsReq, arcanajsRes, done);

        // Wait for response to be sent if the router finished early
        if (!arcanajsRes.sent) {
          await Promise.race([
            responsePromise,
            new Promise((r) => setTimeout(r, 100)),
          ]).catch(() => {});
        }
      } catch (err) {
        await this.runOnErrorHooks(err, arcanajsReq, arcanajsRes);
        console.error(err);
        if (!arcanajsRes.sent) {
          await arcanajsRes.status(500).json({ error: "Internal Server Error" });
        }
      } finally {
        if (arcanajsRes.sent) {
          await this.runOnSuccessHooks(arcanajsReq, arcanajsRes);
        }
        await this.runAfterRequestHooks(arcanajsReq, arcanajsRes);
      }
    })();

    // Return the response as soon as it's ready, but let lifecycle finish
    return responsePromise;
  }

  listen(port: number, callback?: () => void) {
    // This will be overridden by the server adapter or used as a hint
    console.warn(
      "Application.listen is ready. Use a server adapter like server/bun.ts to start."
    );
  }
}

export const arcanajs = () => new Application();
