/**
 * Custom Path Utility for ArcanaJS
 */

export const path = {
  /**
   * Joins all given path segments together using the platform-specific separator as a delimiter,
   * then normalizes the resulting path.
   */
  join(...segments: string[]): string {
    return segments.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  },

  /**
   * Resolves a sequence of paths or path segments into an absolute path.
   */
  resolve(...segments: string[]): string {
    let resolvedPath = "";
    const isAbsolute = segments[0]?.startsWith("/") || false;

    // In Bun, we can use process.cwd() or similar for the base
    const base = isAbsolute ? "" : process.cwd() || "/";

    resolvedPath = this.join(base, ...segments);

    // Simple normalization of .. and .
    const stack: string[] = [];
    const parts = resolvedPath.split("/");

    for (const part of parts) {
      if (part === "..") {
        stack.pop();
      } else if (part !== "." && part !== "") {
        stack.push(part);
      }
    }

    return "/" + stack.join("/");
  },

  /**
   * Returns the extension of the path, from the last occurrence of the . (period) character
   * to end of string in the last portion of the path.
   */
  extname(p: string): string {
    const base = this.basename(p);
    const index = base.lastIndexOf(".");
    if (index === -1 || index === 0) return "";
    return base.substring(index);
  },

  /**
   * Returns the last portion of a path.
   */
  basename(p: string, ext?: string): string {
    let base = p.split("/").pop() || "";
    if (ext && base.endsWith(ext)) {
      base = base.substring(0, base.length - ext.length);
    }
    return base;
  },

  /**
   * Returns the directory name of a path.
   */
  dirname(p: string): string {
    const parts = p.split("/");
    if (parts.length <= 1) return ".";
    if (parts.length === 2 && parts[0] === "") return "/";
    parts.pop();
    const dir = parts.join("/") || ".";
    return dir;
  },
};

export default path;
