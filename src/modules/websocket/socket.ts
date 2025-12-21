import type {
  ArcanaJSSocket,
  BroadcastOptions,
  EventHandler,
  Packet,
  ServerWebSocket,
  WebSocketData,
  WebSocketReadyState,
} from "./types";

export class SocketImpl implements ArcanaJSSocket {
  private _events: Map<string, EventHandler[]> = new Map();
  private _server: any;
  private _ws: ServerWebSocket<WebSocketData>;

  constructor(ws: ServerWebSocket<WebSocketData>, server: any) {
    this._ws = ws;
    this._server = server;

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

  // Properties delegation
  get id(): string {
    return this._ws.data.id;
  }

  set id(value: string) {
    this._ws.data.id = value;
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

  set rooms(value: Set<string>) {
    this._ws.data.rooms = value;
  }

  get readyState(): WebSocketReadyState {
    return this._ws.readyState;
  }

  get remoteAddress(): string {
    return this._ws.remoteAddress;
  }

  // ServerWebSocket methods delegation
  send(message: string | ArrayBuffer | Uint8Array, compress?: boolean): number {
    return this._ws.send(message, compress);
  }

  subscribe(topic: string): void {
    this._ws.subscribe(topic);
    this.rooms.add(topic);
  }

  unsubscribe(topic: string): void {
    this._ws.unsubscribe(topic);
    this.rooms.delete(topic);
  }

  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number {
    return this._ws.publish(topic, message, compress);
  }

  isSubscribed(topic: string): boolean {
    return this._ws.isSubscribed(topic);
  }

  cork<T = unknown>(callback: (ws: ServerWebSocket<WebSocketData>) => T): T {
    // We must pass the underlying _ws to the callback, but the callback expects
    // a ServerWebSocket<WebSocketData>.
    // Our _ws IS a ServerWebSocket<WebSocketData>.
    // However, the Bun type definition for cork might be generic over the data type.
    // Let's assume strict compatibility.
    // @ts-ignore - Bun types allow this but TS might complain about 'T' not matching
    return this._ws.cork(callback);
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
    };

    if (options?.rooms || options?.except) {
      this.broadcast(event, data, options);
      return this;
    }

    const message = JSON.stringify(packet);
    this.send(message, options?.compress);
    return this;
  }

  // Room management wrappers
  join(room: string): this {
    this.subscribe(room);
    return this;
  }

  leave(room: string): this {
    this.unsubscribe(room);
    return this;
  }

  leaveAll(): void {
    const rooms = Array.from(this.rooms);
    rooms.forEach((room) => this.leave(room));
  }

  roomsJoined(): string[] {
    return Array.from(this.rooms);
  }

  isInRoom(room: string): boolean {
    return this.rooms.has(room);
  }

  // Broadcasting
  broadcast<T = any>(
    event: string,
    data?: T,
    options?: BroadcastOptions
  ): this {
    const packet: Packet = {
      type: event,
      data,
      id: Date.now(),
    };

    const message = JSON.stringify(packet);
    const compress = options?.compress;

    const rooms = options?.rooms || [];

    if (rooms.length > 0) {
      // Publish to rooms
      rooms.forEach((room) => {
        // Bun publish sends to subscribers EXCLUDING self usually, which matches broadcast semantics
        this.publish(room, message, compress);
      });
    } else {
      // Broadcast to all
      // Use server reference to broadcast
      const except = options?.except || [];
      if (!except.includes(this.id)) {
        except.push(this.id);
      }
      this._server.broadcast(message, except, compress);
    }

    return this;
  }

  // Utility methods
  disconnect(close = true): void {
    this.emit("disconnect", "client disconnect");
    if (close) {
      // 1000 is normal closure
      this._ws.close(1000, "Client disconnect");
    }
    this._server.removeSocket(this.id);
  }

  // Internal methods
  _handleEvent(event: string, data?: any): void {
    const handlers = this._events.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          // Allow async handlers
          // Call handler with `data` as first argument and bind `this` to the socket
          // so handlers written as `(data) => { ... }` work as expected.
          // Support handlers declared either as `(socket, data)` or as `(data)`.
          // If the handler declares two or more params, call it with `(socket, data)`,
          // otherwise call it with `data` and bind `this` to the socket for convenience.
          const fn = handler as any;
          const result = fn.length >= 2 ? fn(this, data) : fn.call(this, data);
          if (result instanceof Promise) {
            result.catch((err) => {
              console.error(
                `Error in async event handler for '${event}':`,
                err
              );
              this.emit("error", err);
            });
          }
        } catch (error) {
          console.error(`Error in event handler for '${event}':`, error);
          this.emit("error", error);
        }
      });
    }
  }

  _destroy(): void {
    this._events.clear();
    // We don't manually unsubscribe because closing the socket does that automatically in Bun
    // But clearing internal set is good.
    this.rooms.clear();
  }
}
