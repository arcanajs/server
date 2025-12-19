/**
 * ArcanaJS Body Size Limit Middleware
 *
 * Protects against large payload attacks by limiting request body size.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Body limit options
 */
export interface BodyLimitOptions {
  /** Maximum body size */
  limit?: string | number;
  /** Content types to check (default: all) */
  contentTypes?: string[];
  /** Custom error handler */
  onError?: (
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;
}

/**
 * Parse size string to bytes
 */
function parseSize(size: string | number): number {
  if (typeof size === "number") {
    return size;
  }

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const [, num, unit] = match;
  const value = parseFloat(num);

  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
  };

  const multiplier = units[(unit || "b").toLowerCase()] || 1;
  return Math.floor(value * multiplier);
}

/**
 * Format bytes to human-readable size
 */
function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Default error handler
 */
async function defaultOnError(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(413);
  await res.json({
    error: "Payload Too Large",
    message: "Request body exceeds the size limit",
  });
}

/**
 * Create body limit middleware
 */
export function bodyLimit(
  limit: string | number = "100kb",
  options: Omit<BodyLimitOptions, "limit"> = {}
): Middleware {
  const maxBytes = parseSize(limit);
  const contentTypes = options.contentTypes;
  const onError = options.onError || defaultOnError;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check Content-Length header
    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const length = parseInt(contentLength, 10);

      if (!isNaN(length) && length > maxBytes) {
        // Body is too large based on header
        await onError(req, res, next);
        return;
      }
    }

    // Check content type filter
    if (contentTypes && contentTypes.length > 0) {
      const contentType = req.headers.get("content-type") || "";
      const shouldCheck = contentTypes.some((type) =>
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!shouldCheck) {
        return next();
      }
    }

    // For requests without Content-Length, we need to buffer and check
    // This is handled by the JSON parsing middleware or body parsers
    // Here we just set a marker for other middlewares to check
    (req as any)._bodyLimit = maxBytes;
    (req as any)._bodySizeError = onError;

    await next();
  };
}

/**
 * Create a JSON body parser with size limit
 */
export function jsonWithLimit(limit: string | number = "100kb"): Middleware {
  const maxBytes = parseSize(limit);

  return async (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return next();
    }

    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const length = parseInt(contentLength, 10);

      if (!isNaN(length) && length > maxBytes) {
        res.status(413);
        await res.json({
          error: "Payload Too Large",
          message: `Request body exceeds the ${formatSize(maxBytes)} limit`,
        });
        return;
      }
    }

    try {
      // Read body and check size
      const text = await req.text();
      const size = new TextEncoder().encode(text).length;

      if (size > maxBytes) {
        res.status(413);
        await res.json({
          error: "Payload Too Large",
          message: `Request body (${formatSize(size)}) exceeds the ${formatSize(
            maxBytes
          )} limit`,
        });
        return;
      }

      // Parse JSON
      try {
        req.body = JSON.parse(text);
      } catch {
        res.status(400);
        await res.json({
          error: "Bad Request",
          message: "Invalid JSON in request body",
        });
        return;
      }
    } catch {
      // Error reading body
      return next();
    }

    await next();
  };
}

/**
 * Create a text body parser with size limit
 */
export function textWithLimit(limit: string | number = "100kb"): Middleware {
  const maxBytes = parseSize(limit);

  return async (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers.get("content-type") || "";

    if (!contentType.includes("text/")) {
      return next();
    }

    const contentLength = req.headers.get("content-length");

    if (contentLength) {
      const length = parseInt(contentLength, 10);

      if (!isNaN(length) && length > maxBytes) {
        res.status(413);
        await res.send("Payload Too Large");
        return;
      }
    }

    try {
      const text = await req.text();
      const size = new TextEncoder().encode(text).length;

      if (size > maxBytes) {
        res.status(413);
        await res.send("Payload Too Large");
        return;
      }

      req.body = text;
    } catch {
      return next();
    }

    await next();
  };
}
