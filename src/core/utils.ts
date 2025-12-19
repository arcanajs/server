import { HttpMethod } from "../types";

export const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

export function normalizeType(type: string): {
  value: string;
  params: Record<string, string>;
} {
  if (type.includes("/")) {
    return acceptParams(type);
  }
  // Simple mapping for now, can be expanded or use a mime library
  const mimeMap: Record<string, string> = {
    html: "text/html",
    json: "application/json",
    txt: "text/plain",
    js: "application/javascript",
    css: "text/css",
    png: "image/png",
    jpg: "image/jpeg",
  };
  return { value: mimeMap[type] || "application/octet-stream", params: {} };
}

function acceptParams(str: string): {
  value: string;
  params: Record<string, string>;
  quality: number;
} {
  const parts = str.split(";");
  const ret = {
    value: parts[0].trim(),
    params: {} as Record<string, string>,
    quality: 1,
  };

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i].split("=");
    if (p.length === 2) {
      const key = p[0].trim();
      const value = p[1].trim();
      if (key === "q") {
        ret.quality = parseFloat(value);
      } else {
        ret.params[key] = value;
      }
    }
  }

  return ret;
}

export function setCharset(type: string, charset: string): string {
  if (!type || !charset) return type;
  if (type.includes("charset")) return type;
  return `${type}; charset=${charset.toLowerCase()}`;
}

export async function generateETag(body: any): Promise<string> {
  const str = typeof body === "string" ? body : JSON.stringify(body);
  const hash = Bun.hash(str).toString(16);
  return `W/"${hash}"`;
}
