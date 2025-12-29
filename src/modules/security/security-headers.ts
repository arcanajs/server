/**
 * ArcanaJS Enhanced Security Headers
 *
 * Provides additional security headers beyond standard Helmet,
 * including Permissions-Policy, NEL, Report-To, and feature controls.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Permissions Policy Directives
 */
export interface PermissionsPolicyDirectives {
  /** Accelerometer access */
  accelerometer?: PermissionsPolicyValue;
  /** Ambient light sensor access */
  "ambient-light-sensor"?: PermissionsPolicyValue;
  /** Autoplay permission */
  autoplay?: PermissionsPolicyValue;
  /** Battery status access */
  battery?: PermissionsPolicyValue;
  /** Camera access */
  camera?: PermissionsPolicyValue;
  /** Cross-origin isolated */
  "cross-origin-isolated"?: PermissionsPolicyValue;
  /** Display capture (screen sharing) */
  "display-capture"?: PermissionsPolicyValue;
  /** Document domain modification */
  "document-domain"?: PermissionsPolicyValue;
  /** Encrypted media */
  "encrypted-media"?: PermissionsPolicyValue;
  /** Execution while not rendered */
  "execution-while-not-rendered"?: PermissionsPolicyValue;
  /** Execution while out of viewport */
  "execution-while-out-of-viewport"?: PermissionsPolicyValue;
  /** Fullscreen access */
  fullscreen?: PermissionsPolicyValue;
  /** Geolocation access */
  geolocation?: PermissionsPolicyValue;
  /** Gyroscope access */
  gyroscope?: PermissionsPolicyValue;
  /** Keyboard map */
  "keyboard-map"?: PermissionsPolicyValue;
  /** Magnetometer access */
  magnetometer?: PermissionsPolicyValue;
  /** Microphone access */
  microphone?: PermissionsPolicyValue;
  /** MIDI access */
  midi?: PermissionsPolicyValue;
  /** Navigation override */
  "navigation-override"?: PermissionsPolicyValue;
  /** Payment API */
  payment?: PermissionsPolicyValue;
  /** Picture-in-picture */
  "picture-in-picture"?: PermissionsPolicyValue;
  /** Public key credentials (WebAuthn) */
  "publickey-credentials-get"?: PermissionsPolicyValue;
  /** Screen wake lock */
  "screen-wake-lock"?: PermissionsPolicyValue;
  /** Synchronous XMLHttpRequest */
  "sync-xhr"?: PermissionsPolicyValue;
  /** USB access */
  usb?: PermissionsPolicyValue;
  /** Web share API */
  "web-share"?: PermissionsPolicyValue;
  /** XR spatial tracking */
  "xr-spatial-tracking"?: PermissionsPolicyValue;
  /** Clipboard read */
  "clipboard-read"?: PermissionsPolicyValue;
  /** Clipboard write */
  "clipboard-write"?: PermissionsPolicyValue;
  /** Interest cohort (FLoC) */
  "interest-cohort"?: PermissionsPolicyValue;
}

/**
 * Permissions Policy value types
 */
export type PermissionsPolicyValue =
  | "*" // Allow all
  | "self" // Same origin only
  | "none" // Deny all
  | string[] // Specific origins
  | { self: boolean; origins?: string[] };

/**
 * Report-To group configuration
 */
export interface ReportToGroup {
  /** Group name */
  group: string;
  /** Maximum age in seconds */
  max_age: number;
  /** Endpoint URLs */
  endpoints: { url: string; priority?: number; weight?: number }[];
  /** Include subdomains */
  include_subdomains?: boolean;
}

/**
 * Network Error Logging configuration
 */
export interface NELOptions {
  /** Report-To group name */
  report_to: string;
  /** Maximum age in seconds */
  max_age: number;
  /** Include subdomains */
  include_subdomains?: boolean;
  /** Sampling rate for successful requests (0-1) */
  success_fraction?: number;
  /** Sampling rate for failed requests (0-1) */
  failure_fraction?: number;
}

/**
 * Enhanced Security Headers Options
 */
export interface SecurityHeadersOptions {
  /** Permissions-Policy header */
  permissionsPolicy?: PermissionsPolicyDirectives | false;

