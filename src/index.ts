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
import { Router, RouterOptions } from "./modules/router";

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
import { SessionOptions, sessionPlugin } from "./plugins/session";
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
arcanajs.Router = (options?: RouterOptions) => new Router(options);
arcanajs.json = jsonPlugin;
arcanajs.cookie = cookiePlugin;
arcanajs.static = staticPlugin;
arcanajs.favicon = faviconPlugin;
arcanajs.ws = websocketPlugin;
arcanajs.session = sessionPlugin;

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
  SessionOptions,
  WebSocketOptions,
};

// ============================================================================
// CORE EXPORTS
// ============================================================================

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
export { Layer, RadixTree } from "./modules/router";
// Utility Router exports
export {
  compareRoutes,
  extractParameters,
  extractRouteInfo,
  formatRoutePath,
  generateRouteDocumentation,
  matchesPattern,
  mergeRouteParams,
  normalizeRouterPath,
  parseRoutePattern,
  pathsAreSimilar,
  pathToRegex,
  routeToString,
  validateRoutePath,
} from "./modules/router";
export type {
  LayerOptions,
  ParamConstraint,
  ParameterExtraction,
  PathNormalizationOptions,
  RadixTreeStats,
  RouteConstraints,
  RouteDefinition,
  RouteGroupCallback,
  RouteInfo,
  RouteMatch,
  RouteMetadata,
  RouterOptions,
} from "./modules/router";

// Security module
export {
  // IP Filtering
  allowOnly,
  // Security Headers
  apiPermissionsPolicy,
  // Brute Force Protection
  apiProtection,
  // Security Presets
  apiSecurity,
  // Request Validation
  array,
  autoSecurity,
  blockIPs,
  // Helmet
  bodyLimit,
  boolean,
  bruteForce,
  clearSiteData,
  // Secure Session
  concurrentSessionPrevention,
  contentSecurityPolicy,
  cors,
  corsAll,
  corsDev,
  createRedisStore,
  createSignedToken,
  crossOriginIsolation,
  // CSRF Protection
  csrf,
  customSecurity,
  // Sanitization
  detectPathTraversal,
  detectSQLInjection,
  dnsPrefetchControl,
  doubleSubmitCSRF,
  email,
  enumValue,
  escapeHtml,
  escapeSql,
  frameguard,
  generateCSRFToken,
  graphqlSecurity,
  helmet,
  hidePoweredBy,
  hsts,
  integer,
  ipFilter,
  isIPInRange,
  isPrivateIP,
  jsonWithLimit,
  localhostOnly,
  loginProtection,
  noCache,
  normalizeIP,
  noSniff,
  noSqlSanitize,
  number,
  object,
  passwordResetProtection,
  permissionsPolicy,
  privateNetworkOnly,
  rateLimit,
  referrerPolicy,
  relaxedSecurity,
  requiredString,
  safeStringify,
  sanitize,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeHeader,
  sanitizeNoSQL,
  sanitizePath,
  sanitizePhone,
  sanitizeUrl,
  secureDownload,
  secureSession,
  securityHeaders,
  sessionActivityLogger,
  sessionFixationPrevention,
  slowDown,
  standardSecurity,
  strictPermissionsPolicy,
  strictSecurity,
  string,
  stripHtml,
  textWithLimit,
  unescapeHtml,
  uuid,
  validate,
  validateBody,
  validateParams,
  validateQuery,
  verifySignedToken,
  websocketSecurity,
  xssSanitize,
} from "./modules/security";

export type {
  // Brute Force types
  AttemptsInfo,
  // Existing types
  BodyLimitOptions,
  BruteForceOptions,
  BruteForceStore,
  CorsOptions,
  CSPDirectives,
  CSPOptions,
  // CSRF types
  CSRFCookieOptions,
  CSRFOptions,
  // Validation types
  FieldSchema,
  HelmetOptions,
  HSTSOptions,
  // IP Filter types
  IPFilterOptions,
  // Security Headers types
  NELOptions,
  PermissionsPolicyDirectives,
  PermissionsPolicyValue,
  RateLimitInfo,
  RateLimitOptions,
  RateLimitStore,
  ReferrerPolicy,
  ReportToGroup,
  RequestValidationError,
  // Sanitize types
  SanitizeOptions,
  SchemaType,
  // Secure Session types
  SecureSessionOptions,
  SecurityHeadersOptions,
  // Preset types
  SecurityPresetOptions,
  SessionSecurityMeta,
  SessionViolation,
  ValidationSchema,
  ValidatorOptions,
} from "./modules/security";

// Session module
export { FileStore, MemoryStore, RedisStore } from "./modules/session";
export type {
  RedisClient,
  Session,
  SessionCookieOptions,
  SessionData,
  SessionStore,
} from "./modules/session";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Global type exports
export * from "./types";
