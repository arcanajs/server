/**
 * ArcanaJS Radix Tree Router
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
  /** Constraint name for debugging */
  name?: string;
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
  metadata?: Record<string, any>;
  createdAt: number;
}

/**
 * Route match result
 */
export interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
  matchedPath: string;
}

/**
 * Radix tree statistics
 */
export interface RadixTreeStats {
  totalNodes: number;
  totalRoutes: number;
  staticNodes: number;
  paramNodes: number;
  wildcardNodes: number;
  maxDepth: number;
  avgDepth: number;
  memoryUsage: number;
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
  /** Priority for ordering (higher = checked first) */
  priority: number;
  /** Wildcard child */
  wildcardChild?: RadixNode;
  /** Param child */
  paramChild?: RadixNode;
  /** Parent node reference for traversal */
  parent?: RadixNode;
  /** Node depth in tree */
  depth: number;
}

/**
 * Create a new radix node
 */
function createNode(path = "", type = NodeType.STATIC, depth = 0): RadixNode {
  return {
    path,
    type,
    children: new Map(),
    routes: new Map(),
    priority: 0,
    depth,
  };
}

/**
 * RadixTree - High-performance route storage and matching
 */
export class RadixTree {
  private readonly _root: RadixNode;
  private _routeCount = 0;
  private _nodeCount = 1; // Start with root
  private _maxDepth = 0;

  // Performance tracking
  private _lookupCount = 0;
  private _cacheHits = 0;
  private _cache?: Map<string, RouteMatch | null>;
  private readonly _cacheEnabled: boolean;
  private readonly _maxCacheSize: number;

  constructor(options: { enableCache?: boolean; maxCacheSize?: number } = {}) {
    this._root = createNode();
    this._cacheEnabled = options.enableCache ?? true;
    this._maxCacheSize = options.maxCacheSize ?? 1000;

    if (this._cacheEnabled) {
      this._cache = new Map();
    }
  }

  /**
   * Add a route to the tree
   */
  add(
    method: HttpMethod,
    path: string,
    handlers: Middleware[],
    constraints?: Record<string, RegExp> | Record<string, ParamConstraint>,
    metadata?: Record<string, any>
  ): void {
    if (!path || typeof path !== "string") {
      throw new Error("Route path must be a non-empty string");
    }

    if (!handlers || handlers.length === 0) {
      throw new Error("Route must have at least one handler");
    }

    // Normalize path
    path = this._normalizePath(path);

    const paramNames: string[] = [];
    const segments = this._parsePath(path, paramNames);

    let node = this._root;
    let depth = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      depth++;
      node = this._insert(node, segment, depth);
    }

    // Update max depth
    if (depth > this._maxDepth) {
      this._maxDepth = depth;
    }

    // Parse constraints
    const routeConstraints: Record<string, ParamConstraint> = {};
    if (constraints) {
      for (const [name, value] of Object.entries(constraints)) {
        if (value instanceof RegExp) {
          routeConstraints[name] = { pattern: value, name };
        } else {
          routeConstraints[name] = { ...value, name };
        }
      }
    }

    // Create route definition
    const route: RouteDefinition = {
      method,
      path,
      handlers,
      constraints:
        Object.keys(routeConstraints).length > 0 ? routeConstraints : undefined,
      paramNames,
      metadata: metadata || {},
      createdAt: Date.now(),
    };

    // Store route
    if (node.routes.has(method)) {
      console.warn(`Route ${method} ${path} is being overwritten`);
    }

    node.routes.set(method, route);
    node.priority++;
    this._routeCount++;

