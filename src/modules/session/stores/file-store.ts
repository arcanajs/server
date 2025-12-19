/**
 * ArcanaJS File Session Store
 *
 * Persistent file-based storage for sessions.
 */

import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SessionData, SessionStore } from "../types";

/**
 * FileStore - File-based session store
 */
export class FileStore implements SessionStore {
  private basePath: string;
  private cleanupInterval?: Timer;

  constructor(
    options: {
      path?: string;
      checkPeriod?: number;
    } = {}
  ) {
    this.basePath = options.path || join(process.cwd(), ".sessions");
    const checkPeriod = options.checkPeriod || 3600000; // Default 1 hour

    // Ensure directory exists
    this.init();

    this.cleanupInterval = setInterval(() => {
      this.prune();
    }, checkPeriod);
  }

  private async init() {
    try {
      await mkdir(this.basePath, { recursive: true });
    } catch (err) {
      // Ignore if exists
    }
  }

  /**
   * Get session data
   */
  async get(sid: string): Promise<SessionData | null> {
    const filePath = this.getFilePath(sid);
    try {
      const file = Bun.file(filePath);
      const content = await file.text();
      const record = JSON.parse(content);

      if (record.expires && record.expires <= Date.now()) {
        await this.destroy(sid);
        return null;
      }

      return record.data;
    } catch {
      return null;
    }
  }

  /**
   * Set session data
   */
  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    const filePath = this.getFilePath(sid);

    let expires: number | null = null;
    if (ttl) {
      expires = Date.now() + ttl * 1000;
    } else if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    const record = {
      data: session,
      expires,
    };

    await Bun.write(filePath, JSON.stringify(record));
  }

  /**
   * Destroy session
   */
  async destroy(sid: string): Promise<void> {
    const filePath = this.getFilePath(sid);
    try {
      await Bun.file(filePath).delete();
    } catch {
      // Ignore if not found
    }
  }

  /**
   * Touch session
   */
  async touch(sid: string, session: SessionData): Promise<void> {
    const data = await this.get(sid);
    if (data) {
      await this.set(sid, session);
    }
  }

  /**
   * Clear all sessions
   */
  async clear(): Promise<void> {
    try {
      const files: string[] = await readdir(this.basePath);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await Bun.file(join(this.basePath, file)).delete();
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Get total length
   */
  async length(): Promise<number> {
    try {
      const files: string[] = await readdir(this.basePath);
      return files.filter((f: string) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }

  /**
   * Prune expired sessions
   */
  private async prune(): Promise<void> {
    try {
      const files: string[] = await readdir(this.basePath);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = join(this.basePath, file);
        try {
          const content = await Bun.file(filePath).text();
          const record = JSON.parse(content);

          if (record.expires && record.expires <= now) {
            await Bun.file(filePath).delete();
          }
        } catch {
          // If unreadable, check mtime
          try {
            const s = await stat(filePath);
            // Delete if older than 24 hours (fallback)
            if (now - s.mtimeMs > 86400000) {
              await Bun.file(filePath).delete();
            }
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Get file path for SID
   */
  private getFilePath(sid: string): string {
    // Sanitize sid to prevent path traversal
    const safeId = sid.replace(/[^a-zA-Z0-9_-]/g, "");
    return join(this.basePath, `${safeId}.json`);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
