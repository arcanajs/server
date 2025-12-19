import type { Request, Response } from "../types";

export class RequestImpl implements Request {
  public method: string;
  public url: string;
  public path: string;
  public baseUrl: string = "";
  public params: Record<string, string> = {};
  public query: Record<string, string | string[]> = {};
  public headers: Headers;
  public body: any = null;
  public app: any;
  private _nativeRequest: globalThis.Request;
  [key: string]: any;

  constructor(nativeRequest: globalThis.Request, app: any) {
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
}

export class ResponseImpl implements Response {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _body: any = null;
  private _sent: boolean = false;
  private _resolve: (res: globalThis.Response) => void;
  private _app: any;

  constructor(resolve: (res: globalThis.Response) => void, app: any) {
    this._resolve = resolve;
    this._app = app;
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

  async json(data: any): Promise<this> {
    this.set("Content-Type", "application/json");
    return await this.send(JSON.stringify(data));
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

  cookie(name: string, value: string, options: any = {}): this {
    // Basic cookie implementation
    let str = `${name}=${value}`;
    if (options.path) str += `; Path=${options.path}`;
    if (options.expires) str += `; Expires=${options.expires.toUTCString()}`;
    if (options.httpOnly) str += `; HttpOnly`;
    this._headers.append("Set-Cookie", str);
    return this;
  }

  async redirect(url: string, status: number = 302): Promise<this> {
    this._status = status;
    this.set("Location", url);
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

  [key: string]: any;
}
