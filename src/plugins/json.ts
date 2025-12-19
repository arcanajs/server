import type { Application } from "../core/application";
import type { Middleware } from "../types";

export const json = (): Middleware => {
  return async (req, res, next) => {
    if (req.headers.get("content-type")?.includes("application/json")) {
      req.body = await req.json();
    }
    await next();
  };
};

export const jsonPlugin = {
  name: "json",
  install(app: Application) {
    app.use(json());
  },
};
