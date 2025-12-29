/**
 * ArcanaJS CSRF Protection Middleware
 *
 * Provides protection against Cross-Site Request Forgery attacks using
 * cryptographically secure tokens with timing-safe comparison.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * CSRF Protection Options
 */
export interface CSRFOptions {
  /** Cookie name for the CSRF token. Default: '_csrf' */
  cookie?: string | CSRFCookieOptions;

  /** Header name to check for token. Default: 'x-csrf-token' */
  headerName?: string;

  /** Form field name to check for token. Default: '_csrf' */
  fieldName?: string;

  /** Token length in bytes. Default: 32 */
  tokenLength?: number;

  /** Methods to ignore (safe methods). Default: ['GET', 'HEAD', 'OPTIONS'] */
  ignoreMethods?: string[];

  /** Custom token getter from request */
  getToken?: (req: Request) => string | undefined | Promise<string | undefined>;

  /** Custom error handler */
  onError?: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  /** Skip CSRF check for certain requests */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /** Secret key for token signing (optional, adds extra security) */
  secret?: string;
}

/**
 * CSRF Cookie Options
 */
export interface CSRFCookieOptions {
  /** Cookie name. Default: '_csrf' */
  name?: string;
  /** Cookie path. Default: '/' */
  path?: string;
  /** Secure flag (HTTPS only). Default: true in production */
  secure?: boolean;
  /** HttpOnly flag. Default: false (token needs to be read by JS) */
  httpOnly?: boolean;
  /** SameSite attribute. Default: 'strict' */
  sameSite?: "strict" | "lax" | "none";
  /** Max age in milliseconds */
  maxAge?: number;
  /** Domain for the cookie */
  domain?: string;
}

/**
 * CSRF Token with metadata
 */
interface CSRFTokenData {
  token: string;
  createdAt: number;
  salt: string;
}

/**
 * Generate cryptographically secure random bytes
 */
