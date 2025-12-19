/**
 * ArcanaJS Helmet Security Headers
 *
 * Helmet-like middleware that sets security headers to protect against common vulnerabilities.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Content Security Policy directives
 */
export interface CSPDirectives {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  mediaSrc?: string[];
  objectSrc?: string[];
  frameSrc?: string[];
  childSrc?: string[];
  workerSrc?: string[];
  frameAncestors?: string[];
  formAction?: string[];
  baseUri?: string[];
  manifestSrc?: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
  reportUri?: string;
  reportTo?: string;
}

/**
 * Content Security Policy options
 */
export interface CSPOptions {
  directives?: CSPDirectives;
  reportOnly?: boolean;
}

/**
 * HSTS options
 */
export interface HSTSOptions {
  maxAge?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

/**
 * Referrer Policy options
 */
export type ReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

/**
 * Cross-Origin Resource Policy options
 */
export type CrossOriginResourcePolicy =
  | "same-site"
  | "same-origin"
  | "cross-origin";

/**
 * Cross-Origin Opener Policy options
 */
export type CrossOriginOpenerPolicy =
  | "unsafe-none"
  | "same-origin-allow-popups"
  | "same-origin";

/**
 * Cross-Origin Embedder Policy options
 */
export type CrossOriginEmbedderPolicy = "unsafe-none" | "require-corp";

/**
 * Helmet configuration options
 */
export interface HelmetOptions {
  /** Content Security Policy */
  contentSecurityPolicy?: boolean | CSPOptions;
  /** Cross-Origin Embedder Policy */
  crossOriginEmbedderPolicy?: boolean | { policy: CrossOriginEmbedderPolicy };
  /** Cross-Origin Opener Policy */
  crossOriginOpenerPolicy?: boolean | { policy: CrossOriginOpenerPolicy };
  /** Cross-Origin Resource Policy */
  crossOriginResourcePolicy?: boolean | { policy: CrossOriginResourcePolicy };
  /** DNS Prefetch Control */
  dnsPrefetchControl?: boolean | { allow: boolean };
  /** X-Frame-Options */
  frameguard?: boolean | { action: "deny" | "sameorigin" };
  /** Hide X-Powered-By header */
  hidePoweredBy?: boolean;
  /** HTTP Strict Transport Security */
  hsts?: boolean | HSTSOptions;
  /** X-Download-Options for IE */
  ieNoOpen?: boolean;
  /** X-Content-Type-Options nosniff */
  noSniff?: boolean;
  /** Origin-Agent-Cluster */
  originAgentCluster?: boolean;
  /** X-Permitted-Cross-Domain-Policies */
  permittedCrossDomainPolicies?: boolean | { permittedPolicies: string };
  /** Referrer-Policy */
  referrerPolicy?: boolean | { policy: ReferrerPolicy | ReferrerPolicy[] };
  /** X-XSS-Protection (deprecated but still used) */
  xssFilter?: boolean;
}

/**
 * Default helmet options
 */
const DEFAULT_OPTIONS: HelmetOptions = {
  contentSecurityPolicy: false, // Disabled by default (too restrictive)
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "sameorigin" },
  hidePoweredBy: true,
  hsts: { maxAge: 15552000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: false, // Deprecated, browsers no longer support it
};

/**
 * Build CSP header value
 */
function buildCSP(options: CSPOptions): string {
  const directives: string[] = [];
  const dirs = options.directives || {};

  const directiveNames: Record<keyof CSPDirectives, string> = {
    defaultSrc: "default-src",
    scriptSrc: "script-src",
    styleSrc: "style-src",
    imgSrc: "img-src",
    fontSrc: "font-src",
    connectSrc: "connect-src",
    mediaSrc: "media-src",
    objectSrc: "object-src",
    frameSrc: "frame-src",
    childSrc: "child-src",
    workerSrc: "worker-src",
    frameAncestors: "frame-ancestors",
    formAction: "form-action",
    baseUri: "base-uri",
    manifestSrc: "manifest-src",
    upgradeInsecureRequests: "upgrade-insecure-requests",
    blockAllMixedContent: "block-all-mixed-content",
    reportUri: "report-uri",
    reportTo: "report-to",
  };

  for (const [key, value] of Object.entries(dirs)) {
    const name = directiveNames[key as keyof CSPDirectives];
    if (!name) continue;

    if (typeof value === "boolean") {
      if (value) directives.push(name);
    } else if (Array.isArray(value)) {
      directives.push(`${name} ${value.join(" ")}`);
    } else if (typeof value === "string") {
      directives.push(`${name} ${value}`);
    }
  }

  return directives.join("; ");
}

/**
 * Create helmet middleware with security headers
 */
export function helmet(options: HelmetOptions = {}): Middleware {
  const config = { ...DEFAULT_OPTIONS, ...options };

  return async (req: Request, res: Response, next: NextFunction) => {
    // Content Security Policy
    if (config.contentSecurityPolicy) {
      const cspOptions =
        typeof config.contentSecurityPolicy === "object"
          ? config.contentSecurityPolicy
          : {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:"],
              },
            };
      const headerName = cspOptions.reportOnly
        ? "Content-Security-Policy-Report-Only"
        : "Content-Security-Policy";
      res.set(headerName, buildCSP(cspOptions));
    }

    // Cross-Origin Embedder Policy
    if (config.crossOriginEmbedderPolicy) {
      const policy =
        typeof config.crossOriginEmbedderPolicy === "object"
          ? config.crossOriginEmbedderPolicy.policy
          : "require-corp";
      res.set("Cross-Origin-Embedder-Policy", policy);
    }

    // Cross-Origin Opener Policy
    if (config.crossOriginOpenerPolicy) {
      const policy =
        typeof config.crossOriginOpenerPolicy === "object"
          ? config.crossOriginOpenerPolicy.policy
          : "same-origin";
      res.set("Cross-Origin-Opener-Policy", policy);
    }

    // Cross-Origin Resource Policy
    if (config.crossOriginResourcePolicy) {
      const policy =
        typeof config.crossOriginResourcePolicy === "object"
          ? config.crossOriginResourcePolicy.policy
          : "same-origin";
      res.set("Cross-Origin-Resource-Policy", policy);
    }

    // DNS Prefetch Control
    if (config.dnsPrefetchControl !== false) {
      const allow =
        typeof config.dnsPrefetchControl === "object"
          ? config.dnsPrefetchControl.allow
          : false;
      res.set("X-DNS-Prefetch-Control", allow ? "on" : "off");
    }

    // X-Frame-Options
    if (config.frameguard) {
      const action =
        typeof config.frameguard === "object"
          ? config.frameguard.action.toUpperCase()
          : "SAMEORIGIN";
      res.set("X-Frame-Options", action);
    }

    // Hide X-Powered-By
    if (config.hidePoweredBy) {
      res.removeHeader?.("X-Powered-By");
    }

    // HTTP Strict Transport Security
    if (config.hsts) {
      const hstsOpts: HSTSOptions =
        typeof config.hsts === "object"
          ? config.hsts
          : { maxAge: 15552000, includeSubDomains: true };

      let value = `max-age=${hstsOpts.maxAge || 15552000}`;
      if (hstsOpts.includeSubDomains) value += "; includeSubDomains";
      if (hstsOpts.preload) value += "; preload";

      res.set("Strict-Transport-Security", value);
    }

    // X-Download-Options (IE)
    if (config.ieNoOpen) {
      res.set("X-Download-Options", "noopen");
    }

    // X-Content-Type-Options
    if (config.noSniff) {
      res.set("X-Content-Type-Options", "nosniff");
    }

    // Origin-Agent-Cluster
    if (config.originAgentCluster) {
      res.set("Origin-Agent-Cluster", "?1");
    }

    // X-Permitted-Cross-Domain-Policies
    if (config.permittedCrossDomainPolicies) {
      const policy =
        typeof config.permittedCrossDomainPolicies === "object"
          ? config.permittedCrossDomainPolicies.permittedPolicies
          : "none";
      res.set("X-Permitted-Cross-Domain-Policies", policy);
    }

    // Referrer-Policy
    if (config.referrerPolicy) {
      const policy =
        typeof config.referrerPolicy === "object"
          ? Array.isArray(config.referrerPolicy.policy)
            ? config.referrerPolicy.policy.join(", ")
            : config.referrerPolicy.policy
          : "no-referrer";
      res.set("Referrer-Policy", policy);
    }

    // X-XSS-Protection (deprecated)
    if (config.xssFilter) {
      res.set("X-XSS-Protection", "0");
    }

    await next();
  };
}

// Individual middleware for each security header

export function contentSecurityPolicy(options?: CSPOptions): Middleware {
  return helmet({ contentSecurityPolicy: options || true });
}

export function dnsPrefetchControl(options?: { allow: boolean }): Middleware {
  return helmet({ dnsPrefetchControl: options || { allow: false } });
}

export function frameguard(options?: {
  action: "deny" | "sameorigin";
}): Middleware {
  return helmet({ frameguard: options || { action: "sameorigin" } });
}

export function hidePoweredBy(): Middleware {
  return helmet({ hidePoweredBy: true });
}

export function hsts(options?: HSTSOptions): Middleware {
  return helmet({ hsts: options || true });
}

export function noSniff(): Middleware {
  return helmet({ noSniff: true });
}

export function referrerPolicy(options?: {
  policy: ReferrerPolicy;
}): Middleware {
  return helmet({ referrerPolicy: options || { policy: "no-referrer" } });
}
