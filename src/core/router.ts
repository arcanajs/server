import type {
  ErrorMiddleware,
  HttpMethod,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../types";
import { Layer } from "./layer";

export class Router {
  public stack: Layer[] = [];

  use(path: string | Middleware, ...handlers: Middleware[]) {
    let p = "/";
    let fns = handlers;

    if (typeof path === "string") {
      p = path;
    } else {
      fns = [path, ...handlers];
    }

    fns.forEach((fn) => {
      this.stack.push(new Layer(p, "USE", fn));
    });
    return this;
  }

  route(method: HttpMethod, path: string, ...handlers: Middleware[]) {
    handlers.forEach((fn) => {
      this.stack.push(new Layer(path, method, fn));
    });
    return this;
  }

  get(path: string, ...handlers: Middleware[]) {
    return this.route("GET", path, ...handlers);
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

  async handle(req: Request, res: Response, out: NextFunction) {
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

      // Method matching: 'USE' matches everything, otherwise must match exactly
      if (layer.method !== "USE" && layer.method !== req.method) {
        return next(err);
      }

      // Handle mounting (path stripping) for USE
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
        // Restore paths
        req.path = originalPath;
        req.baseUrl = originalBaseUrl;
      }
    };

    await next();
  }
}
