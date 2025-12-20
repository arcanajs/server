import type { Application } from "../core/application";
import { serveStatic } from "../modules/serve-static";

export interface ServeStaticOptions {
  acceptRanges?: boolean;
  cacheControl?: boolean;
  dotfiles?: 'allow' | 'deny' | 'ignore';
  etag?: boolean;
  extensions?: string[] | false;
  fallthrough?: boolean;
  immutable?: boolean;
  index?: string[] | string | false;
  lastModified?: boolean;
  maxAge?: number | string;
  redirect?: boolean;
  setHeaders?: (res: any, path: string, stat: any) => void;
}

export const staticPlugin = (root: string, options?: ServeStaticOptions) => ({
  name: "static",
  install(app: Application) {
    app.use(serveStatic(root, options));
  },
});
