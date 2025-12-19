import type { ErrorMiddleware, HttpMethod, Middleware } from "../types";

export class Layer {
  public method: HttpMethod;
  public path: string;
  public handler: Middleware | ErrorMiddleware;
  public fast_slash: boolean;
  public regexp: RegExp;
  public keys: any[] = [];

  constructor(
    path: string,
    method: HttpMethod,
    handler: Middleware | ErrorMiddleware
  ) {
    this.path = path;
    this.method = method;
    this.handler = handler;
    this.fast_slash = path === "*" || path === "/";

    // Simple regex for path matching (for now, handles :id)
    const pattern = path.replace(/\//g, "\\/").replace(/:(\w+)/g, (_, key) => {
      this.keys.push(key);
      return "([^\\/]+)";
    });

    this.regexp = new RegExp(`^${pattern}${path === "*" ? "" : "$"}`);
  }

  match(path: string): boolean {
    if (this.path === "*") return true;
    if (this.method === "USE" && path.startsWith(this.path)) return true;
    if (this.fast_slash && path === "/") return true;
    return this.regexp.test(path);
  }

  params(path: string): Record<string, string> {
    const match = this.regexp.exec(path);
    if (!match) return {};
    const params: Record<string, string> = {};
    this.keys.forEach((key, i) => {
      params[key] = match[i + 1];
    });
    return params;
  }
}
