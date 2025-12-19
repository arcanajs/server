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
  json(): Promise<any>;
  [key: string]: any;
}

export interface Response {
  status(code: number): this;
  json(data: any): Promise<this>;
  send(data: string | Buffer | Uint8Array): Promise<this>;
  set(name: string, value: string): this;
  get(name: string): string | null;
  header(name: string, value: string): this;
  cookie(name: string, value: string, options?: CookieOptions): this;
  clearCookie(name: string, options?: CookieOptions): this;
  redirect(url: string, status?: number): Promise<this>;

  render(
    view: string,
    options?: any,
    callback?: (err: Error | null, html?: string) => void
  ): Promise<void>;
  respond(response: globalThis.Response): void;
  statusCode: number;
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

export interface CookieOptions {
  maxAge?: number;
  signed?: boolean;
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
  encode?: (val: string) => string;
}
