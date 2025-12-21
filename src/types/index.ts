import { CookieOptions } from "../plugins/cookie";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "USE";

export type NextFunction = (err?: any) => void | Promise<void>;

export interface AcceptsResult {
  type: string;
  subtype: string;
  params: Record<string, string>;
  quality: number;
}

export interface Request {
  method: string;
  url: string;
  path: string;
  baseUrl: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Headers;
  body: any;
  app: any;
  cookies: Record<string, any>;
  signedCookies: Record<string, any>;
  secret?: string | string[];
  session?: import("../modules/session").Session;
  sessionID?: string;
  ip: string;
  protocol: "http" | "https";
  secure: boolean;
  xhr: boolean;
  hostname: string;
  subdomains: string[];
  fresh: boolean;
  stale: boolean;
  get(name: string): string | undefined;
  accepts(...types: string[]): string | false;
  acceptsEncodings(...encodings: string[]): string | false;
  acceptsLanguages(...languages: string[]): string | false;
  is(...types: string[]): string | false;
  json(): Promise<any>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  formData(): Promise<FormData>;
  [key: string]: any;
}

export interface SendFileOptions {
  root?: string;
  maxAge?: number | string;
  cacheControl?: boolean;
  lastModified?: boolean;
  headers?: Record<string, string>;
  dotfiles?: "allow" | "deny" | "ignore";
}

export interface Response {
  req: Request;
  status(code: number): this;
  json(data: any): Promise<this>;
  send(data: string | Buffer | Uint8Array): Promise<this>;
  set(name: string, value: string): this;
  get(name: string): string | null;
  header(name: string, value: string): this;
  append(name: string, value: string): this;
  removeHeader(name: string): this;
  type(contentType: string): this;
  html(data: string): Promise<this>;
  cookie(name: string, value: any, options?: CookieOptions): this;
  clearCookie(name: string, options?: CookieOptions): this;
  redirect(url: string, status?: number): Promise<this>;
  attachment(filename?: string): this;
  download(
    filePath: string,
    filename?: string,
    options?: SendFileOptions
  ): Promise<void>;
  sendFile(filePath: string, options?: SendFileOptions): Promise<void>;
  vary(field: string): this;
  location(url: string): this;
  links(links: Record<string, string>): this;
  sendStatus(code: number): Promise<this>;
  end(data?: string | Buffer | Uint8Array): Promise<this>;
  render(
    view: string,
    options?: any,
    callback?: (err: Error | null, html?: string) => void
  ): Promise<void>;
  respond(response: globalThis.Response): void;
  stream(readable: ReadableStream): Promise<void>;
  defer(fn: () => void | Promise<void>): this;
  statusCode: number;
  sent: boolean;
  headersSent: boolean;
  finished: boolean;
  [key: string]: any;
}

export interface Context {
  req: Request;
  res: Response;
  next: NextFunction;
}

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;
export type ErrorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export interface Plugin {
  name: string;
  install: (app: any) => void;
}

export type LifecycleHook =
  | "onStart"
  | "onStop"
  | "beforeRequest"
  | "afterRequest"
  | "beforeResponse"
  | "afterResponse"
  | "onError"
  | "onSuccess";


