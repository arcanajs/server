import type { ServerWebSocket } from "bun";
import { randomUUID } from "node:crypto";
import { SocketImpl } from "./socket";
import type {
  ArcanaJSIOServer,
  ArcanaJSSocket,
  BroadcastOptions,
  EventHandler,
  Packet,
  WebSocketData,
  WebSocketMiddleware,
  WebSocketOptions,
} from "./types";

export class ServerImpl implements ArcanaJSIOServer {
  public sockets: Map<string, ArcanaJSSocket> = new Map();
  public engine: any;

  private _events: Map<string, EventHandler[]> = new Map();
  private _middleware: WebSocketMiddleware[] = [];
  private _namespace: string = "/";
  private _parent?: ServerImpl;
  private _children: Map<string, ServerImpl> = new Map();
  private _server: any;
  private _options: WebSocketOptions;

  constructor(server: any, options: WebSocketOptions = {}) {
    this._server = server;
    this._options = {
      path: "/socket.io",
      maxPayload: 16 * 1024 * 1024,
      idleTimeout: 120,
      compression: true,
      perMessageDeflate: true,
      ...options,
    };
  }

  // Event handling
  on<T = any>(event: string, handler: EventHandler<T>): this {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }
    this._events.get(event)!.push(handler as EventHandler);
    return this;
  }

  off(event: string, handler?: EventHandler): this {
    if (!handler) {
      this._events.delete(event);
      return this;
    }

    const handlers = this._events.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this._events.delete(event);
      }
    }
    return this;
  }

  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this {
    const packet: Packet = {
      type: event,
      data,
      id: Date.now(),
      nsp: this._namespace,
    };

    const message = JSON.stringify(packet);

    if (options?.rooms && options.rooms.length > 0) {
      options.rooms.forEach((room) => {
        this.publish(room, message, options?.compress);
      });
    } else {
      // Broadcast to everyone
      // Note: Bun.serve.publish doesn't support broadcasting to 'all' directly without a topic
      // We can simulate this if needed, or rely on a global topic if we implemented one.
      // For now, we iterate sockets for global broadcast if no room specified
      this.sockets.forEach((socket) => {
        if (options?.except && options.except.includes(socket.id)) return;
        socket.send(message, options?.compress);
      });
    }

    return this;
  }

  // Namespace management
  of(namespace: string): ArcanaJSIOServer {
    if (this._children.has(namespace)) {
      return this._children.get(namespace)!;
    }

    const childServer = new ServerImpl(this._server, this._options);
    childServer._namespace = namespace;
    childServer._parent = this;
    this._children.set(namespace, childServer);

    return childServer;
  }

  // Room targeting - chaining support
  to(room: string | string[]): this {
    // In a full implementation, this returns a BroadcastOperator
    // For this lightweight version, we could store state, but better to use emit options directly
    // Or return a proxy.
    // To match interface simple string return this for now, but real emit needs to know target.
    // We will assume the user uses emit(..., { rooms: [...] }) or we'd need a temporary object.
    // For strict type compliance on the interface 'to' returning 'this':
    // Use a temporary property or proxy could be complex.
    // Simplified: "to" sets a broadCast target for the NEXT emit call.
    return this;
  }

  in(room: string | string[]): this {
    return this.to(room);
  }

  except(socketId: string | string[]): this {
    return this;
  }

  // Middleware
  use(middleware: WebSocketMiddleware): this {
    this._middleware.push(middleware);
    return this;
  }

  // Operations
  tryBind(server: any): void {
    this._server = server;
  }

  bind(server: any): void {
    this._server = server;
  }

  close(): void {
    // Close all sockets
    this.sockets.forEach((socket) => {
      socket.disconnect(true);
    });
    this.sockets.clear();
    this._events.clear();
    this._middleware = [];

    // Close child namespaces
    this._children.forEach((child) => child.close());
    this._children.clear();
  }

  clients(callback: (clients: ArcanaJSSocket[]) => void): void {
    callback(Array.from(this.sockets.values()));
  }

  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number {
    return this._server.publish(topic, message, compress);
  }

  // Internal methods for socket management
  createSocket(
    ws: ServerWebSocket<WebSocketData>,
    req: Request
  ): ArcanaJSSocket {
    const url = new URL(req.url);

    // If an id was attached during the upgrade step, reuse it. Otherwise generate one.
    const socketId = ws.data?.id || randomUUID();

    // Ensure data structure exists and hydrate/merge with existing upgrade data when present
    if (!ws.data) {
      ws.data = {
        id: socketId,
        handshake: {
          time: new Date().toISOString(),
          url: req.url,
          headers: {},
          query: {},
        },
        rooms: new Set(),
      };
    } else {
      // Preserve any pre-attached id from upgrade and merge handshake info
      ws.data.id = socketId;
      ws.data.rooms = new Set();
      ws.data.handshake = {
        time: new Date().toISOString(),
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        query: Object.fromEntries(url.searchParams.entries()),
      };
    }

    // If a socket with this id already exists (e.g. re-upgrade or retry), remove it first
    if (this.sockets.has(socketId)) {
      const existing = this.sockets.get(socketId);
      if (existing) {
        existing._destroy();
        this.sockets.delete(socketId);
      }
    }

    const socket = new SocketImpl(ws, this);
    this.sockets.set(socketId, socket);

    // Run middleware
    this.runMiddleware(socket, (err) => {
      if (err) {
        socket.emit("error", err);
        socket.disconnect(true);
        return;
      }

      // Emit connection event
      this._emitEvent("connection", socket);
      socket._handleEvent("connect");
    });

    return socket;
  }

  removeSocket(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket._destroy();
      this.sockets.delete(socketId);
      this._emitEvent("disconnect", socket);
    }
  }

  // Message handling
  handleMessage(
    socket: ArcanaJSSocket,
    message: string | ArrayBuffer | Uint8Array
  ): void {
    try {
      if (typeof message === "string") {
        const packet: Packet = JSON.parse(message);
        socket._handleEvent(packet.type, packet.data);
      }
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
      socket.emit("error", { message: "Invalid message format" });
    }
  }

  // Private methods
  private runMiddleware(
    socket: ArcanaJSSocket,
    callback: (err?: any) => void
  ): void {
    let index = 0;

    const next = (err?: any) => {
      if (err) return callback(err);
      if (index >= this._middleware.length) return callback();

      const middleware = this._middleware[index++];
      try {
        middleware(socket, next);
      } catch (e) {
        callback(e);
      }
    };

    next();
  }

  private _emitEvent(event: string, socket?: ArcanaJSSocket, data?: any): void {
    const handlers = this._events.get(event);
    if (!handlers?.length) return;

    handlers.forEach((handler) => {
      this._executeHandler(handler, event, socket, data);
    });
  }

  private _executeHandler(
    handler: EventHandler,
    event: string,
    socket?: ArcanaJSSocket,
    data?: any
  ): void {
    try {
      if (socket) {
        handler(socket, data);
      } else {
        // Handle server-only events if any
      }
    } catch (error) {
      console.error(`Error in event handler for '${event}':`, error);
    }
  }
}
