/**
 * ArcanaJS Request Implementation - Production Version
 *
 * Enhanced request wrapper with proper lazy loading,
 * caching, and Bun-specific optimizations
 */

import accepts from "accepts";
import type { Application } from "../core/application";
import type { Request } from "../types";

/**
 * Request implementation with lazy property loading
 */
export class RequestImpl implements Request {
  // Core properties
  public method: string;
  public url: string;
  public path: string;
  public baseUrl: string = "";
  public params: Record<string, string> = {};
  public query: Record<string, string | string[]> = {};
  public headers: Headers;
  public body: any = null;
  public app: Application;
  public cookies: Record<string, any> = {};
  public signedCookies: Record<string, any> = {};
  public secret?: string | string[];

  // Native request reference
  public _nativeRequest: globalThis.Request;

  // Cached properties
  private _ip?: string;
  private _protocol?: "http" | "https";
  private _hostname?: string;
  private _subdomains?: string[];
  private _xhr?: boolean;
  private _secure?: boolean;
  private _fresh?: boolean;
  private _stale?: boolean;
  private _accepts?: any; // accepts instance

  [key: string]: any;

  constructor(nativeRequest: globalThis.Request, app: Application) {
    const url = new URL(nativeRequest.url);

    this._nativeRequest = nativeRequest;
    this.method = nativeRequest.method;
    this.url = nativeRequest.url;
    this.path = url.pathname;
    this.headers = nativeRequest.headers;
    this.app = app;

    // Parse query parameters
    this._parseQueryString(url);
  }

  // ============================================================================
  // Property Getters (Lazy Loading)
  // ============================================================================

  /**
   * Get client IP address
   * Supports proxy headers when trust proxy is enabled
   */
  get ip(): string {
    if (this._ip !== undefined) return this._ip;

    const trustProxy = this.app?.get?.("trust proxy");

    if (trustProxy) {
      // Try X-Forwarded-For
      const xff = this.headers.get("x-forwarded-for");
      if (xff) {
        this._ip = xff.split(",")[0].trim();
        return this._ip;
      }

      // Try X-Real-IP
      const xri = this.headers.get("x-real-ip");
      if (xri) {
        this._ip = xri.trim();
        return this._ip;
      }

      // Try CF-Connecting-IP (Cloudflare)
      const cfIp = this.headers.get("cf-connecting-ip");
      if (cfIp) {
        this._ip = cfIp.trim();
        return this._ip;
      }
    }

    // Fallback to empty (Bun doesn't expose socket directly)
    this._ip = "";
    return this._ip;
  }

  /**
   * Get request protocol
   */
  get protocol(): "http" | "https" {
    if (this._protocol) return this._protocol;

    const trustProxy = this.app?.get?.("trust proxy");

    if (trustProxy) {
      const proto = this.headers.get("x-forwarded-proto");
      if (proto) {
        this._protocol = proto.split(",")[0].trim() as "http" | "https";
        return this._protocol;
      }
    }

    this._protocol = new URL(this.url).protocol === "https:" ? "https" : "http";
    return this._protocol;
  }

  /**
   * Check if connection is secure (HTTPS)
   */
  get secure(): boolean {
    if (this._secure !== undefined) return this._secure;
    this._secure = this.protocol === "https";
    return this._secure;
  }

  /**
   * Check if request is XMLHttpRequest
   */
  get xhr(): boolean {
    if (this._xhr !== undefined) return this._xhr;
    const val = this.headers.get("x-requested-with") || "";
    this._xhr = val.toLowerCase() === "xmlhttprequest";
    return this._xhr;
  }

  /**
   * Get hostname from Host header
   */
  get hostname(): string {
    if (this._hostname) return this._hostname;

    const trustProxy = this.app?.get?.("trust proxy");

    if (trustProxy) {
      const xfh = this.headers.get("x-forwarded-host");
      if (xfh) {
        this._hostname = xfh.split(",")[0].trim().split(":")[0];
        return this._hostname;
      }
    }

    const host = this.headers.get("host") || "";
    this._hostname = host.split(":")[0];
    return this._hostname;
  }

  /**
   * Get subdomains array
   */
  get subdomains(): string[] {
    if (this._subdomains) return this._subdomains;

    const hostname = this.hostname;
    const offset = this.app?.get?.("subdomain offset") ?? 2;

    const parts = hostname.split(".");
    this._subdomains =
      parts.length > offset ? parts.slice(0, -offset).reverse() : [];

    return this._subdomains;
  }

  /**
   * Check if cache is fresh
   */
  get fresh(): boolean {
    if (this._fresh !== undefined) return this._fresh;

    const method = this.method;
    if (method !== "GET" && method !== "HEAD") {
      this._fresh = false;
      return false;
    }

    const noneMatch = this.headers.get("if-none-match");
    const modifiedSince = this.headers.get("if-modified-since");

    this._fresh = !!(noneMatch || modifiedSince);
    return this._fresh;
  }

