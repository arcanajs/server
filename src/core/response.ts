/**
 * ArcanaJS Response Implementation - Production Version
 *
 * Enhanced response wrapper with proper lifecycle management,
 * hook integration, and Bun-specific optimizations
 */

import cookie from "cookie";
import signature from "cookie-signature";
import { lookup } from "mime-types";
import type { Application } from "../core/application";
import type { Request, Response } from "../types";

/**
 * Cookie options for response
 */
interface ResponseCookieOptions {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none" | boolean;
  path?: string;
  domain?: string;
  signed?: boolean;
  encode?: (val: string) => string;
}

/**
 * Response implementation with lifecycle management
 */
export class ResponseImpl implements Response {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _sent: boolean = false;
  private _headersSent: boolean = false;
  private _resolve: (res: globalThis.Response) => void;
  private _app: Application;
  private _deferredFunctions: (() => void | Promise<void>)[] = [];

  public req!: Request;

  [key: string]: any;

  constructor(
    resolve: (res: globalThis.Response) => void,
    app: Application,
    req: Request
  ) {
    this._resolve = resolve;
    this._app = app;
    this.req = req;

    // Set default headers
    this._setDefaultHeaders();
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Set status code
   */
  status(code: number): this {
    if (this._headersSent) {
      throw new Error("Cannot set status after headers sent");
    }

    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new Error(`Invalid status code: ${code}`);
    }

    this._status = code;
    return this;
  }

  get statusCode(): number {
    return this._status;
  }

  // ============================================================================
  // Header Methods
  // ============================================================================

  /**
   * Set header
   */
  set(name: string, value: string): this {
    if (this._headersSent) {
      throw new Error("Cannot set headers after they are sent");
    }

    this._headers.set(name, value);
    return this;
  }

  /**
   * Alias for set
   */
  header(name: string, value: string): this {
    return this.set(name, value);
  }

  /**
   * Get header value
   */
  get(name: string): string | null {
    return this._headers.get(name);
  }

  /**
   * Append header value
   */
  append(name: string, value: string): this {
    if (this._headersSent) {
      throw new Error("Cannot append headers after they are sent");
    }

    this._headers.append(name, value);
    return this;
  }

  /**
   * Remove header
   */
  removeHeader(name: string): this {
    if (this._headersSent) {
      throw new Error("Cannot remove headers after they are sent");
    }

    this._headers.delete(name);
    return this;
  }

  /**
   * Set Content-Type header with shorthand support
   */
  type(contentType: string): this {
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      text: "text/plain; charset=utf-8",
      json: "application/json; charset=utf-8",
      xml: "application/xml; charset=utf-8",
      bin: "application/octet-stream",
      form: "application/x-www-form-urlencoded",
    };

