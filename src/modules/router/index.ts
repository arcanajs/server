/**
 * ArcanaJS Router Module
 */

export { Router } from "./router";
export type {
  RouteConstraints,
  RouteGroupCallback,
  RouteMetadata,
  RouterOptions,
} from "./router";

export { Layer } from "./layer";
export type { LayerOptions, ParameterExtraction } from "./layer";

export { RadixTree } from "./radix-tree";
export type {
  ParamConstraint,
  RadixTreeStats,
  RouteDefinition,
  RouteMatch,
} from "./radix-tree";

// Utility exports
export {
  compareRoutes,
  extractParameters,
  extractRouteInfo,
  formatRoutePath,
  mergeRouteParams,
  normalizeRouterPath,
  generateRouteDocumentation,
  matchesPattern,
  parseRoutePattern,
  pathsAreSimilar,
  pathToRegex,
  routeToString,
  validateRoutePath,
} from "./utils";
export type { PathNormalizationOptions, RouteInfo } from "./utils";
