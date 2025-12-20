import type { Application } from "../core/application";
import type { Middleware, NextFunction, Request, Response } from "../types";

export const json = (options?: { limit?: string | number }): Middleware => {
  const limit = options?.limit || "1mb";

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await req.text();
        if (Buffer.byteLength(body) > byteLimit(limit)) {
          res.status(413).send("Payload Too Large");
          return;
        }
        req.body = JSON.parse(body);
      } catch (e) {
        res.status(400).send("Invalid JSON");
        return;
      }
    }
    await next();
  };
};

function byteLimit(limit: string | number): number {
  if (typeof limit === "number") return limit;
  const size = parseInt(limit.slice(0, -2));
  const unit = limit.slice(-2).toLowerCase();
  switch (unit) {
    case "kb":
      return size * 1024;
    case "mb":
      return size * 1024 * 1024;
    default:
      return parseInt(limit);
  }
}

export const jsonPlugin = (options?: { limit?: string | number }) => ({
  name: "json",
  install(app: Application) {
    app.use(json(options));
  },
});
