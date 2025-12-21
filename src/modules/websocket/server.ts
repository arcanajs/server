import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";
import { MemoryAdapter } from "./adapter";
import { BroadcastOperatorImpl } from "./broadcast";
import { SocketImpl } from "./socket";
import type {
  AckPacket,
  Adapter,
  ArcanaJSIOServer,
  ArcanaJSSocket,
  BroadcastOperator,
  BroadcastOptions,
  EventHandler,
  Packet,
  WebSocketData,
  WebSocketMiddleware,
  WebSocketOptions,
  WebSocketStats,
} from "./types";

/**
 * WebSocket server implementation
 * Provides Socket.IO-like API with full namespace, room, and broadcasting support
 */
export class ServerImpl implements ArcanaJSIOServer {
  public sockets: Map<string, ArcanaJSSocket> = new Map();
  public engine: any;
  public adapter: Adapter;

  private _events: Map<string, EventHandler[]> = new Map();
  private _onceEvents: Map<string, EventHandler[]> = new Map();
  private _middleware: WebSocketMiddleware[] = [];
  private _namespace: string = "/";
  private _parent?: ServerImpl;
  private _children: Map<string, ServerImpl> = new Map();
  private _server: any;
  private _options: Required<WebSocketOptions>;
  private _stats: WebSocketStats;
  private _startTime: number;
  private _closed: boolean = false;