  /**
   * Check if cache is stale
   */
  get stale(): boolean {
    if (this._stale !== undefined) return this._stale;
    this._stale = !this.fresh;
    return this._stale;
  }

  // ============================================================================
  // Header Methods
  // ============================================================================

  /**
   * Get header value (case-insensitive)
   */
  get(name: string): string | undefined {
    const lower = name.toLowerCase();

    // Special handling for Referrer/Referer
    if (lower === "referrer" || lower === "referer") {
      return (
        this.headers.get("referer") || this.headers.get("referrer") || undefined
      );
    }

    return this.headers.get(name) || undefined;
  }

  // ============================================================================
  // Content Negotiation
  // ============================================================================

  /**
   * Check if request accepts given content type(s)
   */
  accepts(...types: string[]): string | false {
    if (!this._accepts) {
      this._accepts = accepts(this as any);
    }

    const result = this._accepts.types(types);
    return Array.isArray(result) ? result[0] || false : result;
  }

  /**
   * Check if request accepts given encoding(s)
   */
  acceptsEncodings(...encodings: string[]): string | false {
    if (!this._accepts) {
      this._accepts = accepts(this as any);
    }

    const result = this._accepts.encodings(encodings);
    return Array.isArray(result) ? result[0] || false : result;
  }

  /**
   * Check if request accepts given language(s)
   */
  acceptsLanguages(...languages: string[]): string | false {
    if (!this._accepts) {
      this._accepts = accepts(this as any);
    }

    const result = this._accepts.languages(languages);
    return Array.isArray(result) ? result[0] || false : result;
  }

  /**
   * Check if Content-Type matches type(s)
   */
  is(...types: string[]): string | false {
    const contentType = this.headers.get("content-type");
    if (!contentType) return false;

    const type = contentType.split(";")[0].trim().toLowerCase();

    for (const t of types) {
      const normalized = this._normalizeType(t);
      if (this._matchType(type, normalized)) {
        return t;
      }
    }

    return false;
  }

  // ============================================================================
  // Body Parsing Methods
  // ============================================================================

  /**
   * Parse body as JSON
   */
  async json(): Promise<any> {
    if (this.body !== null) return this.body;

    try {
      this.body = await this._nativeRequest.json();
      return this.body;
    } catch {
      return null;
    }
  }

  /**
   * Parse body as text
   */
  async text(): Promise<string> {
    return this._nativeRequest.text();
  }

  /**
   * Parse body as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this._nativeRequest.arrayBuffer();
  }

  /**
   * Parse body as Blob
   */
  async blob(): Promise<Blob> {
    return this._nativeRequest.blob();
  }

  /**
   * Parse body as FormData
   */
  async formData(): Promise<FormData> {
    const contentType = this.headers.get("content-type");

    // For multipart, use streaming parser if needed
    if (contentType?.includes("multipart/form-data")) {
      return this._parseMultipartFormData();
    }

    return this._nativeRequest.formData() as unknown as FormData;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Parse query string from URL
   */
  private _parseQueryString(url: URL): void {
    for (const [key, value] of url.searchParams.entries()) {
      const existing = this.query[key];

      if (existing) {
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          this.query[key] = [existing, value];
        }
      } else {
        this.query[key] = value;
      }
    }
  }

  /**
   * Parse multipart form data with streaming
   */
  private async _parseMultipartFormData(): Promise<FormData> {
    try {
      const { parseMultipart } = await import("../utils/multipart");
      const config = this.app?.get("multipart") || {};
      const fields = await parseMultipart(this._nativeRequest, config);

      const formData = new FormData();
      for (const field of fields) {
        if (field.filename) {
          const file = new File([field.content], field.filename, {
            type: field.contentType || "application/octet-stream",
          });
          formData.append(field.name, file);
        } else {
          formData.append(field.name, field.content as string);
        }
      }

      return formData;
    } catch (error) {
      console.error("Multipart parsing error:", error);
      throw new Error("Failed to parse multipart form data");
    }
  }

  /**
   * Normalize content type shorthand
   */
  private _normalizeType(type: string): string {
    const types: Record<string, string> = {
      html: "text/html",
      text: "text/plain",
      json: "application/json",
      xml: "application/xml",
      urlencoded: "application/x-www-form-urlencoded",
      form: "multipart/form-data",
      multipart: "multipart/*",
    };

    return types[type] || type;
  }

  /**
   * Match content type
   */
  private _matchType(actual: string, expected: string): boolean {
    const [actualMain, actualSub] = actual.split("/");
    const [expectedMain, expectedSub] = expected.split("/");

    if (expectedMain === "*" || actualMain === expectedMain) {
      if (expectedSub === "*" || actualSub === expectedSub) {
        return true;
      }
    }

    return false;
  }
}
