/**
 * ArcanaJS Session Stores - Production Implementation
 *
 * Memory, File, and Redis stores with proper error handling,
 * TTL management, and Bun optimizations
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SessionData, SessionStore } from "./types";
import {
  SessionStoreError,
  SessionNotFoundError,
  SessionExpiredError,
} from "./types";

// ============================================================================
// Memory Store (Development Only)
// ============================================================================

/**
 * In-memory session store
 *
 * WARNING: Data is lost on restart. Use only for development.
 */
export class MemoryStore implements SessionStore {
  private _sessions = new Map<
    string,
    {
      data: SessionData;
      expires: number | null;
    }
  >();
  private _cleanupTimer?: Timer;
  private _checkPeriod: number;

  constructor(options: { checkPeriod?: number } = {}) {
    this._checkPeriod = options.checkPeriod || 60000; // 1 minute
    this._startCleanup();
  }

  async get(sid: string): Promise<SessionData | null> {
    const record = this._sessions.get(sid);

    if (!record) {
      return null;
    }

    // Check expiration
    if (record.expires && record.expires <= Date.now()) {
      this._sessions.delete(sid);
      return null;
    }

    return record.data;
  }

  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    let expires: number | null = null;

    if (ttl) {
      expires = Date.now() + ttl * 1000;
    } else if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    this._sessions.set(sid, { data: session, expires });
  }

  async destroy(sid: string): Promise<void> {
    this._sessions.delete(sid);
  }

  async touch(sid: string, session: SessionData): Promise<void> {
    const record = this._sessions.get(sid);
    if (!record) return;

    let expires: number | null = null;
    if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    record.expires = expires;
  }

  async clear(): Promise<void> {
    this._sessions.clear();
  }

  async length(): Promise<number> {
    return this._sessions.size;
  }

  async prune(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sid, record] of this._sessions.entries()) {
      if (record.expires && record.expires <= now) {
        toDelete.push(sid);
      }
    }

    for (const sid of toDelete) {
      this._sessions.delete(sid);
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = undefined;
    }
  }

  private _startCleanup(): void {
    this._cleanupTimer = setInterval(() => {
      this.prune().catch(console.error);
    }, this._checkPeriod);

    // Don't keep process alive
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }
}

// ============================================================================
// File Store (Production)
// ============================================================================

/**
 * File-based session store
 *
 * Stores sessions as JSON files. Good for single-server deployments.
 */
export class FileStore implements SessionStore {
  private _basePath: string;
  private _cleanupTimer?: Timer;
  private _checkPeriod: number;

  constructor(
    options: {
      path?: string;
      checkPeriod?: number;
    } = {}
  ) {
    this._basePath = options.path || join(process.cwd(), ".sessions");
    this._checkPeriod = options.checkPeriod || 3600000; // 1 hour

    this._init().catch(console.error);
    this._startCleanup();
  }

  async get(sid: string): Promise<SessionData | null> {
    const filePath = this._getFilePath(sid);

    try {
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return null;
      }

      const content = await file.text();
      const record = JSON.parse(content);

      // Check expiration
      if (record.expires && record.expires <= Date.now()) {
        await this._deleteFile(filePath);
        return null;
      }

      return record.data;
    } catch (error) {
      console.error(`Error reading session ${sid}:`, error);
      return null;
    }
  }

  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    const filePath = this._getFilePath(sid);

    let expires: number | null = null;
    if (ttl) {
      expires = Date.now() + ttl * 1000;
    } else if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    const record = { data: session, expires };

    try {
      await Bun.write(filePath, JSON.stringify(record));
    } catch (error) {
      throw new SessionStoreError(`Failed to save session: ${error}`);
    }
  }

  async destroy(sid: string): Promise<void> {
    const filePath = this._getFilePath(sid);
    await this._deleteFile(filePath);
  }

  async touch(sid: string, session: SessionData): Promise<void> {
    const data = await this.get(sid);
    if (data) {
      await this.set(sid, session);
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await readdir(this._basePath);

      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => this._deleteFile(join(this._basePath, f)))
      );
    } catch (error) {
      throw new SessionStoreError(`Failed to clear sessions: ${error}`);
    }
  }

  async length(): Promise<number> {
    try {
      const files = await readdir(this._basePath);
      return files.filter((f) => f.endsWith(".json")).length;
    } catch {
      return 0;
    }
  }

  async prune(): Promise<void> {
    try {
      const files = await readdir(this._basePath);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        const filePath = join(this._basePath, file);

        try {
          const bunFile = Bun.file(filePath);
          const content = await bunFile.text();
          const record = JSON.parse(content);

          if (record.expires && record.expires <= now) {
            await this._deleteFile(filePath);
          }
        } catch {
          // Delete corrupted files
          await this._deleteFile(filePath);
        }
      }
    } catch (error) {
      console.error("Error pruning sessions:", error);
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = undefined;
    }
  }

  private async _init(): Promise<void> {
    try {
      await mkdir(this._basePath, { recursive: true });
    } catch (error) {
      throw new SessionStoreError(`Failed to initialize store: ${error}`);
    }
  }

  private _getFilePath(sid: string): string {
    // Sanitize session ID to prevent path traversal
    const safe = sid.replace(/[^a-zA-Z0-9_-]/g, "");
    return join(this._basePath, `${safe}.json`);
  }

  private async _deleteFile(path: string): Promise<void> {
    try {
      const file = Bun.file(path);
      if (await file.exists()) {
        await rm(path);
      }
    } catch {
      // Ignore deletion errors
    }
  }

  private _startCleanup(): void {
    this._cleanupTimer = setInterval(() => {
      this.prune().catch(console.error);
    }, this._checkPeriod);

    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }
}

