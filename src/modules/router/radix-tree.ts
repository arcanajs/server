/**
 * ArcanaJS Radix Tree Router
 *
 * High-performance radix tree (trie) for O(log n) route matching.
 * Supports static paths, parameters, wildcards, and constraints.
 */

import type { HttpMethod, Middleware } from "../../types";

/**
 * Route parameter constraint
 */
export interface ParamConstraint {
  /** Regular expression pattern */
  pattern?: RegExp;
  /** Validator function */
  validator?: (value: string) => boolean;
}

/**
 * Route definition stored in the tree
 */
export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handlers: Middleware[];
  constraints?: Record<string, ParamConstraint>;
  paramNames: string[];
}

/**
 * Route match result
 */
export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

/**
 * Node types in the radix tree
 */
enum NodeType {
  STATIC = 0,
  PARAM = 1,
  CATCH_ALL = 2,
}

/**
 * Radix tree node
 */
interface RadixNode {
  /** Path segment */
  path: string;
  /** Node type */
  type: NodeType;
  /** Parameter name (for PARAM and CATCH_ALL) */
  paramName?: string;
  /** Child nodes keyed by first char or special keys */
  children: Map<string, RadixNode>;
  /** Route handlers by method */
  routes: Map<HttpMethod, RouteDefinition>;
  /** Priority for ordering (longer paths first) */
  priority: number;
  /** Wildcard child */
  wildcardChild?: RadixNode;
  /** Param child */
  paramChild?: RadixNode;
}

/**
 * Create a new radix node
 */
function createNode(path = "", type = NodeType.STATIC): RadixNode {
  return {
    path,
    type,
    children: new Map(),
    routes: new Map(),
    priority: 0,
  };
}

/**
 * RadixTree - High-performance route storage and matching
 */
export class RadixTree {
  private _root: RadixNode;
  private _routeCount = 0;

  constructor() {
    this._root = createNode();
  }

  /**
   * Add a route to the tree
   */
  add(
    method: HttpMethod,
    path: string,
    handlers: Middleware[],
    constraints?: Record<string, ParamConstraint>
  ): void {
    const paramNames: string[] = [];
    const segments = this._parsePath(path, paramNames);

    let node = this._root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      node = this._insert(node, segment);
    }

    const route: RouteDefinition = {
      method,
      path,
      handlers,
      constraints,
      paramNames,
    };

