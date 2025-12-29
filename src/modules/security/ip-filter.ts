/**
 * ArcanaJS IP Filtering Middleware
 *
 * Provides IP-based access control with whitelist/blacklist support,
 * CIDR range matching, and proxy trust configuration.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * IP Filter Options
 */
export interface IPFilterOptions {
  /** Mode: 'whitelist' allows only listed IPs, 'blacklist' blocks listed IPs */
  mode?: "whitelist" | "blacklist";

  /** List of allowed IPs (for whitelist mode) */
  whitelist?: string[];

  /** List of blocked IPs (for blacklist mode) */
  blacklist?: string[];

  /** Trust proxy headers (X-Forwarded-For, X-Real-IP) */
  trustProxy?: boolean | number | string[];

  /** Custom IP getter */
  getIP?: (req: Request) => string | undefined;

  /** Custom error handler */
  onBlocked?: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  /** Log blocked requests */
  log?: boolean | ((ip: string, req: Request) => void);

  /** Skip filter for certain requests */
  skip?: (req: Request) => boolean | Promise<boolean>;

  /** Status code for blocked requests. Default: 403 */
  statusCode?: number;

  /** Error message for blocked requests */
  message?: string | object;
}

/**
 * CIDR block representation
 */
interface CIDRBlock {
  ip: number[];
  mask: number;
  isIPv6: boolean;
}

/**
 * Parse IPv4 address to number array
 */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;

  return nums;
}

/**
 * Parse IPv6 address to number array (16-bit groups)
 */
function parseIPv6(ip: string): number[] | null {
  // Handle IPv4-mapped IPv6
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    const ipv4Part = ip.substring(lastColon + 1);
    const ipv6Part = ip.substring(0, lastColon);

    const ipv4 = parseIPv4(ipv4Part);
    if (!ipv4) return null;

    // Convert IPv4 to two 16-bit groups
    const ipv4Groups = [(ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]];

    const prefix = expandIPv6(ipv6Part + ":0:0");
    if (!prefix) return null;

    return [...prefix.slice(0, 6), ...ipv4Groups];
  }

  return expandIPv6(ip);
}

/**
 * Expand IPv6 shorthand notation
 */
function expandIPv6(ip: string): number[] | null {
  const parts = ip.split("::");
  if (parts.length > 2) return null;

  let groups: string[] = [];

  if (parts.length === 2) {
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;

    if (missing < 0) return null;

    groups = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    groups = ip.split(":");
  }

  if (groups.length !== 8) return null;

  const nums = groups.map((g) => parseInt(g || "0", 16));
  if (nums.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;

  return nums;
}

/**
 * Parse IP address (IPv4 or IPv6)
 */
function parseIP(ip: string): { parts: number[]; isIPv6: boolean } | null {
  // Clean the IP
  ip = ip.trim();

  // Handle IPv6 brackets
  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }

  // Try IPv4 first
  const ipv4 = parseIPv4(ip);
  if (ipv4) {
    return { parts: ipv4, isIPv6: false };
  }

  // Try IPv6
  const ipv6 = parseIPv6(ip);
  if (ipv6) {
    return { parts: ipv6, isIPv6: true };
  }

  return null;
}

/**
 * Parse CIDR notation
 */
function parseCIDR(cidr: string): CIDRBlock | null {
  const parts = cidr.split("/");
  const ip = parts[0];
  const mask = parts[1] ? parseInt(parts[1], 10) : null;

  const parsed = parseIP(ip);
  if (!parsed) return null;

  const maxMask = parsed.isIPv6 ? 128 : 32;
  const effectiveMask = mask !== null && !isNaN(mask) ? mask : maxMask;

  if (effectiveMask < 0 || effectiveMask > maxMask) return null;

  return {
    ip: parsed.parts,
    mask: effectiveMask,
    isIPv6: parsed.isIPv6,
  };
}

/**
 * Check if an IP matches a CIDR block
 */
function matchesCIDR(ip: string, cidr: CIDRBlock): boolean {
  const parsed = parseIP(ip);
  if (!parsed) return false;

  // Convert IPv4 to IPv6 for comparison if needed
  let ipParts = parsed.parts;
  let cidrParts = cidr.ip;
  let mask = cidr.mask;

  if (parsed.isIPv6 !== cidr.isIPv6) {
    // Handle IPv4-mapped comparison
    if (!parsed.isIPv6 && cidr.isIPv6) {
      // Convert IPv4 to IPv4-mapped IPv6
      ipParts = [
        0,
        0,
        0,
        0,
        0,
        0xffff,
        (ipParts[0] << 8) | ipParts[1],
        (ipParts[2] << 8) | ipParts[3],
      ];
    } else if (parsed.isIPv6 && !cidr.isIPv6) {
      // Check if it's an IPv4-mapped IPv6
      if (
        ipParts[0] === 0 &&
        ipParts[1] === 0 &&
        ipParts[2] === 0 &&
        ipParts[3] === 0 &&
        ipParts[4] === 0 &&
        ipParts[5] === 0xffff
      ) {
        ipParts = [
          ipParts[6] >> 8,
          ipParts[6] & 0xff,
          ipParts[7] >> 8,
          ipParts[7] & 0xff,
        ];
      } else {
        return false;
      }
    }
  }

  // Compare bits
  const bitsPerPart = parsed.isIPv6 && cidr.isIPv6 ? 16 : 8;
  let remainingBits = mask;

  for (let i = 0; i < ipParts.length && remainingBits > 0; i++) {
    const bitsToCheck = Math.min(remainingBits, bitsPerPart);
    const shiftAmount = bitsPerPart - bitsToCheck;
    const partMask = ((1 << bitsToCheck) - 1) << shiftAmount;

    if ((ipParts[i] & partMask) !== (cidrParts[i] & partMask)) {
      return false;
    }

    remainingBits -= bitsToCheck;
  }

  return true;
}