    // Clear cache when routes are added
    this._cache?.clear();
  }

  /**
   * Find a matching route
   */
  find(method: HttpMethod, path: string): RouteMatch | null {
    this._lookupCount++;

    // Normalize path
    path = this._normalizePath(path);

    // Check cache
    const cacheKey = `${method}:${path}`;
    if (this._cache?.has(cacheKey)) {
      this._cacheHits++;
      return this._cache.get(cacheKey)!;
    }

    const segments = path.split("/").filter(Boolean);
    const match = this._search(this._root, method, segments, 0, {}, path);

    let result: RouteMatch | null = null;

    if (match) {
      // Check for exact method match first
      let route = match.node.routes.get(method);

      // Fall back to USE middleware
      if (!route && method !== "USE") {
        route = match.node.routes.get("USE" as HttpMethod);
      }

      if (route) {
        // Validate constraints
        if (
          route.constraints &&
          !this._validateConstraints(match.params, route.constraints)
        ) {
          result = null;
        } else {
          result = {
            route,
            params: match.params,
            matchedPath: path,
          };
        }
      }
    }

    // Update cache
    if (this._cache) {
      this._cache.set(cacheKey, result);

      // Prevent cache from growing too large
      if (this._cache.size > this._maxCacheSize) {
        const firstKey = this._cache.keys().next().value;
        if (typeof firstKey === "string") {
          this._cache.delete(firstKey);
        }
      }
    }

    return result;
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
   * Get routes for a specific method
   */
  getRoutesByMethod(method: HttpMethod): RouteDefinition[] {
    return this.routes.filter((route) => route.method === method);
  }

  /**
   * Check if a route exists
   */
  has(method: HttpMethod, path: string): boolean {
    return this.find(method, path) !== null;
  }

  /**
   * Remove a route
   */
  remove(method: HttpMethod, path: string): boolean {
    path = this._normalizePath(path);
    const segments = path.split("/").filter(Boolean);

    let node = this._root;
    for (const segment of segments) {
      let found = false;

      // Try static children
      for (const child of node.children.values()) {
        if (child.path === segment) {
          node = child;
          found = true;
          break;
        }
      }

      if (!found) return false;
    }

    const deleted = node.routes.delete(method);
    if (deleted) {
      this._routeCount--;
      this._cache?.clear();
    }

    return deleted;
  }

  /**
   * Clear all routes
   */
  clear(): void {
    this._root.children.clear();
    this._root.routes.clear();
    this._root.paramChild = undefined;
    this._root.wildcardChild = undefined;
    this._routeCount = 0;
    this._nodeCount = 1;
    this._maxDepth = 0;
    this._lookupCount = 0;
    this._cacheHits = 0;
    this._cache?.clear();
  }

  /**
   * Get total route count
   */
  get count(): number {
    return this._routeCount;
  }

  /**
   * Get tree statistics
   */
  getStats(): RadixTreeStats {
    const stats = {
      totalNodes: 0,
      totalRoutes: this._routeCount,
      staticNodes: 0,
      paramNodes: 0,
      wildcardNodes: 0,
      maxDepth: this._maxDepth,
      avgDepth: 0,
      memoryUsage: 0,
    };

    let totalDepth = 0;
    const countNodes = (node: RadixNode) => {
      stats.totalNodes++;
      totalDepth += node.depth;

      if (node.type === NodeType.STATIC) stats.staticNodes++;
      else if (node.type === NodeType.PARAM) stats.paramNodes++;
      else if (node.type === NodeType.CATCH_ALL) stats.wildcardNodes++;

      node.children.forEach((child) => countNodes(child));
      if (node.paramChild) countNodes(node.paramChild);
      if (node.wildcardChild) countNodes(node.wildcardChild);
    };

    countNodes(this._root);

    stats.avgDepth = stats.totalNodes > 0 ? totalDepth / stats.totalNodes : 0;

    // Rough memory estimation
    stats.memoryUsage = stats.totalNodes * 200; // Approximate bytes per node

    return stats;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      lookupCount: this._lookupCount,
      cacheHits: this._cacheHits,
      cacheEnabled: this._cacheEnabled,
      cacheSize: this._cache?.size ?? 0,
      hitRate:
        this._lookupCount > 0 ? (this._cacheHits / this._lookupCount) * 100 : 0,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this._cache?.clear();
    this._cacheHits = 0;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Normalize path
   */
  private _normalizePath(path: string): string {
    // Remove trailing slash except for root
    if (path !== "/" && path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    // Ensure leading slash
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    return path;
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
      // Parameter segment
      if (segment.startsWith(":")) {
        const match = segment.match(/^:(\w+)(?:<(.+)>)?(\?)?$/);
        if (match) {
          const [, name] = match;
          paramNames.push(name);
          return {
            path: segment,
            type: NodeType.PARAM,
            paramName: name,
          };
        }
      }

      // Wildcard/catch-all segment
      if (segment === "*" || segment.startsWith("*")) {
        const name = segment.length > 1 ? segment.slice(1) : "wildcard";
        paramNames.push(name);
        return {
          path: segment,
          type: NodeType.CATCH_ALL,
          paramName: name,
        };
      }

      // Static segment
      return { path: segment, type: NodeType.STATIC };
    });
  }

  /**
   * Insert a segment into the tree
   */
  private _insert(
    parent: RadixNode,
    segment: { path: string; type: NodeType; paramName?: string },
    depth: number
  ): RadixNode {
    // Parameter node
    if (segment.type === NodeType.PARAM) {
      if (!parent.paramChild) {
        parent.paramChild = createNode(segment.path, NodeType.PARAM, depth);
        parent.paramChild.paramName = segment.paramName;
        parent.paramChild.parent = parent;
        this._nodeCount++;
      }
      return parent.paramChild;
    }

    // Wildcard node
    if (segment.type === NodeType.CATCH_ALL) {
      if (!parent.wildcardChild) {
        parent.wildcardChild = createNode(
          segment.path,
          NodeType.CATCH_ALL,
          depth
        );
        parent.wildcardChild.paramName = segment.paramName;
        parent.wildcardChild.parent = parent;
        this._nodeCount++;
      }
      return parent.wildcardChild;
    }

    // Static node
    const key = segment.path[0] || "";
    let child = parent.children.get(key);

    if (!child) {
      child = createNode(segment.path, NodeType.STATIC, depth);
      child.parent = parent;
      parent.children.set(key, child);
      this._nodeCount++;
      return child;
    }

    // Check for common prefix
    const commonLen = this._commonPrefixLength(child.path, segment.path);

    if (commonLen < child.path.length) {
      // Split existing node
      const splitChild = createNode(
        child.path.slice(commonLen),
        child.type,
        depth + 1
      );
      splitChild.children = child.children;
      splitChild.routes = child.routes;
      splitChild.priority = child.priority;
      splitChild.paramChild = child.paramChild;
      splitChild.wildcardChild = child.wildcardChild;
      splitChild.parent = child;

      // Update children's parent references
      splitChild.children.forEach((c) => (c.parent = splitChild));
      if (splitChild.paramChild) splitChild.paramChild.parent = splitChild;
      if (splitChild.wildcardChild)
        splitChild.wildcardChild.parent = splitChild;

      child.path = child.path.slice(0, commonLen);
      child.children = new Map([[splitChild.path[0], splitChild]]);
      child.routes = new Map();
      child.paramChild = undefined;
      child.wildcardChild = undefined;

      this._nodeCount++;
    }

    if (commonLen < segment.path.length) {
      // Need to add remaining path
      const remainingPath = segment.path.slice(commonLen);
      const remainingKey = remainingPath[0];
      let remainingChild = child.children.get(remainingKey);

      if (!remainingChild) {
        remainingChild = createNode(remainingPath, NodeType.STATIC, depth + 1);
        remainingChild.parent = child;
        child.children.set(remainingKey, remainingChild);
        this._nodeCount++;
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
    method: HttpMethod,
    segments: string[],
    index: number,
    params: Record<string, string>,
    fullPath: string
  ): { node: RadixNode; params: Record<string, string> } | null {
    // Reached end of path
    if (index === segments.length) {
      if (node.routes.has(method) || node.routes.has("USE" as HttpMethod)) {
        return { node, params };
      }
      return null;
    }

    const segment = segments[index];
    const newIndex = index + 1;

    // 1. Try static routes first (highest priority)
    for (const child of node.children.values()) {
      if (child.path === segment) {
        const result = this._search(
          child,
          method,
          segments,
          newIndex,
          params,
          fullPath
        );
        if (result) return result;
      }
    }

    // 2. Try parametric routes
    if (node.paramChild) {
      const paramName = node.paramChild.paramName!;
      const newParams = { ...params, [paramName]: segment };
      const result = this._search(
        node.paramChild,
        method,
        segments,
        newIndex,
        newParams,
        fullPath
      );
      if (result) return result;
    }

    // 3. Try wildcard routes (lowest priority)
    if (node.wildcardChild) {
      const remainingPath = segments.slice(index).join("/");
      const wildcardParams = {
        ...params,
        [node.wildcardChild.paramName!]: remainingPath,
      };

      if (
        node.wildcardChild.routes.has(method) ||
        node.wildcardChild.routes.has("USE" as HttpMethod)
      ) {
        return {
          node: node.wildcardChild,
          params: wildcardParams,
        };
      }
    }

    return null;
  }

  /**
   * Validate constraints
   */
  private _validateConstraints(
    params: Record<string, string>,
    constraints: Record<string, ParamConstraint>
  ): boolean {
    for (const [paramName, constraint] of Object.entries(constraints)) {
      const value = params[paramName];

      if (value === undefined) {
        continue;
      }

      // Check pattern constraint
      if (constraint.pattern && !constraint.pattern.test(value)) {
        return false;
      }

      // Check validator function
      if (constraint.validator) {
        try {
          if (!constraint.validator(value)) {
            return false;
          }
        } catch (error) {
          console.error(`Constraint validation error for ${paramName}:`, error);
          return false;
        }
      }
    }

    return true;
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
