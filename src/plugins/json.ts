import type { Application } from "../core/application";
import type { Middleware, NextFunction, Request, Response } from "../types";

export interface JsonOptions {
  limit?: string | number;
  methods?: "all" | string[];
  type?: string | RegExp | ((contentType: string) => boolean);
  strict?: boolean;
  verify?: (rawBody: string, req: Request) => void;
  onError?: (err: Error, req: Request, res: Response) => void;
}

const DEFAULTS: Required<Omit<JsonOptions, "verify" | "onError">> = {
  limit: "1mb",
  methods: "all",
  type: /^application\/json/i,
  strict: true,
};

export const json = (options: JsonOptions = {}): Middleware => {
  const opts = { ...DEFAULTS, ...options };
  const maxBytes = byteLimit(opts.limit);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Bun limitation: GET / HEAD never have readable bodies
      if (req.method === "GET" || req.method === "HEAD") {
        return next();
      }

      // Already parsed safeguard
      if ((req as any)._jsonParsed) {
        return next();
      }

      // Method filter
      if (
        opts.methods !== "all" &&
        !opts.methods.includes(req.method.toUpperCase())
      ) {
        return next();
      }

      const contentType = req.headers.get("content-type");
      if (!contentType || !matchesType(contentType, opts.type)) {
        return next();
      }

      const rawBody = await req.text();

      if (Buffer.byteLength(rawBody) > maxBytes) {
        throw new Error("PAYLOAD_TOO_LARGE");
      }

      if (rawBody.length === 0) {
        req.body = null;
        (req as any)._jsonParsed = true;
        return next();
      }

      if (opts.verify) {
        opts.verify(rawBody, req);
      }

      const parsed = JSON.parse(rawBody);

      if (opts.strict && (typeof parsed !== "object" || parsed === null)) {
        throw new Error("INVALID_JSON");
      }

      req.body = parsed;
      (req as any)._jsonParsed = true;

      return next();
    } catch (err: any) {
      if (opts.onError) {
        return opts.onError(err, req, res);
      }

      switch (err.message) {
        case "PAYLOAD_TOO_LARGE":
          res.status(413).send("Payload Too Large");
          break;
        default:
          res.status(400).send("Invalid JSON");
      }
    }
  };
};

function matchesType(
  contentType: string,
  type: JsonOptions["type"]
): boolean {
  if (!type) return false;

  if (typeof type === "string") {
    return contentType.startsWith(type);
  }

  if (type instanceof RegExp) {
    return type.test(contentType);
  }

  return type(contentType);
}

function byteLimit(limit: string | number): number {
  if (typeof limit === "number") return limit;

  const match = /^(\d+)(kb|mb)?$/i.exec(limit);
  if (!match) return Number(limit);

  const size = Number(match[1]);
  const unit = match[2]?.toLowerCase();

  switch (unit) {
    case "kb":
      return size * 1024;
    case "mb":
      return size * 1024 * 1024;
    default:
      return size;
  }
}

export const jsonPlugin = (options?: JsonOptions) => ({
  name: "json",
  version: "1.0.0",
  
  install(app: Application) {
    app.use(json(options));
  },
});