    const type = types[contentType] || contentType;
    return this.set("Content-Type", type);
  }

  /**
   * Set Vary header
   */
  vary(field: string): this {
    const current = this._headers.get("Vary");

    if (current) {
      const fields = current.split(",").map((f) => f.trim().toLowerCase());
      if (!fields.includes(field.toLowerCase())) {
        this.set("Vary", `${current}, ${field}`);
      }
    } else {
      this.set("Vary", field);
    }

    return this;
  }

  /**
   * Set Location header
   */
  location(url: string): this {
    return this.set("Location", url);
  }

  /**
   * Set Link header
   */
  links(links: Record<string, string>): this {
    const linkHeader = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(", ");

    const current = this._headers.get("Link");
    if (current) {
      this.set("Link", `${current}, ${linkHeader}`);
    } else {
      this.set("Link", linkHeader);
    }

    return this;
  }

  // ============================================================================
  // Cookie Methods
  // ============================================================================

  /**
   * Set cookie
   */
  cookie(name: string, value: any, options: ResponseCookieOptions = {}): this {
    if (this._headersSent) {
      throw new Error("Cannot set cookie after headers sent");
    }

    let val =
      typeof value === "object" ? "j:" + JSON.stringify(value) : String(value);

    // Sign cookie if requested
    if (options.signed) {
      const secret = this.req.secret || this._app?.get("cookie secret");
      if (!secret) {
        throw new Error("Cookie secret required for signed cookies");
      }

      const secretKey = Array.isArray(secret) ? secret[0] : secret;
      val = "s:" + signature.sign(val, secretKey);
    }

    // Prepare cookie options
    const cookieOpts: cookie.SerializeOptions = {
      ...options,
      maxAge: options.maxAge,
      expires: options.expires,
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? false,
      path: options.path ?? "/",
      domain: options.domain,
      encode: options.encode,
    };

    // Handle sameSite
    if (options.sameSite !== undefined) {
      if (typeof options.sameSite === "boolean") {
        cookieOpts.sameSite = options.sameSite ? "strict" : undefined;
      } else {
        cookieOpts.sameSite = options.sameSite;
      }
    }

    const cookieStr = cookie.serialize(name, val, cookieOpts);
    this._headers.append("Set-Cookie", cookieStr);

    return this;
  }

  /**
   * Clear cookie
   */
  clearCookie(name: string, options: ResponseCookieOptions = {}): this {
    return this.cookie(name, "", {
      ...options,
      expires: new Date(1),
      maxAge: 0,
    });
  }

  // ============================================================================
  // Response Methods
  // ============================================================================

  /**
   * Send JSON response
   */
  async json(data: any): Promise<this> {
    this.type("json");

    const spaces = this._app?.get("json spaces") || 0;
    const json = JSON.stringify(data, null, spaces);

    return await this.send(json);
  }

  /**
   * Send HTML response
   */
  async html(data: string): Promise<this> {
    this.type("html");
    return await this.send(data);
  }

  /**
   * Send response body
   */
  async send(data: string | Buffer | Uint8Array): Promise<this> {
    if (this._sent) {
      return this;
    }

    try {
      // Execute deferred functions before response
      await this._executeDeferredFunctions();

      // Run beforeResponse hooks
      if (this._app) {
        await this._app.runBeforeResponseHooks(this.req, this);
      }

      // Set Content-Length if not set
      if (!this._headers.has("Content-Length")) {
        const length =
          typeof data === "string"
            ? new TextEncoder().encode(data).length
            : data.length;
        this._headers.set("Content-Length", String(length));
      }

      // Mark as sent
      this._sent = true;
      this._headersSent = true;

      // Resolve with response
      this._resolve(
        new globalThis.Response(data, {
          status: this._status,
          headers: this._headers,
        })
      );

      // Run afterResponse hooks
      if (this._app) {
        await this._app.runAfterResponseHooks(this.req, this);
      }

      return this;
    } catch (error) {
      console.error("Error sending response:", error);
      throw error;
    }
  }

  /**
   * Send status with message
   */
  async sendStatus(code: number): Promise<this> {
    const messages: Record<number, string> = {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved Permanently",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
    };

    this._status = code;
    const message = messages[code] || String(code);

    return await this.send(message);
  }

  /**
   * Redirect to URL
   */
  async redirect(url: string, status: number = 302): Promise<this> {
    this._status = status;
    this.set("Location", url);

    const body = `Redirecting to ${url}`;
    return await this.send(body);
  }

  /**
   * End response
   */
  async end(data?: string | Buffer | Uint8Array): Promise<this> {
    if (data) {
      return await this.send(data);
    }
    return await this.send("");
  }

  /**
   * Stream response
   */
  async stream(readable: ReadableStream): Promise<void> {
    if (this._sent) {
      throw new Error("Response already sent");
    }

    await this._executeDeferredFunctions();

    this._sent = true;
    this._headersSent = true;

    this._resolve(
      new globalThis.Response(readable, {
        status: this._status,
        headers: this._headers,
      })
    );
  }

  /**
   * Respond with native Response
   */
  respond(response: globalThis.Response): void {
    if (this._sent) {
      throw new Error("Response already sent");
    }

    this._sent = true;
    this._headersSent = true;
    this._resolve(response);
  }

  // ============================================================================
  // File Methods
  // ============================================================================

  /**
   * Set Content-Disposition for attachment
   */
  attachment(filename?: string): this {
    if (filename) {
      const mimeType = lookup(filename) || "application/octet-stream";
      this.type(mimeType);
      this.set(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
    } else {
      this.set("Content-Disposition", "attachment");
    }

    return this;
  }

  /**
   * Send file as download
   */
  async download(filePath: string, filename?: string): Promise<void> {
    const name = filename || filePath.split("/").pop() || "download";
    this.attachment(name);
    await this.sendFile(filePath);
  }

  /**
   * Send file
   */
  async sendFile(filePath: string): Promise<void> {
    try {
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        throw new Error("File not found");
      }

      // Set headers
      if (!this._headers.has("Content-Type")) {
        this.set("Content-Type", file.type || "application/octet-stream");
      }

      this.set("Content-Length", String(file.size));

      // Send file
      const content = await file.arrayBuffer();
      await this.send(new Uint8Array(content) as any);
    } catch (error) {
      throw new Error(`Failed to send file: ${error}`);
    }
  }

  /**
   * Render view template
   */
  async render(view: string, options: any = {}): Promise<void> {
    try {
      const html = await this._app.render(view, options);
      this.type("html");
      await this.send(html);
    } catch (error) {
      throw new Error(`Failed to render view: ${error}`);
    }
  }

  // ============================================================================
  // Deferred Functions
  // ============================================================================

  /**
   * Defer function execution until response
   */
  defer(fn: () => void | Promise<void>): this {
    this._deferredFunctions.push(fn);
    return this;
  }

  /**
   * Execute all deferred functions
   */
  private async _executeDeferredFunctions(): Promise<void> {
    for (const fn of this._deferredFunctions) {
      try {
        await fn();
      } catch (error) {
        console.error("Error in deferred function:", error);
      }
    }

    this._deferredFunctions = [];
  }

  // ============================================================================
  // State Properties
  // ============================================================================

  get sent(): boolean {
    return this._sent;
  }

  get headersSent(): boolean {
    return this._headersSent;
  }

  get finished(): boolean {
    return this._sent;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set default headers
   */
  private _setDefaultHeaders(): void {
    if (this._app?.get("x-powered-by")) {
      this._headers.set("X-Powered-By", "ArcanaJS");
    }
  }
}