function generateRandomBytes(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a unique salt
 */
function generateSalt(): string {
  return generateRandomBytes(8);
}

/**
 * Create a CSRF token hash
 */
async function hashToken(
  token: string,
  salt: string,
  secret?: string
): Promise<string> {
  const data = `${salt}${token}${secret || ""}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    b = a;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0 && a.length === b.length;
}

/**
 * Default CSRF options
 */
const DEFAULT_OPTIONS: Required<
  Pick<
    CSRFOptions,
    "headerName" | "fieldName" | "tokenLength" | "ignoreMethods"
  >
> = {
  headerName: "x-csrf-token",
  fieldName: "_csrf",
  tokenLength: 32,
  ignoreMethods: ["GET", "HEAD", "OPTIONS", "TRACE"],
};

/**
 * Default error handler
 */
async function defaultOnError(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(403);
  await res.json({
    error: "Forbidden",
    message: "Invalid or missing CSRF token",
    code: "CSRF_TOKEN_INVALID",
  });
}

/**
 * Get cookie options from config
 */
function getCookieOptions(
  options: CSRFOptions
): Required<CSRFCookieOptions> & { name: string } {
  const isProduction = process.env.NODE_ENV === "production";

  if (typeof options.cookie === "object") {
    return {
      name: options.cookie.name || "_csrf",
      path: options.cookie.path || "/",
      secure: options.cookie.secure ?? isProduction,
      httpOnly: options.cookie.httpOnly ?? false,
      sameSite: options.cookie.sameSite || "strict",
      maxAge: options.cookie.maxAge ?? 86400000, // 24 hours
      domain: options.cookie.domain || "",
    };
  }

  return {
    name: typeof options.cookie === "string" ? options.cookie : "_csrf",
    path: "/",
    secure: isProduction,
    httpOnly: false,
    sameSite: "strict",
    maxAge: 86400000,
    domain: "",
  };
}

/**
 * Extract token from request
 */
async function extractToken(
  req: Request,
  options: CSRFOptions
): Promise<string | undefined> {
  const headerName = options.headerName || DEFAULT_OPTIONS.headerName;
  const fieldName = options.fieldName || DEFAULT_OPTIONS.fieldName;

  // Custom getter first
  if (options.getToken) {
    const token = await options.getToken(req);
    if (token) return token;
  }

  // Check header (case-insensitive)
  const headerToken =
    req.headers.get(headerName) || req.headers.get(headerName.toLowerCase());
  if (headerToken) return headerToken;

  // Check body field (for form submissions)
  if (req.body && typeof req.body === "object" && fieldName in req.body) {
    return req.body[fieldName];
  }

  // Check query string
  if (req.query && fieldName in req.query) {
    const queryToken = req.query[fieldName];
    return Array.isArray(queryToken) ? queryToken[0] : queryToken;
  }

  return undefined;
}

/**
 * Create CSRF protection middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { csrf } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Basic usage
 * app.use(csrf());
 *
 * // With options
 * app.use(csrf({
 *   cookie: { secure: true, sameSite: 'strict' },
 *   headerName: 'x-xsrf-token',
 *   skip: (req) => req.path.startsWith('/api/webhooks/')
 * }));
 *
 * // Get token for forms
 * app.get('/form', (req, res) => {
 *   res.html(`<form method="POST">
 *     <input type="hidden" name="_csrf" value="${req.csrfToken()}">
 *     <button type="submit">Submit</button>
 *   </form>`);
 * });
 * ```
 */
export function csrf(options: CSRFOptions = {}): Middleware {
  const ignoreMethods = new Set(
    (options.ignoreMethods || DEFAULT_OPTIONS.ignoreMethods).map((m) =>
      m.toUpperCase()
    )
  );
  const tokenLength = options.tokenLength || DEFAULT_OPTIONS.tokenLength;
  const onError = options.onError || defaultOnError;
  const cookieOptions = getCookieOptions(options);

  // Token store (per-request token data)
  const tokenStore = new WeakMap<Request, CSRFTokenData>();

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip check if configured
    if (options.skip) {
      const shouldSkip = await options.skip(req);
      if (shouldSkip) {
        return next();
      }
    }

    // Get or create token data
    let tokenData = tokenStore.get(req);

    // Check for existing token in cookie
    const existingToken = req.cookies?.[cookieOptions.name];
    if (existingToken && !tokenData) {
      try {
        // Parse the stored token data
        const parsed = JSON.parse(
          Buffer.from(existingToken, "base64").toString("utf-8")
        ) as CSRFTokenData;
        tokenData = parsed;
        tokenStore.set(req, parsed);
      } catch {
        // Invalid token format, will generate new one
      }
    }

    // Generate new token if needed
    if (!tokenData) {
      const token = generateRandomBytes(tokenLength);
      const salt = generateSalt();
      tokenData = {
        token,
        salt,
        createdAt: Date.now(),
      };
      tokenStore.set(req, tokenData);

      // Set the token cookie
      const cookieValue = Buffer.from(JSON.stringify(tokenData)).toString(
        "base64"
      );
      res.cookie(cookieOptions.name, cookieValue, {
        path: cookieOptions.path,
        secure: cookieOptions.secure,
        httpOnly: cookieOptions.httpOnly,
        sameSite: cookieOptions.sameSite,
        maxAge: cookieOptions.maxAge,
        domain: cookieOptions.domain || undefined,
      });
    }

    // Attach token generator to request
    (req as any).csrfToken = (): string => {
      return tokenData!.token;
    };

    // Skip validation for safe methods
    if (ignoreMethods.has(req.method.toUpperCase())) {
      return next();
    }

    // Validate token for unsafe methods
    const submittedToken = await extractToken(req, options);

    if (!submittedToken) {
      return onError(req, res, next);
    }

    // Timing-safe comparison
    const isValid = timingSafeEqual(tokenData.token, submittedToken);

    if (!isValid) {
      // If secret is provided, also try hash comparison
      if (options.secret) {
        const expectedHash = await hashToken(
          tokenData.token,
          tokenData.salt,
          options.secret
        );
        const submittedHash = await hashToken(
          submittedToken,
          tokenData.salt,
          options.secret
        );

        if (!timingSafeEqual(expectedHash, submittedHash)) {
          return onError(req, res, next);
        }
      } else {
        return onError(req, res, next);
      }
    }

    await next();
  };
}

/**
 * Generate a standalone CSRF token (for API usage)
 */
export function generateCSRFToken(length: number = 32): string {
  return generateRandomBytes(length);
}

/**
 * Create a signed CSRF token
 */
export async function createSignedToken(
  secret: string,
  length: number = 32
): Promise<{ token: string; signature: string }> {
  const token = generateRandomBytes(length);
  const salt = generateSalt();
  const signature = await hashToken(token, salt, secret);

  return {
    token: `${salt}.${token}`,
    signature,
  };
}

/**
 * Verify a signed CSRF token
 */
export async function verifySignedToken(
  signedToken: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const [salt, token] = signedToken.split(".");
  if (!salt || !token) return false;

  const expectedSignature = await hashToken(token, salt, secret);
  return timingSafeEqual(expectedSignature, signature);
}

/**
 * Double Submit Cookie pattern helper
 * Sets both a cookie and returns a token that must match
 */
export function doubleSubmitCSRF(
  options: {
    cookieName?: string;
    headerName?: string;
    secure?: boolean;
  } = {}
): Middleware {
  const cookieName = options.cookieName || "_csrf_double";
  const headerName = options.headerName || "x-csrf-token";
  const secure = options.secure ?? process.env.NODE_ENV === "production";

  return async (req: Request, res: Response, next: NextFunction) => {
    // Generate token for new sessions
    let token = req.cookies?.[cookieName];

    if (!token) {
      token = generateRandomBytes(32);
      res.cookie(cookieName, token, {
        secure,
        sameSite: "strict",
        httpOnly: false,
        path: "/",
      });
    }

    // Attach token getter
    (req as any).csrfToken = () => token;

    // Skip validation for safe methods
    const safeMethods = ["GET", "HEAD", "OPTIONS", "TRACE"];
    if (safeMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    // Validate: cookie token must match header token
    const headerToken = req.headers.get(headerName);
    if (!headerToken || !timingSafeEqual(token, headerToken)) {
      res.status(403);
      await res.json({
        error: "Forbidden",
        message: "CSRF token mismatch",
        code: "CSRF_DOUBLE_SUBMIT_FAILED",
      });
      return;
    }

    await next();
  };
}
