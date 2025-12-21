import { BroadcastOperatorImpl } from "./broadcast";
import type {
  AckCallback,
  AckPacket,
  ArcanaJSIOServer,
  ArcanaJSSocket,
  BroadcastOperator,
  EventHandler,
  Packet,
  ServerWebSocket,
  WebSocketData,
  WebSocketReadyState,
} from "./types";

/**
 * Socket implementation wrapping Bun's ServerWebSocket
 * Provides Socket.IO-like API with full feature set
 */
export class SocketImpl implements ArcanaJSSocket {
  private _events: Map<string, EventHandler[]> = new Map();
  private _onceEvents: Map<string, EventHandler[]> = new Map();
  private _acks: Map<
    string,
    { callback: AckCallback; timeout?: NodeJS.Timeout }
  > = new Map();
  private _server: ArcanaJSIOServer;
  private _ws: ServerWebSocket<WebSocketData>;
  private _flags: {
    compress?: boolean;
    volatile?: boolean;
    timeout?: number;
  } = {};

  constructor(ws: ServerWebSocket<WebSocketData>, server: ArcanaJSIOServer) {
    this._ws = ws;
    this._server = server;
    this._ws.data.connected = true;

    // Bind methods to maintain context
    this.send = this.send.bind(this);
    this.join = this.join.bind(this);
    this.leave = this.leave.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.unsubscribe = this.unsubscribe.bind(this);
    this.publish = this.publish.bind(this);
    this.isSubscribed = this.isSubscribed.bind(this);
    this.cork = this.cork.bind(this);
  }

  // ============================================================================
  // PROPERTIES
  // ============================================================================

  get id(): string {
    return this._ws.data.id;
  }

  get data(): WebSocketData {
    return this._ws.data;
  }

  set data(value: WebSocketData) {
    this._ws.data = value;
  }

  get rooms(): Set<string> {
    return this._ws.data.rooms;
  }

  get readyState(): WebSocketReadyState {
    return this._ws.readyState;
  }

  get remoteAddress(): string {
    return this._ws.remoteAddress;
  }

  get connected(): boolean {
    return this._ws.data.connected && this._ws.readyState === 1;
  }

  get disconnected(): boolean {
    return !this.connected;
  }

  get handshake(): WebSocketData["handshake"] {
    return this._ws.data.handshake;
  }

  get server(): ArcanaJSIOServer {
    return this._server;
  }

  get broadcast(): BroadcastOperator {
    return new BroadcastOperatorImpl(this._server, {
      except: [this.id],
    });
  }

  get volatile(): this {
    this._flags.volatile = true;
    return this;
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Register an event handler
   */
  on<T = any>(event: string, handler: EventHandler<T>): this {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event)!.push(handler as EventHandler);
    return this;
  }

  /**
   * Register a one-time event handler
   */
  once<T = any>(event: string, handler: EventHandler<T>): this {
    if (!this._onceEvents.has(event)) {
      this._onceEvents.set(event, []);
    }
    this._onceEvents.get(event)!.push(handler as EventHandler);
    return this;
  }

  /**
   * Remove an event handler
   */
  off(event: string, handler?: EventHandler): this {
    if (!handler) {
      this._events.delete(event);
      this._onceEvents.delete(event);
      return this;
    }

    const removeFrom = (map: Map<string, EventHandler[]>) => {
      const handlers = map.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        if (handlers.length === 0) {
          map.delete(event);
        }
      }
    };

    removeFrom(this._events);
    removeFrom(this._onceEvents);
    return this;
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners(event?: string): this {
    if (event) {
      this._events.delete(event);
      this._onceEvents.delete(event);
    } else {
      this._events.clear();
      this._onceEvents.clear();
    }
    return this;
  }

