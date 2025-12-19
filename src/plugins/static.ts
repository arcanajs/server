import path from "node:path";
import type { Middleware } from "../types";

export const static_files = (root: string): Middleware => {
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }

    const filePath = path.join(root, req.path);
    const file = Bun.file(filePath);

    if (await file.exists()) {
      res.respond(new globalThis.Response(file));
    } else {
      await next();
    }
  };
};
