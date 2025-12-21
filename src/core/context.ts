import cookie from "cookie";
import signature from "cookie-signature";
import type { Request, Response } from "../types/index";

import accepts from "accepts";
import { createReadStream, stat } from "fs-extra";
import { lookup } from "mime-types";
import { basename, resolve } from "node:path";
import type { SendFileOptions } from "../types/index";
import { Application } from "./application";

export class RequestImpl implements Request {
  public ip: string;
  public protocol: "http" | "https";
  public secure: boolean;
  public xhr: boolean;
  public hostname: string;
  public subdomains: string[] = [];
  public fresh: boolean;
  public stale: boolean;
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
  public _nativeRequest: globalThis.Request;
  [key: string]: any;

  constructor(nativeRequest: globalThis.Request, app: Application) {
    const url = new URL(nativeRequest.url);
    this._nativeRequest = nativeRequest;
    this.method = nativeRequest.method;
    this.url = nativeRequest.url;
    this.path = url.pathname;
    this.headers = nativeRequest.headers;
    this.app = app;

    // Parse query
    url.searchParams.forEach((value, key) => {
      this.query[key] = value;
    });

    this.ip = this.headers.get("x-forwarded-for") || "";
    this.protocol = url.protocol.slice(0, -1) as "http" | "https";
    this.secure = this.protocol === "https";
    this.xhr = this.headers.get("x-requested-with") === "XMLHttpRequest";
    this.hostname = url.hostname;

    // Calculate subdomains
    const hostParts = this.hostname.split(".");
    if (hostParts.length > 2) {
      this.subdomains = hostParts.slice(0, hostParts.length - 2);
    }

    this.fresh = false;
    this.stale = true;
  }

  get(name: string): string | undefined {
    return this.headers.get(name) || undefined;
  }

  accepts(...types: string[]): string | false {
    const accept = accepts(this as any);
    const result = accept.types(types);
    return Array.isArray(result) ? result[0] || false : result;
  }

  acceptsEncodings(...encodings: string[]): string | false {
    const accept = accepts(this as any);
    const result = accept.encodings(encodings);
    return Array.isArray(result) ? result[0] || false : result;
  }

  acceptsLanguages(...languages: string[]): string | false {
    const accept = accepts(this as any);
    const result = accept.languages(languages);
    return Array.isArray(result) ? result[0] || false : result;
  }

  is(...types: string[]): string | false {
    const contentType = this.headers.get("content-type") || "";
    if (!contentType) return false;
    if (!types.length) return contentType;

    for (const type of types) {
      if (contentType.includes(type)) {
        return type;
      }
    }

    return false;
  }

  async json() {
    if (this.body) return this.body;
    try {
      this.body = await this._nativeRequest.json();
      return this.body;
    } catch (e) {
      return null;
    }
  }

  async text(): Promise<string> {
    return await this._nativeRequest.text();
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return await this._nativeRequest.arrayBuffer();
  }

  async blob(): Promise<Blob> {
    return await this._nativeRequest.blob();
  }

  async formData(): Promise<FormData> {
    return (await this._nativeRequest.formData()) as unknown as FormData;
  }
}

export class ResponseImpl implements Response {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _body: any = null;
  private _sent: boolean = false;
  private _deferred: (() => void | Promise<void>)[] = [];
  private _resolve: (res: globalThis.Response) => void;
  private _app: Application;
  public req: Request;

  constructor(
    resolve: (res: globalThis.Response) => void,
    app: Application,
    req: Request
  ) {
    this._resolve = resolve;
    this._app = app;
    this.req = req;
  }

  status(code: number): this {
    this._status = code;
    return this;
  }

  set(name: string, value: string): this {
    this._headers.set(name, value);
    return this;
  }

  header(name: string, value: string): this {
    return this.set(name, value);
  }

  get(name: string): string | null {
    return this._headers.get(name);
  }

  append(name: string, value: string): this {
    this._headers.append(name, value);
    return this;
  }

  removeHeader(name: string): this {
    this._headers.delete(name);
    return this;
  }

  type(contentType: string): this {
    this.set("Content-Type", contentType);
    return this;
  }

  defer(fn: () => void | Promise<void>): this {
    this._deferred.push(fn);
    return this;
  }

