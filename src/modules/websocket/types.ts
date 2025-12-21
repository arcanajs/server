import type { ServerWebSocket, WebSocketReadyState } from "bun";

export { ServerWebSocket, WebSocketReadyState };

export interface WebSocketData {
  id: string;
  handshake: {
    time: string;
    url: string;
    headers: Record<string, string>;
    query: Record<string, string>;
  };
  rooms: Set<string>;
  auth?: any;
}

export interface WebSocketOptions {
  path?: string;
  cors?: {
    origin: string | string[];
    methods?: string[];
    credentials?: boolean;
  };
  maxPayload?: number;
  idleTimeout?: number;
  compression?: boolean;
  perMessageDeflate?: boolean;
  backpressureLimit?: number;
}

export interface WebSocketMiddleware {
  (socket: ArcanaJSSocket, next: (err?: any) => void): void;
}

export type EventHandlerWithSocket<T = any> = (
  socket: ArcanaJSSocket,
  data?: T
) => void | Promise<void>;

export type EventHandlerDataOnly<T = any> = (data?: T) => void | Promise<void>;

export type EventHandler<T = any> =
  | EventHandlerWithSocket<T>
  | EventHandlerDataOnly<T>;

export interface BroadcastOptions {
  rooms?: string[];
  except?: string[];
  compress?: boolean;
}

export interface Packet {
  type: string;
  data?: any;
  id?: number;
  nsp?: string;
}

export interface ArcanaJSSocket {
  id: string;
  data: WebSocketData;
  rooms: Set<string>;

  // Native Bun Properties
  readonly readyState: WebSocketReadyState;
  readonly remoteAddress: string;

  // Event methods
  on<T = any>(event: string, handler: EventHandler<T>): this;
  off(event: string, handler?: EventHandler): this;
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this;

  // Room methods
  join(room: string): this;
  leave(room: string): this;
  leaveAll(): void;
  roomsJoined(): string[];
  isInRoom(room: string): boolean;

  // Pub/Sub & Sending
  send(data: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
  publish(
    topic: string,
    data: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  isSubscribed(topic: string): boolean;

  // Utility
  disconnect(close?: boolean): void;
  cork<T = unknown>(callback: (ws: ServerWebSocket<WebSocketData>) => T): T;

  // Internal
  _handleEvent(event: string, data?: any): void;
  _destroy(): void;
}

export interface ArcanaJSIOServer {
  // Core methods
  on<T = any>(event: string, handler: EventHandler<T>): this;
  off(event: string, handler?: EventHandler): this;
  emit<T = any>(event: string, data?: T, options?: BroadcastOptions): this;

  // Namespace methods
  of(namespace: string): ArcanaJSIOServer;

  // Room methods
  to(room: string | string[]): ArcanaJSIOServer;
  in(room: string | string[]): ArcanaJSIOServer;
  except(socketId: string | string[]): ArcanaJSIOServer;

  // Operations
  close(): void;
  bind(server: any): void;

  // Internal Access
  sockets: Map<string, ArcanaJSSocket>;
  engine: any;

  // Middleware
  use(middleware: WebSocketMiddleware): this;

  // Internal Helpers
  createSocket(
    ws: ServerWebSocket<WebSocketData>,
    req: Request
  ): ArcanaJSSocket;
  removeSocket(socketId: string): void;
  handleMessage(
    socket: ArcanaJSSocket,
    message: string | ArrayBuffer | Uint8Array
  ): void;
  publish(
    topic: string,
    message: string | ArrayBuffer | Uint8Array,
    compress?: boolean
  ): number;
}