  /**
   * Emit an event to this socket
   */
  emit<T = any>(event: string, data?: T, ack?: AckCallback): this {
    // Validate connection state
    if (this.disconnected && !this._flags.volatile) {
      console.warn(`Cannot emit "${event}" to disconnected socket ${this.id}`);
      return this;
    }

    // Skip volatile messages if disconnected
    if (this._flags.volatile && this.disconnected) {
      this._clearFlags();
      return this;
    }

    const packet: Packet = {
      type: event,
      data,
      id: ack ? this._generateAckId() : undefined,
      nsp: this.server.name,
      ack: !!ack,
    };

    // Register acknowledgment callback
    if (ack && packet.id) {
      const timeout = this._flags.timeout;
      const timeoutTimer = timeout
        ? setTimeout(() => {
            this._handleAckTimeout(packet.id!);
          }, timeout)
        : undefined;

      this._acks.set(packet.id, { callback: ack, timeout: timeoutTimer });
    }

    const message = JSON.stringify(packet);
    const compress = this._flags.compress ?? false;

    try {
      this.send(message, compress);
    } catch (error) {
      console.error(`Failed to emit "${event}":`, error);
      if (ack) {
        ack(error as Error);
      }
    }

    this._clearFlags();
    return this;
  }

  /**
   * Emit an event with promise-based acknowledgment
   */
  emitWithAck<T = any>(event: string, data?: T): Promise<any> {
    return new Promise((resolve, reject) => {
      this.emit(event, data, (error, responseData) => {
        if (error) {
          reject(error);
        } else {
          resolve(responseData);
        }
      });
    });
  }

  // ============================================================================
  // ROOM MANAGEMENT
  // ============================================================================

  /**
   * Join one or more rooms
   */
  join(room: string | string[]): this {
    const rooms = Array.isArray(room) ? room : [room];

    rooms.forEach((r) => {
      if (!r || typeof r !== "string") {
        console.warn(`Invalid room name: ${r}`);
        return;
      }

      this.subscribe(r);
      this.rooms.add(r);
    });

    return this;
  }

  /**
   * Leave one or more rooms
   */
  leave(room: string | string[]): this {
    const rooms = Array.isArray(room) ? room : [room];

    rooms.forEach((r) => {
      if (!r || typeof r !== "string") {
        return;
      }

      this.unsubscribe(r);
      this.rooms.delete(r);
    });

    return this;
  }

  /**
   * Leave all rooms
   */
  leaveAll(): void {
    const rooms = Array.from(this.rooms);
    rooms.forEach((room) => this.leave(room));
  }

  /**
   * Check if socket is in a room
   */
  isInRoom(room: string): boolean {
    return this.rooms.has(room);
  }

  // ============================================================================
  // BROADCASTING
  // ============================================================================

  /**
   * Target specific rooms for broadcasting
   */
  to(room: string | string[]): BroadcastOperator {
    return new BroadcastOperatorImpl(this._server, {
      rooms: Array.isArray(room) ? room : [room],
      except: [this.id],
    });
  }

  /**
   * Alias for to()
   */
  in(room: string | string[]): BroadcastOperator {
    return this.to(room);
  }

  // ============================================================================
  // BUN WEBSOCKET DELEGATION
  // ============================================================================

  /**
   * Send raw data through WebSocket
   */
  send(message: string | ArrayBuffer | Uint8Array, compress?: boolean): number {
    if (this.disconnected) {
      return 0;
    }

    try {
      return this._ws.send(message, compress ?? false);
    } catch (error) {
      console.error(`Failed to send message to socket ${this.id}:`, error);
      return 0;
    }
  }

  /**
   * Subscribe to a pub/sub topic
   */
  subscribe(topic: string): void {
    try {
      this._ws.subscribe(topic);
    } catch (error) {
      console.error(`Failed to subscribe to topic "${topic}":`, error);
    }
  }

  /**
   * Unsubscribe from a pub/sub topic
   */
  unsubscribe(topic: string): void {
    try {
      this._ws.unsubscribe(topic);
    } catch (error) {
      console.error(`Failed to unsubscribe from topic "${topic}":`, error);
    }
  }

  /**
   * Publish to a pub/sub topic
   */
  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number {
    try {
      return this._ws.publish(topic, message, compress ?? false);
    } catch (error) {
      console.error(`Failed to publish to topic "${topic}":`, error);
      return 0;
    }
  }

  /**
   * Check if subscribed to a topic
   */
  isSubscribed(topic: string): boolean {
    return this._ws.isSubscribed(topic);
  }

