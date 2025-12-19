/**
 * ArcanaJS Memory Session Store
 *
 * In-memory storage for sessions (development only).
 */

import type { SessionData, SessionStore } from "../types";

/**
 * MemoryStore - Simple in-memory session store
 */
export class MemoryStore implements SessionStore {
  private sessions = new Map<
    string,
    { data: string; expires: number | null }
  >();
  private cleanupInterval?: Timer;

  constructor(options: { checkPeriod?: number } = {}) {
    const checkPeriod = options.checkPeriod || 60000; // Default 1 minute

    this.cleanupInterval = setInterval(() => {
      this.prune();
    }, checkPeriod);
  }

  /**
   * Get session data
   */
  async get(sid: string): Promise<SessionData | null> {
    const record = this.sessions.get(sid);
    if (!record) return null;

    if (record.expires && record.expires <= Date.now()) {
      this.sessions.delete(sid);
      return null;
    }

    try {
      return JSON.parse(record.data);
    } catch {
      return null;
    }
  }

  /**
   * Set session data
   */
  async set(sid: string, session: SessionData, ttl?: number): Promise<void> {
    let expires: number | null = null;

    if (ttl) {
      expires = Date.now() + ttl * 1000;
    } else if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    this.sessions.set(sid, {
      data: JSON.stringify(session),
      expires,
    });
  }

  /**
   * Destroy session
   */
  async destroy(sid: string): Promise<void> {
    this.sessions.delete(sid);
  }

  /**
   * Touch session
   */
  async touch(sid: string, session: SessionData): Promise<void> {
    const record = this.sessions.get(sid);
    if (!record) return;

    let expires: number | null = null;
    if (session.cookie.expires) {
      expires = new Date(session.cookie.expires).getTime();
    }

    record.expires = expires;
  }

  /**
   * Clear all sessions
   */
  async clear(): Promise<void> {
    this.sessions.clear();
  }

  /**
   * Get total length
   */
  async length(): Promise<number> {
    return this.sessions.size;
  }

  /**
   * Get all sessions
   */
  async all(): Promise<SessionData[]> {
    const result: SessionData[] = [];
    for (const record of this.sessions.values()) {
      if (!record.expires || record.expires > Date.now()) {
        result.push(JSON.parse(record.data));
      }
    }
    return result;
  }

  /**
   * Prune expired sessions
   */
  private prune(): void {
    const now = Date.now();
    for (const [sid, record] of this.sessions.entries()) {
      if (record.expires && record.expires <= now) {
        this.sessions.delete(sid);
      }
    }
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
