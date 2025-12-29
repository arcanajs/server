/**
 * ArcanaJS Request Validation Middleware
 *
 * Provides schema-based request validation for query, params, body,
 * and headers with clear error messages.
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * Validation Schema Types
 */
export type SchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "email"
  | "url"
  | "uuid"
  | "date"
  | "datetime"
  | "any";

/**
 * Field Schema Definition
 */
export interface FieldSchema {
  /** Type of the field */
  type: SchemaType;

  /** Whether field is required */
  required?: boolean;

  /** Default value if not provided */
  default?: any;

  /** Minimum value (numbers) or length (strings/arrays) */
  min?: number;

  /** Maximum value (numbers) or length (strings/arrays) */
  max?: number;

  /** Exact length */
  length?: number;

  /** Pattern to match (strings) */
  pattern?: RegExp | string;

  /** Enum values */
  enum?: (string | number | boolean)[];

  /** Custom validation function */
  validate?: (
    value: any,
    field: string
  ) => boolean | string | Promise<boolean | string>;

  /** Custom error message */
  message?: string;

  /** Nested schema for objects */
  properties?: Record<string, FieldSchema>;

  /** Schema for array items */
  items?: FieldSchema;

  /** Transform function (runs after validation) */
  transform?: (value: any) => any;

  /** Whether to trim string values */
  trim?: boolean;

  /** Whether to convert to lowercase */
  lowercase?: boolean;

  /** Whether to convert to uppercase */
  uppercase?: boolean;
}

/**
 * Validation Schema
 */
export interface ValidationSchema {
  /** Query string schema */
  query?: Record<string, FieldSchema>;

  /** URL params schema */
  params?: Record<string, FieldSchema>;

  /** Request body schema */
  body?: Record<string, FieldSchema>;

  /** Headers schema */
  headers?: Record<string, FieldSchema>;
}

/**
 * Validation Options
 */
export interface ValidatorOptions {
  /** Abort on first error. Default: false */
  abortEarly?: boolean;

  /** Strip unknown fields. Default: false */
  stripUnknown?: boolean;

  /** Allow unknown fields. Default: true */
  allowUnknown?: boolean;

  /** Custom error handler */
  onError?: (
    errors: RequestValidationError[],
    req: Request,
    res: Response,
    next: NextFunction
  ) => void | Promise<void>;

  /** Error status code. Default: 400 */
  statusCode?: number;
}

/**
 * Validation Error
 */
export interface RequestValidationError {
  /** Field path */
  field: string;

  /** Error message */
  message: string;

  /** Received value */
  value?: any;

  /** Location (query, params, body, headers) */
  location: "query" | "params" | "body" | "headers";
}

/**
 * Email regex pattern
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * URL regex pattern
 */
const URL_REGEX = /^https?:\/\/.+/;

/**
 * UUID regex pattern
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ISO date regex pattern
 */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ISO datetime regex pattern
 */
const DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

/**
 * Coerce a value to the expected type
 */
function coerceValue(value: any, type: SchemaType): any {
  if (value === undefined || value === null) return value;

  switch (type) {
    case "number":
      const num = Number(value);
      return isNaN(num) ? value : num;

    case "integer":
      const int = parseInt(value, 10);
      return isNaN(int) ? value : int;

    case "boolean":
      if (value === "true" || value === "1" || value === 1) return true;
      if (value === "false" || value === "0" || value === 0) return false;
      return Boolean(value);

    case "array":
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [value];
        } catch {
          return value.split(",").map((v) => v.trim());
        }
      }
      return [value];

    case "date":
    case "datetime":
      return value;

    default:
      return value;
  }
}

/**
 * Validate a single value against a schema
 */
