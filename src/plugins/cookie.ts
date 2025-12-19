import cookie from "cookie";
import signature from "cookie-signature";
import type { Application } from "../core/application";
import type { Middleware, NextFunction, Request, Response } from "../types";

/**
 * Parse JSON cookie string.
 */
export function JSONCookie(str: string): any | undefined {
  if (typeof str !== "string" || str.substring(0, 2) !== "j:") {
    return undefined;
  }

  try {
    return JSON.parse(str.slice(2));
  } catch (err) {
    return undefined;
  }
}

/**
 * Parse JSON cookies.
 */
export function JSONCookies(obj: Record<string, any>): Record<string, any> {
  const cookies = Object.keys(obj);
  let key;
  let val;

  for (let i = 0; i < cookies.length; i++) {
    key = cookies[i];
    val = JSONCookie(obj[key]);

    if (val) {
      obj[key] = val;
    }
  }

  return obj;
}

/**
 * Parse a signed cookie string, return the decoded value.
 */
export function signedCookie(
  str: string,
  secret: string | string[]
): string | undefined | boolean {
  if (typeof str !== "string") {
    return undefined;
  }

  if (str.substring(0, 2) !== "s:") {
    return str;
  }

  const secrets = Array.isArray(secret) ? secret : [secret];

  for (let i = 0; i < secrets.length; i++) {
    const val = signature.unsign(str.slice(2), secrets[i]);

    if (val !== false) {
      return val;
    }
  }

  return false;
}

/**
 * Parse signed cookies.
 */
export function signedCookies(
  obj: Record<string, any>,
  secret: string | string[]
): Record<string, any> {
  const cookies = Object.keys(obj);
  let dec;
  let key;
  const ret: Record<string, any> = Object.create(null);
  let val;

  for (let i = 0; i < cookies.length; i++) {
    key = cookies[i];
    val = obj[key];
    dec = signedCookie(val, secret);

    if (val !== dec) {
      ret[key] = dec as any;
      delete obj[key];
    }
  }

  return ret;
}

export const cookieParser = (secret?: string | string[]): Middleware => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.cookies) {
      return await next();
    }

    const secrets = !secret || Array.isArray(secret) ? secret || [] : [secret];

    req.secret = secrets[0];
    req.cookies = Object.create(null);
    req.signedCookies = Object.create(null);

    const cookieHeader = req.headers.get("cookie");
    if (!cookieHeader) {
      return await next();
    }

    req.cookies = cookie.parse(cookieHeader);

    // parse signed cookies
    if (secrets.length !== 0) {
      req.signedCookies = signedCookies(req.cookies, secrets);
      req.signedCookies = JSONCookies(req.signedCookies);
    }

    // parse JSON cookies
    req.cookies = JSONCookies(req.cookies);

    await next();
  };
};

export const cookiePlugin = (secret?: string | string[]) => ({
  name: "cookie",
  install(app: Application) {
    app.use(cookieParser(secret));
  },
});
