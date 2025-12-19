/**
 * ArcanaJS Redis Session Store
 *
 * High-performance, distributed session storage using Redis.
 */

import type { SessionData, SessionStore } from "../types";

/**
 * Generic Redis client interface to support multiple libraries (ioredis, redis)
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

/**
 * RedisStore - Production-ready session store
 */
export class RedisStore implements SessionStore {
  private client: RedisClient;
  private prefix: string;
  private ttl: number;

  constructor(options: { client: RedisClient; prefix?: string; ttl?: number }) {
    this.client = options.client;
    this.prefix = options.prefix || "sess:";
    this.ttl = options.ttl || 86400; // Default 1 day
  }

  /**
   * Get session data
   */
  async get(sid: string): Promise<SessionData | null> {
    const key = this.prefix + sid;
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Set session data
   */
  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    const key = this.prefix + sid;
    const value = JSON.stringify(session);

    // Determine expiration
    let seconds = ttl;
    if (!seconds && session.cookie.expires) {
      seconds = Math.ceil(
        (new Date(session.cookie.expires).getTime() - Date.now()) / 1000
      );
    }

    // Ensure positive TTL
    seconds = Math.max(seconds || this.ttl, 1);

    // Set with expiration (EX)
    await this.client.set(key, value, "EX", seconds);
  }

  /**
   * Destroy session
   */
  async destroy(sid: string): Promise<void> {
    const key = this.prefix + sid;
    await this.client.del(key);
  }

  /**
   * Touch session (update TTL)
   */
  async touch(sid: string, session: SessionData): Promise<void> {
    const key = this.prefix + sid;

    let seconds: number;
    if (session.cookie.expires) {
      seconds = Math.ceil(
        (new Date(session.cookie.expires).getTime() - Date.now()) / 1000
      );
    } else {
      seconds = this.ttl;
    }

    seconds = Math.max(seconds, 1);
    await this.client.expire(key, seconds);
  }
}