// ============================================================================
// Redis Store (Production)
// ============================================================================

/**
 * Redis client interface
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ping?(): Promise<string>;
}

/**
 * Redis session store
 *
 * Best for multi-server deployments with high scalability needs
 */
export class RedisStore implements SessionStore {
  private _client: RedisClient;
  private _prefix: string;
  private _ttl: number;
  private _serializer: (data: SessionData) => string;
  private _deserializer: (text: string) => SessionData;

  constructor(options: {
    client: RedisClient;
    prefix?: string;
    ttl?: number;
    serializer?: (data: SessionData) => string;
    deserializer?: (text: string) => SessionData;
  }) {
    this._client = options.client;
    this._prefix = options.prefix || "sess:";
    this._ttl = options.ttl || 86400; // 1 day

    // Custom serialization support
    this._serializer = options.serializer || JSON.stringify;
    this._deserializer = options.deserializer || JSON.parse;

    // Test connection
    this._testConnection().catch(console.error);
  }

  async get(sid: string): Promise<SessionData | null> {
    const key = this._getKey(sid);

    try {
      const data = await this._client.get(key);

      if (!data) {
        return null;
      }

      return this._deserializer(data);
    } catch (error) {
      throw new SessionStoreError(`Failed to get session: ${error}`);
    }
  }

  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    const key = this._getKey(sid);
    const value = this._serializer(session);

    // Calculate TTL
    let seconds = ttl;
    if (!seconds && session.cookie.expires) {
      seconds = Math.ceil(
        (new Date(session.cookie.expires).getTime() - Date.now()) / 1000
      );
    }
    seconds = Math.max(seconds || this._ttl, 1);

    try {
      await this._client.set(key, value, "EX", seconds);
    } catch (error) {
      throw new SessionStoreError(`Failed to set session: ${error}`);
    }
  }

  async destroy(sid: string): Promise<void> {
    const key = this._getKey(sid);

    try {
      await this._client.del(key);
    } catch (error) {
      throw new SessionStoreError(`Failed to destroy session: ${error}`);
    }
  }

  async touch(sid: string, session: SessionData): Promise<void> {
    const key = this._getKey(sid);

    let seconds: number;
    if (session.cookie.expires) {
      seconds = Math.ceil(
        (new Date(session.cookie.expires).getTime() - Date.now()) / 1000
      );
    } else {
      seconds = this._ttl;
    }

    seconds = Math.max(seconds, 1);

    try {
      await this._client.expire(key, seconds);
    } catch (error) {
      throw new SessionStoreError(`Failed to touch session: ${error}`);
    }
  }

  private _getKey(sid: string): string {
    return this._prefix + sid;
  }

  private async _testConnection(): Promise<void> {
    if (!this._client.ping) return;

    try {
      await this._client.ping();
    } catch (error) {
      console.error("Redis connection test failed:", error);
    }
  }
}