/**
 * Check if IP matches any in the list (supports CIDR notation)
 */
function matchesAny(ip: string, list: string[]): boolean {
  for (const entry of list) {
    // Check for CIDR notation
    if (entry.includes("/")) {
      const cidr = parseCIDR(entry);
      if (cidr && matchesCIDR(ip, cidr)) {
        return true;
      }
    } else {
      // Exact match
      if (ip === entry) return true;

      // Handle localhost variations
      if (
        (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") &&
        (entry === "127.0.0.1" || entry === "::1" || entry === "localhost")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get real IP from request considering proxy headers
 */
function getRealIP(
  req: Request,
  trustProxy: boolean | number | string[]
): string {
  if (!trustProxy) {
    return req.ip || "unknown";
  }

  // X-Forwarded-For can contain multiple IPs
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());

    if (typeof trustProxy === "number") {
      // Trust specific number of proxies from the right
      const index = Math.max(0, ips.length - trustProxy);
      return ips[index] || req.ip || "unknown";
    }

    if (Array.isArray(trustProxy)) {
      // Trust specific proxy IPs
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!matchesAny(ips[i], trustProxy)) {
          return ips[i];
        }
      }
    }

    // Trust all - return first (client) IP
    return ips[0] || req.ip || "unknown";
  }

  // Try X-Real-IP
  const xRealIP = req.headers.get("x-real-ip");
  if (xRealIP) {
    return xRealIP.trim();
  }

  return req.ip || "unknown";
}

/**
 * Default blocked handler
 */
async function defaultOnBlocked(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(403);
  await res.json({
    error: "Forbidden",
    message: "Access denied",
    code: "IP_BLOCKED",
  });
}

/**
 * Create IP filtering middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { ipFilter } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * // Whitelist mode - only allow specific IPs
 * app.use(ipFilter({
 *   mode: 'whitelist',
 *   whitelist: ['127.0.0.1', '::1', '192.168.1.0/24']
 * }));
 *
 * // Blacklist mode - block specific IPs
 * app.use(ipFilter({
 *   mode: 'blacklist',
 *   blacklist: ['10.0.0.1', '10.0.0.0/8'],
 *   trustProxy: true
 * }));
 * ```
 */
export function ipFilter(options: IPFilterOptions = {}): Middleware {
  const mode = options.mode || "blacklist";
  const whitelist = options.whitelist || [];
  const blacklist = options.blacklist || [];
  const trustProxy = options.trustProxy ?? false;
  const onBlocked = options.onBlocked || defaultOnBlocked;
  const statusCode = options.statusCode || 403;
  const log = options.log;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if configured
    if (options.skip) {
      const shouldSkip = await options.skip(req);
      if (shouldSkip) {
        return next();
      }
    }

    // Get the client IP
    const ip = options.getIP
      ? options.getIP(req) || "unknown"
      : getRealIP(req, trustProxy);

    // Store real IP on request for later use
    (req as any).realIP = ip;

    let isBlocked = false;

    if (mode === "whitelist") {
      // In whitelist mode, block if NOT in whitelist
      isBlocked = !matchesAny(ip, whitelist);
    } else {
      // In blacklist mode, block if in blacklist
      isBlocked = matchesAny(ip, blacklist);
    }

    if (isBlocked) {
      // Log if configured
      if (log) {
        if (typeof log === "function") {
          log(ip, req);
        } else {
          console.warn(
            `[IPFilter] Blocked request from IP: ${ip} to ${req.path}`
          );
        }
      }

      res.status(statusCode);

      if (options.message) {
        if (typeof options.message === "object") {
          await res.json(options.message);
        } else {
          await res.send(options.message);
        }
        return;
      }

      return onBlocked(req, res, next);
    }

    await next();
  };
}

/**
 * Create a simple IP whitelist middleware
 */
export function allowOnly(...ips: string[]): Middleware {
  return ipFilter({
    mode: "whitelist",
    whitelist: ips,
  });
}

/**
 * Create a simple IP blacklist middleware
 */
export function blockIPs(...ips: string[]): Middleware {
  return ipFilter({
    mode: "blacklist",
    blacklist: ips,
  });
}

/**
 * Create a localhost-only middleware
 */
export function localhostOnly(): Middleware {
  return ipFilter({
    mode: "whitelist",
    whitelist: ["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"],
  });
}

/**
 * Create a private network only middleware
 */
export function privateNetworkOnly(): Middleware {
  return ipFilter({
    mode: "whitelist",
    whitelist: [
      // IPv4 private ranges
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "127.0.0.0/8",
      // IPv6 private ranges
      "::1/128",
      "fc00::/7",
      "fe80::/10",
    ],
  });
}

/**
 * Utility: Check if an IP is in a CIDR range
 */
export function isIPInRange(ip: string, cidr: string): boolean {
  const parsed = parseCIDR(cidr);
  if (!parsed) return false;
  return matchesCIDR(ip, parsed);
}

/**
 * Utility: Normalize an IP address
 */
export function normalizeIP(ip: string): string | null {
  const parsed = parseIP(ip);
  if (!parsed) return null;

  if (parsed.isIPv6) {
    return parsed.parts.map((p) => p.toString(16)).join(":");
  }

  return parsed.parts.join(".");
}

/**
 * Utility: Check if an IP is private
 */
export function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
  ];

  return privateRanges.some((range) => {
    const cidr = parseCIDR(range);
    return cidr && matchesCIDR(ip, cidr);
  });
}
