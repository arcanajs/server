/**
 * ArcanaJS Session Implementation
 *
 * Concrete implementation of the Session interface.
 */

import type {
  Session,
  SessionCookie,
  SessionData,
  SessionStore,
} from "./types";

/**
 * SessionImpl - Implementation of the Session interface
 */
export class SessionImpl implements Session {
  readonly id: string;
  cookie: SessionCookie;

  private _store: SessionStore;
  private _data: Map<string, any>;
  private _isModified: boolean = false;
  private _isNew: boolean = true;
  private _destroyed: boolean = false;

  constructor(
    id: string,
    store: SessionStore,
    cookie: SessionCookie,
    data?: SessionData
  ) {
    this.id = id;
    this._store = store;
    this.cookie = cookie;
    this._data = new Map();

    if (data) {
      this._isNew = false;
      // Load data except the cookie
      for (const [key, value] of Object.entries(data)) {
        if (key !== "cookie") {
          this._data.set(key, value);
        }
      }
    }
  }

  /**
   * Get a value from the session
   */
  get<T = any>(key: string): T | undefined {
    this.checkDestroyed();
    return this._data.get(key);
  }

  /**
   * Set a value in the session
   */
  set(key: string, value: any): this {
    this.checkDestroyed();
    this._data.set(key, value);
    this._isModified = true;
    return this;
  }

  /**
   * Delete a key from the session
   */
  delete(key: string): boolean {
    this.checkDestroyed();
    const result = this._data.delete(key);
    if (result) {
      this._isModified = true;
    }
    return result;
  }

  /**
   * Check if a key exists in the session
   */
  has(key: string): boolean {
    this.checkDestroyed();
    return this._data.has(key);
  }

  /**
   * Destroy the session
   */
  async destroy(): Promise<void> {
    this.checkDestroyed();
    this._destroyed = true;
    await this._store.destroy(this.id);
  }

  /**
   * Regenerate the session (logic handled in middleware)
   */
  async regenerate(): Promise<void> {
    // This is a placeholder for the middleware to intercept
    // In a real implementation, the middleware would replace req.session
    throw new Error("regenerate() must be implemented by middleware");
  }

  /**
   * Save the session to the store
   */
  async save(): Promise<void> {
    this.checkDestroyed();
    await this._store.set(this.id, this.toJSON());
    this._isModified = false;
  }

  /**
   * Reload the session from the store
   */
  async reload(): Promise<void> {
    this.checkDestroyed();
    const data = await this._store.get(this.id);
    if (data) {
      this._data.clear();
      for (const [key, value] of Object.entries(data)) {
        if (key !== "cookie") {
          this._data.set(key, value);
        }
      }
      this._isModified = false;
    }
  }

  /**
   * Touch the session
   */
  touch(): void {
    this.checkDestroyed();
    this.cookie.resetMaxAge();
    this._isModified = true;
  }

  /**
   * Check if modified
   */
  get isModified(): boolean {
    return this._isModified;
  }

  /**
   * Check if new
   */
  get isNew(): boolean {
    return this._isNew;
  }

  /**
   * Convert to JSON for storage
   */
  toJSON(): SessionData {
    const data: SessionData = {
      cookie: this.cookie.toJSON(),
    };

    for (const [key, value] of this._data.entries()) {
      data[key] = value;
    }

    return data;
  }

  /**
   * Helper to check if session is destroyed
   */
  private checkDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Cannot use a destroyed session");
    }
  }
}
