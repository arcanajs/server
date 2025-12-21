import type { 
  ArcanaJSIOServer, 
  ArcanaJSSocket, 
  WebSocketOptions, 
  WebSocketMiddleware,
  WebSocketData,
  EventHandler,
  BroadcastOptions,
  Packet
} from "./types";
import { SocketImpl } from "./socket";
import { randomUUID } from "node:crypto";

export class ServerImpl implements ArcanaJSIOServer {
  public sockets: Map<string, ArcanaJSSocket> = new Map();
  public rooms: Map<string, Set<string>> = new Map();
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
    
    if (options?.rooms) {
      options.rooms.forEach(room => {
        this.publishToRoom(room, message, options?.compress);
      });
    } else if (options?.except) {
      this.broadcast(message, options.except, options?.compress);
    } else {
      this.broadcast(message, [], options?.compress);
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

  // Room targeting
  to(room: string | string[]): this {
    // This would be used for chaining, simplified implementation
    return this;
  }

  in(room: string | string[]): this {
    return this.to(room);
  }

  except(socketId: string | string[]): this {
    // This would be used for chaining, simplified implementation
    return this;
  }

  // Middleware
  use(middleware: WebSocketMiddleware): this {
    this._middleware.push(middleware);
    return this;
  }

  // Utility methods
  close(): void {
    // Close all sockets
    this.sockets.forEach(socket => {
      socket.disconnect(true);
    });
    this.sockets.clear();
    this.rooms.clear();
    this._events.clear();
    this._middleware = [];

    // Close child namespaces
    this._children.forEach(child => child.close());
    this._children.clear();
  }

  clients(callback: (clients: ArcanaJSSocket[]) => void): void {
    callback(Array.from(this.sockets.values()));
  }

  // Internal methods for socket management
  createSocket(ws: any, req: Request): ArcanaJSSocket {
    const url = new URL(req.url);
    const socketId = randomUUID();
    
    const data: WebSocketData = {
      id: socketId,
      handshake: {
        time: new Date().toISOString(),
        url: req.url,
        headers: Object.fromEntries(req.headers.entries()),
        query: Object.fromEntries(url.searchParams.entries()),
      },
      rooms: new Set(),
    };

    const socket = new SocketImpl(ws, this, data);
    this.sockets.set(socketId, socket);

    // Run middleware
    this.runMiddleware(socket, (err) => {
      if (err) {
        socket.emit('error', err);
        socket.disconnect(true);
        return;
      }

      // Emit connection event
      this._emitEvent('connection', socket);
      socket._handleEvent('connect');
    });

    return socket;
  }

  removeSocket(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket._destroy();
      this.sockets.delete(socketId);
      
      // Remove from all rooms
      this.rooms.forEach((members, room) => {
        members.delete(socketId);
        if (members.size === 0) {
          this.rooms.delete(room);
        }
      });

      this._emitEvent('disconnect', socket);
    }
  }

  // Room management
  addToRoom(socketId: string, room: string): void {
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(socketId);
  }

  removeFromRoom(socketId: string, room: string): void {
    const members = this.rooms.get(room);
    if (members) {
      members.delete(socketId);
      if (members.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  emitRoomEvent(event: string, room: string, socketId: string): void {
    if (event === 'join') {
      this.addToRoom(socketId, room);
    } else if (event === 'leave') {
      this.removeFromRoom(socketId, room);
    }
    this._emitEvent(event, undefined, { room, socketId });
  }

  // Broadcasting
  broadcast(message: string, except: string[] = [], compress?: boolean): void {
    this.sockets.forEach((socket, id) => {
      if (!except.includes(id)) {
        socket.send(message, compress);
      }
    });
  }

  publishToRoom(room: string, message: string, compress?: boolean): void {
    const members = this.rooms.get(room);
    if (members) {
      members.forEach(socketId => {
        const socket = this.sockets.get(socketId);
        if (socket) {
          socket.send(message, compress);
        }
      });
    }
    
    // Also use Bun's native pub/sub for cross-process support
    this._server.publish(room, message, compress);
  }

  // Message handling
  handleMessage(socket: ArcanaJSSocket, message: string | ArrayBuffer | Uint8Array): void {
    try {
      if (typeof message === 'string') {
        const packet: Packet = JSON.parse(message);
        socket._handleEvent(packet.type, packet.data);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      socket.emit('error', { message: 'Invalid message format' });
    }
  }

  // Private methods
  private runMiddleware(socket: ArcanaJSSocket, callback: (err?: any) => void): void {
    let index = 0;
    
    const next = (err?: any) => {
      if (err) return callback(err);
      if (index >= this._middleware.length) return callback();
      
      const middleware = this._middleware[index++];
      middleware(socket, next);
    };

    next();
  }

  private _emitEvent(event: string, socket?: ArcanaJSSocket, data?: any): void {
    const handlers = this._events.get(event);
    if (!handlers?.length) return;

    handlers.forEach(handler => {
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
        this._handleSocketlessHandler(event, data);
      }
    } catch (error) {
      this._logHandlerError(event, error);
    }
  }

  private _handleSocketlessHandler(event: string, data?: any): void {
    if (data) {
      console.warn(
        `Handler for event '${event}' requires socket but none available. ` +
        `Data: ${JSON.stringify(data)}`
      );
    } else {
      console.warn(`Handler for event '${event}' requires socket but none available`);
    }
  }

  private _logHandlerError(event: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `Error in server event handler for '${event}': ${errorMessage}`,
      error instanceof Error ? error.stack : error
    );
  }
}