    node.routes.set(method, route);
    node.priority++;
    this._routeCount++;
  }

  /**
   * Find a matching route
   */
  find(method: HttpMethod, path: string): RouteMatch | null {
    const params: Record<string, string> = {};
    const segments = path.split("/").filter(Boolean);

    const node = this._search(this._root, segments, 0, params);
    if (!node) return null;

    // Check for exact method match
    let route = node.routes.get(method);

    // Check for USE (middleware match)
    if (!route) {
      route = node.routes.get("USE" as HttpMethod);
    }

    if (!route) return null;

    // Validate constraints
    if (route.constraints) {
      for (const [name, constraint] of Object.entries(route.constraints)) {
        const value = params[name];
        if (value !== undefined) {
          if (constraint.pattern && !constraint.pattern.test(value)) {
            return null;
          }
          if (constraint.validator && !constraint.validator(value)) {
            return null;
          }
        }
      }
    }

    return { route, params };
  }

  /**
   * Get all registered routes
   */
  get routes(): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    this._collectRoutes(this._root, routes);
    return routes;
  }

  /**
   * Get total route count
   */
  get count(): number {
    return this._routeCount;
  }

  /**
   * Parse path into segments with type info
   */
  private _parsePath(
    path: string,
    paramNames: string[]
  ): Array<{ path: string; type: NodeType; paramName?: string }> {
    const segments = path.split("/").filter(Boolean);
    return segments.map((segment) => {
      if (segment.startsWith(":")) {
        // Parameter segment - check for constraints like :id<\d+>
        const match = segment.match(/^:(\w+)(?:<(.+)>)?(\?)?$/);
        if (match) {
          const [, name, , optional] = match;
          paramNames.push(name);
          return {
            path: segment,
            type: NodeType.PARAM,
            paramName: name,
          };
        }
      } else if (segment === "*" || segment.startsWith("*")) {
        // Wildcard/catch-all segment
        const name = segment.length > 1 ? segment.slice(1) : "wildcard";
        paramNames.push(name);
        return {
          path: segment,
          type: NodeType.CATCH_ALL,
          paramName: name,
        };
      }
      return { path: segment, type: NodeType.STATIC };
    });
  }

  /**
   * Insert a segment into the tree
   */
  private _insert(
    parent: RadixNode,
    segment: { path: string; type: NodeType; paramName?: string }
  ): RadixNode {
    if (segment.type === NodeType.PARAM) {
      // Parameter node
      if (!parent.paramChild) {
        parent.paramChild = createNode(segment.path, NodeType.PARAM);
        parent.paramChild.paramName = segment.paramName;
      }
      return parent.paramChild;
    }

    if (segment.type === NodeType.CATCH_ALL) {
      // Wildcard node
      if (!parent.wildcardChild) {
        parent.wildcardChild = createNode(segment.path, NodeType.CATCH_ALL);
        parent.wildcardChild.paramName = segment.paramName;
      }
      return parent.wildcardChild;
    }

    // Static node - use first char as key
    const key = segment.path[0] || "";
    let child = parent.children.get(key);

    if (!child) {
      child = createNode(segment.path, NodeType.STATIC);
      parent.children.set(key, child);
      return child;
    }

    // Check for common prefix
    const commonLen = this._commonPrefixLength(child.path, segment.path);

    if (commonLen < child.path.length) {
      // Split existing node
      const splitChild = createNode(child.path.slice(commonLen), child.type);
      splitChild.children = child.children;
      splitChild.routes = child.routes;
      splitChild.priority = child.priority;
      splitChild.paramChild = child.paramChild;
      splitChild.wildcardChild = child.wildcardChild;

      child.path = child.path.slice(0, commonLen);
      child.children = new Map([[splitChild.path[0], splitChild]]);
      child.routes = new Map();
      child.paramChild = undefined;
      child.wildcardChild = undefined;
    }

    if (commonLen < segment.path.length) {
      // Need to add remaining path
      const remainingPath = segment.path.slice(commonLen);
      const remainingKey = remainingPath[0];
      let remainingChild = child.children.get(remainingKey);

      if (!remainingChild) {
        remainingChild = createNode(remainingPath, NodeType.STATIC);
        child.children.set(remainingKey, remainingChild);
      }

      return remainingChild;
    }

    return child;
  }

  /**
   * Search for a matching node
   */
  private _search(
    node: RadixNode,
    segments: string[],
    index: number,
    params: Record<string, string>
  ): RadixNode | null {
    // End of path
    if (index >= segments.length) {
      return node.routes.size > 0 ? node : null;
    }

    const segment = segments[index];

    // Try static match first (most specific)
    const staticChild = node.children.get(segment[0]);
    if (staticChild && segment.startsWith(staticChild.path)) {
      const result = this._search(staticChild, segments, index + 1, params);
      if (result) return result;
    }

    // Try all static children for exact match
    for (const [, child] of node.children) {
      if (child.path === segment) {
        const result = this._search(child, segments, index + 1, params);
        if (result) return result;
      }
    }

    // Try param match
    if (node.paramChild) {
      params[node.paramChild.paramName!] = segment;
      const result = this._search(node.paramChild, segments, index + 1, params);
      if (result) return result;
      delete params[node.paramChild.paramName!];
    }

    // Try wildcard match (catches rest of path)
    if (node.wildcardChild) {
      params[node.wildcardChild.paramName!] = segments.slice(index).join("/");
      return node.wildcardChild;
    }

    return null;
  }

  /**
   * Find common prefix length
   */
  private _commonPrefixLength(a: string, b: string): number {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a[i] === b[i]) i++;
    return i;
  }

  /**
   * Collect all routes from the tree
   */
  private _collectRoutes(node: RadixNode, routes: RouteDefinition[]): void {
    for (const route of node.routes.values()) {
      routes.push(route);
    }

    for (const child of node.children.values()) {
      this._collectRoutes(child, routes);
    }

    if (node.paramChild) {
      this._collectRoutes(node.paramChild, routes);
    }

    if (node.wildcardChild) {
      this._collectRoutes(node.wildcardChild, routes);
    }
  }
}
