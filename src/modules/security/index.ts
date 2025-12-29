/**
 * ArcanaJS Security Module
 *
 * Production-ready security utilities for ArcanaJS applications.
 */

// ============================================================================
// HELMET EXPORTS
// ============================================================================

export {
  contentSecurityPolicy,
  dnsPrefetchControl,
  frameguard,
  helmet,
  hidePoweredBy,
  hsts,
  noSniff,
  referrerPolicy,
} from "./helmet";

export type {
  CrossOriginEmbedderPolicy,
  CrossOriginOpenerPolicy,
  CrossOriginResourcePolicy,
  CSPDirectives,
  CSPOptions,
  HelmetOptions,
  HSTSOptions,
  ReferrerPolicy,
} from "./helmet";

// ============================================================================
// CORS EXPORTS
// ============================================================================

export { cors, corsAll, corsDev } from "./cors";
export type { CorsOptions } from "./cors";

// ============================================================================
// RATE LIMITING EXPORTS
// ============================================================================

export { rateLimit, slowDown } from "./rate-limit";
export type {
  RateLimitInfo,
  RateLimitOptions,
  RateLimitStore,
} from "./rate-limit";

// ============================================================================
// BODY LIMIT EXPORTS
// ============================================================================

export { bodyLimit, jsonWithLimit, textWithLimit } from "./body-limit";
export type { BodyLimitOptions } from "./body-limit";

// ============================================================================
// CSRF PROTECTION EXPORTS
// ============================================================================

export {
  createSignedToken,
  csrf,
  doubleSubmitCSRF,
  generateCSRFToken,
  verifySignedToken,
} from "./csrf";

export type { CSRFCookieOptions, CSRFOptions } from "./csrf";

// ============================================================================
// IP FILTERING EXPORTS
// ============================================================================

export {
  allowOnly,
  blockIPs,
  ipFilter,
  isIPInRange,
  isPrivateIP,
  localhostOnly,
  normalizeIP,
  privateNetworkOnly,
} from "./ip-filter";

export type { IPFilterOptions } from "./ip-filter";

// ============================================================================
// SANITIZATION EXPORTS
// ============================================================================

export {
  detectPathTraversal,
  detectSQLInjection,
  escapeHtml,
  escapeSql,
  noSqlSanitize,
  safeStringify,
  sanitize,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeHeader,
  sanitizeNoSQL,
  sanitizePath,
  sanitizePhone,
  sanitizeUrl,
  stripHtml,
  unescapeHtml,
  xssSanitize,
} from "./sanitize";

export type { SanitizeOptions } from "./sanitize";

// ============================================================================
// SECURITY HEADERS EXPORTS
// ============================================================================

export {
  apiPermissionsPolicy,
  clearSiteData,
  crossOriginIsolation,
  noCache,
  permissionsPolicy,
  secureDownload,
  securityHeaders,
  strictPermissionsPolicy,
} from "./security-headers";

export type {
  NELOptions,
  PermissionsPolicyDirectives,
  PermissionsPolicyValue,
  ReportToGroup,
  SecurityHeadersOptions,
} from "./security-headers";

// ============================================================================
// REQUEST VALIDATION EXPORTS
// ============================================================================

export {
  array,
  boolean,
  email,
  enumValue,
  integer,
  number,
  object,
  requiredString,
  string,
  uuid,
  validate,
  validateBody,
  validateParams,
  validateQuery,
} from "./request-validator";

export type {
  FieldSchema,
  RequestValidationError,
  SchemaType,
  ValidationSchema,
  ValidatorOptions,
} from "./request-validator";

// ============================================================================
// BRUTE FORCE PROTECTION EXPORTS
// ============================================================================

export {
  apiProtection,
  bruteForce,
  createRedisStore,
  loginProtection,
  passwordResetProtection,
} from "./brute-force";

export type {
  AttemptsInfo,
  BruteForceOptions,
  BruteForceStore,
} from "./brute-force";

// ============================================================================
// SECURE SESSION EXPORTS
// ============================================================================

export {
  concurrentSessionPrevention,
  secureSession,
  sessionActivityLogger,
  sessionFixationPrevention,
} from "./secure-session";

export type {
  SecureSessionOptions,
  SessionSecurityMeta,
  SessionViolation,
} from "./secure-session";

// ============================================================================
// SECURITY PRESETS EXPORTS
// ============================================================================

export {
  apiSecurity,
  autoSecurity,
  customSecurity,
  graphqlSecurity,
  relaxedSecurity,
  standardSecurity,
  strictSecurity,
  websocketSecurity,
} from "./presets";

export type { SecurityPresetOptions } from "./presets";

// ============================================================================
// SESSION EXPORTS (Re-exported from session module)
// ============================================================================

export { FileStore, MemoryStore, RedisStore, session } from "../session";
export type {
  RedisClient,
  Session,
  SessionCookieOptions,
  SessionData,
  SessionStore,
} from "../session";
