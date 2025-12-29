/**
 * ArcanaJS Input Sanitization Utilities
 *
 * Provides protection against XSS, SQL injection, NoSQL injection,
 * path traversal, and header injection attacks.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Sanitization Options
 */
export interface SanitizeOptions {
  /** Enable XSS protection. Default: true */
  xss?: boolean;

  /** Enable SQL injection protection. Default: false (use parameterized queries) */
  sql?: boolean;

  /** Enable NoSQL injection protection. Default: true */
  noSql?: boolean;

  /** Enable path traversal protection. Default: true */
  pathTraversal?: boolean;

  /** Sanitize query string. Default: true */
  query?: boolean;

  /** Sanitize body. Default: true */
  body?: boolean;

  /** Sanitize params. Default: true */
  params?: boolean;

  /** Custom sanitizer function */
  custom?: (value: any, key: string, type: "query" | "body" | "params") => any;

  /** Keys to exclude from sanitization */
  exclude?: string[];

  /** Only sanitize these keys */
  only?: string[];
}

/**
 * HTML entities map for XSS prevention
 */
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Dangerous MongoDB operators
 */
const NOSQL_OPERATORS = [
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$ne",
  "$in",
  "$nin",
  "$or",
  "$and",
  "$not",
  "$nor",
  "$exists",
  "$type",
  "$mod",
  "$regex",
  "$text",
  "$where",
  "$all",
  "$elemMatch",
  "$size",
  "$set",
  "$unset",
  "$inc",
  "$push",
  "$pull",
  "$addToSet",
  "$pop",
  "$rename",
  "$bit",
];

/**
 * SQL injection patterns
 */
const SQL_PATTERNS = [
  /(\b)(union|select|insert|update|delete|drop|create|alter|exec|execute|xp_|sp_|0x)(\b)/gi,
  /(--)|(\/\*)|(\*\/)/g,
  /(\b)(or|and)(\s+)(\d+)(\s*)(=)(\s*)(\d+)/gi,
  /'(\s*)(or|and)(\s+)('|"|\d)/gi,
  /;\s*(drop|delete|update|insert|create|alter)/gi,
];

/**
 * Path traversal patterns
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\+/g,
  /%2e%2e[%2f%5c]/gi,
  /%252e%252e[%252f%255c]/gi,
  /\.\.%2f/gi,
  /\.\.%5c/gi,
];

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(str: string): string {
  if (typeof str !== "string") return str;

  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(str: string): string {
  if (typeof str !== "string") return str;

  const reverseEntities: Record<string, string> = {};
  for (const [char, entity] of Object.entries(HTML_ENTITIES)) {
    reverseEntities[entity] = char;
  }

  return str.replace(
    /&(amp|lt|gt|quot|#x27|#x2F|#x60|#x3D);/g,
    (match) => reverseEntities[match] || match
  );
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(str: string): string {
  if (typeof str !== "string") return str;

  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Remove dangerous MongoDB operators
 */
export function sanitizeNoSQL<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Remove $ prefix if at the start
    if (obj.startsWith("$")) {
      return obj.slice(1) as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeNoSQL(item)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip dangerous operators
      if (key.startsWith("$") && NOSQL_OPERATORS.includes(key)) {
        continue;
      }

      result[key] = sanitizeNoSQL(value);
    }

    return result as T;
  }

  return obj;
}

/**
 * Check for SQL injection patterns (returns true if dangerous)
 */
export function detectSQLInjection(str: string): boolean {
  if (typeof str !== "string") return false;

  return SQL_PATTERNS.some((pattern) => pattern.test(str));
}

/**
 * Escape SQL special characters (use parameterized queries instead when possible)
 */
export function escapeSql(str: string): string {
  if (typeof str !== "string") return str;

  return str
    .replace(/'/g, "''")
    .replace(/\\/g, "\\\\")
    .replace(/\x00/g, "\\0")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\x1a/g, "\\Z");
}

/**
 * Sanitize path to prevent traversal attacks
 */
export function sanitizePath(path: string): string {
  if (typeof path !== "string") return path;

  let sanitized = path;

  // Remove path traversal patterns
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  // Decode and re-check
  try {
    const decoded = decodeURIComponent(sanitized);
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      sanitized = decoded.replace(pattern, "");
    }
  } catch {
    // Invalid encoding, keep as is
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, "");

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, "/");

  // Remove leading slashes to prevent absolute path access
  sanitized = sanitized.replace(/^\/+/, "");

  return sanitized;
}

/**
 * Check for path traversal attempt
 */
export function detectPathTraversal(path: string): boolean {
  if (typeof path !== "string") return false;

  // Check original
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) return true;
  }

  // Check decoded
  try {
    const decoded = decodeURIComponent(path);
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(decoded)) return true;
    }
  } catch {
    // Invalid encoding
  }

  return false;
}

