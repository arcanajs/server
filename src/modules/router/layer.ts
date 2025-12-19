/**
 * ArcanaJS Layer
 *
 * Route layer with enhanced matching capabilities.
 */

import type { ErrorMiddleware, HttpMethod, Middleware } from "../../types";
import type { RouteConstraints } from "./router";

/**
 * Layer - Represents a single route or middleware in the stack
 */
export class Layer {
  public method: HttpMethod;
  public path: string;
  public handler: Middleware | ErrorMiddleware;
  public fast_slash: boolean;
  public regexp: RegExp;
  public keys: string[] = [];
  public constraints?: RouteConstraints;
  public optional: Set<string> = new Set();

  constructor(
    path: string,
    method: HttpMethod,
    handler: Middleware | ErrorMiddleware
  ) {
    this.path = path;
    this.method = method;
    this.handler = handler;
    this.fast_slash = path === "*" || path === "/";

    // Build regex pattern with support for:
    // - :param (required parameter)
    // - :param? (optional parameter)
    // - :param<pattern> (constrained parameter)
    // - * (wildcard)
    // - ** (catch-all)
    let pattern = path
      .replace(/\//g, "\\/")
      .replace(
        /:(\w+)(?:<([^>]+)>)?(\?)?/g,
        (
          _,
          name: string,
          constraint: string | undefined,
          optional: string | undefined
        ) => {
          this.keys.push(name);
          if (optional) {
            this.optional.add(name);
          }
          const regex = constraint || "[^\\/]+";
          return optional
            ? `(?:(?<${name}>${regex}))?`
            : `(?<${name}>${regex})`;
        }
      )
      .replace(/\*\*/g, "(?<catchAll>.*)")
      .replace(/\*/g, "(?<wildcard>[^\\/]+)");

    // Make trailing slash optional for USE middleware
    if (method === "USE" && !path.endsWith("/") && path !== "*") {
      pattern = pattern + "(?:\\/.*)?";
    }

    this.regexp = new RegExp(`^${pattern}${path === "*" ? "" : "$"}`, "i");
  }

  /**
   * Check if this layer matches the given path
   */
  match(path: string): boolean {
    if (this.path === "*") return true;
    if (this.method === "USE" && path.startsWith(this.path)) return true;
    if (this.fast_slash && path === "/") return true;
    return this.regexp.test(path);
  }

  /**
   * Extract parameters from the path
   */
  params(path: string): Record<string, string> {
    const match = this.regexp.exec(path);
    if (!match) return {};

    const params: Record<string, string> = {};

    // Use named groups if available
    if (match.groups) {
      for (const [key, value] of Object.entries(match.groups)) {
        if (value !== undefined) {
          params[key] = value;
        }
      }
    } else {
      // Fallback to indexed groups
      this.keys.forEach((key, i) => {
        if (match[i + 1] !== undefined) {
          params[key] = match[i + 1];
        }
      });
    }

    return params;
  }

  /**
   * Check if handler is an error handler (has 4 parameters)
   */
  get isErrorHandler(): boolean {
    return this.handler.length === 4;
  }

  /**
   * Create a string representation for debugging
   */
  toString(): string {
    return `Layer { method: ${this.method}, path: ${this.path} }`;
  }
}