  constructor(server: any, options: WebSocketOptions = {}) {
    this._server = server;
    this._startTime = Date.now();

    // Set default options
    this._options = {
      path: options.path || "/arcanajs.io",
      maxPayload: options.maxPayload || 16 * 1024 * 1024,
      idleTimeout: options.idleTimeout || 120,
      compression: options.compression ?? true,
      perMessageDeflate: options.perMessageDeflate ?? true,
      backpressureLimit: options.backpressureLimit || 1024 * 1024,
      connectTimeout: options.connectTimeout || 45000,
      pingInterval: options.pingInterval || 25000,
      pingTimeout: options.pingTimeout || 20000,
      allowHTTP2: options.allowHTTP2 ?? false,
      closeOnBackpressureLimit: options.closeOnBackpressureLimit ?? false,
      cors: options.cors || {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false,
      },
    };

    // Initialize adapter
    this.adapter = new MemoryAdapter();

    // Initialize stats
    this._stats = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      avgMessageSize: 0,
      peakConnections: 0,
      uptime: 0,
    };
  }

  // ============================================================================
  // PROPERTIES
  // ============================================================================

  get name(): string {
    return this._namespace;
  }

  get options(): Readonly<Required<WebSocketOptions>> {
    return this._options;
  }

  get stats(): Readonly<WebSocketStats> {
    return {
      ...this._stats,
      uptime: Math.floor((Date.now() - this._startTime) / 1000),
      activeConnections: this.sockets.size,
    };
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
   * Emit event to all connected sockets
   */
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this {
    const packet: Packet = {
      type: event,
      data,
      id: Date.now().toString(),
      nsp: this._namespace,
    };

    const message = JSON.stringify(packet);
    const compress = options?.compress ?? this._options.compression;

    if (options?.rooms && options.rooms.length > 0) {
      // Broadcast to specific rooms
      options.rooms.forEach((room) => {
        this.publish(room, message, compress);
      });
    } else {
      // Broadcast to all sockets
      const except = new Set(options?.except || []);

      this.sockets.forEach((socket) => {
        if (except.has(socket.id)) {
          return;
        }

        // Skip volatile messages to disconnected sockets
        if (options?.volatile && socket.disconnected) {
          return;
        }

        try {
          socket.send(message, compress);
          this._updateStats("sent", message.length);
        } catch (error) {
          console.error(`Failed to emit to socket ${socket.id}:`, error);
        }
      });
    }

    return this;
  }

  // ============================================================================
  // NAMESPACE MANAGEMENT
  // ============================================================================

  /**
   * Create or get a namespace
   */
  of(namespace: string): ArcanaJSIOServer {
    // Normalize namespace
    if (!namespace.startsWith("/")) {
      namespace = "/" + namespace;
    }

    // Return existing namespace
    if (this._children.has(namespace)) {
      return this._children.get(namespace)!;
    }

    // Create new namespace
    const childServer = new ServerImpl(this._server, this._options);
    childServer._namespace = namespace;
    childServer._parent = this;
    this._children.set(namespace, childServer);

    return childServer;
  }

  // ============================================================================
  // BROADCAST OPERATORS
  // ============================================================================

  /**
   * Target specific room(s)
   */
  to(room: string | string[]): BroadcastOperator {
    return new BroadcastOperatorImpl(this, {
      rooms: Array.isArray(room) ? room : [room],
    });
  }

  /**
   * Alias for to()
   */
  in(room: string | string[]): BroadcastOperator {
    return this.to(room);
  }

  /**
   * Exclude specific socket(s)
   */
  except(socketIds: string | string[]): BroadcastOperator {
    return new BroadcastOperatorImpl(this, {
      except: Array.isArray(socketIds) ? socketIds : [socketIds],
    });
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Register middleware
   */
  use(middleware: WebSocketMiddleware): this {
    if (typeof middleware !== "function") {
      throw new TypeError("Middleware must be a function");
    }
    this._middleware.push(middleware);
    return this;
  }

  // ============================================================================
  // OPERATIONS
  // ============================================================================

  /**
   * Bind to Bun server
   */
  bind(server: any): void {
    this._server = server;
    this.engine = server;
  }

  /**
   * Close server and all connections
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }

    this._closed = true;

    // Close all sockets
    const closePromises = Array.from(this.sockets.values()).map(
      (socket) =>
        new Promise<void>((resolve) => {
          try {
            socket.disconnect(true);
          } catch (error) {
            console.error(`Error closing socket ${socket.id}:`, error);
          }
          resolve();
        })
    );

    await Promise.all(closePromises);

    // Clear collections
    this.sockets.clear();
    this._events.clear();
    this._onceEvents.clear();
    this._middleware = [];

    // Close adapter
    await this.adapter.close();

    // Close child namespaces
    const namespacePromises = Array.from(this._children.values()).map((child) =>
      child.close()
    );
    await Promise.all(namespacePromises);
    this._children.clear();
  }

  /**
   * Make all sockets join room(s)
   */
  socketsJoin(room: string | string[]): void {
    const rooms = Array.isArray(room) ? room : [room];
    this.sockets.forEach((socket) => {
      rooms.forEach((r) => socket.join(r));
    });
  }

  /**
   * Make all sockets leave room(s)
   */
  socketsLeave(room: string | string[]): void {
    const rooms = Array.isArray(room) ? room : [room];
    this.sockets.forEach((socket) => {
      rooms.forEach((r) => socket.leave(r));
    });
  }

  /**
   * Disconnect all sockets
   */
  disconnectSockets(close = true): void {
    this.sockets.forEach((socket) => {
      socket.disconnect(close);
    });
  }

  /**
   * Fetch all socket instances
   */
  async fetchSockets(): Promise<ArcanaJSSocket[]> {
    return Array.from(this.sockets.values());
  }

  /**
   * Server-side emit (for cross-server communication)
   */
  serverSideEmit(event: string, ...args: any[]): void {
    // This would be implemented for multi-server setups
    // Currently a no-op for single server
    console.warn("serverSideEmit is not implemented for single-server mode");
  }

  /**
   * Publish message to topic
   */
  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number {
    try {
      if (!this._server || !this._server.publish) {
        console.error("Server not initialized or doesn't support publish");
        return 0;
      }

      const result = this._server.publish(topic, message, compress ?? false);

      if (typeof message === "string") {
        this._updateStats("sent", message.length);
      } else if (message instanceof ArrayBuffer) {
        this._updateStats("sent", message.byteLength);
      } else {
        this._updateStats("sent", message.length);
      }

      return result;
    } catch (error) {
      console.error(`Failed to publish to topic "${topic}":`, error);
      return 0;
    }
  }

  // ============================================================================
  // SOCKET MANAGEMENT
  // ============================================================================

  /**
   * Create a new socket wrapper
   */
  createSocket(
    ws: ServerWebSocket<WebSocketData>,
    req: Request
  ): ArcanaJSSocket {
    const url = new URL(req.url);

    // Generate or reuse socket ID
    const socketId = ws.data?.id || randomUUID();

    // Initialize or update socket data
    if (!ws.data) {
      ws.data = {
        id: socketId,
        handshake: {
          time: new Date().toISOString(),
          url: req.url,
          headers: Object.fromEntries(req.headers.entries()),
          query: Object.fromEntries(url.searchParams.entries()),
          address: ws.remoteAddress,
          secure: url.protocol === "wss:",
        },
        rooms: new Set(),
        connected: false,
      };
    } else {
      // Preserve ID and update handshake
      ws.data.id = socketId;
      ws.data.handshake = {
        time: new Date().toISOString(),
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        query: Object.fromEntries(url.searchParams.entries()),
        address: ws.remoteAddress,
        secure: url.protocol === "wss:",
      };
      ws.data.rooms = new Set();
      ws.data.connected = false;
    }

    // Remove existing socket with same ID
    if (this.sockets.has(socketId)) {
      const existing = this.sockets.get(socketId);
      if (existing) {
        existing._destroy();
        this.sockets.delete(socketId);
      }
    }

    // Create socket instance
    const socket = new SocketImpl(ws, this);
    this.sockets.set(socketId, socket);

    // Update statistics
    this._stats.totalConnections++;
    this._stats.activeConnections = this.sockets.size;
    this._stats.peakConnections = Math.max(
      this._stats.peakConnections,
      this._stats.activeConnections
    );

    // Run middleware chain
    this._runMiddleware(socket, (err) => {
      if (err) {
        console.error(`Middleware error for socket ${socketId}:`, err);
        socket.emit("error", err);
        socket.disconnect(true);
        this._stats.failedConnections++;
        return;
      }

      // Mark as connected
      ws.data.connected = true;

      // Emit connection event
      this._emitEvent("connection", socket);
      socket._handleEvent("connect");
    });

    return socket;
  }

  /**
   * Remove socket from server
   */
  removeSocket(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      return;
    }

    // Remove from adapter
    this.adapter.removeSocketFromAllRooms(socketId).catch((error) => {
      console.error(`Failed to remove socket ${socketId} from adapter:`, error);
    });

    // Clean up socket
    socket._destroy();
    this.sockets.delete(socketId);

    // Update statistics
    this._stats.activeConnections = this.sockets.size;

    // Emit disconnect event
    this._emitEvent("disconnect", socket);
  }

  /**
   * Handle incoming message
   */
  handleMessage(
    socket: ArcanaJSSocket,
    message: string | ArrayBuffer | Uint8Array
  ): void {
    // Update statistics
    if (typeof message === "string") {
      this._updateStats("received", message.length);
    } else if (message instanceof ArrayBuffer) {
      this._updateStats("received", message.byteLength);
    } else {
      this._updateStats("received", message.length);
    }

    try {
      if (typeof message === "string") {
        const parsed = JSON.parse(message);

        // Handle acknowledgment packets
        if (parsed.type === "ack") {
          const ackPacket = parsed as AckPacket;
          socket._handleAck(ackPacket.id, ackPacket.data, ackPacket.error);
          return;
        }

        // Handle regular packets
        const packet = parsed as Packet;
        socket._handleEvent(packet.type, packet.data, packet.id);
      } else {
        // Handle binary messages
        socket._handleEvent("binary", message);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      socket.emit("error", { message: "Invalid message format", error });
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Run middleware chain
   */
  private _runMiddleware(
    socket: ArcanaJSSocket,
    callback: (err?: any) => void
  ): void {
    let index = 0;

    const next = (err?: any) => {
      if (err) {
        return callback(err);
      }

      if (index >= this._middleware.length) {
        return callback();
      }

      const middleware = this._middleware[index++];

      try {
        const result = middleware(socket, next);

        // Handle async middleware
        if (result instanceof Promise) {
          result.catch((e) => callback(e));
        }
      } catch (e) {
        callback(e);
      }
    };

    next();
  }

  /**
   * Emit server event
   */
  private _emitEvent(event: string, socket?: ArcanaJSSocket, data?: any): void {
    // Execute regular handlers
    const handlers = this._events.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        this._executeHandler(handler, event, socket, data);
      });
    }

    // Execute one-time handlers
    const onceHandlers = this._onceEvents.get(event);
    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        this._executeHandler(handler, event, socket, data);
      });
      this._onceEvents.delete(event);
    }
  }

  /**
   * Execute event handler safely
   */
  private _executeHandler(
    handler: EventHandler,
    event: string,
    socket?: ArcanaJSSocket,
    data?: any
  ): void {
    try {
      if (socket) {
        const result = handler(socket, data);

        // Handle async handlers
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`Error in async handler for '${event}':`, err);
          });
        }
      }
    } catch (error) {
      console.error(`Error in handler for '${event}':`, error);
    }
  }

  /**
   * Update statistics
   */
  private _updateStats(type: "sent" | "received", bytes: number): void {
    if (type === "sent") {
      this._stats.messagesSent++;
      this._stats.bytesSent += bytes;
    } else {
      this._stats.messagesReceived++;
      this._stats.bytesReceived += bytes;
    }

    const totalMessages =
      this._stats.messagesSent + this._stats.messagesReceived;
    const totalBytes = this._stats.bytesSent + this._stats.bytesReceived;
    this._stats.avgMessageSize =
      totalMessages > 0 ? totalBytes / totalMessages : 0;
  }
}
