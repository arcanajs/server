import type { Application } from "../core/application";

import { lookup } from "mime-types";
import { stat } from "fs-extra";
import { join, resolve } from "node:path";
import type { Middleware, NextFunction, Request, Response } from "../types";
import etag from "etag";

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
  setHeaders?: (res: Response, path: string, stat: any) => void;
}

export const serveStatic = (
  root: string,
  options?: ServeStaticOptions
): Middleware => {
  const {
    acceptRanges = true,
    cacheControl = true,
    dotfiles = 'ignore',
    etag: etagEnabled = true,
    extensions = false,
    fallthrough = true,
    immutable = false,
    index = ['index.html'],
    lastModified = true,
    maxAge = 0,
    redirect = true,
    setHeaders
  } = options || {};

  const rootPath = resolve(root);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (fallthrough) {
        return next();
      }
      await res.status(405).send("Method Not Allowed");
      return;
    }

    let path = req.path;
    if (path.includes('%')) {
      try {
        path = decodeURIComponent(path);
      } catch (e) {
        await res.status(400).send('Failed to decode URI');
        return;
      }
    }

    let filePath = resolve(join(rootPath, path));

    if (dotfiles !== 'allow' && path.split('/').some(part => part.startsWith('.'))) {
      if (dotfiles === 'deny') {
        await res.status(403).send('Forbidden');
        return;
      }
      if (fallthrough) {
        return next();
      }
      await res.status(404).send('Not Found');
      return;
    }

    const sendFile = async (filePath: string): Promise<boolean> => {
      try {
        const stats = await stat(filePath);

        if (stats.isDirectory()) {
          if (redirect && !req.path.endsWith('/')) {
            await res.redirect(req.path + '/');
            return true;
          }
          if (index) {
            const indexFiles = Array.isArray(index) ? index : [index];
            for (const file of indexFiles) {
              const indexPath = join(filePath, file);
              try {
                const indexStats = await stat(indexPath);
                if (indexStats.isFile()) {
                  if (await sendFile(indexPath)) {
                    return true;
                  }
                }
              } catch (e) { }
            }
          }
          return false;
        }

        if (!stats.isFile()) {
          return false;
        }

        if (setHeaders) {
          setHeaders(res, filePath, stats);
        }

        if (cacheControl) {
          let cacheControlHeader = `public, max-age=${maxAge}`;
          if (immutable) {
            cacheControlHeader += ', immutable';
          }
          res.set('Cache-Control', cacheControlHeader);
        }

        if (lastModified) {
          res.set('Last-Modified', stats.mtime.toUTCString());
        }

        if (etagEnabled) {
          res.set('ETag', etag(stats));
        }

        if (acceptRanges) {
          res.set('Accept-Ranges', 'bytes');
        }

        const contentType = lookup(filePath) || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Content-Length', stats.size.toString());

        if (req.method === 'HEAD') {
          await res.end();
          return true;
        }

        const file = Bun.file(filePath);
        res.respond(new globalThis.Response(file));
        return true;
      } catch (error) {
        return false;
      }
    };

    try {
      if (await sendFile(filePath)) {
        return;
      }
      if (extensions) {
        for (const ext of extensions) {
          const newPath = `${filePath}.${ext}`;
          if (await sendFile(newPath)) {
            return;
          }
        }
      }
      if (fallthrough) {
        return next();
      }
      await res.status(404).send('Not Found');
    } catch (e) {
      next(e);
    }
  };
};


export const staticPlugin = (root: string, options?: ServeStaticOptions) => ({
  name: "static",
  version: "1.0.0",
  
  install(app: Application) {
    app.use(serveStatic(root, options));
  },
});