  /** Report-To header configuration */
  reportTo?: ReportToGroup[] | false;

  /** Network Error Logging configuration */
  nel?: NELOptions | false;

  /** Clear-Site-Data header (logout/security reset) */
  clearSiteData?:
    | ("cache" | "cookies" | "storage" | "executionContexts" | "*")[]
    | false;

  /** Expect-CT header (Certificate Transparency) - deprecated but still used */
  expectCT?: { maxAge: number; enforce?: boolean; reportUri?: string } | false;

  /** Feature-Policy header (deprecated, use Permissions-Policy) */
  featurePolicy?: Record<string, string[]> | false;

  /** Custom headers to add */
  customHeaders?: Record<string, string>;

  /** Cache-Control for security */
  noCacheSecure?: boolean;

  /** Disable client-side hints */
  disableClientHints?: boolean;
}

/**
 * Build Permissions-Policy header value
 */
function buildPermissionsPolicy(
  directives: PermissionsPolicyDirectives
): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(directives)) {
    if (value === undefined) continue;

    let policyValue: string;

    if (value === "*") {
      policyValue = "*";
    } else if (value === "self") {
      policyValue = "self";
    } else if (value === "none") {
      policyValue = "()";
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        policyValue = "()";
      } else {
        policyValue = `(${value.map((v: string) => `"${v}"`).join(" ")})`;
      }
    } else if (typeof value === "object") {
      const origins: string[] = [];
      if (value.self) origins.push("self");
      if (value.origins) {
        origins.push(...value.origins.map((o: string) => `"${o}"`));
      }
      policyValue = origins.length > 0 ? `(${origins.join(" ")})` : "()";
    } else {
      continue;
    }

    parts.push(`${key}=${policyValue}`);
  }

  return parts.join(", ");
}

/**
 * Default Permissions Policy (restrictive)
 */
const DEFAULT_PERMISSIONS_POLICY: PermissionsPolicyDirectives = {
  accelerometer: "none",
  "ambient-light-sensor": "none",
  autoplay: "self",
  battery: "none",
  camera: "none",
  "display-capture": "none",
  "document-domain": "none",
  fullscreen: "self",
  geolocation: "none",
  gyroscope: "none",
  magnetometer: "none",
  microphone: "none",
  midi: "none",
  payment: "none",
  "picture-in-picture": "self",
  "publickey-credentials-get": "self",
  "screen-wake-lock": "none",
  usb: "none",
  "xr-spatial-tracking": "none",
  "interest-cohort": "none",
};

/**
 * Create enhanced security headers middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { securityHeaders } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Basic usage
 * app.use(securityHeaders());
 *
 * // With custom permissions
 * app.use(securityHeaders({
 *   permissionsPolicy: {
 *     camera: 'self',
 *     microphone: ['https://trusted.com'],
 *     geolocation: 'none'
 *   },
 *   reportTo: [{
 *     group: 'default',
 *     max_age: 86400,
 *     endpoints: [{ url: 'https://reports.example.com/csp' }]
 *   }]
 * }));
 * ```
 */
export function securityHeaders(
  options: SecurityHeadersOptions = {}
): Middleware {
  return async (_req: Request, res: Response, next: NextFunction) => {
    // Permissions-Policy header
    if (options.permissionsPolicy !== false) {
      const directives =
        options.permissionsPolicy || DEFAULT_PERMISSIONS_POLICY;
      const value = buildPermissionsPolicy(directives);
      if (value) {
        res.set("Permissions-Policy", value);
      }
    }

    // Report-To header
    if (options.reportTo && options.reportTo.length > 0) {
      const value = JSON.stringify(options.reportTo);
      res.set("Report-To", value);
    }

    // Network Error Logging
    if (options.nel) {
      res.set("NEL", JSON.stringify(options.nel));
    }

    // Clear-Site-Data header
    if (options.clearSiteData && options.clearSiteData.length > 0) {
      const values = options.clearSiteData.map((v) => `"${v}"`).join(", ");
      res.set("Clear-Site-Data", values);
    }

    // Expect-CT header
    if (options.expectCT) {
      let value = `max-age=${options.expectCT.maxAge}`;
      if (options.expectCT.enforce) value += ", enforce";
      if (options.expectCT.reportUri) {
        value += `, report-uri="${options.expectCT.reportUri}"`;
      }
      res.set("Expect-CT", value);
    }

    // Feature-Policy (deprecated)
    if (options.featurePolicy) {
      const parts: string[] = [];
      for (const [feature, allowlist] of Object.entries(
        options.featurePolicy
      )) {
        parts.push(`${feature} ${allowlist.join(" ")}`);
      }
      if (parts.length > 0) {
        res.set("Feature-Policy", parts.join("; "));
      }
    }

    // No-cache for secure pages
    if (options.noCacheSecure) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
    }

    // Disable client hints
    if (options.disableClientHints) {
      res.set("Accept-CH", "");
      res.set("Accept-CH-Lifetime", "0");
    }

    // Custom headers
    if (options.customHeaders) {
      for (const [name, value] of Object.entries(options.customHeaders)) {
        res.set(name, value);
      }
    }

    await next();
  };
}