async function validateValue(
  value: any,
  schema: FieldSchema,
  field: string,
  location: RequestValidationError["location"]
): Promise<RequestValidationError | null> {
  // Handle undefined/null
  if (value === undefined || value === null || value === "") {
    if (schema.required) {
      return {
        field,
        message: schema.message || `${field} is required`,
        value,
        location,
      };
    }
    return null;
  }

  // Coerce value
  value = coerceValue(value, schema.type);

  // String transformations
  if (typeof value === "string") {
    if (schema.trim) value = value.trim();
    if (schema.lowercase) value = value.toLowerCase();
    if (schema.uppercase) value = value.toUpperCase();
  }

  // Type validation
  let typeValid = true;
  switch (schema.type) {
    case "string":
      typeValid = typeof value === "string";
      break;

    case "number":
      typeValid = typeof value === "number" && !isNaN(value);
      break;

    case "integer":
      typeValid = Number.isInteger(value);
      break;

    case "boolean":
      typeValid = typeof value === "boolean";
      break;

    case "array":
      typeValid = Array.isArray(value);
      break;

    case "object":
      typeValid = typeof value === "object" && !Array.isArray(value);
      break;

    case "email":
      typeValid = typeof value === "string" && EMAIL_REGEX.test(value);
      break;

    case "url":
      typeValid = typeof value === "string" && URL_REGEX.test(value);
      break;

    case "uuid":
      typeValid = typeof value === "string" && UUID_REGEX.test(value);
      break;

    case "date":
      typeValid = typeof value === "string" && DATE_REGEX.test(value);
      break;

    case "datetime":
      typeValid = typeof value === "string" && DATETIME_REGEX.test(value);
      break;

    case "any":
      typeValid = true;
      break;
  }

  if (!typeValid) {
    return {
      field,
      message: schema.message || `${field} must be a valid ${schema.type}`,
      value,
      location,
    };
  }

  // Min/Max validation
  if (schema.min !== undefined) {
    if (
      (typeof value === "number" && value < schema.min) ||
      (typeof value === "string" && value.length < schema.min) ||
      (Array.isArray(value) && value.length < schema.min)
    ) {
      const unit =
        typeof value === "number"
          ? ""
          : typeof value === "string"
          ? " characters"
          : " items";
      return {
        field,
        message:
          schema.message || `${field} must be at least ${schema.min}${unit}`,
        value,
        location,
      };
    }
  }

  if (schema.max !== undefined) {
    if (
      (typeof value === "number" && value > schema.max) ||
      (typeof value === "string" && value.length > schema.max) ||
      (Array.isArray(value) && value.length > schema.max)
    ) {
      const unit =
        typeof value === "number"
          ? ""
          : typeof value === "string"
          ? " characters"
          : " items";
      return {
        field,
        message:
          schema.message || `${field} must be at most ${schema.max}${unit}`,
        value,
        location,
      };
    }
  }

  // Exact length validation
  if (schema.length !== undefined) {
    const len =
      typeof value === "string" || Array.isArray(value) ? value.length : null;
    if (len !== null && len !== schema.length) {
      return {
        field,
        message:
          schema.message ||
          `${field} must be exactly ${schema.length} ${
            typeof value === "string" ? "characters" : "items"
          }`,
        value,
        location,
      };
    }
  }

  // Pattern validation
  if (schema.pattern !== undefined && typeof value === "string") {
    const regex =
      schema.pattern instanceof RegExp
        ? schema.pattern
        : new RegExp(schema.pattern);
    if (!regex.test(value)) {
      return {
        field,
        message: schema.message || `${field} has an invalid format`,
        value,
        location,
      };
    }
  }

  // Enum validation
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      return {
        field,
        message:
          schema.message ||
          `${field} must be one of: ${schema.enum.join(", ")}`,
        value,
        location,
      };
    }
  }

  // Array items validation
  if (schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const itemError = await validateValue(
        value[i],
        schema.items,
        `${field}[${i}]`,
        location
      );
      if (itemError) return itemError;
    }
  }

  // Nested object validation
  if (schema.properties && typeof value === "object") {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propError = await validateValue(
        value[key],
        propSchema,
        `${field}.${key}`,
        location
      );
      if (propError) return propError;
    }
  }

  // Custom validation
  if (schema.validate) {
    const result = await schema.validate(value, field);
    if (result === false) {
      return {
        field,
        message: schema.message || `${field} failed validation`,
        value,
        location,
      };
    }
    if (typeof result === "string") {
      return {
        field,
        message: result,
        value,
        location,
      };
    }
  }

  return null;
}

/**
 * Validate an object against a schema
 */
async function validateObject(
  obj: Record<string, any> | undefined,
  schema: Record<string, FieldSchema>,
  location: RequestValidationError["location"],
  options: ValidatorOptions
): Promise<{ errors: RequestValidationError[]; data: Record<string, any> }> {
  const errors: RequestValidationError[] = [];
  const data: Record<string, any> = {};

  // Handle undefined object
  if (!obj) {
    obj = {};
  }

  // Validate known fields
  for (const [field, fieldSchema] of Object.entries(schema)) {
    let value = obj[field];

    // Apply default if not present
    if (
      (value === undefined || value === null || value === "") &&
      fieldSchema.default !== undefined
    ) {
      value =
        typeof fieldSchema.default === "function"
          ? fieldSchema.default()
          : fieldSchema.default;
    }

    const error = await validateValue(value, fieldSchema, field, location);

    if (error) {
      errors.push(error);
      if (options.abortEarly) {
        return { errors, data };
      }
    } else if (value !== undefined && value !== null) {
      // Apply transformations
      data[field] = fieldSchema.transform
        ? fieldSchema.transform(coerceValue(value, fieldSchema.type))
        : coerceValue(value, fieldSchema.type);
    } else if (fieldSchema.default !== undefined) {
      data[field] = fieldSchema.default;
    }
  }

  // Handle unknown fields
  if (!options.stripUnknown) {
    for (const [key, value] of Object.entries(obj)) {
      if (!(key in schema)) {
        if (options.allowUnknown !== false) {
          data[key] = value;
        }
      }
    }
  }

  return { errors, data };
}

/**
 * Default error handler
 */
