/**
 * ArcanaJS Enhanced Request
 *
 */

import type {
  Request as RequestInterface,
  AcceptsResult,
} from "../../types";

export type { AcceptsResult };

/**
 * RequestImpl - Enhanced request implementation
 */
export class RequestImpl implements RequestInterface {
  // Core properties
  public method: string;
  public url: string;
  public path: string;
  public baseUrl: string = "";
  public params: Record<string, string> = {};
  public query: Record<string, string | string[]> = {};
  public headers: Headers;
  public body: any = null;
  public app: any;
  public cookies: Record<string, any> = {};
  public signedCookies: Record<string, any> = {};
  public secret?: string | string[];

  // Extended properties
  private _ip?: string;
  private _protocol?: "http" | "https";
  private _hostname?: string;
  private _subdomains?: string[];

  public _nativeRequest: globalThis.Request;
  [key: string]: any;

  constructor(nativeRequest: globalThis.Request, app: any) {
    const url = new URL(nativeRequest.url);
    this._nativeRequest = nativeRequest;
    this.method = nativeRequest.method;
    this.url = nativeRequest.url;
    this.path = url.pathname;
    this.headers = nativeRequest.headers;
    this.app = app;

    // Parse query string
    url.searchParams.forEach((value, key) => {
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
    });
  }

  /**
   * Get the client IP address
   * Supports X-Forwarded-For and X-Real-IP headers when trust proxy is enabled
   */
  get ip(): string {
    if (this._ip) return this._ip;

    const trustProxy = this.app?.get?.("trust proxy");

    if (trustProxy) {
      // Try X-Forwarded-For first
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
    }

    // Default to empty (Bun doesn't expose socket info directly)
    this._ip = "";
    return this._ip;
  }

  /**
   * Get the request protocol
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

    // Check URL
    this._protocol = new URL(this.url).protocol === "https:" ? "https" : "http";
    return this._protocol;
  }

  /**
   * Check if the connection is secure (HTTPS)
   */
  get secure(): boolean {
    return this.protocol === "https";
  }

  /**
   * Check if request is XMLHttpRequest
   */
  get xhr(): boolean {
    const val = this.headers.get("x-requested-with") || "";
    return val.toLowerCase() === "xmlhttprequest";
  }

  /**
   * Get the hostname from the Host header
   */
  get hostname(): string {
    if (this._hostname) return this._hostname;

    const trustProxy = this.app?.get?.("trust proxy");

    // Try X-Forwarded-Host first if trusting proxy
    if (trustProxy) {
      const xfh = this.headers.get("x-forwarded-host");
      if (xfh) {
        this._hostname = xfh.split(",")[0].trim().split(":")[0];
        return this._hostname;
      }
    }

    // Use Host header
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
    this._subdomains = parts.slice(0, -offset).reverse();

    return this._subdomains;
  }

  /**
   * Check if the cache is fresh (not modified)
   */
  get fresh(): boolean {
    const method = this.method;

    // Only GET/HEAD requests can be fresh
    if (method !== "GET" && method !== "HEAD") {
      return false;
    }

    // Check If-None-Match (ETag)
    const noneMatch = this.headers.get("if-none-match");
    // Check If-Modified-Since
    const modifiedSince = this.headers.get("if-modified-since");

    // Request is not conditional
    if (!noneMatch && !modifiedSince) {
      return false;
    }

    // For now, return false (proper implementation needs response headers)
    return false;
  }

  /**
   * Check if the cache is stale
   */
  get stale(): boolean {
    return !this.fresh;
  }

  /**
   * Get the value of a header (case-insensitive)
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

  /**
   * Check if the request accepts the given content type(s)
   */
  accepts(...types: string[]): string | false {
    const accept = this.headers.get("accept") || "*/*";

    if (types.length === 0) {
      return accept;
    }

    const parsed = this._parseAccept(accept);

    for (const type of types) {
      const normalizedType = this._normalizeType(type);

      for (const accepted of parsed) {
        if (this._matchType(normalizedType, accepted.type)) {
          return type;
        }
      }
    }

    return false;
  }

