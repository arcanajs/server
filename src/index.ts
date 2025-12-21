/**
 * ArcanaJS - Production-Ready Web Framework for Bun
 *
 * A modern, modular, web framework optimized for Bun.
 *
 * @packageDocumentation
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Core imports
import { Application, arcanajs as createApplication } from "./core/application";
import { patchListen } from "./server/arcanajs";

// Router Module imports
import { Router } from "./modules/router";

// Plugin imports
import { CookieOptions, cookiePlugin } from "./plugins/cookie";
import {
  FaviconMetrics,
  FaviconOptions,
  faviconPlugin,
  getFaviconMetrics,
  resetFaviconMetrics,
} from "./plugins/favicon";
import { JsonOptions, jsonPlugin } from "./plugins/json";
import { ServeStaticOptions, staticPlugin } from "./plugins/static";
import { WebSocketOptions, websocketPlugin } from "./plugins/websocket";

// ============================================================================
// CORE INITIALIZATION
// ============================================================================

// Patch listen for compatibility
patchListen(Application.prototype);

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new ArcanaJS application instance
 */
function arcanajs(): Application {
  return createApplication();
}

// ============================================================================
// STATIC METHOD ATTACHMENTS
// ============================================================================

arcanajs.Application = Application;
arcanajs.Router = () => new Router();
arcanajs.json = jsonPlugin;
arcanajs.cookie = cookiePlugin;
arcanajs.static = staticPlugin;
arcanajs.favicon = faviconPlugin;
arcanajs.ws = websocketPlugin;

// Export favicon utilities
arcanajs.getFaviconMetrics = getFaviconMetrics;
arcanajs.resetFaviconMetrics = resetFaviconMetrics;

// ============================================================================
// MAIN EXPORTS
// ============================================================================

// Default and named exports
export default arcanajs;

// Plugin options types
export type {
  CookieOptions,
  FaviconMetrics,
  FaviconOptions,
  JsonOptions,
  ServeStaticOptions,
  WebSocketOptions,
};

// ============================================================================
// CORE EXPORTS
// ============================================================================

// Kernel system
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

// Error handling
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

// Debug utilities
export {
  createDebug,
  Debug,
  debug,
  debugMiddleware,
  logger,
} from "./core/debug";

// ============================================================================
// MODULE EXPORTS
// ============================================================================

// Router module
export { Layer, RadixTree, RouterModule } from "./modules/router";
export type {
  ParamConstraint,
  RouteConstraints,
  RouteDefinition,
  RouteGroupCallback,
  RouteMatch,
  RouterOptions,
} from "./modules/router";

// Middleware module
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

// Context module
export { RequestImpl, ResponseImpl } from "./modules/context";
export type { AcceptsResult, SendFileOptions } from "./modules/context";

// HTTP module
export { HttpModule, HttpServer, serve } from "./modules/http";
export type { ServerOptions } from "./modules/http";

// Security module
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

// Session module
export { FileStore, MemoryStore, RedisStore, session } from "./modules/session";
export type {
  RedisClient,
  Session,
  SessionCookieOptions,
  SessionData,
  SessionOptions,
  SessionStore,
} from "./modules/session";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Global type exports
export * from "./types";
