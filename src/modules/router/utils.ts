/**
 * ArcanaJS Router Utilities - Production Ready
 *
 * Helper functions for route management:
 * - Path normalization
 * - Route validation
 * - Pattern matching
 * - Debugging utilities
 *
 * @module modules/router/utils
 */

/**
 * Path normalization options
 */
export interface PathNormalizationOptions {
  /** Remove trailing slash */
  removeTrailingSlash?: boolean;
  /** Ensure leading slash */
  ensureLeadingSlash?: boolean;
  /** Convert to lowercase */
  lowercase?: boolean;
  /** Remove duplicate slashes */
  removeDuplicateSlashes?: boolean;
}

/**
 * Route information
 */
export interface RouteInfo {
  method: string;
  path: string;
  paramNames: string[];
  optionalParams: string[];
  requiredParams: string[];
  hasConstraints: boolean;
  isWildcard: boolean;
}

/**
 * Normalize a router path
 */
export function normalizeRouterPath(
  path: string,
  options: PathNormalizationOptions = {}
): string {
  if (!path || typeof path !== "string") {
    throw new TypeError("Path must be a non-empty string");
  }

  const {
    removeTrailingSlash = true,
    ensureLeadingSlash = true,
    lowercase = false,
    removeDuplicateSlashes = true,
  } = options;

  let normalized = path;

  // Convert to lowercase if requested
  if (lowercase) {
    normalized = normalized.toLowerCase();
  }

  // Remove duplicate slashes
  if (removeDuplicateSlashes) {
    normalized = normalized.replace(/\/+/g, "/");
  }

  // Ensure leading slash
  if (ensureLeadingSlash && !normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }

  // Remove trailing slash (except for root)
  if (removeTrailingSlash && normalized !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Validate a route path
 */
export function validateRoutePath(path: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check if path is a string
  if (typeof path !== "string") {
    errors.push("Path must be a string");
    return { valid: false, errors };
  }

  // Check if path is empty
  if (path.length === 0) {
    errors.push("Path cannot be empty");
    return { valid: false, errors };
  }

  // Check for leading slash
  if (!path.startsWith("/") && path !== "*") {
    errors.push("Path must start with /");
  }

  // Check for invalid characters
  if (/[\s\n\r\t]/.test(path)) {
    errors.push("Path contains invalid whitespace characters");
  }

  // Check for invalid parameter syntax
  const paramMatches = path.match(/:(\w+)(<[^>]*>)?(\?)?/g);
  if (paramMatches) {
    const paramNames = new Set<string>();

    for (const match of paramMatches) {
      const nameMatch = match.match(/:(\w+)/);
      if (nameMatch) {
        const name = nameMatch[1];

        // Check for duplicate parameter names
        if (paramNames.has(name)) {
          errors.push(`Duplicate parameter name: ${name}`);
        }
        paramNames.add(name);
      }
    }
  }

  // Check for multiple wildcards
  const wildcardCount = (path.match(/\*/g) || []).length;
  if (wildcardCount > 1) {
    const catchAllCount = (path.match(/\*\*/g) || []).length;
    if (wildcardCount - catchAllCount > 1) {
      errors.push("Path can only contain one wildcard (*)");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract route information
 */
export function extractRouteInfo(
  path: string,
  method: string = "GET"
): RouteInfo {
  const paramNames: string[] = [];
  const optionalParams: string[] = [];
  const requiredParams: string[] = [];
  let hasConstraints = false;
  const isWildcard = path.includes("*");

  // Extract parameters
  const paramMatches = path.matchAll(/:(\w+)(<([^>]+)>)?(\?)?/g);

  for (const match of paramMatches) {
    const name = match[1];
    const hasConstraint = !!match[2];
    const isOptional = !!match[4];

    paramNames.push(name);

    if (isOptional) {
      optionalParams.push(name);
    } else {
      requiredParams.push(name);
    }

    if (hasConstraint) {
      hasConstraints = true;
    }
  }

  return {
    method,
    path,
    paramNames,
    optionalParams,
    requiredParams,
    hasConstraints,
    isWildcard,
  };
}

/**
 * Check if two paths are similar (for detecting duplicates)
 */
export function pathsAreSimilar(path1: string, path2: string): boolean {
  // Normalize both paths
  const normalized1 = normalizeRouterPath(path1);
  const normalized2 = normalizeRouterPath(path2);

  // Exact match
  if (normalized1 === normalized2) {
    return true;
  }

  // Check if parameter names differ but structure is same
  const pattern1 = normalized1.replace(/:(\w+)(<[^>]*>)?(\?)?/g, ":param$3");
  const pattern2 = normalized2.replace(/:(\w+)(<[^>]*>)?(\?)?/g, ":param$3");

  return pattern1 === pattern2;
}

/**
 * Generate a regex pattern from a route path (for documentation/testing)
 */
export function pathToRegex(path: string): RegExp {
  let pattern = path
    .replace(/\//g, "\\/")
    .replace(
      /:(\w+)(<([^>]+)>)?(\?)?/g,
      (_, name, __, constraint, optional) => {
        const regex = constraint || "[^\\/]+";
        return optional ? `(?:${regex})?` : `(${regex})`;
      }
    )
    .replace(/\*\*/g, "(.*)")
    .replace(/(?<!\*)\*(?!\*)/g, "([^\\/]+)");

  return new RegExp(`^${pattern}$`, "i");
}

/**
 * Format route path for display
 */
export function formatRoutePath(
  path: string,
  params?: Record<string, string>
): string {
  if (!params) {
    return path;
  }

  let formatted = path;

  for (const [key, value] of Object.entries(params)) {
    formatted = formatted.replace(
      new RegExp(`:${key}(<[^>]*>)?(\\?)?`, "g"),
      value
    );
  }

  return formatted;
}

/**
 * Parse route pattern into segments
 */
export function parseRoutePattern(path: string): Array<{
  type: "static" | "param" | "wildcard";
  value: string;
  optional: boolean;
  constraint?: string;
}> {
  const segments: Array<{
    type: "static" | "param" | "wildcard";
    value: string;
    optional: boolean;
    constraint?: string;
  }> = [];

  const parts = path.split("/").filter(Boolean);

  for (const part of parts) {
    if (part.startsWith(":")) {
      const match = part.match(/^:(\w+)(?:<([^>]+)>)?(\?)?$/);
      if (match) {
        segments.push({
          type: "param",
          value: match[1],
          optional: !!match[3],
          constraint: match[2],
        });
      }
    } else if (part === "*" || part.startsWith("*")) {
      segments.push({
        type: "wildcard",
        value: part.length > 1 ? part.slice(1) : "wildcard",
        optional: false,
      });
    } else {
      segments.push({
        type: "static",
        value: part,
        optional: false,
      });
    }
  }

  return segments;
}

/**
 * Generate route documentation
 */
export function generateRouteDocumentation(
  method: string,
  path: string,
  description?: string
): string {
  const info = extractRouteInfo(path, method);

  let doc = `${method} ${path}\n`;

  if (description) {
    doc += `  Description: ${description}\n`;
  }

  if (info.paramNames.length > 0) {
    doc += "  Parameters:\n";

    for (const param of info.requiredParams) {
      doc += `    - ${param} (required)\n`;
    }

    for (const param of info.optionalParams) {
      doc += `    - ${param} (optional)\n`;
    }
  }

  if (info.hasConstraints) {
    doc += "  Has parameter constraints\n";
  }

  if (info.isWildcard) {
    doc += "  Contains wildcard matching\n";
  }

  return doc;
}

/**
 * Check if a path matches a pattern
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const regex = pathToRegex(pattern);
  return regex.test(path);
}

/**
 * Extract parameters from a path using a pattern
 */
export function extractParameters(
  path: string,
  pattern: string
): Record<string, string> | null {
  const info = extractRouteInfo(pattern);
  const regex = pathToRegex(pattern);
  const match = regex.exec(path);

  if (!match) {
    return null;
  }

  const params: Record<string, string> = {};

  info.paramNames.forEach((name, index) => {
    const value = match[index + 1];
    if (value !== undefined) {
      params[name] = decodeURIComponent(value);
    }
  });

  return params;
}

/**
 * Merge route parameters
 */
export function mergeRouteParams(
  ...paramSets: Record<string, string>[]
): Record<string, string> {
  return Object.assign({}, ...paramSets);
}

/**
 * Compare two routes for sorting
 */
export function compareRoutes(a: RouteInfo, b: RouteInfo): number {
  // Static routes come first
  const aHasParams = a.paramNames.length > 0 || a.isWildcard;
  const bHasParams = b.paramNames.length > 0 || b.isWildcard;

  if (!aHasParams && bHasParams) return -1;
  if (aHasParams && !bHasParams) return 1;

  // Routes with more required params come first
  if (a.requiredParams.length !== b.requiredParams.length) {
    return b.requiredParams.length - a.requiredParams.length;
  }

  // Routes with constraints come first
  if (a.hasConstraints && !b.hasConstraints) return -1;
  if (!a.hasConstraints && b.hasConstraints) return 1;

  // Wildcard routes come last
  if (!a.isWildcard && b.isWildcard) return -1;
  if (a.isWildcard && !b.isWildcard) return 1;

  // Alphabetical order
  return a.path.localeCompare(b.path);
}

/**
 * Debug helper - convert route to string
 */
export function routeToString(
  method: string,
  path: string,
  metadata?: Record<string, any>
): string {
  let str = `${method.padEnd(7)} ${path}`;

  if (metadata) {
    if (metadata.name) {
      str += ` [${metadata.name}]`;
    }
    if (metadata.deprecated) {
      str += " (deprecated)";
    }
  }

  return str;
}