  /**
   * Check if the request accepts the given encoding(s)
   */
  acceptsEncodings(...encodings: string[]): string | false {
    const accept = this.headers.get("accept-encoding") || "";

    if (encodings.length === 0) {
      return accept;
    }

    const parts = accept
      .split(",")
      .map((e) => e.trim().split(";")[0].toLowerCase());

    for (const encoding of encodings) {
      if (parts.includes(encoding.toLowerCase())) {
        return encoding;
      }
    }

    // identity is always acceptable unless explicitly rejected
    if (encodings.includes("identity") && !parts.includes("identity;q=0")) {
      return "identity";
    }

    return false;
  }

  /**
   * Check if the request accepts the given language(s)
   */
  acceptsLanguages(...languages: string[]): string | false {
    const accept = this.headers.get("accept-language") || "";

    if (languages.length === 0) {
      return accept;
    }

    const parts = accept
      .split(",")
      .map((l) => l.trim().split(";")[0].toLowerCase());

    for (const lang of languages) {
      const lower = lang.toLowerCase();
      if (
        parts.includes(lower) ||
        parts.some((p) => p.startsWith(lower.split("-")[0]))
      ) {
        return lang;
      }
    }

    return false;
  }

  /**
   * Check if the request's Content-Type matches the given type(s)
   */
  is(...types: string[]): string | false {
    const contentType = this.headers.get("content-type");
    if (!contentType) return false;

    const type = contentType.split(";")[0].trim();

    for (const t of types) {
      const normalized = this._normalizeType(t);
      if (this._matchType(type, normalized)) {
        return t;
      }
    }

    return false;
  }

  /**
   * Parse request body as JSON
   */
  async json(): Promise<any> {
    if (this.body) return this.body;
    try {
      this.body = await this._nativeRequest.json();
      return this.body;
    } catch (e) {
      return null;
    }
  }

  /**
   * Parse request body as text
   */
  async text(): Promise<string> {
    return this._nativeRequest.text();
  }

  /**
   * Parse request body as ArrayBuffer
   */
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this._nativeRequest.arrayBuffer();
  }

  /**
   * Parse request body as Blob
   */
  async blob(): Promise<Blob> {
    return this._nativeRequest.blob();
  }

  /**
   * Parse request body as FormData
   * @note For large file uploads, this method uses a streaming parser
   * to avoid memory issues. For regular requests, it uses Bun's native formData().
   */
  async formData(): Promise<FormData> {
    // Check if this is a multipart request that might contain large files
    const contentType = this.headers.get("content-type");
    const isMultipart =
      contentType && contentType.includes("multipart/form-data");

    if (isMultipart) {
      // For multipart requests, use our streaming parser
      // This prevents memory issues with large file uploads
      return this._parseMultipartFormData();
    }

    // For non-multipart requests, use Bun's native formData()
    if (typeof this._nativeRequest.formData === "function") {
      return this._nativeRequest.formData() as unknown as FormData;
    }

    throw new Error("formData() is not supported by this Request");
  }

  /**
   * Parse multipart form data using streaming parser
   * This method handles large file uploads efficiently
   */
  private async _parseMultipartFormData(): Promise<FormData> {
    try {
      // Import the multipart parser dynamically to avoid circular dependencies
      const { parseMultipart } = await import("../../utils/multipart");

      // Get multipart configuration from the framework
      const multipartConfig = this.app?.get("multipart") || {};

      const fields = await parseMultipart(this._nativeRequest, multipartConfig);

      // Convert our parsed fields to a FormData object
      const formData = new FormData();

      for (const field of fields) {
        if (field.filename) {
          // This is a file - create a File object
          const file = new File([field.content], field.filename, {
            type: field.contentType || "application/octet-stream",
          });
          formData.append(field.name, file);
        } else {
          // This is a regular field
          formData.append(field.name, field.content as string);
        }
      }

      return formData;
    } catch (error) {
      console.error("Error parsing multipart form data:", error);
      throw new Error("Failed to parse multipart form data");
    }
  }

  // Private helpers

  private _parseAccept(accept: string): AcceptsResult[] {
    return accept
      .split(",")
      .map((part) => {
        const [type, ...params] = part.trim().split(";");
        const [main, sub] = type.split("/");

        let quality = 1;
        const parsedParams: Record<string, string> = {};

        for (const param of params) {
          const [key, value] = param.trim().split("=");
          if (key === "q") {
            quality = parseFloat(value) || 1;
          } else {
            parsedParams[key] = value;
          }
        }

        return {
          type: type.trim(),
          subtype: sub || "*",
          params: parsedParams,
          quality,
        };
      })
      .sort((a, b) => b.quality - a.quality);
  }

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