/**
 * Create a Clear-Site-Data middleware (for logout/security reset)
 */
export function clearSiteData(
  types: ("cache" | "cookies" | "storage" | "executionContexts" | "*")[] = ["*"]
): Middleware {
  const value = types.map((t) => `"${t}"`).join(", ");

  return async (_req: Request, res: Response, next: NextFunction) => {
    res.set("Clear-Site-Data", value);
    await next();
  };
}

/**
 * Create a Permissions-Policy middleware
 */
export function permissionsPolicy(
  directives: PermissionsPolicyDirectives
): Middleware {
  const value = buildPermissionsPolicy(directives);

  return async (_req: Request, res: Response, next: NextFunction) => {
    res.set("Permissions-Policy", value);
    await next();
  };
}

/**
 * Strict Permissions Policy preset (deny most features)
 */
export function strictPermissionsPolicy(): Middleware {
  return permissionsPolicy({
    accelerometer: "none",
    "ambient-light-sensor": "none",
    autoplay: "none",
    battery: "none",
    camera: "none",
    "display-capture": "none",
    "document-domain": "none",
    fullscreen: "none",
    geolocation: "none",
    gyroscope: "none",
    magnetometer: "none",
    microphone: "none",
    midi: "none",
    payment: "none",
    "picture-in-picture": "none",
    "screen-wake-lock": "none",
    usb: "none",
    "xr-spatial-tracking": "none",
    "interest-cohort": "none",
  });
}

/**
 * API-friendly Permissions Policy preset
 */
export function apiPermissionsPolicy(): Middleware {
  return permissionsPolicy({
    accelerometer: "none",
    "ambient-light-sensor": "none",
    autoplay: "none",
    battery: "none",
    camera: "none",
    "display-capture": "none",
    geolocation: "none",
    gyroscope: "none",
    magnetometer: "none",
    microphone: "none",
    midi: "none",
    payment: "none",
    usb: "none",
    "interest-cohort": "none",
  });
}

/**
 * Add no-cache headers for sensitive pages
 */
export function noCache(): Middleware {
  return async (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    await next();
  };
}

/**
 * Add security headers for downloads
 */
export function secureDownload(): Middleware {
  return async (_req: Request, res: Response, next: NextFunction) => {
    res.set("X-Download-Options", "noopen");
    res.set("Content-Disposition", "attachment");
    res.set("X-Content-Type-Options", "nosniff");
    await next();
  };
}

/**
 * Add COEP, COOP, CORP headers for cross-origin isolation
 */
export function crossOriginIsolation(options?: {
  embedderPolicy?: "unsafe-none" | "require-corp" | "credentialless";
  openerPolicy?: "unsafe-none" | "same-origin-allow-popups" | "same-origin";
  resourcePolicy?: "same-site" | "same-origin" | "cross-origin";
}): Middleware {
  const embedderPolicy = options?.embedderPolicy || "require-corp";
  const openerPolicy = options?.openerPolicy || "same-origin";
  const resourcePolicy = options?.resourcePolicy || "same-origin";

  return async (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cross-Origin-Embedder-Policy", embedderPolicy);
    res.set("Cross-Origin-Opener-Policy", openerPolicy);
    res.set("Cross-Origin-Resource-Policy", resourcePolicy);
    await next();
  };
}