async function defaultOnError(
  errors: RequestValidationError[],
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  res.status(400);
  await res.json({
    error: "Validation Error",
    message:
      errors.length === 1
        ? errors[0].message
        : `${errors.length} validation errors`,
    details: errors,
  });
}

/**
 * Create request validation middleware
 *
 * @example
 * ```typescript
 * import arcanajs, { validate } from '@arcanajs/server';
 *
 * const app = arcanajs();
 *
 * app.post('/users', validate({
 *   body: {
 *     email: { type: 'email', required: true },
 *     name: { type: 'string', min: 2, max: 100 },
 *     age: { type: 'integer', min: 0, max: 150 }
 *   },
 *   query: {
 *     format: { type: 'string', enum: ['json', 'xml'], default: 'json' }
 *   }
 * }), (req, res) => {
 *   // req.body and req.query are validated
 * });
 * ```
 */
export function validate(
  schema: ValidationSchema,
  options: ValidatorOptions = {}
): Middleware {
  const onError = options.onError || defaultOnError;
  const statusCode = options.statusCode || 400;

  return async (req: Request, res: Response, next: NextFunction) => {
    const allErrors: RequestValidationError[] = [];

    // Validate query
    if (schema.query) {
      const { errors, data } = await validateObject(
        req.query,
        schema.query,
        "query",
        options
      );
      if (errors.length > 0) {
        allErrors.push(...errors);
        if (options.abortEarly) {
          res.status(statusCode);
          return onError(allErrors, req, res, next);
        }
      }
      (req as any).query = data;
    }

    // Validate params
    if (schema.params) {
      const { errors, data } = await validateObject(
        req.params,
        schema.params,
        "params",
        options
      );
      if (errors.length > 0) {
        allErrors.push(...errors);
        if (options.abortEarly) {
          res.status(statusCode);
          return onError(allErrors, req, res, next);
        }
      }
      (req as any).params = data;
    }

    // Validate body
    if (schema.body && req.body) {
      const { errors, data } = await validateObject(
        req.body,
        schema.body,
        "body",
        options
      );
      if (errors.length > 0) {
        allErrors.push(...errors);
        if (options.abortEarly) {
          res.status(statusCode);
          return onError(allErrors, req, res, next);
        }
      }
      req.body = data;
    }

    // Validate headers
    if (schema.headers) {
      const headerObj: Record<string, any> = {};
      for (const key of Object.keys(schema.headers)) {
        headerObj[key] = req.headers.get(key);
      }

      const { errors } = await validateObject(
        headerObj,
        schema.headers,
        "headers",
        options
      );
      if (errors.length > 0) {
        allErrors.push(...errors);
      }
    }

    // Handle errors
    if (allErrors.length > 0) {
      res.status(statusCode);
      return onError(allErrors, req, res, next);
    }

    await next();
  };
}

// ============================================================================
// SHORTHAND VALIDATORS
// ============================================================================

/**
 * Validate query string only
 */
export function validateQuery(
  schema: Record<string, FieldSchema>,
  options?: ValidatorOptions
): Middleware {
  return validate({ query: schema }, options);
}

/**
 * Validate params only
 */
export function validateParams(
  schema: Record<string, FieldSchema>,
  options?: ValidatorOptions
): Middleware {
  return validate({ params: schema }, options);
}

/**
 * Validate body only
 */
export function validateBody(
  schema: Record<string, FieldSchema>,
  options?: ValidatorOptions
): Middleware {
  return validate({ body: schema }, options);
}

// ============================================================================
// SCHEMA HELPERS
// ============================================================================

/**
 * Create a string schema
 */
export function string(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "string", ...options };
}

/**
 * Create a required string schema
 */
export function requiredString(
  options: Partial<FieldSchema> = {}
): FieldSchema {
  return { type: "string", required: true, ...options };
}

/**
 * Create a number schema
 */
export function number(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "number", ...options };
}

/**
 * Create an integer schema
 */
export function integer(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "integer", ...options };
}

/**
 * Create a boolean schema
 */
export function boolean(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "boolean", ...options };
}

/**
 * Create an email schema
 */
export function email(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "email", trim: true, lowercase: true, ...options };
}

/**
 * Create a UUID schema
 */
export function uuid(options: Partial<FieldSchema> = {}): FieldSchema {
  return { type: "uuid", ...options };
}

/**
 * Create an array schema
 */
export function array(
  items?: FieldSchema,
  options: Partial<FieldSchema> = {}
): FieldSchema {
  return { type: "array", items, ...options };
}

/**
 * Create an object schema
 */
export function object(
  properties: Record<string, FieldSchema>,
  options: Partial<FieldSchema> = {}
): FieldSchema {
  return { type: "object", properties, ...options };
}

/**
 * Create an enum schema
 */
export function enumValue<T extends string | number>(
  values: T[],
  options: Partial<FieldSchema> = {}
): FieldSchema {
  return { type: "string", enum: values, ...options };
}
