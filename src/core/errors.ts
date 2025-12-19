/**
 * ArcanaJS HTTP Errors
 *
 * Provides structured error classes for HTTP error handling.
 * These errors include status codes and can be caught by error middleware.
 */

/**
 * Base HTTP Error class
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    message: string,
    code?: string,
    expose = true
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, any> {
    return {
      error: this.name,
      message: this.expose ? this.message : "An error occurred",
      statusCode: this.statusCode,
      ...(this.code && { code: this.code }),
    };
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends HttpError {
  constructor(message = "Bad Request", code?: string) {
    super(400, message, code);
    this.name = "BadRequestError";
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", code?: string) {
    super(401, message, code);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", code?: string) {
    super(403, message, code);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends HttpError {
  constructor(message = "Not Found", code?: string) {
    super(404, message, code);
    this.name = "NotFoundError";
  }
}

/**
 * 405 Method Not Allowed
 */
export class MethodNotAllowedError extends HttpError {
  readonly allowedMethods: string[];

  constructor(allowedMethods: string[], message = "Method Not Allowed") {
    super(405, message);
    this.name = "MethodNotAllowedError";
    this.allowedMethods = allowedMethods;
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends HttpError {
  constructor(message = "Conflict", code?: string) {
    super(409, message, code);
    this.name = "ConflictError";
  }
}

/**
 * 413 Payload Too Large
 */
export class PayloadTooLargeError extends HttpError {
  constructor(message = "Payload Too Large", code?: string) {
    super(413, message, code);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * 422 Unprocessable Entity (Validation Error)
 */
export class ValidationError extends HttpError {
  readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>, message = "Validation Error") {
    super(422, message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.errors = errors;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

/**
 * 429 Too Many Requests
 */
export class TooManyRequestsError extends HttpError {
  readonly retryAfter?: number;

  constructor(message = "Too Many Requests", retryAfter?: number) {
    super(429, message, "RATE_LIMIT_EXCEEDED");
    this.name = "TooManyRequestsError";
    this.retryAfter = retryAfter;
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends HttpError {
  constructor(message = "Internal Server Error", code?: string) {
    super(500, message, code, false); // Don't expose internal errors
    this.name = "InternalServerError";
  }
}

/**
 * 501 Not Implemented
 */
export class NotImplementedError extends HttpError {
  constructor(message = "Not Implemented", code?: string) {
    super(501, message, code);
    this.name = "NotImplementedError";
  }
}

/**
 * 502 Bad Gateway
 */
export class BadGatewayError extends HttpError {
  constructor(message = "Bad Gateway", code?: string) {
    super(502, message, code, false);
    this.name = "BadGatewayError";
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends HttpError {
  readonly retryAfter?: number;

  constructor(message = "Service Unavailable", retryAfter?: number) {
    super(503, message);
    this.name = "ServiceUnavailableError";
    this.retryAfter = retryAfter;
  }
}

/**
 * 504 Gateway Timeout
 */
export class GatewayTimeoutError extends HttpError {
  constructor(message = "Gateway Timeout", code?: string) {
    super(504, message, code, false);
    this.name = "GatewayTimeoutError";
  }
}

/**
 * Check if an error is an HttpError
 */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Create an HttpError from a status code
 */
export function createHttpError(
  statusCode: number,
  message?: string
): HttpError {
  const defaultMessages: Record<number, string> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Payload Too Large",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    501: "Not Implemented",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
  };

  return new HttpError(
    statusCode,
    message || defaultMessages[statusCode] || "Unknown Error"
  );
}