  /**
   * Cork multiple operations for better performance
   * Batches multiple send operations into a single syscall
   *
   * @example
   * socket.cork(() => {
   *   socket.emit('event1', data1);
   *   socket.emit('event2', data2);
   *   socket.emit('event3', data3);
   * });
   */
  cork<T>(callback: (ws: ServerWebSocket<WebSocketData>) => T): T {
    // Wrap the callback to ensure proper typing
    const result = this._ws.cork((ws) => {
      return callback(ws as ServerWebSocket<WebSocketData>);
    });
    return result as T;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Enable compression for next message
   */
  compress(compress: boolean): this {
    this._flags.compress = compress;
    return this;
  }

  /**
   * Set timeout for acknowledgments
   */
  timeout(timeout: number): this {
    this._flags.timeout = timeout;
    return this;
  }

  /**
   * Disconnect the socket
   */
  disconnect(close = true): this {
    if (this.disconnected) {
      return this;
    }

    // Mark as disconnected
    this._ws.data.connected = false;
    this._ws.data.disconnectReason = "server disconnect";

    // Emit disconnect event
    this._handleEvent("disconnect", this._ws.data.disconnectReason);

    // Close WebSocket connection
    if (close) {
      try {
        this._ws.close(1000, "Server disconnect");
      } catch (error) {
        console.error(`Failed to close socket ${this.id}:`, error);
      }
    }

    // Remove from server
    this._server.removeSocket(this.id);

    return this;
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  /**
   * Handle incoming event
   * @internal
   */
  _handleEvent(event: string, data?: any, ackId?: string): void {
    // Create acknowledgment callback if needed
    const ack: AckCallback | undefined = ackId
      ? (error, responseData) => {
          const ackPacket: AckPacket = {
            type: "ack",
            id: ackId,
            data: responseData,
            error: error?.message,
          };
          this.send(JSON.stringify(ackPacket));
        }
      : undefined;

    // Execute regular handlers
    const handlers = this._events.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        this._executeHandler(handler, data, ack);
      });
    }

    // Execute one-time handlers
    const onceHandlers = this._onceEvents.get(event);
    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        this._executeHandler(handler, data, ack);
      });
      this._onceEvents.delete(event);
    }
  }

  /**
   * Handle acknowledgment response
   * @internal
   */
  _handleAck(ackId: string, data?: any, error?: string): void {
    const ackData = this._acks.get(ackId);
    if (!ackData) {
      return;
    }

    // Clear timeout
    if (ackData.timeout) {
      clearTimeout(ackData.timeout);
    }

    // Call callback
    const err = error ? new Error(error) : null;
    try {
      ackData.callback(err, data);
    } catch (callbackError) {
      console.error(`Error in acknowledgment callback:`, callbackError);
    }

    // Remove from map
    this._acks.delete(ackId);
  }

  /**
   * Clean up socket resources
   * @internal
   */
  _destroy(): void {
    // Clear all event handlers
    this._events.clear();
    this._onceEvents.clear();

    // Clear acknowledgment timeouts
    this._acks.forEach(({ timeout }) => {
      if (timeout) {
        clearTimeout(timeout);
      }
    });
    this._acks.clear();

    // Leave all rooms
    this.leaveAll();

    // Clear flags
    this._clearFlags();
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Execute an event handler safely
   */
  private _executeHandler(
    handler: EventHandler,
    data?: any,
    ack?: AckCallback
  ): void {
    try {
      const fn = handler as any;
      const result =
        fn.length >= 2 ? fn(this, data, ack) : fn.call(this, data, ack);

      // Handle async handlers
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error(`Error in async event handler:`, err);
          this.emit("error", err);
        });
      }
    } catch (error) {
      console.error(`Error in event handler:`, error);
      this.emit("error", error);
    }
  }

  /**
   * Generate unique acknowledgment ID
   */
  private _generateAckId(): string {
    return `${this.id}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  /**
   * Handle acknowledgment timeout
   */
  private _handleAckTimeout(ackId: string): void {
    const ackData = this._acks.get(ackId);
    if (!ackData) {
      return;
    }

    try {
      ackData.callback(new Error("Acknowledgment timeout"));
    } catch (error) {
      console.error(`Error in timeout callback:`, error);
    }

    this._acks.delete(ackId);
  }

  /**
   * Clear message flags
   */
  private _clearFlags(): void {
    this._flags = {};
  }
}
