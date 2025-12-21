import type { Application } from "../core/application";
import type { Middleware, NextFunction, Request, Response } from "../types";
import { stat } from "fs-extra";
import { lookup } from "mime-types";
import etag from "etag";

export interface FaviconOptions {
  path?: string;
  maxAge?: number | string;
  cacheControl?: string;
  etag?: boolean;
  lastModified?: boolean;
  setHeaders?: (res: Response, path: string, stats: any) => void;
  fallback?: '204' | '404' | 'custom';
  customResponse?: (req: Request, res: Response) => Promise<void>;
  formats?: string[];
  maxSize?: number;
  securityHeaders?: boolean;
}

export interface FaviconMetrics {
  requests: number;
  cacheHits: number;
  errors: number;
  avgResponseTime: number;
}

const DEFAULT_FAVICON_PATHS = [
  'favicon.ico',
  'public/favicon.ico',
  'static/favicon.ico',
  'assets/favicon.ico'
];

const VALID_MIME_TYPES = [
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/png',
  'image/svg+xml',
  'image/gif'
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

const metrics: FaviconMetrics = {
  requests: 0,
  cacheHits: 0,
  errors: 0,
  avgResponseTime: 0
};

export const favicon = (options?: FaviconOptions): Middleware => {
  const {
    path: faviconPath,
    maxAge = 86400000, // 1 day
    cacheControl,
    etag: enableEtag = true,
    lastModified = true,
    setHeaders,
    fallback = '204',
    customResponse,
    formats = ['.ico', '.png', '.svg', '.gif'],
    maxSize = MAX_FILE_SIZE,
    securityHeaders = true
  } = options || {};

  const resolvedPaths = faviconPath 
    ? [faviconPath]
    : DEFAULT_FAVICON_PATHS;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    metrics.requests++;

    try {
      // Only handle favicon requests
      if (req.path !== '/favicon.ico') {
        return next();
      }

      // Add security headers if enabled
      if (securityHeaders) {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'DENY');
        res.set('Referrer-Policy', 'no-referrer');
      }

      // Try to find and serve favicon file
      for (const path of resolvedPaths) {
        try {
          const stats = await stat(path);
          
          // Validate file size
          if (stats.size > maxSize) {
            continue;
          }

          // Validate file extension
          const ext = path.split('.').pop()?.toLowerCase();
          if (!ext || !formats.includes(`.${ext}`)) {
            continue;
          }

          // Validate MIME type
          const mimeType = lookup(path);
          if (!mimeType || !VALID_MIME_TYPES.includes(mimeType)) {
            continue;
          }

          // Set cache control
          if (cacheControl) {
            res.set('Cache-Control', cacheControl);
          } else {
            const cacheControlHeader = typeof maxAge === 'string' 
              ? `public, max-age=${maxAge}`
              : `public, max-age=${maxAge}`;
            res.set('Cache-Control', cacheControlHeader);
          }

          // Set ETag if enabled
          if (enableEtag) {
            res.set('ETag', etag(stats));
          }

          // Set Last-Modified if enabled
          if (lastModified) {
            res.set('Last-Modified', stats.mtime.toUTCString());
          }

          // Set custom headers if provided
          if (setHeaders) {
            setHeaders(res, path, stats);
          }

          // Set content headers
          res.set('Content-Type', mimeType);
          res.set('Content-Length', stats.size.toString());

          // Check for conditional requests
          const ifNoneMatch = req.get('If-None-Match');
          const ifModifiedSince = req.get('If-Modified-Since');

          if (ifNoneMatch && ifNoneMatch === res.get('ETag')) {
            await res.status(304).end();
            metrics.cacheHits++;
            return;
          }

          if (ifModifiedSince && ifModifiedSince === res.get('Last-Modified')) {
            await res.status(304).end();
            metrics.cacheHits++;
            return;
          }

          // Serve the file
          const file = Bun.file(path);
          res.respond(new globalThis.Response(file));
          
          // Update metrics
          const responseTime = Date.now() - startTime;
          metrics.avgResponseTime = (metrics.avgResponseTime * (metrics.requests - 1) + responseTime) / metrics.requests;
          
          return;
        } catch (error) {
          // File doesn't exist or can't be accessed, try next path
          continue;
        }
      }

      // No favicon found, handle fallback
      if (fallback === 'custom' && customResponse) {
        await customResponse(req, res);
      } else if (fallback === '404') {
        await res.status(404).send('Favicon not found');
      } else {
        // Default: 204 No Content
        await res.status(204).end();
      }

    } catch (error) {
      metrics.errors++;
      console.error('Favicon middleware error:', error);
      
      if (fallback === 'custom' && customResponse) {
        await customResponse(req, res);
      } else {
        await res.status(500).send('Internal server error');
      }
    }
  };
};

export const faviconPlugin = (options?: FaviconOptions) => ({
  name: "favicon",
  install(app: Application) {
    app.use(favicon(options));
  },
});

export const getFaviconMetrics = (): FaviconMetrics => ({ ...metrics });

export const resetFaviconMetrics = (): void => {
  metrics.requests = 0;
  metrics.cacheHits = 0;
  metrics.errors = 0;
  metrics.avgResponseTime = 0;
};
