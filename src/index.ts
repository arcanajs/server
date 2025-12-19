/**
 * ArcanaJS - Production-Ready Web Framework for Bun
 *
 * A modern, modular, web framework optimized for Bun.
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Exports
// ============================================================================

import { Application, arcanajs as createApplication } from "./core/application";
import { patchListen } from "./modules/http";

// Patch listen for compatibility
patchListen(Application.prototype);

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new ArcanaJS application instance
 */
function createArcanaJS(): Application {
  return createApplication();
}

// ============================================================================
// Core Classes and Modules
// ============================================================================

// Legacy Router (for backward compatibility)

// Enhanced Router from modules
import { Router } from "./modules/router";

// Plugins
import { cookieParser } from "./plugins/cookie";
import { json as jsonMiddleware } from "./plugins/json";
import { static_files } from "./plugins/static";

// ============================================================================
// Attach Static Methods
// ============================================================================

createArcanaJS.Application = Application;
createArcanaJS.Router = () => new Router();
createArcanaJS.json = jsonMiddleware;
createArcanaJS.cookie = cookieParser;
createArcanaJS.static = static_files;

// ============================================================================
// Exports
// ============================================================================

// Default and named exports
export const arcanajs = createArcanaJS;
export default arcanajs;

// Core exports
export { Application } from "./core/application";
export { Router as LegacyRouter } from "./core/router";
export { Router } from "./modules/router";

// Kernel exports
export {
  ArcanaJSKernel,
  createKernel,
  ModuleLoader,
  moduleLoader,
} from "./core/kernel";
export type {
  ArcanaJSModule,
  KernelEvent,
  KernelOptions,
  ModuleFactory,
} from "./core/kernel";

// Error exports
export {
  BadGatewayError,
  BadRequestError,
  ConflictError,
  createHttpError,
  ForbiddenError,
  GatewayTimeoutError,
  HttpError,
  InternalServerError,
  isHttpError,
  MethodNotAllowedError,
  NotFoundError,
  NotImplementedError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "./core/errors";

// Debug exports
export { createDebug, Debug, debug, debugMiddleware } from "./core/debug";

// Router module exports
export { Layer, RadixTree, RouterModule } from "./modules/router";
export type {
  ParamConstraint,
  RouteConstraints,
  RouteDefinition,
  RouteGroupCallback,
  RouteMatch,
  RouterOptions,
} from "./modules/router";

// Middleware module exports
export {
  catchErrors,
  compose,
  MiddlewareEngine,
  MiddlewareModule,
  timeout,
  unless,
  when,
} from "./modules/middleware";
export type { MiddlewareOptions } from "./modules/middleware";

// Context module exports
export { RequestImpl, ResponseImpl } from "./modules/context";
export type { AcceptsResult, SendFileOptions } from "./modules/context";

// HTTP module exports
export { HttpModule, HttpServer, serve } from "./modules/http";
export type { ServerOptions } from "./modules/http";

// Security module exports
export {
  bodyLimit,
  contentSecurityPolicy,
  cors,
  corsAll,
  corsDev,
  dnsPrefetchControl,
  frameguard,
  helmet,
  hidePoweredBy,
  hsts,
  jsonWithLimit,
  noSniff,
  rateLimit,
  referrerPolicy,
  SecurityModule,
  slowDown,
  textWithLimit,
} from "./modules/security";
export type {
  BodyLimitOptions,
  CorsOptions,
  CSPDirectives,
  CSPOptions,
  HelmetOptions,
  HSTSOptions,
  RateLimitInfo,
  RateLimitOptions,
  RateLimitStore,
  ReferrerPolicy,
} from "./modules/security";

// Plugin exports
export { cookieParser, cookiePlugin } from "./plugins/cookie";
export { json, jsonPlugin } from "./plugins/json";
export { static_files } from "./plugins/static";

// Session module exports
export { FileStore, MemoryStore, RedisStore, session } from "./modules/session";
export type {
  RedisClient,
  Session,
  SessionCookieOptions,
  SessionData,
  SessionOptions,
  SessionStore,
} from "./modules/session";

// Type exports
export * from "./types";
