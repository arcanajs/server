/**
 * ArcanaJS Enhanced Response
 *
 */

import cookie from "cookie";
import signature from "cookie-signature";
import type {
  Response as ResponseInterface,
  SendFileOptions,
  Request,
} from "../../types";
import { CookieOptions } from "../../plugins/cookie";


export type { SendFileOptions };

/**
 * ResponseImpl - Enhanced response implementation
 */
export class ResponseImpl implements ResponseInterface {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _body: any = null;
  private _sent: boolean = false;
  private _resolve: (res: globalThis.Response) => void;
  private _app: any;
  private _deferred: (() => void | Promise<void>)[] = [];

  // Reference to request (set by Application)
  public req!: Request;

  // Track if headers have been sent
  private _headersSent: boolean = false;

  [key: string]: any;

  constructor(resolve: (res: globalThis.Response) => void, app: any) {
    this._resolve = resolve;
    this._app = app;

    // Set default headers
    if (app?.get?.("x-powered-by")) {
      this._headers.set("X-Powered-By", "ArcanaJS");
    }
  }

  /**
   * Set the status code
   */
  status(code: number): this {
    this._status = code;
    return this;
  }

  /**
   * Get or set a header
   */
  set(name: string, value: string): this {
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
   * Get a header value
   */
  get(name: string): string | null {
    return this._headers.get(name);
  }

  /**
   * Append a header (allows multiple values)
   */
  append(name: string, value: string): this {
    this._headers.append(name, value);
    return this;
  }

  /**
   * Remove a header
   */
  removeHeader(name: string): this {
    this._headers.delete(name);
    return this;
  }

  /**
   * Set the Content-Type header
   */
  type(contentType: string): this {
    // Handle shorthand types
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
   * Send a JSON response
   */
  async json(data: any): Promise<this> {
    this.set("Content-Type", "application/json; charset=utf-8");
    return await this.send(JSON.stringify(data));
  }

  /**
   * Send a response body
   */
  async send(data: string | Buffer | Uint8Array): Promise<this> {
    if (this._sent) return this;

    // Trigger beforeResponse hooks
    if (this._app) {
      await this._app.runBeforeResponseHooks(this.req, this);
    }

    // Set Content-Length if not already set
    if (!this._headers.has("Content-Length")) {
      const length =
        typeof data === "string"
          ? new TextEncoder().encode(data).length
          : data.length;
      this._headers.set("Content-Length", String(length));
    }

    this._body = data;
    this._sent = true;
    this._headersSent = true;

    this._resolve(
      new globalThis.Response(this._body, {
        status: this._status,
        headers: this._headers,
      })
    );

    // Trigger afterResponse hooks
    if (this._app) {
      await this._app.runAfterResponseHooks(this.req, this);
    }

    return this;
  }

  /**
   * Send an HTML response
   */
  async html(data: string): Promise<this> {
    this.type("html");
    return await this.send(data);
  }

  /**
   * Render a view template
   */
  async render(
    view: string,
    options: any = {},
    callback?: (err: Error | null, html?: string) => void
  ): Promise<void> {
    const app = this._app || this.req?.app;
    try {
      const html = await app.render(view, options, callback);
      this.type("html");
      await this.send(html);
    } catch (err: any) {
      if (callback) callback(err);
      throw err;
    }
  }

  /**
   * Set a cookie
   */
  cookie(name: string, value: any, options: CookieOptions = {}): this {
    let val =
      typeof value === "object" ? "j:" + JSON.stringify(value) : String(value);

    if (options.signed) {
      const secret = this.req?.secret || this.req?.app?.get("cookie secret");
      if (!secret) {
        throw new Error('cookieParser("secret") required for signed cookies');
      }
      val =
        "s:" + signature.sign(val, Array.isArray(secret) ? secret[0] : secret);
    }

    const opts: any = { ...options };

    if (opts.maxAge) {
      opts.expires = new Date(Date.now() + opts.maxAge);
    }

    const cookieStr = cookie.serialize(name, val, opts);
    this._headers.append("Set-Cookie", cookieStr);
    return this;
  }

  /**
   * Clear a cookie
   */
  clearCookie(name: string, options: CookieOptions = {}): this {
    const opts = { ...options, expires: new Date(1), maxAge: 0 };
    return this.cookie(name, "", opts);
  }

  /**
   * Redirect to a URL
   */
  async redirect(url: string, status: number = 302): Promise<this> {
    this._status = status;
    this.set("Location", url);

    // Set body for clients that don't follow redirects
    const body = `Redirecting to ${url}`;
    return await this.send(body);
  }

  /**
   * Set the Content-Disposition header for downloads
   */
  attachment(filename?: string): this {
    if (filename) {
      const ext = filename.split(".").pop()?.toLowerCase();
      this.type(ext || "bin");
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
   * Send a file as a download
   */
  async download(
    filePath: string,
    filename?: string,
    options?: SendFileOptions
  ): Promise<void> {
    const name = filename || filePath.split("/").pop() || "download";
    this.attachment(name);
    await this.sendFile(filePath, options);
  }

  /**
   * Send a file
   */
  async sendFile(
    filePath: string,
    options: SendFileOptions = {}
  ): Promise<void> {
    try {
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        this._status = 404;
        await this.send("Not Found");
        return;
      }

      // Set Content-Type if not already set
      if (!this._headers.has("Content-Type")) {
        this.set("Content-Type", file.type || "application/octet-stream");
      }

      // Set Content-Length
      this.set("Content-Length", String(file.size));

      // Set Cache-Control
      if (options.cacheControl !== false && options.maxAge !== undefined) {
        const maxAge =
          typeof options.maxAge === "string"
            ? parseInt(options.maxAge, 10)
            : options.maxAge;
        this.set(
          "Cache-Control",
          `public, max-age=${Math.floor(maxAge / 1000)}`
        );
      }

      // Set Last-Modified
      if (options.lastModified !== false) {
        const stat = await file.stat();
        if (stat) {
          this.set("Last-Modified", new Date(stat.mtime).toUTCString());
        }
      }

      // Set custom headers
      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          this.set(key, String(value));
        }
      }

      const content = await file.arrayBuffer();
      await this.send(new Uint8Array(content) as any);
    } catch (err) {
      this._status = 500;
      await this.send("Internal Server Error");
    }
  }

  /**
   * Set the Vary header
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
   * Set the Location header
   */
  location(url: string): this {
    return this.set("Location", url);
  }

  /**
   * Set Link header with links
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

  /**
   * Send a status with standard message
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
      405: "Method Not Allowed",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
    };

    this._status = code;
    return await this.send(messages[code] || String(code));
  }

  /**
   * End the response
   */
  async end(data?: string | Buffer | Uint8Array): Promise<this> {
    if (data) {
      return await this.send(data);
    }
    return await this.send("");
  }

  /**
   * Directly resolve with a Response object
   */
  respond(response: globalThis.Response): void {
    if (this._sent) return;
    this._sent = true;
    this._headersSent = true;
    this._resolve(response);
  }

  /**
   * Stream a ReadableStream as the response
   */
  defer(fn: () => void | Promise<void>): this {
    this._deferred.push(fn);
    return this;
  }

  async stream(readable: ReadableStream): Promise<void> {
    if (this._sent) return;

    this._sent = true;
    this._headersSent = true;

    this._resolve(
      new globalThis.Response(readable, {
        status: this._status,
        headers: this._headers,
      })
    );
  }

  // Getters

  get statusCode(): number {
    return this._status;
  }

  get sent(): boolean {
    return this._sent;
  }

  get headersSent(): boolean {
    return this._headersSent;
  }

  get finished(): boolean {
    return this._sent;
  }
}
