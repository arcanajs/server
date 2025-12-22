/**
 * ArcanaJS Session Implementation - Production Version
 *
 * Robust session management with proper state tracking,
 * validation, and error handling optimized for Bun
 */

import type {
  Session,
  SessionCookie,
  SessionData,
  SessionStore,
} from "./types";

/**
 * Session implementation with full feature set
 */
export class SessionImpl implements Session {
  readonly id: string;
  readonly createdAt: number;

  cookie: SessionCookie;
  lastActivity: number;

  private _store: SessionStore;
  private _data: Map<string, any>;
  private _isModified: boolean = false;
  private _isNew: boolean = true;
  private _destroyed: boolean = false;
  private _regenerating: boolean = false;

  constructor(
    id: string,
    store: SessionStore,
    cookie: SessionCookie,
    data?: SessionData
  ) {
    this.id = id;
    this._store = store;
    this.cookie = cookie;

    // Set timestamps
    const now = Date.now();
    this.createdAt = data?.createdAt || now;
    this.lastActivity = data?.lastActivity || now;

    // Initialize data store
    this._data = new Map();

    // Load existing data
    if (data) {
      this._isNew = false;
      this._loadData(data);
    }
  }

  // ============================================================================
  // Data Access Methods
  // ============================================================================

  /**
   * Get value from session
   */
  get<T = any>(key: string): T | undefined {
    this._assertNotDestroyed();
    this._updateActivity();
    return this._data.get(key);
  }

  /**
   * Set value in session
   */
  set(key: string, value: any): this {
    this._assertNotDestroyed();

    // Validate key
    if (!key || typeof key !== "string") {
      throw new Error("Session key must be a non-empty string");
    }

    // Don't allow setting reserved keys
    if (this._isReservedKey(key)) {
      throw new Error(`Cannot set reserved session key: ${key}`);
    }

    this._data.set(key, value);
    this._isModified = true;
    this._updateActivity();

    return this;
  }

  /**
   * Delete key from session
   */
  delete(key: string): boolean {
    this._assertNotDestroyed();

    if (this._isReservedKey(key)) {
      throw new Error(`Cannot delete reserved session key: ${key}`);
    }

    const result = this._data.delete(key);

    if (result) {
      this._isModified = true;
      this._updateActivity();
    }

    return result;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    this._assertNotDestroyed();
    return this._data.has(key);
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    this._assertNotDestroyed();
    return Array.from(this._data.keys());
  }

  /**
   * Get all values
   */
  values(): any[] {
    this._assertNotDestroyed();
    return Array.from(this._data.values());
  }

  /**
   * Get all entries
   */
  entries(): [string, any][] {
    this._assertNotDestroyed();
    return Array.from(this._data.entries());
  }

  /**
   * Clear all data (keeps session active)
   */
  clear(): void {
    this._assertNotDestroyed();
    this._data.clear();
    this._isModified = true;
    this._updateActivity();
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Destroy session permanently
   */
  async destroy(): Promise<void> {
    this._assertNotDestroyed();

    try {
      // Delete from store
      await this._store.destroy(this.id);

      // Clear data
      this._data.clear();

      // Mark as destroyed
      this._destroyed = true;
    } catch (error) {
      throw new Error(`Failed to destroy session: ${error}`);
    }
  }

  /**
   * Regenerate session ID (prevents session fixation)
   */
  async regenerate(): Promise<void> {
    throw new Error(
      "Session regeneration must be handled by middleware. " +
        "This method should be overridden during middleware initialization."
    );
  }

  /**
   * Save session to store
   */
  async save(): Promise<void> {
    this._assertNotDestroyed();

    if (this._regenerating) {
      throw new Error("Cannot save session during regeneration");
    }

    try {
      const data = this.toJSON();
      await this._store.set(this.id, data);
      this._isModified = false;
    } catch (error) {
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  /**
   * Reload session from store
   */
  async reload(): Promise<void> {
    this._assertNotDestroyed();

    try {
      const data = await this._store.get(this.id);

      if (!data) {
        throw new Error("Session not found in store");
      }

      // Clear and reload
      this._data.clear();
      this._loadData(data);
      this._isModified = false;
    } catch (error) {
      throw new Error(`Failed to reload session: ${error}`);
    }
  }

  /**
   * Touch session (update expiration)
   */
  touch(): void {
    this._assertNotDestroyed();
    this.cookie.resetMaxAge();
    this._updateActivity();
    this._isModified = true;
  }

  // ============================================================================
  // State Properties
  // ============================================================================

  get isModified(): boolean {
    return this._isModified;
  }

  get isNew(): boolean {
    return this._isNew;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  get isExpired(): boolean {
    return this.cookie.isExpired;
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Convert to JSON for storage
   */
  toJSON(): SessionData {
    const data: SessionData = {
      cookie: this.cookie.toJSON(),
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };

    // Add custom data
    for (const [key, value] of this._data.entries()) {
      try {
        // Test JSON serializability
        JSON.stringify(value);
        data[key] = value;
      } catch (error) {
        console.warn(`Skipping non-serializable session value for key: ${key}`);
      }
    }

    return data;
  }

  /**
   * Create human-readable string
   */
  toString(): string {
    return `Session(id=${this.id}, modified=${this._isModified}, new=${this._isNew})`;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Load data from stored session
   */
  private _loadData(data: SessionData): void {
    const { cookie, createdAt, lastActivity, ...customData } = data;

    // Load custom data
    for (const [key, value] of Object.entries(customData)) {
      if (!this._isReservedKey(key)) {
        this._data.set(key, value);
      }
    }
  }

  /**
   * Check if key is reserved
   */
  private _isReservedKey(key: string): boolean {
    const reserved = ["cookie", "createdAt", "lastActivity", "id"];
    return reserved.includes(key);
  }

  /**
   * Update last activity timestamp
   */
  private _updateActivity(): void {
    this.lastActivity = Date.now();
  }

  /**
   * Assert session is not destroyed
   */
  private _assertNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Cannot use destroyed session");
    }
  }

  /**
   * Mark session as regenerating
   * @internal
   */
  _markRegenerating(): void {
    this._regenerating = true;
  }

  /**
   * Unmark session as regenerating
   * @internal
   */
  _unmarkRegenerating(): void {
    this._regenerating = false;
  }

  /**
   * Get internal data map (for testing)
   * @internal
   */
  _getData(): Map<string, any> {
    return this._data;
  }
}