/**
 * Sanitize HTTP header value to prevent header injection
 */
export function sanitizeHeader(value: string): string {
  if (typeof value !== "string") return String(value);

  // Remove newlines and carriage returns (CRLF injection)
  return value.replace(/[\r\n\x00]/g, "");
}

/**
 * Sanitize a value based on options
 */
function sanitizeValue(value: any, options: SanitizeOptions): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    let result = value;

    // XSS protection
    if (options.xss !== false) {
      result = escapeHtml(result);
    }

    // SQL injection protection
    if (options.sql) {
      if (detectSQLInjection(result)) {
        result = escapeSql(result);
      }
    }

    // Path traversal protection
    if (options.pathTraversal !== false) {
      result = sanitizePath(result);
    }

    return result;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, options));
  }

  if (typeof value === "object") {
    // NoSQL injection protection
    if (options.noSql !== false) {
      value = sanitizeNoSQL(value);
    }

    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = sanitizeValue(val, options);
    }
    return result;
  }

  return value;
}

/**
 * Sanitize an object
 */
function sanitizeObject(
  obj: Record<string, any> | undefined,
  options: SanitizeOptions,
  type: "query" | "body" | "params"
): Record<string, any> | undefined {
  if (!obj || typeof obj !== "object") return obj;

  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check exclusions
    if (options.exclude?.includes(key)) {
      result[key] = value;
      continue;
    }

    // Check only filter
    if (options.only && !options.only.includes(key)) {
      result[key] = value;
      continue;
    }

    // Apply custom sanitizer first
    let sanitized = value;
    if (options.custom) {
      sanitized = options.custom(value, key, type);
    } else {
      sanitized = sanitizeValue(value, options);
    }

    result[key] = sanitized;
  }

  return result;
}

/**
 * Create input sanitization middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { sanitize } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Basic sanitization (XSS, NoSQL, path traversal)
 * app.use(sanitize());
 *
 * // Custom options
 * app.use(sanitize({
 *   xss: true,
 *   noSql: true,
 *   sql: false, // Use parameterized queries
 *   exclude: ['password', 'token']
 * }));
 * ```
 */
export function sanitize(options: SanitizeOptions = {}): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Sanitize query string
    if (options.query !== false && req.query) {
      (req as any).query = sanitizeObject(req.query, options, "query");
    }

    // Sanitize body
    if (options.body !== false && req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body, options, "body");
    }

    // Sanitize params
    if (options.params !== false && req.params) {
      (req as any).params = sanitizeObject(req.params, options, "params");
    }

    await next();
  };
}

/**
 * Create XSS-only sanitization middleware
 */
export function xssSanitize(): Middleware {
  return sanitize({
    xss: true,
    noSql: false,
    sql: false,
    pathTraversal: false,
  });
}

/**
 * Create NoSQL injection protection middleware
 */
export function noSqlSanitize(): Middleware {
  return sanitize({
    xss: false,
    noSql: true,
    sql: false,
    pathTraversal: false,
  });
}

/**
 * Validate and sanitize email format
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") return null;

  const trimmed = email.trim().toLowerCase();

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return null;

  // Remove potentially dangerous characters
  return trimmed.replace(/[<>'"]/g, "");
}

/**
 * Sanitize and validate URL
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== "string") return null;

  const trimmed = url.trim();

  // Block dangerous protocols
  const dangerous = ["javascript:", "data:", "vbscript:", "file:"];
  const lower = trimmed.toLowerCase();

  for (const protocol of dangerous) {
    if (lower.startsWith(protocol)) return null;
  }

  // Basic URL validation
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    // Try with http prefix
    try {
      new URL("http://" + trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }
}

/**
 * Sanitize filename for safe file operations
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== "string") return "file";

  return (
    filename
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove illegal characters
      .replace(/\.\./g, "") // Remove path traversal
      .replace(/^\.+/, "") // Remove leading dots
      .trim()
      .slice(0, 255) || "file"
  ); // Limit length
}

/**
 * Sanitize phone number
 */
export function sanitizePhone(phone: string): string {
  if (typeof phone !== "string") return "";

  // Keep only digits, +, -, (, ), and spaces
  return phone.replace(/[^\d+\-() ]/g, "").trim();
}

/**
 * Create a safe JSON stringify that handles circular references
 */
export function safeStringify(obj: any, maxDepth: number = 10): string {
  const seen = new WeakSet();
  let depth = 0;

  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value) || depth > maxDepth) {
        return "[Circular]";
      }
      seen.add(value);
      depth++;
    }
    return value;
  });
}
