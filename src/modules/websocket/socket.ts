import type { 
  ArcanaJSSocket, 
  WebSocketData, 
  EventHandler, 
  BroadcastOptions,
  Packet,
  WebSocketReadyState,
  ServerWebSocket
} from "./types";

export class SocketImpl implements ArcanaJSSocket {
  public id: string;
  public data: WebSocketData;
  public rooms: Set<string>;
  
  private _events: Map<string, EventHandler[]> = new Map();
  private _server: any;
  private _ws: ServerWebSocket<WebSocketData>;

  constructor(
    ws: ServerWebSocket<WebSocketData>, 
    server: any,
    data: WebSocketData
  ) {
    this._ws = ws;
    this._server = server;
    this.id = data.id;
    this.data = data;
    this.rooms = data.rooms || new Set();
    
    // Bind methods to maintain context
    this.send = this.send.bind(this);
    this.close = this.close.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.unsubscribe = this.unsubscribe.bind(this);
    this.publish = this.publish.bind(this);
    this.isSubscribed = this.isSubscribed.bind(this);
    this.cork = this.cork.bind(this);
  }

  // ServerWebSocket properties delegation
  get readyState(): WebSocketReadyState {
    return this._ws.readyState;
  }

  get remoteAddress(): string {
    return this._ws.remoteAddress;
  }

  get subscriptions(): string[] {
    return this._ws.subscriptions;
  }

  // ServerWebSocket methods delegation
  send(message: string | ArrayBuffer | Uint8Array, compress?: boolean): number {
    return this._ws.send(message, compress);
  }

  close(code?: number, reason?: string): void {
    this._ws.close(code, reason);
  }

  subscribe(topic: string): void {
    this._ws.subscribe(topic);
  }

  unsubscribe(topic: string): void {
    this._ws.unsubscribe(topic);
  }

  publish(topic: string, message: string | ArrayBuffer | Uint8Array): number {
    return this._ws.publish(topic, message);
  }

  isSubscribed(topic: string): boolean {
    return this._ws.isSubscribed(topic);
  }

  cork<T = unknown>(callback: (ws: ServerWebSocket<T>) => T): T {
    return this._ws.cork(callback);
  }

  // Additional methods to satisfy interface
  sendText(data: string, compress?: boolean): number {
    return this.send(data, compress);
  }

  sendBinary(data: ArrayBuffer | Uint8Array, compress?: boolean): number {
    return this.send(data, compress);
  }

  publishText(topic: string, data: string, compress?: boolean): number {
    return this.publish(topic, data);
  }

  publishBinary(topic: string, data: ArrayBuffer | Uint8Array, compress?: boolean): number {
    return this.publish(topic, data);
  }

  getBufferedAmount(): number {
    return 0; // Bun's ServerWebSocket doesn't have buffered amount property
  }

  terminate(): void {
    this.close(1006, "Connection terminated");
  }

  ping(): number {
    return this._ws.ping?.() || 0;
  }

  pong(): number {
    return this._ws.pong?.() || 0;
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
      return this.broadcast(event, data, options);
    }

    const message = JSON.stringify(packet);
    this.send(message, options?.compress);
    return this;
  }

  // Room management
  join(room: string): this {
    if (!this.rooms.has(room)) {
      this.rooms.add(room);
      this.subscribe(room);
      this._server.emitRoomEvent('join', room, this.id);
    }
    return this;
  }

  leave(room: string): this {
    if (this.rooms.has(room)) {
      this.rooms.delete(room);
      this.unsubscribe(room);
      this._server.emitRoomEvent('leave', room, this.id);
    }
    return this;
  }

  leaveAll(): void {
    const rooms = Array.from(this.rooms);
    rooms.forEach(room => this.leave(room));
  }

  roomsJoined(): string[] {
    return Array.from(this.rooms);
  }

  isInRoom(room: string): boolean {
    return this.rooms.has(room);
  }

  // Broadcasting
  broadcast<T = any>(event: string, data?: T, options?: BroadcastOptions): this {
    const packet: Packet = {
      type: event,
      data,
      id: Date.now(),
    };

    const message = JSON.stringify(packet);
    const rooms = options?.rooms || [];
    const except = options?.except || [];

    if (rooms.length > 0) {
      // Send to specific rooms
      rooms.forEach(room => {
        if (!except.includes(this.id)) {
          this._server.publish(room, message, options?.compress);
        }
      });
    } else {
      // Send to all except specified sockets
      this._server.broadcast(message, except, options?.compress);
    }

    return this;
  }

  // Utility methods
  disconnect(close = true): void {
    this.leaveAll();
    this.emit('disconnect', 'client disconnect');
    if (close) {
      this.close();
    }
    this._server.removeSocket(this.id);
  }

  // Internal methods
  _handleEvent(event: string, data?: any): void {
    const handlers = this._events.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(this, data);
        } catch (error) {
          console.error(`Error in event handler for '${event}':`, error);
          this.emit('error', error);
        }
      });
    }
  }

  _destroy(): void {
    this._events.clear();
    this.leaveAll();
  }
}