  async json(data: any): Promise<this> {
    this.set("Content-Type", "application/json");
    return await this.send(JSON.stringify(data));
  }

  async html(data: string): Promise<this> {
    this.set("Content-Type", "text/html");
    return await this.send(data);
  }

  async render(
    view: string,
    options: any = {},
    callback?: (err: Error | null, html?: string) => void
  ): Promise<void> {
    const app = (this as any)._app || (this.req as any).app;
    try {
      const html = await app.render(view, options, callback);
      this.send(html);
    } catch (err: any) {
      if (callback) callback(err);
      throw err;
    }
  }

  async send(data: string | Buffer | Uint8Array): Promise<this> {
    if (this._sent) return this;

    // Run deferred functions
    for (const fn of this._deferred) {
      await fn();
    }

    // Trigger beforeResponse hooks
    if (this._app) {
      await this._app.runBeforeResponseHooks(this.req, this);
    }

    this._body = data;
    this._sent = true;

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

  cookie(name: string, value: any, options: any = {}): this {
    let val =
      typeof value === "object" ? "j:" + JSON.stringify(value) : String(value);

    if (options.signed) {
      const secret = this.req.secret || this.req.app?.get("cookie secret");
      if (!secret) {
        throw new Error('cookieParser("secret") required for signed cookies');
      }
      val =
        "s:" + signature.sign(val, Array.isArray(secret) ? secret[0] : secret);
    }

    if (options.maxAge) {
      options.expires = new Date(Date.now() + options.maxAge);
    }

    const cookieStr = cookie.serialize(name, val, options);
    this._headers.append("Set-Cookie", cookieStr);
    return this;
  }

  clearCookie(name: string, options: any = {}): this {
    const opts = { ...options, expires: new Date(1), maxAge: 0 };
    return this.cookie(name, "", opts);
  }

  async redirect(url: string, status: number = 302): Promise<this> {
    this._status = status;
    this.set("Location", url);
    return await this.send("");
  }

  attachment(filename?: string): this {
    if (filename) {
      this.type(lookup(filename) || "application/octet-stream");
    }
    this.set(
      "Content-Disposition",
      `attachment${filename ? `; filename="${basename(filename)}"` : ""}`
    );
    return this;
  }

  async download(
    filePath: string,
    filename?: string,
    options?: SendFileOptions
  ): Promise<void> {
    const effectiveFilename = filename || basename(filePath);
    this.attachment(effectiveFilename);
    return await this.sendFile(filePath, options);
  }

  async sendFile(filePath: string, options?: SendFileOptions): Promise<void> {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new Error("Path is not a file");
    }

    const resolvedPath = resolve(filePath);
    const root = options?.root ? resolve(options.root) : process.cwd();

    if (!resolvedPath.startsWith(root)) {
      throw new Error("File is outside of root directory");
    }

    this.set("Content-Length", fileStats.size.toString());
    if (options?.lastModified) {
      this.set("Last-Modified", fileStats.mtime.toUTCString());
    }
    if (options?.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        this.set(key, value);
      }
    }

    const stream = createReadStream(resolvedPath);
    await this.stream(stream as any);
  }

  vary(field: string): this {
    this.append("Vary", field);
    return this;
  }

  location(url: string): this {
    this.set("Location", url);
    return this;
  }

  links(links: Record<string, string>): this {
    const linkHeader = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(", ");
    this.set("Link", linkHeader);
    return this;
  }

  async sendStatus(code: number): Promise<this> {
    this.status(code);
    return await this.send(new TextEncoder().encode(String(code)));
  }

  async stream(readable: ReadableStream): Promise<void> {
    this._resolve(
      new globalThis.Response(readable, {
        status: this._status,
        headers: this._headers,
      })
    );
  }

  async end(data?: string | Buffer | Uint8Array): Promise<this> {
    if (data) {
      return await this.send(data);
    }
    return await this.send("");
  }

  respond(response: globalThis.Response): void {
    if (this._sent) return;
    this._sent = true;
    this._resolve(response);
  }

  get statusCode(): number {
    return this._status;
  }

  get sent(): boolean {
    return this._sent;
  }

  get headersSent(): boolean {
    return this._sent;
  }

  get finished(): boolean {
    return this._sent;
  }

  [key: string]: any;
}
